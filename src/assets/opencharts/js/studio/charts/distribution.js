/**
 * Distribution chart definitions: histogram, box plot, violin, heatmap.
 *
 * Every one of these draws from real observations held in the spec. They used
 * to sample from a seeded generator instead, which meant the "Points per
 * group" and "Sample seed" sliders were the only data controls — and nobody's
 * actual measurements could ever get in.
 */

import { C, DAYS, withAlpha } from '../palette.js';
import { baseOpts, xAxis, yAxis, TICK } from '../chartjs-base.js';
import { tickFormat, srcFn } from '../serialize.js';
import { HISTOGRAM_VALUES, BOX_GROUPS, VIOLIN_GROUPS, HEATMAP_CELLS } from './_data.js';

/* ── Helpers shared with the exported code ───────────────────────────────── */
/* Declared as plain functions so they serialise cleanly into the JS tab. */

const UNSAFE_JS_CHAR_MAP = {
  '<': '\\u003C',
  '>': '\\u003E',
  '/': '\\u002F',
  '\\': '\\\\',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\0': '\\0',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

function escapeUnsafeChars(str) {
  return String(str).replace(/[<>\/\\\b\f\n\r\t\0\u2028\u2029]/g, (x) => UNSAFE_JS_CHAR_MAP[x]);
}

function kde(data, min, max, bandwidth, step) {
  const points = [];
  const norm = bandwidth * Math.sqrt(2 * Math.PI);
  for (let v = min; v <= max; v += step) {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const z = (v - data[i]) / bandwidth;
      sum += Math.exp(-0.5 * z * z) / norm;
    }
    points.push({ v: v, d: sum / data.length });
  }
  return points;
}

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next !== undefined ? sorted[base] + rest * (next - sorted[base]) : sorted[base];
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

export const distributionCharts = [
  {
    id: 'histogram',
    title: 'Histogram',
    category: 'Distribution',
    blurb: 'Counts per bucket. Bin width is a real editorial choice — change it and see.',
    tags: ['histogram', 'distribution', 'bins', 'frequency', 'ages'],
    spec: {
      groups: [{ label: 'Customers', color: C.green, values: [...HISTOGRAM_VALUES] }],
      bins: 10,
      min: 18,
      max: 75,
      color: C.green,
      opts: { radius: 2, alpha: 0.8 },
    },
    controls: [
      { group: 'Bins',  type: 'slider', key: 'bins', label: 'Bin count', min: 4, max: 40, step: 1 },
      { group: 'Bins',  type: 'slider', key: 'min', label: 'Range from', min: 0, max: 100, step: 1 },
      { group: 'Bins',  type: 'slider', key: 'max', label: 'Range to', min: 10, max: 200, step: 1 },
      { group: 'Style', type: 'colors', key: 'barColor', label: 'Bar colour' },
      { group: 'Style', type: 'slider', key: 'opts.radius', label: 'Corner radius', min: 0, max: 8, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.alpha', label: 'Fill opacity', min: 0.3, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
    ],
    onInit(spec) { spec.barColor = [spec.color]; },
    onChange(spec) { spec.color = spec.barColor[0]; },
    chartjs: {
      build(spec) {
        const width = (spec.max - spec.min) / spec.bins;
        const decimals = Math.min(12, Math.max(0, 1 - Math.floor(Math.log10(width))));
        const bins = Array.from({ length: spec.bins }, (_, i) => ({
          label: `${Number((spec.min + i * width).toFixed(decimals))}–${Number((spec.min + (i + 1) * width).toFixed(decimals))}`,
          count: 0,
        }));
        const feed = (spec.groups[0] && spec.groups[0].values) || [];
        feed.forEach((raw) => {
          const v = Number(raw);
          if (v < spec.min || v > spec.max) return;
          bins[Math.min(Math.floor((v - spec.min) / width), spec.bins - 1)].count++;
        });
        return {
          type: 'bar',
          data: {
            labels: bins.map((b) => b.label),
            datasets: [{
              // The group's own name, so renaming the column in the data editor
              // renames the series too.
              label: (spec.groups[0] && spec.groups[0].label) || 'Values',
              data: bins.map((b) => b.count),
              backgroundColor: withAlpha(spec.color, spec.opts.alpha),
              borderColor: spec.color,
              borderWidth: 1,
              borderRadius: spec.opts.radius,
              borderSkipped: false,
              // Histogram bars touch: the axis is continuous, not categorical.
              categoryPercentage: 1,
              barPercentage: 1,
            }],
          },
          options: baseOpts({
            scales: {
              x: xAxis({ ticks: { ...TICK, maxRotation: 45, autoSkip: spec.bins > 14 } }),
              y: yAxis({ ticks: { ...TICK, callback: tickFormat({ separator: true }) } }),
            },
            plugins: {
              tooltip: { callbacks: { title: (ctx) => 'Range ' + ctx[0].label } },
            },
          }),
        };
      },
    },
    legend: () => null,
  },

  {
    id: 'box-plot',
    title: 'Box Plot',
    category: 'Distribution',
    blurb: 'Median, quartiles, whiskers and outliers — five numbers that survive skew.',
    tags: ['box plot', 'quartiles', 'median', 'outliers', 'distribution'],
    spec: {
      groups: BOX_GROUPS.map((g, i) => ({
        ...g, color: [C.green, C.blue, C.amber, C.violet, C.cyan][i % 5],
      })),
      opts: { alpha: 0.27, borderWidth: 1.5, outlierRadius: 3, prefix: '$' },
    },
    controls: [
      { group: 'Series', type: 'series', key: 'groups', data: false, max: 7, min: 2 },
      { group: 'Style', type: 'slider', key: 'opts.alpha', label: 'Box fill', min: 0.05, max: 0.7, step: 0.02, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'slider', key: 'opts.outlierRadius', label: 'Outlier size', min: 1, max: 7, step: 1, format: (v) => v + 'px' },
      { group: 'Axis',  type: 'text',   key: 'opts.prefix', label: 'Value prefix' },
    ],
    chartjs: {
      plugins: ['boxplot'],
      build(spec) {
        return {
          type: 'boxplot',
          data: {
            labels: spec.groups.map((g) => g.label),
            datasets: spec.groups.map((g) => {
              const values = g.values || [];
              return {
                label: g.label,
                // The boxplot controller takes one array of raw values per slot.
                data: [values],
                backgroundColor: withAlpha(g.color, spec.opts.alpha),
                borderColor: g.color,
                borderWidth: spec.opts.borderWidth,
                outlierBackgroundColor: g.color,
                outlierBorderColor: g.color,
                outlierRadius: spec.opts.outlierRadius,
                medianColor: g.color,
                itemRadius: 0,
              };
            }),
          },
          options: baseOpts({
            interaction: { intersect: false, mode: 'nearest' },
            scales: {
              x: xAxis(),
              y: yAxis({ ticks: { ...TICK, callback: tickFormat({ prefix: spec.opts.prefix }) } }),
            },
          }),
        };
      },
    },
    legend: (spec) => spec.groups.map((g, i) => ({ label: g.label, color: g.color, datasetIndex: i })),
  },

  {
    id: 'violin',
    title: 'Violin',
    category: 'Distribution',
    blurb: 'A mirrored kernel density estimate. Shows shape a box plot flattens — bimodality, skew.',
    tags: ['violin', 'kde', 'density', 'distribution', 'session length'],
    spec: {
      groups: VIOLIN_GROUPS.map((g, i) => ({
        ...g, color: [C.green, C.blue, C.amber, C.violet, C.cyan][i % 5],
      })),
      opts: { textColor: '#808080', min: 0, max: 18, bandwidth: 0.8, alpha: 0.22, showBox: true, suffix: 'm' },
    },
    controls: [
      { group: 'Series', type: 'series', key: 'groups', data: false, max: 5, min: 1 },
      { group: 'Shape', type: 'slider', key: 'opts.bandwidth', label: 'Smoothing', min: 0.2, max: 2.5, step: 0.1, format: (v) => v.toFixed(1) },
      { group: 'Shape', type: 'slider', key: 'opts.alpha', label: 'Fill opacity', min: 0.05, max: 0.6, step: 0.02, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Shape', type: 'toggle', key: 'opts.showBox', label: 'Show quartile box' },
      { group: 'Axis',  type: 'slider', key: 'opts.max', label: 'Axis maximum', min: 5, max: 60, step: 1 },
      { group: 'Axis',  type: 'text',   key: 'opts.suffix', label: 'Value suffix' },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    canvas: {
      height: 360,
      helpers: [kde, quantile, inkColor],
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const pad = { t: 18, r: 24, b: 34, l: 46 };
        const colW = (W - pad.l - pad.r) / Math.max(1, spec.groups.length);
        const toY = (v) => H - pad.b - ((v - o.min) / (o.max - o.min)) * (H - pad.t - pad.b);

        // Value grid first so the shapes sit on top of it.
        ctx.font = '10px "DM Sans", system-ui, sans-serif';
        const stepV = (o.max - o.min) / 6;
        for (let v = o.min; v <= o.max + 0.001; v += stepV) {
          const y = toY(v);
          ctx.strokeStyle = 'rgba(128,128,128,.13)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pad.l, y);
          ctx.lineTo(W - pad.r, y);
          ctx.stroke();
          ctx.fillStyle = ink(0.75);
          ctx.textAlign = 'right';
          ctx.fillText(Math.round(v) + o.suffix, pad.l - 6, y + 4);
        }

        spec.groups.forEach((g, gi) => {
          const data = g.values || [];
          if (!data.length) return;

          const cx = pad.l + colW * gi + colW / 2;
          // A distribution's summary is what the shape is *for*, so the hover
          // gives the five numbers the silhouette only implies.
          const sorted = data.slice().sort((p, q) => p - q);
          tip(cx - colW / 2, pad.t, colW, H - pad.t - pad.b, [
            g.label,
            'n = ' + sorted.length,
            'median ' + quantile(sorted, 0.5).toFixed(1) + o.suffix,
            'q1–q3 ' + quantile(sorted, 0.25).toFixed(1) + '–' + quantile(sorted, 0.75).toFixed(1),
            'range ' + sorted[0].toFixed(1) + '–' + sorted[sorted.length - 1].toFixed(1),
          ].join('\n'));
          const pts = kde(data, o.min, o.max, o.bandwidth, (o.max - o.min) / 60);
          const maxD = pts.reduce((m, p) => Math.max(m, p.d), 0) || 1;
          const scale = (colW * 0.42) / maxD;

          ctx.beginPath();
          pts.forEach((p, i) => {
            const x = cx + p.d * scale;
            const y = toY(p.v);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          for (let i = pts.length - 1; i >= 0; i--) {
            ctx.lineTo(cx - pts[i].d * scale, toY(pts[i].v));
          }
          ctx.closePath();
          const alphaHex = Math.round(o.alpha * 255).toString(16).padStart(2, '0');
          ctx.fillStyle = g.color + alphaHex;
          ctx.fill();
          ctx.strokeStyle = g.color;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          if (o.showBox) {
            const sorted = data.slice().sort((a, b) => a - b);
            const med = quantile(sorted, 0.5);
            const q1 = quantile(sorted, 0.25);
            const q3 = quantile(sorted, 0.75);
            ctx.fillStyle = g.color;
            ctx.fillRect(cx - 3, toY(q3), 6, Math.max(1, toY(q1) - toY(q3)));
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx - 7, toY(med));
            ctx.lineTo(cx + 7, toY(med));
            ctx.stroke();
          }

          ctx.fillStyle = ink(0.95);
          ctx.font = '12px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(g.label, cx, H - 10);
        });
      },
    },
    legend: (spec) => spec.groups.map((g) => ({ label: g.label, color: g.color, toggleable: false })),
  },

  {
    id: 'heatmap',
    title: 'Heatmap',
    category: 'Distribution',
    blurb: 'Density across two categorical axes. Colour carries the value, position carries the key.',
    tags: ['heatmap', 'matrix', 'density', 'calendar', 'tickets'],
    spec: {
      rows: [...DAYS],
      cols: Array.from({ length: 24 }, (_, h) => String(h)),
      // Flat {x, y, v} is what the matrix controller reads, and what the data
      // editor's `matrix` shape writes — so pasted grids need no translation.
      cells: HEATMAP_CELLS.flatMap((row, y) => row.map((v, x) => ({ x, y, v }))),
      color: C.green,
      opts: { gap: 2, minAlpha: 0.12 },
    },
    controls: [
      { group: 'Style', type: 'colors', key: 'heatColor', label: 'Scale colour' },
      { group: 'Style', type: 'slider', key: 'opts.gap', label: 'Cell gap', min: 0, max: 8, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.minAlpha', label: 'Floor opacity', min: 0, max: 0.5, step: 0.02, format: (v) => Math.round(v * 100) + '%' },
    ],
    onInit(spec) { spec.heatColor = [spec.color]; },
    onChange(spec) { spec.color = spec.heatColor[0]; },
    chartjs: {
      plugins: ['matrix'],
      build(spec) {
        const o = spec.opts;
        const rows = spec.rows;
        const cols = spec.cols;
        const data = spec.cells;
        const maxV = data.reduce((m, d) => Math.max(m, d.v), 1);
        const { r, g, b } = hexToRgb(spec.color);
        const labelsJSON = escapeUnsafeChars(JSON.stringify(rows));
        const colsJSON = escapeUnsafeChars(JSON.stringify(cols));

        // These callbacks are both executed live and printed into the exported
        // code, so every value they need is baked in as a literal rather than
        // captured from this scope — a closure would export as a dangling name.
        const fillFn = srcFn(
          `(ctx) => {\n`
          + `  const cell = ctx.dataset.data[ctx.dataIndex];\n`
          + `  if (!cell) return 'transparent';\n`
          + `  const t = cell.v / ${maxV};\n`
          + `  const alpha = ${o.minAlpha} + t * ${(1 - o.minAlpha).toFixed(3)};\n`
          + `  return 'rgba(${r}, ${g}, ${b}, ' + alpha.toFixed(3) + ')';\n`
          + `}`,
        );

        return {
          type: 'matrix',
          data: {
            datasets: [{
              label: 'Value',
              data,
              backgroundColor: fillFn,
              borderColor: 'transparent',
              borderWidth: o.gap,
              width: srcFn(`(ctx) => (ctx.chart.chartArea ? ctx.chart.chartArea.width : 400) / ${cols.length}`),
              height: srcFn(`(ctx) => (ctx.chart.chartArea ? ctx.chart.chartArea.height : 200) / ${rows.length}`),
            }],
          },
          options: baseOpts({
            interaction: { intersect: true, mode: 'nearest' },
            scales: {
              // `offset: true` pads the scale by half a step at each end so a
              // cell centred on an integer sits fully inside the plot — and it
              // keeps the ticks on whole numbers, which the label callbacks
              // below depend on.
              x: {
                type: 'linear', offset: true, min: 0, max: cols.length - 1,
                ticks: { ...TICK, stepSize: Math.max(1, Math.round(cols.length / 8)), autoSkip: false, callback: srcFn(`(v) => (${colsJSON})[v] ?? ''`) },
                grid: { display: false }, border: { display: false },
              },
              y: {
                type: 'linear', offset: true, min: 0, max: rows.length - 1, reverse: true,
                ticks: { ...TICK, stepSize: 1, autoSkip: false, callback: srcFn(`(v) => (${labelsJSON})[v] || ''`) },
                grid: { display: false }, border: { display: false },
              },
            },
            plugins: {
              tooltip: {
                callbacks: {
                  title: srcFn(`(ctx) => (${labelsJSON})[ctx[0].raw.y] + ' · ' + (${colsJSON})[ctx[0].raw.x]`),
                  label: srcFn(`(ctx) => String(ctx.raw.v)`),
                },
              },
            },
          }),
        };
      },
    },
    legend: (spec) => [
      { label: 'Low',  color: withAlpha(spec.color, Math.max(0.12, spec.opts.minAlpha)), toggleable: false },
      { label: 'High', color: spec.color, toggleable: false },
    ],
  },
];

function hexToRgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
