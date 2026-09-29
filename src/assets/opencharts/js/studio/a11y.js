/**
 * a11y.js — the part of a chart somebody can use without seeing it.
 *
 * Every chart here draws to a canvas or an SVG, and both are opaque to a
 * screen reader: a `<canvas>` is a rectangle of pixels with nothing inside it
 * to read, and an SVG full of `<path>` elements is barely better. Until now
 * the studio exported charts that were, to a blind reader, a blank box — and
 * it exported them into other people's sites, which makes it a defect in the
 * product's own output rather than a missing nicety.
 *
 * The fix is the one Highcharts settled on and the one this codebase was
 * already holding the pieces for: **give the chart a text description and put
 * the real numbers in a table.** Keyboard-navigating individual data points is
 * the other half of what Highcharts does, and it is not attempted here — a
 * canvas has no per-point DOM to focus, and building a parallel one for 114
 * charts would be a second renderer to keep in step. A table is the honest
 * answer for a library this shape, and it is the fallback Highcharts itself
 * offers.
 *
 * **Nothing here is written per chart.** The description is assembled from
 * `title`, `blurb`, the `read` line in `chart-help.js` and the shape of the
 * data; the table is `def.toText(spec)`, which the suite already holds to a
 * round trip. A chart that gains a good `toText` gains a good table for free,
 * and one with a broken `toText` shows up here before it shows up anywhere
 * else — the same bargain the AI prompt makes.
 */

import { helpFor } from './chart-help.js';
import { parseTable, looksNumeric } from './dataio.js';
import { describeAnnotations } from './annotate.js';
import { facetSource, describeFacet } from './facet.js';
import { describeCaption, captionOf } from './caption.js';
import { describeReferences } from './reference.js';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * The chart's data as a table.
 *
 * `toText` writes a header row — every `example` in `data-schemas.js` has one,
 * and `applyData` reads them back — so the header is asserted rather than
 * guessed. `parseTable` takes `true` from a caller that knows, precisely so a
 * table whose headings are years (`label, 2023, 2024`) is not mistaken for
 * data, which is the bug that once made seventeen charts eat their own header.
 *
 * @returns {{headers: string[], rows: string[][]} | null}
 */
export function chartTable(def, spec) {
  // A chart split by a column has that column in the facet, not in the spec —
  // the panels carry a table each with the splitting column already spent. So
  // the table a reader is given is the source, which is the only version that
  // still says which panel a row belongs to. Take it away and the accessible
  // layer describes a grid with no way to tell its panels apart.
  const source = facetSource(spec);
  if (source && source.rows && source.rows.length) {
    return { headers: source.headers || [], rows: source.rows };
  }

  if (typeof def.toText !== 'function') return null;
  let text = '';
  try {
    text = def.toText(spec) || '';
  } catch {
    return null;
  }
  if (!text.trim()) return null;
  try {
    const t = parseTable(text, true);
    if (!t || !t.rows || !t.rows.length) return null;
    return { headers: t.headers || [], rows: t.rows };
  } catch {
    return null;
  }
}

/** The numeric span of a table, for the one sentence that says how big things get. */
function range(table) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const row of table.rows) {
    for (const cell of row) {
      if (!looksNumeric(cell)) continue;
      const n = Number(String(cell).replace(/[\s,]/g, ''));
      if (!Number.isFinite(n)) continue;
      if (n < lo) lo = n;
      if (n > hi) hi = n;
    }
  }
  return Number.isFinite(lo) && Number.isFinite(hi) ? { lo, hi } : null;
}

const num = (n) => (Math.abs(n) >= 1000 ? n.toLocaleString('en-US') : String(n));

/**
 * What this chart is, what it holds, and how to read it — as plain sentences.
 *
 * Read out before the table, so somebody arriving on it knows what they are
 * about to hear rather than being handed forty numbers cold. The `read` line
 * is included because it is the one part of the help text that describes the
 * *encoding* — which is exactly what a reader who cannot see the encoding is
 * missing.
 *
 * @returns {string} plain text, no markup
 */
export function chartSummary(def, spec) {
  const parts = [];
  // The author's own headline first, where there is one: it is what the
  // chart claims, and a reader who cannot see the picture should hear the
  // claim before the kind of picture making it.
  const said = describeCaption(spec);
  if (said.lead) parts.push(said.lead);
  parts.push(`${def.title}.`);
  if (def.blurb) parts.push(def.blurb.trim().replace(/\.?$/, '.'));

  const table = chartTable(def, spec);
  if (table) {
    const cols = table.headers.length || (table.rows[0] || []).length;
    const rows = table.rows.length;
    parts.push(`${rows} row${rows === 1 ? '' : 's'} across ${cols} column${cols === 1 ? '' : 's'}.`);
    if (table.headers.length) parts.push(`Columns: ${table.headers.join(', ')}.`);
    const span = range(table);
    // A single repeated value is not a range, and saying "from 5 to 5" reads
    // as a rounding error rather than a fact.
    if (span && span.lo !== span.hi) parts.push(`Values run from ${num(span.lo)} to ${num(span.hi)}.`);
  }

  const help = helpFor(def);
  if (help && help.read) parts.push(help.read.trim());

  // What the grid is, and — the part that matters — whether the panels can be
  // compared by height. A reader who cannot see the axes has no other way to
  // find that out, and a grid of small multiples that is not on one scale is
  // exactly the thing that would mislead them.
  const grid = describeFacet(def, spec);
  if (grid) parts.push(grid);

  // Whatever the author wrote on the chart. An annotation is them saying what
  // the picture is *for*, which makes it the last thing that should be
  // available only to the people who can see it.
  const marked = describeAnnotations(spec && spec.annotations);
  if (marked) parts.push(marked);
  // A dashed line at the mean is a number the author put on the chart; the
  // number itself is what a reader who cannot see the line is owed.
  const ruled = describeReferences(def, spec);
  if (ruled) parts.push(ruled);
  if (said.tail) parts.push(said.tail);

  parts.push('The underlying data follows as a table.');
  return parts.join(' ');
}

/**
 * A short accessible name — what a screen reader announces on arrival.
 * The long form is the description; this is the label.
 */
export function chartLabel(def, spec) {
  const table = chartTable(def, spec);
  const size = table ? `, ${table.rows.length} rows` : '';
  const c = captionOf(spec);
  return c && c.title ? `${c.title} — ${def.title} chart${size}` : `${def.title} chart${size}`;
}

/**
 * The data table as markup.
 *
 * Deliberately not truncated. The prompt cuts its table because the full data
 * is in the template beside it; here the table *is* the data, and trimming it
 * would hide rows from exactly the readers who have no other way to reach
 * them. The largest chart in the library carries a few hundred rows, which is
 * smaller than the JavaScript already being emitted next to it.
 *
 * @param {object} opts
 * @param {boolean} [opts.open]     render expanded
 * @param {string}  [opts.summary]  the disclosure label
 */
export function tableMarkup(def, spec, opts = {}) {
  const table = chartTable(def, spec);
  if (!table) return '';

  const head = table.headers.length
    ? `<thead><tr>${table.headers.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>`
    : '';

  // First cell of each row is the row's own header: it is the label column for
  // every shape in the library, and marking it up says so to a screen reader
  // navigating cell by cell.
  const body = table.rows.map((r) => {
    const cells = r.map((c, i) => (i === 0
      ? `<th scope="row">${esc(c)}</th>`
      : `<td>${esc(c)}</td>`));
    return `<tr>${cells.join('')}</tr>`;
  }).join('');

  const label = opts.summary || 'View the data as a table';
  return [
    `<details class="chart-data"${opts.open ? ' open' : ''}>`,
    `  <summary>${esc(label)}</summary>`,
    `  <div class="chart-data-scroll">`,
    `    <table>`,
    `      <caption>${esc(def.title)} — the numbers behind the chart</caption>`,
    head ? `      ${head}` : null,
    `      <tbody>${body}</tbody>`,
    `    </table>`,
    `  </div>`,
    `</details>`,
  ].filter((l) => l !== null).join('\n');
}

/**
 * Styles the accessible layer needs, emitted with every export.
 *
 * `.visually-hidden` is the standard clip-rect recipe rather than
 * `display: none` or `visibility: hidden`, both of which take the text out of
 * the accessibility tree along with the layout — which would defeat the entire
 * point of writing it.
 */
export const A11Y_CSS = `.visually-hidden {
  position: absolute;
  width: 1px; height: 1px;
  margin: -1px; padding: 0; border: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.chart-data { margin-top: 14px; font-size: 13px; }
.chart-data > summary {
  cursor: pointer;
  color: #475569;
  padding: 4px 2px;
  border-radius: 4px;
}
.chart-data > summary:focus-visible { outline: 2px solid #15803d; outline-offset: 2px; }
/* Wide tables scroll in their own box; the page must never scroll sideways. */
.chart-data-scroll { overflow-x: auto; margin-top: 8px; }
.chart-data table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
.chart-data caption { text-align: left; padding-bottom: 6px; color: #5c6b80; font-size: 12px; }
.chart-data th, .chart-data td {
  padding: 4px 10px 4px 0;
  text-align: left;
  border-bottom: 1px solid rgba(128,128,128,.22);
  white-space: nowrap;
}
.chart-data td { font-variant-numeric: tabular-nums; }
@media (prefers-color-scheme: dark) {
  .chart-data > summary { color: #cbd5e1; }
  .chart-data caption { color: #6f6d69; }
}`;
