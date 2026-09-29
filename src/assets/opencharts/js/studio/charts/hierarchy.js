/**
 * Hierarchy chart definitions: treemap, sunburst, circle pack.
 *
 * The two D3 charts mount an <svg> into a plain <div>; their `mount` functions
 * are printed verbatim into the exported code, so they touch nothing but their
 * arguments and the global `d3`.
 */

import { C } from '../palette.js';
import { baseOpts } from '../chartjs-base.js';
import { srcFn } from '../serialize.js';

/** The shared retail hierarchy the three charts read from. */
const RETAIL_GROUPS = ['Women', 'Men', 'Living'];

export const hierarchyCharts = [
  {
    id: 'treemap',
    title: 'Treemap',
    category: 'Hierarchy',
    blurb: 'Nested rectangles sized by value. Packs a lot of parts into a fixed frame.',
    tags: ['treemap', 'hierarchy', 'nested', 'revenue', 'area'],
    spec: {
      items: [
        { g: 'Women',  label: 'Dresses',     value: 420 },
        { g: 'Women',  label: 'Tops',        value: 285 },
        { g: 'Women',  label: 'Outerwear',   value: 310 },
        { g: 'Women',  label: 'Accessories', value: 175 },
        { g: 'Men',    label: 'Shirts',      value: 240 },
        { g: 'Men',    label: 'Trousers',    value: 195 },
        { g: 'Men',    label: 'Outerwear',   value: 260 },
        { g: 'Men',    label: 'Footwear',    value: 180 },
        { g: 'Living', label: 'Textiles',    value: 140 },
        { g: 'Living', label: 'Ceramics',    value: 95  },
        { g: 'Living', label: 'Lighting',    value: 115 },
      ],
      groups: [...RETAIL_GROUPS],
      colors: [C.green, C.blue, C.amber],
      opts: { alpha: 0.78, showLabels: true, borderWidth: 1, fontSize: 11 },
    },
    controls: [
      { group: 'Style', type: 'colors', key: 'colors', label: 'Group colours', names: (s) => s.groups },
      { group: 'Style', type: 'slider', key: 'opts.alpha', label: 'Fill opacity', min: 0.3, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'slider', key: 'opts.borderWidth', label: 'Gap', min: 0, max: 6, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.showLabels', label: 'Show labels' },
      { group: 'Style', type: 'slider', key: 'opts.fontSize', label: 'Label size', min: 8, max: 16, step: 1, format: (v) => v + 'px' },
    ],
    chartjs: {
      plugins: ['treemap'],
      build(spec, env) {
        // Colour is resolved by group name, so build a literal lookup the
        // exported callback can carry with it.
        const lookup = {};
        spec.groups.forEach((g, i) => { lookup[g] = spec.colors[i % spec.colors.length]; });
        const lookupJSON = JSON.stringify(lookup);
        const alphaHex = Math.round(spec.opts.alpha * 255).toString(16).padStart(2, '0');

        return {
          type: 'treemap',
          data: {
            datasets: [{
              label: 'Revenue',
              tree: spec.items,
              key: 'value',
              groups: ['g', 'label'],
              backgroundColor: srcFn(
                `(ctx) => {\n`
                + `  const colours = ${lookupJSON};\n`
                + `  const raw = ctx.raw;\n`
                + `  if (!raw || !raw.g) return 'transparent';\n`
                + `  const base = colours[raw.g] || '#5A6270';\n`
                + `  return base + (ctx.type === 'data' ? '${alphaHex}' : '44');\n`
                + `}`,
              ),
              borderColor: 'rgba(255,255,255,.45)',
              borderWidth: spec.opts.borderWidth,
              spacing: 0,
              labels: {
                // Labels are unreadable at gallery-preview size, so drop them there.
                display: spec.opts.showLabels && !(env && env.compact),
                color: '#ffffff',
                font: { size: spec.opts.fontSize, weight: '500' },
                formatter: srcFn(`(ctx) => (ctx.raw && ctx.raw._data ? ctx.raw._data.label : '') || (ctx.raw ? ctx.raw.g : '') || ''`),
              },
            }],
          },
          options: baseOpts({
            interaction: { intersect: true, mode: 'nearest' },
            plugins: {
              tooltip: {
                callbacks: {
                  title: srcFn(`(ctx) => (ctx[0].raw._data ? ctx[0].raw._data.label : ctx[0].raw.g) || ''`),
                  label: srcFn(`(ctx) => 'Revenue: $' + ctx.raw.v + 'K'`),
                },
              },
            },
          }),
        };
      },
    },
    legend: (spec) => spec.groups.map((g, i) => ({
      label: g, color: spec.colors[i % spec.colors.length], toggleable: false,
    })),
  },

  {
    id: 'sunburst',
    title: 'Sunburst',
    category: 'Hierarchy',
    blurb: 'Radial partition — depth outward, share by angle. Reads a deep tree in one glance.',
    tags: ['sunburst', 'hierarchy', 'radial', 'partition', 'd3'],
    spec: {
      tree: {
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
      },
      groups: [...RETAIL_GROUPS],
      colors: [C.green, C.blue, C.amber],
      opts: { padAngle: 0.004, ringGap: 2, showLabels: true, minAngle: 0.15, fontSize: 10 },
    },
    controls: [
      { group: 'Style', type: 'colors', key: 'colors', label: 'Branch colours', names: (s) => s.groups },
      { group: 'Style', type: 'slider', key: 'opts.ringGap', label: 'Ring gap', min: 0, max: 8, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.padAngle', label: 'Segment gap', min: 0, max: 0.02, step: 0.001, format: (v) => v.toFixed(3) },
      { group: 'Labels', type: 'toggle', key: 'opts.showLabels', label: 'Show labels' },
      { group: 'Labels', type: 'slider', key: 'opts.minAngle', label: 'Label threshold', min: 0.03, max: 0.5, step: 0.01, format: (v) => v.toFixed(2) },
      { group: 'Labels', type: 'slider', key: 'opts.fontSize', label: 'Label size', min: 7, max: 15, step: 1, format: (v) => v + 'px' },
    ],
    d3: {
      height: 420,
      mount(host, spec, W, H, env) {
        const o = spec.opts;
        const compact = !!(env && env.compact);
        const size = Math.min(W, H);
        const R = size / 2 - 18;

        const svg = d3.select(host).append('svg')
          .attr('width', W).attr('height', H)
          .append('g').attr('transform', `translate(${W / 2},${H / 2})`);

        const root = d3.hierarchy(spec.tree).sum((d) => d.value || 0);
        d3.partition().size([2 * Math.PI, R]).padding(0)(root);

        const arc = d3.arc()
          .startAngle((d) => d.x0 + o.padAngle)
          .endAngle((d) => Math.max(d.x0 + o.padAngle, d.x1 - o.padAngle))
          .innerRadius((d) => d.y0)
          .outerRadius((d) => Math.max(d.y0, d.y1 - o.ringGap));

        // Colour is inherited from the depth-1 ancestor, faded by depth.
        const colourFor = (d) => {
          const top = d.ancestors().find((a) => a.depth === 1);
          const idx = top ? spec.groups.indexOf(top.data.name) : -1;
          const base = idx >= 0 ? spec.colors[idx % spec.colors.length] : '#5A6270';
          const fade = d.depth === 1 ? 'cc' : d.depth === 2 ? '99' : '66';
          return base + fade;
        };

        const nodes = root.descendants().filter((d) => d.depth > 0);

        svg.selectAll('path').data(nodes).join('path')
          .attr('d', arc)
          .attr('fill', colourFor)
          .attr('stroke', 'rgba(255,255,255,.4)')
          .attr('stroke-width', 1)
          .attr('data-tip', (d) => `${d.data.name}\n$${d.value}K`);

        if (o.showLabels && !compact) {
          svg.selectAll('text')
            .data(nodes.filter((d) => (d.x1 - d.x0) > o.minAngle))
            .join('text')
            .attr('transform', (d) => {
              const a = (d.x0 + d.x1) / 2 - Math.PI / 2;
              const r = (d.y0 + d.y1) / 2;
              const flip = a > Math.PI / 2 && a < Math.PI * 1.5 ? 180 : 0;
              return `rotate(${a * 180 / Math.PI}) translate(${r},0) rotate(${flip})`;
            })
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('font-size', (d) => (d.depth === 1 ? o.fontSize + 2 : o.fontSize))
            .attr('font-family', '"DM Sans", system-ui, sans-serif')
            .attr('fill', '#ffffff')
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
    id: 'bubble-pack',
    title: 'Circle Pack',
    category: 'Hierarchy',
    blurb: 'Circles packed by size and tinted by group. Friendlier than a treemap, less precise.',
    tags: ['circle pack', 'bubble', 'hierarchy', 'd3', 'channels'],
    spec: {
      items: [
        { name: 'Email Q4',   channel: 'Email',   v: 420 },
        { name: 'Email Q3',   channel: 'Email',   v: 310 },
        { name: 'Email Q2',   channel: 'Email',   v: 280 },
        { name: 'Instagram',  channel: 'Social',  v: 380 },
        { name: 'Facebook',   channel: 'Social',  v: 290 },
        { name: 'TikTok',     channel: 'Social',  v: 220 },
        { name: 'Twitter',    channel: 'Social',  v: 110 },
        { name: 'Google Ads', channel: 'Paid',    v: 540 },
        { name: 'Display',    channel: 'Paid',    v: 195 },
        { name: 'YouTube',    channel: 'Paid',    v: 260 },
        { name: 'SEO Blog',   channel: 'Organic', v: 310 },
        { name: 'SEO Brand',  channel: 'Organic', v: 180 },
        { name: 'Direct',     channel: 'Organic', v: 240 },
      ],
      groups: ['Email', 'Social', 'Paid', 'Organic'],
      colors: [C.green, C.blue, C.amber, C.violet],
      opts: { padding: 6, alpha: 0.6, showLabels: true, minRadius: 20, fontScale: 0.38 },
    },
    controls: [
      { group: 'Style',  type: 'colors', key: 'colors', label: 'Channel colours', names: (s) => s.groups },
      { group: 'Style',  type: 'slider', key: 'opts.padding', label: 'Circle padding', min: 0, max: 20, step: 1, format: (v) => v + 'px' },
      { group: 'Style',  type: 'slider', key: 'opts.alpha', label: 'Fill opacity', min: 0.2, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Labels', type: 'toggle', key: 'opts.showLabels', label: 'Show labels' },
      { group: 'Labels', type: 'slider', key: 'opts.minRadius', label: 'Label threshold', min: 8, max: 60, step: 2, format: (v) => v + 'px' },
    ],
    d3: {
      height: 400,
      mount(host, spec, W, H, env) {
        const o = spec.opts;
        const compact = !!(env && env.compact);
        const alphaHex = Math.round(o.alpha * 255).toString(16).padStart(2, '0');
        const colourFor = (channel) => {
          const i = spec.groups.indexOf(channel);
          return i >= 0 ? spec.colors[i % spec.colors.length] : '#5A6270';
        };

        const svg = d3.select(host).append('svg').attr('width', W).attr('height', H);
        const root = d3.hierarchy({ children: spec.items }).sum((d) => d.v || 0);
        d3.pack().size([W, H - 26]).padding(o.padding)(root);

        const nodes = svg.selectAll('g.node').data(root.leaves()).join('g')
          .attr('class', 'node')
          .attr('transform', (d) => `translate(${d.x},${d.y})`);

        nodes.append('circle')
          .attr('r', (d) => d.r)
          .attr('fill', (d) => colourFor(d.data.channel) + alphaHex)
          .attr('stroke', (d) => colourFor(d.data.channel))
          .attr('stroke-width', 1);

        if (o.showLabels && !compact) {
          nodes.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('font-size', (d) => Math.min(d.r * o.fontScale, 13))
            .attr('font-family', '"DM Sans", system-ui, sans-serif')
            .attr('fill', 'currentColor')
            .attr('pointer-events', 'none')
            .text((d) => (d.r > o.minRadius ? d.data.name : ''));
        }

        nodes.attr('data-tip', (d) => `${d.data.name}\n${d.data.channel}\n${d.data.v}`);
      },
    },
    legend: (spec) => spec.groups.map((g, i) => ({
      label: g, color: spec.colors[i % spec.colors.length], toggleable: false,
    })),
  },
];
