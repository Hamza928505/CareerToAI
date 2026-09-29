/**
 * Bar-family chart definitions.
 *
 * Eight are Chart.js; the lollipop is drawn straight onto a 2D context because
 * a stem plus a dot is less code than bending a bar controller into that shape.
 */

import { C, MONTHS, QUARTERS, withAlpha, paletteAt } from '../palette.js';
import { baseOpts, xAxis, yAxis, TICK, seriesLegend, valueAxisControls, valueAxis, AXIS_DEFAULTS } from '../chartjs-base.js';
import { REFERENCE_CONTROL, referenceDatasets, referenceLegend } from '../reference.js';
import { tickFormat } from '../serialize.js';

/** Controls shared by the plain grouped/stacked bars. */
const barStyleControls = [
  { group: 'Style', type: 'slider', key: 'opts.radius', label: 'Corner radius', min: 0, max: 14, step: 1,
    format: (v) => v + 'px' },
  { group: 'Style', type: 'slider', key: 'opts.thickness', label: 'Bar thickness', min: 0.3, max: 0.95, step: 0.05,
    format: (v) => Math.round(v * 100) + '%' },
];

// The axis block is shared with the line family — see `valueAxisControls`.
// Reference lines ride with it: only a chart that places values on an axis
// through a Chart.js config can draw a line at a value.
const axisControls = [...valueAxisControls, { ...REFERENCE_CONTROL }];

function barDatasets(spec, { stack = false } = {}) {
  const o = spec.opts;
  return spec.series.map((s, i) => ({
    label: s.label,
    data: s.data,
    backgroundColor: o.outline ? withAlpha(s.color, 0.2) : s.color,
    borderColor: s.color,
    borderWidth: o.outline ? 1.5 : 0,
    borderRadius: stack && i < spec.series.length - 1 ? 0 : o.radius,
    borderSkipped: false,
    categoryPercentage: o.thickness,
    barPercentage: 0.92,
    ...(stack ? { stack: 'total' } : {}),
  }));
}

/**
 * Chart text at a given opacity, in whatever colour the spec asks for.
 *
 * Defaults to the neutral grey these charts have always used, so a spec that
 * says nothing looks exactly as it did.
 */
function inkColor(color, alpha) {
  if (!color) return 'rgba(128,128,128,' + alpha + ')';
  const hex = String(color).replace('#', '');
  const full = hex.length === 3 ? hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return 'rgba(128,128,128,' + alpha + ')';
  }
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

export const barCharts = [
  {
    id: 'bar-vertical',
    title: 'Vertical Bar',
    category: 'Bar',
    blurb: 'Discrete comparison across a handful of categories. The workhorse.',
    tags: ['bar', 'column', 'compare', 'quarterly'],
    spec: {
      labels: [...QUARTERS],
      series: [
        { label: '2024', color: C.green, data: [520, 680, 740, 910] },
        { label: '2023', color: C.violet,   data: [440, 575, 625, 770] },
      ],
      opts: { radius: 5, thickness: 0.72, outline: false, prefix: '$', suffix: 'K', separator: false, axis: { ...AXIS_DEFAULTS } },
    },
    controls: [
      { group: 'Data', type: 'labels', key: 'labels', label: 'Category labels' },
      { group: 'Data', type: 'series', key: 'series', data: true, max: 6 },
      ...barStyleControls,
      { group: 'Style', type: 'toggle', key: 'opts.outline', label: 'Outline style' },
      ...axisControls,
    ],
    chartjs: {
      build: (spec) => ({
        type: 'bar',
        data: { labels: spec.labels, datasets: [...barDatasets(spec), ...referenceDatasets(spec, spec.series)] },
        options: baseOpts({
          scales: {
            x: xAxis(),
            y: valueAxis(spec, spec.series.map((s) => s.data)),
          },
        }),
      }),
    },
    legend: (spec) => [...seriesLegend(spec), ...referenceLegend(spec, spec.series)],
  },

  {
    id: 'bar-stacked',
    title: 'Stacked Bar',
    category: 'Bar',
    blurb: 'Parts inside a total. Reliable for the total and the bottom band, harder for the middles.',
    tags: ['bar', 'stacked', 'composition', 'channels'],
    spec: {
      labels: [...QUARTERS],
      series: [
        { label: 'Online',    color: C.green, data: [0.52, 0.68, 0.74, 0.91] },
        { label: 'In-store',  color: C.blue,   data: [0.31, 0.38, 0.42, 0.51] },
        { label: 'Wholesale', color: C.amber,  data: [0.18, 0.22, 0.24, 0.29] },
      ],
      opts: { radius: 5, thickness: 0.68, outline: false, prefix: '$', suffix: 'M', separator: false, axis: { ...AXIS_DEFAULTS }, decimals: 2 },
    },
    controls: [
      { group: 'Data', type: 'labels', key: 'labels', label: 'Category labels' },
      { group: 'Data', type: 'series', key: 'series', data: true, max: 6 },
      ...barStyleControls,
      ...axisControls,
    ],
    chartjs: {
      build: (spec) => ({
        type: 'bar',
        data: { labels: spec.labels, datasets: [...barDatasets(spec, { stack: true }), ...referenceDatasets(spec, spec.series)] },
        options: baseOpts({
          scales: {
            x: xAxis({ stacked: true }),
            y: valueAxis(spec, spec.series.map((s) => s.data), { stacked: true }),
          },
        }),
      }),
    },
    legend: (spec) => [...seriesLegend(spec), ...referenceLegend(spec, spec.series)],
  },

  {
    id: 'bar-horizontal',
    title: 'Horizontal Bar',
    category: 'Bar',
    blurb: 'Rotate when the category names are long — labels stay readable and ranking reads top-down.',
    tags: ['bar', 'horizontal', 'ranking', 'products'],
    spec: {
      labels: ['Linen Blazer', 'Silk Midi Dress', 'Wool Overcoat', 'Canvas Tote', 'Cashmere Knit', 'Leather Belt', 'Wide-Leg Trousers', 'Cotton Shirt'],
      values: [142, 128, 115, 98, 87, 74, 63, 55],
      colors: [C.green, C.green, C.green, C.blue, C.blue, C.amber, C.amber, C.amber],
      opts: { radius: 5, thickness: 0.78, prefix: '$', suffix: 'K', separator: false, axis: { ...AXIS_DEFAULTS }, label: 'Revenue' },
    },
    controls: [
      { group: 'Data',  type: 'labels', key: 'labels', label: 'Category labels' },
      { group: 'Data',  type: 'values', key: 'values', label: 'Values' },
      { group: 'Style', type: 'colors', key: 'colors', label: 'Bar colours', names: (s) => s.labels },
      { group: 'Style', type: 'slider', key: 'opts.radius', label: 'Corner radius', min: 0, max: 14, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.thickness', label: 'Bar thickness', min: 0.3, max: 0.95, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      ...axisControls,
    ],
    chartjs: {
      build: (spec) => ({
        type: 'bar',
        data: {
          labels: spec.labels,
          datasets: [{
            label: spec.opts.label,
            data: spec.values,
            backgroundColor: spec.labels.map((_, i) => spec.colors[i % spec.colors.length]),
            borderRadius: spec.opts.radius,
            borderSkipped: false,
            categoryPercentage: spec.opts.thickness,
          }, ...referenceDatasets(spec, [{ label: spec.opts.label, color: spec.colors[0], data: spec.values }])],
        },
        options: baseOpts({
          indexAxis: 'y',
          interaction: { intersect: false, mode: 'nearest' },
          scales: {
            x: valueAxis(spec, spec.values),
            y: xAxis({ ticks: { ...TICK, font: { size: 12 } } }),
          },
        }),
      }),
    },
    legend: (spec) => {
      const refs = referenceLegend(spec, [{ label: spec.opts.label, color: spec.colors[0], data: spec.values }]);
      return refs.length ? refs : null;
    },
  },

  {
    id: 'bar-100stacked',
    title: '100% Stacked Bar',
    category: 'Bar',
    blurb: 'Share of total per group. Every column reaches 100%, so only the mix is comparable.',
    tags: ['bar', 'stacked', 'percentage', 'share', 'market'],
    spec: {
      labels: ['North', 'South', 'East', 'West'],
      series: [
        { label: 'Brand A', color: C.green, data: [40, 35, 45, 38] },
        { label: 'Brand B', color: C.blue,   data: [25, 30, 22, 28] },
        { label: 'Brand C', color: C.amber,  data: [20, 20, 18, 22] },
        { label: 'Brand D', color: C.violet,   data: [15, 15, 15, 12] },
      ],
      opts: { radius: 5, thickness: 0.66 },
    },
    controls: [
      { group: 'Data', type: 'labels', key: 'labels', label: 'Group labels' },
      { group: 'Data', type: 'series', key: 'series', data: true, max: 6 },
      ...barStyleControls,
    ],
    chartjs: {
      build(spec) {
        // Normalise each column to 100% here rather than in the data, so the
        // control panel keeps showing the raw numbers the user typed.
        const totals = spec.labels.map((_, i) =>
          spec.series.reduce((sum, s) => sum + (s.data[i] || 0), 0) || 1);
        return {
          type: 'bar',
          data: {
            labels: spec.labels,
            datasets: spec.series.map((s, si) => ({
              label: s.label,
              data: spec.labels.map((_, i) => +(((s.data[i] || 0) / totals[i]) * 100).toFixed(1)),
              backgroundColor: s.color,
              borderRadius: si === spec.series.length - 1 ? spec.opts.radius : 0,
              borderSkipped: false,
              categoryPercentage: spec.opts.thickness,
              stack: 'total',
            })),
          },
          options: baseOpts({
            scales: {
              x: xAxis({ stacked: true }),
              y: yAxis({ stacked: true, max: 100, ticks: { ...TICK, callback: tickFormat({ suffix: '%' }) } }),
            },
            plugins: { tooltip: { callbacks: { label: (ctx) => ' ' + ctx.dataset.label + ': ' + ctx.parsed.y + '%' } } },
          }),
        };
      },
    },
    legend: (spec) => seriesLegend(spec),
  },

  {
    id: 'bar-diverging',
    title: 'Diverging Bar',
    category: 'Bar',
    blurb: 'Signed values around a zero baseline — variance, sentiment, net change.',
    tags: ['bar', 'diverging', 'variance', 'positive negative'],
    spec: {
      labels: [...MONTHS],
      values: [12, -8, 20, -5, 15, -12, 18, 25, -6, 14, -9, 30],
      posColor: C.blue,
      negColor: C.amber,
      opts: { radius: 4, thickness: 0.7, prefix: '', suffix: 'K', showSign: true },
    },
    controls: [
      { group: 'Data',  type: 'labels', key: 'labels', label: 'Category labels' },
      { group: 'Data',  type: 'values', key: 'values', label: 'Values (negatives allowed)' },
      { group: 'Style', type: 'colors', key: 'diverging', label: 'Positive / negative', names: () => ['Positive', 'Negative'] },
      { group: 'Style', type: 'slider', key: 'opts.radius', label: 'Corner radius', min: 0, max: 10, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.showSign', label: 'Show + on positives' },
      { group: 'Axis',  type: 'text',   key: 'opts.suffix', label: 'Value suffix' },
    ],
    onInit(spec) { spec.diverging = [spec.posColor, spec.negColor]; },
    onChange(spec) { [spec.posColor, spec.negColor] = spec.diverging; },
    chartjs: {
      build: (spec) => ({
        type: 'bar',
        data: {
          labels: spec.labels,
          datasets: [{
            label: 'Variance',
            data: spec.values,
            backgroundColor: spec.values.map((v) => (v >= 0 ? spec.posColor : spec.negColor)),
            borderRadius: spec.opts.radius,
            borderSkipped: false,
            categoryPercentage: spec.opts.thickness,
          }],
        },
        options: baseOpts({
          scales: {
            x: xAxis(),
            y: yAxis({
              ticks: {
                ...TICK,
                callback: spec.opts.showSign
                  ? tickFormat({ prefix: '', suffix: spec.opts.suffix, separator: false })
                  : tickFormat({ suffix: spec.opts.suffix }),
              },
            }),
          },
        }),
      }),
    },
    legend: (spec) => [
      { label: 'Positive', color: spec.posColor, toggleable: false },
      { label: 'Negative', color: spec.negColor, toggleable: false },
    ],
  },

  {
    id: 'bar-floating',
    title: 'Floating Bar (Gantt)',
    category: 'Bar',
    blurb: 'Bars given a start and an end instead of a length — schedules and ranges.',
    tags: ['bar', 'gantt', 'range', 'timeline', 'schedule'],
    spec: {
      labels: ['Discovery', 'Design', 'Development', 'QA Testing', 'Launch Prep', 'Go-Live'],
      ranges: [[1, 3], [2, 5], [4, 10], [8, 12], [11, 13], [13, 14]],
      colors: [C.violet, C.green, C.blue, C.cyan, C.amber, C.rose],
      opts: { radius: 5, thickness: 0.7, max: 15, unit: 'Wk ' },
    },
    controls: [
      { group: 'Data',  type: 'labels', key: 'labels', label: 'Task names' },
      { group: 'Style', type: 'colors', key: 'colors', label: 'Bar colours', names: (s) => s.labels },
      { group: 'Style', type: 'slider', key: 'opts.radius', label: 'Corner radius', min: 0, max: 12, step: 1, format: (v) => v + 'px' },
      { group: 'Axis',  type: 'slider', key: 'opts.max', label: 'Axis maximum', min: 6, max: 40, step: 1 },
      { group: 'Axis',  type: 'text',   key: 'opts.unit', label: 'Tick prefix' },
    ],
    chartjs: {
      build: (spec) => ({
        type: 'bar',
        data: {
          labels: spec.labels,
          datasets: [{
            label: 'Duration',
            // Chart.js reads a [start, end] pair as a floating bar.
            data: spec.ranges,
            backgroundColor: spec.labels.map((_, i) => withAlpha(spec.colors[i % spec.colors.length], 0.8)),
            borderColor: spec.labels.map((_, i) => spec.colors[i % spec.colors.length]),
            borderWidth: 1,
            borderRadius: spec.opts.radius,
            borderSkipped: false,
            categoryPercentage: spec.opts.thickness,
          }],
        },
        options: baseOpts({
          indexAxis: 'y',
          interaction: { intersect: false, mode: 'nearest' },
          scales: {
            x: yAxis({ min: 0, max: spec.opts.max, ticks: { ...TICK, callback: tickFormat({ prefix: spec.opts.unit }) } }),
            y: xAxis({ ticks: { ...TICK, font: { size: 12 } } }),
          },
          plugins: { tooltip: { callbacks: { label: (ctx) => ' ' + ctx.raw[0] + ' → ' + ctx.raw[1] } } },
        }),
      }),
    },
    legend: () => null,
  },

  {
    id: 'bar-waterfall',
    title: 'Waterfall',
    category: 'Bar',
    blurb: 'How a starting figure becomes an ending figure, one contribution at a time.',
    tags: ['bar', 'waterfall', 'bridge', 'finance', 'variance'],
    spec: {
      steps: [
        { label: 'FY2023',    delta: 0,    kind: 'base' },
        { label: 'New sales', delta: 2.1,  kind: 'up'   },
        { label: 'Upsells',   delta: 0.8,  kind: 'up'   },
        { label: 'Churn',     delta: -0.5, kind: 'down' },
        { label: 'FX impact', delta: -0.3, kind: 'down' },
        { label: 'Renewals',  delta: 1.4,  kind: 'up'   },
        { label: 'FY2024',    delta: 0,    kind: 'base' },
      ],
      start: 8.2,
      upColor: C.blue,
      downColor: C.amber,
      baseColor: C.slate,
      opts: { radius: 4, thickness: 0.68, prefix: '$', suffix: 'M', decimals: 1 },
    },
    controls: [
      { group: 'Data',  type: 'slider', key: 'start', label: 'Opening value', min: 1, max: 30, step: 0.1, format: (v) => v.toFixed(1) },
      { group: 'Style', type: 'colors', key: 'waterfall', label: 'Up / down / total', names: () => ['Increase', 'Decrease', 'Total'] },
      { group: 'Style', type: 'slider', key: 'opts.radius', label: 'Corner radius', min: 0, max: 10, step: 1, format: (v) => v + 'px' },
      { group: 'Axis',  type: 'text',   key: 'opts.prefix', label: 'Value prefix' },
      { group: 'Axis',  type: 'text',   key: 'opts.suffix', label: 'Value suffix' },
    ],
    onInit(spec) { spec.waterfall = [spec.upColor, spec.downColor, spec.baseColor]; },
    onChange(spec) { [spec.upColor, spec.downColor, spec.baseColor] = spec.waterfall; },
    chartjs: {
      build(spec) {
        // Each bar is a [from, to] float; running total carries between steps.
        let cum = spec.start;
        const floats = spec.steps.map((s, i) => {
          if (s.kind === 'base') return i === 0 ? [0, spec.start] : [0, +cum.toFixed(2)];
          const from = cum;
          cum += s.delta;
          return [+Math.min(from, cum).toFixed(2), +Math.max(from, cum).toFixed(2)];
        });
        const colors = spec.steps.map((s) =>
          s.kind === 'base' ? spec.baseColor : s.kind === 'up' ? spec.upColor : spec.downColor);
        return {
          type: 'bar',
          data: {
            labels: spec.steps.map((s) => s.label),
            datasets: [{
              label: 'Value',
              data: floats,
              backgroundColor: colors,
              borderColor: colors,
              borderWidth: 1,
              borderRadius: spec.opts.radius,
              borderSkipped: false,
              categoryPercentage: spec.opts.thickness,
            }],
          },
          options: baseOpts({
            scales: {
              x: xAxis({ ticks: { ...TICK, font: { size: 11 } } }),
              y: yAxis({ min: 0, ticks: { ...TICK, callback: tickFormat({ prefix: spec.opts.prefix, suffix: spec.opts.suffix, decimals: spec.opts.decimals }) } }),
            },
            plugins: { tooltip: { callbacks: { label: (ctx) => ' ' + (ctx.raw[1] - ctx.raw[0]).toFixed(2) } } },
          }),
        };
      },
    },
    legend: (spec) => [
      { label: 'Increase', color: spec.upColor, toggleable: false },
      { label: 'Decrease', color: spec.downColor, toggleable: false },
      { label: 'Total',    color: spec.baseColor, toggleable: false },
    ],
  },

  {
    id: 'bar-butterfly',
    title: 'Butterfly (Population Pyramid)',
    category: 'Bar',
    blurb: 'Two groups mirrored across a shared category axis. One side is negated to fan out.',
    tags: ['bar', 'butterfly', 'pyramid', 'population', 'demographics'],
    spec: {
      labels: ['18–24', '25–34', '35–44', '45–54', '55–64', '65+'],
      left:  { label: 'Male',   color: C.violet, data: [8.2, 14.5, 13.8, 11.2, 8.4, 5.1] },
      right: { label: 'Female', color: C.rose, data: [9.1, 15.8, 14.2, 12.0, 9.3, 6.4] },
      opts: { radius: 4, thickness: 0.78, suffix: '%' },
    },
    controls: [
      { group: 'Data',  type: 'labels', key: 'labels',      label: 'Age bands' },
      { group: 'Data',  type: 'values', key: 'left.data',   label: 'Left values' },
      { group: 'Data',  type: 'values', key: 'right.data',  label: 'Right values' },
      { group: 'Style', type: 'text',   key: 'left.label',  label: 'Left name' },
      { group: 'Style', type: 'text',   key: 'right.label', label: 'Right name' },
      { group: 'Style', type: 'colors', key: 'sides', label: 'Side colours', names: (s) => [s.left.label, s.right.label] },
      { group: 'Style', type: 'slider', key: 'opts.radius', label: 'Corner radius', min: 0, max: 10, step: 1, format: (v) => v + 'px' },
    ],
    onInit(spec) { spec.sides = [spec.left.color, spec.right.color]; },
    onChange(spec) { [spec.left.color, spec.right.color] = spec.sides; },
    chartjs: {
      build: (spec) => ({
        type: 'bar',
        data: {
          labels: spec.labels,
          datasets: [
            { label: spec.left.label, data: spec.left.data.map((v) => -v), backgroundColor: withAlpha(spec.left.color, 0.85), borderRadius: spec.opts.radius, borderSkipped: false, categoryPercentage: spec.opts.thickness },
            { label: spec.right.label, data: spec.right.data, backgroundColor: withAlpha(spec.right.color, 0.85), borderRadius: spec.opts.radius, borderSkipped: false, categoryPercentage: spec.opts.thickness },
          ],
        },
        options: baseOpts({
          indexAxis: 'y',
          scales: {
            x: yAxis({ ticks: { ...TICK, callback: (v) => Math.abs(v).toFixed(1) + '%' } }),
            y: xAxis(),
          },
          plugins: {
            tooltip: { callbacks: { label: (ctx) => ' ' + ctx.dataset.label + ': ' + Math.abs(ctx.parsed.x).toFixed(1) + '%' } },
          },
        }),
      }),
    },
    legend: (spec) => [
      { label: spec.left.label,  color: spec.left.color,  datasetIndex: 0 },
      { label: spec.right.label, color: spec.right.color, datasetIndex: 1 },
    ],
  },

  {
    id: 'bar-lollipop',
    title: 'Lollipop',
    category: 'Bar',
    blurb: 'A bar reduced to a stem and a dot — less ink for the same ranking, at any density.',
    tags: ['lollipop', 'ranking', 'dot plot', 'scores'],
    spec: {
      items: [
        { label: 'Onboarding', value: 82, color: C.green },
        { label: 'Support',    value: 74, color: C.blue   },
        { label: 'Sales',      value: 68, color: C.violet   },
        { label: 'Billing',    value: 55, color: C.amber  },
        { label: 'Delivery',   value: 79, color: C.blue   },
        { label: 'Returns',    value: 48, color: C.cyan  },
        { label: 'Product',    value: 88, color: C.green },
        { label: 'Website',    value: 71, color: C.violet   },
      ],
      opts: { textColor: '#808080', max: 100, dotRadius: 7, stemWidth: 2, showValue: true, labelWidth: 110 },
    },
    controls: [
      { group: 'Data',  type: 'series', key: 'items', data: false, max: 12, min: 2 },
      { group: 'Style', type: 'slider', key: 'opts.dotRadius', label: 'Dot size', min: 3, max: 14, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.stemWidth', label: 'Stem width', min: 1, max: 8, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.showValue', label: 'Show value labels' },
      { group: 'Axis',  type: 'slider', key: 'opts.max', label: 'Axis maximum', min: 20, max: 200, step: 10 },
      { group: 'Axis',  type: 'slider', key: 'opts.labelWidth', label: 'Label gutter', min: 60, max: 200, step: 10, format: (v) => v + 'px' },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    // The series widget edits {label, color}; give each item a `data` mirror so
    // its value survives an edit through the shared control.
    canvas: {
      helpers: [inkColor],
      height: 360,
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const items = spec.items;
        const o = spec.opts;
        const pad = { t: 20, r: 44, b: 34, l: o.labelWidth };
        const cw = W - pad.l - pad.r;
        const ch = H - pad.t - pad.b;
        const rowH = ch / Math.max(1, items.length);
        const toX = (v) => pad.l + (v / o.max) * cw;

        ctx.font = '10px "DM Sans", system-ui, sans-serif';
        for (let v = 0; v <= o.max; v += o.max / 5) {
          const x = toX(v);
          ctx.strokeStyle = 'rgba(128,128,128,.14)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, pad.t);
          ctx.lineTo(x, H - pad.b);
          ctx.stroke();
          ctx.fillStyle = ink(0.75);
          ctx.textAlign = 'center';
          ctx.fillText(String(Math.round(v)), x, H - pad.b + 16);
        }

        items.forEach((d, i) => {
          const y = pad.t + rowH * (i + 0.5);
          const x = toX(d.value);
          // The whole row, not just the dot: a 5px target is not a target.
          tip(0, y - rowH / 2, W, rowH, d.label + ': ' + d.value);

          ctx.strokeStyle = d.color + '88';
          ctx.lineWidth = o.stemWidth;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(pad.l, y);
          ctx.lineTo(x, y);
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(x, y, o.dotRadius, 0, Math.PI * 2);
          ctx.fillStyle = d.color;
          ctx.fill();

          ctx.fillStyle = ink(0.95);
          ctx.font = '12px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(d.label, pad.l - 12, y + 4);

          if (o.showValue) {
            ctx.fillStyle = d.color;
            ctx.textAlign = 'left';
            ctx.font = '500 11px "DM Sans", system-ui, sans-serif';
            ctx.fillText(String(d.value), x + o.dotRadius + 6, y + 4);
          }
        });
      },
    },
    legend: () => null,
  },
];

/* The lollipop's series control edits `label` and `color`; keep `value` in
   step when a row is added so a new item lands somewhere sensible. */
barCharts.find((c) => c.id === 'bar-lollipop').onChange = (spec) => {
  spec.items.forEach((it, i) => {
    if (typeof it.value !== 'number') it.value = 50;
    if (!it.color) it.color = paletteAt(i);
  });
};
