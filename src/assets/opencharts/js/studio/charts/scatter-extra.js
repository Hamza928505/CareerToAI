/**
 * Scatter charts for when there are too many points to plot one by one.
 *
 * A scatterplot stops working somewhere around a thousand marks: the ink
 * saturates, and the densest region looks identical to the merely busy one.
 * All three charts here answer that by aggregating instead of overplotting —
 * into hexagons, into a smoothed surface, or into every pair of variables at
 * once.
 *
 * They read the same points a plain scatter does, so a table that draws one
 * draws all of them.
 */

import { C } from '../palette.js';
import { SCATTER_POINTS, PARALLEL_RECORDS } from './_data.js';

/**
 * The label colour, resolved once per draw.
 *
 * Duplicated per chart file rather than imported because `draw` is serialised
 * to source: an import would not travel with it. See "One build function, two
 * outputs" in CLAUDE.md.
 */
function inkColor(color, alpha) {
  if (!color) return 'rgba(128,128,128,' + alpha + ')';
  const hex = color.replace('#', '');
  const n = parseInt(hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
}

/** Blend two hex colours. The ramp every density chart here paints with. */
function mixHex(a, b, t) {
  const parse = (h) => {
    const s = h.replace('#', '');
    const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const x = parse(a);
  const y = parse(b);
  const k = Math.max(0, Math.min(1, t));
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k)
    .toString(16).padStart(2, '0')).join('');
}

/** Pearson correlation, for the readout on a scatterplot matrix cell. */
function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den ? num / den : 0;
}

/** The variables a scatterplot matrix opens on, read off the sample records. */
const SPLOM_FIELDS = ['Price', 'Rating', 'Reviews', 'Margin%'];

export const scatterExtraCharts = [
  /* ── Hexagonal binning ─────────────────────────────────────────────────── */
  {
    id: 'hexbin',
    title: 'Hexagonal Binning',
    category: 'Scatter',
    blurb: 'Counts points into hexagons and shades by how many landed in each. Reads density where a scatter has gone solid.',
    tags: ['hexbin', 'hexagonal binning', 'density', 'scatter', 'overplotting', 'bins'],
    spec: {
      points: SCATTER_POINTS.map((p) => ({ x: p.x, y: p.y })),
      opts: {
        textColor: '#808080',
        radius: 16,
        low: '#E8E6F7',
        high: C.green,
        stroke: true,
        showCounts: false,
        xLabel: 'Price',
        yLabel: 'Rating',
      },
    },
    controls: [
      { group: 'Bins', type: 'slider', key: 'opts.radius', label: 'Hexagon size', min: 8, max: 40, step: 2, format: (v) => v + 'px' },
      { group: 'Bins', type: 'toggle', key: 'opts.showCounts', label: 'Print the count in each' },
      { group: 'Bins', type: 'toggle', key: 'opts.stroke', label: 'Outline the hexagons' },
      { group: 'Colour', type: 'color', key: 'opts.low', label: 'Fewest' },
      { group: 'Colour', type: 'color', key: 'opts.high', label: 'Most' },
      { group: 'Axis', type: 'text', key: 'opts.xLabel', label: 'X axis label' },
      { group: 'Axis', type: 'text', key: 'opts.yLabel', label: 'Y axis label' },
      { group: 'Labels', type: 'color', key: 'opts.textColor', label: 'Text colour' },
    ],
    canvas: {
      height: 380,
      helpers: [inkColor, mixHex],
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const compact = env && env.compact;
        const o = spec.opts;
        const pts = spec.points || [];
        if (!pts.length) return;

        const pad = compact
          ? { t: 10, r: 10, b: 16, l: 20 }
          : { t: 18, r: 18, b: 44, l: 56 };
        const cw = W - pad.l - pad.r;
        const ch = H - pad.t - pad.b;

        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        const x0 = Math.min.apply(null, xs);
        const x1 = Math.max.apply(null, xs);
        const y0 = Math.min.apply(null, ys);
        const y1 = Math.max.apply(null, ys);
        const toX = (v) => pad.l + (x1 === x0 ? cw / 2 : ((v - x0) / (x1 - x0)) * cw);
        const toY = (v) => pad.t + ch - (y1 === y0 ? ch / 2 : ((v - y0) / (y1 - y0)) * ch);

        // Pointy-top hexagons: columns a full width apart, rows three quarters
        // of a height, every other row offset by half a width.
        const R = Math.max(5, o.radius);
        const dx = R * Math.sqrt(3);
        const dy = R * 1.5;

        // Bin by trying both candidate rows and keeping the nearer centre —
        // rounding to one row alone puts points in the hexagon next door.
        const centreOf = (i, j) => ({
          cx: pad.l + i * dx + (j & 1 ? dx / 2 : 0),
          cy: pad.t + j * dy,
        });
        const bins = {};
        pts.forEach((p) => {
          const px = toX(p.x);
          const py = toY(p.y);
          const jf = Math.floor((py - pad.t) / dy);
          let best = null;
          for (let j = jf; j <= jf + 1; j++) {
            const off = (j & 1) ? dx / 2 : 0;
            const i = Math.round((px - pad.l - off) / dx);
            const c = centreOf(i, j);
            const d = (c.cx - px) * (c.cx - px) + (c.cy - py) * (c.cy - py);
            if (!best || d < best.d) best = { i: i, j: j, d: d, cx: c.cx, cy: c.cy };
          }
          const key = best.i + ':' + best.j;
          if (!bins[key]) bins[key] = { cx: best.cx, cy: best.cy, n: 0 };
          bins[key].n++;
        });

        const cells = Object.keys(bins).map((k) => bins[k]);
        const most = cells.reduce((m, c) => Math.max(m, c.n), 1);

        cells.forEach((cell) => {
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (Math.PI / 180) * (60 * k - 90);
            const hx = cell.cx + R * Math.cos(a);
            const hy = cell.cy + R * Math.sin(a);
            if (k) ctx.lineTo(hx, hy); else ctx.moveTo(hx, hy);
          }
          ctx.closePath();
          ctx.fillStyle = mixHex(o.low, o.high, most === 1 ? 1 : (cell.n - 1) / (most - 1));
          ctx.fill();
          if (o.stroke) {
            ctx.strokeStyle = ink(0.22);
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          if (o.showCounts && !compact && R >= 12) {
            ctx.fillStyle = cell.n > most * 0.55 ? '#ffffff' : ink(0.9);
            ctx.font = '10px "DM Mono", ui-monospace, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(String(cell.n), cell.cx, cell.cy + 3);
          }
          tip({
            cx: cell.cx,
            cy: cell.cy,
            r: R,
            text: cell.n + (cell.n === 1 ? ' point' : ' points') + ' in this hexagon',
          });
        });

        if (compact) return;

        ctx.strokeStyle = ink(0.25);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.l, pad.t);
        ctx.lineTo(pad.l, pad.t + ch);
        ctx.lineTo(pad.l + cw, pad.t + ch);
        ctx.stroke();

        ctx.fillStyle = ink(0.8);
        ctx.font = '10px "DM Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (let k = 0; k <= 4; k++) {
          const v = x0 + ((x1 - x0) / 4) * k;
          ctx.fillText(Math.round(v * 100) / 100, toX(v), pad.t + ch + 16);
        }
        ctx.textAlign = 'right';
        for (let k = 0; k <= 4; k++) {
          const v = y0 + ((y1 - y0) / 4) * k;
          ctx.fillText(Math.round(v * 100) / 100, pad.l - 8, toY(v) + 3);
        }

        ctx.fillStyle = ink(0.95);
        ctx.font = '11px "DM Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(o.xLabel, pad.l + cw / 2, H - 8);
        ctx.save();
        ctx.translate(14, pad.t + ch / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(o.yLabel, 0, 0);
        ctx.restore();
      },
    },
    legend: (spec) => [
      { label: 'Fewest', color: spec.opts.low },
      { label: 'Most', color: spec.opts.high },
    ],
    metrics: (spec) => [
      { label: 'Points', value: (spec.points || []).length },
    ],
  },

  /* ── Scatterplot matrix ────────────────────────────────────────────────── */
  {
    id: 'splom',
    title: 'Scatterplot Matrix',
    category: 'Scatter',
    blurb: 'Every pair of variables plotted against every other. Finds the relationship worth a chart of its own.',
    tags: ['splom', 'scatterplot matrix', 'pairs', 'correlation', 'multivariate', 'small multiples'],
    spec: {
      labels: PARALLEL_RECORDS.map((r) => r.name),
      series: SPLOM_FIELDS.map((f, i) => ({
        label: f,
        color: [C.green, C.blue, C.amber, C.violet, C.cyan][i % 5],
        data: PARALLEL_RECORDS.map((r) => r[f]),
      })),
      opts: {
        textColor: '#808080',
        radius: 2.4,
        alpha: 0.6,
        dotColor: C.green,
        showR: true,
        grid: true,
      },
    },
    controls: [
      { group: 'Data', type: 'series', key: 'series', data: false, max: 6, min: 2 },
      { group: 'Points', type: 'color', key: 'opts.dotColor', label: 'Point colour' },
      { group: 'Points', type: 'slider', key: 'opts.radius', label: 'Point size', min: 1, max: 6, step: 0.2, format: (v) => v + 'px' },
      { group: 'Points', type: 'slider', key: 'opts.alpha', label: 'Point opacity', min: 0.1, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Cells', type: 'toggle', key: 'opts.showR', label: 'Print the correlation' },
      { group: 'Cells', type: 'toggle', key: 'opts.grid', label: 'Outline the cells' },
      { group: 'Labels', type: 'color', key: 'opts.textColor', label: 'Text colour' },
    ],
    canvas: {
      height: 440,
      helpers: [inkColor, pearson],
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const compact = env && env.compact;
        const o = spec.opts;
        const series = (spec.series || []).filter((s) => s && s.data && s.data.length);
        const n = series.length;
        if (n < 2) return;

        const pad = compact ? 6 : 16;
        const gutter = compact ? 46 : 66;
        const size = Math.min(W - pad * 2 - gutter, H - pad * 2 - gutter) / n;
        const originX = pad + gutter;
        const originY = pad;

        // Every cell shares its column's x scale and its row's y scale, which
        // is the whole point: a mark's position means the same thing across a
        // row, so the eye can run along one and compare.
        const range = series.map((s) => {
          const vals = s.data.map(Number).filter((v) => Number.isFinite(v));
          const lo = Math.min.apply(null, vals);
          const hi = Math.max.apply(null, vals);
          return { lo: lo, hi: hi === lo ? lo + 1 : hi };
        });

        const alphaHex = Math.round(o.alpha * 255).toString(16).padStart(2, '0');
        const rows = Math.min(n, 6);

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < rows; c++) {
            const x = originX + c * size;
            const y = originY + r * size;

            if (o.grid) {
              ctx.strokeStyle = ink(0.16);
              ctx.lineWidth = 1;
              ctx.strokeRect(x, y, size, size);
            }

            if (r === c) {
              ctx.fillStyle = ink(0.95);
              ctx.font = (compact ? 9 : 12) + 'px "DM Sans", system-ui, sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(series[r].label, x + size / 2, y + size / 2 + 4);
              tip(x, y, size, size, series[r].label + '\n'
                + 'range ' + range[r].lo + '–' + range[r].hi);
              continue;
            }

            const xs = series[c].data.map(Number);
            const ys = series[r].data.map(Number);
            const toX = (v) => x + 4 + ((v - range[c].lo) / (range[c].hi - range[c].lo)) * (size - 8);
            const toY = (v) => y + size - 4 - ((v - range[r].lo) / (range[r].hi - range[r].lo)) * (size - 8);

            ctx.fillStyle = o.dotColor + alphaHex;
            for (let i = 0; i < xs.length; i++) {
              if (!Number.isFinite(xs[i]) || !Number.isFinite(ys[i])) continue;
              ctx.beginPath();
              ctx.arc(toX(xs[i]), toY(ys[i]), o.radius, 0, Math.PI * 2);
              ctx.fill();
            }

            const rho = pearson(xs, ys);
            if (o.showR && !compact && size > 60) {
              ctx.fillStyle = ink(0.75);
              ctx.font = '10px "DM Mono", ui-monospace, monospace';
              ctx.textAlign = 'left';
              ctx.fillText('r ' + (rho >= 0 ? '+' : '') + rho.toFixed(2), x + 5, y + 13);
            }
            tip(x, y, size, size, series[c].label + ' against ' + series[r].label
              + '\nr = ' + rho.toFixed(3)
              + '\n' + xs.length + ' points');
          }
        }

        if (compact) return;

        ctx.fillStyle = ink(0.9);
        ctx.font = '11px "DM Sans", system-ui, sans-serif';
        ctx.textAlign = 'right';
        for (let r = 0; r < rows; r++) {
          ctx.fillText(series[r].label, originX - 8, originY + r * size + size / 2 + 4);
        }
        ctx.textAlign = 'center';
        for (let c = 0; c < rows; c++) {
          ctx.fillText(series[c].label, originX + c * size + size / 2, originY + rows * size + 18);
        }
      },
    },
    legend: () => null,
    metrics: (spec) => {
      const series = (spec.series || []).filter((s) => s && s.data && s.data.length);
      return [
        { label: 'Variables', value: series.length },
        { label: 'Rows', value: (spec.labels || []).length },
        { label: 'Panels', value: Math.max(0, series.length * (series.length - 1)) },
      ];
    },
  },

  /* ── 2D density contours ───────────────────────────────────────────────── */
  {
    id: 'density-contour',
    title: '2D Density Contour',
    category: 'Scatter',
    blurb: 'Smooths a cloud of points into nested bands of equal density — a topographic map of where the data sits.',
    tags: ['contour', 'density', '2d', 'kde', 'scatter', 'isoline', 'd3'],
    spec: {
      points: SCATTER_POINTS.map((p) => ({ x: p.x, y: p.y })),
      opts: {
        bandwidth: 22,
        levels: 8,
        low: '#EDEBF9',
        high: C.green,
        showPoints: true,
        pointColor: C.amber,
        lineOnly: false,
        xLabel: 'Price',
        yLabel: 'Rating',
      },
    },
    controls: [
      { group: 'Smoothing', type: 'slider', key: 'opts.bandwidth', label: 'Bandwidth', min: 6, max: 60, step: 2, format: (v) => v + 'px' },
      { group: 'Smoothing', type: 'slider', key: 'opts.levels', label: 'Bands', min: 3, max: 18, step: 1 },
      { group: 'Style', type: 'toggle', key: 'opts.lineOnly', label: 'Lines instead of fills' },
      { group: 'Style', type: 'color', key: 'opts.low', label: 'Sparsest' },
      { group: 'Style', type: 'color', key: 'opts.high', label: 'Densest' },
      { group: 'Points', type: 'toggle', key: 'opts.showPoints', label: 'Show the points' },
      { group: 'Points', type: 'color', key: 'opts.pointColor', label: 'Point colour' },
      { group: 'Axis', type: 'text', key: 'opts.xLabel', label: 'X axis label' },
      { group: 'Axis', type: 'text', key: 'opts.yLabel', label: 'Y axis label' },
    ],
    d3: {
      height: 400,
      helpers: [mixHex],
      mount(host, spec, W, H, env) {
        const o = spec.opts;
        const compact = env && env.compact;
        const pts = (spec.points || []).filter((p) => Number.isFinite(+p.x) && Number.isFinite(+p.y));
        const svg = d3.select(host).append('svg').attr('width', W).attr('height', H);
        if (pts.length < 3) return;

        const pad = compact ? { t: 8, r: 8, b: 10, l: 10 } : { t: 16, r: 16, b: 40, l: 52 };
        const cw = W - pad.l - pad.r;
        const ch = H - pad.t - pad.b;

        const x = d3.scaleLinear().domain(d3.extent(pts, (p) => +p.x)).nice()
          .range([pad.l, pad.l + cw]);
        const y = d3.scaleLinear().domain(d3.extent(pts, (p) => +p.y)).nice()
          .range([pad.t + ch, pad.t]);

        const contours = d3.contourDensity()
          .x((p) => x(+p.x))
          .y((p) => y(+p.y))
          .size([W, H])
          .bandwidth(o.bandwidth)
          .thresholds(o.levels)(pts);

        const most = contours.length ? contours[contours.length - 1].value : 1;

        svg.append('g').selectAll('path').data(contours).join('path')
          .attr('d', d3.geoPath())
          .attr('fill', (d, i) => (o.lineOnly ? 'none'
            : mixHex(o.low, o.high, contours.length < 2 ? 1 : i / (contours.length - 1))))
          .attr('stroke', (d, i) => (o.lineOnly
            ? mixHex(o.low, o.high, contours.length < 2 ? 1 : i / (contours.length - 1))
            : 'rgba(255,255,255,.45)'))
          .attr('stroke-width', o.lineOnly ? 1.4 : 0.6)
          .attr('data-tip', (d) => 'density ' + d.value.toPrecision(2)
            + (most ? ' — ' + Math.round((d.value / most) * 100) + '% of the peak' : ''));

        if (o.showPoints) {
          svg.append('g').selectAll('circle').data(pts).join('circle')
            .attr('cx', (p) => x(+p.x))
            .attr('cy', (p) => y(+p.y))
            .attr('r', compact ? 1.4 : 2.2)
            .attr('fill', o.pointColor)
            .attr('fill-opacity', 0.75)
            .attr('data-tip', (p) => o.xLabel + ' ' + p.x + '\n' + o.yLabel + ' ' + p.y);
        }

        if (compact) return;

        svg.append('g').attr('transform', 'translate(0,' + (pad.t + ch) + ')')
          .call(d3.axisBottom(x).ticks(5))
          .attr('font-size', 10).attr('color', 'currentColor').attr('opacity', 0.65);
        svg.append('g').attr('transform', 'translate(' + pad.l + ',0)')
          .call(d3.axisLeft(y).ticks(5))
          .attr('font-size', 10).attr('color', 'currentColor').attr('opacity', 0.65);

        svg.append('text').attr('x', pad.l + cw / 2).attr('y', H - 6)
          .attr('text-anchor', 'middle').attr('font-size', 11)
          .attr('fill', 'currentColor').attr('opacity', 0.85).text(o.xLabel);
        svg.append('text')
          .attr('transform', 'translate(12,' + (pad.t + ch / 2) + ') rotate(-90)')
          .attr('text-anchor', 'middle').attr('font-size', 11)
          .attr('fill', 'currentColor').attr('opacity', 0.85).text(o.yLabel);
      },
    },
    legend: (spec) => [
      { label: 'Sparsest', color: spec.opts.low },
      { label: 'Densest', color: spec.opts.high },
    ],
    metrics: (spec) => [
      { label: 'Points', value: (spec.points || []).length },
      { label: 'Bands', value: spec.opts.levels },
    ],
  },
];
