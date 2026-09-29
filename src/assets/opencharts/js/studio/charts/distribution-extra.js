/**
 * Further distribution charts: density, ridgeline, ECDF, beeswarm, barcode
 * and radial histogram.
 *
 * All of them read raw observations out of the spec. They used to sample from
 * a mean and a standard deviation instead, which kept the exported code short
 * at the cost of the whole point: a distribution chart exists to show the
 * shape of *measurements*, and there was no way to get any in.
 */

import { C } from '../palette.js';
import {
  DENSITY_GROUPS, RIDGELINE_ROWS, ECDF_GROUPS, BEESWARM_GROUPS, BARCODE_ROWS, WIND_ROSE,
} from './_data.js';

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next !== undefined ? sorted[base] + rest * (next - sorted[base]) : sorted[base];
}

function kde(data, min, max, bandwidth, steps) {
  const points = [];
  const norm = bandwidth * Math.sqrt(2 * Math.PI);
  const step = (max - min) / steps;
  for (let v = min; v <= max; v += step) {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const z = (v - data[i]) / bandwidth;
      sum += Math.exp(-0.5 * z * z) / norm;
    }
    points.push({ v: v, d: sum / data.length });
  }
  return points;
}

/** Greedy vertical offsetting — a beeswarm without a force simulation. */
function swarm(values, toX, radius) {
  const placed = [];
  const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  sorted.forEach((item) => {
    const x = toX(item.v);
    let offset = 0;
    let dir = 1;
    // Step outward from the centre line until the slot is clear.
    for (let attempt = 0; attempt < 400; attempt++) {
      const clash = placed.some((p) =>
        Math.abs(p.x - x) < radius * 2 && Math.abs(p.offset - offset) < radius * 1.8);
      if (!clash) break;
      dir = -dir;
      if (dir === 1) offset = Math.abs(offset) + radius * 1.25;
      offset = dir * Math.abs(offset);
    }
    placed.push({ x: x, offset: offset, v: item.v });
  });
  return placed;
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

export const distributionExtraCharts = [
  {
    id: 'density-plot',
    title: 'Density Plot',
    category: 'Distribution',
    blurb: 'A smoothed histogram. No bin-width argument, but the bandwidth choice is doing the same work.',
    tags: ['density', 'kde', 'distribution', 'smoothed', 'histogram', 'curve'],
    spec: {
      groups: DENSITY_GROUPS.map((g, i) => ({ ...g, color: [C.green, C.blue, C.amber, C.violet][i % 4] })),
      opts: { textColor: '#808080', min: 10, max: 100, bandwidth: 4, fillAlpha: 0.22, lineWidth: 2, showRug: true },
    },
    controls: [
      { group: 'Data',  type: 'series', key: 'groups', data: false, max: 4, min: 1 },
      { group: 'Shape', type: 'slider', key: 'opts.bandwidth', label: 'Bandwidth', min: 1, max: 15, step: 0.5, format: (v) => v.toFixed(1) },
      { group: 'Shape', type: 'slider', key: 'opts.fillAlpha', label: 'Fill opacity', min: 0, max: 0.6, step: 0.02, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Shape', type: 'toggle', key: 'opts.showRug', label: 'Show rug marks' },
      { group: 'Axis',  type: 'slider', key: 'opts.min', label: 'Axis minimum', min: 0, max: 60, step: 5 },
      { group: 'Axis',  type: 'slider', key: 'opts.max', label: 'Axis maximum', min: 60, max: 200, step: 5 },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    canvas: {
      height: 360,
      helpers: [kde, quantile, inkColor],
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const pad = { t: 18, r: 20, b: 40, l: 46 };
        const cw = W - pad.l - pad.r;
        const ch = H - pad.t - pad.b;
        const toX = (v) => pad.l + ((v - o.min) / (o.max - o.min)) * cw;

        const curves = spec.groups.map((g) => {
          const data = g.values || [];
          return { g: g, data: data, pts: kde(data, o.min, o.max, o.bandwidth, 160) };
        });
        const maxD = Math.max(...curves.flatMap((c) => c.pts.map((p) => p.d)), 1e-9);
        const toY = (d) => pad.t + ch - (d / maxD) * ch;

        ctx.strokeStyle = 'rgba(128,128,128,.14)';
        ctx.fillStyle = ink(0.75);
        ctx.font = '10px "DM Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 1;
        for (let k = 0; k <= 5; k++) {
          const v = o.min + ((o.max - o.min) / 5) * k;
          const x = toX(v);
          ctx.beginPath();
          ctx.moveTo(x, pad.t);
          ctx.lineTo(x, pad.t + ch);
          ctx.stroke();
          ctx.fillText(Math.round(v), x, H - pad.b + 18);
        }

        curves.forEach((c, ci) => {
          // Curves overlap, so each gets its own band of the plot rather than
          // the whole area — otherwise only the last one drawn is reachable.
          {
            const sorted = c.data.slice().sort((p, q) => p - q);
            if (sorted.length) {
              tip(pad.l, pad.t + (ch / curves.length) * ci, cw, ch / curves.length, [
                c.g.label,
                'n = ' + sorted.length,
                'median ' + quantile(sorted, 0.5).toFixed(1),
                'q1–q3 ' + quantile(sorted, 0.25).toFixed(1) + '–' + quantile(sorted, 0.75).toFixed(1),
                'range ' + sorted[0].toFixed(1) + '–' + sorted[sorted.length - 1].toFixed(1),
              ].join('\n'));
            }
          }
          const alphaHex = Math.round(o.fillAlpha * 255).toString(16).padStart(2, '0');
          ctx.beginPath();
          ctx.moveTo(toX(c.pts[0].v), pad.t + ch);
          c.pts.forEach((p) => ctx.lineTo(toX(p.v), toY(p.d)));
          ctx.lineTo(toX(c.pts[c.pts.length - 1].v), pad.t + ch);
          ctx.closePath();
          ctx.fillStyle = c.g.color + alphaHex;
          ctx.fill();

          ctx.beginPath();
          c.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(toX(p.v), toY(p.d)) : ctx.lineTo(toX(p.v), toY(p.d))));
          ctx.strokeStyle = c.g.color;
          ctx.lineWidth = o.lineWidth;
          ctx.stroke();

          if (o.showRug) {
            ctx.strokeStyle = c.g.color + '66';
            ctx.lineWidth = 1;
            c.data.forEach((v, i) => {
              if (i % 4) return;   // thin the rug so it stays a texture
              const x = toX(v);
              ctx.beginPath();
              ctx.moveTo(x, pad.t + ch);
              ctx.lineTo(x, pad.t + ch + 7);
              ctx.stroke();
            });
          }
        });
      },
    },
    legend: (spec) => spec.groups.map((g) => ({ label: g.label, color: g.color, toggleable: false })),
  },

  {
    id: 'ridgeline',
    title: 'Ridgeline Plot',
    category: 'Distribution',
    blurb: 'Densities stacked and overlapped down the page. Trades exact values for a very readable shift.',
    tags: ['ridgeline', 'joyplot', 'density', 'distribution', 'overlap', 'seasonal'],
    spec: {
      rows: RIDGELINE_ROWS.map((r, i) => ({
        ...r, color: [C.violet, C.blue, C.olive, C.cyan, C.amber, C.green][i % 6],
      })),
      opts: { textColor: '#808080', min: -6, max: 36, bandwidth: 1.6, overlap: 2.1, fillAlpha: 0.8, lineWidth: 1.2, labelWidth: 52 },
    },
    controls: [
      { group: 'Data',  type: 'series', key: 'rows', data: false, max: 12, min: 2 },
      { group: 'Shape', type: 'slider', key: 'opts.overlap', label: 'Overlap', min: 1, max: 4, step: 0.1, format: (v) => v.toFixed(1) + '×' },
      { group: 'Shape', type: 'slider', key: 'opts.bandwidth', label: 'Bandwidth', min: 0.5, max: 6, step: 0.1, format: (v) => v.toFixed(1) },
      { group: 'Shape', type: 'slider', key: 'opts.fillAlpha', label: 'Fill opacity', min: 0.2, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Axis',  type: 'slider', key: 'opts.min', label: 'Axis minimum', min: -20, max: 10, step: 1 },
      { group: 'Axis',  type: 'slider', key: 'opts.max', label: 'Axis maximum', min: 10, max: 60, step: 1 },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    canvas: {
      height: 400,
      helpers: [kde, quantile, inkColor],
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const rows = spec.rows;
        if (!rows.length) return;

        const pad = { t: 16, r: 20, b: 34, l: o.labelWidth };
        const cw = W - pad.l - pad.r;
        const ch = H - pad.t - pad.b;
        const rowStep = ch / rows.length;
        const toX = (v) => pad.l + ((v - o.min) / (o.max - o.min)) * cw;

        const curves = rows.map((r) => kde(r.values || [], o.min, o.max, o.bandwidth, 150));
        const maxD = Math.max(...curves.flat().map((p) => p.d), 1e-9);
        const amp = rowStep * o.overlap;

        ctx.font = '10px "DM Sans", system-ui, sans-serif';
        ctx.fillStyle = ink(0.7);
        ctx.textAlign = 'center';
        for (let k = 0; k <= 5; k++) {
          const v = o.min + ((o.max - o.min) / 5) * k;
          ctx.fillText(Math.round(v) + '°', toX(v), H - pad.b + 18);
        }

        // Draw bottom row first so upper ridges overlap in front of it.
        for (let ri = rows.length - 1; ri >= 0; ri--) {
          const base = pad.t + rowStep * (ri + 1);
          const pts = curves[ri];
          {
            const sorted = rows[ri].values || [].slice().sort((p, q) => p - q);
            if (sorted.length) {
              tip(0, base - rowStep, W, rowStep, [
                rows[ri].label,
                'n = ' + sorted.length,
                'median ' + quantile(sorted, 0.5).toFixed(1),
                'q1–q3 ' + quantile(sorted, 0.25).toFixed(1) + '–' + quantile(sorted, 0.75).toFixed(1),
                'range ' + sorted[0].toFixed(1) + '–' + sorted[sorted.length - 1].toFixed(1),
              ].join('\n'));
            }
          }

          const alphaHex = Math.round(o.fillAlpha * 255).toString(16).padStart(2, '0');

          ctx.beginPath();
          ctx.moveTo(toX(pts[0].v), base);
          pts.forEach((p) => ctx.lineTo(toX(p.v), base - (p.d / maxD) * amp));
          ctx.lineTo(toX(pts[pts.length - 1].v), base);
          ctx.closePath();
          ctx.fillStyle = rows[ri].color + alphaHex;
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = o.lineWidth;
          ctx.stroke();

          ctx.fillStyle = ink(0.95);
          ctx.font = '12px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(rows[ri].label, pad.l - 10, base - 3);
        }
      },
    },
    legend: () => null,
  },

  {
    id: 'ecdf',
    title: 'Cumulative Curve (ECDF)',
    category: 'Distribution',
    blurb: 'Every point answers "what share is below this value?" — no binning decision to argue about.',
    tags: ['ecdf', 'cumulative', 'distribution', 'percentile', 'quantile', 'step'],
    spec: {
      groups: ECDF_GROUPS.map((g, i) => ({ ...g, color: [C.green, C.blue, C.amber, C.violet][i % 4] })),
      opts: { textColor: '#808080', min: 0, max: 900, lineWidth: 2, showMedian: true, suffix: 'ms' },
    },
    controls: [
      { group: 'Data',  type: 'series', key: 'groups', data: false, max: 4, min: 1 },
      { group: 'Style', type: 'slider', key: 'opts.lineWidth', label: 'Line width', min: 1, max: 5, step: 0.5, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.showMedian', label: 'Mark the median' },
      { group: 'Axis',  type: 'slider', key: 'opts.max', label: 'Axis maximum', min: 100, max: 2000, step: 50 },
      { group: 'Axis',  type: 'text',   key: 'opts.suffix', label: 'Value suffix' },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    canvas: {
      height: 360,
      helpers: [inkColor],
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const pad = { t: 18, r: 20, b: 36, l: 50 };
        const cw = W - pad.l - pad.r;
        const ch = H - pad.t - pad.b;
        const toX = (v) => pad.l + ((v - o.min) / (o.max - o.min)) * cw;
        const toY = (p) => pad.t + ch - p * ch;

        ctx.font = '10px "DM Sans", system-ui, sans-serif';
        ctx.lineWidth = 1;
        for (let k = 0; k <= 4; k++) {
          const p = k / 4;
          const y = toY(p);
          ctx.strokeStyle = 'rgba(128,128,128,.13)';
          ctx.beginPath();
          ctx.moveTo(pad.l, y);
          ctx.lineTo(W - pad.r, y);
          ctx.stroke();
          ctx.fillStyle = ink(0.75);
          ctx.textAlign = 'right';
          ctx.fillText(Math.round(p * 100) + '%', pad.l - 6, y + 4);
        }
        ctx.textAlign = 'center';
        for (let k = 0; k <= 4; k++) {
          const v = o.min + ((o.max - o.min) / 4) * k;
          ctx.fillStyle = ink(0.75);
          ctx.fillText(Math.round(v) + o.suffix, toX(v), H - pad.b + 18);
        }

        spec.groups.forEach((g, gi) => {
          const data = (g.values || []).slice().sort((a, b) => a - b);
          if (!data.length) return;
          // Percentiles are what an ECDF is read for, so give the ones people
          // actually quote rather than making them trace the curve.
          const at = (q) => data[Math.min(data.length - 1, Math.floor(q * data.length))];
          tip(pad.l, pad.t + (ch / spec.groups.length) * gi, cw, ch / spec.groups.length, [
            g.label,
            'median ' + at(0.5) + o.suffix,
            'p90 ' + at(0.9) + o.suffix,
            'p99 ' + at(0.99) + o.suffix,
          ].join('\n'));

          // A true ECDF is a step function — draw it as one, not as a smooth line.
          ctx.beginPath();
          ctx.moveTo(toX(o.min), toY(0));
          data.forEach((v, i) => {
            const p = (i + 1) / data.length;
            ctx.lineTo(toX(v), toY(i / data.length));
            ctx.lineTo(toX(v), toY(p));
          });
          ctx.lineTo(toX(o.max), toY(1));
          ctx.strokeStyle = g.color;
          ctx.lineWidth = o.lineWidth;
          ctx.stroke();

          if (o.showMedian) {
            const med = data[Math.floor(data.length / 2)];
            ctx.strokeStyle = g.color + '88';
            ctx.setLineDash([4, 3]);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(toX(med), toY(0));
            ctx.lineTo(toX(med), toY(0.5));
            ctx.lineTo(pad.l, toY(0.5));
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = g.color;
            ctx.font = '500 10px "DM Sans", system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(Math.round(med) + o.suffix, toX(med) + 4, toY(0.5) - 5);
          }
        });
      },
    },
    legend: (spec) => spec.groups.map((g) => ({ label: g.label, color: g.color, line: true, toggleable: false })),
  },

  {
    id: 'beeswarm',
    title: 'Beeswarm',
    category: 'Distribution',
    blurb: 'Every observation as its own dot, nudged aside so none hide. Honest about sample size.',
    tags: ['beeswarm', 'swarm', 'jitter', 'strip', 'distribution', 'raw data', 'dots'],
    spec: {
      groups: BEESWARM_GROUPS.map((g, i) => ({ ...g, color: [C.green, C.blue, C.amber, C.violet][i % 4] })),
      opts: { textColor: '#808080', min: 0, max: 110, radius: 4, alpha: 0.85, showMean: true, rowGap: 12 },
    },
    controls: [
      { group: 'Data',  type: 'series', key: 'groups', data: false, max: 5, min: 1 },
      { group: 'Style', type: 'slider', key: 'opts.radius', label: 'Dot size', min: 2, max: 9, step: 0.5, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.alpha', label: 'Dot opacity', min: 0.2, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'toggle', key: 'opts.showMean', label: 'Mark the mean' },
      { group: 'Axis',  type: 'slider', key: 'opts.max', label: 'Axis maximum', min: 20, max: 300, step: 10 },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    canvas: {
      height: 380,
      helpers: [swarm, inkColor],
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const groups = spec.groups;
        if (!groups.length) return;

        const pad = { t: 16, r: 26, b: 34, l: 96 };
        const cw = W - pad.l - pad.r;
        const ch = H - pad.t - pad.b;
        const rowH = ch / groups.length;
        const toX = (v) => pad.l + ((v - o.min) / (o.max - o.min)) * cw;
        const alphaHex = Math.round(o.alpha * 255).toString(16).padStart(2, '0');

        ctx.font = '10px "DM Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (let k = 0; k <= 5; k++) {
          const v = o.min + ((o.max - o.min) / 5) * k;
          const x = toX(v);
          ctx.strokeStyle = 'rgba(128,128,128,.12)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, pad.t);
          ctx.lineTo(x, pad.t + ch);
          ctx.stroke();
          ctx.fillStyle = ink(0.75);
          ctx.fillText(Math.round(v), x, H - pad.b + 18);
        }

        groups.forEach((g, gi) => {
          const values = g.values || [];
          const cy = pad.t + rowH * gi + rowH / 2;
          const placed = swarm(values, toX, o.radius);
          // Every dot is one observation, so each carries its own value — the
          // whole claim of a beeswarm is that nothing is aggregated away.
          placed.forEach((p) => {
            tip({ cx: p.x, cy: cy + p.offset, r: Math.max(6, o.radius + 3),
              text: g.label + ': ' + p.v });
          });

          placed.forEach((p) => {
            const maxOffset = rowH / 2 - o.rowGap;
            const y = cy + Math.max(-maxOffset, Math.min(maxOffset, p.offset));
            ctx.beginPath();
            ctx.arc(p.x, y, o.radius, 0, Math.PI * 2);
            ctx.fillStyle = g.color + alphaHex;
            ctx.fill();
          });

          if (o.showMean) {
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            ctx.strokeStyle = '#171614';
            ctx.globalAlpha = 0.65;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(toX(mean), cy - rowH / 2 + o.rowGap);
            ctx.lineTo(toX(mean), cy + rowH / 2 - o.rowGap);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }

          ctx.fillStyle = ink(0.95);
          ctx.font = '12px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(g.label, pad.l - 12, cy + 4);
          ctx.font = '10px "DM Sans", system-ui, sans-serif';
          ctx.fillStyle = ink(0.6);
          ctx.fillText('n=' + values.length, pad.l - 12, cy + 18);
        });
      },
    },
    legend: (spec) => spec.groups.map((g) => ({ label: g.label, color: g.color, toggleable: false })),
  },

  {
    id: 'barcode-plot',
    title: 'Barcode Plot',
    category: 'Distribution',
    blurb: 'One thin tick per observation on a shared scale. Reads clustering and outliers in almost no height.',
    tags: ['barcode', 'strip plot', 'dot strip', 'distribution', 'ticks', 'compact'],
    spec: {
      rows: BARCODE_ROWS.map((r, i) => ({
        ...r, color: [C.green, C.blue, C.amber, C.violet, C.cyan][i % 5],
      })),
      opts: { textColor: '#808080', min: 0, max: 140, tickHeight: 22, alpha: 0.55, lineWidth: 1.4, showMedian: true, prefix: '$' },
    },
    controls: [
      { group: 'Data',  type: 'series', key: 'rows', data: false, max: 8, min: 1 },
      { group: 'Style', type: 'slider', key: 'opts.tickHeight', label: 'Tick height', min: 8, max: 46, step: 2, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.alpha', label: 'Tick opacity', min: 0.15, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'toggle', key: 'opts.showMedian', label: 'Mark the median' },
      { group: 'Axis',  type: 'slider', key: 'opts.max', label: 'Axis maximum', min: 40, max: 400, step: 10 },
      { group: 'Axis',  type: 'text',   key: 'opts.prefix', label: 'Value prefix' },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    canvas: {
      height: 340,
      helpers: [quantile, inkColor],
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const rows = spec.rows;
        if (!rows.length) return;

        const pad = { t: 14, r: 24, b: 32, l: 84 };
        const cw = W - pad.l - pad.r;
        const ch = H - pad.t - pad.b;
        const rowH = ch / rows.length;
        const toX = (v) => pad.l + ((v - o.min) / (o.max - o.min)) * cw;
        const alphaHex = Math.round(o.alpha * 255).toString(16).padStart(2, '0');

        ctx.font = '10px "DM Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (let k = 0; k <= 5; k++) {
          const v = o.min + ((o.max - o.min) / 5) * k;
          ctx.fillStyle = ink(0.75);
          ctx.fillText(o.prefix + Math.round(v), toX(v), H - pad.b + 18);
        }

        rows.forEach((r, ri) => {
          const values = r.values || [];
          const cy = pad.t + rowH * ri + rowH / 2;
          const half = o.tickHeight / 2;
          {
            const sorted = values.slice().sort((p, q) => p - q);
            if (sorted.length) {
              tip(0, pad.t + rowH * ri, W, rowH, [
                r.label,
                'n = ' + sorted.length,
                'median ' + quantile(sorted, 0.5).toFixed(1),
                'q1–q3 ' + quantile(sorted, 0.25).toFixed(1) + '–' + quantile(sorted, 0.75).toFixed(1),
                'range ' + sorted[0].toFixed(1) + '–' + sorted[sorted.length - 1].toFixed(1),
              ].join('\n'));
            }
          }

          ctx.strokeStyle = r.color + alphaHex;
          ctx.lineWidth = o.lineWidth;
          values.forEach((v) => {
            const x = toX(v);
            ctx.beginPath();
            ctx.moveTo(x, cy - half);
            ctx.lineTo(x, cy + half);
            ctx.stroke();
          });

          if (o.showMedian) {
            const sorted = values.slice().sort((a, b) => a - b);
            const med = sorted[Math.floor(sorted.length / 2)];
            ctx.strokeStyle = r.color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(toX(med), cy - half - 4);
            ctx.lineTo(toX(med), cy + half + 4);
            ctx.stroke();
          }

          ctx.fillStyle = ink(0.95);
          ctx.font = '12px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(r.label, pad.l - 12, cy + 4);
        });
      },
    },
    legend: () => null,
  },

  {
    id: 'radial-histogram',
    title: 'Radial Histogram',
    category: 'Distribution',
    blurb: 'Bins wrapped around a circle. The right choice when the variable itself is angular — wind, time of day.',
    tags: ['radial histogram', 'wind rose', 'circular', 'polar', 'angular', 'bins'],
    spec: {
      labels: WIND_ROSE.map((d) => d.label),
      binCounts: WIND_ROSE.map((d) => d.value),
      color: C.violet,
      accent: C.amber,
      opts: { textColor: '#808080', innerRadius: 26, showGrid: true, showLabels: true },
    },
    controls: [
      { group: 'Style', type: 'colors', key: 'radialColors', label: 'Low / high', names: () => ['Low', 'High'] },
      { group: 'Style', type: 'slider', key: 'opts.innerRadius', label: 'Inner radius', min: 0, max: 80, step: 2, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.showGrid', label: 'Show rings' },
      { group: 'Style', type: 'toggle', key: 'opts.showLabels', label: 'Show compass labels' },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    onInit(spec) { spec.radialColors = [spec.color, spec.accent]; },
    onChange(spec) { [spec.color, spec.accent] = spec.radialColors; },
    canvas: {
      helpers: [inkColor],
      height: 420,
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const counts = spec.binCounts;
        const n = counts.length;

        const cx = W / 2;
        const cy = H / 2;
        const maxR = Math.min(W, H) / 2 - 34;
        const maxC = Math.max(...counts, 1);
        const slice = (Math.PI * 2) / n;

        const mix = (t) => {
          const hex = (c) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
          const a = hex(spec.color);
          const b = hex(spec.accent);
          const ch = a.map((v, k) => Math.round(v + (b[k] - v) * t));
          return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
        };

        if (o.showGrid) {
          [0.25, 0.5, 0.75, 1].forEach((t) => {
            ctx.beginPath();
            ctx.arc(cx, cy, o.innerRadius + (maxR - o.innerRadius) * t, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(128,128,128,.13)';
            ctx.lineWidth = 1;
            ctx.stroke();
          });
        }

        counts.forEach((c, i) => {
          const a0 = slice * i - Math.PI / 2;
          const a1 = a0 + slice * 0.92;
          // Out to the full radius, so the sparse directions are hoverable too.
          tip({ cx: cx, cy: cy, r0: o.innerRadius, r1: maxR, a0: a0, a1: a1,
            text: ((spec.labels || [])[i] || 'Bin ' + (i + 1)) + ': ' + c });
          const t = c / maxC;
          const r = o.innerRadius + t * (maxR - o.innerRadius);
          ctx.beginPath();
          ctx.arc(cx, cy, o.innerRadius, a0, a1);
          ctx.arc(cx, cy, r, a1, a0, true);
          ctx.closePath();
          ctx.fillStyle = mix(t);
          ctx.fill();
        });

        if (o.showLabels) {
          const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
          ctx.fillStyle = ink(0.85);
          ctx.font = '11px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'center';
          dirs.forEach((d, i) => {
            const a = (i / dirs.length) * Math.PI * 2 - Math.PI / 2;
            ctx.fillText(d, cx + Math.cos(a) * (maxR + 16), cy + Math.sin(a) * (maxR + 16) + 4);
          });
        }
      },
    },
    legend: (spec) => [
      { label: 'Fewer', color: spec.color, toggleable: false },
      { label: 'More',  color: spec.accent, toggleable: false },
    ],
  },
];
