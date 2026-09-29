/**
 * Additional time-series charts: normalised area, step area, fan chart,
 * horizon, spiral and sparkline.
 *
 * The last three are all answers to the same problem — too much time series
 * for the space available — solved by folding (horizon), coiling (spiral) or
 * stripping away everything but the shape (sparkline).
 */

import { C, MONTHS, withAlpha } from '../palette.js';
import { HORIZON_ROWS, SPIRAL_VALUES } from './_data.js';
import { baseOpts, xAxisFor, axisLabels, yAxis, TICK } from '../chartjs-base.js';
import { tickFormat, srcFn } from '../serialize.js';

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

export const timeseriesCharts = [
  {
    id: 'area-100stacked',
    title: '100% Stacked Area',
    category: 'Line & Area',
    blurb: 'Share of total over time. Every column sums to 100, so only the mix moves.',
    tags: ['area', 'stacked', 'percentage', 'share', 'composition', 'normalised'],
    spec: {
      labels: [...MONTHS],
      series: [
        { label: 'Organic', color: C.green, data: [4200, 4400, 4500, 4800, 5100, 5600, 5900, 6100, 6000, 6300, 6600, 7000] },
        { label: 'Paid',    color: C.blue,   data: [2100, 2250, 2200, 2400, 2600, 2900, 3100, 3300, 3200, 3400, 3500, 3700] },
        { label: 'Social',  color: C.amber,  data: [1200, 1300, 1350, 1450, 1600, 1700, 1750, 1900, 2000, 2100, 2150, 2300] },
        { label: 'Email',   color: C.violet,   data: [800, 830, 860, 900, 950, 1000, 1050, 1100, 1120, 1180, 1220, 1300] },
      ],
      opts: { tension: 0.35, fillAlpha: 0.75, lineWidth: 1, points: false },
    },
    controls: [
      { group: 'Data',  type: 'labels', key: 'labels', label: 'Period labels' },
      { group: 'Data',  type: 'series', key: 'series', data: true, max: 7 },
      { group: 'Style', type: 'slider', key: 'opts.tension', label: 'Tension', min: 0, max: 1, step: 0.05, format: (v) => v.toFixed(2) },
      { group: 'Style', type: 'slider', key: 'opts.fillAlpha', label: 'Fill opacity', min: 0.2, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'toggle', key: 'opts.points', label: 'Show data points' },
    ],
    chartjs: {
      build(spec) {
        // Normalise here rather than in the data, so the controls keep showing
        // the raw counts the user typed.
        const totals = spec.labels.map((_, i) =>
          spec.series.reduce((sum, s) => sum + (s.data[i] || 0), 0) || 1);
        return {
          type: 'line',
          data: {
            labels: axisLabels(spec.labels),
            datasets: spec.series.map((s) => ({
              label: s.label,
              data: spec.labels.map((_, i) => +(((s.data[i] || 0) / totals[i]) * 100).toFixed(2)),
              borderColor: s.color,
              backgroundColor: withAlpha(s.color, spec.opts.fillAlpha),
              fill: true,
              tension: spec.opts.tension,
              borderWidth: spec.opts.lineWidth,
              pointRadius: spec.opts.points ? 3 : 0,
              pointBackgroundColor: s.color,
            })),
          },
          options: baseOpts({
            scales: {
              x: xAxisFor(spec.labels),
              y: yAxis({ stacked: true, min: 0, max: 100, ticks: { ...TICK, callback: tickFormat({ suffix: '%' }) } }),
            },
            plugins: {
              tooltip: { callbacks: { label: srcFn(`(ctx) => ' ' + ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + '%'`) } },
            },
          }),
        };
      },
    },
    legend: (spec) => spec.series.map((s, i) => ({ label: s.label, color: s.color, datasetIndex: i })),
  },

  {
    id: 'step-area',
    title: 'Step Area',
    category: 'Line & Area',
    blurb: 'A stepped line with the space beneath filled — discrete states that hold, then change.',
    tags: ['step', 'area', 'stepped', 'states', 'headcount', 'capacity'],
    spec: {
      labels: [...MONTHS],
      series: [
        { label: 'Provisioned seats', color: C.violet, data: [50, 50, 75, 75, 75, 100, 100, 100, 150, 150, 200, 200] },
        { label: 'Seats in use',      color: C.blue, data: [42, 47, 58, 66, 71, 78, 88, 95, 112, 130, 158, 181] },
      ],
      opts: { fillAlpha: 0.2, lineWidth: 2, stepMode: 'before', points: true, pointRadius: 3, suffix: '' },
    },
    controls: [
      { group: 'Data',  type: 'labels', key: 'labels', label: 'Period labels' },
      { group: 'Data',  type: 'series', key: 'series', data: true, max: 5 },
      { group: 'Style', type: 'seg',    key: 'opts.stepMode', label: 'Step position',
        options: [{ value: 'before', label: 'Before' }, { value: 'middle', label: 'Middle' }, { value: 'after', label: 'After' }] },
      { group: 'Style', type: 'slider', key: 'opts.fillAlpha', label: 'Fill opacity', min: 0.05, max: 0.7, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'toggle', key: 'opts.points', label: 'Show data points' },
      { group: 'Axis',  type: 'text',   key: 'opts.suffix', label: 'Value suffix' },
    ],
    chartjs: {
      build: (spec) => ({
        type: 'line',
        data: {
          labels: axisLabels(spec.labels),
          datasets: spec.series.map((s) => ({
            label: s.label,
            data: s.data,
            borderColor: s.color,
            backgroundColor: withAlpha(s.color, spec.opts.fillAlpha),
            fill: true,
            stepped: spec.opts.stepMode,
            borderWidth: spec.opts.lineWidth,
            pointRadius: spec.opts.points ? spec.opts.pointRadius : 0,
            pointBackgroundColor: s.color,
          })),
        },
        options: baseOpts({
          scales: {
            x: xAxisFor(spec.labels),
            y: yAxis({ ticks: { ...TICK, callback: tickFormat({ suffix: spec.opts.suffix }) } }),
          },
        }),
      }),
    },
    legend: (spec) => spec.series.map((s, i) => ({ label: s.label, color: s.color, line: true, datasetIndex: i })),
  },

  {
    id: 'fan-chart',
    title: 'Fan Chart',
    category: 'Line & Area',
    blurb: 'A projection whose uncertainty widens with distance. History is one line; the future is a spread.',
    tags: ['fan', 'projection', 'forecast', 'uncertainty', 'confidence', 'prediction'],
    spec: {
      labels: ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026', '2027', '2028'],
      history: [2.1, 1.4, 2.8, 3.4, 2.9, 2.6],
      forecast: [2.7, 2.8, 3.0, 3.1],
      color: C.green,
      bands: [
        { label: '90%', spread: 1.9, alpha: 0.12 },
        { label: '70%', spread: 1.2, alpha: 0.18 },
        { label: '50%', spread: 0.6, alpha: 0.26 },
      ],
      opts: { lineWidth: 2.5, pointRadius: 3, suffix: '%' },
    },
    controls: [
      { group: 'Data',  type: 'labels', key: 'labels',   label: 'Period labels' },
      { group: 'Data',  type: 'values', key: 'history',  label: 'Observed values' },
      { group: 'Data',  type: 'values', key: 'forecast', label: 'Projected values' },
      { group: 'Style', type: 'colors', key: 'fanColor', label: 'Colour' },
      { group: 'Style', type: 'slider', key: 'opts.lineWidth', label: 'Line width', min: 1, max: 5, step: 0.5, format: (v) => v + 'px' },
      { group: 'Axis',  type: 'text',   key: 'opts.suffix', label: 'Value suffix' },
    ],
    onInit(spec) { spec.fanColor = [spec.color]; },
    onChange(spec) { spec.color = spec.fanColor[0]; },
    chartjs: {
      build(spec) {
        const hist = spec.history;
        const fc = spec.forecast;
        const n = hist.length + fc.length;
        const labels = spec.labels.slice(0, n);
        const gap = new Array(Math.max(0, hist.length - 1)).fill(null);
        // The central projection reuses the last observed point so the line
        // joins up rather than restarting in mid-air.
        const central = [...gap, hist[hist.length - 1], ...fc];

        // Each band widens linearly across the projection horizon.
        const band = (spread, sign) => central.map((v, i) => {
          if (v == null) return null;
          const step = Math.max(0, i - (hist.length - 1));
          const width = (step / Math.max(1, fc.length)) * spread;
          return +(v + sign * width).toFixed(3);
        });

        const datasets = [];
        spec.bands.forEach((b) => {
          datasets.push({
            label: b.label + ' upper',
            data: band(b.spread, 1),
            borderColor: 'transparent',
            backgroundColor: withAlpha(spec.color, b.alpha),
            fill: '+1',
            pointRadius: 0,
            borderWidth: 0,
            tension: 0.25,
          });
          datasets.push({
            label: b.label + ' lower',
            data: band(b.spread, -1),
            borderColor: 'transparent',
            backgroundColor: 'transparent',
            fill: false,
            pointRadius: 0,
            borderWidth: 0,
            tension: 0.25,
          });
        });

        datasets.push({
          label: 'Projection',
          data: central,
          borderColor: spec.color,
          backgroundColor: 'transparent',
          borderDash: [5, 4],
          borderWidth: spec.opts.lineWidth,
          pointRadius: 0,
          tension: 0.25,
          fill: false,
        });
        datasets.push({
          label: 'Observed',
          data: [...hist, ...new Array(fc.length).fill(null)],
          borderColor: spec.color,
          backgroundColor: 'transparent',
          borderWidth: spec.opts.lineWidth,
          pointRadius: spec.opts.pointRadius,
          pointBackgroundColor: spec.color,
          tension: 0.25,
          fill: false,
        });

        return {
          type: 'line',
          data: { labels: axisLabels(labels), datasets },
          options: baseOpts({
            scales: {
              x: xAxisFor(labels),
              y: yAxis({ ticks: { ...TICK, callback: tickFormat({ suffix: spec.opts.suffix }) } }),
            },
          }),
        };
      },
    },
    legend: (spec) => [
      { label: 'Observed', color: spec.color, line: true, toggleable: false },
      ...spec.bands.map((b) => ({
        label: b.label + ' interval',
        color: withAlpha(spec.color, Math.min(1, b.alpha * 3)),
        toggleable: false,
      })),
    ],
  },

  {
    id: 'horizon-chart',
    title: 'Horizon Chart',
    category: 'Line & Area',
    blurb: 'An area chart folded into bands so it survives being one-quarter the height. Density over precision.',
    tags: ['horizon', 'dense', 'time series', 'bands', 'small multiples', 'compact'],
    spec: {
      series: HORIZON_ROWS.map((r, i) => ({
        ...r, color: [C.green, C.blue, C.amber, C.violet, C.cyan, C.olive][i % 6],
      })),
      opts: { textColor: '#808080', bands: 3, rowHeight: 62, gap: 6, mirrorNegative: true },
    },
    controls: [
      { group: 'Series', type: 'series', key: 'series', data: false, max: 6, min: 1 },
      { group: 'Bands', type: 'slider', key: 'opts.bands', label: 'Band count', min: 1, max: 5, step: 1 },
      { group: 'Bands', type: 'toggle', key: 'opts.mirrorNegative', label: 'Mirror negatives' },
      { group: 'Style', type: 'slider', key: 'opts.rowHeight', label: 'Row height', min: 30, max: 110, step: 2, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.gap', label: 'Row gap', min: 0, max: 20, step: 1, format: (v) => v + 'px' },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    canvas: {
      height: 340,
      helpers: [inkColor],
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const pad = { t: 10, r: 14, b: 10, l: 78 };
        const cw = W - pad.l - pad.r;

        spec.series.forEach((s, si) => {
          const vals = s.values || s.data || [];
          if (!vals.length) return;
          // Folding into bands is what makes a horizon chart dense and what
          // makes a single value impossible to read off it, so state it.
          const slotW = (W - pad.l - pad.r) / vals.length;
          vals.forEach((v, vi) => {
            tip(pad.l + vi * slotW, pad.t + si * (o.rowHeight + o.gap), slotW, o.rowHeight,
              s.label + '\n' + 'point ' + (vi + 1) + ': ' + v);
          });

          const top = pad.t + si * (o.rowHeight + o.gap);
          const rowH = o.rowHeight;
          const maxAbs = Math.max(...vals.map(Math.abs), 0.001);
          const bandSize = maxAbs / o.bands;

          ctx.save();
          ctx.beginPath();
          ctx.rect(pad.l, top, cw, rowH);
          ctx.clip();

          // Each band is the same area chart, shifted up and drawn darker —
          // this is the whole trick of a horizon chart.
          for (let b = 0; b < o.bands; b++) {
            const opacity = 0.28 + (b / Math.max(1, o.bands - 1)) * 0.62;
            const alphaHex = Math.round(opacity * 255).toString(16).padStart(2, '0');

            [1, -1].forEach((sign) => {
              if (sign === -1 && !o.mirrorNegative) return;
              ctx.beginPath();
              ctx.moveTo(pad.l, top + rowH);
              vals.forEach((val, i) => {
                const x = pad.l + (i / Math.max(1, vals.length - 1)) * cw;
                const signed = sign === 1 ? Math.max(0, val) : Math.max(0, -val);
                const within = Math.max(0, Math.min(bandSize, signed - b * bandSize));
                const y = top + rowH - (within / bandSize) * rowH;
                ctx.lineTo(x, y);
              });
              ctx.lineTo(pad.l + cw, top + rowH);
              ctx.closePath();
              // Negative bands take the complementary hue by drawing muted.
              ctx.fillStyle = (sign === 1 ? s.color : '#8A8880') + alphaHex;
              ctx.fill();
            });
          }
          ctx.restore();

          ctx.strokeStyle = 'rgba(128,128,128,.18)';
          ctx.lineWidth = 1;
          ctx.strokeRect(pad.l, top, cw, rowH);

          ctx.fillStyle = ink(0.95);
          ctx.font = '12px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(s.label, pad.l - 10, top + rowH / 2 + 4);
        });
      },
    },
    legend: (spec) => spec.series.map((s) => ({ label: s.label, color: s.color, toggleable: false })),
  },

  {
    id: 'spiral-plot',
    title: 'Spiral Plot',
    category: 'Line & Area',
    blurb: 'Time coiled outward so each turn is one cycle — weekly or seasonal rhythm becomes visible.',
    tags: ['spiral', 'cyclical', 'seasonal', 'radial', 'time', 'periodic'],
    spec: {
      values: [...SPIRAL_VALUES],
      // How many points make one turn. This is a property of the data — 52
      // weeks, 12 months, 24 hours — so it stays a control.
      perCycle: 52,
      color: C.green,
      accent: C.amber,
      opts: { textColor: '#808080', innerRadius: 34, thickness: 15, gap: 3, mode: 'bar', showTicks: true },
    },
    controls: [
      { group: 'Cycle', type: 'slider', key: 'perCycle', label: 'Points per turn', min: 4, max: 60, step: 1 },
      { group: 'Style', type: 'seg',    key: 'opts.mode', label: 'Mark',
        options: [{ value: 'bar', label: 'Bars' }, { value: 'line', label: 'Ribbon' }] },
      { group: 'Style', type: 'colors', key: 'spiralColors', label: 'Low / high', names: () => ['Low', 'High'] },
      { group: 'Style', type: 'slider', key: 'opts.thickness', label: 'Turn thickness', min: 6, max: 30, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.innerRadius', label: 'Inner radius', min: 10, max: 90, step: 2, format: (v) => v + 'px' },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    onInit(spec) { spec.spiralColors = [spec.color, spec.accent]; },
    onChange(spec) { [spec.color, spec.accent] = spec.spiralColors; },
    canvas: {
      height: 420,
      helpers: [inkColor],
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const raw = spec.values;
        if (!raw.length) return;
        const total = raw.length;

        // The coil is drawn on a 0–1 scale, so normalise whatever came in.
        const lo = Math.min(...raw);
        const hi = Math.max(...raw);
        const span = hi - lo || 1;
        const vals = raw.map((v) => (v - lo) / span);

        const cx = W / 2;
        const cy = H / 2;
        const turn = o.thickness + o.gap;

        const mix = (t) => {
          // Blend low→high colour without needing a colour library.
          const hex = (c) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
          const a = hex(spec.color);
          const b = hex(spec.accent);
          const ch = a.map((v, k) => Math.round(v + (b[k] - v) * t));
          return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
        };

        vals.forEach((v, i) => {
          const cycle = Math.floor(i / spec.perCycle);
          const phase = (i % spec.perCycle) / spec.perCycle;
          const angle = phase * Math.PI * 2 - Math.PI / 2;
          const rBase = o.innerRadius + cycle * turn + phase * turn;
          const len = v * o.thickness;
          // Turn and position within it, because a coil hides both: the same
          // spoke is four different periods on four different turns.
          tip({
            cx: cx, cy: cy, r0: rBase, r1: rBase + Math.max(len, o.thickness),
            a0: angle, a1: angle + (Math.PI * 2) / spec.perCycle,
            text: 'Turn ' + (cycle + 1) + ', point ' + ((i % spec.perCycle) + 1)
              + '\n' + raw[i],
          });

          if (o.mode === 'bar') {
            const a1 = angle;
            const a2 = angle + (Math.PI * 2) / spec.perCycle * 0.9;
            ctx.beginPath();
            ctx.arc(cx, cy, rBase, a1, a2);
            ctx.arc(cx, cy, rBase + len, a2, a1, true);
            ctx.closePath();
            ctx.fillStyle = mix(v);
            ctx.fill();
          } else {
            const a2 = angle + (Math.PI * 2) / spec.perCycle;
            ctx.beginPath();
            ctx.arc(cx, cy, rBase + len / 2, angle, a2);
            ctx.strokeStyle = mix(v);
            ctx.lineWidth = Math.max(1, len);
            ctx.stroke();
          }
        });

        if (o.showTicks) {
          ctx.strokeStyle = 'rgba(128,128,128,.2)';
          ctx.fillStyle = ink(0.8);
          ctx.font = '10px "DM Sans", system-ui, sans-serif';
          ctx.lineWidth = 1;
          // One turn per cycle in the data, however many that works out to be.
          const outer = o.innerRadius + Math.ceil(total / spec.perCycle) * turn + o.thickness;
          for (let q = 0; q < 4; q++) {
            const a = (q / 4) * Math.PI * 2 - Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * (o.innerRadius - 4), cy + Math.sin(a) * (o.innerRadius - 4));
            ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
            ctx.stroke();
            ctx.textAlign = 'center';
            ctx.fillText(['Q1', 'Q2', 'Q3', 'Q4'][q], cx + Math.cos(a + 0.4) * (outer + 12), cy + Math.sin(a + 0.4) * (outer + 12) + 3);
          }
        }
      },
    },
    legend: (spec) => [
      { label: 'Low', color: spec.color, toggleable: false },
      { label: 'High', color: spec.accent, toggleable: false },
    ],
  },

  {
    id: 'sparkline',
    title: 'Sparkline',
    category: 'KPI & Micro',
    blurb: 'Tufte’s word-sized graphic: shape only, no axes. Meant to sit inline with text or in a table cell.',
    tags: ['sparkline', 'micro', 'inline', 'tufte', 'trend', 'kpi', 'table'],
    spec: {
      rows: [
        { label: 'Revenue',   color: C.blue,   data: [12, 14, 13, 17, 19, 18, 22, 25, 24, 27, 31, 34], unit: '$K' },
        { label: 'Churn',     color: C.amber,  data: [5.2, 5.0, 5.4, 4.8, 4.6, 4.9, 4.2, 4.0, 4.3, 3.8, 3.6, 3.4], unit: '%' },
        { label: 'Sessions',  color: C.green, data: [820, 910, 880, 1020, 1080, 1150, 1120, 1240, 1310, 1290, 1400, 1520], unit: '' },
        { label: 'NPS',       color: C.violet,   data: [31, 33, 30, 36, 38, 37, 41, 44, 42, 47, 49, 52], unit: '' },
      ],
      opts: { textColor: '#808080', rowHeight: 46, lineWidth: 2, fill: true, fillAlpha: 0.14, showBand: false, showEndDot: true, showMinMax: true, labelWidth: 96, valueWidth: 72 },
    },
    controls: [
      { group: 'Data',  type: 'series', key: 'rows', data: true, max: 8, min: 1 },
      { group: 'Style', type: 'slider', key: 'opts.rowHeight', label: 'Row height', min: 26, max: 80, step: 2, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.lineWidth', label: 'Line width', min: 1, max: 4, step: 0.5, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.fill', label: 'Fill under line' },
      { group: 'Marks', type: 'toggle', key: 'opts.showEndDot', label: 'Dot on last value' },
      { group: 'Marks', type: 'toggle', key: 'opts.showMinMax', label: 'Mark min and max' },
      { group: 'Marks', type: 'toggle', key: 'opts.showBand', label: 'Shade the mid range' },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    canvas: {
      helpers: [inkColor],
      height: 240,
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const rows = spec.rows;
        if (!rows.length) return;

        const plotL = o.labelWidth;
        const plotW = W - o.labelWidth - o.valueWidth - 12;

        rows.forEach((row, ri) => {
          const data = row.data || [];
          if (data.length < 2) return;
          const top = ri * o.rowHeight;
          // A sparkline is deliberately unlabelled; the hover is where the
          // numbers behind the shape live.
          const firstV = data[0];
          const lastV = data[data.length - 1];
          tip(0, top, W, o.rowHeight, [
            row.label,
            'latest ' + lastV,
            'range ' + Math.min(...data) + '–' + Math.max(...data),
            'change ' + (lastV - firstV >= 0 ? '+' : '') + (lastV - firstV).toFixed(1),
          ].join('\n'));
          const padY = 9;
          const h = o.rowHeight - padY * 2;
          const lo = Math.min(...data);
          const hi = Math.max(...data);
          const span = (hi - lo) || 1;
          const toX = (i) => plotL + (i / (data.length - 1)) * plotW;
          const toY = (v) => top + padY + h - ((v - lo) / span) * h;

          ctx.fillStyle = ink(0.95);
          ctx.font = '12px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(row.label, 0, top + o.rowHeight / 2 + 4);

          if (o.showBand) {
            const q1 = lo + span * 0.25;
            const q3 = lo + span * 0.75;
            ctx.fillStyle = 'rgba(128,128,128,.10)';
            ctx.fillRect(plotL, toY(q3), plotW, Math.max(1, toY(q1) - toY(q3)));
          }

          if (o.fill) {
            ctx.beginPath();
            ctx.moveTo(toX(0), top + padY + h);
            data.forEach((v, i) => ctx.lineTo(toX(i), toY(v)));
            ctx.lineTo(toX(data.length - 1), top + padY + h);
            ctx.closePath();
            const a = Math.round(o.fillAlpha * 255).toString(16).padStart(2, '0');
            ctx.fillStyle = row.color + a;
            ctx.fill();
          }

          ctx.beginPath();
          data.forEach((v, i) => (i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v))));
          ctx.strokeStyle = row.color;
          ctx.lineWidth = o.lineWidth;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.stroke();

          if (o.showMinMax) {
            [[data.indexOf(hi), '#B0620F'], [data.indexOf(lo), '#5A6270']].forEach(([idx, col]) => {
              ctx.beginPath();
              ctx.arc(toX(idx), toY(data[idx]), 2.6, 0, Math.PI * 2);
              ctx.fillStyle = col;
              ctx.fill();
            });
          }

          if (o.showEndDot) {
            const last = data.length - 1;
            ctx.beginPath();
            ctx.arc(toX(last), toY(data[last]), 3.4, 0, Math.PI * 2);
            ctx.fillStyle = row.color;
            ctx.fill();
          }

          const last = data[data.length - 1];
          ctx.fillStyle = row.color;
          ctx.font = '500 12px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(String(last) + (row.unit || ''), W, top + o.rowHeight / 2 + 4);
        });
      },
    },
    legend: () => null,
  },
];
