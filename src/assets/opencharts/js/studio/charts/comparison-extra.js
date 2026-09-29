/**
 * Further comparison charts: dumbbell, Pareto, span, error bars, connected
 * scatter, quadrant, timeline and calendar heatmap.
 */

import { C, MONTHS, withAlpha } from '../palette.js';
import { CALENDAR_DAYS } from './_data.js';
import { baseOpts, xAxis, yAxis, TICK } from '../chartjs-base.js';
import { tickFormat, srcFn } from '../serialize.js';

function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function next() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
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

export const comparisonExtraCharts = [
  {
    id: 'dumbbell',
    title: 'Dumbbell',
    category: 'Comparison',
    blurb: 'Two dots joined by a rule. The gap is the point, which is exactly what a paired bar chart buries.',
    tags: ['dumbbell', 'dot plot', 'before after', 'gap', 'paired', 'change'],
    spec: {
      rows: [
        { label: 'Germany',       start: 62, end: 78 },
        { label: 'France',        start: 58, end: 69 },
        { label: 'Italy',         start: 44, end: 61 },
        { label: 'Spain',         start: 51, end: 72 },
        { label: 'Netherlands',   start: 70, end: 81 },
        { label: 'Poland',        start: 39, end: 58 },
        { label: 'Sweden',        start: 74, end: 85 },
      ],
      startLabel: '2015',
      endLabel: '2025',
      startColor: C.slate,
      endColor: C.green,
      opts: { textColor: '#808080', min: 0, max: 100, dotRadius: 7, barWidth: 3, labelWidth: 108, showDelta: true, sort: 'gap', suffix: '%' },
    },
    controls: [
      { group: 'Data',  type: 'series', key: 'rows', data: false, max: 12, min: 2 },
      { group: 'Data',  type: 'text',   key: 'startLabel', label: 'First period name' },
      { group: 'Data',  type: 'text',   key: 'endLabel',   label: 'Second period name' },
      { group: 'Order', type: 'seg',    key: 'opts.sort', label: 'Sort rows by',
        options: [{ value: 'gap', label: 'Gap' }, { value: 'end', label: 'Latest' }, { value: 'none', label: 'As listed' }] },
      { group: 'Style', type: 'colors', key: 'ends', label: 'Dot colours', names: (s) => [s.startLabel, s.endLabel] },
      { group: 'Style', type: 'slider', key: 'opts.dotRadius', label: 'Dot size', min: 3, max: 13, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.barWidth', label: 'Connector width', min: 1, max: 10, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.showDelta', label: 'Show the change' },
      { group: 'Axis',  type: 'slider', key: 'opts.max', label: 'Axis maximum', min: 20, max: 300, step: 10 },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    onInit(spec) { spec.ends = [spec.startColor, spec.endColor]; },
    onChange(spec) {
      [spec.startColor, spec.endColor] = spec.ends;
      spec.rows.forEach((r, i) => {
        if (typeof r.start !== 'number') { r.start = 40 + i * 3; r.end = r.start + 12; }
      });
    },
    canvas: {
      helpers: [inkColor],
      height: 380,
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        let rows = spec.rows.slice();
        if (o.sort === 'gap') rows.sort((a, b) => (b.end - b.start) - (a.end - a.start));
        else if (o.sort === 'end') rows.sort((a, b) => b.end - a.end);
        if (!rows.length) return;

        const pad = { t: 30, r: o.showDelta ? 62 : 22, b: 30, l: o.labelWidth };
        const cw = W - pad.l - pad.r;
        const ch = H - pad.t - pad.b;
        const rowH = ch / rows.length;
        const toX = (v) => pad.l + ((v - o.min) / (o.max - o.min)) * cw;

        ctx.font = '10px "DM Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (let k = 0; k <= 5; k++) {
          const v = o.min + ((o.max - o.min) / 5) * k;
          const x = toX(v);
          ctx.strokeStyle = 'rgba(128,128,128,.12)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, pad.t - 8);
          ctx.lineTo(x, pad.t + ch);
          ctx.stroke();
          ctx.fillStyle = ink(0.75);
          ctx.fillText(Math.round(v) + o.suffix, x, H - pad.b + 18);
        }

        rows.forEach((r, i) => {
          const y = pad.t + rowH * i + rowH / 2;
          const x1 = toX(r.start);
          const x2 = toX(r.end);
          // The gap is the point of a dumbbell, so name it rather than making
          // the reader subtract two numbers they have to hover separately.
          tip(0, pad.t + rowH * i, W, rowH, [
            r.label,
            spec.startLabel + ': ' + r.start,
            spec.endLabel + ': ' + r.end,
            'change ' + (r.end - r.start > 0 ? '+' : '') + (r.end - r.start).toFixed(1),
          ].join('\n'));

          ctx.strokeStyle = 'rgba(128,128,128,.45)';
          ctx.lineWidth = o.barWidth;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x1, y);
          ctx.lineTo(x2, y);
          ctx.stroke();

          [[x1, spec.startColor], [x2, spec.endColor]].forEach(([x, col]) => {
            ctx.beginPath();
            ctx.arc(x, y, o.dotRadius, 0, Math.PI * 2);
            ctx.fillStyle = col;
            ctx.fill();
          });

          ctx.fillStyle = ink(0.95);
          ctx.font = '12px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(r.label, pad.l - 14, y + 4);

          if (o.showDelta) {
            const d = r.end - r.start;
            ctx.fillStyle = d >= 0 ? '#16916A' : '#CE5229';
            ctx.font = '500 11px "DM Sans", system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText((d >= 0 ? '+' : '') + d.toFixed(0), W - pad.r + 12, y + 4);
          }
        });
      },
    },
    legend: (spec) => [
      { label: spec.startLabel, color: spec.startColor, toggleable: false },
      { label: spec.endLabel,   color: spec.endColor,   toggleable: false },
    ],
  },

  {
    id: 'pareto',
    title: 'Pareto Chart',
    category: 'Comparison',
    blurb: 'Sorted bars with a cumulative curve. Finds the few causes behind most of the effect.',
    tags: ['pareto', '80/20', 'cumulative', 'quality', 'root cause', 'sorted'],
    spec: {
      items: [
        { label: 'Shipping delay',   value: 142 },
        { label: 'Wrong item',       value: 98 },
        { label: 'Damaged',          value: 76 },
        { label: 'Sizing',           value: 54 },
        { label: 'Late refund',      value: 33 },
        { label: 'Payment failed',   value: 21 },
        { label: 'Other',           value: 14 },
      ],
      barColor: C.violet,
      lineColor: C.amber,
      opts: { radius: 3, thickness: 0.7, threshold: 80, showThreshold: true, lineWidth: 2.5, pointRadius: 4 },
    },
    controls: [
      { group: 'Data',  type: 'series', key: 'items', data: false, max: 12, min: 2 },
      { group: 'Style', type: 'colors', key: 'paretoColors', label: 'Bars / curve', names: () => ['Bars', 'Cumulative'] },
      { group: 'Style', type: 'slider', key: 'opts.radius', label: 'Corner radius', min: 0, max: 10, step: 1, format: (v) => v + 'px' },
      { group: 'Rule',  type: 'toggle', key: 'opts.showThreshold', label: 'Show threshold line' },
      { group: 'Rule',  type: 'slider', key: 'opts.threshold', label: 'Threshold', min: 50, max: 95, step: 5, format: (v) => v + '%' },
    ],
    onInit(spec) { spec.paretoColors = [spec.barColor, spec.lineColor]; },
    onChange(spec) {
      [spec.barColor, spec.lineColor] = spec.paretoColors;
      spec.items.forEach((it) => { if (typeof it.value !== 'number') it.value = 20; });
    },
    chartjs: {
      build(spec) {
        // A Pareto is only a Pareto once it is sorted descending.
        const items = spec.items.slice().sort((a, b) => b.value - a.value);
        const total = items.reduce((s, i) => s + i.value, 0) || 1;
        let running = 0;
        const cumulative = items.map((i) => {
          running += i.value;
          return +((running / total) * 100).toFixed(1);
        });

        const datasets = [
          {
            type: 'bar',
            label: 'Count',
            data: items.map((i) => i.value),
            backgroundColor: spec.barColor,
            borderRadius: spec.opts.radius,
            borderSkipped: false,
            categoryPercentage: spec.opts.thickness,
            yAxisID: 'y',
            order: 2,
          },
          {
            type: 'line',
            label: 'Cumulative %',
            data: cumulative,
            borderColor: spec.lineColor,
            backgroundColor: 'transparent',
            borderWidth: spec.opts.lineWidth,
            pointRadius: spec.opts.pointRadius,
            pointBackgroundColor: spec.lineColor,
            tension: 0.2,
            yAxisID: 'y2',
            order: 1,
          },
        ];

        if (spec.opts.showThreshold) {
          datasets.push({
            type: 'line',
            label: spec.opts.threshold + '% line',
            data: items.map(() => spec.opts.threshold),
            borderColor: 'rgba(128,128,128,.6)',
            borderDash: [5, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            yAxisID: 'y2',
            order: 0,
          });
        }

        return {
          type: 'bar',
          data: { labels: items.map((i) => i.label), datasets },
          options: baseOpts({
            scales: {
              x: xAxis({ ticks: { ...TICK, maxRotation: 40, font: { size: 10 } } }),
              y: yAxis({ ticks: { ...TICK } }),
              y2: {
                position: 'right',
                min: 0,
                max: 100,
                ticks: { ...TICK, callback: tickFormat({ suffix: '%' }) },
                grid: { display: false },
                border: { display: false },
              },
            },
          }),
        };
      },
    },
    legend: (spec) => [
      { label: 'Count', color: spec.barColor, datasetIndex: 0 },
      { label: 'Cumulative %', color: spec.lineColor, line: true, datasetIndex: 1 },
    ],
  },

  {
    id: 'span-chart',
    title: 'Span Chart',
    category: 'Comparison',
    blurb: 'Range only — the minimum and maximum, with the body of the bar removed. Emphasises spread, not size.',
    tags: ['span', 'range', 'min max', 'spread', 'interval', 'floating'],
    spec: {
      rows: [
        { label: 'Reykjavik', min: -3, max: 14 },
        { label: 'London',    min: 3,  max: 24 },
        { label: 'Paris',     min: 2,  max: 27 },
        { label: 'Rome',      min: 6,  max: 32 },
        { label: 'Cairo',     min: 12, max: 38 },
        { label: 'Dubai',     min: 18, max: 44 },
      ],
      lowColor: C.violet,
      highColor: C.amber,
      opts: { textColor: '#808080', min: -10, max: 50, capHeight: 16, lineWidth: 3, labelWidth: 96, showValues: true, suffix: '°C' },
    },
    controls: [
      { group: 'Data',  type: 'series', key: 'rows', data: false, max: 12, min: 2 },
      { group: 'Style', type: 'colors', key: 'spanColors', label: 'Low / high', names: () => ['Minimum', 'Maximum'] },
      { group: 'Style', type: 'slider', key: 'opts.capHeight', label: 'End cap height', min: 0, max: 30, step: 2, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.lineWidth', label: 'Span width', min: 1, max: 10, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.showValues', label: 'Show end values' },
      { group: 'Axis',  type: 'slider', key: 'opts.min', label: 'Axis minimum', min: -40, max: 0, step: 5 },
      { group: 'Axis',  type: 'slider', key: 'opts.max', label: 'Axis maximum', min: 10, max: 120, step: 5 },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    onInit(spec) { spec.spanColors = [spec.lowColor, spec.highColor]; },
    onChange(spec) {
      [spec.lowColor, spec.highColor] = spec.spanColors;
      spec.rows.forEach((r, i) => { if (typeof r.min !== 'number') { r.min = i; r.max = i + 15; } });
    },
    canvas: {
      helpers: [inkColor],
      height: 360,
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const rows = spec.rows;
        if (!rows.length) return;

        const pad = { t: 18, r: 44, b: 32, l: o.labelWidth };
        const cw = W - pad.l - pad.r;
        const ch = H - pad.t - pad.b;
        const rowH = ch / rows.length;
        const toX = (v) => pad.l + ((v - o.min) / (o.max - o.min)) * cw;

        ctx.font = '10px "DM Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (let k = 0; k <= 6; k++) {
          const v = o.min + ((o.max - o.min) / 6) * k;
          const x = toX(v);
          ctx.strokeStyle = v === 0 ? 'rgba(128,128,128,.35)' : 'rgba(128,128,128,.12)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, pad.t);
          ctx.lineTo(x, pad.t + ch);
          ctx.stroke();
          ctx.fillStyle = ink(0.75);
          ctx.fillText(Math.round(v) + o.suffix, x, H - pad.b + 18);
        }

        rows.forEach((r, i) => {
          const y = pad.t + rowH * i + rowH / 2;
          const x1 = toX(r.min);
          const x2 = toX(r.max);
          tip(0, pad.t + rowH * i, W, rowH,
            r.label + ': ' + r.min + '–' + r.max + '  (span ' + (r.max - r.min).toFixed(1) + ')');

          // The span itself, drawn as a gradient between the two end colours.
          const grad = ctx.createLinearGradient(x1, 0, x2, 0);
          grad.addColorStop(0, spec.lowColor);
          grad.addColorStop(1, spec.highColor);
          ctx.strokeStyle = grad;
          ctx.lineWidth = o.lineWidth;
          ctx.lineCap = 'butt';
          ctx.beginPath();
          ctx.moveTo(x1, y);
          ctx.lineTo(x2, y);
          ctx.stroke();

          if (o.capHeight > 0) {
            const half = o.capHeight / 2;
            [[x1, spec.lowColor], [x2, spec.highColor]].forEach(([x, col]) => {
              ctx.strokeStyle = col;
              ctx.lineWidth = o.lineWidth;
              ctx.beginPath();
              ctx.moveTo(x, y - half);
              ctx.lineTo(x, y + half);
              ctx.stroke();
            });
          }

          ctx.fillStyle = ink(0.95);
          ctx.font = '12px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(r.label, pad.l - 14, y + 4);

          if (o.showValues) {
            ctx.font = '500 10px "DM Sans", system-ui, sans-serif';
            ctx.fillStyle = spec.lowColor;
            ctx.textAlign = 'right';
            ctx.fillText(String(r.min), x1 - 8, y + 4);
            ctx.fillStyle = spec.highColor;
            ctx.textAlign = 'left';
            ctx.fillText(String(r.max), x2 + 8, y + 4);
          }
        });
      },
    },
    legend: (spec) => [
      { label: 'Minimum', color: spec.lowColor, toggleable: false },
      { label: 'Maximum', color: spec.highColor, toggleable: false },
    ],
  },

  {
    id: 'error-bars',
    title: 'Bar with Error Bars',
    category: 'Comparison',
    blurb: 'Means with their uncertainty drawn on. A bar without this is a claim without a confidence interval.',
    tags: ['error bars', 'confidence interval', 'uncertainty', 'science', 'mean', 'std'],
    spec: {
      groups: [
        { label: 'Control', color: C.slate,   mean: 42, error: 5 },
        { label: 'Dose A',  color: C.violet,   mean: 51, error: 7 },
        { label: 'Dose B',  color: C.blue,   mean: 63, error: 6 },
        { label: 'Dose C',  color: C.green, mean: 68, error: 11 },
        { label: 'Dose D',  color: C.amber,  mean: 59, error: 9 },
      ],
      opts: { textColor: '#808080', max: 90, barWidth: 0.6, radius: 3, capWidth: 14, errorWidth: 1.8, showValues: true, suffix: '' },
    },
    controls: [
      { group: 'Data',  type: 'series', key: 'groups', data: false, max: 10, min: 1 },
      { group: 'Style', type: 'slider', key: 'opts.barWidth', label: 'Bar width', min: 0.2, max: 0.95, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'slider', key: 'opts.radius', label: 'Corner radius', min: 0, max: 10, step: 1, format: (v) => v + 'px' },
      { group: 'Error', type: 'slider', key: 'opts.capWidth', label: 'Cap width', min: 0, max: 34, step: 2, format: (v) => v + 'px' },
      { group: 'Error', type: 'slider', key: 'opts.errorWidth', label: 'Whisker width', min: 1, max: 5, step: 0.5, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.showValues', label: 'Show values' },
      { group: 'Axis',  type: 'slider', key: 'opts.max', label: 'Axis maximum', min: 20, max: 300, step: 10 },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    onChange(spec) {
      spec.groups.forEach((g, i) => {
        if (typeof g.mean !== 'number') { g.mean = 40 + i * 6; g.error = 6; }
      });
    },
    canvas: {
      helpers: [inkColor],
      height: 360,
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const groups = spec.groups;
        if (!groups.length) return;

        const pad = { t: 22, r: 20, b: 40, l: 52 };
        const cw = W - pad.l - pad.r;
        const ch = H - pad.t - pad.b;
        const slot = cw / groups.length;
        const bw = slot * o.barWidth;
        const toY = (v) => pad.t + ch - (v / o.max) * ch;

        ctx.font = '10px "DM Sans", system-ui, sans-serif';
        for (let k = 0; k <= 5; k++) {
          const v = (o.max / 5) * k;
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

        groups.forEach((g, i) => {
          const cx = pad.l + slot * i + slot / 2;
          const top = toY(g.mean);
          // The interval is the whole reason this chart exists; the bar height
          // alone is the part that misleads.
          tip(pad.l + slot * i, pad.t, slot, H - pad.t - pad.b,
            g.label + ': ' + g.mean + ' ± ' + g.error);

          ctx.beginPath();
          ctx.roundRect(cx - bw / 2, top, bw, pad.t + ch - top, [o.radius, o.radius, 0, 0]);
          ctx.fillStyle = g.color;
          ctx.fill();

          // Whisker from mean−error to mean+error, with optional caps.
          const hi = toY(Math.min(o.max, g.mean + g.error));
          const lo = toY(Math.max(0, g.mean - g.error));
          ctx.strokeStyle = 'rgba(23,22,20,.75)';
          ctx.lineWidth = o.errorWidth;
          ctx.beginPath();
          ctx.moveTo(cx, hi);
          ctx.lineTo(cx, lo);
          ctx.stroke();
          if (o.capWidth > 0) {
            [hi, lo].forEach((y) => {
              ctx.beginPath();
              ctx.moveTo(cx - o.capWidth / 2, y);
              ctx.lineTo(cx + o.capWidth / 2, y);
              ctx.stroke();
            });
          }

          ctx.fillStyle = ink(0.95);
          ctx.font = '12px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(g.label, cx, H - pad.b + 20);

          if (o.showValues) {
            ctx.font = '500 11px "DM Sans", system-ui, sans-serif';
            ctx.fillStyle = ink(0.85);
            ctx.fillText(g.mean + ' ±' + g.error, cx, hi - 8);
          }
        });
      },
    },
    legend: () => null,
  },

  {
    id: 'connected-scatter',
    title: 'Connected Scatter',
    category: 'Scatter',
    blurb: 'A scatter whose points are joined in time order — traces how two variables moved together.',
    tags: ['connected scatter', 'path', 'trajectory', 'two variables', 'time', 'phase'],
    spec: {
      series: [
        {
          label: 'United Kingdom',
          color: C.green,
          points: [[78.2, 24], [78.9, 27], [79.5, 31], [80.1, 34], [80.6, 38], [81.0, 41], [81.3, 45], [81.5, 49], [81.6, 53], [81.9, 58]],
        },
        {
          label: 'Japan',
          color: C.amber,
          points: [[81.9, 19], [82.3, 22], [82.7, 25], [83.0, 27], [83.4, 30], [83.7, 33], [84.0, 36], [84.2, 39], [84.4, 42], [84.6, 46]],
        },
      ],
      labels: ['2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'],
      opts: { pointRadius: 5, lineWidth: 2, tension: 0.25, showArrowEnd: true, xTitle: 'Life expectancy (years)', yTitle: 'Broadband adoption (%)' },
    },
    controls: [
      { group: 'Data',  type: 'series', key: 'series', data: false, max: 4, min: 1 },
      { group: 'Style', type: 'slider', key: 'opts.pointRadius', label: 'Point size', min: 2, max: 10, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.lineWidth', label: 'Line width', min: 1, max: 5, step: 0.5, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.tension', label: 'Tension', min: 0, max: 0.6, step: 0.05, format: (v) => v.toFixed(2) },
      { group: 'Style', type: 'toggle', key: 'opts.showArrowEnd', label: 'Emphasise the last point' },
      { group: 'Axis',  type: 'text',   key: 'opts.xTitle', label: 'X axis title' },
      { group: 'Axis',  type: 'text',   key: 'opts.yTitle', label: 'Y axis title' },
    ],
    onChange(spec) {
      spec.series.forEach((s, i) => {
        if (!Array.isArray(s.points)) {
          s.points = Array.from({ length: 8 }, (_, k) => [70 + i * 3 + k, 20 + k * 4]);
        }
      });
    },
    chartjs: {
      build: (spec) => ({
        type: 'scatter',
        data: {
          datasets: spec.series.map((s) => ({
            label: s.label,
            data: s.points.map(([x, y]) => ({ x, y })),
            // showLine is what turns a scatter into a connected scatter.
            showLine: true,
            borderColor: s.color,
            backgroundColor: s.color,
            borderWidth: spec.opts.lineWidth,
            tension: spec.opts.tension,
            pointRadius: spec.opts.showArrowEnd
              ? s.points.map((_, i) => (i === s.points.length - 1 ? spec.opts.pointRadius + 3 : spec.opts.pointRadius))
              : spec.opts.pointRadius,
            pointHoverRadius: spec.opts.pointRadius + 3,
            pointBackgroundColor: s.color,
          })),
        },
        options: baseOpts({
          interaction: { intersect: true, mode: 'nearest' },
          scales: {
            x: yAxis({
              title: spec.opts.xTitle ? { display: true, text: spec.opts.xTitle, font: { size: 11 }, color: '#8a8880' } : { display: false },
              ticks: { ...TICK },
            }),
            y: yAxis({
              title: spec.opts.yTitle ? { display: true, text: spec.opts.yTitle, font: { size: 11 }, color: '#8a8880' } : { display: false },
              ticks: { ...TICK },
            }),
          },
        }),
      }),
    },
    legend: (spec) => spec.series.map((s, i) => ({ label: s.label, color: s.color, line: true, datasetIndex: i })),
  },

  {
    id: 'quadrant-chart',
    title: 'Quadrant Chart',
    category: 'Scatter',
    blurb: 'A scatter cut into four named zones. The labels do the interpreting, which is the whole appeal — and the risk.',
    tags: ['quadrant', 'matrix', 'magic quadrant', 'prioritisation', 'scatter', 'four box'],
    spec: {
      items: [
        { label: 'Onboarding',   x: 82, y: 78, color: C.green, r: 9 },
        { label: 'Search',       x: 74, y: 34, color: C.blue,   r: 12 },
        { label: 'Billing',      x: 31, y: 71, color: C.amber,  r: 7 },
        { label: 'Reporting',    x: 24, y: 26, color: C.violet,   r: 10 },
        { label: 'Notifications',x: 61, y: 58, color: C.cyan,  r: 6 },
        { label: 'Mobile app',   x: 44, y: 88, color: C.rose,   r: 11 },
        { label: 'Integrations', x: 88, y: 52, color: C.olive,  r: 8 },
      ],
      quadrants: ['Maintain', 'Invest', 'Deprioritise', 'Fix first'],
      opts: { textColor: '#808080', xMid: 50, yMid: 50, max: 100, showLabels: true, alpha: 0.75, tint: 0.045, xTitle: 'Satisfaction', yTitle: 'Importance' },
    },
    controls: [
      { group: 'Data',  type: 'series', key: 'items', data: false, max: 14, min: 1 },
      { group: 'Split', type: 'slider', key: 'opts.xMid', label: 'Vertical split', min: 10, max: 90, step: 1 },
      { group: 'Split', type: 'slider', key: 'opts.yMid', label: 'Horizontal split', min: 10, max: 90, step: 1 },
      { group: 'Style', type: 'toggle', key: 'opts.showLabels', label: 'Show item labels' },
      { group: 'Style', type: 'slider', key: 'opts.tint', label: 'Quadrant tint', min: 0, max: 0.15, step: 0.005, format: (v) => v.toFixed(3) },
      { group: 'Axis',  type: 'text',   key: 'opts.xTitle', label: 'X axis title' },
      { group: 'Axis',  type: 'text',   key: 'opts.yTitle', label: 'Y axis title' },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    onChange(spec) {
      spec.items.forEach((it, i) => {
        if (typeof it.x !== 'number') { it.x = 30 + (i * 13) % 60; it.y = 25 + (i * 17) % 60; it.r = 8; }
      });
    },
    canvas: {
      helpers: [inkColor],
      height: 420,
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const pad = { t: 24, r: 24, b: 42, l: 52 };
        const cw = W - pad.l - pad.r;
        const ch = H - pad.t - pad.b;
        const toX = (v) => pad.l + (v / o.max) * cw;
        const toY = (v) => pad.t + ch - (v / o.max) * ch;
        const mx = toX(o.xMid);
        const my = toY(o.yMid);

        // Faint tints so the four zones read as regions, not just a cross.
        const tintHex = Math.round(o.tint * 255).toString(16).padStart(2, '0');
        const zones = [
          { x: mx, y: pad.t, w: pad.l + cw - mx, h: my - pad.t, c: '#16916A' },
          { x: pad.l, y: pad.t, w: mx - pad.l, h: my - pad.t, c: '#A5720F' },
          { x: pad.l, y: my, w: mx - pad.l, h: pad.t + ch - my, c: '#5A6270' },
          { x: mx, y: my, w: pad.l + cw - mx, h: pad.t + ch - my, c: '#2F76C9' },
        ];
        zones.forEach((z) => {
          ctx.fillStyle = z.c + tintHex;
          ctx.fillRect(z.x, z.y, z.w, z.h);
        });

        ctx.strokeStyle = 'rgba(128,128,128,.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(mx, pad.t); ctx.lineTo(mx, pad.t + ch);
        ctx.moveTo(pad.l, my); ctx.lineTo(pad.l + cw, my);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = 'rgba(128,128,128,.25)';
        ctx.strokeRect(pad.l, pad.t, cw, ch);

        // Quadrant names, tucked into each corner.
        ctx.font = '600 10px "DM Sans", system-ui, sans-serif';
        ctx.fillStyle = ink(0.7);
        const corners = [
          { t: spec.quadrants[0], x: pad.l + cw - 10, y: pad.t + 16, a: 'right' },
          { t: spec.quadrants[1], x: pad.l + 10,      y: pad.t + 16, a: 'left'  },
          { t: spec.quadrants[2], x: pad.l + 10,      y: pad.t + ch - 10, a: 'left'  },
          { t: spec.quadrants[3], x: pad.l + cw - 10, y: pad.t + ch - 10, a: 'right' },
        ];
        corners.forEach((c) => {
          ctx.textAlign = c.a;
          ctx.fillText(String(c.t || '').toUpperCase(), c.x, c.y);
        });

        const alphaHex = Math.round(o.alpha * 255).toString(16).padStart(2, '0');
        spec.items.forEach((it) => {
          const x = toX(it.x);
          const y = toY(it.y);
          // Generous radius: the dot is the mark, but a 4px target is not one.
          tip({ cx: x, cy: y, r: Math.max(12, (it.r || 8) + 4),
            text: it.label + '\n' + spec.xTitle + ': ' + it.x + '\n' + spec.yTitle + ': ' + it.y });
          ctx.beginPath();
          ctx.arc(x, y, it.r || 8, 0, Math.PI * 2);
          ctx.fillStyle = (it.color || '#6C63D8') + alphaHex;
          ctx.fill();
          ctx.strokeStyle = it.color || '#6C63D8';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          if (o.showLabels) {
            ctx.fillStyle = ink(0.95);
            ctx.font = '11px "DM Sans", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(it.label, x, y - (it.r || 8) - 6);
          }
        });

        ctx.fillStyle = ink(0.8);
        ctx.font = '11px "DM Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(o.xTitle, pad.l + cw / 2, H - 10);
        ctx.save();
        ctx.translate(14, pad.t + ch / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(o.yTitle, 0, 0);
        ctx.restore();
      },
    },
    legend: () => null,
  },

  {
    id: 'timeline',
    title: 'Timeline',
    category: 'Comparison',
    blurb: 'Priestley’s chart: one bar per span of time, stacked into lanes. Duration and overlap at a glance.',
    tags: ['timeline', 'priestley', 'gantt', 'events', 'duration', 'history', 'roadmap'],
    spec: {
      events: [
        { label: 'Discovery',      start: 0,  end: 3,  lane: 0, color: C.violet },
        { label: 'Design system',  start: 2,  end: 7,  lane: 1, color: C.green },
        { label: 'Build — core',   start: 5,  end: 14, lane: 0, color: C.blue },
        { label: 'Build — mobile', start: 9,  end: 17, lane: 1, color: C.blue },
        { label: 'Private beta',   start: 13, end: 19, lane: 2, color: C.cyan },
        { label: 'Docs',           start: 15, end: 21, lane: 1, color: C.olive },
        { label: 'Launch',         start: 20, end: 22, lane: 0, color: C.amber },
      ],
      axisLabel: 'Week',
      opts: { textColor: '#808080', min: 0, max: 24, laneHeight: 42, barHeight: 26, radius: 6, showLabels: true, tickStep: 4 },
    },
    controls: [
      { group: 'Data',  type: 'series', key: 'events', data: false, max: 14, min: 1 },
      { group: 'Data',  type: 'text',   key: 'axisLabel', label: 'Axis unit name' },
      { group: 'Style', type: 'slider', key: 'opts.laneHeight', label: 'Lane height', min: 24, max: 80, step: 2, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.barHeight', label: 'Bar height', min: 10, max: 60, step: 2, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.radius', label: 'Corner radius', min: 0, max: 16, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.showLabels', label: 'Show labels on bars' },
      { group: 'Axis',  type: 'slider', key: 'opts.max', label: 'Axis maximum', min: 6, max: 80, step: 2 },
      { group: 'Axis',  type: 'slider', key: 'opts.tickStep', label: 'Tick spacing', min: 1, max: 12, step: 1 },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    onChange(spec) {
      spec.events.forEach((e, i) => {
        if (typeof e.start !== 'number') { e.start = i * 2; e.end = e.start + 4; e.lane = i % 3; }
      });
    },
    canvas: {
      helpers: [inkColor],
      height: 340,
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const events = spec.events;
        if (!events.length) return;

        const lanes = Math.max(1, Math.max(...events.map((e) => (e.lane || 0))) + 1);
        const pad = { t: 20, r: 20, b: 38, l: 20 };
        const cw = W - pad.l - pad.r;
        const toX = (v) => pad.l + ((v - o.min) / (o.max - o.min)) * cw;

        ctx.font = '10px "DM Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (let v = o.min; v <= o.max; v += o.tickStep) {
          const x = toX(v);
          ctx.strokeStyle = 'rgba(128,128,128,.12)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, pad.t);
          ctx.lineTo(x, pad.t + lanes * o.laneHeight);
          ctx.stroke();
          ctx.fillStyle = ink(0.75);
          ctx.fillText(String(v), x, pad.t + lanes * o.laneHeight + 18);
        }
        ctx.fillStyle = ink(0.6);
        ctx.textAlign = 'left';
        ctx.fillText(spec.axisLabel, pad.l, pad.t + lanes * o.laneHeight + 32);

        events.forEach((e) => {
          const x1 = toX(e.start);
          const x2 = toX(e.end);
          const y = pad.t + (e.lane || 0) * o.laneHeight + (o.laneHeight - o.barHeight) / 2;
          const w = Math.max(2, x2 - x1);
          // A short event can be two pixels wide, so the target is padded.
          tip(x1 - 3, y - 3, w + 6, o.barHeight + 6,
            e.label + '\n' + e.start + ' – ' + e.end + '  (' + (e.end - e.start) + ')');

          ctx.beginPath();
          ctx.roundRect(x1, y, w, o.barHeight, o.radius);
          ctx.fillStyle = (e.color || '#6C63D8') + 'dd';
          ctx.fill();

          if (o.showLabels) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x1, y, w, o.barHeight);
            ctx.clip();
            ctx.fillStyle = '#ffffff';
            ctx.font = '500 11px "DM Sans", system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(e.label, x1 + 8, y + o.barHeight / 2 + 4);
            ctx.restore();
          }
        });
      },
    },
    legend: () => null,
  },

  {
    id: 'calendar-heatmap',
    title: 'Calendar Heatmap',
    category: 'Comparison',
    blurb: 'A year as a grid of weeks. Made famous by contribution graphs; good for any daily count.',
    tags: ['calendar', 'heatmap', 'year', 'daily', 'github', 'contributions', 'streak'],
    spec: {
      year: 2025,
      // Keyed by ISO date, which is what the data editor writes and what
      // anyone exporting a contribution graph already has.
      dayValues: Object.fromEntries(CALENDAR_DAYS.map((v, i) => [
        new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10), v,
      ])),
      color: C.blue,
      opts: { textColor: '#808080', cell: 13, gap: 3, radius: 2, weekdayLabels: true, monthLabels: true, minAlpha: 0.08 },
    },
    controls: [
      { group: 'Year',  type: 'slider', key: 'year', label: 'Year', min: 2015, max: 2030, step: 1 },
      { group: 'Style', type: 'colors', key: 'calColor', label: 'Scale colour' },
      { group: 'Style', type: 'slider', key: 'opts.cell', label: 'Cell size', min: 7, max: 22, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.gap', label: 'Cell gap', min: 0, max: 6, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.monthLabels', label: 'Month labels' },
      { group: 'Style', type: 'toggle', key: 'opts.weekdayLabels', label: 'Weekday labels' },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    onInit(spec) { spec.calColor = [spec.color]; },
    onChange(spec) { spec.color = spec.calColor[0]; },
    canvas: {
      height: 220,
      helpers: [inkColor],
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const step = o.cell + o.gap;
        const left = o.weekdayLabels ? 30 : 6;
        const top = o.monthLabels ? 22 : 6;

        const jan1 = new Date(Date.UTC(spec.year, 0, 1));
        const dec31 = new Date(Date.UTC(spec.year, 11, 31));
        const dayMs = 86400000;
        const days = Math.round((dec31 - jan1) / dayMs) + 1;
        // Grid columns are ISO weeks; row 0 is Monday.
        const firstCol = (jan1.getUTCDay() + 6) % 7;

        // A date with no entry is a zero, not a gap: a contribution grid is
        // only readable when every square of the year is drawn.
        const values = [];
        let maxV = 1;
        for (let i = 0; i < days; i++) {
          const iso = new Date(jan1.getTime() + i * dayMs).toISOString().slice(0, 10);
          const v = Math.max(0, Number(spec.dayValues[iso]) || 0);
          values.push(v);
          if (v > maxV) maxV = v;
        }

        const rgb = (() => {
          const c = spec.color.replace('#', '');
          return [0, 2, 4].map((k) => parseInt(c.slice(k, k + 2), 16));
        })();

        const monthAtCol = {};
        for (let i = 0; i < days; i++) {
          const d = new Date(jan1.getTime() + i * dayMs);
          const dow = (d.getUTCDay() + 6) % 7;
          const col = Math.floor((i + firstCol) / 7);
          const x = left + col * step;
          const y = top + dow * step;
          const t = values[i] / maxV;
          const alpha = values[i] === 0 ? o.minAlpha : o.minAlpha + t * (1 - o.minAlpha);
          // A 13px square with no label is unreadable without this.
          tip(x, y, o.cell, o.cell,
            d.toISOString().slice(0, 10) + ': ' + values[i]);

          ctx.beginPath();
          ctx.roundRect(x, y, o.cell, o.cell, o.radius);
          ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`;
          ctx.fill();

          if (d.getUTCDate() === 1) monthAtCol[col] = d.getUTCMonth();
        }

        if (o.monthLabels) {
          ctx.fillStyle = ink(0.8);
          ctx.font = '10px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'left';
          const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          Object.keys(monthAtCol).forEach((col) => {
            ctx.fillText(names[monthAtCol[col]], left + Number(col) * step, 12);
          });
        }

        if (o.weekdayLabels) {
          ctx.fillStyle = ink(0.7);
          ctx.font = '9px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'right';
          ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].forEach((name, i) => {
            if (!name) return;
            ctx.fillText(name, left - 6, top + i * step + o.cell - 2);
          });
        }
      },
    },
    legend: (spec) => [
      { label: 'Quiet', color: withAlpha(spec.color, 0.15), toggleable: false },
      { label: 'Busy',  color: spec.color, toggleable: false },
    ],
  },
];
