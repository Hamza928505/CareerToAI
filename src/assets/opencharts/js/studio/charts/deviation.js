/**
 * Deviation charts — variation from a reference point, usually zero.
 *
 * The FT's Visual Vocabulary treats this as a top-level category and it was
 * the clearest hole in the library: a diverging bar shows deviation across
 * categories, but nothing here showed it *over time* or across an ordered
 * scale of responses.
 */

import { C, MONTHS, withAlpha } from '../palette.js';
import { baseOpts, xAxis, yAxis, TICK } from '../chartjs-base.js';
import { tickFormat, srcFn } from '../serialize.js';

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

export const deviationCharts = [
  {
    id: 'surplus-deficit-line',
    title: 'Surplus / Deficit Line',
    category: 'Deviation',
    blurb: 'One line against a baseline, filled two colours. Reads sign and magnitude at once.',
    tags: ['deviation', 'surplus', 'deficit', 'baseline', 'variance', 'budget'],
    spec: {
      labels: [...MONTHS],
      values: [-2.1, -1.4, 0.6, 1.8, 2.4, 1.1, -0.8, -2.6, -1.2, 0.9, 2.2, 3.4],
      baseline: 0,
      upColor: C.blue,
      downColor: C.amber,
      opts: { textColor: '#808080', lineWidth: 2.2, fillAlpha: 0.28, showBaseline: true, showPoints: true, pointRadius: 3, suffix: 'M', prefix: '$' },
    },
    controls: [
      { group: 'Data',  type: 'labels', key: 'labels', label: 'Period labels' },
      { group: 'Data',  type: 'values', key: 'values', label: 'Values (negatives allowed)' },
      { group: 'Data',  type: 'slider', key: 'baseline', label: 'Baseline', min: -5, max: 5, step: 0.5, format: (v) => v.toFixed(1) },
      { group: 'Style', type: 'colors', key: 'signColors', label: 'Above / below', names: () => ['Surplus', 'Deficit'] },
      { group: 'Style', type: 'slider', key: 'opts.fillAlpha', label: 'Fill opacity', min: 0.05, max: 0.7, step: 0.03, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'slider', key: 'opts.lineWidth', label: 'Line width', min: 1, max: 6, step: 0.5, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.showPoints', label: 'Show data points' },
      { group: 'Style', type: 'toggle', key: 'opts.showBaseline', label: 'Show baseline' },
      { group: 'Axis',  type: 'text',   key: 'opts.prefix', label: 'Value prefix' },
      { group: 'Axis',  type: 'text',   key: 'opts.suffix', label: 'Value suffix' },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    onInit(spec) { spec.signColors = [spec.upColor, spec.downColor]; },
    onChange(spec) { [spec.upColor, spec.downColor] = spec.signColors; },
    canvas: {
      helpers: [inkColor],
      height: 360,
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const vals = spec.values;
        if (!vals.length) return;

        const pad = { t: 20, r: 20, b: 34, l: 62 };
        const cw = W - pad.l - pad.r;
        const ch = H - pad.t - pad.b;
        const lo = Math.min(...vals, spec.baseline);
        const hi = Math.max(...vals, spec.baseline);
        const span = (hi - lo) || 1;
        const minV = lo - span * 0.12;
        const maxV = hi + span * 0.12;
        const toY = (v) => pad.t + ch - ((v - minV) / (maxV - minV)) * ch;
        const toX = (i) => pad.l + (vals.length === 1 ? cw / 2 : (i / (vals.length - 1)) * cw);
        const baseY = toY(spec.baseline);
        const alphaHex = Math.round(o.fillAlpha * 255).toString(16).padStart(2, '0');

        // Grid + value axis.
        ctx.font = '10px "DM Sans", system-ui, sans-serif';
        const step = (maxV - minV) / 5;
        for (let k = 0; k <= 5; k++) {
          const v = minV + step * k;
          const y = toY(v);
          ctx.strokeStyle = 'rgba(128,128,128,.12)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pad.l, y);
          ctx.lineTo(W - pad.r, y);
          ctx.stroke();
          ctx.fillStyle = ink(0.75);
          ctx.textAlign = 'right';
          ctx.fillText(o.prefix + v.toFixed(1) + o.suffix, pad.l - 6, y + 4);
        }

        // Fill above and below the baseline separately, each clipped to its
        // own half of the plot — this is what makes the sign readable.
        const fillSide = (above) => {
          ctx.save();
          ctx.beginPath();
          if (above) ctx.rect(pad.l, pad.t, cw, Math.max(0, baseY - pad.t));
          else ctx.rect(pad.l, baseY, cw, Math.max(0, pad.t + ch - baseY));
          ctx.clip();

          ctx.beginPath();
          ctx.moveTo(toX(0), baseY);
          vals.forEach((v, i) => ctx.lineTo(toX(i), toY(v)));
          ctx.lineTo(toX(vals.length - 1), baseY);
          ctx.closePath();
          ctx.fillStyle = (above ? spec.upColor : spec.downColor) + alphaHex;
          ctx.fill();
          ctx.restore();
        };
        fillSide(true);
        fillSide(false);

        if (o.showBaseline) {
          ctx.strokeStyle = 'rgba(128,128,128,.55)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(pad.l, baseY);
          ctx.lineTo(W - pad.r, baseY);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // The line itself, coloured per segment by which side it sits on.
        ctx.lineWidth = o.lineWidth;
        ctx.lineJoin = 'round';
        for (let i = 0; i < vals.length - 1; i++) {
          ctx.beginPath();
          ctx.moveTo(toX(i), toY(vals[i]));
          ctx.lineTo(toX(i + 1), toY(vals[i + 1]));
          const mid = (vals[i] + vals[i + 1]) / 2;
          ctx.strokeStyle = mid >= spec.baseline ? spec.upColor : spec.downColor;
          ctx.stroke();
        }

        if (o.showPoints) {
          vals.forEach((v, i) => {
            ctx.beginPath();
            ctx.arc(toX(i), toY(v), o.pointRadius, 0, Math.PI * 2);
            ctx.fillStyle = v >= spec.baseline ? spec.upColor : spec.downColor;
            ctx.fill();
          });
        }

        // One column per point, full height: on a line chart the y position
        // is the value, so a target that only covers the line is unusable.
        const colW = (W - pad.l - pad.r) / Math.max(1, vals.length);
        vals.forEach((v, i) => {
          const over = v - spec.baseline;
          tip(toX(i) - colW / 2, pad.t, colW, H - pad.t - pad.b,
            spec.labels[i] + ': ' + v + '\n'
            + (over >= 0 ? 'surplus ' : 'deficit ') + Math.abs(over).toFixed(1));
        });

        // Category labels, thinned so they never collide.
        ctx.fillStyle = ink(0.8);
        ctx.font = '10px "DM Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        const skip = Math.ceil(vals.length / 12);
        spec.labels.forEach((lab, i) => {
          if (i % skip) return;
          ctx.fillText(String(lab), toX(i), H - pad.b + 16);
        });
      },
    },
    legend: (spec) => [
      { label: 'Surplus', color: spec.upColor, toggleable: false },
      { label: 'Deficit', color: spec.downColor, toggleable: false },
    ],
  },

  {
    id: 'bar-diverging-stacked',
    title: 'Diverging Stacked Bar (Likert)',
    category: 'Deviation',
    blurb: 'Survey responses split around a neutral centre. The standard chart for agree/disagree scales.',
    tags: ['likert', 'survey', 'diverging', 'stacked', 'agreement', 'responses'],
    spec: {
      questions: [
        { label: 'The docs are clear',      values: [4, 9, 12, 45, 30] },
        { label: 'Setup was easy',          values: [8, 15, 14, 38, 25] },
        { label: 'Performance is good',     values: [3, 7, 10, 42, 38] },
        { label: 'Support is responsive',   values: [12, 18, 20, 32, 18] },
        { label: 'Pricing is fair',         values: [15, 22, 18, 28, 17] },
      ],
      scale: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
      colors: ['#B0453F', '#D98A66', '#9A968C', '#5E9CD6', '#2F6FB0'],
      opts: { splitNeutral: true, radius: 2, thickness: 0.72, showPercent: true },
    },
    controls: [
      { group: 'Style', type: 'colors', key: 'colors', label: 'Scale colours', names: (s) => s.scale },
      { group: 'Style', type: 'toggle', key: 'opts.splitNeutral', label: 'Split the neutral band' },
      { group: 'Style', type: 'slider', key: 'opts.radius', label: 'Corner radius', min: 0, max: 8, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.thickness', label: 'Bar thickness', min: 0.3, max: 0.95, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
    ],
    chartjs: {
      build(spec) {
        const n = spec.scale.length;
        const mid = Math.floor(n / 2);

        // Everything left of the midpoint is plotted negative so the bars
        // diverge from zero; the neutral band is optionally halved either way.
        const datasets = spec.scale.map((name, si) => {
          const data = spec.questions.map((q) => {
            const total = q.values.reduce((a, b) => a + b, 0) || 1;
            const pct = (q.values[si] / total) * 100;
            if (si < mid) return -pct;
            if (si > mid) return pct;
            return spec.opts.splitNeutral ? pct / 2 : pct;
          });
          // The neutral band needs a mirrored half on the negative side.
          return {
            label: name,
            data,
            backgroundColor: spec.colors[si % spec.colors.length],
            borderRadius: spec.opts.radius,
            borderSkipped: false,
            categoryPercentage: spec.opts.thickness,
            stack: si < mid ? 'neg' : 'pos',
          };
        });

        if (spec.opts.splitNeutral) {
          const total = (q) => q.values.reduce((a, b) => a + b, 0) || 1;
          datasets.splice(mid, 0, {
            label: spec.scale[mid] + ' ',
            data: spec.questions.map((q) => -((q.values[mid] / total(q)) * 100) / 2),
            backgroundColor: spec.colors[mid % spec.colors.length],
            borderRadius: spec.opts.radius,
            borderSkipped: false,
            categoryPercentage: spec.opts.thickness,
            stack: 'neg',
          });
        }

        return {
          type: 'bar',
          data: { labels: spec.questions.map((q) => q.label), datasets },
          options: baseOpts({
            indexAxis: 'y',
            scales: {
              x: yAxis({
                stacked: true,
                ticks: { ...TICK, callback: srcFn(`(v) => Math.abs(v).toFixed(0) + '%'`) },
              }),
              y: xAxis({ stacked: true, ticks: { ...TICK, font: { size: 12 } } }),
            },
            plugins: {
              tooltip: {
                callbacks: {
                  label: srcFn(`(ctx) => ' ' + ctx.dataset.label.trim() + ': ' + Math.abs(ctx.parsed.x).toFixed(1) + '%'`),
                },
              },
            },
          }),
        };
      },
    },
    legend: (spec) => spec.scale.map((name, i) => ({
      label: name, color: spec.colors[i % spec.colors.length], toggleable: false,
    })),
  },

  {
    id: 'spine-chart',
    title: 'Spine Chart',
    category: 'Deviation',
    blurb: 'Two contrasting groups either side of a shared spine, with the categories down the middle.',
    tags: ['spine', 'diverging', 'comparison', 'two groups', 'tornado'],
    spec: {
      rows: [
        { label: 'Under 25',  left: 34, right: 66 },
        { label: '25–34',     left: 48, right: 52 },
        { label: '35–44',     left: 57, right: 43 },
        { label: '45–54',     left: 63, right: 37 },
        { label: '55–64',     left: 71, right: 29 },
        { label: '65+',       left: 78, right: 22 },
      ],
      leftLabel: 'Desktop',
      rightLabel: 'Mobile',
      leftColor: C.violet,
      rightColor: C.amber,
      opts: { textColor: '#808080', gutter: 96, barHeight: 0.62, radius: 3, showValues: true, max: 100 },
    },
    controls: [
      { group: 'Data',  type: 'text',   key: 'leftLabel',  label: 'Left group name' },
      { group: 'Data',  type: 'text',   key: 'rightLabel', label: 'Right group name' },
      { group: 'Style', type: 'colors', key: 'sides', label: 'Side colours', names: (s) => [s.leftLabel, s.rightLabel] },
      { group: 'Style', type: 'slider', key: 'opts.gutter', label: 'Centre gutter', min: 50, max: 180, step: 5, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.barHeight', label: 'Bar height', min: 0.25, max: 0.9, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'slider', key: 'opts.radius', label: 'Corner radius', min: 0, max: 10, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.showValues', label: 'Show values' },
      { group: 'Labels', type: 'color',  key: 'opts.textColor', label: 'Text colour' },
    ],
    onInit(spec) { spec.sides = [spec.leftColor, spec.rightColor]; },
    onChange(spec) { [spec.leftColor, spec.rightColor] = spec.sides; },
    canvas: {
      helpers: [inkColor],
      height: 360,
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const rows = spec.rows;
        if (!rows.length) return;

        const pad = { t: 34, r: 16, b: 18, l: 16 };
        const half = (W - pad.l - pad.r - o.gutter) / 2;
        const ch = H - pad.t - pad.b;
        const rowH = ch / rows.length;
        const bh = rowH * o.barHeight;
        const centreL = pad.l + half;
        const centreR = centreL + o.gutter;

        ctx.font = '500 12px "DM Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = spec.leftColor;
        ctx.fillText(spec.leftLabel, pad.l + half / 2, 18);
        ctx.fillStyle = spec.rightColor;
        ctx.fillText(spec.rightLabel, centreR + half / 2, 18);

        rows.forEach((r, i) => {
          const y = pad.t + rowH * i + (rowH - bh) / 2;
          const lw = (r.left / o.max) * half;
          const rw = (r.right / o.max) * half;
          // Each side separately: the whole point is comparing the two, and a
          // single row-wide target could not say which one you are on.
          tip(centreL - lw, y, lw, bh, r.label + '\n' + spec.leftLabel + ': ' + r.left);
          tip(centreR, y, rw, bh, r.label + '\n' + spec.rightLabel + ': ' + r.right);

          // Left bar grows leftward from the spine.
          ctx.beginPath();
          ctx.roundRect(centreL - lw, y, lw, bh, o.radius);
          ctx.fillStyle = spec.leftColor;
          ctx.fill();

          ctx.beginPath();
          ctx.roundRect(centreR, y, rw, bh, o.radius);
          ctx.fillStyle = spec.rightColor;
          ctx.fill();

          ctx.fillStyle = ink(0.95);
          ctx.font = '12px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(r.label, centreL + o.gutter / 2, y + bh / 2 + 4);

          if (o.showValues) {
            ctx.font = '500 11px "DM Sans", system-ui, sans-serif';
            ctx.fillStyle = spec.leftColor;
            ctx.textAlign = 'right';
            ctx.fillText(r.left + '%', centreL - lw - 6, y + bh / 2 + 4);
            ctx.fillStyle = spec.rightColor;
            ctx.textAlign = 'left';
            ctx.fillText(r.right + '%', centreR + rw + 6, y + bh / 2 + 4);
          }
        });
      },
    },
    legend: (spec) => [
      { label: spec.leftLabel, color: spec.leftColor, toggleable: false },
      { label: spec.rightLabel, color: spec.rightColor, toggleable: false },
    ],
  },
];
