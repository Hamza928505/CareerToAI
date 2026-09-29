/**
 * reference.js — a line at a value: the mean, a target, a moving average, a trend.
 *
 * Annotations are a fraction of the plate, which is what let all 115 charts
 * have them at once — and why "a line at the average" was impossible: the
 * overlay knows where 42% down is and has no idea what 612 is. Every renderer
 * computes its scales privately, inside the very function that gets
 * serialised, so nothing outside can ask where a value falls.
 *
 * Chart.js is the exception, and it is the same exception `facet.js` found:
 * `build()` returns a config, and a config is data. A reference line can be
 * one more dataset — a dashed line whose every point is the mean — computed
 * from the spec at build time and emitted as literals, and the axis places it
 * exactly where the value is because the axis is placing everything else too.
 *
 * So this is for the Chart.js cartesian charts that carry the shared axis
 * block, and for nothing else. The 76 charts on the other renderers do not
 * get it, and the control does not appear on them rather than appearing and
 * doing nothing. Saying that plainly is better than a line that is nearly
 * where the value is.
 *
 * Five kinds:
 *   mean, median   — across every series, or one
 *   target         — a value the reader typed
 *   moving         — a moving average of one series, over a window
 *   trend          — a least-squares straight line through one series
 *
 * The first three are one flat line; the last two follow the data and are
 * drawn per series in that series' colour, dashed. Every computed number is
 * also said in words, through `describeReferences`, so a reader who cannot
 * see the dashed line still learns what the mean was.
 */

import { PALETTE } from './palette.js';
import { parseTable, looksNumeric } from './dataio.js';
import { toNumber } from './transform.js';

export const REFERENCE_KINDS = [
  { kind: 'mean', label: 'Mean', glyph: 'x̄', hint: 'A dashed line at the average of the values.' },
  { kind: 'median', label: 'Median', glyph: '⌶', hint: 'A dashed line at the middle value.' },
  { kind: 'target', label: 'Target', glyph: '◎', hint: 'A dashed line at a value you set.' },
  { kind: 'moving', label: 'Moving avg', glyph: '∿', hint: 'A smoothed line: each point averages the last few.' },
  { kind: 'trend', label: 'Trend', glyph: '⟋', hint: 'A straight line fitted through the points.' },
];

/**
 * The control, for the charts that can carry it. Not attached by the
 * registry to every chart, unlike annotations: this one computes numbers
 * from the data and places them on the axis, which only a Chart.js config
 * can be asked to do.
 */
export const REFERENCE_CONTROL = {
  group: 'Reference lines',
  type: 'references',
  key: 'references',
  label: 'Lines at a value',
};

export const ALL_SERIES = 'all';

/** A fresh reference of `kind`. */
export function newReference(kind, seriesCount = 1) {
  const base = { kind, series: ALL_SERIES, color: '' };
  if (kind === 'target') return { ...base, value: 0 };
  if (kind === 'moving') return { ...base, series: 0, window: 3 };
  if (kind === 'trend') return { ...base, series: seriesCount > 1 ? 0 : 0 };
  return base;
}

export const hasReferences = (spec) => Array.isArray(spec && spec.references) && spec.references.length > 0;

/* ── arithmetic ─────────────────────────────────────────────────────────── */

const nums = (arr) => (arr || []).map((v) => (typeof v === 'number' ? v : toNumber(v))).filter(Number.isFinite);
const round = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : n);

export function meanOf(values) {
  const v = nums(values);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
}

export function medianOf(values) {
  const v = nums(values).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** A moving average: null where the window has not filled yet. */
export function movingAverage(values, window) {
  const w = Math.max(2, Math.min(values.length, Math.round(window) || 3));
  return values.map((_, i) => {
    if (i < w - 1) return null;
    const slice = nums(values.slice(i - w + 1, i + 1));
    return slice.length === w ? round(slice.reduce((a, b) => a + b, 0) / w) : null;
  });
}

/** A least-squares line through the values, evaluated at each index. */
export function trendLine(values) {
  const pts = values.map((v, i) => [i, typeof v === 'number' ? v : toNumber(v)]).filter((p) => Number.isFinite(p[1]));
  if (pts.length < 2) return values.map(() => null);
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  let num = 0;
  let den = 0;
  for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
  const slope = den ? num / den : 0;
  const intercept = my - slope * mx;
  return values.map((_, i) => round(intercept + slope * i));
}

/* ── datasets ───────────────────────────────────────────────────────────── */

/**
 * The extra datasets a spec's references ask for.
 *
 * @param {object} spec                  the spec being built
 * @param {Array<{label:string, color:string, data:number[]}>} series
 *                                       what the chart is plotting
 * @param {{ count: number }} [opts]     how many points a flat line spans
 * @returns {object[]} Chart.js datasets, all `type: 'line'`, dashed, unfilled
 */
export function referenceDatasets(spec, series, opts = {}) {
  if (!hasReferences(spec) || !series.length) return [];
  const count = opts.count || Math.max(...series.map((s) => (s.data || []).length), 0);
  const out = [];

  spec.references.forEach((ref, i) => {
    const colour = ref.color || PALETTE[6];
    const dash = ref.kind === 'target' ? [2, 4] : [6, 4];
    const flat = (value, label, tint) => {
      if (!Number.isFinite(value)) return;
      out.push({
        type: 'line',
        label,
        data: new Array(count).fill(round(value)),
        borderColor: tint,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: dash,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        tension: 0,
        order: -1 - i,
        ocReference: true,
      });
    };
    const follow = (data, label, tint) => {
      out.push({
        type: 'line',
        label,
        data,
        borderColor: tint,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: dash,
        pointRadius: 0,
        pointHoverRadius: 3,
        fill: false,
        tension: 0,
        spanGaps: false,
        order: -1 - i,
        ocReference: true,
      });
    };
    const pick = ref.series === ALL_SERIES || ref.series == null
      ? null
      : series[Number(ref.series)] || null;

    if (ref.kind === 'target') {
      flat(Number(ref.value), `Target ${round(Number(ref.value))}`, colour);
    } else if (ref.kind === 'mean' || ref.kind === 'median') {
      const fn = ref.kind === 'mean' ? meanOf : medianOf;
      const word = ref.kind === 'mean' ? 'Mean' : 'Median';
      if (pick) flat(fn(pick.data), `${word} of ${pick.label} ${round(fn(pick.data))}`, ref.color || pick.color);
      else {
        const all = series.flatMap((s) => s.data || []);
        flat(fn(all), `${word} ${round(fn(all))}`, colour);
      }
    } else if (ref.kind === 'moving' || ref.kind === 'trend') {
      const targets = pick ? [pick] : series;
      targets.forEach((s) => {
        const data = ref.kind === 'moving' ? movingAverage(s.data || [], ref.window) : trendLine(s.data || []);
        const label = ref.kind === 'moving'
          ? `${s.label} — ${Math.max(2, Math.round(ref.window) || 3)}-point average`
          : `${s.label} — trend`;
        follow(data, label, ref.color || s.color);
      });
    }
  });
  return out;
}

/** Legend entries for the reference lines, never toggleable — they are not data. */
export function referenceLegend(spec, series) {
  return referenceDatasets(spec, series).map((d) => ({ label: d.label, color: d.borderColor, line: true, toggleable: false }));
}

/* ── words ──────────────────────────────────────────────────────────────── */

/**
 * The series a chart is plotting, read back from the table it writes.
 *
 * For the accessible description, which has no `build()` to ask: the same
 * writer the suite holds to a round trip, so the numbers said are the numbers
 * drawn. Every column that is all numbers is a series, named by its heading.
 */
export function seriesFromTable(def, spec) {
  if (typeof def.toText !== 'function') return [];
  let table;
  try { table = parseTable(def.toText(spec), true); } catch { return []; }
  if (!table.rows.length) return [];
  const out = [];
  for (let c = 0; c < table.headers.length; c++) {
    const cells = table.rows.map((r) => r[c]);
    const filled = cells.filter((v) => v != null && String(v).trim() !== '');
    if (filled.length && filled.every((v) => looksNumeric(v))) {
      out.push({ label: table.headers[c] || `Column ${c + 1}`, color: '', data: cells.map((v) => toNumber(v)) });
    }
  }
  return out;
}

/** One sentence per reference line, with the number it landed on. */
export function describeReferences(def, spec) {
  if (!hasReferences(spec)) return '';
  const series = seriesFromTable(def, spec);
  if (!series.length) return '';
  const said = [];
  referenceDatasets(spec, series).forEach((d) => {
    if (/^Target/.test(d.label)) said.push(`A dotted line marks the target, ${d.label.replace(/^Target /, '')}.`);
    else if (/^(Mean|Median)/.test(d.label)) {
      const [, word, rest] = d.label.match(/^(Mean|Median)(.*)$/);
      const value = rest.trim().split(' ').pop();
      const of = rest.replace(/\s*[-\d.,]+$/, '').trim();
      said.push(`A dashed line marks the ${word.toLowerCase()}${of ? ` ${of}` : ''}, ${value}.`);
    } else if (/average$/.test(d.label)) {
      said.push(`A dashed line follows ${d.label.replace(' — ', "'s ")}.`);
    } else if (/trend$/.test(d.label)) {
      const first = d.data.find((v) => v != null);
      const last = [...d.data].reverse().find((v) => v != null);
      const dir = last > first ? 'rising' : last < first ? 'falling' : 'flat';
      said.push(`A dashed line shows ${d.label.replace(' — trend', "'s trend")}, ${dir} from ${first} to ${last}.`);
    }
  });
  return said.join(' ');
}
