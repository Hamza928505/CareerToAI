/**
 * Line & area chart definitions (Chart.js).
 *
 * Note on callbacks: anything that ends up inside a returned config is
 * serialised into the exported code, so tick formatters are built with
 * `tickFormat()` rather than closing over spec values.
 */

import { C, MONTHS, MONTHS6, withAlpha } from '../palette.js';
import { baseOpts, xAxisFor, axisLabels, yAxis, TICK, seriesLegend, valueAxisControls, valueAxis, AXIS_DEFAULTS } from '../chartjs-base.js';
import { REFERENCE_CONTROL, referenceDatasets, referenceLegend } from '../reference.js';
import { tickFormat } from '../serialize.js';

const CURVE = [
  { value: 'smooth',  label: 'Smooth'  },
  { value: 'linear',  label: 'Linear'  },
  { value: 'stepped', label: 'Stepped' },
];

/** Shared dataset shape for every line-family chart. */
function lineDatasets(spec) {
  const o = spec.opts;
  return spec.series.map((s) => {
    const ds = {
      label: s.label,
      data: s.data,
      borderColor: s.color,
      backgroundColor: o.fill ? withAlpha(s.color, o.fillAlpha) : 'transparent',
      fill: o.fill,
      borderWidth: o.lineWidth,
      pointRadius: o.points ? o.pointRadius : 0,
      pointHoverRadius: o.points ? o.pointRadius + 3 : 5,
      pointBackgroundColor: s.color,
      pointBorderWidth: 0,
    };
    if (o.curve === 'stepped') { ds.stepped = 'before'; ds.tension = 0; }
    else if (o.curve === 'linear') { ds.tension = 0; }
    else { ds.tension = o.tension; }
    return ds;
  });
}

const lineControls = (extra = []) => [
  { group: 'Data',  type: 'labels', key: 'labels', label: 'Category labels' },
  { group: 'Data',  type: 'series', key: 'series', data: true, max: 6 },
  { group: 'Curve', type: 'seg',    key: 'opts.curve', label: 'Interpolation', options: CURVE },
  { group: 'Curve', type: 'slider', key: 'opts.tension', label: 'Tension', min: 0, max: 1, step: 0.05,
    format: (v) => v.toFixed(2) },
  { group: 'Style', type: 'toggle', key: 'opts.fill', label: 'Fill area under line' },
  { group: 'Style', type: 'slider', key: 'opts.fillAlpha', label: 'Fill opacity', min: 0.05, max: 0.7, step: 0.05,
    format: (v) => Math.round(v * 100) + '%' },
  { group: 'Style', type: 'toggle', key: 'opts.points', label: 'Show data points' },
  { group: 'Style', type: 'slider', key: 'opts.lineWidth', label: 'Line width', min: 1, max: 6, step: 0.5,
    format: (v) => v + 'px' },
  ...extra,
  ...valueAxisControls,
  { ...REFERENCE_CONTROL },
];

/** Build a standard line config from a spec. */
function buildLine(spec, { stacked = false, yExtra = {} } = {}) {
  const o = spec.opts;
  return {
    type: 'line',
    data: { labels: axisLabels(spec.labels), datasets: [...lineDatasets(spec), ...referenceDatasets(spec, spec.series)] },
    options: baseOpts({
      scales: {
        x: xAxisFor(spec.labels, { ticks: { ...TICK, maxTicksLimit: o.maxLabels || 12 } }),
        y: valueAxis(spec, spec.series.map((s) => s.data), { stacked, ...yExtra }),
      },
    }),
  };
}

export const lineCharts = [
  {
    id: 'line-basic',
    title: 'Basic Line',
    category: 'Line & Area',
    blurb: 'A single measure over time — the default answer to "how has this moved?"',
    tags: ['line', 'trend', 'time series', 'revenue'],
    spec: {
      labels: [...MONTHS],
      series: [{ label: 'Revenue', color: C.green, data: [185, 210, 198, 240, 275, 310, 295, 330, 285, 320, 355, 410] }],
      opts: { curve: 'smooth', tension: 0.4, fill: false, fillAlpha: 0.15, points: true, pointRadius: 4, lineWidth: 2.5, prefix: '$', suffix: 'K', separator: false, axis: { ...AXIS_DEFAULTS }, maxLabels: 12 },
    },
    controls: lineControls(),
    chartjs: { build: (spec) => buildLine(spec) },
    legend: (spec) => [...seriesLegend(spec, true), ...referenceLegend(spec, spec.series)],
  },

  {
    id: 'line-multi',
    title: 'Multi-Series Line',
    category: 'Line & Area',
    blurb: 'Several measures on one scale, so the reader compares shapes rather than levels.',
    tags: ['line', 'compare', 'multi series'],
    spec: {
      labels: [...MONTHS],
      series: [
        { label: 'Direct',   color: C.green, data: [185, 210, 198, 240, 275, 310, 295, 330, 285, 320, 355, 410] },
        { label: 'Referral', color: C.blue,   data: [120, 135, 150, 145, 175, 190, 205, 195, 220, 240, 235, 265] },
        { label: 'Paid',     color: C.amber,  data: [90, 105, 98, 130, 142, 128, 160, 175, 155, 180, 195, 210] },
      ],
      opts: { curve: 'smooth', tension: 0.4, fill: false, fillAlpha: 0.12, points: true, pointRadius: 3, lineWidth: 2.5, prefix: '$', suffix: 'K', separator: false, axis: { ...AXIS_DEFAULTS }, maxLabels: 12 },
    },
    controls: lineControls(),
    chartjs: { build: (spec) => buildLine(spec) },
    legend: (spec) => [...seriesLegend(spec, true), ...referenceLegend(spec, spec.series)],
  },

  {
    id: 'line-stepped',
    title: 'Stepped Line',
    category: 'Line & Area',
    blurb: 'For values that hold flat then jump — prices, tiers, headcount.',
    tags: ['line', 'stepped', 'pricing', 'tiers'],
    spec: {
      labels: [...MONTHS],
      series: [{ label: 'List price', color: C.violet, data: [29, 29, 29, 39, 39, 39, 49, 49, 59, 59, 79, 79] }],
      opts: { curve: 'stepped', tension: 0, fill: true, fillAlpha: 0.12, points: true, pointRadius: 4, lineWidth: 2.5, prefix: '$', suffix: '', separator: false, axis: { ...AXIS_DEFAULTS }, maxLabels: 12 },
    },
    controls: lineControls(),
    chartjs: { build: (spec) => buildLine(spec) },
    legend: (spec) => [...seriesLegend(spec, true), ...referenceLegend(spec, spec.series)],
  },

  {
    id: 'line-stepped-multi',
    title: 'Stepped Line — Multi',
    category: 'Line & Area',
    blurb: 'Two plans side by side, each holding its price until it changes.',
    tags: ['line', 'stepped', 'plans', 'compare'],
    spec: {
      labels: [...MONTHS],
      series: [
        { label: 'Starter', color: C.violet,   data: [29, 29, 29, 39, 39, 39, 49, 49, 59, 59, 79, 79] },
        { label: 'Pro',     color: C.green, data: [79, 79, 89, 89, 89, 99, 99, 119, 119, 129, 129, 149] },
        { label: 'Team',    color: C.blue,   data: [149, 149, 149, 179, 179, 199, 199, 199, 229, 229, 259, 259] },
      ],
      opts: { curve: 'stepped', tension: 0, fill: false, fillAlpha: 0.1, points: true, pointRadius: 3, lineWidth: 2.5, prefix: '$', suffix: '', separator: false, axis: { ...AXIS_DEFAULTS }, maxLabels: 12 },
    },
    controls: lineControls(),
    chartjs: { build: (spec) => buildLine(spec) },
    legend: (spec) => [...seriesLegend(spec, true), ...referenceLegend(spec, spec.series)],
  },

  {
    id: 'area-basic',
    title: 'Area',
    category: 'Line & Area',
    blurb: 'A filled line. The fill implies accumulation, so use it for volumes, not rates.',
    tags: ['area', 'fill', 'volume', 'daily active users'],
    spec: {
      labels: Array.from({ length: 30 }, (_, i) => 'D' + (i + 1)),
      series: [{
        label: 'Daily active users', color: C.blue,
        data: [820, 860, 910, 890, 950, 1020, 1080, 1060, 1120, 1090, 1150, 1200, 1180, 1240, 1300,
               1280, 1350, 1410, 1390, 1460, 1520, 1500, 1560, 1620, 1600, 1670, 1730, 1710, 1780, 1840],
      }],
      opts: { curve: 'smooth', tension: 0.4, fill: true, fillAlpha: 0.16, points: false, pointRadius: 3, lineWidth: 2, prefix: '', suffix: '', separator: true, axis: { ...AXIS_DEFAULTS, format: 'thousands' }, maxLabels: 8 },
    },
    controls: lineControls(),
    chartjs: { build: (spec) => buildLine(spec) },
    legend: (spec) => [...seriesLegend(spec, true), ...referenceLegend(spec, spec.series)],
  },

  {
    id: 'area-stacked',
    title: 'Stacked Area',
    category: 'Line & Area',
    blurb: 'Composition over time. Only the bottom band has a flat baseline — read the total, not the middles.',
    tags: ['area', 'stacked', 'composition', 'channels'],
    spec: {
      labels: [...MONTHS6],
      series: [
        { label: 'Organic', color: C.green, data: [4200, 4800, 4500, 5200, 5600, 6100] },
        { label: 'Paid',    color: C.blue,   data: [2100, 2400, 2200, 2600, 2900, 3300] },
        { label: 'Social',  color: C.amber,  data: [1200, 1400, 1300, 1600, 1700, 1900] },
        { label: 'Email',   color: C.violet,   data: [800, 900, 850, 1000, 1100, 1200] },
      ],
      opts: { curve: 'smooth', tension: 0.35, fill: true, fillAlpha: 0.5, points: true, pointRadius: 3, lineWidth: 1.5, prefix: '', suffix: '', separator: true, axis: { ...AXIS_DEFAULTS, format: 'thousands' }, maxLabels: 12 },
    },
    controls: lineControls(),
    chartjs: { build: (spec) => buildLine(spec, { stacked: true }) },
    legend: (spec) => [...seriesLegend(spec, true), ...referenceLegend(spec, spec.series)],
  },

  {
    id: 'area-band',
    title: 'Confidence Band',
    category: 'Line & Area',
    blurb: 'A mean line inside an upper and lower bound — a forecast that admits its uncertainty.',
    tags: ['area', 'band', 'confidence', 'forecast', 'range'],
    spec: {
      labels: Array.from({ length: 14 }, (_, i) => 'Day ' + (i + 1)),
      mean: [18, 19, 21, 22, 20, 19, 23, 25, 24, 22, 21, 23, 26, 25],
      spread: 3,
      color: C.green,
      meanLabel: 'Mean',
      opts: { bandAlpha: 0.18, tension: 0.4, pointRadius: 4, lineWidth: 2.5, suffix: '°C' },
    },
    controls: [
      { group: 'Data',  type: 'labels', key: 'labels', label: 'Category labels' },
      { group: 'Data',  type: 'values', key: 'mean',   label: 'Mean values' },
      { group: 'Data',  type: 'slider', key: 'spread', label: 'Band width', min: 1, max: 8, step: 0.5,
        format: (v) => '±' + v },
      { group: 'Style', type: 'colors', key: 'colorList', label: 'Colour' },
      { group: 'Style', type: 'slider', key: 'opts.bandAlpha', label: 'Band opacity', min: 0.05, max: 0.5, step: 0.02,
        format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'slider', key: 'opts.tension', label: 'Tension', min: 0, max: 1, step: 0.05,
        format: (v) => v.toFixed(2) },
      { group: 'Axis',  type: 'text',   key: 'opts.suffix', label: 'Value suffix' },
    ],
    // The colour control edits an array, so mirror the single colour into one.
    onInit(spec) { spec.colorList = [spec.color]; },
    onChange(spec) { spec.color = spec.colorList[0]; },
    chartjs: {
      build(spec) {
        const o = spec.opts;
        const hi = spec.mean.map((v) => +(v + spec.spread).toFixed(1));
        const lo = spec.mean.map((v) => +(v - spec.spread).toFixed(1));
        const band = withAlpha(spec.color, o.bandAlpha);
        return {
          type: 'line',
          data: {
            labels: axisLabels(spec.labels),
            datasets: [
              // Upper bound fills down to the next dataset (the lower bound),
              // which is what paints the band without a custom plugin.
              { label: 'Upper bound', data: hi, borderColor: 'transparent', backgroundColor: band, fill: '+1', pointRadius: 0, tension: o.tension, borderWidth: 0 },
              { label: 'Lower bound', data: lo, borderColor: 'transparent', backgroundColor: band, fill: false, pointRadius: 0, tension: o.tension, borderWidth: 0 },
              { label: spec.meanLabel, data: spec.mean, borderColor: spec.color, backgroundColor: 'transparent', fill: false, tension: o.tension, pointRadius: o.pointRadius, pointBackgroundColor: spec.color, borderWidth: o.lineWidth },
            ],
          },
          options: baseOpts({
            scales: {
              x: xAxisFor(spec.labels),
              y: yAxis({ ticks: { ...TICK, callback: tickFormat({ suffix: o.suffix }) } }),
            },
          }),
        };
      },
    },
    legend: (spec) => [
      { label: spec.meanLabel, color: spec.color, line: true, datasetIndex: 2 },
      { label: 'Band', color: withAlpha(spec.color, 0.45), toggleable: false },
    ],
  },
];
