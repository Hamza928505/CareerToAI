/**
 * Two more ways to draw things moving between categories.
 *
 * The Sankey in `flow.js` is a Chart.js plugin and draws a general flow
 * network. These two answer questions it does not:
 *
 *   - the **alluvial** shows the same population being re-sorted at each
 *     stage, so what matters is which block a group ends up in rather than the
 *     total volume of the pipe. Its layout is hand-rolled here rather than
 *     borrowed, because the ordering rule is the difference between the two
 *     charts, not an implementation detail.
 *   - the **non-ribbon chord** drops the ribbons entirely. A chord diagram
 *     with forty edges is a solid disc; the same edges as thin curves through
 *     the middle stay countable, at the cost of saying nothing about volume.
 */

import { C } from '../palette.js';

/**
 * Lay a flow network out in columns: stage, stack, then thread the ribbons.
 *
 * Serialised into the export, so it references only its arguments. The stage
 * of a node is the longest path to it, not the shortest — a node reachable in
 * one hop and in three belongs after everything that feeds it, or its ribbons
 * run backwards.
 */
function alluvialLayout(links, W, H, pad, nodeWidth, gap) {
  const names = [];
  const add = (n) => { if (!names.includes(n)) names.push(n); };
  links.forEach((l) => { add(l.from); add(l.to); });

  const stage = {};
  names.forEach((n) => { stage[n] = 0; });
  for (let pass = 0; pass < names.length; pass++) {
    let moved = false;
    links.forEach((l) => {
      if (stage[l.to] < stage[l.from] + 1) { stage[l.to] = stage[l.from] + 1; moved = true; }
    });
    if (!moved) break;
  }

  const stages = Math.max.apply(null, names.map((n) => stage[n])) + 1;
  const totals = {};
  names.forEach((n) => {
    const out = links.filter((l) => l.from === n).reduce((s, l) => s + (Number(l.flow) || 0), 0);
    const inn = links.filter((l) => l.to === n).reduce((s, l) => s + (Number(l.flow) || 0), 0);
    totals[n] = Math.max(out, inn);
  });

  const byStage = [];
  for (let s = 0; s < stages; s++) byStage.push(names.filter((n) => stage[n] === s));

  // One scale for every stage, so a block of the same height means the same
  // number wherever it sits. Scaling each column to fill the height instead
  // would make a stage that lost half its volume look just as tall.
  const tallest = Math.max.apply(null, byStage.map((col) =>
    col.reduce((s, n) => s + totals[n], 0)).concat([1]));
  const room = H - pad.t - pad.b;
  const maxGaps = Math.max.apply(null, byStage.map((c) => c.length - 1).concat([0]));
  const perUnit = (room - maxGaps * gap) / tallest;

  const nodes = {};
  const colW = stages > 1 ? (W - pad.l - pad.r - nodeWidth) / (stages - 1) : 0;
  byStage.forEach((col, s) => {
    const height = col.reduce((sum, n) => sum + totals[n] * perUnit, 0)
      + Math.max(0, col.length - 1) * gap;
    let y = pad.t + (room - height) / 2;
    col.forEach((n) => {
      const h = Math.max(1, totals[n] * perUnit);
      nodes[n] = { name: n, stage: s, x: pad.l + s * colW, y: y, h: h, total: totals[n], outAt: y, inAt: y };
      y += h + gap;
    });
  });

  const ribbons = links.map((l) => {
    const a = nodes[l.from];
    const b = nodes[l.to];
    const h = (Number(l.flow) || 0) * perUnit;
    const r = { from: l.from, to: l.to, flow: l.flow, h: h, y0: a.outAt, y1: b.inAt, a: a, b: b };
    a.outAt += h;
    b.inAt += h;
    return r;
  });

  return { nodes: nodes, ribbons: ribbons, stages: stages, nodeWidth: nodeWidth };
}

/** Where last year's trial cohort ended up, stage by stage. */
const ALLUVIAL_FLOWS = [
  { from: 'Free trial', to: 'Activated', flow: 4200 },
  { from: 'Free trial', to: 'Lapsed', flow: 2600 },
  { from: 'Activated', to: 'Paid', flow: 2400 },
  { from: 'Activated', to: 'Still free', flow: 1800 },
  { from: 'Lapsed', to: 'Still free', flow: 700 },
  { from: 'Lapsed', to: 'Gone', flow: 1900 },
  { from: 'Paid', to: 'Renewed', flow: 1750 },
  { from: 'Paid', to: 'Churned', flow: 650 },
  { from: 'Still free', to: 'Churned', flow: 900 },
  { from: 'Still free', to: 'Renewed', flow: 1600 },
];

/** Which services talk to which — forty edges, no volumes. */
const MESH_EDGES = [
  ['Web', 'Gateway'], ['Mobile', 'Gateway'], ['Partner', 'Gateway'],
  ['Gateway', 'Auth'], ['Gateway', 'Catalogue'], ['Gateway', 'Cart'],
  ['Gateway', 'Search'], ['Cart', 'Pricing'], ['Cart', 'Inventory'],
  ['Catalogue', 'Inventory'], ['Catalogue', 'Media'], ['Search', 'Catalogue'],
  ['Pricing', 'Postgres'], ['Inventory', 'Postgres'], ['Auth', 'Postgres'],
  ['Catalogue', 'Redis'], ['Search', 'Redis'], ['Cart', 'Redis'],
  ['Orders', 'Postgres'], ['Cart', 'Orders'], ['Orders', 'Billing'],
  ['Billing', 'Ledger'], ['Orders', 'Fulfilment'], ['Fulfilment', 'Carrier'],
  ['Media', 'CDN'], ['Auth', 'Audit'], ['Billing', 'Audit'],
  ['Fulfilment', 'Audit'], ['Orders', 'Audit'], ['Gateway', 'Audit'],
];

const MESH_NODES = ['Web', 'Mobile', 'Partner', 'Gateway', 'Auth', 'Catalogue',
  'Cart', 'Search', 'Pricing', 'Inventory', 'Media', 'Orders', 'Billing',
  'Fulfilment', 'Postgres', 'Redis', 'Ledger', 'Carrier', 'CDN', 'Audit'];

export const flowExtraCharts = [
  /* ── Alluvial ──────────────────────────────────────────────────────────── */
  {
    id: 'alluvial',
    title: 'Alluvial Diagram',
    category: 'Flow',
    blurb: 'One population re-sorted stage by stage. Blocks are where everybody is now; ribbons are who moved where.',
    tags: ['alluvial', 'flow', 'cohort', 'states', 'transitions', 'stages', 'd3'],
    spec: {
      flows: ALLUVIAL_FLOWS.map((f) => ({ ...f })),
      nodes: ['Free trial', 'Activated', 'Lapsed', 'Paid', 'Still free', 'Renewed', 'Churned', 'Gone'],
      colors: [C.green, C.blue, C.cyan, C.violet, C.rose, C.olive, C.amber, C.slate],
      opts: {
        nodeWidth: 16,
        gap: 14,
        curve: 0.5,
        ribbonOpacity: 0.42,
        colorBy: 'source',
        showLabels: true,
        showValues: true,
      },
    },
    controls: [
      { group: 'Shape', type: 'slider', key: 'opts.nodeWidth', label: 'Block width', min: 6, max: 40, step: 2, format: (v) => v + 'px' },
      { group: 'Shape', type: 'slider', key: 'opts.gap', label: 'Gap between blocks', min: 2, max: 40, step: 2, format: (v) => v + 'px' },
      { group: 'Shape', type: 'slider', key: 'opts.curve', label: 'Ribbon curve', min: 0, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'seg', key: 'opts.colorBy', label: 'Ribbon colour',
        options: [{ value: 'source', label: 'Where from' }, { value: 'target', label: 'Where to' }] },
      { group: 'Style', type: 'slider', key: 'opts.ribbonOpacity', label: 'Ribbon opacity', min: 0.1, max: 0.9, step: 0.02, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'colors', key: 'colors', label: 'Block colours', names: (s) => s.nodes },
      { group: 'Labels', type: 'toggle', key: 'opts.showLabels', label: 'Name the blocks' },
      { group: 'Labels', type: 'toggle', key: 'opts.showValues', label: 'Show the totals' },
    ],
    d3: {
      height: 420,
      helpers: [alluvialLayout],
      mount(host, spec, W, H, env) {
        const o = spec.opts;
        const compact = env && env.compact;
        const svg = d3.select(host).append('svg').attr('width', W).attr('height', H);
        const flows = (spec.flows || []).filter((f) => f && f.from && f.to);
        if (!flows.length) return;

        const pad = compact
          ? { t: 8, r: 8, b: 8, l: 8 }
          : { t: 26, r: 108, b: 18, l: 96 };
        const nodeWidth = compact ? Math.max(4, o.nodeWidth / 2) : o.nodeWidth;
        const layout = alluvialLayout(flows, W, H, pad, nodeWidth, compact ? 5 : o.gap);

        const order = spec.nodes || [];
        const colourOf = (name) => {
          const i = order.indexOf(name);
          return spec.colors[(i < 0 ? 0 : i) % spec.colors.length];
        };

        svg.append('g').selectAll('path').data(layout.ribbons).join('path')
          .attr('d', (r) => {
            const x0 = r.a.x + nodeWidth;
            const x1 = r.b.x;
            const c = x0 + (x1 - x0) * Math.max(0.02, o.curve);
            const d = x1 - (x1 - x0) * Math.max(0.02, o.curve);
            const t0 = r.y0;
            const t1 = r.y1;
            return 'M' + x0 + ',' + t0
              + 'C' + c + ',' + t0 + ' ' + d + ',' + t1 + ' ' + x1 + ',' + t1
              + 'L' + x1 + ',' + (t1 + r.h)
              + 'C' + d + ',' + (t1 + r.h) + ' ' + c + ',' + (t0 + r.h) + ' ' + x0 + ',' + (t0 + r.h)
              + 'Z';
          })
          .attr('fill', (r) => colourOf(o.colorBy === 'target' ? r.to : r.from))
          .attr('fill-opacity', o.ribbonOpacity)
          .attr('data-tip', (r) => r.from + ' → ' + r.to + '\n'
            + Number(r.flow).toLocaleString()
            + ' — ' + Math.round((r.flow / r.a.total) * 100) + '% of ' + r.from);

        const blocks = Object.keys(layout.nodes).map((k) => layout.nodes[k]);
        svg.append('g').selectAll('rect').data(blocks).join('rect')
          .attr('x', (n) => n.x)
          .attr('y', (n) => n.y)
          .attr('width', nodeWidth)
          .attr('height', (n) => n.h)
          .attr('rx', 2)
          .attr('fill', (n) => colourOf(n.name))
          .attr('data-tip', (n) => n.name + ' — ' + n.total.toLocaleString());

        if (!o.showLabels || compact) return;
        svg.append('g').selectAll('text').data(blocks).join('text')
          .attr('x', (n) => (n.stage === 0 ? n.x - 8 : n.x + nodeWidth + 8))
          .attr('y', (n) => n.y + n.h / 2)
          .attr('dy', '0.32em')
          .attr('text-anchor', (n) => (n.stage === 0 ? 'end' : 'start'))
          .attr('font-size', 11)
          .attr('fill', 'currentColor')
          .attr('opacity', 0.92)
          .text((n) => (o.showValues ? n.name + '  ' + n.total.toLocaleString() : n.name));
      },
    },
    legend: (spec) => (spec.nodes || []).map((label, i) => ({
      label, color: spec.colors[i % spec.colors.length],
    })),
    metrics: (spec) => {
      const flows = spec.flows || [];
      // Everything leaving a node nothing feeds is the population entering.
      const entering = flows
        .filter((f) => !flows.some((g) => g.to === f.from))
        .reduce((sum, f) => sum + (Number(f.flow) || 0), 0);
      const states = new Set();
      flows.forEach((f) => { states.add(f.from); states.add(f.to); });
      return [
        { label: 'States', value: states.size },
        { label: 'Transitions', value: flows.length },
        { label: 'Entering', value: entering.toLocaleString() },
      ];
    },
  },

  /* ── Non-ribbon chord ──────────────────────────────────────────────────── */
  {
    id: 'chord-nonribbon',
    title: 'Non-ribbon Chord',
    category: 'Network',
    blurb: 'Nodes on a circle joined by thin curves instead of ribbons. Keeps forty connections countable where a chord diagram would go solid.',
    tags: ['non-ribbon chord', 'chord', 'circular', 'network', 'edge bundling', 'connections', 'd3'],
    spec: {
      nodes: MESH_NODES.map((id, i) => ({ id, group: Math.floor(i / 5) })),
      links: MESH_EDGES.map(([source, target]) => ({ source, target })),
      groups: ['Edge', 'Services', 'Commerce', 'Stores'],
      colors: [C.green, C.blue, C.amber, C.violet],
      opts: {
        bundle: 0.72,
        linkWidth: 1.2,
        linkOpacity: 0.5,
        nodeRadius: 4,
        showLabels: true,
        fontSize: 10,
        sizeByDegree: true,
      },
    },
    controls: [
      { group: 'Curves', type: 'slider', key: 'opts.bundle', label: 'Bundling', min: 0, max: 1, step: 0.04, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Curves', type: 'slider', key: 'opts.linkWidth', label: 'Curve width', min: 0.4, max: 4, step: 0.2, format: (v) => v + 'px' },
      { group: 'Curves', type: 'slider', key: 'opts.linkOpacity', label: 'Curve opacity', min: 0.1, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Nodes', type: 'colors', key: 'colors', label: 'Group colours', names: (s) => s.groups },
      { group: 'Nodes', type: 'slider', key: 'opts.nodeRadius', label: 'Node size', min: 2, max: 10, step: 0.5, format: (v) => v + 'px' },
      { group: 'Nodes', type: 'toggle', key: 'opts.sizeByDegree', label: 'Size by connections' },
      { group: 'Labels', type: 'toggle', key: 'opts.showLabels', label: 'Show labels' },
      { group: 'Labels', type: 'slider', key: 'opts.fontSize', label: 'Label size', min: 7, max: 14, step: 1, format: (v) => v + 'px' },
    ],
    d3: {
      height: 440,
      mount(host, spec, W, H, env) {
        const o = spec.opts;
        const compact = env && env.compact;
        const svg = d3.select(host).append('svg').attr('width', W).attr('height', H);
        const nodes = spec.nodes || [];
        if (!nodes.length) return;

        const labelRoom = o.showLabels && !compact ? 76 : 10;
        const R = Math.min(W, H) / 2 - labelRoom;
        if (R <= 10) return;
        const cx = W / 2;
        const cy = H / 2;

        const degree = {};
        (spec.links || []).forEach((l) => {
          degree[l.source] = (degree[l.source] || 0) + 1;
          degree[l.target] = (degree[l.target] || 0) + 1;
        });
        const maxDeg = Math.max.apply(null, Object.keys(degree).map((k) => degree[k]).concat([1]));

        const step = (Math.PI * 2) / nodes.length;
        const at = {};
        nodes.forEach((n, i) => {
          const a = -Math.PI / 2 + step * i;
          at[n.id] = { a: a, x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, group: n.group };
        });

        const colourOf = (id) => {
          const g = at[id] ? at[id].group || 0 : 0;
          return spec.colors[g % spec.colors.length];
        };

        // The control point is pulled toward the centre by `bundle`. At 0 the
        // curves are straight chords; at 1 they all pass through the middle,
        // which reads as a bundle rather than forty separate lines.
        svg.append('g').selectAll('path').data(spec.links || []).join('path')
          .attr('d', (l) => {
            const a = at[l.source];
            const b = at[l.target];
            if (!a || !b) return null;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const k = Math.max(0, Math.min(1, o.bundle));
            const qx = mx + (cx - mx) * k;
            const qy = my + (cy - my) * k;
            return 'M' + a.x + ',' + a.y + 'Q' + qx + ',' + qy + ' ' + b.x + ',' + b.y;
          })
          .attr('fill', 'none')
          .attr('stroke', (l) => colourOf(l.source))
          .attr('stroke-opacity', o.linkOpacity)
          .attr('stroke-width', o.linkWidth)
          .attr('data-tip', (l) => l.source + ' → ' + l.target);

        const g = svg.append('g').selectAll('g').data(nodes).join('g')
          .attr('transform', (n) => 'translate(' + at[n.id].x + ',' + at[n.id].y + ')');

        g.append('circle')
          .attr('r', (n) => (o.sizeByDegree
            ? o.nodeRadius * (0.6 + 0.9 * ((degree[n.id] || 0) / maxDeg))
            : o.nodeRadius))
          .attr('fill', (n) => colourOf(n.id))
          .attr('stroke', '#ffffff')
          .attr('stroke-width', 1.2)
          .attr('data-tip', (n) => n.id + ' — ' + (degree[n.id] || 0) + ' connections');

        if (!o.showLabels || compact) return;
        g.append('text')
          .attr('transform', (n) => {
            const deg = (at[n.id].a * 180) / Math.PI;
            const flip = Math.cos(at[n.id].a) < 0;
            return 'rotate(' + (flip ? deg + 180 : deg) + ') translate(' + (flip ? -10 : 10) + ',0)';
          })
          .attr('dy', '0.32em')
          .attr('text-anchor', (n) => (Math.cos(at[n.id].a) < 0 ? 'end' : 'start'))
          .attr('font-size', o.fontSize)
          .attr('fill', 'currentColor')
          .attr('opacity', 0.9)
          .text((n) => n.id);
      },
    },
    legend: (spec) => spec.groups.map((label, i) => ({ label, color: spec.colors[i % spec.colors.length] })),
    metrics: (spec) => [
      { label: 'Nodes', value: (spec.nodes || []).length },
      { label: 'Connections', value: (spec.links || []).length },
    ],
  },
];
