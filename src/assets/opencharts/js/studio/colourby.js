/**
 * colourby.js — colour by value.
 *
 * "Bars above target green, below red" and "shade by size" are the two rules
 * everyone reaches for in a BI tool's conditional formatting. Here they are
 * an **edit**, the bargain `transform.js` makes: a rule runs once, in front of
 * the reader, and writes a colour per item into whatever array `paletteOf`
 * resolves. The export carries colours, not rules, and stays a renderer of
 * literal values; change the data later and the colours stay where they were,
 * which is why the rule is one click to run again rather than a layer.
 *
 * Two questions, answered here and nowhere else:
 *
 * - **Which value belongs to which colour?** `paletteOf` gives the colours
 *   and their names; the numbers come from `def.toText(spec)` — the writer the
 *   suite already holds to a round trip, so the only description of a chart's
 *   data guaranteed complete. When the palette has one colour per *row*, an
 *   item's value is a cell in its row; when it has one per value *column*, a
 *   series' value is that column's total. Where the count matches neither,
 *   no rule is offered — a rule on the wrong thing is worse than none.
 *
 * - **What colours may a ramp use?** Every step of every ramp clears WCAG's
 *   3:1 for a graphical object on white, because white is the ground the
 *   export draws on (`BASE_CSS` gives `.chart-card` `#ffffff`). That rules out
 *   the pale end a sequential ramp usually starts from, so these begin at a
 *   mid-tone and run to a dark one; the gradient is narrower and still reads.
 *   The suite checks every step of every ramp.
 */

import { PALETTE } from './palette.js';
import { parseTable, looksNumeric } from './dataio.js';
import { toNumber } from './transform.js';
import { paletteOf } from './cvd.js';

/* ── colour arithmetic ──────────────────────────────────────────────────── */

const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const rgbOf = (hex) => {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
};
const hexOf = (rgb) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0')).join('');

/** WCAG contrast of a colour against white. */
export function contrastOnWhite(hex) {
  const [r, g, b] = rgbOf(hex).map(toLinear);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (lum + 0.05);
}

/** A colour part-way between two, mixed in linear light so the middle is not muddy. */
export function mix(a, b, t) {
  const A = rgbOf(a).map(toLinear);
  const B = rgbOf(b).map(toLinear);
  const k = Math.max(0, Math.min(1, t));
  return hexOf(A.map((v, i) => toSrgb(v + (B[i] - v) * k)));
}

/**
 * The ramps a gradient can use. Each is stops from low to high; a sequential
 * ramp runs mid to dark in one hue, a diverging one runs through a slate
 * midpoint so the middle reads as "neither". Every stop clears 3:1 on white
 * and so does every colour between them — checked, not assumed.
 */
export const RAMPS = [
  { id: 'green', label: 'Green, light to dark', kind: 'sequential', stops: ['#46a05c', '#2e8d44', '#123d1c'] },
  { id: 'blue', label: 'Blue, light to dark', kind: 'sequential', stops: ['#4a8fdb', '#2167b9', '#0f2f5a'] },
  { id: 'amber', label: 'Amber, light to dark', kind: 'sequential', stops: ['#b9862f', '#8f6a22', '#5a4010'] },
  { id: 'violet', label: 'Violet, light to dark', kind: 'sequential', stops: ['#a381d8', '#7c5bb8', '#4a3175'] },
  { id: 'slate', label: 'Slate, light to dark', kind: 'sequential', stops: ['#858aa0', '#676b89', '#2b2e3f'] },
  { id: 'rose-green', label: 'Rose to green', kind: 'diverging', stops: ['#b53c5e', '#858aa0', '#2e8d44'] },
  { id: 'amber-blue', label: 'Amber to blue', kind: 'diverging', stops: ['#b3852e', '#858aa0', '#2167b9'] },
];

export const rampById = (id) => RAMPS.find((r) => r.id === id) || RAMPS[0];

/** The colour a ramp gives at `t` in [0, 1]. */
export function rampAt(ramp, t) {
  const stops = ramp.stops;
  const k = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(k));
  return mix(stops[i], stops[i + 1], k - i);
}

/* ── which value belongs to which colour ────────────────────────────────── */

/**
 * The numbers behind a chart's palette, aligned to its colours.
 *
 * @returns {{
 *   mode: 'row'|'column', palette: object,
 *   columns: Array<{index:number, name:string}>,   // the numeric columns on offer
 *   values: (col: number) => number[],             // one per palette entry
 *   describe: (col: number) => string,
 * } | null} null when the palette lines up with neither rows nor columns.
 */
export function valuesFor(def, spec) {
  const palette = paletteOf(def, spec);
  if (!palette.colors.length || typeof def.toText !== 'function') return null;
  const table = parseTable(def.toText(spec), true);
  if (!table.rows.length) return null;

  const width = table.headers.length;
  const numeric = [];
  for (let c = 0; c < width; c++) {
    const cells = table.rows.map((r) => r[c]).filter((v) => v != null && String(v).trim() !== '');
    if (cells.length && cells.every((v) => looksNumeric(v))) numeric.push({ index: c, name: table.headers[c] || `Column ${c + 1}` });
  }
  if (!numeric.length) return null;

  const n = palette.colors.length;
  if (n === table.rows.length && n >= 2) {
    return {
      mode: 'row',
      palette,
      columns: numeric,
      values: (col) => table.rows.map((r) => toNumber(r[col])),
      describe: (col) => `each row's ${table.headers[col] || 'value'}`,
    };
  }
  if (n === numeric.length && n >= 2) {
    const totals = numeric.map((c) => table.rows.reduce((s, r) => s + (Number.isFinite(toNumber(r[c.index])) ? toNumber(r[c.index]) : 0), 0));
    return {
      mode: 'column',
      palette,
      columns: [{ index: -1, name: 'Series total' }],
      values: () => totals,
      describe: () => "each series' total",
    };
  }
  return null;
}

/* ── the rules ──────────────────────────────────────────────────────────── */

/** A fresh rule of `kind`, with defaults read off the values. */
export function defaultRule(kind, values) {
  const nums = (values || []).filter(Number.isFinite);
  const lo = nums.length ? Math.min(...nums) : 0;
  const hi = nums.length ? Math.max(...nums) : 1;
  const mid = nums.length ? tidy(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
  if (kind === 'threshold') return { kind, at: mid, above: PALETTE[0], below: PALETTE[5] };
  if (kind === 'diverging') return { kind, ramp: 'rose-green', mid, lo: tidy(lo), hi: tidy(hi) };
  return { kind: 'gradient', ramp: 'green', lo: tidy(lo), hi: tidy(hi) };
}

const tidy = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : n);

/**
 * One colour per value, by the rule. Pure: values in, hex out. A value that is
 * not a number keeps `fallback` — usually the colour it already had.
 */
export function colourByValue(values, rule, fallback = () => PALETTE[6]) {
  return values.map((v, i) => {
    if (!Number.isFinite(v)) return fallback(i);
    if (rule.kind === 'threshold') return v >= Number(rule.at) ? rule.above : rule.below;
    const ramp = rampById(rule.ramp);
    if (rule.kind === 'diverging') {
      const mid = Number(rule.mid);
      const lo = Number(rule.lo);
      const hi = Number(rule.hi);
      // Each side is scaled to its own extent, so the midpoint sits at the
      // ramp's middle stop whatever the spread either way.
      if (v >= mid) return rampAt(ramp, hi > mid ? 0.5 + 0.5 * Math.min(1, (v - mid) / (hi - mid)) : 0.5);
      return rampAt(ramp, lo < mid ? 0.5 - 0.5 * Math.min(1, (mid - v) / (mid - lo)) : 0.5);
    }
    const lo = Number(rule.lo);
    const hi = Number(rule.hi);
    return rampAt(ramp, hi > lo ? (v - lo) / (hi - lo) : 0.5);
  });
}

/** The rule in words, for the panel and the toast. */
export function describeRule(rule, subject) {
  if (rule.kind === 'threshold') return `${subject} at or above ${rule.at} in one colour, below it in another`;
  if (rule.kind === 'diverging') return `${subject} shaded away from ${rule.mid}, ${rampById(rule.ramp).label.toLowerCase()}`;
  return `${subject} shaded from ${rule.lo} to ${rule.hi}, ${rampById(rule.ramp).label.toLowerCase()}`;
}
