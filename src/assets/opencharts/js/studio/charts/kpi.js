/**
 * KPI and micro charts: bullet graph, radial bar and pictogram.
 *
 * These are the dashboard staples — small, dense, and meant to be read at a
 * glance rather than studied.
 */

import { C, withAlpha } from '../palette.js';

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

export const kpiCharts = [
  {
    id: 'bullet-chart',
    title: 'Bullet Chart',
    category: 'KPI & Micro',
    blurb: 'Stephen Few’s replacement for the dashboard gauge: actual, target and qualitative bands in one row.',
    tags: ['bullet', 'kpi', 'target', 'dashboard', 'gauge replacement', 'few'],
    spec: {
      rows: [
        { label: 'Revenue',      value: 268, target: 250, max: 320, color: C.green, unit: 'K' },
        { label: 'New signups',  value: 1180, target: 1400, max: 1800, color: C.blue, unit: '' },
        { label: 'Churn',        value: 3.1, target: 4.0, max: 8, color: C.amber, unit: '%' },
        { label: 'NPS',          value: 52, target: 45, max: 80, color: C.violet, unit: '' },
        { label: 'Uptime',       value: 99.94, target: 99.9, max: 100, color: C.olive, unit: '%' },
      ],
      opts: { textColor: '#808080', rowHeight: 52, barHeight: 14, labelWidth: 116, bands: 3, showTarget: true, showValue: true, bandTint: 0.1 },
    },
    controls: [
      { group: 'Data',  type: 'series', key: 'rows', data: false, max: 10, min: 1 },
      { group: 'Style', type: 'slider', key: 'opts.rowHeight', label: 'Row height', min: 30, max: 90, step: 2, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.barHeight', label: 'Bar height', min: 6, max: 34, step: 2, format: (v) => v + 'px' },
      { group: 'Bands', type: 'slider', key: 'opts.bands', label: 'Qualitative bands', min: 0, max: 5, step: 1 },
      { group: 'Bands', type: 'slider', key: 'opts.bandTint', label: 'Band contrast', min: 0.03, max: 0.3, step: 0.01, format: (v) => v.toFixed(2) },
      { group: 'Marks', type: 'toggle', key: 'opts.showTarget', label: 'Show target marker' },
      { group: 'Marks', type: 'toggle', key: 'opts.showValue', label: 'Show value' },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    onChange(spec) {
      spec.rows.forEach((r, i) => {
        if (typeof r.value !== 'number') { r.value = 60; r.target = 75; r.max = 100; r.unit = ''; }
      });
    },
    canvas: {
      helpers: [inkColor],
      height: 300,
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const rows = spec.rows;
        if (!rows.length) return;

        const valueW = o.showValue ? 78 : 12;
        const plotL = o.labelWidth;
        const plotW = W - o.labelWidth - valueW;

        rows.forEach((r, i) => {
          const top = i * o.rowHeight;
          const cy = top + o.rowHeight / 2;
          const toX = (v) => plotL + (v / r.max) * plotW;
          // Measure against target is the entire claim a bullet chart makes.
          tip(0, top, W, o.rowHeight, [
            r.label + ': ' + r.value,
            'target ' + r.target,
            (r.value >= r.target ? 'ahead by ' : 'short by ')
              + Math.abs(r.value - r.target).toFixed(1),
          ].join('\n'));

          // Qualitative bands: progressively lighter greys behind the bar.
          for (let b = 0; b < o.bands; b++) {
            const from = (b / o.bands) * r.max;
            const to = ((b + 1) / o.bands) * r.max;
            const shade = o.bandTint * (o.bands - b) / o.bands;
            ctx.fillStyle = `rgba(128,128,128,${shade.toFixed(3)})`;
            ctx.fillRect(toX(from), cy - o.barHeight, toX(to) - toX(from), o.barHeight * 2);
          }

          // The measure itself — deliberately thinner than the bands.
          ctx.fillStyle = r.color;
          ctx.beginPath();
          ctx.roundRect(plotL, cy - o.barHeight / 2, Math.max(1, toX(r.value) - plotL), o.barHeight, 2);
          ctx.fill();

          if (o.showTarget) {
            const tx = toX(r.target);
            ctx.strokeStyle = '#171614';
            ctx.globalAlpha = 0.85;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(tx, cy - o.barHeight);
            ctx.lineTo(tx, cy + o.barHeight);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }

          ctx.fillStyle = ink(0.95);
          ctx.font = '12px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(r.label, plotL - 12, cy + 4);

          if (o.showValue) {
            const hit = r.value >= r.target;
            ctx.font = '600 13px "DM Sans", system-ui, sans-serif';
            ctx.fillStyle = r.color;
            ctx.textAlign = 'left';
            ctx.fillText(r.value + (r.unit || ''), plotL + plotW + 10, cy + 1);
            ctx.font = '10px "DM Sans", system-ui, sans-serif';
            ctx.fillStyle = hit ? '#16916A' : '#CE5229';
            ctx.fillText((hit ? '▲ ' : '▼ ') + 'vs ' + r.target, plotL + plotW + 10, cy + 14);
          }
        });
      },
    },
    legend: () => null,
  },

  {
    id: 'radial-bar',
    title: 'Radial Bar',
    category: 'KPI & Micro',
    blurb: 'Bars bent into concentric arcs. Compact and popular, though the outer ring always looks longer than it is.',
    tags: ['radial bar', 'circular', 'progress', 'rings', 'arcs', 'kpi'],
    spec: {
      items: [
        { label: 'Mobile',  value: 82, color: C.green },
        { label: 'Desktop', value: 68, color: C.blue },
        { label: 'Tablet',  value: 45, color: C.amber },
        { label: 'Watch',   value: 27, color: C.violet },
        { label: 'TV',      value: 14, color: C.cyan },
      ],
      opts: { textColor: '#808080', max: 100, innerRadius: 42, thickness: 20, gap: 7, startAngle: -90, sweep: 300, rounded: true, trackAlpha: 0.12, showLabels: true, showValues: true },
    },
    controls: [
      { group: 'Data',  type: 'series', key: 'items', data: false, max: 8, min: 1 },
      { group: 'Data',  type: 'slider', key: 'opts.max', label: 'Scale maximum', min: 20, max: 300, step: 10 },
      { group: 'Shape', type: 'slider', key: 'opts.sweep', label: 'Arc sweep', min: 120, max: 360, step: 10, format: (v) => v + '°' },
      { group: 'Shape', type: 'slider', key: 'opts.startAngle', label: 'Start angle', min: -180, max: 180, step: 10, format: (v) => v + '°' },
      { group: 'Shape', type: 'slider', key: 'opts.innerRadius', label: 'Inner radius', min: 10, max: 110, step: 2, format: (v) => v + 'px' },
      { group: 'Shape', type: 'slider', key: 'opts.thickness', label: 'Ring thickness', min: 6, max: 40, step: 2, format: (v) => v + 'px' },
      { group: 'Shape', type: 'slider', key: 'opts.gap', label: 'Ring gap', min: 0, max: 20, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.rounded', label: 'Rounded ends' },
      { group: 'Style', type: 'toggle', key: 'opts.showLabels', label: 'Show labels' },
      { group: 'Style', type: 'toggle', key: 'opts.showValues', label: 'Show values' },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    onChange(spec) {
      spec.items.forEach((it, i) => { if (typeof it.value !== 'number') it.value = 50 - i * 5; });
    },
    canvas: {
      helpers: [inkColor],
      height: 420,
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const items = spec.items;
        if (!items.length) return;

        const cx = W / 2;
        const cy = H / 2;
        const start = (o.startAngle * Math.PI) / 180;
        const sweep = (o.sweep * Math.PI) / 180;
        const step = o.thickness + o.gap;

        items.forEach((it, i) => {
          const r = o.innerRadius + i * step + o.thickness / 2;
          const frac = Math.max(0, Math.min(1, it.value / o.max));
          // The whole ring, not just the filled arc: the empty part of a track
          // is still that item, and is where a reader looks to judge the gap.
          tip({
            cx: cx, cy: cy, r0: r - o.thickness / 2, r1: r + o.thickness / 2,
            a0: start, a1: start + sweep,
            text: it.label + ': ' + it.value + '  (' + Math.round(frac * 100) + '% of ' + o.max + ')',
          });

          ctx.lineCap = o.rounded ? 'round' : 'butt';
          ctx.lineWidth = o.thickness;

          // Track first, then the value arc on top of it.
          ctx.beginPath();
          ctx.arc(cx, cy, r, start, start + sweep);
          ctx.strokeStyle = it.color + Math.round(o.trackAlpha * 255).toString(16).padStart(2, '0');
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(cx, cy, r, start, start + sweep * frac);
          ctx.strokeStyle = it.color;
          ctx.stroke();

          if (o.showLabels) {
            ctx.fillStyle = ink(0.95);
            ctx.font = '11px "DM Sans", system-ui, sans-serif';
            ctx.textAlign = 'right';
            const lx = cx + Math.cos(start) * r;
            const ly = cy + Math.sin(start) * r;
            ctx.fillText(it.label, lx - o.thickness / 2 - 8, ly + 4);
          }

          if (o.showValues) {
            const endA = start + sweep * frac;
            const ex = cx + Math.cos(endA) * r;
            const ey = cy + Math.sin(endA) * r;
            ctx.fillStyle = it.color;
            ctx.font = '600 11px "DM Sans", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(String(it.value), ex + Math.cos(endA) * 16, ey + Math.sin(endA) * 16 + 4);
          }
        });
      },
    },
    legend: (spec) => spec.items.map((it) => ({ label: it.label, color: it.color, toggleable: false })),
  },

  {
    id: 'pictogram',
    title: 'Pictogram (Isotype)',
    category: 'Part to Whole',
    blurb: 'Counting in icons rather than squares. Isotype’s rule still holds: repeat the symbol, never scale it.',
    tags: ['pictogram', 'isotype', 'icon array', 'unit chart', 'people', 'counting'],
    spec: {
      rows: [
        { label: 'Cycle',       value: 34, color: C.blue,   icon: 'person' },
        { label: 'Public transit', value: 28, color: C.green, icon: 'person' },
        { label: 'Drive',       value: 24, color: C.amber,  icon: 'person' },
        { label: 'Walk',        value: 14, color: C.cyan,  icon: 'person' },
      ],
      opts: { textColor: '#808080', unit: 2, iconSize: 20, gap: 5, perRow: 20, labelWidth: 130, showValues: true, shape: 'person' },
    },
    controls: [
      { group: 'Data',  type: 'series', key: 'rows', data: false, max: 8, min: 1 },
      { group: 'Data',  type: 'slider', key: 'opts.unit', label: 'Units per icon', min: 1, max: 10, step: 1 },
      { group: 'Shape', type: 'seg',    key: 'opts.shape', label: 'Icon',
        options: [{ value: 'person', label: 'Person' }, { value: 'square', label: 'Square' }, { value: 'circle', label: 'Circle' }] },
      { group: 'Style', type: 'slider', key: 'opts.iconSize', label: 'Icon size', min: 10, max: 36, step: 2, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.gap', label: 'Icon gap', min: 1, max: 14, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.showValues', label: 'Show values' },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    onChange(spec) {
      spec.rows.forEach((r, i) => { if (typeof r.value !== 'number') r.value = 20 - i * 3; });
    },
    canvas: {
      helpers: [inkColor],
      height: 320,
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const rows = spec.rows;
        if (!rows.length) return;

        const step = o.iconSize + o.gap;
        const rowH = o.iconSize + 22;
        const left = o.labelWidth;

        // One icon per `unit` items; a half icon carries the remainder.
        const drawIcon = (x, y, size, colour, fraction) => {
          ctx.save();
          if (fraction < 1) {
            ctx.beginPath();
            ctx.rect(x, y, size * fraction, size);
            ctx.clip();
          }
          ctx.fillStyle = colour;
          if (o.shape === 'square') {
            ctx.beginPath();
            ctx.roundRect(x, y, size, size, 2);
            ctx.fill();
          } else if (o.shape === 'circle') {
            ctx.beginPath();
            ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // A minimal head-and-shoulders glyph, drawn from primitives.
            const head = size * 0.28;
            ctx.beginPath();
            ctx.arc(x + size / 2, y + head, head, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(x + size * 0.5, y + head * 1.9);
            ctx.quadraticCurveTo(x + size * 0.94, y + head * 2.1, x + size * 0.82, y + size);
            ctx.lineTo(x + size * 0.18, y + size);
            ctx.quadraticCurveTo(x + size * 0.06, y + head * 2.1, x + size * 0.5, y + head * 1.9);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        };

        rows.forEach((r, ri) => {
          const top = ri * rowH + 6;
          const icons = r.value / o.unit;
          const whole = Math.floor(icons);
          const rest = icons - whole;
          // Counting icons is the slow way to read this; say the number.
          tip(0, ri * rowH, W, rowH,
            r.label + ': ' + r.value + '\n'
            + icons.toFixed(1) + ' icons at ' + o.unit + ' each');

          ctx.fillStyle = ink(0.95);
          ctx.font = '12px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(r.label, left - 14, top + o.iconSize / 2 + 4);

          for (let i = 0; i < whole; i++) {
            drawIcon(left + i * step, top, o.iconSize, r.color, 1);
          }
          if (rest > 0.02) {
            // Ghost the full icon behind the partial one so the unit stays legible.
            drawIcon(left + whole * step, top, o.iconSize, r.color + '2e', 1);
            drawIcon(left + whole * step, top, o.iconSize, r.color, rest);
          }

          if (o.showValues) {
            ctx.fillStyle = r.color;
            ctx.font = '600 12px "DM Sans", system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(r.value + '%', left + Math.ceil(icons) * step + 10, top + o.iconSize / 2 + 4);
          }
        });

        ctx.fillStyle = ink(0.6);
        ctx.font = '10px "DM Sans", system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`Each icon = ${o.unit}%`, left, rows.length * rowH + 18);
      },
    },
    legend: () => null,
  },
];
