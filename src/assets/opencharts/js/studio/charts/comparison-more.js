/**
 * Three charts that compare across two dimensions at once.
 *
 * A grouped bar chart can do that too, and does it badly past about four
 * groups: the eye has to hop between clusters and hold a colour key in memory.
 * These give the second dimension its own geometry instead — a small line per
 * category, a shared value axis per row, or a grid.
 */

import { C } from '../palette.js';

/** See "One build function, two outputs" — serialised alongside each draw. */
function inkColor(color, alpha) {
  if (!color) return 'rgba(128,128,128,' + alpha + ')';
  const hex = color.replace('#', '');
  const n = parseInt(hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Mean daily electricity demand by month, five years — the cycle plot case. */
const CYCLE_YEARS = [
  { label: '2021', data: [41, 39, 34, 29, 26, 28, 31, 30, 27, 30, 36, 42] },
  { label: '2022', data: [43, 40, 35, 30, 26, 29, 33, 32, 28, 31, 37, 44] },
  { label: '2023', data: [44, 41, 36, 30, 27, 31, 36, 35, 29, 32, 38, 45] },
  { label: '2024', data: [46, 43, 37, 31, 27, 33, 39, 38, 31, 33, 39, 47] },
  { label: '2025', data: [48, 44, 38, 32, 28, 35, 42, 41, 32, 34, 41, 49] },
];

/** Median pay by role, three markets — a dot plot rather than a grouped bar. */
const DOT_ROWS = {
  labels: ['Support', 'Design', 'Data', 'Backend', 'Security', 'Platform'],
  series: [
    { label: 'Berlin', data: [42, 58, 66, 71, 74, 78] },
    { label: 'London', data: [46, 64, 74, 82, 88, 92] },
    { label: 'Warsaw', data: [31, 44, 52, 57, 60, 63] },
  ],
};

/** Room bookings by hour — a grid that is mostly empty, and says so. */
const TIMETABLE = {
  rows: ['Studio A', 'Studio B', 'Lab', 'Meeting 1', 'Meeting 2'],
  cols: ['09', '10', '11', '12', '13', '14', '15', '16', '17'],
  cells: [
    [0, 0, 12], [0, 1, 12], [0, 4, 8], [0, 5, 8],
    [1, 2, 6], [1, 3, 6], [1, 6, 10], [1, 7, 10], [1, 8, 4],
    [2, 0, 4], [2, 3, 14], [2, 4, 14], [2, 5, 14],
    [3, 1, 5], [3, 5, 9], [3, 6, 9],
    [4, 2, 3], [4, 7, 7],
  ],
};

export const comparisonMoreCharts = [
  /* ── Cycle plot ────────────────────────────────────────────────────────── */
  {
    id: 'cycle-plot',
    title: 'Cycle Plot',
    category: 'Comparison',
    blurb: 'A small trend line inside each season, against that season\'s own mean. Separates "Julys are high" from "Julys are rising".',
    tags: ['cycle plot', 'seasonal', 'trend', 'month plot', 'small multiples', 'decomposition'],
    spec: {
      labels: MONTHS.slice(),
      series: CYCLE_YEARS.map((y, i) => ({
        label: y.label,
        color: [C.green, C.blue, C.amber, C.violet, C.cyan][i % 5],
        data: y.data.slice(),
      })),
      opts: {
        textColor: '#808080',
        lineColor: C.green,
        meanColor: C.amber,
        lineWidth: 1.8,
        showMeans: true,
        showDots: true,
        gap: 0.22,
        unit: ' GW',
      },
    },
    controls: [
      { group: 'Data', type: 'series', key: 'series', data: false, max: 12, min: 2 },
      { group: 'Style', type: 'color', key: 'opts.lineColor', label: 'Trend colour' },
      { group: 'Style', type: 'slider', key: 'opts.lineWidth', label: 'Line width', min: 1, max: 4, step: 0.2, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.showDots', label: 'Mark each point' },
      { group: 'Style', type: 'slider', key: 'opts.gap', label: 'Gap between seasons', min: 0.05, max: 0.5, step: 0.02, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Means', type: 'toggle', key: 'opts.showMeans', label: 'Draw the seasonal mean' },
      { group: 'Means', type: 'color', key: 'opts.meanColor', label: 'Mean colour' },
      { group: 'Labels', type: 'text', key: 'opts.unit', label: 'Unit suffix' },
      { group: 'Labels', type: 'color', key: 'opts.textColor', label: 'Text colour' },
    ],
    canvas: {
      height: 380,
      helpers: [inkColor],
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const compact = env && env.compact;
        const o = spec.opts;
        const labels = spec.labels || [];
        const series = (spec.series || []).filter((s) => s && s.data && s.data.length);
        if (!labels.length || series.length < 2) return;

        const pad = compact
          ? { t: 8, r: 8, b: 14, l: 22 }
          : { t: 20, r: 20, b: 40, l: 52 };
        const cw = W - pad.l - pad.r;
        const ch = H - pad.t - pad.b;

        let lo = Infinity;
        let hi = -Infinity;
        labels.forEach((_, i) => series.forEach((s) => {
          const v = Number(s.data[i]);
          if (!Number.isFinite(v)) return;
          lo = Math.min(lo, v); hi = Math.max(hi, v);
        }));
        if (!Number.isFinite(lo)) return;
        if (hi === lo) hi = lo + 1;
        const span = hi - lo;
        lo -= span * 0.08;
        hi += span * 0.08;
        const toY = (v) => pad.t + ch - ((v - lo) / (hi - lo)) * ch;

        const bandW = cw / labels.length;
        const inner = bandW * (1 - o.gap);

        ctx.strokeStyle = ink(0.14);
        ctx.lineWidth = 1;
        for (let k = 0; k <= 4; k++) {
          const y = pad.t + (ch / 4) * k;
          ctx.beginPath();
          ctx.moveTo(pad.l, y);
          ctx.lineTo(pad.l + cw, y);
          ctx.stroke();
        }

        labels.forEach((label, i) => {
          const x0 = pad.l + bandW * i + (bandW - inner) / 2;
          const stepX = series.length > 1 ? inner / (series.length - 1) : 0;
          const vals = series.map((s) => Number(s.data[i])).filter((v) => Number.isFinite(v));
          if (!vals.length) return;
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;

          // The mean line is what makes this a cycle plot rather than twelve
          // sparklines: the level of a season and its trend are different
          // claims, and drawing both lets one be read without the other.
          if (o.showMeans) {
            ctx.strokeStyle = o.meanColor;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(x0 - 2, toY(mean));
            ctx.lineTo(x0 + inner + 2, toY(mean));
            ctx.stroke();
          }

          ctx.strokeStyle = o.lineColor;
          ctx.lineWidth = o.lineWidth;
          ctx.beginPath();
          series.forEach((s, k) => {
            const v = Number(s.data[i]);
            if (!Number.isFinite(v)) return;
            const x = x0 + stepX * k;
            if (k) ctx.lineTo(x, toY(v)); else ctx.moveTo(x, toY(v));
          });
          ctx.stroke();

          if (o.showDots) {
            ctx.fillStyle = o.lineColor;
            series.forEach((s, k) => {
              const v = Number(s.data[i]);
              if (!Number.isFinite(v)) return;
              ctx.beginPath();
              ctx.arc(x0 + stepX * k, toY(v), o.lineWidth + 0.4, 0, Math.PI * 2);
              ctx.fill();
            });
          }

          const first = Number(series[0].data[i]);
          const last = Number(series[series.length - 1].data[i]);
          const change = Number.isFinite(first) && first !== 0
            ? Math.round(((last - first) / first) * 100) : null;
          tip(pad.l + bandW * i, pad.t, bandW, ch, label
            + '\nmean ' + mean.toFixed(1) + o.unit
            + '\n' + series[0].label + ' ' + first + o.unit
            + ' → ' + series[series.length - 1].label + ' ' + last + o.unit
            + (change === null ? '' : '\n' + (change >= 0 ? '+' : '') + change + '% across the span'));

          if (compact) return;
          ctx.fillStyle = ink(0.9);
          ctx.font = '11px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(String(label), pad.l + bandW * i + bandW / 2, H - pad.b + 18);
        });

        if (compact) return;
        ctx.fillStyle = ink(0.75);
        ctx.font = '10px "DM Sans", system-ui, sans-serif';
        ctx.textAlign = 'right';
        for (let k = 0; k <= 4; k++) {
          const v = hi - ((hi - lo) / 4) * k;
          ctx.fillText(Math.round(v * 10) / 10, pad.l - 8, pad.t + (ch / 4) * k + 3);
        }
      },
    },
    legend: (spec) => [
      { label: (spec.series || []).map((s) => s.label).join(' → ') || 'Trend', color: spec.opts.lineColor, line: true },
      { label: 'Seasonal mean', color: spec.opts.meanColor, line: true },
    ],
  },

  /* ── Dot plot ──────────────────────────────────────────────────────────── */
  {
    id: 'dot-plot',
    title: 'Dot Plot',
    category: 'Comparison',
    blurb: 'One row per category, a dot per series on a shared axis. Reads more series than a grouped bar without the clutter of bars.',
    tags: ['dot plot', 'cleveland', 'comparison', 'ranked', 'categories', 'multi-series'],
    spec: {
      labels: DOT_ROWS.labels.slice(),
      series: DOT_ROWS.series.map((s, i) => ({
        label: s.label,
        color: [C.green, C.blue, C.amber, C.violet, C.cyan][i % 5],
        data: s.data.slice(),
      })),
      opts: {
        textColor: '#808080',
        radius: 6,
        connect: true,
        lineWidth: 1.4,
        sort: 'none',
        guides: true,
        prefix: '',
        suffix: 'k',
      },
    },
    controls: [
      { group: 'Data', type: 'series', key: 'series', data: false, max: 6, min: 1 },
      { group: 'Order', type: 'seg', key: 'opts.sort', label: 'Row order',
        options: [{ value: 'none', label: 'As listed' }, { value: 'desc', label: 'Largest first' }, { value: 'asc', label: 'Smallest first' }] },
      { group: 'Style', type: 'slider', key: 'opts.radius', label: 'Dot size', min: 3, max: 12, step: 0.5, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.connect', label: 'Join the dots in a row' },
      { group: 'Style', type: 'toggle', key: 'opts.guides', label: 'Guide line to the axis' },
      { group: 'Labels', type: 'text', key: 'opts.prefix', label: 'Value prefix' },
      { group: 'Labels', type: 'text', key: 'opts.suffix', label: 'Value suffix' },
      { group: 'Labels', type: 'color', key: 'opts.textColor', label: 'Text colour' },
    ],
    canvas: {
      height: 380,
      helpers: [inkColor],
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const compact = env && env.compact;
        const o = spec.opts;
        const series = (spec.series || []).filter((s) => s && s.data && s.data.length);
        const labels = spec.labels || [];
        if (!labels.length || !series.length) return;

        // Sorting happens on a copy of the row *indices*, so the spec keeps the
        // order the reader typed and the control stays a view, not an edit.
        const rows = labels.map((label, i) => {
          const vals = series.map((s) => Number(s.data[i])).filter((v) => Number.isFinite(v));
          return {
            label: label,
            i: i,
            max: vals.length ? Math.max.apply(null, vals) : 0,
          };
        });
        if (o.sort === 'desc') rows.sort((a, b) => b.max - a.max);
        else if (o.sort === 'asc') rows.sort((a, b) => a.max - b.max);

        const labelW = compact ? 0 : 92;
        const pad = { t: compact ? 10 : 20, r: compact ? 10 : 30, b: compact ? 12 : 38, l: (compact ? 8 : 18) + labelW };
        const cw = W - pad.l - pad.r;
        const ch = H - pad.t - pad.b;
        const bandH = ch / rows.length;

        let lo = Infinity;
        let hi = -Infinity;
        series.forEach((s) => s.data.forEach((raw) => {
          const v = Number(raw);
          if (!Number.isFinite(v)) return;
          lo = Math.min(lo, v); hi = Math.max(hi, v);
        }));
        if (!Number.isFinite(lo)) return;
        const span = (hi - lo) || 1;
        lo -= span * 0.1;
        hi += span * 0.1;
        const toX = (v) => pad.l + ((v - lo) / (hi - lo)) * cw;

        ctx.textBaseline = 'middle';
        rows.forEach((row, r) => {
          const cy = pad.t + bandH * r + bandH / 2;
          const points = series.map((s) => ({
            v: Number(s.data[row.i]), color: s.color, label: s.label,
          })).filter((p) => Number.isFinite(p.v));
          if (!points.length) return;

          if (o.guides) {
            ctx.strokeStyle = ink(0.12);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pad.l, cy);
            ctx.lineTo(pad.l + cw, cy);
            ctx.stroke();
          }

          if (o.connect && points.length > 1) {
            const xs = points.map((p) => toX(p.v));
            ctx.strokeStyle = ink(0.4);
            ctx.lineWidth = o.lineWidth;
            ctx.beginPath();
            ctx.moveTo(Math.min.apply(null, xs), cy);
            ctx.lineTo(Math.max.apply(null, xs), cy);
            ctx.stroke();
          }

          points.forEach((p) => {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(toX(p.v), cy, o.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.2;
            ctx.stroke();
            tip({ cx: toX(p.v), cy: cy, r: o.radius + 3,
              text: row.label + ' — ' + p.label + '\n' + o.prefix + p.v + o.suffix });
          });

          if (!compact) {
            ctx.fillStyle = ink(0.95);
            ctx.font = '12px "DM Sans", system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(String(row.label), pad.l - 12, cy);
          }
        });

        if (compact) return;
        ctx.fillStyle = ink(0.75);
        ctx.font = '10px "DM Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (let k = 0; k <= 4; k++) {
          const v = lo + ((hi - lo) / 4) * k;
          ctx.fillText(o.prefix + (Math.round(v * 10) / 10) + o.suffix, toX(v), H - pad.b + 18);
        }
      },
    },
    legend: (spec) => (spec.series || []).map((s) => ({ label: s.label, color: s.color })),
  },

  /* ── Time table ────────────────────────────────────────────────────────── */
  {
    id: 'time-table',
    title: 'Time Table',
    category: 'Comparison',
    blurb: 'A schedule grid: rows against time slots, filled only where something happens. The empty cells are half the message.',
    tags: ['time table', 'schedule', 'grid', 'roster', 'occupancy', 'slots'],
    spec: {
      rows: TIMETABLE.rows.slice(),
      cols: TIMETABLE.cols.slice(),
      cells: TIMETABLE.cells.map(([y, x, v]) => ({ x, y, v })),
      colors: [C.green, C.blue, C.amber, C.violet, C.cyan],
      opts: {
        textColor: '#808080',
        gap: 3,
        radius: 4,
        showValues: true,
        scaleByValue: true,
        colorBy: 'row',
        flat: C.green,
        unit: '',
      },
      dataMode: 'cells',
    },
    controls: [
      { group: 'Cells', type: 'toggle', key: 'opts.scaleByValue', label: 'Size the block by its value' },
      { group: 'Cells', type: 'toggle', key: 'opts.showValues', label: 'Print the values' },
      { group: 'Cells', type: 'slider', key: 'opts.gap', label: 'Gap', min: 0, max: 10, step: 1, format: (v) => v + 'px' },
      { group: 'Cells', type: 'slider', key: 'opts.radius', label: 'Corner radius', min: 0, max: 12, step: 1, format: (v) => v + 'px' },
      { group: 'Colour', type: 'seg', key: 'opts.colorBy', label: 'Colour',
        options: [{ value: 'row', label: 'Per row' }, { value: 'flat', label: 'One colour' }] },
      { group: 'Colour', type: 'color', key: 'opts.flat', label: 'Single colour' },
      { group: 'Colour', type: 'colors', key: 'colors', label: 'Row colours', names: (s) => s.rows },
      { group: 'Labels', type: 'text', key: 'opts.unit', label: 'Unit suffix' },
      { group: 'Labels', type: 'color', key: 'opts.textColor', label: 'Text colour' },
    ],
    canvas: {
      height: 360,
      helpers: [inkColor],
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const compact = env && env.compact;
        const o = spec.opts;
        const rows = spec.rows || [];
        const cols = spec.cols || [];
        const cells = spec.cells || [];
        if (!rows.length || !cols.length) return;

        const labelW = compact ? 0 : 96;
        const headH = compact ? 0 : 24;
        const pad = { t: 12 + headH, r: 14, b: 12, l: 14 + labelW };
        const cw = (W - pad.l - pad.r) / cols.length;
        const chh = (H - pad.t - pad.b) / rows.length;
        const hi = cells.reduce((m, c) => Math.max(m, Number(c.v) || 0), 1);

        if (!compact) {
          ctx.fillStyle = ink(0.8);
          ctx.font = '11px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          cols.forEach((c, x) => ctx.fillText(String(c), pad.l + cw * x + cw / 2, pad.t - 12));
          ctx.textAlign = 'right';
          rows.forEach((r, y) => ctx.fillText(String(r), pad.l - 12, pad.t + chh * y + chh / 2));
        }

        // Empty slots are drawn as a faint outline rather than skipped. A grid
        // with holes in it is the chart; leaving nothing there makes it look
        // like a bar chart with missing bars.
        rows.forEach((_, y) => cols.forEach((__, x) => {
          ctx.strokeStyle = ink(0.09);
          ctx.lineWidth = 1;
          ctx.strokeRect(pad.l + cw * x + o.gap / 2, pad.t + chh * y + o.gap / 2,
            cw - o.gap, chh - o.gap);
        }));

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        cells.forEach((cell) => {
          const x = Number(cell.x);
          const y = Number(cell.y);
          if (!(x >= 0 && x < cols.length && y >= 0 && y < rows.length)) return;
          const v = Number(cell.v) || 0;
          const k = o.scaleByValue ? Math.max(0.34, Math.sqrt(v / hi)) : 1;
          const bw = (cw - o.gap) * k;
          const bh = (chh - o.gap) * k;
          const bx = pad.l + cw * x + (cw - bw) / 2;
          const by = pad.t + chh * y + (chh - bh) / 2;

          ctx.fillStyle = o.colorBy === 'flat'
            ? o.flat
            : (spec.colors || [o.flat])[y % (spec.colors || [o.flat]).length];
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, o.radius);
          else ctx.rect(bx, by, bw, bh);
          ctx.fill();

          if (o.showValues && !compact && bh > 14) {
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px "DM Mono", ui-monospace, monospace';
            ctx.fillText(v + o.unit, bx + bw / 2, by + bh / 2);
          }

          tip(pad.l + cw * x, pad.t + chh * y, cw, chh,
            rows[y] + ' · ' + cols[x] + '\n' + v + o.unit);
        });
      },
    },
    legend: (spec) => (spec.opts.colorBy === 'flat' ? null
      : (spec.rows || []).map((label, i) => ({
        label, color: (spec.colors || [])[i % (spec.colors || [C.green]).length],
      }))),
    metrics: (spec) => {
      const cells = spec.cells || [];
      const slots = (spec.rows || []).length * (spec.cols || []).length;
      return [
        { label: 'Filled', value: cells.length + ' of ' + slots },
        { label: 'Total', value: cells.reduce((s, c) => s + (Number(c.v) || 0), 0) + spec.opts.unit },
        { label: 'Empty', value: Math.max(0, slots - cells.length) },
      ];
    },
  },
];
