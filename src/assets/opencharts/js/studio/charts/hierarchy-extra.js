/**
 * Further hierarchy charts: icicle, dendrogram, Voronoi and proportional area.
 *
 * The icicle and the sunburst read the same `d3.partition` layout — one in
 * Cartesian space, one in polar. Keeping the tree identical between them makes
 * that relationship visible when you flick between the two in the studio.
 */

import { C } from '../palette.js';

const RETAIL_TREE = {
  name: 'All',
  children: [
    { name: 'Women', children: [
      { name: 'Dresses',   children: [{ name: 'Silk Midi', value: 180 }, { name: 'Linen Wrap', value: 140 }, { name: 'Cotton Day', value: 100 }] },
      { name: 'Tops',      children: [{ name: 'Blouses', value: 90 }, { name: 'Tees', value: 75 }, { name: 'Knits', value: 120 }] },
      { name: 'Outerwear', children: [{ name: 'Wool Coat', value: 200 }, { name: 'Blazer', value: 110 }] },
    ] },
    { name: 'Men', children: [
      { name: 'Shirts',   children: [{ name: 'Oxford', value: 95 }, { name: 'Linen', value: 80 }, { name: 'Casual', value: 65 }] },
      { name: 'Trousers', children: [{ name: 'Chinos', value: 85 }, { name: 'Wide-leg', value: 110 }] },
    ] },
    { name: 'Living', children: [
      { name: 'Textiles', children: [{ name: 'Cushions', value: 60 }, { name: 'Throws', value: 80 }] },
      { name: 'Ceramics', children: [{ name: 'Mugs', value: 45 }, { name: 'Bowls', value: 50 }] },
    ] },
  ],
};

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

export const hierarchyExtraCharts = [
  {
    id: 'icicle',
    title: 'Icicle',
    category: 'Hierarchy',
    blurb: 'A sunburst unrolled. Depth runs one way, share the other — easier to label than the radial form.',
    tags: ['icicle', 'partition', 'hierarchy', 'tree', 'flame', 'd3'],
    spec: {
      tree: JSON.parse(JSON.stringify(RETAIL_TREE)),
      groups: ['Women', 'Men', 'Living'],
      colors: [C.green, C.blue, C.amber],
      opts: { orientation: 'horizontal', gap: 2, radius: 3, showLabels: true, minLabel: 26, fontSize: 11 },
    },
    controls: [
      { group: 'Layout', type: 'seg', key: 'opts.orientation', label: 'Direction',
        options: [{ value: 'horizontal', label: 'Across' }, { value: 'vertical', label: 'Down' }] },
      { group: 'Style',  type: 'colors', key: 'colors', label: 'Branch colours', names: (s) => s.groups },
      { group: 'Style',  type: 'slider', key: 'opts.gap', label: 'Cell gap', min: 0, max: 8, step: 1, format: (v) => v + 'px' },
      { group: 'Style',  type: 'slider', key: 'opts.radius', label: 'Corner radius', min: 0, max: 10, step: 1, format: (v) => v + 'px' },
      { group: 'Labels', type: 'toggle', key: 'opts.showLabels', label: 'Show labels' },
      { group: 'Labels', type: 'slider', key: 'opts.minLabel', label: 'Label threshold', min: 8, max: 70, step: 2, format: (v) => v + 'px' },
      { group: 'Labels', type: 'slider', key: 'opts.fontSize', label: 'Label size', min: 8, max: 16, step: 1, format: (v) => v + 'px' },
    ],
    d3: {
      height: 400,
      mount(host, spec, W, H) {
        const o = spec.opts;
        const across = o.orientation === 'horizontal';

        const root = d3.hierarchy(spec.tree).sum((d) => d.value || 0).sort((a, b) => b.value - a.value);
        // partition() fills [0..size] on both axes; which one is "depth"
        // depends on the orientation we then read it back out with.
        d3.partition().size(across ? [H, W] : [W, H]).padding(0)(root);

        const svg = d3.select(host).append('svg').attr('width', W).attr('height', H);
        const nodes = root.descendants().filter((d) => d.depth > 0);

        const colourFor = (d) => {
          const top = d.ancestors().find((a) => a.depth === 1);
          const i = top ? spec.groups.indexOf(top.data.name) : -1;
          const base = i >= 0 ? spec.colors[i % spec.colors.length] : '#5A6270';
          const fade = d.depth === 1 ? 'ee' : d.depth === 2 ? 'aa' : '77';
          return base + fade;
        };

        const g = svg.append('g').selectAll('g').data(nodes).join('g')
          .attr('transform', (d) => (across
            ? `translate(${d.y0},${d.x0})`
            : `translate(${d.x0},${d.y0})`));

        const boxW = (d) => Math.max(0, (across ? d.y1 - d.y0 : d.x1 - d.x0) - o.gap);
        const boxH = (d) => Math.max(0, (across ? d.x1 - d.x0 : d.y1 - d.y0) - o.gap);

        g.append('rect')
          .attr('width', boxW)
          .attr('height', boxH)
          .attr('rx', o.radius)
          .attr('fill', colourFor)
          .attr('data-tip', (d) => `${d.data.name}\n$${d.value}K`);

        if (o.showLabels) {
          g.append('text')
            .attr('x', 6)
            .attr('y', (d) => boxH(d) / 2)
            .attr('dy', '0.35em')
            .attr('font-size', o.fontSize)
            .attr('font-family', '"DM Sans", system-ui, sans-serif')
            .attr('fill', '#ffffff')
            .attr('pointer-events', 'none')
            .text((d) => ((across ? boxW(d) : boxH(d)) > o.minLabel ? d.data.name : ''));
        }
      },
    },
    legend: (spec) => spec.groups.map((g, i) => ({
      label: g, color: spec.colors[i % spec.colors.length], toggleable: false,
    })),
  },

  {
    id: 'dendrogram',
    title: 'Dendrogram',
    category: 'Hierarchy',
    blurb: 'The tree drawn as a tree. Shows structure and depth rather than the size of each part.',
    tags: ['dendrogram', 'tree', 'cluster', 'taxonomy', 'hierarchy', 'd3'],
    spec: {
      tree: JSON.parse(JSON.stringify(RETAIL_TREE)),
      groups: ['Women', 'Men', 'Living'],
      colors: [C.green, C.blue, C.amber],
      opts: { layout: 'tidy', orientation: 'horizontal', nodeRadius: 4, linkWidth: 1.4, showLabels: true, fontSize: 11, curved: true },
    },
    controls: [
      { group: 'Layout', type: 'seg', key: 'opts.layout', label: 'Layout',
        options: [{ value: 'tidy', label: 'Tidy tree' }, { value: 'cluster', label: 'Aligned leaves' }] },
      { group: 'Layout', type: 'seg', key: 'opts.orientation', label: 'Direction',
        options: [{ value: 'horizontal', label: 'Across' }, { value: 'vertical', label: 'Down' }] },
      { group: 'Style',  type: 'colors', key: 'colors', label: 'Branch colours', names: (s) => s.groups },
      { group: 'Style',  type: 'toggle', key: 'opts.curved', label: 'Curved links' },
      { group: 'Style',  type: 'slider', key: 'opts.nodeRadius', label: 'Node size', min: 2, max: 10, step: 1, format: (v) => v + 'px' },
      { group: 'Style',  type: 'slider', key: 'opts.linkWidth', label: 'Link width', min: 0.5, max: 4, step: 0.5, format: (v) => v + 'px' },
      { group: 'Labels', type: 'toggle', key: 'opts.showLabels', label: 'Show labels' },
      { group: 'Labels', type: 'slider', key: 'opts.fontSize', label: 'Label size', min: 8, max: 15, step: 1, format: (v) => v + 'px' },
    ],
    d3: {
      height: 420,
      mount(host, spec, W, H) {
        const o = spec.opts;
        const across = o.orientation === 'horizontal';
        const pad = across ? { t: 14, r: 118, b: 14, l: 26 } : { t: 26, r: 20, b: 96, l: 20 };
        const innerW = W - pad.l - pad.r;
        const innerH = H - pad.t - pad.b;

        const root = d3.hierarchy(spec.tree);
        // cluster() puts every leaf on the same line; tree() spaces by depth.
        const layout = o.layout === 'cluster' ? d3.cluster() : d3.tree();
        layout.size(across ? [innerH, innerW] : [innerW, innerH])(root);

        const px = (d) => (across ? d.y : d.x);
        const py = (d) => (across ? d.x : d.y);

        const colourFor = (d) => {
          const top = d.ancestors().find((a) => a.depth === 1);
          const i = top ? spec.groups.indexOf(top.data.name) : -1;
          return i >= 0 ? spec.colors[i % spec.colors.length] : '#8B8880';
        };

        const svg = d3.select(host).append('svg').attr('width', W).attr('height', H)
          .append('g').attr('transform', `translate(${pad.l},${pad.t})`);

        svg.append('g').selectAll('path').data(root.links()).join('path')
          .attr('d', (l) => {
            const x1 = px(l.source), y1 = py(l.source);
            const x2 = px(l.target), y2 = py(l.target);
            if (!o.curved) return `M${x1},${y1}L${x2},${y2}`;
            return across
              ? `M${x1},${y1}C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`
              : `M${x1},${y1}C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`;
          })
          .attr('fill', 'none')
          .attr('stroke', (l) => colourFor(l.target))
          .attr('stroke-opacity', 0.5)
          .attr('stroke-width', o.linkWidth);

        const g = svg.append('g').selectAll('g').data(root.descendants()).join('g')
          .attr('transform', (d) => `translate(${px(d)},${py(d)})`);

        g.append('circle')
          .attr('r', (d) => (d.depth === 0 ? o.nodeRadius + 2 : o.nodeRadius))
          .attr('fill', (d) => (d.depth === 0 ? '#8B8880' : colourFor(d)))
          .attr('data-tip', (d) => d.data.name);

        if (o.showLabels) {
          g.append('text')
            .attr('x', across ? o.nodeRadius + 5 : 0)
            .attr('y', across ? 0 : o.nodeRadius + 12)
            .attr('dy', across ? '0.35em' : 0)
            .attr('text-anchor', across ? 'start' : 'middle')
            .attr('transform', across ? null : (d) => (d.children ? null : 'rotate(35)'))
            .attr('font-size', o.fontSize)
            .attr('font-family', '"DM Sans", system-ui, sans-serif')
            .attr('fill', 'currentColor')
            .attr('pointer-events', 'none')
            .text((d) => d.data.name);
        }
      },
    },
    legend: (spec) => spec.groups.map((g, i) => ({
      label: g, color: spec.colors[i % spec.colors.length], toggleable: false,
    })),
  },

  {
    id: 'voronoi',
    title: 'Voronoi Diagram',
    category: 'Hierarchy',
    blurb: 'Space divided by nearest point. Every cell is the territory closest to its seed.',
    tags: ['voronoi', 'tessellation', 'territory', 'nearest', 'delaunay', 'd3'],
    spec: {
      seeds: [
        { label: 'Depot N', x: 22, y: 18, group: 0 },
        { label: 'Depot E', x: 78, y: 26, group: 1 },
        { label: 'Depot S', x: 62, y: 82, group: 2 },
        { label: 'Depot W', x: 16, y: 68, group: 3 },
        { label: 'Depot C', x: 48, y: 48, group: 0 },
        { label: 'Depot NE', x: 86, y: 60, group: 1 },
        { label: 'Depot SW', x: 34, y: 88, group: 2 },
      ],
      groups: ['Region A', 'Region B', 'Region C', 'Region D'],
      colors: [C.green, C.blue, C.amber, C.violet],
      opts: { alpha: 0.35, showSeeds: true, showLabels: true, seedRadius: 4, strokeWidth: 1.5, showDelaunay: false },
    },
    controls: [
      { group: 'Style',  type: 'colors', key: 'colors', label: 'Region colours', names: (s) => s.groups },
      { group: 'Style',  type: 'slider', key: 'opts.alpha', label: 'Fill opacity', min: 0.05, max: 0.8, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style',  type: 'slider', key: 'opts.strokeWidth', label: 'Border width', min: 0, max: 5, step: 0.5, format: (v) => v + 'px' },
      { group: 'Marks',  type: 'toggle', key: 'opts.showSeeds', label: 'Show seed points' },
      { group: 'Marks',  type: 'slider', key: 'opts.seedRadius', label: 'Seed size', min: 2, max: 10, step: 1, format: (v) => v + 'px' },
      { group: 'Marks',  type: 'toggle', key: 'opts.showLabels', label: 'Show labels' },
      { group: 'Marks',  type: 'toggle', key: 'opts.showDelaunay', label: 'Show Delaunay links' },
    ],
    d3: {
      height: 420,
      mount(host, spec, W, H) {
        const o = spec.opts;
        const pad = 8;
        const toX = (v) => pad + (v / 100) * (W - pad * 2);
        const toY = (v) => pad + (v / 100) * (H - pad * 2);
        const pts = spec.seeds.map((s) => [toX(s.x), toY(s.y)]);

        const delaunay = d3.Delaunay.from(pts);
        const voronoi = delaunay.voronoi([0, 0, W, H]);

        const svg = d3.select(host).append('svg').attr('width', W).attr('height', H);
        const alphaHex = Math.round(o.alpha * 255).toString(16).padStart(2, '0');
        const colourOf = (i) => spec.colors[(spec.seeds[i].group || 0) % spec.colors.length];

        svg.append('g').selectAll('path').data(spec.seeds).join('path')
          .attr('d', (_, i) => voronoi.renderCell(i))
          .attr('fill', (_, i) => colourOf(i) + alphaHex)
          .attr('stroke', (_, i) => colourOf(i))
          .attr('stroke-width', o.strokeWidth)
          .attr('data-tip', (d) => d.label);

        if (o.showDelaunay) {
          svg.append('path')
            .attr('d', delaunay.render())
            .attr('fill', 'none')
            .attr('stroke', 'currentColor')
            .attr('stroke-opacity', 0.22)
            .attr('stroke-width', 1);
        }

        if (o.showSeeds) {
          const g = svg.append('g').selectAll('g').data(spec.seeds).join('g')
            .attr('transform', (d) => `translate(${toX(d.x)},${toY(d.y)})`);
          g.append('circle')
            .attr('r', o.seedRadius)
            .attr('fill', (_, i) => colourOf(i))
            .attr('stroke', '#ffffff').attr('stroke-width', 1.5);
          if (o.showLabels) {
            g.append('text')
              .attr('x', o.seedRadius + 5).attr('dy', '0.35em')
              .attr('font-size', 11)
              .attr('font-family', '"DM Sans", system-ui, sans-serif')
              .attr('fill', 'currentColor')
              .text((d) => d.label);
          }
        }
      },
    },
    legend: (spec) => spec.groups.map((g, i) => ({
      label: g, color: spec.colors[i % spec.colors.length], toggleable: false,
    })),
  },

  {
    id: 'proportional-area',
    title: 'Proportional Area',
    category: 'Part to Whole',
    blurb: 'Shapes scaled so area — not width — carries the value. Nested to make the ratio directly comparable.',
    tags: ['proportional area', 'nested', 'magnitude', 'ratio', 'squares', 'circles'],
    spec: {
      items: [
        { label: 'Global', value: 8100, color: C.green },
        { label: 'Europe', value: 4400, color: C.blue },
        { label: 'UK',     value: 1250, color: C.amber },
        { label: 'London', value: 420,  color: C.cyan },
      ],
      opts: { textColor: '#808080', shape: 'circle', mode: 'nested', alpha: 0.85, showValues: true, labelSize: 11, suffix: 'K' },
    },
    controls: [
      { group: 'Data',  type: 'series', key: 'items', data: false, max: 8, min: 2 },
      { group: 'Shape', type: 'seg',    key: 'opts.shape', label: 'Shape',
        options: [{ value: 'circle', label: 'Circles' }, { value: 'square', label: 'Squares' }] },
      { group: 'Shape', type: 'seg',    key: 'opts.mode', label: 'Arrangement',
        options: [{ value: 'nested', label: 'Nested' }, { value: 'row', label: 'In a row' }] },
      { group: 'Style', type: 'slider', key: 'opts.alpha', label: 'Fill opacity', min: 0.2, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'toggle', key: 'opts.showValues', label: 'Show values' },
      { group: 'Axis',  type: 'text',   key: 'opts.suffix', label: 'Value suffix' },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    onChange(spec) {
      spec.items.forEach((it, i) => { if (typeof it.value !== 'number') it.value = 500 / (i + 1); });
    },
    canvas: {
      helpers: [inkColor],
      height: 400,
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const items = spec.items.slice().sort((a, b) => b.value - a.value);
        if (!items.length) return;

        const maxV = items[0].value || 1;
        const alphaHex = Math.round(o.alpha * 255).toString(16).padStart(2, '0');
        // Area ∝ value, so the linear dimension goes as the square root.
        const scale = (v) => Math.sqrt(v / maxV);

        if (o.mode === 'nested') {
          const maxR = Math.min(W, H) / 2 - 46;
          const cx = W / 2;
          const baseY = H - 30;

          items.forEach((it) => {
            const s = scale(it.value);
            const label = it.label + ': ' + it.value + o.suffix;
            if (o.shape === 'circle') {
              const r = maxR * s;
              // Nested shapes are drawn largest first, so the smallest is last
              // in the list and wins the hit test — which is what you can see.
              tip({ cx: cx, cy: baseY - r, r: r, text: label });
              ctx.beginPath();
              ctx.arc(cx, baseY - r, r, 0, Math.PI * 2);
              ctx.fillStyle = it.color + alphaHex;
              ctx.fill();
              ctx.strokeStyle = it.color;
              ctx.lineWidth = 1.5;
              ctx.stroke();
            } else {
              const side = maxR * 2 * s;
              tip(cx - side / 2, baseY - side, side, side, label);
              ctx.beginPath();
              ctx.rect(cx - side / 2, baseY - side, side, side);
              ctx.fillStyle = it.color + alphaHex;
              ctx.fill();
              ctx.strokeStyle = it.color;
              ctx.lineWidth = 1.5;
              ctx.stroke();
            }
          });

          // Labels stack down the right so nested shapes stay uncluttered.
          ctx.font = o.labelSize + 'px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'left';
          items.forEach((it, i) => {
            const y = 24 + i * 20;
            ctx.fillStyle = it.color;
            ctx.fillRect(W - 132, y - 8, 10, 10);
            ctx.fillStyle = ink(0.95);
            const text = o.showValues ? `${it.label} · ${it.value}${o.suffix}` : it.label;
            ctx.fillText(text, W - 116, y + 1);
          });
        } else {
          const slot = W / items.length;
          const maxSide = Math.min(slot * 0.82, H - 90);
          const baseY = H - 46;
          items.forEach((it, i) => {
            const cx = slot * i + slot / 2;
            const s = scale(it.value);
            // Side by side, the whole column is the target — the shapes are
            // small and a reader should not have to find the exact circle.
            tip(slot * i, 0, slot, H, it.label + ': ' + it.value + o.suffix);
            if (o.shape === 'circle') {
              const r = (maxSide / 2) * s;
              ctx.beginPath();
              ctx.arc(cx, baseY - r, r, 0, Math.PI * 2);
              ctx.fillStyle = it.color + alphaHex;
              ctx.fill();
              ctx.strokeStyle = it.color;
              ctx.lineWidth = 1.5;
              ctx.stroke();
            } else {
              const side = maxSide * s;
              ctx.beginPath();
              ctx.rect(cx - side / 2, baseY - side, side, side);
              ctx.fillStyle = it.color + alphaHex;
              ctx.fill();
              ctx.strokeStyle = it.color;
              ctx.lineWidth = 1.5;
              ctx.stroke();
            }
            ctx.fillStyle = ink(0.95);
            ctx.font = o.labelSize + 'px "DM Sans", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(it.label, cx, baseY + 18);
            if (o.showValues) {
              ctx.fillStyle = it.color;
              ctx.font = '500 ' + o.labelSize + 'px "DM Sans", system-ui, sans-serif';
              ctx.fillText(it.value + o.suffix, cx, baseY + 34);
            }
          });
        }
      },
    },
    legend: () => null,
  },
];
