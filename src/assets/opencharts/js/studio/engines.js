/**
 * engines.js — the bridge between a chart definition and the two things the
 * studio needs from it: a live preview, and copy-pasteable source.
 *
 * A definition declares exactly one renderer block (`chartjs`, `canvas`, `d3`,
 * `native` or `dom`). Both `renderChart()` and `generateCode()` read that same
 * block, so the code on screen is always generated from the very function that
 * drew the picture above it — they cannot drift apart.
 */

import { serialize, indent, tidy, toFunctionSource } from './serialize.js';
import { dependenciesFor, cdnOnly, scriptsOnly, scriptTag, describe, LIBRARIES } from './cdn.js';
import { ready, ensureLibraries, librariesFor } from './loader.js';
import { chartSummary, chartLabel, tableMarkup, A11Y_CSS } from './a11y.js';
import { attachTips, attachCanvasTips, recordTip } from './tooltip.js';
import { parseDateLabel, installDateAdapter, usesTimeScale } from './timeaxis.js';
import { captionHead, captionFoot, hasCaption, CAPTION_CSS } from './caption.js';
import {
  drawAnnotations, plateOf, hasAnnotations, gridAnnotations, ANNOTATION_CSS,
} from './annotate.js';
import {
  panelSpecs, panelColumns, panelHeight, facetMarkup, FACET_CSS,
  sharedScaleBounds, applyScaleBounds,
} from './facet.js';

export const ENGINE_LABEL = {
  chartjs: 'Chart.js',
  echarts: 'Apache ECharts',
  d3:      'D3',
  canvas:  'Canvas 2D',
  native:  'OpenCharts',
  dom:     'DOM / CSS',
};

export const ENGINE_CHIP = {
  chartjs: 'chip-chartjs',
  echarts: 'chip-canvas',
  d3:      'chip-d3',
  canvas:  'chip-canvas',
  native:  'chip-native',
  dom:     'chip-dom',
};

/** Which renderer block a definition uses. */
export const engineOf = (def) =>
  def.chartjs ? 'chartjs'
  : def.echarts ? 'echarts'
  : def.d3     ? 'd3'
  : def.canvas ? 'canvas'
  : def.native ? 'native'
  : 'dom';

/* ── Canvas sizing ───────────────────────────────────────────────────────── */

/**
 * Size a canvas for the device pixel ratio and return a context already scaled
 * so all drawing code can work in CSS pixels.
 */
export function sizeCanvas(canvas, w, h) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** Resolve the drawing height for a definition at a given render size. */
function heightFor(def, opts) {
  if (opts.height) return opts.height;
  const block = def.canvas || def.d3 || def.echarts || def.dom || {};
  return block.height || 340;
}

/* ── Live render ─────────────────────────────────────────────────────────── */

/**
 * Draw `def` into `host` using `spec`.
 *
 * @param {object} def   chart definition
 * @param {HTMLElement} host  element the chart owns entirely (it is emptied)
 * @param {object} spec  the live, user-edited spec
 * @param {object} [opts]
 * @param {number} [opts.height]   override drawing height
 * @param {boolean} [opts.compact] gallery preview — hide axes chrome where supported
 * @returns {object} instance handle for destroyInstance()
 */
export function renderChart(def, host, spec, opts = {}) {
  // Libraries arrive when a chart that needs them is first drawn, so the one
  // door every render passes through is where the wait goes.
  //
  // It stays *synchronous*. The gallery builds tiles inside a frame budget and
  // the suite renders 115 charts in a loop; making this return a promise would
  // rewrite both. So a chart whose library is still coming gets a placeholder
  // now and the real thing when the script lands — which is also the honest
  // thing to put on screen, since that is exactly what is happening.
  if (!ready(def)) return renderPending(def, host, spec, opts);

  // A faceted spec is still one chart definition; it is drawn once per panel.
  // The split happens here rather than inside each renderer because not one of
  // the five has ever heard of a facet — see facet.js.
  const panels = panelSpecs(def, spec);
  if (panels) return renderFacetGrid(def, host, spec, panels, opts);
  return renderOne(def, host, spec, opts);
}

/**
 * A chart waiting for its library.
 *
 * The instance it returns is a real one as far as every caller is concerned —
 * `destroyInstance` and `redraw` both work — because the alternative is every
 * call site learning about loading. `cancelled` is what stops a slow script
 * landing in a host that has since been given to another chart: `renderChart`
 * empties the host, so the token written on it is how a resolved load knows
 * whether it is still wanted.
 */
function renderPending(def, host, spec, opts) {
  host.innerHTML = '';
  host.setAttribute('role', 'img');
  host.setAttribute('aria-label', opts.label || chartLabel(def, spec));

  const token = {};
  host.__ocPending = token;

  const note = document.createElement('div');
  note.className = 'chart-loading';
  note.textContent = `Loading ${librariesFor(def).map((k) => libraryName(k)).join(' + ')}…`;
  host.appendChild(note);

  const inst = { engine: 'loading', host, cancelled: false, redraw: () => {} };

  // For callers that need the finished chart rather than the placeholder —
  // a test asserting on pixels, an export, anything measuring. Present only
  // while a load is outstanding, so `await inst.whenReady` is correct for
  // every instance and costs nothing on the ones that were ready already.
  inst.whenReady = ensureLibraries(def).then(() => {
    // Still the same chart in the same host? `renderChart` clears the host and
    // writes a new token, so a stale load finds one that is not its own.
    if (inst.cancelled || host.__ocPending !== token) return;
    host.__ocPending = null;
    const live = renderChart(def, host, spec, opts);
    // Hand the caller's instance the real one, so a redraw after the wait
    // reaches the chart rather than the placeholder it replaced.
    Object.assign(inst, live, { engine: live.engine });
  }).catch((err) => {
    if (inst.cancelled || host.__ocPending !== token) return;
    host.__ocPending = null;
    failure(host, err.message);
  });

  return inst;
}

const libraryName = (key) => (LIBRARIES[key] && LIBRARIES[key].name) || key;

/**
 * The grid of small multiples.
 *
 * Each plate is handed to `renderOne` with a panel spec holding literal
 * values, so every renderer draws exactly what it draws unfaceted. The
 * annotation overlay goes over the *grid*, not into any panel: a note is a
 * remark about the picture, and with a facet the picture is all of it.
 */
function renderFacetGrid(def, host, spec, panels, opts) {
  const cols = panelColumns(panels.length, spec.facet && spec.facet.cols);
  // A group rather than an image: it holds several graphics, each of which
  // labels itself below. Announcing the container as one picture would hide
  // every panel inside it.
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', `${def.title} — ${panels.length} panels`);
  host.innerHTML = facetMarkup(panels.map((p) => p.name), { cols, idPrefix: 'oc-panel' });

  const grid = host.querySelector('.oc-facets');
  const height = panelHeight(heightFor(def, opts), cols);
  // Worked out once across every panel, then handed to each — a panel rendered
  // on its own cannot know what the others reach.
  const bounds = sharedScaleBounds(def, panels, spec.facet);

  const build = () => panels.map((panel, i) => {
    const plate = host.querySelector(`#oc-panel-${i}`);
    if (!plate) return null;
    return renderOne(def, plate, panel.spec, {
      ...opts,
      height,
      bounds,
      label: `${panel.name} — ${chartLabel(def, panel.spec)}`,
    });
  }).filter(Boolean);

  // Only the notes addressed to the grid land here. The ones pinned to a panel
  // travel in that panel's own spec and are painted by `renderOne`, which needs
  // to know nothing about facets to do it.
  const onGrid = gridAnnotations(spec.annotations);
  const insts = build();
  drawAnnotations(grid, onGrid);

  return {
    engine: 'facet',
    grid,
    panels: insts,
    redraw: () => {
      // The hand-drawn renderers measure their host, and a panel's host only
      // has its width once the grid has laid out — so a resize re-runs each
      // panel rather than the grid, which has not changed.
      insts.forEach((inst) => { if (inst && inst.redraw) inst.redraw(); });
      drawAnnotations(grid, onGrid);
    },
  };
}

function renderOne(def, host, spec, opts = {}) {
  host.innerHTML = '';
  // A canvas is a rectangle of pixels and an SVG of paths is barely better, so
  // the host carries the name. Set here rather than per renderer: it is the
  // one line every engine passes through, and it is the same label the
  // exported markup gets, from the same function.
  host.setAttribute('role', 'img');
  // A panel names itself with the value it was split on, so the reader hears
  // "North — Vertical Bar chart" rather than twelve identical labels.
  host.setAttribute('aria-label', opts.label || chartLabel(def, spec));
  const engine = engineOf(def);
  const width = Math.max(120, host.clientWidth || host.offsetWidth || 600);
  const height = heightFor(def, opts);
  const ctxInfo = { width, height, compact: !!opts.compact };

  // Annotations are DOM laid over the plate, so they reflow on resize without
  // anyone redrawing them. What they do not survive is a renderer clearing its
  // own host, which is why this is called from inside those mounts rather than
  // once at the end — and why it rebuilds rather than checking a flag.
  const annotate = () => drawAnnotations(plateOf(host), spec.annotations);

  if (engine === 'chartjs') {
    if (typeof window.Chart === 'undefined') {
      return failure(host, 'Chart.js failed to load.');
    }
    const wrap = document.createElement('div');
    // The same class the exported markup gives it, so `plateOf` finds the same
    // element here as it does there — the preview and the export should not
    // have two different ideas of where the chart's box is.
    wrap.className = 'chart-wrap';
    wrap.style.cssText = `position:relative;width:100%;height:${height}px`;
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    host.appendChild(wrap);
    try {
      const config = applyScaleBounds(def.chartjs.build(spec, ctxInfo), opts.bounds);
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        config.options = { ...config.options, animation: false };
      }
      // A time axis needs a date adapter, and Chart.js ships none of its own.
      // Ours is native Date; installing is idempotent, so asking every time a
      // config wants one costs nothing after the first.
      if (usesTimeScale(config)) installDateAdapter();
      const chart = new window.Chart(canvas, config);
      annotate();
      return { engine, chart, canvas };
    } catch (err) {
      return failure(host, err.message);
    }
  }

  if (engine === 'echarts') {
    if (typeof window.echarts === 'undefined') {
      return failure(host, 'Apache ECharts failed to load.');
    }
    const wrap = document.createElement('div');
    wrap.className = 'chart-wrap';
    wrap.style.cssText = `position:relative;width:100%;height:${height}px`;
    host.appendChild(wrap);
    try {
      const chart = window.echarts.init(wrap);
      const config = def.echarts.build(spec, ctxInfo);
      chart.setOption(config);
      const draw = () => {
        chart.resize();
        annotate();
      };
      return { engine, chart, wrap, redraw: draw };
    } catch (err) {
      return failure(host, err.message);
    }
  }

  if (engine === 'canvas') {
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    const draw = () => {
      const w = Math.max(120, host.clientWidth || width);
      const ctx = sizeCanvas(canvas, w, height);
      ctx.clearRect(0, 0, w, height);
      // A canvas has nothing to hover, so the draw reports the boxes it paints
      // and the tooltip hit-tests those. Gallery thumbnails skip it: they are
      // not interactive, and collecting boxes for 98 of them is wasted work.
      const regions = [];
      ctxInfo.tip = opts.compact ? null : recordTip(regions);
      try {
        def.canvas.draw(ctx, spec, w, height, ctxInfo);
      } catch (err) {
        drawError(ctx, w, height, err.message);
      }
      attachCanvasTips(canvas, regions);
      annotate();
    };
    draw();
    return { engine, canvas, redraw: draw };
  }

  if (engine === 'd3') {
    if (typeof window.d3 === 'undefined') {
      return failure(host, 'D3 failed to load.');
    }
    const mount = () => {
      host.innerHTML = '';
      const w = Math.max(120, host.clientWidth || width);
      try {
        def.d3.mount(host, spec, w, height, ctxInfo);
        if (!opts.compact) attachTips(host);
        annotate();
      } catch (err) {
        failure(host, err.message);
      }
    };
    // A mount that reacts to input — the globe's drag-to-rotate — needs a way
    // to ask for itself again. It cannot capture this closure, because the very
    // same function is serialised into the export where no such closure exists,
    // so it arrives on `env` the way width and height do.
    ctxInfo.redraw = mount;
    mount();
    return { engine, redraw: mount, host };
  }

  if (engine === 'native') {
    const canvas = document.createElement('canvas');
    canvas.id = 'studio-native-' + Math.random().toString(36).slice(2, 8);
    canvas.style.cssText = `width:100%;height:${height}px;display:block`;
    host.appendChild(canvas);
    try {
      const { data, config } = def.native.build(spec, ctxInfo);
      const chart = new def.native.Class(canvas, { data, ...config });
      if (!opts.compact && chart.enableTooltip) chart.enableTooltip();
      annotate();
      return { engine, chart, canvas };
    } catch (err) {
      return failure(host, err.message);
    }
  }

  // dom
  const mount = () => {
    host.innerHTML = '';
    try {
      def.dom.mount(host, spec, ctxInfo);
      if (!opts.compact) attachTips(host);
      annotate();
    } catch (err) {
      failure(host, err.message);
    }
  };
  mount();
  return { engine, redraw: mount, host };
}

function failure(host, message) {
  const box = document.createElement('div');
  box.style.cssText =
    'display:grid;place-items:center;min-height:160px;padding:1.5rem;text-align:center;'
    + 'color:var(--ink-faint);font-size:13px;line-height:1.5';
  box.textContent = 'Could not render this chart: ' + message;
  host.appendChild(box);
  return { engine: 'error' };
}

function drawError(ctx, w, h, message) {
  ctx.save();
  ctx.fillStyle = 'rgba(128,128,128,.7)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Render error: ' + message, w / 2, h / 2);
  ctx.restore();
}

/** Tear down whatever renderChart() produced. */
export function destroyInstance(inst) {
  if (!inst) return;
  // A chart still waiting for its library has no instance to tear down, but it
  // does have a load in flight that must not paint into a host somebody else
  // now owns.
  if (inst.engine === 'loading') {
    inst.cancelled = true;
    if (inst.host) inst.host.__ocPending = null;
    return;
  }
  // A grid owns one instance per panel, and a Chart.js instance that is not
  // destroyed keeps its canvas and its resize listener alive — twelve of those
  // per rebuild is the leak this branch exists to prevent.
  if (inst.engine === 'facet') {
    (inst.panels || []).forEach(destroyInstance);
    return;
  }
  try {
    if (inst.chart && typeof inst.chart.dispose === 'function') inst.chart.dispose();
    else if (inst.chart && typeof inst.chart.destroy === 'function') inst.chart.destroy();
  } catch { /* already gone */ }
}

/** Re-render on container resize where the renderer needs it. */
export function resizeInstance(inst) {
  if (inst && typeof inst.redraw === 'function') inst.redraw();
}

/* ── Legend ──────────────────────────────────────────────────────────────── */

/**
 * Build the DOM legend. Chart.js's own legend is deliberately switched off
 * across this library so the legend can be styled as page furniture rather
 * than painted inside the canvas.
 */
export function renderLegend(container, items, inst) {
  container.innerHTML = '';
  if (!items || !items.length) { container.style.display = 'none'; return; }
  container.style.display = 'flex';

  // The custom engine ships its own LegendSystem with working series toggling —
  // hand the container over rather than drawing a second, dumber legend.
  if (inst && inst.engine === 'native' && inst.chart && typeof inst.chart.enableLegend === 'function') {
    try {
      inst.chart.enableLegend(container);
      return;
    } catch {
      // fall through to the generic legend below
    }
  }

  items.forEach((item, i) => {
    const el = document.createElement('span');
    el.className = 'legend-item';
    const sw = document.createElement('span');
    sw.className = 'legend-swatch' + (item.line ? ' line' : '');
    sw.style.background = item.color;
    const label = document.createElement('span');
    label.textContent = item.label;
    el.append(sw, label);

    // Only Chart.js instances can hide a series without a full rebuild.
    if (inst && inst.chart && inst.engine === 'chartjs' && item.toggleable !== false) {
      el.addEventListener('click', () => {
        const chart = inst.chart;
        const meta = chart.getDatasetMeta(item.datasetIndex ?? i);
        meta.hidden = meta.hidden === null ? !chart.data.datasets[item.datasetIndex ?? i].hidden : !meta.hidden;
        el.classList.toggle('hidden', !!meta.hidden);
        chart.update();
      });
    } else {
      el.style.cursor = 'default';
    }
    container.appendChild(el);
  });
}

/* ── Code generation ─────────────────────────────────────────────────────── */

const BASE_CSS = `.chart-card {
  /* The card is a figure now, and a figure carries a browser default
     margin of 1em 40px that the card never wanted. */
  margin: 0;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 20px;
  font-family: 'IBM Plex Sans', system-ui, sans-serif;
  color: #0f172a;
}

.chart-wrap {
  position: relative;
  width: 100%;
  height: 340px;
}

.chart-wrap canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 14px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #475569;
  cursor: pointer;
  user-select: none;
  transition: opacity .2s;
}

.legend-item.hidden { opacity: .35; }

.legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex: 0 0 10px;
}

.legend-swatch.line { width: 16px; height: 2px; border-radius: 1px; }

@media (prefers-color-scheme: dark) {
  .chart-card { background: #0f172a; border-color: rgba(148,163,184,.16); color: #f8fafc; }
  .legend-item { color: #cbd5e1; }
}`;

/**
 * Make a string safe to sit inside an inline <script> block.
 *
 * HTML closes a script element at the first literal `</script`, wherever it
 * appears — including inside a string or a comment. Escaping the slash is the
 * standard idiom and stays readable in the emitted source.
 */
export function safeForInlineScript(text) {
  // The replacement needs a real backslash in the output, so the literal is
  // escaped here: '<\\/' produces the two characters `<` and `\` then `/`.
  return String(text).replace(/<\/(script)/gi, '<\\/$1');
}

/**
 * Emit the legend as code.
 *
 * The generic "one entry per dataset" legend only suits charts whose series
 * map one-to-one onto datasets. Slice, node and group legends (pie, sankey,
 * treemap, the hand-drawn charts) do not, so the items the definition already
 * computed for the live page are emitted as a literal instead — the copied
 * legend is then exactly the legend on screen. Entries carrying a
 * `datasetIndex` stay clickable; the rest render as a static key.
 */
function legendCode(items, interactive) {
  const clean = items.map((it) => {
    const out = { label: it.label, color: it.color };
    if (it.line) out.line = true;
    if (interactive && it.toggleable !== false && it.datasetIndex != null) {
      out.datasetIndex = it.datasetIndex;
    }
    return out;
  });

  const toggle = interactive ? [
    `    if (item.datasetIndex != null) {`,
    `      el.style.cursor = 'pointer';`,
    `      el.addEventListener('click', () => {`,
    `        const meta = chart.getDatasetMeta(item.datasetIndex);`,
    `        meta.hidden = !meta.hidden;`,
    `        el.classList.toggle('hidden', !!meta.hidden);`,
    `        chart.update();`,
    `      });`,
    `    }`,
  ] : [];

  return [
    `const legendItems = ${serialize(clean, 0)};`,
    ``,
    `function buildLegend(containerId, items) {`,
    `  const host = document.getElementById(containerId);`,
    `  if (!host) return;`,
    `  host.innerHTML = '';`,
    `  items.forEach((item) => {`,
    `    const el = document.createElement('span');`,
    `    el.className = 'legend-item';`,
    `    const sw = document.createElement('span');`,
    `    sw.className = 'legend-swatch' + (item.line ? ' line' : '');`,
    `    sw.style.background = item.color;`,
    `    const text = document.createElement('span');`,
    `    text.textContent = item.label;`,
    `    el.append(sw, text);`,
    ...toggle,
    `    host.appendChild(el);`,
    `  });`,
    `}`,
    ``,
    `buildLegend('legend', legendItems);`,
  ].join('\n');
}

/**
 * Emit a renderer as a named function declaration, so the exported code reads
 * `function draw(...)` rather than `const draw = function draw(...)`.
 */
function namedFunction(fn, name) {
  const src = toFunctionSource(fn);
  return src.replace(/^(async\s+)?function\s*[A-Za-z_$][\w$]*\s*\(/, `$1function ${name}(`)
            .replace(/^(async\s+)?function\s*\(/, `$1function ${name}(`);
}

/**
 * The date adapter, as source, for an export whose config draws on time.
 *
 * Chart.js's time scale wants an adapter and ships none; every other library
 * hands it 60–300KB of date-fns or Luxon. Ours is native Date, so the export
 * carries two functions and asks for nothing more — and only when a scale is
 * actually `type: 'time'`, so every other Chart.js export is byte-for-byte
 * what it was. The same rule `ANNOTATION_CSS` and `FACET_CSS` follow.
 */
function dateAdapterSource(wanted) {
  if (!wanted) return [];
  return [
    '',
    '// Dates on the x axis. Chart.js needs a date adapter and ships none; this',
    "// one is the browser's own Date, in UTC, so no further library is loaded.",
    toFunctionSource(parseDateLabel),
    '',
    toFunctionSource(installDateAdapter),
    '',
    'installDateAdapter();',
  ];
}

/** Source text for any helper functions a definition declares. */
function helperSource(block) {
  const helpers = block && block.helpers;
  if (!helpers || !helpers.length) return '';
  return helpers.map((fn) => toFunctionSource(fn)).join('\n\n') + '\n\n';
}

/**
 * The HTML fragment a chart needs.
 *
 * Wrapped in a `<figure>` carrying a description and the data as a table,
 * because a canvas is a blank box to a screen reader and this generator is
 * what puts charts on other people's sites. Both are derived — see
 * `a11y.js` — so a chart cannot ship an accessible layer that disagrees with
 * what it draws.
 */
function buildHTML(def, spec) {
  const engine = engineOf(def);
  const legend = def.legend ? def.legend(spec) : null;
  const hasLegend = !!(legend && legend.length);

  if (def.html) return def.html(spec, { hasLegend });

  // The mark itself carries the short label, so a reader landing on the
  // graphic hears what it is; the long description hangs off the figure.
  const plate = (id, label) => {
    if (engine === 'd3' || engine === 'dom') {
      return `<div id="${id}" role="img" aria-label="${escapeText(label)}"></div>`;
    }
    // ECharts sizes itself from its container, so the div needs the height
    // `.chart-wrap` carries — unlike d3/dom, which grow with their content.
    if (engine === 'echarts') {
      return `<div id="${id}" role="img" aria-label="${escapeText(label)}" class="chart-wrap"></div>`;
    }
    return `<div class="chart-wrap"><canvas id="${id}" role="img" aria-label="${escapeText(label)}"></canvas></div>`;
  };

  const panels = panelSpecs(def, spec);
  // The plate and the mark inside it must not share an id. They did, and
  // `getElementById('chart-0')` handed back the wrapper — so three of the five
  // renderers called `getContext` on a `<div>` and every faceted export was
  // blank. The plate is named for what it is; the mark keeps `chart-<i>`,
  // which is the id the generated JS looks up.
  const inner = panels
    ? indent(facetMarkup(panels.map((p) => p.name), {
      cols: panelColumns(panels.length, spec.facet && spec.facet.cols),
      idPrefix: 'panel',
      inner: (i) => plate(`chart-${i}`, `${panels[i].name} — ${chartLabel(def, panels[i].spec)}`),
    }), 2)
    : indent(plate('chart', chartLabel(def, spec)), 2);

  const table = tableMarkup(def, spec);
  // Title and subtitle above the plate, source and byline below it — the same
  // functions the studio's preview wraps the host with, so the two cannot say
  // different things. Empty strings when nothing is written, and dropped.
  const head = captionHead(spec);
  const foot = captionFoot(spec);

  return [
    `<figure class="chart-card" aria-describedby="chart-desc">`,
    `  <p id="chart-desc" class="visually-hidden">${escapeText(chartSummary(def, spec))}</p>`,
    head ? indent(head, 2) : null,
    inner,
    hasLegend ? `  <div class="legend" id="legend"></div>` : null,
    foot ? indent(foot, 2) : null,
    table ? indent(table, 2) : null,
    `</figure>`,
  ].filter(Boolean).join('\n');
}

/** The CSS a chart needs: shared base plus any per-chart extras. */
function buildCSS(def, spec) {
  const engine = engineOf(def);
  const parts = [BASE_CSS, A11Y_CSS];
  const panels = panelSpecs(def, spec);
  // A panel is shorter than the chart it came from, and the grid decides by
  // how much — so the height the exported CSS reserves has to come from the
  // same function the preview lays out with, not from `heightFor` alone.
  const h = panels
    ? panelHeight(heightFor(def, {}), panelColumns(panels.length, spec.facet && spec.facet.cols))
    : heightFor(def, {});

  if (panels) {
    parts.push(FACET_CSS);
    // `BASE_CSS` gives `.chart-wrap` the full 340px a single chart wants. A
    // panel is shorter, and Chart.js sizes itself from that box — so without
    // this every panel would be drawn at full height inside a grid cell.
    parts.push(`.oc-facet-plate .chart-wrap {\n  height: ${h}px;\n}`);
  }

  if (engine === 'd3' || engine === 'dom' || engine === 'echarts') {
    parts.push(panels
      ? `.oc-facet-plate > div {\n  width: 100%;\n  min-height: ${h}px;\n}`
      : `#chart {\n  width: 100%;\n  min-height: ${h}px;\n}`);
  }
  // Only where there is something to lay over the plate, so the export of a
  // chart nobody annotated is byte-for-byte what it was before the feature
  // existed. A chart's own CSS comes after, and can therefore restyle it.
  if (hasAnnotations(spec)) parts.push(ANNOTATION_CSS);
  if (hasCaption(spec)) parts.push(CAPTION_CSS);
  if (def.css) parts.push(typeof def.css === 'function' ? def.css(spec) : def.css);
  return tidy(parts.join('\n\n'));
}

/** The JavaScript a chart needs. */
/**
 * Drop the studio's own bookkeeping before a spec is printed into exported
 * code. Anything prefixed with `_` is internal — a transient status message, a
 * parsing scratch field — and has no business in a snippet someone pastes.
 */
function publicSpec(spec) {
  if (!spec || typeof spec !== 'object') return spec;
  const out = Array.isArray(spec) ? [] : {};
  for (const key of Object.keys(spec)) {
    if (key.startsWith('_')) continue;
    const v = spec[key];
    out[key] = (v && typeof v === 'object' && !(v instanceof Date)) ? publicSpec(v) : v;
  }
  return out;
}

/**
 * The spec as the exported renderer sees it.
 *
 * `annotations` is dropped on the way out. It is emitted as a `const` of its
 * own beside the overlay that reads it, and that separation is a statement
 * about what reads what: `draw` and `mount` read the spec, and neither of them
 * has ever heard of an annotation. On the two renderers that emit no spec at
 * all — Chart.js and the custom engine — it is also the only way to carry
 * them.
 */
function specForCode(spec) {
  // Neither is read by any `draw` or `mount`: notes are laid over the plate
  // and the caption is markup around it, both emitted from the HTML side.
  const { annotations, caption, ...rest } = publicSpec(spec);
  return rest;
}

/**
 * The overlay, as source: the annotations themselves and the one function that
 * paints them. Empty for a chart nobody annotated, so nothing is added to the
 * 114 exports that do not want it.
 */
function annotationDecl(onGrid, anyOnPanels = false) {
  if (!onGrid.length && !anyOnPanels) return [];
  return [
    '',
    `// Notes laid over the chart, positioned as a fraction of its box — so a`,
    `// resize moves them with it and nothing has to be redrawn.`,
    // A faceted chart whose notes are all pinned to panels needs the painter
    // but no grid-level list, so the const is emitted only when it has content.
    ...(onGrid.length ? [`const annotations = ${serialize(onGrid, 0)};`, ''] : []),
    toFunctionSource(drawAnnotations),
  ];
}

/** The call that paints the grid-level notes, or nothing. */
const annotationCall = (onGrid, target) =>
  (onGrid.length ? [`drawAnnotations(${target}, annotations);`] : []);

/**
 * The loop that paints the notes pinned to individual panels.
 *
 * One statement for all five engines, because by this point every faceted
 * export already holds a `panels` array — what differs between engines is what
 * is *inside* a panel, and a note is laid over the plate rather than drawn by
 * the renderer. The plate is `panel-<i>`; `chart-<i>` is the mark inside it,
 * and painting into that would put the overlay inside the canvas's own box.
 */
const panelAnnotationCall = (panels) =>
  (panels.some((p) => hasAnnotations(p.spec))
    ? [
      '',
      `// Notes pinned to one panel rather than to the grid.`,
      `panels.forEach((panel, i) => {`,
      `  if (!panel.notes || !panel.notes.length) return;`,
      `  drawAnnotations(document.getElementById('panel-' + i), panel.notes);`,
      `});`,
    ]
    : []);

/** A panel as the export carries it: its name, its spec, and its own notes. */
const panelEntry = (p, extra) => ({
  name: p.name,
  ...extra,
  ...(hasAnnotations(p.spec) ? { notes: p.spec.annotations } : {}),
});

function buildJS(def, spec) {
  const engine = engineOf(def);
  const legend = def.legend ? def.legend(spec) : null;
  const hasLegend = !!(legend && legend.length);
  const header = dependencyHeader(def, dependenciesFor(def));

  // A faceted export carries N complete specs and one loop. Nothing in any
  // renderer changes: the split happened in `panelSpecs`, which runs here, and
  // what is printed below is the same `draw` / `mount` / `build` reading the
  // same shape of spec it has always read.
  const panels = panelSpecs(def, spec);
  const cols = panels ? panelColumns(panels.length, spec.facet && spec.facet.cols) : 1;
  const h = panels ? panelHeight(heightFor(def, {}), cols) : heightFor(def, {});
  const panelWidth = Math.max(160, Math.round(800 / cols));

  // Split once, here. Unfaceted, every note is a grid note by definition —
  // there is one plate and it is the grid. Faceted, the ones addressed to a
  // panel have already travelled into that panel's spec via `panelSpecs`.
  const onGrid = panels ? gridAnnotations(spec.annotations) : (spec.annotations || []);
  const onPanels = !!panels && panels.some((p) => hasAnnotations(p.spec));
  const annots = annotationDecl(onGrid, onPanels);

  // Grid-level notes hang off the container the panels sit in.
  const facetTarget = `document.querySelector('.oc-facets')`;
  const panelData = () => serialize(
    panels.map((p) => panelEntry(p, { spec: specForCode(p.spec) })), 0,
  );
  // Faceted legends are never interactive: the toggle drives one `chart`, and
  // a grid has as many as it has panels.
  const legendLines = (interactive) =>
    (hasLegend ? ['', legendCode(legend, interactive && !panels)] : []);

  if (engine === 'chartjs') {
    if (panels) {
      const bounds = sharedScaleBounds(def, panels, spec.facet);
      const built = panels.map((p) => panelEntry(p, {
        config: applyScaleBounds(
          def.chartjs.build(p.spec, { width: panelWidth, height: h }), bounds,
        ),
      }));
      return tidy([
        ...header,
        ...dateAdapterSource(built.some((p) => usesTimeScale(p.config))),
        '',
        `// One finished config per panel.`,
        `const panels = ${serialize(built, 0)};`,
        '',
        `const charts = panels.map((panel, i) =>`,
        `  new Chart(document.getElementById('chart-' + i), panel.config));`,
        ...annots,
        ...(annots.length ? ['', ...annotationCall(onGrid, facetTarget)] : []),
        ...panelAnnotationCall(panels),
        ...legendLines(true),
      ].join('\n'));
    }

    const config = def.chartjs.build(spec, { width: 800, height: heightFor(def, {}) });
    const lines = [
      ...header,
      ...dateAdapterSource(usesTimeScale(config)),
      '',
      `const config = ${serialize(config, 0)};`,
      '',
      `const chart = new Chart(document.getElementById('chart'), config);`,
      ...annots,
      ...(annots.length ? ['', ...annotationCall(onGrid, `document.querySelector('.chart-wrap')`)] : []),
    ];
    if (hasLegend) lines.push('', legendCode(legend, true));
    return tidy(lines.join('\n'));
  }

  if (engine === 'echarts') {
    if (panels) {
      const built = panels.map((p) => panelEntry(p, {
        config: def.echarts.build(p.spec, { width: panelWidth, height: h }),
      }));
      return tidy([
        ...header,
        '',
        `const panels = ${serialize(built, 0)};`,
        '',
        `const charts = panels.map((panel, i) => {`,
        `  const chart = echarts.init(document.getElementById('chart-' + i));`,
        `  chart.setOption(panel.config);`,
        `  return chart;`,
        `});`,
        `window.addEventListener('resize', () => charts.forEach(c => c.resize()));`,
        ...annots,
        ...(annots.length ? ['', ...annotationCall(onGrid, facetTarget)] : []),
        ...panelAnnotationCall(panels),
        ...legendLines(true),
      ].join('\n'));
    }

    const config = def.echarts.build(spec, { width: 800, height: heightFor(def, {}) });
    const lines = [
      ...header,
      '',
      `const config = ${serialize(config, 0)};`,
      '',
      `const chart = echarts.init(document.getElementById('chart'));`,
      `chart.setOption(config);`,
      `window.addEventListener('resize', () => chart.resize());`,
      ...annots,
      ...(annots.length ? ['', ...annotationCall(onGrid, `document.querySelector('.chart-wrap')`)] : []),
    ];
    if (hasLegend) lines.push('', legendCode(legend, true));
    return tidy(lines.join('\n'));
  }

  if (engine === 'canvas') {
    const block = def.canvas;
    if (panels) {
      return tidy([
        ...header,
        '',
        `const panels = ${panelData()};`,
        ...annots,
        '',
        helperSource(block).trim(),
        '',
        toFunctionSource(recordTip),
        '',
        toFunctionSource(attachCanvasTips),
        '',
        namedFunction(block.draw, 'draw'),
        '',
        `// Every panel is drawn by the same function from its own spec.`,
        `function render() {`,
        `  panels.forEach((panel, i) => {`,
        `    const canvas = document.getElementById('chart-' + i);`,
        `    if (!canvas) return;`,
        `    const w = canvas.parentElement.clientWidth;`,
        `    const h = ${h};`,
        `    const dpr = window.devicePixelRatio || 1;`,
        `    canvas.width = Math.round(w * dpr);`,
        `    canvas.height = Math.round(h * dpr);`,
        `    canvas.style.width = w + 'px';`,
        `    canvas.style.height = h + 'px';`,
        `    const ctx = canvas.getContext('2d');`,
        `    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);`,
        `    ctx.clearRect(0, 0, w, h);`,
        `    const regions = [];`,
        `    draw(ctx, panel.spec, w, h, {`,
        `      width: w, height: h,`,
        `      tip: recordTip(regions),`,
        `    });`,
        `    attachCanvasTips(canvas, regions);`,
        `  });`,
        `}`,
        '',
        `render();`,
        `window.addEventListener('resize', render);`,
        // The grid itself is never emptied — only the canvases inside it are —
        // so the overlay is painted once and left to reflow.
        ...annotationCall(onGrid, facetTarget),
        ...panelAnnotationCall(panels),
        ...legendLines(false),
      ].join('\n'));
    }
    return tidy([
      ...header,
      '',
      `const spec = ${serialize(specForCode(spec), 0)};`,
      ...annots,
      '',
      helperSource(block).trim(),
      '',
      toFunctionSource(recordTip),
      '',
      toFunctionSource(attachCanvasTips),
      '',
      namedFunction(block.draw, 'draw'),
      '',
      `// Size for the device pixel ratio, then draw in CSS pixels.`,
      `const canvas = document.getElementById('chart');`,
      `function render() {`,
      `  const host = canvas.parentElement;`,
      `  const w = host.clientWidth;`,
      `  const h = ${h};`,
      `  const dpr = window.devicePixelRatio || 1;`,
      `  canvas.width = Math.round(w * dpr);`,
      `  canvas.height = Math.round(h * dpr);`,
      `  canvas.style.width = w + 'px';`,
      `  canvas.style.height = h + 'px';`,
      `  const ctx = canvas.getContext('2d');`,
      `  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);`,
      `  ctx.clearRect(0, 0, w, h);`,
      `  const regions = [];`,
      `  draw(ctx, spec, w, h, {`,
      `    width: w, height: h,`,
      `    tip: recordTip(regions),`,
      `  });`,
      `  attachCanvasTips(canvas, regions);`,
      `}`,
      '',
      `render();`,
      `window.addEventListener('resize', render);`,
      // The wrap is never cleared — only the canvas inside it is — so the
      // overlay is painted once and left to reflow on its own.
      ...annotationCall(onGrid, 'canvas.parentElement'),
      ...(hasLegend ? ['', legendCode(legend, false)] : []),
    ].join('\n'));
  }

  if (engine === 'd3') {
    const block = def.d3;
    if (panels) {
      return tidy([
        ...header,
        '',
        `const panels = ${panelData()};`,
        ...annots,
        '',
        helperSource(block).trim(),
        '',
        toFunctionSource(attachTips),
        '',
        namedFunction(block.mount, 'mount'),
        '',
        `function render() {`,
        `  panels.forEach((panel, i) => {`,
        `    const host = document.getElementById('chart-' + i);`,
        `    if (!host) return;`,
        `    host.innerHTML = '';`,
        `    const w = host.clientWidth;`,
        `    mount(host, panel.spec, w, ${h}, { width: w, height: ${h}, redraw: render });`,
        `    attachTips(host);`,
        `  });`,
        `}`,
        '',
        `render();`,
        `window.addEventListener('resize', render);`,
        // A mount empties its own panel, never the grid, so the overlay is laid
        // over the grid once.
        ...annotationCall(onGrid, facetTarget),
        ...panelAnnotationCall(panels),
        ...legendLines(false),
      ].join('\n'));
    }
    return tidy([
      ...header,
      '',
      `const spec = ${serialize(specForCode(spec), 0)};`,
      ...annots,
      '',
      helperSource(block).trim(),
      '',
      toFunctionSource(attachTips),
      '',
      namedFunction(block.mount, 'mount'),
      '',
      `const host = document.getElementById('chart');`,
      `function render() {`,
      `  host.innerHTML = '';`,
      `  mount(host, spec, host.clientWidth, ${h}, { width: host.clientWidth, height: ${h}, redraw: render });`,
      `  attachTips(host);`,
      // The mount empties its host, so the overlay has to be laid back over it
      // every time rather than painted once.
      ...annotationCall(onGrid, 'host').map((line) => '  ' + line),
      `}`,
      '',
      `render();`,
      `window.addEventListener('resize', render);`,
      ...(hasLegend ? ['', legendCode(legend, false)] : []),
    ].join('\n'));
  }

  if (engine === 'native') {
    const cls = def.native.className;
    if (panels) {
      const built = panels.map((p) => {
        const out = def.native.build(p.spec, { width: panelWidth, height: h });
        return panelEntry(p, { data: out.data, config: out.config });
      });
      return tidy([
        ...header,
        '',
        `import { ${cls} } from './js/charts/${cls}.js';`,
        '',
        `const panels = ${serialize(built, 0)};`,
        '',
        `const charts = panels.map((panel, i) => {`,
        `  const chart = new ${cls}('chart-' + i, { data: panel.data, ...panel.config });`,
        `  chart.enableTooltip();`,
        `  return chart;`,
        `});`,
        ...annots,
        ...(annots.length ? ['', ...annotationCall(onGrid, facetTarget)] : []),
        ...panelAnnotationCall(panels),
        ...legendLines(false),
      ].join('\n'));
    }

    const { data, config } = def.native.build(spec, { width: 800, height: heightFor(def, {}) });
    return tidy([
      ...header,
      '',
      `import { ${cls} } from './js/charts/${cls}.js';`,
      '',
      `const data = ${serialize(data, 0)};`,
      '',
      `const config = ${serialize(config, 0)};`,
      '',
      `const chart = new ${cls}('chart', { data, ...config });`,
      `chart.enableTooltip();`,
      // enableLegend takes the element itself, not an id — the studio passes a
      // node, so the exported code must too or it throws on innerHTML.
      hasLegend ? `chart.enableLegend(document.getElementById('legend'));` : '',
      ...annots,
      ...(annots.length ? ['', ...annotationCall(onGrid, `document.querySelector('.chart-wrap')`)] : []),
    ].join('\n'));
  }

  // dom
  const block = def.dom;
  if (panels) {
    return tidy([
      ...header,
      '',
      `const panels = ${panelData()};`,
      ...annots,
      '',
      helperSource(block).trim(),
      '',
      toFunctionSource(attachTips),
      '',
      namedFunction(block.mount, 'mount'),
      '',
      `panels.forEach((panel, i) => {`,
      `  const host = document.getElementById('chart-' + i);`,
      `  if (!host) return;`,
      `  mount(host, panel.spec);`,
      `  attachTips(host);`,
      `});`,
      ...annotationCall(onGrid, facetTarget),
      ...legendLines(false),
    ].join('\n'));
  }
  return tidy([
    ...header,
    '',
    `const spec = ${serialize(specForCode(spec), 0)};`,
    ...annots,
    '',
    helperSource(block).trim(),
    '',
    toFunctionSource(attachTips),
    '',
    namedFunction(block.mount, 'mount'),
    '',
    `const host = document.getElementById('chart');`,
    `mount(host, spec);`,
    `attachTips(host);`,
    ...annotationCall(onGrid, 'host'),
    ...(hasLegend ? ['', legendCode(legend, false)] : []),
  ].join('\n'));
}

/**
 * The comment header that opens the JS tab, naming exactly what has to be on
 * the page for the snippet below it to run. Copying the JS alone is the most
 * common way to end up with a blank canvas, so the script tags are spelled out
 * here rather than pointing at another tab.
 */
function dependencyHeader(def, deps) {
  const cdn = cdnOnly(deps);
  const scripts = scriptsOnly(deps);
  const data = deps.filter((d) => d.kind === 'data');
  const lines = [`// ${def.title} — ${ENGINE_LABEL[engineOf(def)]}`];

  if (engineOf(def) === 'native') {
    lines.push(`//`);
    lines.push(`// Needs the OpenCharts engine: copy js/core/ and js/charts/ next to`);
    lines.push(`// this file. No CDN, no build step, no other dependency.`);
    return lines;
  }
  if (!cdn.length) {
    lines.push(`//`);
    lines.push(`// No library required — this chart is drawn with the browser's own APIs.`);
    return lines;
  }

  lines.push(`//`);
  if (scripts.length) {
    lines.push(`// Requires ${scripts.length === 1 ? 'this script' : 'these scripts'} on the page, in this order:`);
    scripts.forEach((lib) => {
      // The closing tag is escaped: an unescaped </script> inside this comment
      // would terminate the enclosing <script> block when the snippet is
      // embedded in a page, dumping the rest of the code out as visible text.
      lines.push(`//   ${safeForInlineScript(scriptTag(lib))}`);
      lines.push(`//     ${describe(lib)} — ${lib.homepage}`);
    });
  }
  if (data.length) {
    lines.push(`//`);
    lines.push(`// Also fetches ${data.length === 1 ? 'this data file' : 'these data files'} at runtime:`);
    data.forEach((lib) => {
      lines.push(`//   ${lib.url}`);
      lines.push(`//     ${describe(lib)} — ${lib.homepage}`);
    });
  }
  return lines;
}

/** A complete, runnable HTML document. */
function buildStandalone(def, spec, html, css, js) {
  const engine = engineOf(def);
  const allDeps = dependenciesFor(def);
  const deps = scriptsOnly(allDeps);
  const dataDeps = allDeps.filter((d) => d.kind === 'data');
  const isModule = engine === 'native';

  // Each tag is labelled so whoever opens the file can see what it pulls in,
  // from where, and under which licence — without leaving the file.
  const scriptBlock = deps.length
    ? [
      `<!-- Libraries this chart needs, in load order -->`,
      ...deps.flatMap((lib) => [
        `<!-- ${describe(lib)} · ${lib.homepage} -->`,
        scriptTag(lib),
      ]),
    ]
    : [`<!-- No charting library needed — this chart draws itself. -->`];

  if (dataDeps.length) {
    scriptBlock.push(`<!-- Fetched at runtime by the script below: -->`);
    dataDeps.forEach((lib) => scriptBlock.push(`<!--   ${describe(lib)} · ${lib.url} -->`));
  }

  return tidy([
    `<!DOCTYPE html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="UTF-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escapeText(def.title)}</title>`,
    `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    `<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet">`,
    ...scriptBlock,
    `<style>`,
    `body {`,
    `  margin: 0;`,
    `  min-height: 100vh;`,
    `  display: grid;`,
    `  place-items: center;`,
    `  padding: 32px;`,
    `  background: #ffffff;`,
    `  font-family: 'IBM Plex Sans', system-ui, sans-serif;`,
    `}`,
    ``,
    `.chart-card { width: 100%; max-width: 860px; }`,
    ``,
    `@media (prefers-color-scheme: dark) { body { background: #0b1120; } }`,
    ``,
    indent(css, 0),
    `</style>`,
    `</head>`,
    `<body>`,
    ``,
    indent(html, 0),
    ``,
    isModule ? `<script type="module">` : `<script>`,
    indent(safeForInlineScript(js), 0),
    `</script>`,
    `</body>`,
    `</html>`,
  ].join('\n'));
}

function escapeText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Produce all four code views for a chart.
 *
 * @returns {{html:string, css:string, js:string, standalone:string, note:string}}
 */
export function generateCode(def, spec) {
  let html, css, js;
  try {
    html = buildHTML(def, spec);
    css = buildCSS(def, spec);
    js = buildJS(def, spec);
  } catch (err) {
    const msg = `/* Code generation failed: ${err.message} */`;
    return { html: msg, css: msg, js: msg, standalone: msg, note: 'Code generation failed.' };
  }

  const standalone = buildStandalone(def, spec, html, css, js);
  const engine = engineOf(def);
  const deps = dependenciesFor(def);
  const cdn = cdnOnly(deps);

  let note;
  if (engine === 'native') {
    note = 'Bundled engine — copy js/core/ and js/charts/ next to the exported file.';
  } else if (cdn.length) {
    note = `${cdn.length} CDN script${cdn.length > 1 ? 's' : ''} required — listed above, and already in the Standalone tab.`;
  } else {
    note = 'No CDN and no library — this chart is drawn with the browser’s own APIs.';
  }

  return { html, css, js, standalone, note, deps };
}
