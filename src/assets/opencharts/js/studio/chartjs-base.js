/**
 * chartjs-base.js — shared Chart.js option builders.
 *
 * IMPORTANT: whatever these return is serialised verbatim into the exported
 * code, so every value here must be a literal. Colours are deliberately
 * neutral greys (rgba(128,128,128,…)) rather than theme variables: a grey at
 * that alpha reads correctly on both the light and the dark page, and it keeps
 * the copied snippet working anywhere without carrying our CSS with it.
 */

import { isDateLabels, dateOrder, dateGranularity } from './timeaxis.js';
import { tickFormat } from './serialize.js';

export const TICK_COLOR = '#8a8880';
export const GRID_COLOR = 'rgba(128,128,128,.14)';

export const TICK = { font: { size: 11 }, color: TICK_COLOR };

/** X axis: labels, no vertical grid — the usual reading direction. */
export const xAxis = (extra = {}) => ({
  ticks: { ...TICK },
  grid: { display: false },
  border: { color: GRID_COLOR },
  ...extra,
});

/**
 * The x axis a list of labels deserves: time when they are dates, category
 * when they are words.
 *
 * `2024-01, 2024-02, 2024-04` used to be three equally spaced categories, so a
 * missing month was invisible and a series of years could not thin its ticks.
 * When every label parses as a date (`isDateLabels` — bare month names do
 * not, so the twelve-month examples stay categorical) the scale becomes
 * Chart.js's `time`, driven by the native-Date adapter `engines.js` installs
 * and emits beside the export, so no further library is asked for.
 *
 * `time.parser` carries the day/month order `dateOrder` read off the column,
 * and `tooltipFormat` the coarsest unit that describes every label, so a
 * yearly series reads "2024" on hover rather than "1 Jan 2024".
 *
 * Everything returned is a literal, as `xAxis` requires: the config is
 * serialised as data.
 */
export const xAxisFor = (labels, extra = {}) => {
  if (!isDateLabels(labels)) return xAxis(extra);
  const { ticks: extraTicks, ...rest } = extra;
  const grain = dateGranularity(labels);
  // Ticks never go finer than the data: a monthly series gets months, not
  // "Jan 12, Jan 23" — which is what Chart.js chose left to itself.
  const minUnit = { year: 'year', quarter: 'quarter', month: 'month', fullday: 'day', datetime: 'minute' }[grain];
  return xAxis({
    type: 'time',
    time: {
      parser: dateOrder(labels).dayFirst ? 'dmy' : 'mdy',
      tooltipFormat: grain,
      minUnit,
      // Chart.js never picks quarters on its own (the unit is marked
      // uncommon), so four quarters came out as one tick reading "2024".
      // Quarterly data is told the unit; autoSkip thins a long run.
      ...(grain === 'quarter' ? { unit: 'quarter' } : {}),
    },
    ticks: { ...TICK, maxRotation: 0, autoSkipPadding: 12, ...extraTicks },
    ...rest,
  });
};

/** Labels as the time scale wants them: strings, so a year is a year and not a timestamp. */
export const axisLabels = (labels) =>
  (isDateLabels(labels) ? labels.map((l) => String(l)) : labels);

/** Y axis: value scale with horizontal guides. */
export const yAxis = (extra = {}) => ({
  ticks: { ...TICK },
  grid: { color: GRID_COLOR },
  border: { display: false },
  ...extra,
});

/* ── the value axis, as the reader wants it ─────────────────────────────── */

/**
 * The locales the number format can be set to. A short list rather than the
 * world's: each one here formats differently from the others, which is the
 * only reason to offer it, and the sample beside the name is what a reader
 * actually recognises.
 */
export const AXIS_LOCALES = [
  { value: '', label: 'Browser default' },
  { value: 'en-US', label: 'English (US) — 1,234.5' },
  { value: 'en-GB', label: 'English (UK) — 1,234.5' },
  { value: 'de-DE', label: 'German — 1.234,5' },
  { value: 'fr-FR', label: 'French — 1 234,5' },
  { value: 'es-ES', label: 'Spanish — 1234,5' },
  { value: 'pt-BR', label: 'Portuguese (BR) — 1.234,5' },
  { value: 'hi-IN', label: 'Hindi — 1,23,456' },
  { value: 'ar-EG', label: 'Arabic — ١٬٢٣٤٫٥' },
  { value: 'ja-JP', label: 'Japanese — 1,234.5' },
];

/**
 * The controls a value axis takes, shared by the bar and line families.
 *
 * Thirty-odd charts had an axis and none could go logarithmic; `opts.max`
 * existed on fourteen with no `min`; and the format was a prefix, a suffix
 * and a thousands toggle, each chart's own copy. This is one block: prefix,
 * suffix, a format (plain, thousands, compact), a locale, the scale, and the
 * bounds — blank meaning auto, so a bound is a decision and not a default.
 *
 * `Axis minimum` / `Axis maximum` are the labels `facet.js boundKeys` looks
 * for when it puts every panel on one axis; a text box qualifies there now
 * as a slider always did.
 */
export const valueAxisControls = [
  { group: 'Axis', type: 'text', key: 'opts.prefix', label: 'Value prefix', placeholder: '$' },
  { group: 'Axis', type: 'text', key: 'opts.suffix', label: 'Value suffix', placeholder: 'K' },
  { group: 'Axis', type: 'seg', key: 'opts.axis.format', label: 'Number format',
    options: [{ value: 'plain', label: 'Plain' }, { value: 'thousands', label: '1,234' }, { value: 'compact', label: '1.2K' }] },
  { group: 'Axis', type: 'select', key: 'opts.axis.locale', label: 'Number locale', options: AXIS_LOCALES },
  { group: 'Axis', type: 'seg', key: 'opts.axis.scale', label: 'Value scale',
    options: [{ value: 'linear', label: 'Linear' }, { value: 'log', label: 'Log' }] },
  { group: 'Axis', type: 'text', key: 'opts.axis.min', label: 'Axis minimum', placeholder: 'auto' },
  { group: 'Axis', type: 'text', key: 'opts.axis.max', label: 'Axis maximum', placeholder: 'auto' },
];

/** What a spec's `opts.axis` starts as. */
export const AXIS_DEFAULTS = { format: 'plain', locale: '', scale: 'linear', min: '', max: '' };

const asBound = (v) => {
  if (v === '' || v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * The value axis a spec asks for.
 *
 * Reads `opts.axis` (and the older `opts.separator`, so a share link made
 * before the format existed still formats as it did). A log scale is refused
 * where the data cannot take it — zero or a negative has no logarithm, and
 * Chart.js would draw those points nowhere and say nothing — so `values` is
 * the data being plotted, and when any of it is at or below zero the axis
 * stays linear and `spec._axisNote` says why; the studio shows the note.
 *
 * Everything returned is a literal, as the config is serialised as data.
 */
export function valueAxis(spec, values = [], extra = {}) {
  const o = spec.opts || {};
  const ax = { ...AXIS_DEFAULTS, ...(o.axis || {}) };
  // A spec from before the block has no `axis` and may have the old toggle
  // on; the default must not shadow it, or every such share link loses its
  // thousands separators.
  const format = (o.axis && o.axis.format) || (o.separator ? 'thousands' : 'plain');
  const { ticks: extraTicks, ...rest } = extra;

  let scale = ax.scale === 'log' ? 'logarithmic' : undefined;
  const flat = values.flat(Infinity).filter((v) => typeof v === 'number');
  if (scale && flat.some((v) => !(v > 0))) {
    const bad = flat.filter((v) => !(v > 0)).length;
    spec._axisNote = `A log scale needs every value above zero — ${bad} ${bad === 1 ? 'is' : 'are'} not, so the axis is linear.`;
    scale = undefined;
  } else {
    delete spec._axisNote;
  }
  const min = asBound(ax.min);
  const max = asBound(ax.max);

  return yAxis({
    ...(scale ? { type: scale } : {}),
    ...(min !== undefined && (!scale || min > 0) ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
    ticks: {
      ...TICK,
      callback: tickFormat({
        prefix: o.prefix, suffix: o.suffix,
        separator: format === 'thousands',
        compact: format === 'compact',
        decimals: o.decimals == null ? null : o.decimals,
        locale: ax.locale || '',
      }),
      ...extraTicks,
    },
    ...rest,
  });
}

/** Radial axis for radar and polar charts. */
export const rAxis = (extra = {}) => ({
  min: 0,
  ticks: { stepSize: 20, font: { size: 10 }, color: TICK_COLOR, backdropColor: 'transparent' },
  pointLabels: { font: { size: 12 }, color: TICK_COLOR },
  grid: { color: GRID_COLOR },
  angleLines: { color: GRID_COLOR },
  ...extra,
});

/**
 * Base options every chart in the library starts from.
 *
 * Chart.js's own legend is switched off throughout: the library renders a DOM
 * legend outside the canvas instead, so it can be styled with CSS and stay
 * crisp at any pixel ratio.
 */
export function baseOpts(extra = {}) {
  const { plugins = {}, scales, ...rest } = extra;
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    animation: { duration: 620, easing: 'easeOutQuart' },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(23,22,20,.92)',
        titleColor: '#f5f4ef',
        bodyColor: '#d8d6cf',
        borderColor: 'rgba(255,255,255,.1)',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        boxPadding: 4,
        displayColors: true,
        ...plugins.tooltip,
      },
      ...Object.fromEntries(Object.entries(plugins).filter(([k]) => k !== 'tooltip' && k !== 'legend')),
    },
    ...(scales ? { scales } : {}),
    ...rest,
  };
}

/** Legend descriptor built from a spec's series list. */
export const seriesLegend = (spec, line = false) =>
  (spec.series || []).map((s, i) => ({ label: s.label, color: s.color, line, datasetIndex: i }));

/** Legend descriptor for a single dataset painted with many colours. */
export const sliceLegend = (spec) =>
  (spec.labels || []).map((label, i) => ({
    label,
    color: (spec.colors || [])[i],
    toggleable: false,
  }));
