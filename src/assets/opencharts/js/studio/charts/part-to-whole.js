/**
 * Part-to-whole chart definitions: pie, doughnut, gauge, polar area,
 * Nightingale rose and waffle.
 *
 * The rose is drawn on a raw 2D context and the waffle out of plain divs —
 * neither needs a charting library, and both export as code you can read.
 */

import { C, MONTHS, withAlpha } from '../palette.js';
import { baseOpts, sliceLegend } from '../chartjs-base.js';

/** Shared control block for the slice-based charts. */
const sliceControls = [
  { group: 'Data',  type: 'labels', key: 'labels', label: 'Slice labels' },
  { group: 'Data',  type: 'values', key: 'values', label: 'Slice values' },
  { group: 'Style', type: 'colors', key: 'colors', label: 'Slice colours', names: (s) => s.labels },
];

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

export const partToWholeCharts = [
  {
    id: 'pie',
    title: 'Pie',
    category: 'Part to Whole',
    blurb: 'Share of a single total. Honest up to about five slices, misleading beyond that.',
    tags: ['pie', 'share', 'proportion', 'composition'],
    spec: {
      labels: ['Women', 'Men', 'Living', 'Accessories'],
      values: [48, 31, 13, 8],
      colors: [C.green, C.blue, C.amber, C.violet],
      opts: { borderWidth: 0, hoverOffset: 10, suffix: '%' },
    },
    controls: [
      ...sliceControls,
      { group: 'Style', type: 'slider', key: 'opts.borderWidth', label: 'Slice gap', min: 0, max: 8, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.hoverOffset', label: 'Hover lift', min: 0, max: 24, step: 2, format: (v) => v + 'px' },
    ],
    chartjs: {
      build: (spec) => ({
        type: 'pie',
        data: {
          labels: spec.labels,
          datasets: [{
            data: spec.values,
            backgroundColor: spec.labels.map((_, i) => spec.colors[i % spec.colors.length]),
            borderColor: 'rgba(128,128,128,.25)',
            borderWidth: spec.opts.borderWidth,
            hoverOffset: spec.opts.hoverOffset,
          }],
        },
        options: baseOpts({
          layout: { padding: 16 },
          interaction: { intersect: true, mode: 'nearest' },
          plugins: { tooltip: { callbacks: { label: (ctx) => ' ' + ctx.label + ': ' + ctx.parsed + '%' } } },
        }),
      }),
    },
    legend: (spec) => sliceLegend(spec),
  },

  {
    id: 'doughnut',
    title: 'Doughnut',
    category: 'Part to Whole',
    blurb: 'A pie with the middle removed — the hole is free space for a headline number.',
    tags: ['doughnut', 'donut', 'share', 'traffic sources'],
    spec: {
      labels: ['Organic', 'Paid', 'Social', 'Direct', 'Referral'],
      values: [40, 27, 15, 11, 7],
      colors: [C.green, C.blue, C.amber, C.violet, C.cyan],
      opts: { cutout: 68, borderWidth: 0, hoverOffset: 10 },
    },
    controls: [
      ...sliceControls,
      { group: 'Style', type: 'slider', key: 'opts.cutout', label: 'Hole size', min: 0, max: 88, step: 2, format: (v) => v + '%' },
      { group: 'Style', type: 'slider', key: 'opts.borderWidth', label: 'Slice gap', min: 0, max: 8, step: 1, format: (v) => v + 'px' },
    ],
    chartjs: {
      build: (spec) => ({
        type: 'doughnut',
        data: {
          labels: spec.labels,
          datasets: [{
            data: spec.values,
            backgroundColor: spec.labels.map((_, i) => spec.colors[i % spec.colors.length]),
            borderColor: 'rgba(128,128,128,.25)',
            borderWidth: spec.opts.borderWidth,
            hoverOffset: spec.opts.hoverOffset,
          }],
        },
        options: baseOpts({
          cutout: spec.opts.cutout + '%',
          layout: { padding: 16 },
          interaction: { intersect: true, mode: 'nearest' },
          plugins: { tooltip: { callbacks: { label: (ctx) => ' ' + ctx.label + ': ' + ctx.parsed + '%' } } },
        }),
      }),
    },
    legend: (spec) => sliceLegend(spec),
  },

  {
    id: 'doughnut-gauge',
    title: 'Gauge',
    category: 'Part to Whole',
    blurb: 'A half doughnut reading one number against its ceiling. Score, capacity, progress.',
    tags: ['gauge', 'doughnut', 'kpi', 'score', 'progress'],
    spec: {
      score: 72,
      label: 'Health score',
      color: C.green,
      opts: { cutout: 75, thicknessPad: 20 },
    },
    controls: [
      { group: 'Data',  type: 'slider', key: 'score', label: 'Value', min: 0, max: 100, step: 1, format: (v) => v + '%' },
      { group: 'Data',  type: 'text',   key: 'label', label: 'Caption' },
      { group: 'Style', type: 'colors', key: 'gaugeColor', label: 'Colour' },
      { group: 'Style', type: 'slider', key: 'opts.cutout', label: 'Ring thickness', min: 40, max: 90, step: 2, format: (v) => v + '%' },
    ],
    onInit(spec) { spec.gaugeColor = [spec.color]; },
    onChange(spec) { spec.color = spec.gaugeColor[0]; },
    chartjs: {
      build: (spec) => ({
        type: 'doughnut',
        data: {
          labels: [spec.label, 'Remaining'],
          datasets: [{
            data: [spec.score, 100 - spec.score],
            backgroundColor: [spec.color, withAlpha(spec.color, 0.12)],
            borderWidth: 0,
            // A 180° sweep starting at nine o'clock gives the classic dial.
            circumference: 180,
            rotation: 270,
          }],
        },
        options: baseOpts({
          cutout: spec.opts.cutout + '%',
          layout: { padding: spec.opts.thicknessPad },
          interaction: { intersect: true, mode: 'nearest' },
        }),
      }),
    },
    metrics: (spec) => [{ label: spec.label, value: spec.score + '%' }],
    legend: () => null,
  },

  {
    id: 'polar-area',
    title: 'Polar Area',
    category: 'Part to Whole',
    blurb: 'Equal angles, varying radius. Reads cyclical magnitude better than a pie.',
    tags: ['polar', 'radial', 'cyclical', 'monthly'],
    spec: {
      labels: [...MONTHS],
      values: [850, 920, 880, 1050, 1140, 1260, 1310, 1280, 1120, 1090, 1190, 1420],
      colors: [C.green, C.green, C.blue, C.blue, C.blue, C.amber, C.amber, C.amber, C.violet, C.violet, C.cyan, C.cyan],
      opts: { alpha: 0.72 },
    },
    controls: [
      ...sliceControls,
      { group: 'Style', type: 'slider', key: 'opts.alpha', label: 'Fill opacity', min: 0.2, max: 1, step: 0.04, format: (v) => Math.round(v * 100) + '%' },
    ],
    chartjs: {
      build: (spec) => ({
        type: 'polarArea',
        data: {
          labels: spec.labels,
          datasets: [{
            data: spec.values,
            backgroundColor: spec.labels.map((_, i) => withAlpha(spec.colors[i % spec.colors.length], spec.opts.alpha)),
            borderColor: spec.labels.map((_, i) => spec.colors[i % spec.colors.length]),
            borderWidth: 1,
          }],
        },
        options: baseOpts({
          layout: { padding: 12 },
          interaction: { intersect: true, mode: 'nearest' },
          scales: { r: { ticks: { display: false }, grid: { color: 'rgba(128,128,128,.14)' }, angleLines: { color: 'rgba(128,128,128,.14)' } } },
        }),
      }),
    },
    legend: (spec) => sliceLegend(spec),
  },

  {
    id: 'nightingale-rose',
    title: 'Nightingale Rose',
    category: 'Part to Whole',
    blurb: "Florence Nightingale's coxcomb: radius scaled by square root so area, not length, carries the value.",
    tags: ['rose', 'coxcomb', 'polar', 'radial', 'nightingale'],
    spec: {
      labels: [...MONTHS],
      values: [185, 210, 198, 240, 275, 310, 295, 330, 285, 320, 355, 410],
      colors: [C.green, C.green, C.blue, C.blue, C.blue, C.amber, C.amber, C.amber, C.violet, C.violet, C.cyan, C.cyan],
      opts: { textColor: '#808080', alpha: 0.75, rings: true, sqrtScale: true, gap: 0.02 },
    },
    controls: [
      ...sliceControls,
      { group: 'Style', type: 'slider', key: 'opts.alpha', label: 'Fill opacity', min: 0.25, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'slider', key: 'opts.gap', label: 'Segment gap', min: 0, max: 0.1, step: 0.005, format: (v) => v.toFixed(3) },
      { group: 'Style', type: 'toggle', key: 'opts.rings', label: 'Show guide rings' },
      { group: 'Style', type: 'toggle', key: 'opts.sqrtScale', label: 'Scale by area (√)' },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    canvas: {
      helpers: [inkColor],
      height: 400,
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const vals = spec.values;
        const o = spec.opts;
        const size = Math.min(W, H);
        const cx = W / 2;
        const cy = H / 2;
        const maxR = size / 2 - 34;
        const maxV = Math.max(...vals, 1);
        const slice = (Math.PI * 2) / Math.max(1, vals.length);

        if (o.rings) {
          [0.25, 0.5, 0.75, 1].forEach((t) => {
            ctx.beginPath();
            ctx.arc(cx, cy, maxR * t, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(128,128,128,.14)';
            ctx.lineWidth = 1;
            ctx.stroke();
          });
        }

        vals.forEach((v, i) => {
          const a0 = slice * i - Math.PI / 2 + o.gap;
          const a1 = slice * (i + 1) - Math.PI / 2 - o.gap;
          const ratio = v / maxV;
          const r = (o.sqrtScale ? Math.sqrt(ratio) : ratio) * maxR;
          const colour = spec.colors[i % spec.colors.length];
          // A wedge, not its bounding box: a box here covers most of the
          // circle and would steal every neighbour's hover.
          tip({
            cx: cx, cy: cy, r0: 0, r1: r, a0: a0, a1: a1,
            text: (spec.labels[i] || 'Slice ' + (i + 1)) + ': ' + v,
          });

          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, r, a0, a1);
          ctx.closePath();
          const alphaHex = Math.round(o.alpha * 255).toString(16).padStart(2, '0');
          ctx.fillStyle = colour + alphaHex;
          ctx.fill();
          ctx.strokeStyle = colour;
          ctx.lineWidth = 1;
          ctx.stroke();

          const mid = (a0 + a1) / 2;
          ctx.fillStyle = ink(0.9);
          ctx.font = '10px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(
            String(spec.labels[i] ?? ''),
            cx + Math.cos(mid) * (maxR + 16),
            cy + Math.sin(mid) * (maxR + 16) + 3,
          );
        });
      },
    },
    legend: (spec) => sliceLegend(spec),
  },

  {
    id: 'waffle',
    title: 'Waffle',
    category: 'Part to Whole',
    blurb: 'A hundred squares. Counting beats angle-judging, so small shares stay legible.',
    tags: ['waffle', 'unit chart', 'share', 'percentage', 'browsers'],
    spec: {
      segments: [
        { label: 'Chrome',  value: 65, color: C.violet   },
        { label: 'Safari',  value: 19, color: C.blue   },
        { label: 'Firefox', value: 8,  color: C.amber  },
        { label: 'Edge',    value: 5,  color: C.green },
        { label: 'Other',   value: 3,  color: C.slate   },
      ],
      opts: { columns: 10, gap: 3, radius: 2 },
    },
    controls: [
      { group: 'Data',  type: 'series', key: 'segments', data: false, max: 8, min: 2 },
      { group: 'Style', type: 'slider', key: 'opts.columns', label: 'Columns', min: 5, max: 20, step: 1 },
      { group: 'Style', type: 'slider', key: 'opts.gap', label: 'Cell gap', min: 0, max: 8, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.radius', label: 'Cell radius', min: 0, max: 10, step: 1, format: (v) => v + 'px' },
    ],
    onChange(spec) {
      spec.segments.forEach((s) => { if (typeof s.value !== 'number') s.value = 5; });
    },
    dom: {
      height: 340,
      mount(host, spec) {
        const o = spec.opts;
        const grid = document.createElement('div');
        grid.className = 'waffle-grid';
        grid.style.gridTemplateColumns = `repeat(${o.columns}, 1fr)`;
        grid.style.gap = o.gap + 'px';

        // One cell per unit, laid out in reading order.
        spec.segments.forEach((seg) => {
          for (let i = 0; i < Math.round(seg.value); i++) {
            const cell = document.createElement('div');
            cell.className = 'waffle-cell';
            cell.style.background = seg.color;
            cell.style.borderRadius = o.radius + 'px';
            // data-tip rather than title: the same styled readout every other
            // chart uses, instead of the browser's slow native tooltip.
            cell.setAttribute('data-tip', `${seg.label}: ${seg.value}%`);
            grid.appendChild(cell);
          }
        });

        host.appendChild(grid);
      },
    },
    css: `.waffle-grid {
  display: grid;
  width: 100%;
  max-width: 340px;
  margin: 0 auto;
}

.waffle-cell {
  aspect-ratio: 1;
  transition: opacity .15s;
}

.waffle-cell:hover { opacity: .65; }`,
    legend: (spec) => spec.segments.map((s) => ({
      label: `${s.label} ${s.value}%`,
      color: s.color,
      toggleable: false,
    })),
  },
];
