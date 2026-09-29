/**
 * Flow and relationship chart definitions: Sankey, chord, funnel, Marimekko,
 * stream graph.
 */

import { C } from '../palette.js';
import { baseOpts } from '../chartjs-base.js';
import { srcFn } from '../serialize.js';

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

const JS_UNSAFE_CHAR_MAP = {
  '<': '\\u003C',
  '>': '\\u003E',
  '/': '\\u002F',
  '\\': '\\\\',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\0': '\\0',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

function escapeUnsafeJsChars(str) {
  return String(str).replace(/[<>\/\\\b\f\n\r\t\0\u2028\u2029]/g, (x) => JS_UNSAFE_CHAR_MAP[x]);
}

export const flowCharts = [
  {
    id: 'sankey',
    title: 'Sankey',
    category: 'Flow',
    blurb: 'Quantities moving between stages. Ribbon width is the volume; the drop-offs are the story.',
    tags: ['sankey', 'flow', 'funnel', 'conversion', 'traffic'],
    spec: {
      flows: [
        { from: 'Organic',  to: 'Visit',    flow: 4200 },
        { from: 'Paid',     to: 'Visit',    flow: 2800 },
        { from: 'Social',   to: 'Visit',    flow: 1900 },
        { from: 'Email',    to: 'Visit',    flow: 1400 },
        { from: 'Visit',    to: 'Checkout', flow: 3800 },
        { from: 'Visit',    to: 'Bounce',   flow: 6500 },
        { from: 'Checkout', to: 'Purchase', flow: 2900 },
        { from: 'Checkout', to: 'Abandon',  flow: 900  },
      ],
      nodes: ['Organic', 'Paid', 'Social', 'Email', 'Visit', 'Checkout', 'Purchase', 'Bounce', 'Abandon'],
      colors: [C.blue, C.amber, C.green, C.violet, C.cyan, C.cyan, C.blue, C.slate, C.slate],
      opts: { colorMode: 'gradient', nodeWidth: 12, borderWidth: 0 },
    },
    controls: [
      { group: 'Style', type: 'colors', key: 'colors', label: 'Node colours', names: (s) => s.nodes },
      { group: 'Style', type: 'seg',    key: 'opts.colorMode', label: 'Ribbon colour',
        options: [{ value: 'gradient', label: 'Gradient' }, { value: 'from', label: 'From' }, { value: 'to', label: 'To' }] },
      { group: 'Style', type: 'slider', key: 'opts.nodeWidth', label: 'Node width', min: 4, max: 40, step: 2, format: (v) => v + 'px' },
    ],
    chartjs: {
      plugins: ['sankey'],
      build(spec) {
        const lookup = {};
        spec.nodes.forEach((n, i) => { lookup[n] = spec.colors[i % spec.colors.length]; });
        const json = escapeUnsafeJsChars(JSON.stringify(lookup));
        return {
          type: 'sankey',
          data: {
            datasets: [{
              label: 'Flow',
              data: spec.flows,
              colorFrom: srcFn(`(ctx) => (${json})[ctx.raw && ctx.raw.from] || '#5A6270'`),
              colorTo:   srcFn(`(ctx) => (${json})[ctx.raw && ctx.raw.to] || '#5A6270'`),
              colorMode: spec.opts.colorMode,
              borderWidth: spec.opts.borderWidth,
              size: 'max',
              nodeWidth: spec.opts.nodeWidth,
            }],
          },
          options: baseOpts({
            interaction: { intersect: true, mode: 'nearest' },
            plugins: {
              tooltip: {
                callbacks: {
                  label: srcFn(`(ctx) => ctx.raw.from + ' → ' + ctx.raw.to + ': ' + ctx.raw.flow.toLocaleString()`),
                },
              },
            },
          }),
        };
      },
    },
    legend: (spec) => spec.nodes.map((n, i) => ({
      label: n, color: spec.colors[i % spec.colors.length], toggleable: false,
    })),
  },

  {
    id: 'chord',
    title: 'Chord Diagram',
    category: 'Flow',
    blurb: 'Symmetric flows between every pair. Ribbon thickness is the shared volume.',
    tags: ['chord', 'network', 'relationship', 'matrix', 'd3'],
    spec: {
      names: ['Women', 'Men', 'Living', 'Accessories', 'Footwear'],
      colors: [C.green, C.blue, C.amber, C.violet, C.cyan],
      matrix: [
        [0, 1200, 800, 1500, 600],
        [1200, 0, 500, 900, 1100],
        [800, 500, 0, 400, 200],
        [1500, 900, 400, 0, 700],
        [600, 1100, 200, 700, 0],
      ],
      opts: { padAngle: 0.04, ribbonAlpha: 0.45, bandWidth: 18, showLabels: true },
    },
    controls: [
      { group: 'Style',  type: 'colors', key: 'colors', label: 'Group colours', names: (s) => s.names },
      { group: 'Style',  type: 'slider', key: 'opts.padAngle', label: 'Group gap', min: 0, max: 0.15, step: 0.005, format: (v) => v.toFixed(3) },
      { group: 'Style',  type: 'slider', key: 'opts.ribbonAlpha', label: 'Ribbon opacity', min: 0.1, max: 0.9, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style',  type: 'slider', key: 'opts.bandWidth', label: 'Arc thickness', min: 6, max: 40, step: 2, format: (v) => v + 'px' },
      { group: 'Labels', type: 'toggle', key: 'opts.showLabels', label: 'Show labels' },
    ],
    d3: {
      height: 420,
      mount(host, spec, W, H) {
        const o = spec.opts;
        const size = Math.min(W, H);
        const R = size / 2 - 52;

        const svg = d3.select(host).append('svg').attr('width', W).attr('height', H);
        const g = svg.append('g').attr('transform', `translate(${W / 2},${H / 2})`);

        const chords = d3.chord().padAngle(o.padAngle).sortSubgroups(d3.descending)(spec.matrix);
        const arc = d3.arc().innerRadius(R).outerRadius(R + o.bandWidth);
        const ribbon = d3.ribbon().radius(R);
        const colourAt = (i) => spec.colors[i % spec.colors.length];

        g.append('g').selectAll('path').data(chords.groups).join('path')
          .attr('d', arc)
          .attr('fill', (d) => colourAt(d.index))
          .attr('stroke', 'rgba(255,255,255,.4)')
          .attr('stroke-width', 1)
          .attr('data-tip', (d) => spec.names[d.index]);

        g.append('g').selectAll('path').data(chords).join('path')
          .attr('d', ribbon)
          .attr('fill', (d) => colourAt(d.source.index))
          .attr('fill-opacity', o.ribbonAlpha)
          .attr('stroke', (d) => colourAt(d.source.index))
          .attr('stroke-width', 0.5)
          .attr('data-tip', (d) => `${spec.names[d.source.index]} ↔ ${spec.names[d.target.index]}: ${d.source.value.toLocaleString()}`);

        if (o.showLabels) {
          g.append('g').selectAll('text').data(chords.groups).join('text')
            .attr('transform', (d) => {
              const a = (d.startAngle + d.endAngle) / 2 - Math.PI / 2;
              return `rotate(${a * 180 / Math.PI}) translate(${R + o.bandWidth + 10},0) rotate(${a > 0 ? 90 : -90})`;
            })
            .attr('text-anchor', 'middle')
            .attr('font-size', 11)
            .attr('font-family', '"DM Sans", system-ui, sans-serif')
            .attr('fill', 'currentColor')
            .text((d) => spec.names[d.index]);
        }
      },
    },
    legend: (spec) => spec.names.map((n, i) => ({
      label: n, color: spec.colors[i % spec.colors.length], toggleable: false,
    })),
  },

  {
    id: 'funnel',
    title: 'Funnel',
    category: 'Flow',
    blurb: 'Stage-by-stage attrition. The taper is the drop-off; the side column is the honest number.',
    tags: ['funnel', 'conversion', 'stages', 'drop off', 'ecommerce'],
    spec: {
      stages: [
        { label: 'Visited site',     value: 24800, color: C.green },
        { label: 'Viewed product',   value: 14200, color: C.violet   },
        { label: 'Added to cart',    value: 5800,  color: C.blue   },
        { label: 'Started checkout', value: 3200,  color: C.cyan  },
        { label: 'Purchased',        value: 1950,  color: C.amber  },
      ],
      opts: { textColor: '#808080', alpha: 0.82, gap: 6, showStats: true, statsWidth: 170, dropColor: C.amber },
    },
    controls: [
      { group: 'Data',  type: 'series', key: 'stages', data: false, max: 8, min: 2 },
      { group: 'Style', type: 'slider', key: 'opts.alpha', label: 'Fill opacity', min: 0.3, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'slider', key: 'opts.gap', label: 'Stage gap', min: 0, max: 20, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.showStats', label: 'Show conversion column' },
      { group: 'Style', type: 'slider', key: 'opts.statsWidth', label: 'Column width', min: 100, max: 260, step: 10, format: (v) => v + 'px' },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    onChange(spec) {
      spec.stages.forEach((s, i) => {
        if (typeof s.value !== 'number') s.value = Math.round(10000 / (i + 1));
      });
    },
    canvas: {
      helpers: [inkColor],
      height: 380,
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const stages = spec.stages;
        if (!stages.length) return;

        const pad = { t: 18, r: o.showStats ? o.statsWidth : 18, b: 18, l: 18 };
        const cw = W - pad.l - pad.r;
        const ch = H - pad.t - pad.b;
        const rowH = ch / stages.length;
        const maxV = Math.max(...stages.map((s) => s.value), 1);
        const widthAt = (v) => (v / maxV) * cw;
        const alphaHex = Math.round(o.alpha * 255).toString(16).padStart(2, '0');

        stages.forEach((s, i) => {
          const w = widthAt(s.value);
          const x = pad.l + (cw - w) / 2;
          const y = pad.t + i * rowH + o.gap / 2;
          const h = rowH - o.gap;
          // Drop-off is what a funnel is read for, and it is the one number
          // the picture never states.
          const prev = i ? stages[i - 1].value : null;
          tip(0, pad.t + i * rowH, W, rowH, [
            s.label + ': ' + s.value.toLocaleString(),
            Math.round((s.value / maxV) * 100) + '% of the top',
            prev == null ? null : (prev - s.value).toLocaleString() + ' lost from '
              + stages[i - 1].label + ' (' + Math.round((1 - s.value / prev) * 100) + '%)',
          ].filter(Boolean).join('\n'));

          ctx.beginPath();
          if (i < stages.length - 1) {
            // Taper into the next stage's width so the bands connect.
            const nextW = widthAt(stages[i + 1].value);
            const nx = pad.l + (cw - nextW) / 2;
            ctx.moveTo(x, y);
            ctx.lineTo(x + w, y);
            ctx.lineTo(nx + nextW, y + h);
            ctx.lineTo(nx, y + h);
          } else {
            ctx.roundRect(x, y, w, h, 4);
          }
          ctx.closePath();
          ctx.fillStyle = s.color + alphaHex;
          ctx.fill();

          ctx.fillStyle = 'rgba(255,255,255,.96)';
          ctx.textAlign = 'center';
          ctx.font = '500 12px "DM Sans", system-ui, sans-serif';
          ctx.fillText(s.label, pad.l + cw / 2, y + h / 2 - 3);
          ctx.font = '11px "DM Sans", system-ui, sans-serif';
          ctx.fillText(s.value.toLocaleString(), pad.l + cw / 2, y + h / 2 + 12);

          if (o.showStats) {
            const pct = i === 0 ? 100 : (s.value / stages[0].value) * 100;
            ctx.textAlign = 'left';
            ctx.fillStyle = ink(0.95);
            ctx.font = '500 13px "DM Sans", system-ui, sans-serif';
            ctx.fillText(pct.toFixed(1) + '%', W - pad.r + 18, y + h / 2 - 3);
            if (i > 0) {
              const drop = ((stages[i - 1].value - s.value) / stages[i - 1].value) * 100;
              ctx.fillStyle = o.dropColor;
              ctx.font = '11px "DM Sans", system-ui, sans-serif';
              ctx.fillText('−' + drop.toFixed(0) + '%', W - pad.r + 18, y + h / 2 + 12);
            }
          }
        });
      },
    },
    legend: () => null,
  },

  {
    id: 'marimekko',
    title: 'Marimekko',
    category: 'Flow',
    blurb: 'Column width is one measure, segment height another — market size against mix.',
    tags: ['marimekko', 'mekko', 'mosaic', 'market share', 'two dimensions'],
    spec: {
      columns: [
        { name: 'Women',  share: 0.42, color: C.green, segments: [{ name: 'Premium', pct: 0.45 }, { name: 'Mid', pct: 0.35 }, { name: 'Value', pct: 0.20 }] },
        { name: 'Men',    share: 0.33, color: C.blue,   segments: [{ name: 'Premium', pct: 0.38 }, { name: 'Mid', pct: 0.40 }, { name: 'Value', pct: 0.22 }] },
        { name: 'Living', share: 0.25, color: C.amber,  segments: [{ name: 'Premium', pct: 0.55 }, { name: 'Mid', pct: 0.30 }, { name: 'Value', pct: 0.15 }] },
      ],
      opts: { textColor: '#808080', gap: 2, showLabels: true, minLabelHeight: 22, radius: 3 },
    },
    controls: [
      { group: 'Data',   type: 'series', key: 'columns', data: false, max: 6, min: 1 },
      { group: 'Style',  type: 'slider', key: 'opts.gap', label: 'Segment gap', min: 0, max: 8, step: 1, format: (v) => v + 'px' },
      { group: 'Style',  type: 'slider', key: 'opts.radius', label: 'Corner radius', min: 0, max: 10, step: 1, format: (v) => v + 'px' },
      { group: 'Labels', type: 'toggle', key: 'opts.showLabels', label: 'Show segment labels' },
      { group: 'Labels', type: 'slider', key: 'opts.minLabelHeight', label: 'Label threshold', min: 10, max: 60, step: 2, format: (v) => v + 'px' },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    onChange(spec) {
      spec.columns.forEach((c) => {
        if (typeof c.share !== 'number') c.share = 0.2;
        if (!Array.isArray(c.segments)) {
          c.segments = [{ name: 'Premium', pct: 0.4 }, { name: 'Mid', pct: 0.35 }, { name: 'Value', pct: 0.25 }];
        }
      });
      // Normalise widths so the columns always fill the frame exactly.
      const total = spec.columns.reduce((sum, c) => sum + c.share, 0) || 1;
      spec.columns.forEach((c) => { c._w = c.share / total; });
    },
    canvas: {
      helpers: [inkColor],
      height: 380,
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const pad = { t: 20, r: 16, b: 44, l: 16 };
        const cw = W - pad.l - pad.r;
        const ch = H - pad.t - pad.b;
        const total = spec.columns.reduce((sum, c) => sum + c.share, 0) || 1;

        let x = pad.l;
        spec.columns.forEach((col) => {
          const colW = (col.share / total) * cw;
          const segTotal = col.segments.reduce((s, g) => s + g.pct, 0) || 1;
          let y = pad.t;

          col.segments.forEach((seg, si) => {
            const segH = (seg.pct / segTotal) * ch;
            // Both dimensions carry meaning here, so both are spelled out —
            // a Marimekko is routinely misread as a plain stacked bar.
            tip(x, y, colW, segH, [
              col.name + ' · ' + seg.name,
              'share of column: ' + Math.round((seg.pct / segTotal) * 100) + '%',
              'column width: ' + Math.round((col.share / total) * 100) + '% of total',
            ].join('\n'));
            // Fade successive segments of the same column so the mix reads.
            const fade = ['', 'bb', '77', '55', '3a'][si] || '2a';
            ctx.beginPath();
            ctx.roundRect(x + o.gap / 2, y + o.gap / 2, Math.max(1, colW - o.gap), Math.max(1, segH - o.gap), o.radius);
            ctx.fillStyle = col.color + fade;
            ctx.fill();

            if (o.showLabels && segH > o.minLabelHeight && colW > 48) {
              ctx.fillStyle = 'rgba(255,255,255,.94)';
              ctx.textAlign = 'center';
              ctx.font = '10px "DM Sans", system-ui, sans-serif';
              ctx.fillText(seg.name, x + colW / 2, y + segH / 2 + 1);
              ctx.fillText(Math.round((seg.pct / segTotal) * 100) + '%', x + colW / 2, y + segH / 2 + 13);
            }
            y += segH;
          });

          ctx.fillStyle = ink(0.95);
          ctx.textAlign = 'center';
          ctx.font = '500 12px "DM Sans", system-ui, sans-serif';
          ctx.fillText(col.name, x + colW / 2, H - pad.b + 20);
          ctx.fillStyle = ink(0.7);
          ctx.font = '10px "DM Sans", system-ui, sans-serif';
          ctx.fillText(Math.round((col.share / total) * 100) + '%', x + colW / 2, H - pad.b + 33);

          x += colW;
        });
      },
    },
    legend: (spec) => spec.columns.map((c) => ({ label: c.name, color: c.color, toggleable: false })),
  },

  {
    id: 'stream-graph',
    title: 'Stream Graph',
    category: 'Flow',
    blurb: 'A stacked area freed from the baseline. Reads total volume and rhythm, not exact values.',
    tags: ['stream', 'streamgraph', 'stacked area', 'themeriver', 'd3'],
    spec: {
      periods: ['2020', '2021', '2022', '2023', '2024'],
      series: [
        { label: 'Women',  color: C.green, data: [420, 480, 520, 580, 640] },
        { label: 'Men',    color: C.blue,   data: [310, 340, 380, 410, 450] },
        { label: 'Living', color: C.amber,  data: [180, 220, 260, 290, 320] },
        { label: 'Sale',   color: C.violet,   data: [120, 145, 130, 160, 175] },
      ],
      opts: { alpha: 0.82, offset: 'wiggle', curve: 'catmull', strokeWidth: 0.5 },
    },
    controls: [
      { group: 'Data',  type: 'labels', key: 'periods', label: 'Period labels' },
      { group: 'Data',  type: 'series', key: 'series', data: true, max: 7 },
      { group: 'Shape', type: 'seg',    key: 'opts.offset', label: 'Baseline',
        options: [{ value: 'wiggle', label: 'Wiggle' }, { value: 'silhouette', label: 'Centre' }, { value: 'none', label: 'Zero' }] },
      { group: 'Shape', type: 'seg',    key: 'opts.curve', label: 'Curve',
        options: [{ value: 'catmull', label: 'Smooth' }, { value: 'basis', label: 'Soft' }, { value: 'linear', label: 'Straight' }] },
      { group: 'Shape', type: 'slider', key: 'opts.alpha', label: 'Fill opacity', min: 0.3, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
    ],
    d3: {
      height: 380,
      mount(host, spec, W, H) {
        const o = spec.opts;
        const pad = { t: 16, r: 20, b: 30, l: 20 };
        const keys = spec.series.map((s) => s.label);

        const rows = spec.periods.map((p, i) => {
          const row = { period: p };
          spec.series.forEach((s) => { row[s.label] = s.data[i] || 0; });
          return row;
        });

        const offsets = { wiggle: d3.stackOffsetWiggle, silhouette: d3.stackOffsetSilhouette, none: d3.stackOffsetNone };
        const curves = { catmull: d3.curveCatmullRom, basis: d3.curveBasis, linear: d3.curveLinear };

        const stack = d3.stack().keys(keys)
          .offset(offsets[o.offset] || d3.stackOffsetWiggle)
          .order(d3.stackOrderInsideOut);
        const series = stack(rows);

        const x = d3.scaleLinear().domain([0, Math.max(1, spec.periods.length - 1)]).range([pad.l, W - pad.r]);
        const extent = d3.extent(series.flatMap((s) => s.flatMap((d) => d)));
        const y = d3.scaleLinear().domain(extent).range([H - pad.b, pad.t]);

        const svg = d3.select(host).append('svg').attr('width', W).attr('height', H);
        const area = d3.area()
          .x((_, i) => x(i))
          .y0((d) => y(d[0]))
          .y1((d) => y(d[1]))
          .curve(curves[o.curve] || d3.curveCatmullRom);

        const alphaHex = Math.round(o.alpha * 255).toString(16).padStart(2, '0');
        svg.selectAll('path').data(series).join('path')
          .attr('d', area)
          .attr('fill', (_, i) => spec.series[i].color + alphaHex)
          .attr('stroke', (_, i) => spec.series[i].color)
          .attr('stroke-width', o.strokeWidth)
          .attr('data-tip', (_, i) => spec.series[i].label);

        svg.append('g')
          .attr('transform', `translate(0,${H - pad.b})`)
          .call(d3.axisBottom(x).ticks(spec.periods.length).tickFormat((_, i) => spec.periods[i] || '').tickSize(3))
          .call((g) => g.select('.domain').remove())
          .call((g) => g.selectAll('text')
            .attr('font-size', 11)
            .attr('font-family', '"DM Sans", system-ui, sans-serif')
            .attr('fill', 'currentColor'))
          .call((g) => g.selectAll('.tick line').attr('stroke', 'rgba(128,128,128,.4)'));
      },
    },
    legend: (spec) => spec.series.map((s) => ({ label: s.label, color: s.color, toggleable: false })),
  },
];
