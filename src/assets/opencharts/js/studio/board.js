/**
 * board.js — several saved charts on one page.
 *
 * Not a dashboard. A dashboard is a set of charts wired to each other: click a
 * region and every other chart filters to it, which needs one query engine, one
 * data model and one runtime holding them all. This library's hard rule is that
 * **a renderer reads its data from the spec and nothing else**, and a board
 * keeps it: each card is a complete `{ chart, spec }` off the shelf, rendered
 * by the same `renderChart` the studio uses, and exportable on its own. Nothing
 * on a board can change anything else on it. That is a smaller promise, and it
 * is one the export can keep — a board's standalone file is N independent
 * charts in one page, not a page that needs a server to mean anything.
 *
 * This module is the model and the exporter, with no page in it: the state a
 * board is, and the one HTML file it becomes. `BoardApp.js` is the page.
 *
 * ── Putting N exports in one document ──────────────────────────────────────
 *
 * Each chart's export owns its document. It says `id="chart"`, it styles
 * `#chart` and `.chart-wrap`, and its script looks up `document.getElementById`
 * — all of which is correct for one chart in one file and collides the moment
 * there are three. Three substitutions make them co-exist, and between them
 * they leave every renderer's own code untouched, which is the point:
 *
 * - **Ids are prefixed per card** (`chart` → `c1-chart`), in the markup and in
 *   the `aria-describedby` that points at it, so the document stays valid.
 * - **CSS is prefixed and then scoped** to the card's own box, so one chart's
 *   `#chart { min-height: 420px }` or its own `def.css` cannot reach another's.
 * - **The script is handed a `document` that can only see its card.** A Proxy
 *   resolves `getElementById(id)` as `#<prefix><id>` inside the card and scopes
 *   `querySelector` to it. That is what lets the generated JS stay *verbatim*,
 *   including the lookups it computes at runtime (`'chart-' + i` on a faceted
 *   card) and the class selectors it uses for the annotation overlay and the
 *   facet grid, neither of which a textual rewrite could have found.
 *
 * The one place the proxy cannot reach is the custom engine, whose chart class
 * takes an id *string* and looks it up itself, inside the library. There the
 * constructor's argument is turned into the element — `BaseChart` accepts one —
 * so the lookup happens in the card's own `document` after all.
 */

import { generateCode, safeForInlineScript } from './engines.js';
import { dependenciesFor, scriptsOnly, scriptTag, describe } from './cdn.js';

export const BOARD_KEY = 'opencharts.board';

/** Four across is where a panel stops being readable — the facet grid's rule. */
export const MAX_COLS = 4;

/** More than this on one page is a report, and a report is a different thing. */
export const BOARD_LIMIT = 24;

export function emptyBoard() {
  return { title: '', byline: '', cols: 2, items: [] };
}

/**
 * A board out of storage or a link, made safe.
 *
 * Anything can happen to storage between a write and a read, and a link is
 * whatever somebody pasted — so every field is taken only when it is the shape
 * it should be, and a row that is not an item is dropped rather than fatal.
 * The same rule `shelf.js` follows for the same reason.
 */
export function normaliseBoard(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyBoard();
  const items = Array.isArray(raw.items) ? raw.items : [];
  return {
    title: typeof raw.title === 'string' ? raw.title : '',
    byline: typeof raw.byline === 'string' ? raw.byline : '',
    cols: Math.min(MAX_COLS, Math.max(1, Math.round(Number(raw.cols)) || 2)),
    items: items
      .map((it) => (it && typeof it.shelfId === 'string' && it.shelfId ? { shelfId: it.shelfId } : null))
      .filter(Boolean)
      .slice(0, BOARD_LIMIT),
  };
}

export function readBoard() {
  let raw = null;
  try { raw = localStorage.getItem(BOARD_KEY); } catch { return emptyBoard(); }
  if (!raw) return emptyBoard();
  try { return normaliseBoard(JSON.parse(raw)); } catch { return emptyBoard(); }
}

export function writeBoard(state) {
  try {
    localStorage.setItem(BOARD_KEY, JSON.stringify(normaliseBoard(state)));
    return true;
  } catch {
    return false;
  }
}

export function clearBoard() {
  try { localStorage.removeItem(BOARD_KEY); } catch { /* not fatal */ }
}

/* ── making N exports share one document ─────────────────────────────────── */

const ID_ATTR = /\bid="([^"]*)"/g;
const ID_REFS = /\b(aria-describedby|aria-labelledby|headers|for)="([^"]*)"/g;

/**
 * Prefix every id in a fragment, and every attribute that points at one.
 *
 * The ids are collected from the markup rather than listed here, so a chart
 * that starts emitting another one is carried without this file learning
 * about it.
 */
function prefixIds(html, prefix) {
  const ids = new Set();
  const marked = html.replace(ID_ATTR, (m, id) => {
    ids.add(id);
    return `id="${prefix}${id}"`;
  });
  const linked = marked.replace(ID_REFS, (m, attr, value) => {
    const mapped = value.split(/\s+/)
      .map((token) => (ids.has(token) ? prefix + token : token))
      .join(' ');
    return `${attr}="${mapped}"`;
  });
  return { html: linked, ids };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The same rename, in the stylesheet that selects those ids. */
function prefixCssIds(css, ids, prefix) {
  const list = [...ids].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!list.length) return css;
  const re = new RegExp(`#(${list.map(escapeRe).join('|')})(?![\\w-])`, 'g');
  return css.replace(re, (m, id) => `#${prefix}${id}`);
}

/** Commas that separate selectors, not commas inside `:is(…)`. */
function splitSelectors(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  parts.push(current);
  return parts;
}

function matchBrace(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') { depth--; if (depth === 0) return i; }
  }
  return css.length;
}

/**
 * `html`, `body` and `:root` name the whole page in a one-chart export. On a
 * board that page is the card, so that is what they become — dropping them
 * would lose the white ground every export draws on.
 */
function scopeSelector(selector, scope) {
  const s = selector.trim();
  if (!s) return s;
  if (/^(html|body|:root)$/i.test(s)) return scope;
  return `${scope} ${s}`;
}

/**
 * Put every rule in `css` behind `scope`.
 *
 * `@media`, `@supports` and `@container` hold rules, so they are recursed
 * into; `@keyframes` and `@font-face` do not, so their bodies are left exactly
 * as they were. Braces inside strings would fool the brace matcher — nothing
 * this project emits has any, and a stylesheet arriving here is always one
 * `buildCSS` wrote.
 */
export function scopeCss(css, scope) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2);
      const stop = end < 0 ? css.length : end + 2;
      out += css.slice(i, stop);
      i = stop;
      continue;
    }
    if (/\s/.test(css[i])) { out += css[i]; i++; continue; }

    const open = css.indexOf('{', i);
    if (open < 0) { out += css.slice(i); break; }
    const prelude = css.slice(i, open);
    const close = matchBrace(css, open);
    const body = css.slice(open + 1, close);

    if (/^\s*@/.test(prelude)) {
      const name = (prelude.match(/^\s*@([\w-]+)/) || [])[1] || '';
      out += /^(media|supports|container|layer|scope)$/i.test(name)
        ? `${prelude}{${scopeCss(body, scope)}}`
        : `${prelude}{${body}}`;
    } else {
      out += `${splitSelectors(prelude).map((s) => scopeSelector(s, scope)).join(', ')} {${body}}`;
    }
    i = close + 1;
  }
  return out;
}

/** Module imports have to sit at the top of their script, not inside an IIFE. */
function hoistImports(js) {
  const imports = [];
  const body = js.split('\n').filter((line) => {
    if (/^import\s[^;]*;\s*$/.test(line)) { imports.push(line.trim()); return false; }
    return true;
  }).join('\n');
  return { imports, body };
}

/**
 * `new BarChart('chart', …)` hands an id to the custom engine, which resolves
 * it against the real document — the one place the scoped `document` cannot
 * reach, because the lookup happens inside the library. `BaseChart` takes a
 * canvas element too, so the id becomes the element and the lookup comes back
 * under the card.
 */
function elementiseTarget(js, ids) {
  return js.replace(/\bnew\s+([A-Z][\w$]*)\(\s*'([^']+)'\s*,/g, (m, cls, id) =>
    (ids.has(id) ? `new ${cls}(document.getElementById('${id}'), ` : m));
}

const SCOPE_RUNTIME = [
  '/**',
  ' * Each card below runs the code the studio exports for that chart, exactly',
  ' * as it exports it. The one substitution is this: a `document` that can only',
  ' * see that card, so three charts can all look up "chart" and each find its',
  ' * own. Ids are prefixed in the markup; this puts the prefix back on.',
  ' */',
  'function ocScope(cardId, prefix) {',
  '  const root = document.getElementById(cardId);',
  '  return new Proxy(document, {',
  '    get(target, prop) {',
  '      if (prop === \'getElementById\') return (id) => root.querySelector(\'#\' + prefix + id);',
  '      if (prop === \'querySelector\') return (sel) => root.querySelector(sel);',
  '      if (prop === \'querySelectorAll\') return (sel) => root.querySelectorAll(sel);',
  '      const value = Reflect.get(target, prop);',
  '      return typeof value === \'function\' ? value.bind(target) : value;',
  '    },',
  '  });',
  '}',
].join('\n');

const BOARD_CSS = [
  'body {',
  '  margin: 0;',
  '  padding: 32px;',
  '  background: #f6f6f4;',
  '  color: #0f172a;',
  '  font-family: \'IBM Plex Sans\', system-ui, sans-serif;',
  '}',
  '',
  '.oc-board {',
  '  max-width: 1400px;',
  '  margin: 0 auto;',
  '}',
  '',
  '.oc-board-head { margin: 0 0 22px; }',
  '.oc-board-title { margin: 0; font-size: 26px; font-weight: 600; letter-spacing: -.01em; }',
  '.oc-board-byline { margin: 6px 0 0; font-size: 13.5px; color: #475569; }',
  '',
  '.oc-board-grid {',
  '  display: grid;',
  '  grid-template-columns: repeat(var(--oc-board-cols, 2), minmax(0, 1fr));',
  '  gap: 22px;',
  '  align-items: start;',
  '}',
  '',
  '.oc-board-card { min-width: 0; }',
  '',
  '@media (max-width: 760px) {',
  '  body { padding: 18px; }',
  '  .oc-board-grid { grid-template-columns: minmax(0, 1fr); }',
  '}',
].join('\n');

const escapeText = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * A board as one HTML file.
 *
 * @param {Array<{ def: object, spec: object, name?: string }>} cards
 * @param {{ title?: string, byline?: string, cols?: number }} [meta]
 * @returns {{ html: string, charts: number, skipped: string[], libraries: object[] }}
 */
export function boardStandalone(cards, meta = {}) {
  const libraries = new Map();
  const styles = [];
  const markup = [];
  const scripts = [];
  const skipped = [];
  let drawn = 0;

  cards.forEach((card) => {
    const code = generateCode(card.def, card.spec);
    // A chart whose code generation failed emits a comment where its markup
    // should be. Putting that on a board would be a blank box with nothing
    // saying why, so it is left out and named instead.
    if (!code.html || /^\/\* Code generation failed/.test(code.html)) {
      skipped.push(card.def.id);
      return;
    }
    const i = drawn++;
    const prefix = `c${i}-`;
    const cardId = `${prefix}card`;

    const { html, ids } = prefixIds(code.html, prefix);
    styles.push(`/* ${card.def.title} */\n` + scopeCss(prefixCssIds(code.css, ids, prefix), `#${cardId}`));
    scriptsOnly(dependenciesFor(card.def)).forEach((lib) => {
      if (!libraries.has(lib.key)) libraries.set(lib.key, lib);
    });

    const isModule = !!card.def.native;
    const { imports, body } = hoistImports(isModule ? elementiseTarget(code.js, ids) : code.js);
    scripts.push([
      isModule ? '<script type="module">' : '<script>',
      ...imports,
      `(function (document) {`,
      safeForInlineScript(body),
      `}(ocScope('${cardId}', '${prefix}')));`,
      '</script>',
    ].join('\n'));

    markup.push(
      `<section class="oc-board-card" id="${cardId}"`
      + (card.name ? ` aria-label="${escapeText(card.name)}"` : '') + '>\n'
      + html + '\n</section>',
    );
  });

  const libs = [...libraries.values()];
  const cols = Math.min(MAX_COLS, Math.max(1, Math.round(Number(meta.cols)) || 2));
  const head = [];
  if (meta.title) head.push(`  <h1 class="oc-board-title">${escapeText(meta.title)}</h1>`);
  if (meta.byline) head.push(`  <p class="oc-board-byline">${escapeText(meta.byline)}</p>`);

  const html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeText(meta.title || 'OpenCharts board')}</title>`,
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">',
    // One tag per library however many cards want it — the whole reason the
    // board assembles the parts rather than concatenating whole pages.
    ...(libs.length
      ? ['<!-- Libraries these charts need, in load order -->',
        ...libs.flatMap((lib) => [`<!-- ${describe(lib)} · ${lib.homepage} -->`, scriptTag(lib)])]
      : ['<!-- No charting library needed — every chart here draws itself. -->']),
    '<style>',
    BOARD_CSS,
    '',
    ...styles,
    '</style>',
    '</head>',
    '<body>',
    '',
    '<div class="oc-board">',
    ...(head.length ? ['<header class="oc-board-head">', ...head, '</header>'] : []),
    `<div class="oc-board-grid" style="--oc-board-cols:${cols}">`,
    ...markup,
    '</div>',
    '</div>',
    '',
    '<script>',
    SCOPE_RUNTIME,
    '</script>',
    '',
    ...scripts,
    '',
    '</body>',
    '</html>',
  ].join('\n');

  return { html, charts: drawn, skipped, libraries: libs };
}
