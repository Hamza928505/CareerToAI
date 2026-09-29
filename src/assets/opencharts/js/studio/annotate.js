/**
 * annotate.js — a note, a rule and a highlighted band, laid over the plate.
 *
 * Datawrapper's signature feature is the thing that separates a chart from an
 * explanation: a label on the peak, a line at the target, a shaded stripe over
 * the quarter that went wrong. Nothing in this library could say any of that,
 * so every chart it exported drew the numbers and left the point unmade.
 *
 * **An annotation is positioned as a fraction of the plate, not in data
 * coordinates**, and that single decision is what makes it affordable here.
 * Anchoring a note to "the March value" means every renderer exposing its
 * scales — a new contract across 48 canvas charts, 21 D3 mounts and the 39 on
 * Chart.js, each of which computes its scales privately inside the very
 * function that gets serialised. Anchoring it to "42% across, 18% down" needs
 * nothing from the renderer at all, so all 114 charts gained annotations on
 * the same afternoon and no `draw` or `mount` was touched.
 *
 * The trade is real and worth stating: move the data and the note stays put.
 * That is why a note is *dragged into place on the chart* rather than typed as
 * a pair of numbers — placing it is a glance, and re-placing it after an edit
 * is the same glance again.
 *
 * **It is DOM over the plate, not ink in the canvas.** Three things follow,
 * and each of them is the reason:
 *
 * - It works the same on all five renderers, including the two that emit no
 *   `spec` for anything to hook into.
 * - Percentages reflow by themselves, so a resize costs no redraw — which is
 *   also why the overlay survives `render()` on a canvas chart and has to be
 *   repainted inside it on a D3 one, where the mount clears its host.
 * - The label is real text. Accessible output landed one feature ago; a note
 *   painted into a canvas would be invisible to exactly the readers it just
 *   started serving. The words reach them through `chartSummary` instead —
 *   see `describeAnnotations` — and the overlay is `aria-hidden` so they are
 *   not read out twice.
 *
 * `drawAnnotations` is **serialised verbatim into exported code**, so it may
 * reference nothing but its own arguments and globals — no imports, no module
 * constants. See "One build function, two outputs" in CLAUDE.md. Everything
 * below it in this file is the studio's own and is never emitted.
 */

/* ── the model ───────────────────────────────────────────────────────────── */

/**
 * The three kinds, and what each one is for.
 *
 * `axis` on a rule or a band names the axis it is pinned to, the way every
 * charting library keys a rule to a scale: `'x'` runs *across* the plate and
 * therefore draws vertically, `'y'` runs up it and draws horizontally. The
 * control says "Vertical" and "Horizontal" so nobody has to hold that in mind.
 */
export const ANNOTATION_TYPES = [
  { type: 'note', label: 'Note', glyph: '✎', hint: 'A label anywhere on the plate, with an optional arrow.' },
  { type: 'line', label: 'Rule', glyph: '↔', hint: 'A line across the plate — a target, a threshold, an average.' },
  { type: 'band', label: 'Band', glyph: '▤', hint: 'A shaded stripe over a region worth singling out.' },
];

/**
 * The control every chart carries, attached by the registry rather than
 * declared 114 times — the same bargain the data editor makes.
 *
 * Last in the panel, not first: you say what a chart means after you have
 * built it, and the data editor keeps the top of the rail.
 */
export const ANNOTATION_CONTROL = {
  group: 'Notes',
  type: 'annotations',
  key: 'annotations',
  label: 'Notes on the chart',
};

/** Keep a fraction inside the plate, and short enough to read in the spec. */
const clamp01 = (n) => Math.round(Math.max(0, Math.min(1, Number(n) || 0)) * 1000) / 1000;

/**
 * A fresh annotation of `type`.
 *
 * Cascaded off however many already exist. Dropping every new one at dead
 * centre would stack them exactly, and two clicks of `+ Note` would look like
 * one click that did nothing.
 */
export function newAnnotation(type, existing = 0) {
  const step = (existing % 5) * 0.06;
  if (type === 'line') return { type: 'line', axis: 'y', at: clamp01(0.35 + step), text: '' };
  if (type === 'band') return { type: 'band', axis: 'x', from: clamp01(0.28 + step), to: clamp01(0.48 + step), text: '' };
  return { type: 'note', x: clamp01(0.32 + step), y: clamp01(0.22 + step), text: '', arrow: null };
}

/** Where an arrow starts life: below and right of its label, never under it. */
export function defaultArrow(a) {
  return { x: clamp01((a.x == null ? 0.5 : a.x) + 0.14), y: clamp01((a.y == null ? 0.5 : a.y) + 0.16) };
}

/* ── the overlay, which the export carries ───────────────────────────────── */

/**
 * Paint `list` over `box`.
 *
 * Rebuilt from scratch on each call rather than guarded by a flag on the host:
 * a D3 mount clears its host on every redraw, so a layer that remembered it
 * had already been added would vanish on the first one and never come back.
 *
 * @param {HTMLElement} box   the element holding the chart's own box
 * @param {Array} list        annotations, positioned 0–1 from the top left
 */
function drawAnnotations(box, list) {
  if (!box) return;
  const previous = box.querySelector(':scope > .oc-annots');
  if (previous) previous.remove();
  if (!list || !list.length) return;
  if (getComputedStyle(box).position === 'static') box.style.position = 'relative';

  const layer = document.createElement('div');
  layer.className = 'oc-annots';
  // The same words are already in the chart's description, so announcing the
  // overlay too would read every note twice — and on a D3 chart the host
  // carries role="img", which would swallow them silently instead.
  layer.setAttribute('aria-hidden', 'true');

  const pc = (n) => (Math.max(0, Math.min(1, Number(n) || 0)) * 100).toFixed(2) + '%';
  const make = (cls, i, part) => {
    const el = document.createElement('div');
    el.className = cls;
    el.dataset.annot = String(i);
    if (part) el.dataset.part = part;
    return el;
  };
  const label = (text, i, cls) => {
    const el = make('oc-annot oc-annot-label ' + cls, i, 'label');
    // Never innerHTML: this is somebody's own text going into somebody else's
    // page, and the same rule the spreadsheet reader follows applies here.
    el.textContent = text;
    return el;
  };

  // One stretched SVG for every leader line. `preserveAspectRatio="none"` turns
  // the viewBox into a percentage grid, so a line needs no measurement and
  // reflows with the plate; `vector-effect` is what stops that same stretch
  // turning a 1px stroke into a wedge on a wide chart.
  const leads = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  leads.setAttribute('class', 'oc-annot-leads');
  leads.setAttribute('viewBox', '0 0 100 100');
  leads.setAttribute('preserveAspectRatio', 'none');
  let hasLead = false;

  list.forEach((a, i) => {
    if (!a || !a.type) return;
    const tint = (el) => { if (a.color) el.style.setProperty('--oc-annot-color', a.color); return el; };
    const text = String(a.text == null ? '' : a.text);

    if (a.type === 'line') {
      const across = a.axis === 'x';
      const rule = tint(make('oc-annot oc-annot-line ' + (across ? 'is-across' : 'is-up'), i, 'line'));
      if (across) rule.style.left = pc(a.at);
      else rule.style.top = pc(a.at);
      layer.appendChild(rule);

      if (text) {
        const tag = tint(label(text, i, across ? 'on-across' : 'on-up'));
        if (across) tag.style.left = pc(a.at);
        else tag.style.top = pc(a.at);
        layer.appendChild(tag);
      }
      return;
    }

    if (a.type === 'band') {
      // A drag can pull one edge past the other, and a band that drew
      // backwards would be a bug the reader caused and could not see to undo.
      const lo = Math.min(a.from, a.to);
      const hi = Math.max(a.from, a.to);
      const across = a.axis === 'x';
      const band = tint(make('oc-annot oc-annot-band ' + (across ? 'is-across' : 'is-up'), i, 'band'));
      if (across) { band.style.left = pc(lo); band.style.width = pc(hi - lo); }
      else { band.style.top = pc(lo); band.style.height = pc(hi - lo); }
      layer.appendChild(band);

      // Grab targets for each edge. They have no size in an export, where
      // nothing can be dragged.
      ['from', 'to'].forEach((edge) => {
        const h = make('oc-annot oc-annot-edge ' + (across ? 'is-across' : 'is-up'), i, edge);
        if (across) h.style.left = pc(a[edge]);
        else h.style.top = pc(a[edge]);
        layer.appendChild(h);
      });

      if (text) {
        const tag = tint(label(text, i, across ? 'on-band-across' : 'on-band-up'));
        if (across) tag.style.left = pc((lo + hi) / 2);
        else tag.style.top = pc((lo + hi) / 2);
        layer.appendChild(tag);
      }
      return;
    }

    // A note, with or without an arrow to whatever it is about.
    const tag = tint(label(text || 'Note', i, 'is-note'));
    tag.style.left = pc(a.x);
    tag.style.top = pc(a.y);
    if (!text) tag.classList.add('is-blank');
    layer.appendChild(tag);

    if (a.arrow) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', (Math.max(0, Math.min(1, a.x)) * 100).toFixed(2));
      line.setAttribute('y1', (Math.max(0, Math.min(1, a.y)) * 100).toFixed(2));
      line.setAttribute('x2', (Math.max(0, Math.min(1, a.arrow.x)) * 100).toFixed(2));
      line.setAttribute('y2', (Math.max(0, Math.min(1, a.arrow.y)) * 100).toFixed(2));
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      if (a.color) line.setAttribute('stroke', a.color);
      leads.appendChild(line);
      hasLead = true;

      const head = tint(make('oc-annot oc-annot-head', i, 'arrow'));
      head.style.left = pc(a.arrow.x);
      head.style.top = pc(a.arrow.y);
      layer.appendChild(head);
    }
  });

  if (hasLead) layer.insertBefore(leads, layer.firstChild);
  box.appendChild(layer);
}

export { drawAnnotations };

/**
 * The element a chart actually occupies, given the element it was rendered
 * into. The studio hands over its own host; an export has a `.chart-wrap`
 * around the canvas, or the `#chart` div a D3 mount was given.
 *
 * A faceted chart is checked first, and the grid wins: a note about a set of
 * small multiples is a remark about the comparison, so it is placed over the
 * whole grid rather than repeated into every panel. Painting one note twelve
 * times would multiply a single observation by the number of panels.
 */
export function plateOf(root) {
  if (!root) return null;
  return root.querySelector(':scope > .oc-facets')
    || root.querySelector(':scope > .chart-wrap')
    || root;
}

/** Whether a spec carries anything worth painting. */
export const hasAnnotations = (spec) =>
  !!(spec && Array.isArray(spec.annotations) && spec.annotations.length);

/* ── which plate a note belongs to ───────────────────────────────────────── */

/**
 * An annotation's `panel` field, and the two special values it can take.
 *
 * Absent means **the grid** — one remark laid over the whole set of small
 * multiples, which is what a note usually is and what this feature did
 * exclusively until now. `'*'` means **every panel**, which is what a shared
 * reference is: a target line at 500 belongs on all twelve, not floating over
 * the gaps between them. Anything else names one panel.
 *
 * Panels are addressed by *name* rather than index because a name is what the
 * picker shows and what the export carries, and because re-ordering the series
 * moves the indices while the names travel with their data. The cost is that
 * renaming a series orphans its notes — they simply stop rendering, which is
 * the same way a facet column that disappears behaves.
 */
export const PANEL_ALL = '*';

const list = (v) => (Array.isArray(v) ? v : []);

/** The notes that belong to the grid itself — the default for anything unset. */
export const gridAnnotations = (all) => list(all).filter((a) => a && !a.panel);

/** The notes that belong to the panel called `name`, plus the ones on all of them. */
export const panelAnnotations = (all, name) =>
  list(all).filter((a) => a && a.panel && (a.panel === PANEL_ALL || a.panel === name));

/* ── styles the export carries ───────────────────────────────────────────── */

/**
 * Emitted only when a chart has annotations, so the charts that do not use
 * them pay nothing for the feature.
 *
 * Literal colours rather than the studio's tokens: this lands in somebody
 * else's stylesheet, where none of them exist. `--oc-annot-color` is set per
 * annotation and falls back to the ink of whichever scheme is showing.
 */
export const ANNOTATION_CSS = `.oc-annots {
  position: absolute;
  inset: 0;
  pointer-events: none;
  font-family: 'IBM Plex Sans', system-ui, sans-serif;
}

.oc-annot-leads { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.oc-annot-leads line { stroke: var(--oc-annot-color, #475569); stroke-width: 1.25; stroke-dasharray: 3 3; }

.oc-annot-line { position: absolute; }
.oc-annot-line.is-up { left: 0; right: 0; border-top: 1.5px dashed var(--oc-annot-color, #475569); }
.oc-annot-line.is-across { top: 0; bottom: 0; border-left: 1.5px dashed var(--oc-annot-color, #475569); }

.oc-annot-band { position: absolute; background: var(--oc-annot-color, #15803d); opacity: .09; }
.oc-annot-band.is-up { left: 0; right: 0; }
.oc-annot-band.is-across { top: 0; bottom: 0; }

/* Edge handles are a studio affordance. In an export they have no size, or a
   stray 12px strip would be a mark over the plate the chart never asked for. */
.oc-annot-edge { position: absolute; }

.oc-annot-head {
  position: absolute;
  width: 7px; height: 7px;
  margin: -3.5px 0 0 -3.5px;
  border-radius: 50%;
  background: var(--oc-annot-color, #475569);
}

.oc-annot-label {
  position: absolute;
  max-width: 45%;
  padding: 2px 6px;
  border-radius: 5px;
  font-size: 11.5px;
  line-height: 1.35;
  color: var(--oc-annot-color, #0f172a);
  background: rgba(255, 255, 255, .82);
  white-space: pre-line;
}

/* A note is placed by its centre, so the point it was dragged to is the point
   it sits on. Rules and bands hang their label off their own edge instead. */
.oc-annot-label.is-note { transform: translate(-50%, -50%); }
.oc-annot-label.on-up { right: 2px; transform: translateY(-100%); }
.oc-annot-label.on-across { top: 2px; transform: translateX(-50%); }
.oc-annot-label.on-band-across { top: 2px; transform: translateX(-50%); }
.oc-annot-label.on-band-up { left: 2px; transform: translateY(-50%); }

@media (prefers-color-scheme: dark) {
  .oc-annot-leads line { stroke: var(--oc-annot-color, #cbd5e1); }
  .oc-annot-line.is-up { border-top-color: var(--oc-annot-color, #cbd5e1); }
  .oc-annot-line.is-across { border-left-color: var(--oc-annot-color, #cbd5e1); }
  .oc-annot-band { opacity: .16; }
  .oc-annot-head { background: var(--oc-annot-color, #cbd5e1); }
  .oc-annot-label { color: var(--oc-annot-color, #f8fafc); background: rgba(22, 22, 29, .8); }
}`;

/* ── the words, for a reader who cannot see any of it ────────────────────── */

const third = (n, low, mid, high) => (n < 0.34 ? low : n < 0.67 ? mid : high);

/** Where something sits, in the words somebody would use out loud. */
function whereIs(x, y) {
  const across = third(x, 'left', 'centre', 'right');
  const down = third(y, 'top', 'middle', 'bottom');
  if (across === 'centre' && down === 'middle') return 'in the middle';
  if (across === 'centre') return `at the ${down}`;
  if (down === 'middle') return `on the ${across}`;
  return `at the ${down} ${across}`;
}

const asPct = (n) => Math.round(Math.max(0, Math.min(1, Number(n) || 0)) * 100) + '%';

/**
 * Which plate this one is on, said out loud — and only when that is not the
 * default. A reader hearing "on every panel" about a chart with one panel would
 * be told about a feature rather than about the chart.
 */
const onWhich = (a) => {
  if (!a.panel) return '';
  return a.panel === PANEL_ALL ? ', on every panel' : `, on the ${a.panel} panel`;
};

/** One annotation as a phrase. */
export function describeAnnotation(a) {
  if (!a || !a.type) return '';
  const said = String(a.text || '').trim();
  const scope = onWhich(a);
  if (a.type === 'note') {
    return (said ? `“${said}” ${whereIs(a.x, a.y)}` : `an unlabelled marker ${whereIs(a.x, a.y)}`) + scope;
  }
  if (a.type === 'line') {
    const where = a.axis === 'x' ? `${asPct(a.at)} across` : `${asPct(1 - a.at)} up`;
    return (said ? `a line marked “${said}” ${where}` : `a line ${where}`) + scope;
  }
  const lo = Math.min(a.from, a.to);
  const hi = Math.max(a.from, a.to);
  const where = a.axis === 'x'
    ? `from ${asPct(lo)} to ${asPct(hi)} across`
    : `from ${asPct(1 - hi)} to ${asPct(1 - lo)} up`;
  return (said ? `a band marked “${said}” ${where}` : `a shaded band ${where}`) + scope;
}

/**
 * The sentence the accessible description carries.
 *
 * An annotation is the author saying what the chart is *for*, which makes it
 * the last thing that should be available only to people who can see it.
 * Positions are given as percentages of the plate because that is genuinely
 * all they are — saying a note sits "on the March bar" would claim a precision
 * this feature deliberately does not have.
 */
export function describeAnnotations(list) {
  const said = (list || []).map(describeAnnotation).filter(Boolean);
  if (!said.length) return '';
  const head = said.length === 1 ? 'One note is marked on it' : `${said.length} notes are marked on it`;
  return `${head}: ${said.join('; ')}.`;
}

/* ── dragging, which never leaves the studio ─────────────────────────────── */

/**
 * Make the overlay in `box` draggable.
 *
 * Position is the one thing not edited in the sidebar, on purpose: a note goes
 * where it looks right, and two number fields are a worse way to find that
 * than moving it and looking. Motion starts where the user acted.
 *
 * **Bound to the plate, not to the layer.** A D3 mount clears its host on
 * every redraw and the drag itself repaints on every frame, so a listener on
 * the overlay would be thrown away by the first thing that moved. The plate
 * outlives both. What the layer carries instead is nothing at all: the studio
 * stylesheet is what makes an annotation grabbable, which is also why an
 * export — where that stylesheet does not exist — cannot be dragged.
 *
 * The move listeners live on `window` for the length of one drag and are
 * removed by the same function that added them — the discipline five leaking
 * maps taught this codebase, and which the suite counts.
 *
 * @param {HTMLElement} box    the plate the overlay is painted over
 * @param {Array} list         the live annotations, edited in place
 * @param {Function} onCommit  called once the drag ends
 * @returns {Function} tear-down, for when the chart is rebuilt under it
 */
export function attachAnnotationDrag(box, list, onCommit) {
  if (!box) return () => {};
  let frame = 0;

  const onDown = (e) => {
    const node = e.target && e.target.closest ? e.target.closest('[data-annot]') : null;
    if (!node) return;
    // A faceted chart nests plates inside the grid, so a press on a panel's note
    // bubbles to the grid's handler as well as the panel's. `data-annot` is an
    // index into whichever list painted that layer — so answering for a layer
    // this box did not paint would drag the wrong annotation, against the wrong
    // rectangle. Each handler takes only its own overlay.
    const layer = node.closest('.oc-annots');
    if (!layer || layer.parentElement !== box) return;
    const a = list[Number(node.dataset.annot)];
    if (!a) return;
    const part = node.dataset.part;
    const rect = box.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    e.preventDefault();
    box.classList.add('is-annot-dragging');

    const start = { x: e.clientX, y: e.clientY };
    const from = JSON.parse(JSON.stringify(a));

    const repaint = () => {
      // One write per frame: a pointer outruns the display, and repainting on
      // every event lays the page out several times over for a position nobody
      // asked to be that precise.
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        drawAnnotations(box, list);
      });
    };

    const onMove = (ev) => {
      const dx = (ev.clientX - start.x) / rect.width;
      const dy = (ev.clientY - start.y) / rect.height;

      if (a.type === 'note') {
        if (part === 'arrow') {
          a.arrow = { x: clamp01(from.arrow.x + dx), y: clamp01(from.arrow.y + dy) };
        } else {
          // The arrow points at something. Moving the label must not drag the
          // thing it is pointing at along with it.
          a.x = clamp01(from.x + dx);
          a.y = clamp01(from.y + dy);
        }
      } else if (a.type === 'line') {
        a.at = clamp01(from.at + (a.axis === 'x' ? dx : dy));
      } else {
        const d = a.axis === 'x' ? dx : dy;
        if (part === 'from' || part === 'to') a[part] = clamp01(from[part] + d);
        else { a.from = clamp01(from.from + d); a.to = clamp01(from.to + d); }
      }
      repaint();
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      box.classList.remove('is-annot-dragging');
      drawAnnotations(box, list);
      if (typeof onCommit === 'function') onCommit();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  box.addEventListener('pointerdown', onDown);
  return () => {
    box.removeEventListener('pointerdown', onDown);
    box.classList.remove('is-annot-dragging');
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
  };
}

/**
 * Bind the drag everywhere this chart painted notes — one plate, or a grid and
 * every panel in it.
 *
 * A faceted chart has as many overlays as it has scopes, and each one measures
 * against its *own* box: a note two-thirds across a panel is not two-thirds
 * across the grid. So there is a binding per plate rather than one on the grid,
 * and each is handed the same slice of the array that painted it — the same
 * objects, so a drag writes straight through to `spec.annotations`.
 *
 * @returns {Function} one tear-down for all of them
 */
export function attachAnnotationDrags(host, all, onCommit) {
  const stops = [];
  const grid = host && host.querySelector(':scope > .oc-facets');

  if (!grid) {
    stops.push(attachAnnotationDrag(plateOf(host), all || [], onCommit));
  } else {
    stops.push(attachAnnotationDrag(grid, gridAnnotations(all), onCommit));
    grid.querySelectorAll(':scope > .oc-facet').forEach((facet) => {
      const plate = facet.querySelector('.oc-facet-plate');
      if (!plate) return;
      const label = facet.querySelector('.oc-facet-name');
      const mine = panelAnnotations(all, label ? label.textContent : '');
      if (mine.length) stops.push(attachAnnotationDrag(plateOf(plate), mine, onCommit));
    });
  }

  return () => stops.forEach((stop) => stop());
}
