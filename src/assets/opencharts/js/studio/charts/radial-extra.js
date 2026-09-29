/**
 * Charts that wrap a straight axis around a circle.
 *
 * Bending an axis costs precision — the eye reads angle and arc length far
 * worse than it reads position on a line — so each of these has to earn the
 * circle with something a straight chart cannot do. The radial line closes a
 * cycle so December sits next to January. The radial column fits sixty
 * categories in the width of twenty. The nested areas share a centre so the
 * comparison is containment rather than adjacency. The radial dendrogram gives
 * a deep tree its leaves on a circumference, which grows far faster than a
 * page does.
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

/** Mean daily site visits by month, three years running. */
const RADIAL_SERIES = [
  { label: '2023', data: [3.1, 3.4, 4.2, 5.6, 7.1, 8.4, 9.0, 8.6, 6.9, 5.2, 4.0, 3.6] },
  { label: '2024', data: [3.6, 3.9, 5.0, 6.4, 8.2, 9.7, 10.4, 9.8, 7.6, 5.8, 4.4, 4.1] },
  { label: '2025', data: [4.2, 4.6, 5.8, 7.5, 9.4, 11.2, 12.1, 11.4, 8.8, 6.6, 5.1, 4.7] },
];

/** Wind measured every 15°, in km/h — 24 categories a bar chart would crowd. */
const RADIAL_COLUMNS = [
  ['N', 18], ['NNE', 14], ['NE', 11], ['ENE', 9], ['E', 8], ['ESE', 10],
  ['SE', 13], ['SSE', 17], ['S', 22], ['SSW', 26], ['SW', 31], ['WSW', 34],
  ['W', 36], ['WNW', 32], ['NW', 27], ['NNW', 22],
];

/** Global energy use by source, in exajoules — one figure inside another. */
const NESTED_ITEMS = [
  ['All sources', 604], ['Fossil', 494], ['Oil', 190],
  ['Coal', 161], ['Renewable', 72], ['Nuclear', 25],
];

const CATALOGUE_TREE = {
  name: 'Catalogue',
  children: [
    {
      name: 'Women',
      children: [
        { name: 'Dresses', children: [{ name: 'Silk', value: 180 }, { name: 'Linen', value: 120 }] },
        { name: 'Tops', children: [{ name: 'Tees', value: 75 }, { name: 'Blouses', value: 96 }] },
      ],
    },
    {
      name: 'Men',
      children: [
        { name: 'Shirts', children: [{ name: 'Oxford', value: 95 }, { name: 'Flannel', value: 68 }] },
        { name: 'Knitwear', children: [{ name: 'Merino', value: 130 }] },
      ],
    },
    {
      name: 'Living',
      children: [
        { name: 'Kitchen', children: [{ name: 'Pans', value: 88 }, { name: 'Knives', value: 64 }] },
        { name: 'Bedding', children: [{ name: 'Sheets', value: 110 }] },
      ],
    },
  ],
};

export const radialExtraCharts = [
  /* ── Radial line ───────────────────────────────────────────────────────── */
  {
    id: 'radial-line',
    title: 'Radial Line',
    category: 'Line & Area',
    blurb: 'A cycle wrapped into a circle, so the end of one turn meets the start of the next. For seasons, hours and anything that repeats.',
    tags: ['radial line', 'polar', 'circular', 'cycle', 'seasonal', 'wrapped'],
    spec: {
      labels: MONTHS.slice(),
      series: RADIAL_SERIES.map((s, i) => ({
        label: s.label,
        color: [C.green, C.blue, C.amber, C.violet, C.cyan][i % 5],
        data: s.data.slice(),
      })),
      opts: {
        textColor: '#808080',
        innerRadius: 0.18,
        lineWidth: 2.2,
        fill: false,
        fillOpacity: 0.16,
        showDots: true,
        rings: 4,
        startAt: -90,
      },
    },
    controls: [
      { group: 'Data', type: 'series', key: 'series', data: false, max: 6, min: 1 },
      { group: 'Shape', type: 'slider', key: 'opts.innerRadius', label: 'Hole size', min: 0, max: 0.6, step: 0.02, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Shape', type: 'slider', key: 'opts.startAt', label: 'Start angle', min: -180, max: 180, step: 15, format: (v) => v + '°' },
      { group: 'Style', type: 'slider', key: 'opts.lineWidth', label: 'Line width', min: 1, max: 6, step: 0.2, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.fill', label: 'Fill under the line' },
      { group: 'Style', type: 'slider', key: 'opts.fillOpacity', label: 'Fill opacity', min: 0.05, max: 0.6, step: 0.02, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'toggle', key: 'opts.showDots', label: 'Mark each point' },
      { group: 'Grid', type: 'slider', key: 'opts.rings', label: 'Grid rings', min: 2, max: 8, step: 1 },
      { group: 'Labels', type: 'color', key: 'opts.textColor', label: 'Text colour' },
    ],
    canvas: {
      height: 420,
      helpers: [inkColor],
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const compact = env && env.compact;
        const o = spec.opts;
        const labels = spec.labels || [];
        const series = (spec.series || []).filter((s) => s && s.data && s.data.length);
        if (!labels.length || !series.length) return;

        const cx = W / 2;
        const cy = H / 2 + (compact ? 0 : 6);
        const outer = Math.min(W, H) / 2 - (compact ? 10 : 42);
        const inner = outer * o.innerRadius;
        if (outer <= inner) return;

        let hi = 0;
        series.forEach((s) => s.data.forEach((v) => { hi = Math.max(hi, Number(v) || 0); }));
        if (!hi) hi = 1;

        const step = (Math.PI * 2) / labels.length;
        const base = (o.startAt * Math.PI) / 180;
        const angleAt = (i) => base + step * i;
        const radiusAt = (v) => inner + ((Number(v) || 0) / hi) * (outer - inner);

        // Grid rings first, so every line sits on top of them.
        ctx.strokeStyle = ink(0.16);
        ctx.lineWidth = 1;
        for (let r = 1; r <= o.rings; r++) {
          const rad = inner + ((outer - inner) * r) / o.rings;
          ctx.beginPath();
          ctx.arc(cx, cy, rad, 0, Math.PI * 2);
          ctx.stroke();
        }
        labels.forEach((_, i) => {
          const a = angleAt(i);
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
          ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
          ctx.stroke();
        });

        const alphaHex = Math.round(o.fillOpacity * 255).toString(16).padStart(2, '0');
        series.forEach((s) => {
          ctx.beginPath();
          labels.forEach((_, i) => {
            const a = angleAt(i);
            const r = radiusAt(s.data[i]);
            const x = cx + Math.cos(a) * r;
            const y = cy + Math.sin(a) * r;
            if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          });
          // Closing the path is the point of the chart: the cycle has no end.
          ctx.closePath();
          if (o.fill) {
            ctx.fillStyle = s.color + alphaHex;
            ctx.fill();
          }
          ctx.strokeStyle = s.color;
          ctx.lineWidth = o.lineWidth;
          ctx.lineJoin = 'round';
          ctx.stroke();

          if (o.showDots) {
            ctx.fillStyle = s.color;
            labels.forEach((_, i) => {
              const a = angleAt(i);
              const r = radiusAt(s.data[i]);
              ctx.beginPath();
              ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, o.lineWidth + 0.6, 0, Math.PI * 2);
              ctx.fill();
            });
          }
        });

        // One readout per spoke, listing every series at that point — a dot per
        // series would put three tips on top of each other near the centre.
        labels.forEach((label, i) => {
          const a = angleAt(i);
          const mid = (inner + outer) / 2;
          tip({
            cx: cx + Math.cos(a) * mid,
            cy: cy + Math.sin(a) * mid,
            r: Math.max(10, (outer - inner) / 2),
            text: label + '\n' + series.map((s) => s.label + ' ' + (s.data[i] ?? '—')).join('\n'),
          });
        });

        if (compact) return;
        ctx.fillStyle = ink(0.9);
        ctx.font = '11px "DM Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        labels.forEach((label, i) => {
          const a = angleAt(i);
          ctx.fillText(String(label), cx + Math.cos(a) * (outer + 16), cy + Math.sin(a) * (outer + 16));
        });
      },
    },
    legend: (spec) => (spec.series || []).map((s) => ({ label: s.label, color: s.color, line: true })),
  },

  /* ── Radial column ─────────────────────────────────────────────────────── */
  {
    id: 'radial-column',
    title: 'Radial Column',
    category: 'Part to Whole',
    blurb: 'Bars grown outward from a common circle. Fits many more categories than a bar chart, at the cost of comparing them exactly.',
    tags: ['radial column', 'circular bar', 'polar', 'racetrack', 'wind rose', 'categories'],
    spec: {
      labels: RADIAL_COLUMNS.map((r) => r[0]),
      values: RADIAL_COLUMNS.map((r) => r[1]),
      colors: RADIAL_COLUMNS.map((_, i) =>
        [C.green, C.blue, C.amber, C.violet, C.cyan, C.rose][i % 6]),
      opts: {
        textColor: '#808080',
        innerRadius: 0.28,
        gap: 0.16,
        startAt: -90,
        rings: 3,
        showLabels: true,
        unit: ' km/h',
      },
    },
    controls: [
      { group: 'Shape', type: 'slider', key: 'opts.innerRadius', label: 'Hole size', min: 0.05, max: 0.7, step: 0.02, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Shape', type: 'slider', key: 'opts.gap', label: 'Gap between columns', min: 0, max: 0.6, step: 0.02, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Shape', type: 'slider', key: 'opts.startAt', label: 'Start angle', min: -180, max: 180, step: 15, format: (v) => v + '°' },
      { group: 'Style', type: 'colors', key: 'colors', label: 'Column colours', names: (s) => s.labels },
      { group: 'Grid', type: 'slider', key: 'opts.rings', label: 'Grid rings', min: 0, max: 6, step: 1 },
      { group: 'Labels', type: 'toggle', key: 'opts.showLabels', label: 'Show labels' },
      { group: 'Labels', type: 'text', key: 'opts.unit', label: 'Unit suffix' },
      { group: 'Labels', type: 'color', key: 'opts.textColor', label: 'Text colour' },
    ],
    canvas: {
      height: 420,
      helpers: [inkColor],
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const compact = env && env.compact;
        const o = spec.opts;
        const labels = spec.labels || [];
        const values = spec.values || [];
        if (!labels.length) return;

        const cx = W / 2;
        const cy = H / 2;
        const outer = Math.min(W, H) / 2 - (compact ? 8 : 38);
        const inner = outer * o.innerRadius;
        const hi = Math.max.apply(null, values.map((v) => Number(v) || 0).concat([1]));
        const step = (Math.PI * 2) / labels.length;
        const base = (o.startAt * Math.PI) / 180;
        const pad = step * o.gap * 0.5;

        ctx.strokeStyle = ink(0.14);
        ctx.lineWidth = 1;
        for (let r = 1; r <= o.rings; r++) {
          ctx.beginPath();
          ctx.arc(cx, cy, inner + ((outer - inner) * r) / o.rings, 0, Math.PI * 2);
          ctx.stroke();
        }

        labels.forEach((label, i) => {
          const v = Number(values[i]) || 0;
          const r1 = inner + (v / hi) * (outer - inner);
          const a0 = base + step * i + pad;
          const a1 = base + step * (i + 1) - pad;

          ctx.beginPath();
          ctx.arc(cx, cy, inner, a0, a1);
          ctx.arc(cx, cy, r1, a1, a0, true);
          ctx.closePath();
          ctx.fillStyle = (spec.colors || [])[i % (spec.colors || [C.green]).length] || C.green;
          ctx.fill();

          // A wedge, not a box: a bounding box here covers most of the circle
          // and would steal every neighbour's hover.
          tip({ cx: cx, cy: cy, r0: inner, r1: r1, a0: a0, a1: a1,
            text: label + ' — ' + v + o.unit });

          if (o.showLabels && !compact) {
            const mid = (a0 + a1) / 2;
            ctx.save();
            ctx.translate(cx + Math.cos(mid) * (outer + 14), cy + Math.sin(mid) * (outer + 14));
            const flip = Math.cos(mid) < 0;
            ctx.rotate(flip ? mid + Math.PI : mid);
            ctx.fillStyle = ink(0.9);
            ctx.font = '10px "DM Sans", system-ui, sans-serif';
            ctx.textAlign = flip ? 'right' : 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(label), 0, 0);
            ctx.restore();
          }
        });
      },
    },
    legend: () => null,
    metrics: (spec) => {
      const values = (spec.values || []).map(Number).filter((v) => Number.isFinite(v));
      if (!values.length) return [];
      const hi = Math.max.apply(null, values);
      return [
        { label: 'Categories', value: values.length },
        { label: 'Peak', value: hi + spec.opts.unit },
        { label: 'Peak at', value: (spec.labels || [])[values.indexOf(hi)] || '—' },
      ];
    },
  },

  /* ── Nested proportional area ──────────────────────────────────────────── */
  {
    id: 'nested-area',
    title: 'Nested Proportional Area',
    category: 'Part to Whole',
    blurb: 'Circles sized by area and drawn one inside another. Shows a part sitting inside its whole rather than beside it.',
    tags: ['nested', 'proportional area', 'circles', 'containment', 'part to whole', 'onion'],
    spec: {
      items: NESTED_ITEMS.map(([label, value], i) => ({
        label,
        value,
        color: [C.green, C.blue, C.amber, C.violet, C.cyan, C.rose][i % 6],
      })),
      opts: {
        textColor: '#808080',
        shape: 'circle',
        align: 'bottom',
        alpha: 0.82,
        outline: true,
        showLabels: true,
        unit: ' EJ',
      },
    },
    controls: [
      { group: 'Data', type: 'series', key: 'items', data: false, max: 8, min: 1 },
      { group: 'Shape', type: 'seg', key: 'opts.shape', label: 'Shape',
        options: [{ value: 'circle', label: 'Circles' }, { value: 'square', label: 'Squares' }] },
      { group: 'Shape', type: 'seg', key: 'opts.align', label: 'Aligned',
        options: [{ value: 'bottom', label: 'On a baseline' }, { value: 'centre', label: 'On a centre' }] },
      { group: 'Style', type: 'slider', key: 'opts.alpha', label: 'Fill opacity', min: 0.3, max: 1, step: 0.02, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'toggle', key: 'opts.outline', label: 'Outline each' },
      { group: 'Labels', type: 'toggle', key: 'opts.showLabels', label: 'Show labels' },
      { group: 'Labels', type: 'text', key: 'opts.unit', label: 'Unit suffix' },
      { group: 'Labels', type: 'color', key: 'opts.textColor', label: 'Text colour' },
    ],
    canvas: {
      height: 400,
      helpers: [inkColor],
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const compact = env && env.compact;
        const o = spec.opts;
        // Largest outward-in, so every smaller figure lands on top of the one
        // that contains it rather than behind it.
        const items = (spec.items || []).slice()
          .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
        if (!items.length) return;

        const hi = Number(items[0].value) || 1;
        const pad = compact ? 8 : 26;
        const labelRoom = o.showLabels && !compact ? 150 : 0;
        const maxR = Math.min((W - pad * 2 - labelRoom) / 2, (H - pad * 2) / 2);
        if (maxR <= 0) return;

        const cx = pad + maxR;
        const bottom = H - pad;
        const alphaHex = Math.round(o.alpha * 255).toString(16).padStart(2, '0');

        // Area, not radius, carries the value — that is what "proportional
        // area" means, and scaling the radius instead exaggerates by squaring.
        const sizeOf = (v) => maxR * Math.sqrt(Math.max(0, Number(v) || 0) / hi);

        items.forEach((it) => {
          const r = sizeOf(it.value);
          const cy = o.align === 'bottom' ? bottom - r : pad + maxR;
          ctx.fillStyle = it.color + alphaHex;
          ctx.beginPath();
          if (o.shape === 'square') ctx.rect(cx - r, cy - r, r * 2, r * 2);
          else ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          if (o.outline) {
            ctx.strokeStyle = it.color;
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }

          const share = hi ? Math.round(((Number(it.value) || 0) / hi) * 100) : 0;
          const text = it.label + ' — ' + it.value + o.unit + '\n' + share + '% of the largest';
          // Recorded smallest last: regions are searched newest first, so the
          // innermost figure — the one actually under the cursor — wins.
          if (o.shape === 'square') tip(cx - r, cy - r, r * 2, r * 2, text);
          else tip({ cx: cx, cy: cy, r: r, text: text });
        });

        if (!o.showLabels || compact) return;
        ctx.font = '11px "DM Sans", system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        items.forEach((it) => {
          const r = sizeOf(it.value);
          const cy = o.align === 'bottom' ? bottom - r : pad + maxR;
          const y = cy - r;
          ctx.strokeStyle = ink(0.35);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx, y);
          ctx.lineTo(cx + maxR + 12, y);
          ctx.stroke();
          ctx.fillStyle = ink(0.95);
          ctx.textAlign = 'left';
          ctx.fillText(it.label + '  ' + it.value + o.unit, cx + maxR + 18, y);
        });
      },
    },
    legend: (spec) => (spec.items || []).map((it) => ({ label: it.label, color: it.color })),
  },

  /* ── Radial dendrogram ─────────────────────────────────────────────────── */
  {
    id: 'dendrogram-radial',
    title: 'Radial Dendrogram',
    category: 'Hierarchy',
    blurb: 'The tree laid around a circle, leaves on the circumference. Fits a deeper hierarchy than a page is wide.',
    tags: ['radial dendrogram', 'circular tree', 'hierarchy', 'cluster', 'taxonomy', 'd3'],
    spec: {
      tree: JSON.parse(JSON.stringify(CATALOGUE_TREE)),
      groups: ['Women', 'Men', 'Living'],
      colors: [C.green, C.blue, C.amber],
      opts: {
        layout: 'cluster',
        nodeRadius: 3.5,
        linkWidth: 1.3,
        curved: true,
        showLabels: true,
        fontSize: 11,
        spread: 340,
      },
    },
    controls: [
      { group: 'Layout', type: 'seg', key: 'opts.layout', label: 'Layout',
        options: [{ value: 'cluster', label: 'Aligned leaves' }, { value: 'tidy', label: 'Tidy tree' }] },
      { group: 'Layout', type: 'slider', key: 'opts.spread', label: 'Arc', min: 180, max: 360, step: 10, format: (v) => v + '°' },
      { group: 'Style', type: 'colors', key: 'colors', label: 'Branch colours', names: (s) => s.groups },
      { group: 'Style', type: 'toggle', key: 'opts.curved', label: 'Curved links' },
      { group: 'Style', type: 'slider', key: 'opts.nodeRadius', label: 'Node size', min: 2, max: 9, step: 0.5, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.linkWidth', label: 'Link width', min: 0.5, max: 4, step: 0.5, format: (v) => v + 'px' },
      { group: 'Labels', type: 'toggle', key: 'opts.showLabels', label: 'Show labels' },
      { group: 'Labels', type: 'slider', key: 'opts.fontSize', label: 'Label size', min: 8, max: 15, step: 1, format: (v) => v + 'px' },
    ],
    d3: {
      height: 440,
      mount(host, spec, W, H, env) {
        const o = spec.opts;
        const compact = env && env.compact;
        const svg = d3.select(host).append('svg').attr('width', W).attr('height', H);
        if (!spec.tree) return;

        const labelRoom = o.showLabels && !compact ? 82 : 12;
        const radius = Math.min(W, H) / 2 - labelRoom;
        if (radius <= 10) return;

        const root = d3.hierarchy(spec.tree);
        const sweep = (Math.min(360, Math.max(60, o.spread)) * Math.PI) / 180;
        const layout = o.layout === 'tidy' ? d3.tree() : d3.cluster();
        layout.size([sweep, radius])(root);

        const g = svg.append('g')
          .attr('transform', 'translate(' + (W / 2) + ',' + (H / 2) + ') rotate(-90)');

        const colourFor = (d) => {
          const top = d.ancestors().find((a) => a.depth === 1);
          const i = top ? spec.groups.indexOf(top.data.name) : -1;
          return i >= 0 ? spec.colors[i % spec.colors.length] : '#8B8880';
        };

        const straight = d3.linkRadial().angle((d) => d.x).radius((d) => d.y);
        g.append('g').selectAll('path').data(root.links()).join('path')
          .attr('d', (l) => (o.curved ? straight(l)
            : 'M' + (Math.cos(l.source.x) * l.source.y) + ',' + (Math.sin(l.source.x) * l.source.y)
              + 'L' + (Math.cos(l.target.x) * l.target.y) + ',' + (Math.sin(l.target.x) * l.target.y)))
          .attr('fill', 'none')
          .attr('stroke', (l) => colourFor(l.target))
          .attr('stroke-opacity', 0.55)
          .attr('stroke-width', o.linkWidth);

        const node = g.append('g').selectAll('g').data(root.descendants()).join('g')
          .attr('transform', (d) => 'rotate(' + ((d.x * 180) / Math.PI - 90) + ') translate(' + d.y + ',0)');

        node.append('circle')
          .attr('r', (d) => (d.children ? o.nodeRadius : o.nodeRadius * 1.25))
          .attr('fill', (d) => (d.depth ? colourFor(d) : '#8B8880'))
          .attr('data-tip', (d) => d.data.name
            + (d.data.value != null ? ' — ' + d.data.value : '')
            + '\ndepth ' + d.depth
            + (d.children ? ', ' + d.leaves().length + ' leaves' : ', leaf'));

        if (!o.showLabels || compact) return;
        node.filter((d) => !d.children).append('text')
          .attr('dy', '0.32em')
          .attr('x', 8)
          .attr('transform', (d) => (d.x >= Math.PI ? 'rotate(180) translate(-16,0)' : null))
          .attr('text-anchor', (d) => (d.x >= Math.PI ? 'end' : 'start'))
          .attr('font-size', o.fontSize)
          .attr('fill', 'currentColor')
          .attr('opacity', 0.9)
          .text((d) => d.data.name);
      },
    },
    legend: (spec) => spec.groups.map((label, i) => ({ label, color: spec.colors[i % spec.colors.length] })),
  },
];
