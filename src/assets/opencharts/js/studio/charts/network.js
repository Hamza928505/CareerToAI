/**
 * Network and set charts: force-directed graph, arc diagram, adjacency matrix,
 * parallel sets and Venn.
 *
 * The force layout is stepped to completion synchronously rather than animated.
 * d3-force seeds initial positions deterministically (a phyllotaxis spiral by
 * node index), so a fixed tick count always produces the same picture — which
 * is what lets the exported code reproduce what was on screen.
 */

import { C } from '../palette.js';

const NODES = [
  { id: 'Auth',      group: 0 },
  { id: 'API',       group: 0 },
  { id: 'Gateway',   group: 0 },
  { id: 'Web',       group: 1 },
  { id: 'Mobile',    group: 1 },
  { id: 'Admin',     group: 1 },
  { id: 'Postgres',  group: 2 },
  { id: 'Redis',     group: 2 },
  { id: 'S3',        group: 2 },
  { id: 'Billing',   group: 3 },
  { id: 'Email',     group: 3 },
  { id: 'Analytics', group: 3 },
];

const LINKS = [
  ['Web', 'Gateway'], ['Mobile', 'Gateway'], ['Admin', 'Gateway'],
  ['Gateway', 'API'], ['Gateway', 'Auth'],
  ['API', 'Postgres'], ['API', 'Redis'], ['API', 'S3'],
  ['Auth', 'Postgres'], ['Auth', 'Redis'],
  ['API', 'Billing'], ['Billing', 'Postgres'], ['Billing', 'Email'],
  ['API', 'Analytics'], ['Analytics', 'S3'], ['Web', 'Analytics'],
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

export const networkCharts = [
  {
    id: 'network',
    title: 'Network Graph',
    category: 'Network',
    blurb: 'Force-directed nodes and edges. Good for structure and clustering, poor for anything precise.',
    tags: ['network', 'graph', 'force', 'nodes', 'edges', 'topology', 'd3'],
    spec: {
      nodes: NODES.map((n) => ({ ...n })),
      links: LINKS.map(([source, target]) => ({ source, target })),
      groups: ['Edge', 'Clients', 'Storage', 'Services'],
      colors: [C.green, C.violet, C.blue, C.cyan],
      opts: { charge: -240, linkDistance: 62, radius: 9, ticks: 320, showLabels: true, linkOpacity: 0.28, sizeByDegree: true },
    },
    controls: [
      { group: 'Layout', type: 'slider', key: 'opts.charge', label: 'Repulsion', min: -600, max: -40, step: 20 },
      { group: 'Layout', type: 'slider', key: 'opts.linkDistance', label: 'Link length', min: 20, max: 160, step: 5, format: (v) => v + 'px' },
      { group: 'Layout', type: 'slider', key: 'opts.ticks', label: 'Settle steps', min: 60, max: 600, step: 20 },
      { group: 'Style',  type: 'colors', key: 'colors', label: 'Group colours', names: (s) => s.groups },
      { group: 'Style',  type: 'slider', key: 'opts.radius', label: 'Node size', min: 4, max: 18, step: 1, format: (v) => v + 'px' },
      { group: 'Style',  type: 'toggle', key: 'opts.sizeByDegree', label: 'Size by connections' },
      { group: 'Style',  type: 'slider', key: 'opts.linkOpacity', label: 'Edge opacity', min: 0.05, max: 0.8, step: 0.03, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Labels', type: 'toggle', key: 'opts.showLabels', label: 'Show node labels' },
    ],
    d3: {
      height: 420,
      mount(host, spec, W, H) {
        const o = spec.opts;
        const nodes = spec.nodes.map((n) => ({ ...n }));
        const links = spec.links.map((l) => ({ ...l }));

        const degree = {};
        links.forEach((l) => {
          degree[l.source] = (degree[l.source] || 0) + 1;
          degree[l.target] = (degree[l.target] || 0) + 1;
        });
        const maxDeg = Math.max(...Object.values(degree), 1);
        const radiusOf = (n) => (o.sizeByDegree
          ? o.radius * (0.6 + 0.9 * ((degree[n.id] || 0) / maxDeg))
          : o.radius);

        const sim = d3.forceSimulation(nodes)
          .force('link', d3.forceLink(links).id((d) => d.id).distance(o.linkDistance))
          .force('charge', d3.forceManyBody().strength(o.charge))
          .force('center', d3.forceCenter(W / 2, H / 2))
          .force('collide', d3.forceCollide().radius((d) => radiusOf(d) + 3))
          .stop();

        // Run to a settled state in one go — no animation, and reproducible.
        for (let i = 0; i < o.ticks; i++) sim.tick();

        // Keep everything inside the frame after settling.
        const pad = o.radius + 14;
        nodes.forEach((n) => {
          n.x = Math.max(pad, Math.min(W - pad, n.x));
          n.y = Math.max(pad, Math.min(H - pad, n.y));
        });

        const svg = d3.select(host).append('svg').attr('width', W).attr('height', H);
        const colourOf = (n) => spec.colors[(n.group || 0) % spec.colors.length];

        svg.append('g').selectAll('line').data(links).join('line')
          .attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
          .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y)
          .attr('stroke', 'currentColor')
          .attr('stroke-opacity', o.linkOpacity)
          .attr('stroke-width', 1.4);

        const g = svg.append('g').selectAll('g').data(nodes).join('g')
          .attr('transform', (d) => `translate(${d.x},${d.y})`);

        g.append('circle')
          .attr('r', radiusOf)
          .attr('fill', colourOf)
          .attr('stroke', '#ffffff')
          .attr('stroke-width', 1.5)
          .attr('data-tip', (d) => `${d.id} — ${degree[d.id] || 0} connections`);

        if (o.showLabels) {
          g.append('text')
            .attr('x', (d) => radiusOf(d) + 5)
            .attr('dy', '0.35em')
            .attr('font-size', 11)
            .attr('font-family', '"DM Sans", system-ui, sans-serif')
            .attr('fill', 'currentColor')
            .attr('pointer-events', 'none')
            .text((d) => d.id);
        }
      },
    },
    legend: (spec) => spec.groups.map((g, i) => ({
      label: g, color: spec.colors[i % spec.colors.length], toggleable: false,
    })),
  },

  {
    id: 'arc-diagram',
    title: 'Arc Diagram',
    category: 'Network',
    blurb: 'Nodes on one line, links as arcs above it. Trades the freedom of a force layout for a readable order.',
    tags: ['arc diagram', 'network', 'links', 'linear', 'connections', 'd3'],
    spec: {
      nodes: NODES.map((n) => ({ ...n })),
      links: LINKS.map(([source, target]) => ({ source, target })),
      groups: ['Edge', 'Clients', 'Storage', 'Services'],
      colors: [C.green, C.violet, C.blue, C.cyan],
      opts: { radius: 6, arcOpacity: 0.35, arcWidth: 1.5, sizeByDegree: true, sort: 'group', labelAngle: 40 },
    },
    controls: [
      { group: 'Order', type: 'seg', key: 'opts.sort', label: 'Node order',
        options: [{ value: 'group', label: 'By group' }, { value: 'degree', label: 'By links' }, { value: 'none', label: 'As listed' }] },
      { group: 'Style', type: 'colors', key: 'colors', label: 'Group colours', names: (s) => s.groups },
      { group: 'Style', type: 'slider', key: 'opts.radius', label: 'Node size', min: 3, max: 14, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.sizeByDegree', label: 'Size by connections' },
      { group: 'Style', type: 'slider', key: 'opts.arcOpacity', label: 'Arc opacity', min: 0.08, max: 0.9, step: 0.03, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'slider', key: 'opts.arcWidth', label: 'Arc width', min: 0.5, max: 5, step: 0.5, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.labelAngle', label: 'Label angle', min: 0, max: 90, step: 5, format: (v) => v + '°' },
    ],
    d3: {
      height: 400,
      mount(host, spec, W, H) {
        const o = spec.opts;
        const degree = {};
        spec.links.forEach((l) => {
          degree[l.source] = (degree[l.source] || 0) + 1;
          degree[l.target] = (degree[l.target] || 0) + 1;
        });

        let nodes = spec.nodes.slice();
        if (o.sort === 'group') nodes.sort((a, b) => (a.group - b.group) || a.id.localeCompare(b.id));
        else if (o.sort === 'degree') nodes.sort((a, b) => (degree[b.id] || 0) - (degree[a.id] || 0));

        const pad = { l: 30, r: 30, b: 96 };
        const baseline = H - pad.b;
        const x = d3.scalePoint().domain(nodes.map((n) => n.id)).range([pad.l, W - pad.r]);
        const maxDeg = Math.max(...Object.values(degree), 1);
        const radiusOf = (id) => (o.sizeByDegree
          ? o.radius * (0.55 + 0.95 * ((degree[id] || 0) / maxDeg))
          : o.radius);
        const colourOf = (id) => {
          const n = nodes.find((k) => k.id === id);
          return spec.colors[((n && n.group) || 0) % spec.colors.length];
        };

        const svg = d3.select(host).append('svg').attr('width', W).attr('height', H);

        // Each link is a semicircle whose diameter is the gap between nodes.
        svg.append('g').selectAll('path').data(spec.links).join('path')
          .attr('d', (l) => {
            const x1 = x(l.source);
            const x2 = x(l.target);
            if (x1 == null || x2 == null) return null;
            const r = Math.abs(x2 - x1) / 2;
            const sweep = x2 > x1 ? 1 : 0;
            return `M${x1},${baseline} A${r},${Math.min(r, baseline - 12)} 0 0,${sweep} ${x2},${baseline}`;
          })
          .attr('fill', 'none')
          .attr('stroke', (l) => colourOf(l.source))
          .attr('stroke-opacity', o.arcOpacity)
          .attr('stroke-width', o.arcWidth);

        svg.append('line')
          .attr('x1', pad.l - 10).attr('x2', W - pad.r + 10)
          .attr('y1', baseline).attr('y2', baseline)
          .attr('stroke', 'currentColor').attr('stroke-opacity', 0.18);

        const g = svg.append('g').selectAll('g').data(nodes).join('g')
          .attr('transform', (d) => `translate(${x(d.id)},${baseline})`);

        g.append('circle')
          .attr('r', (d) => radiusOf(d.id))
          .attr('fill', (d) => colourOf(d.id))
          .attr('stroke', '#ffffff').attr('stroke-width', 1.5)
          .attr('data-tip', (d) => `${d.id} — ${degree[d.id] || 0} connections`);

        g.append('text')
          .attr('transform', `rotate(${o.labelAngle})`)
          .attr('x', 10).attr('y', 4)
          .attr('text-anchor', 'start')
          .attr('font-size', 11)
          .attr('font-family', '"DM Sans", system-ui, sans-serif')
          .attr('fill', 'currentColor')
          .text((d) => d.id);
      },
    },
    legend: (spec) => spec.groups.map((g, i) => ({
      label: g, color: spec.colors[i % spec.colors.length], toggleable: false,
    })),
  },

  {
    id: 'adjacency-matrix',
    title: 'Adjacency Matrix',
    category: 'Network',
    blurb: 'The same graph as a grid. Unreadable for paths, but far better than a hairball for dense networks.',
    tags: ['adjacency', 'matrix', 'network', 'grid', 'dense', 'connections'],
    spec: {
      nodes: NODES.map((n) => ({ ...n })),
      links: LINKS.map(([source, target]) => ({ source, target })),
      groups: ['Edge', 'Clients', 'Storage', 'Services'],
      colors: [C.green, C.violet, C.blue, C.cyan],
      opts: { gap: 2, radius: 2, sort: 'group', showGrid: true, labelSize: 10, symmetric: true },
    },
    controls: [
      { group: 'Order', type: 'seg', key: 'opts.sort', label: 'Row order',
        options: [{ value: 'group', label: 'By group' }, { value: 'degree', label: 'By links' }, { value: 'none', label: 'As listed' }] },
      { group: 'Style', type: 'colors', key: 'colors', label: 'Group colours', names: (s) => s.groups },
      { group: 'Style', type: 'slider', key: 'opts.gap', label: 'Cell gap', min: 0, max: 8, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.radius', label: 'Cell radius', min: 0, max: 8, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.symmetric', label: 'Mirror both halves' },
      { group: 'Style', type: 'toggle', key: 'opts.showGrid', label: 'Show grid lines' },
    ],
    canvas: {
      height: 420,
      draw(ctx, spec, W, H, env) {
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const compact = !!(env && env.compact);
        const degree = {};
        spec.links.forEach((l) => {
          degree[l.source] = (degree[l.source] || 0) + 1;
          degree[l.target] = (degree[l.target] || 0) + 1;
        });

        let nodes = spec.nodes.slice();
        if (o.sort === 'group') nodes.sort((a, b) => (a.group - b.group) || a.id.localeCompare(b.id));
        else if (o.sort === 'degree') nodes.sort((a, b) => (degree[b.id] || 0) - (degree[a.id] || 0));

        const index = {};
        nodes.forEach((n, i) => { index[n.id] = i; });
        const n = nodes.length;

        // Preview tiles have no room for the diagonal name gutters.
        const pad = compact ? { t: 8, r: 8, b: 8, l: 8 } : { t: 74, r: 12, b: 12, l: 74 };
        const size = Math.min(W - pad.l - pad.r, H - pad.t - pad.b);
        const cell = size / n;

        const linked = new Set();
        spec.links.forEach((l) => {
          const a = index[l.source];
          const b = index[l.target];
          if (a == null || b == null) return;
          linked.add(a + ':' + b);
          if (o.symmetric) linked.add(b + ':' + a);
        });

        for (let r = 0; r < n; r++) {
          for (let c = 0; c < n; c++) {
            const x = pad.l + c * cell;
            const y = pad.t + r * cell;
            if (o.showGrid) {
              ctx.strokeStyle = 'rgba(128,128,128,.08)';
              ctx.lineWidth = 1;
              ctx.strokeRect(x, y, cell, cell);
            }
            if (r === c) {
              ctx.fillStyle = 'rgba(128,128,128,.14)';
              ctx.fillRect(x + o.gap / 2, y + o.gap / 2, cell - o.gap, cell - o.gap);
              continue;
            }
            if (!linked.has(r + ':' + c)) continue;
            // Without this the matrix is unreadable off the diagonal: the row
            // and column names live in gutters a long way from the cell.
            tip(x, y, cell, cell, nodes[r].id + ' → ' + nodes[c].id);
            // Cells take the colour of the row's group.
            ctx.beginPath();
            ctx.roundRect(x + o.gap / 2, y + o.gap / 2, cell - o.gap, cell - o.gap, o.radius);
            ctx.fillStyle = spec.colors[(nodes[r].group || 0) % spec.colors.length];
            ctx.fill();
          }
        }

        if (compact) return;

        ctx.font = o.labelSize + 'px "DM Sans", system-ui, sans-serif';
        nodes.forEach((node, i) => {
          const colour = spec.colors[(node.group || 0) % spec.colors.length];
          ctx.fillStyle = colour;
          ctx.textAlign = 'right';
          ctx.fillText(node.id, pad.l - 8, pad.t + i * cell + cell / 2 + 3);

          ctx.save();
          ctx.translate(pad.l + i * cell + cell / 2, pad.t - 8);
          ctx.rotate(-Math.PI / 4);
          ctx.textAlign = 'left';
          ctx.fillText(node.id, 0, 0);
          ctx.restore();
        });
      },
    },
    legend: (spec) => spec.groups.map((g, i) => ({
      label: g, color: spec.colors[i % spec.colors.length], toggleable: false,
    })),
  },

  {
    id: 'parallel-sets',
    title: 'Parallel Sets',
    category: 'Network',
    blurb: 'Categorical flow across several dimensions. A Sankey for attributes rather than quantities.',
    tags: ['parallel sets', 'alluvial', 'categorical', 'flow', 'segments', 'cohort'],
    spec: {
      dimensions: ['Channel', 'Device', 'Outcome'],
      records: [
        { Channel: 'Organic', Device: 'Desktop', Outcome: 'Purchase', value: 320 },
        { Channel: 'Organic', Device: 'Mobile',  Outcome: 'Purchase', value: 210 },
        { Channel: 'Organic', Device: 'Mobile',  Outcome: 'Bounce',   value: 480 },
        { Channel: 'Organic', Device: 'Desktop', Outcome: 'Bounce',   value: 260 },
        { Channel: 'Paid',    Device: 'Mobile',  Outcome: 'Purchase', value: 180 },
        { Channel: 'Paid',    Device: 'Mobile',  Outcome: 'Bounce',   value: 390 },
        { Channel: 'Paid',    Device: 'Desktop', Outcome: 'Purchase', value: 140 },
        { Channel: 'Social',  Device: 'Mobile',  Outcome: 'Bounce',   value: 300 },
        { Channel: 'Social',  Device: 'Mobile',  Outcome: 'Purchase', value: 90 },
        { Channel: 'Email',   Device: 'Desktop', Outcome: 'Purchase', value: 160 },
        { Channel: 'Email',   Device: 'Desktop', Outcome: 'Bounce',   value: 70 },
      ],
      colorBy: 'Channel',
      colors: [C.blue, C.amber, C.green, C.violet, C.cyan, C.rose],
      opts: { textColor: '#808080', barWidth: 14, gap: 8, ribbonAlpha: 0.42, showLabels: true, curve: 0.5 },
    },
    controls: [
      { group: 'Style', type: 'colors', key: 'colors', label: 'Category colours' },
      { group: 'Style', type: 'slider', key: 'opts.barWidth', label: 'Node width', min: 6, max: 34, step: 2, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.gap', label: 'Category gap', min: 0, max: 26, step: 2, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.ribbonAlpha', label: 'Ribbon opacity', min: 0.1, max: 0.9, step: 0.04, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'slider', key: 'opts.curve', label: 'Ribbon curve', min: 0, max: 1, step: 0.05, format: (v) => v.toFixed(2) },
      { group: 'Style', type: 'toggle', key: 'opts.showLabels', label: 'Show labels' },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    canvas: {
      helpers: [inkColor],
      height: 420,
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const dims = spec.dimensions;
        const recs = spec.records;
        if (!dims.length || !recs.length) return;

        const total = recs.reduce((s, r) => s + r.value, 0) || 1;
        const pad = { t: 34, r: 16, b: 16, l: 16 };
        const cw = W - pad.l - pad.r;
        const ch = H - pad.t - pad.b;
        const colX = (i) => pad.l + (dims.length === 1 ? 0 : (i / (dims.length - 1)) * (cw - o.barWidth));

        // Distinct category values per dimension, in first-seen order.
        const catsPerDim = dims.map((d) => {
          const seen = [];
          recs.forEach((r) => { if (!seen.includes(r[d])) seen.push(r[d]); });
          return seen;
        });

        const colourIndex = {};
        catsPerDim[dims.indexOf(spec.colorBy)].forEach((c, i) => { colourIndex[c] = i; });
        const colourOf = (rec) => spec.colors[(colourIndex[rec[spec.colorBy]] || 0) % spec.colors.length];

        // Lay out each dimension's blocks, tallest first is not required —
        // first-seen order keeps ribbons from crossing more than necessary.
        const layout = dims.map((d, di) => {
          const cats = catsPerDim[di];
          const totalGap = o.gap * Math.max(0, cats.length - 1);
          let y = pad.t;
          const map = {};
          cats.forEach((c) => {
            const sum = recs.filter((r) => r[d] === c).reduce((s, r) => s + r.value, 0);
            const h = (sum / total) * (ch - totalGap);
            map[c] = { y0: y, y1: y + h, h: h, cursorIn: y, cursorOut: y, sum: sum };
            y += h + o.gap;
          });
          return map;
        });

        // Ribbons, drawn between consecutive dimensions.
        const sorted = recs.slice().sort((a, b) => b.value - a.value);
        for (let di = 0; di < dims.length - 1; di++) {
          const dA = dims[di];
          const dB = dims[di + 1];
          const xA = colX(di) + o.barWidth;
          const xB = colX(di + 1);
          const cx = (xB - xA) * o.curve;

          sorted.forEach((r) => {
            const a = layout[di][r[dA]];
            const b = layout[di + 1][r[dB]];
            if (!a || !b) return;
            const h = (r.value / total) * (ch - o.gap * Math.max(0, catsPerDim[di].length - 1));
            const hB = (r.value / total) * (ch - o.gap * Math.max(0, catsPerDim[di + 1].length - 1));
            const y1 = a.cursorOut;
            const y2 = b.cursorIn;
            a.cursorOut += h;
            b.cursorIn += hB;

            ctx.beginPath();
            ctx.moveTo(xA, y1);
            ctx.bezierCurveTo(xA + cx, y1, xB - cx, y2, xB, y2);
            ctx.lineTo(xB, y2 + hB);
            ctx.bezierCurveTo(xB - cx, y2 + hB, xA + cx, y1 + h, xA, y1 + h);
            ctx.closePath();
            const alphaHex = Math.round(o.ribbonAlpha * 255).toString(16).padStart(2, '0');
            ctx.fillStyle = colourOf(r) + alphaHex;
            ctx.fill();
          });
        }

        // Category blocks on top of the ribbons.
        dims.forEach((d, di) => {
          const x = colX(di);
          catsPerDim[di].forEach((c) => {
            const blk = layout[di][c];
            tip(x, blk.y0, o.barWidth, blk.h, [
              d + ': ' + c,
              blk.value == null ? null : blk.value.toLocaleString(),
              Math.round((blk.h / (H - pad.t - pad.b)) * 100) + '% of the total',
            ].filter(Boolean).join('\n'));
            ctx.fillStyle = di === dims.indexOf(spec.colorBy)
              ? spec.colors[(colourIndex[c] || 0) % spec.colors.length]
              : 'rgba(128,128,128,.55)';
            ctx.fillRect(x, blk.y0, o.barWidth, blk.h);

            if (o.showLabels && blk.h > 12) {
              ctx.fillStyle = ink(0.95);
              ctx.font = '11px "DM Sans", system-ui, sans-serif';
              ctx.textAlign = di === dims.length - 1 ? 'right' : 'left';
              const tx = di === dims.length - 1 ? x - 6 : x + o.barWidth + 6;
              ctx.fillText(String(c), tx, blk.y0 + blk.h / 2 + 4);
            }
          });

          ctx.fillStyle = ink(0.7);
          ctx.font = '600 10px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(d.toUpperCase(), x + o.barWidth / 2, pad.t - 14);
        });
      },
    },
    legend: (spec) => {
      const dim = spec.colorBy;
      const seen = [];
      spec.records.forEach((r) => { if (!seen.includes(r[dim])) seen.push(r[dim]); });
      return seen.map((c, i) => ({ label: c, color: spec.colors[i % spec.colors.length], toggleable: false }));
    },
  },

  {
    id: 'venn',
    title: 'Venn Diagram',
    category: 'Network',
    blurb: 'Overlapping sets. Honest for two or three; past that the geometry stops being able to tell the truth.',
    tags: ['venn', 'euler', 'sets', 'overlap', 'intersection', 'membership'],
    spec: {
      sets: [
        { label: 'Trial users', size: 620, color: C.green },
        { label: 'Active',      size: 480, color: C.blue },
        { label: 'Paying',      size: 300, color: C.amber },
      ],
      overlaps: { '01': 260, '02': 140, '12': 190, '012': 95 },
      opts: { mode: 'three', alpha: 0.42, radius: 96, spread: 0.62, showCounts: true, showLabels: true, strokeWidth: 2 },
    },
    controls: [
      { group: 'Sets',  type: 'seg',    key: 'opts.mode', label: 'Set count',
        options: [{ value: 'two', label: 'Two' }, { value: 'three', label: 'Three' }] },
      { group: 'Sets',  type: 'series', key: 'sets', data: false, max: 3, min: 2 },
      { group: 'Style', type: 'slider', key: 'opts.radius', label: 'Circle radius', min: 50, max: 150, step: 5, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.spread', label: 'Separation', min: 0.2, max: 1.2, step: 0.05, format: (v) => v.toFixed(2) },
      { group: 'Style', type: 'slider', key: 'opts.alpha', label: 'Fill opacity', min: 0.15, max: 0.8, step: 0.03, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'slider', key: 'opts.strokeWidth', label: 'Outline width', min: 0, max: 6, step: 1, format: (v) => v + 'px' },
      { group: 'Labels', type: 'toggle', key: 'opts.showCounts', label: 'Show region counts' },
      { group: 'Labels', type: 'toggle', key: 'opts.showLabels', label: 'Show set names' },
    ],
    onChange(spec) {
      spec.sets.forEach((s, i) => { if (typeof s.size !== 'number') s.size = 300 + i * 50; });
    },
    canvas: {
      height: 420,
      draw(ctx, spec, W, H, env) {
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const three = o.mode === 'three' && spec.sets.length >= 3;
        const sets = spec.sets.slice(0, three ? 3 : 2);
        const cx = W / 2;
        const cy = H / 2 + (three ? -10 : 0);
        const r = o.radius;
        const d = r * o.spread;

        // Standard symmetric layouts — the readable arrangement in both cases.
        const centres = three
          ? [
            { x: cx - d, y: cy - d * 0.55 },
            { x: cx + d, y: cy - d * 0.55 },
            { x: cx, y: cy + d * 0.85 },
          ]
          : [
            { x: cx - d * 0.75, y: cy },
            { x: cx + d * 0.75, y: cy },
          ];

        const alphaHex = Math.round(o.alpha * 255).toString(16).padStart(2, '0');
        sets.forEach((s, i) => {
          // Circles overlap by design, so the last one drawn wins the hit test
          // — which is the one painted on top and the one you are pointing at.
          tip({ cx: centres[i].x, cy: centres[i].y, r: r, text: s.label + ': ' + s.size });
          ctx.beginPath();
          ctx.arc(centres[i].x, centres[i].y, r, 0, Math.PI * 2);
          ctx.fillStyle = s.color + alphaHex;
          ctx.fill();
          if (o.strokeWidth > 0) {
            ctx.strokeStyle = s.color;
            ctx.lineWidth = o.strokeWidth;
            ctx.stroke();
          }
        });

        if (o.showCounts) {
          const ov = spec.overlaps || {};
          const only = (i) => {
            let v = sets[i].size;
            Object.keys(ov).forEach((k) => { if (k.length > 1 && k.includes(String(i))) v -= 0; });
            return v;
          };
          ctx.font = '600 13px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ffffff';

          // Region centroids, approximated from the symmetric geometry.
          const put = (x, y, text) => {
            ctx.fillStyle = 'rgba(23,22,20,.82)';
            ctx.fillText(String(text), x, y + 4);
          };

          if (three) {
            put(centres[0].x - r * 0.35, centres[0].y - r * 0.3, only(0));
            put(centres[1].x + r * 0.35, centres[1].y - r * 0.3, only(1));
            put(centres[2].x, centres[2].y + r * 0.45, only(2));
            put((centres[0].x + centres[1].x) / 2, centres[0].y - r * 0.05, ov['01'] ?? '');
            put((centres[0].x + centres[2].x) / 2 - r * 0.12, (centres[0].y + centres[2].y) / 2 + r * 0.2, ov['02'] ?? '');
            put((centres[1].x + centres[2].x) / 2 + r * 0.12, (centres[1].y + centres[2].y) / 2 + r * 0.2, ov['12'] ?? '');
            put(cx, cy + r * 0.12, ov['012'] ?? '');
          } else {
            put(centres[0].x - r * 0.4, centres[0].y, only(0));
            put(centres[1].x + r * 0.4, centres[1].y, only(1));
            put(cx, cy, ov['01'] ?? '');
          }
        }

        if (o.showLabels) {
          ctx.font = '600 12px "DM Sans", system-ui, sans-serif';
          sets.forEach((s, i) => {
            const c = centres[i];
            const away = { x: c.x - cx, y: c.y - cy };
            const len = Math.hypot(away.x, away.y) || 1;
            const lx = c.x + (away.x / len) * (r + 22);
            const ly = c.y + (away.y / len) * (r + 22);
            ctx.fillStyle = s.color;
            ctx.textAlign = lx < cx ? 'right' : 'left';
            ctx.fillText(s.label, lx, ly + 4);
          });
        }
      },
    },
    legend: (spec) => spec.sets.map((s) => ({ label: s.label, color: s.color, toggleable: false })),
  },
];
