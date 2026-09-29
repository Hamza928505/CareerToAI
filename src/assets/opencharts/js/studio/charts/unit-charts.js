/**
 * Charts that count rather than measure.
 *
 * A bar encodes a quantity as a length you compare against another length.
 * These four encode it as a number of *things* — words sized by frequency,
 * dots you can count, gate marks, digits kept as digits. That trades precision
 * of comparison for something a bar cannot do: the reader can see the units,
 * and in the stem-and-leaf they can read the original numbers straight back
 * off the chart.
 *
 * All four are canvas, dependency-free, and read a plain two-column table.
 */

import { C } from '../palette.js';
import { HISTOGRAM_VALUES } from './_data.js';

/** See "One build function, two outputs" — this rides along in `helpers`. */
function inkColor(color, alpha) {
  if (!color) return 'rgba(128,128,128,' + alpha + ')';
  const hex = color.replace('#', '');
  const n = parseInt(hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
}

/**
 * Place words along an outward spiral, keeping whichever position lands clear.
 *
 * Deliberately deterministic — no random jitter anywhere — because the same
 * spec has to draw the same cloud in the studio, in the gallery tile and in
 * the code somebody exported. A layout that reshuffled on every render would
 * make the export a different chart from the one they copied.
 *
 * Heaviest first, so the words that matter get the middle and the light ones
 * fill in around them.
 */
function layoutCloud(ctx, words, W, H, minSize, maxSize, padding, font) {
  const weights = words.map((w) => Number(w.weight) || 0);
  const lo = Math.min.apply(null, weights);
  const hi = Math.max.apply(null, weights);
  const sizeOf = (w) => (hi === lo ? (minSize + maxSize) / 2
    : minSize + ((Number(w.weight) || 0) - lo) / (hi - lo) * (maxSize - minSize));

  const order = words.slice().sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0));
  const placed = [];
  const cx = W / 2;
  const cy = H / 2;

  order.forEach((w) => {
    const fs = sizeOf(w);
    ctx.font = Math.round(fs) + 'px ' + font;
    const tw = ctx.measureText(String(w.label)).width;
    const th = fs;
    for (let step = 0; step < 3000; step++) {
      const a = step * 0.22;
      const rad = 2.1 * a;
      const x = cx + rad * Math.cos(a) - tw / 2;
      const y = cy + rad * 0.58 * Math.sin(a) - th / 2;
      const box = {
        x: x - padding, y: y - padding, w: tw + padding * 2, h: th + padding * 2,
      };
      if (box.x < 2 || box.y < 2 || box.x + box.w > W - 2 || box.y + box.h > H - 2) continue;
      let clash = false;
      for (let i = 0; i < placed.length; i++) {
        const p = placed[i];
        if (box.x < p.x + p.w && box.x + box.w > p.x
          && box.y < p.y + p.h && box.y + box.h > p.y) { clash = true; break; }
      }
      if (clash) continue;
      placed.push({
        x: box.x, y: box.y, w: box.w, h: box.h,
        tx: x, ty: y + th * 0.78, size: fs,
        label: w.label, weight: w.weight, color: w.color,
      });
      return;
    }
  });
  return placed;
}

/** The words a cloud opens on — support-ticket subjects for one quarter. */
const CLOUD_WORDS = [
  ['refund', 184], ['shipping', 152], ['password', 141], ['invoice', 128],
  ['delivery', 119], ['login', 104], ['cancel', 96], ['damaged', 88],
  ['tracking', 81], ['discount', 74], ['returns', 69], ['address', 63],
  ['payment', 58], ['upgrade', 52], ['missing', 47], ['warranty', 43],
  ['exchange', 38], ['coupon', 34], ['duplicate', 30], ['sizing', 27],
  ['courier', 24], ['receipt', 21], ['renewal', 18], ['bundle', 15],
  ['gift card', 13], ['stock', 11], ['import duty', 9], ['newsletter', 7],
];

/** Where a fleet's downtime went last month, in whole days. */
const MATRIX_ITEMS = [
  ['Scheduled service', 34], ['Awaiting parts', 26], ['Tyre damage', 18],
  ['Electrical fault', 12], ['Accident repair', 8], ['Inspection', 5],
];

/** Species counted on a river survey — the classic tally sheet. */
const TALLY_ITEMS = [
  ['Mallard', 23], ['Coot', 17], ['Moorhen', 12],
  ['Heron', 6], ['Kingfisher', 3], ['Grebe', 9],
];

export const unitCharts = [
  /* ── Word cloud ────────────────────────────────────────────────────────── */
  {
    id: 'word-cloud',
    title: 'Word Cloud',
    category: 'Comparison',
    blurb: 'Words sized by their count. Fast to read the top few terms, and honest about nothing below them.',
    tags: ['word cloud', 'tag cloud', 'text', 'frequency', 'terms', 'wordle'],
    spec: {
      words: CLOUD_WORDS.map(([label, weight], i) => ({
        label,
        weight,
        color: [C.green, C.blue, C.amber, C.violet, C.cyan, C.rose][i % 6],
      })),
      opts: {
        textColor: '#808080',
        minSize: 11,
        maxSize: 52,
        padding: 3,
        colorBy: 'rank',
        flat: C.green,
      },
    },
    controls: [
      { group: 'Size', type: 'slider', key: 'opts.minSize', label: 'Smallest word', min: 7, max: 22, step: 1, format: (v) => v + 'px' },
      { group: 'Size', type: 'slider', key: 'opts.maxSize', label: 'Largest word', min: 20, max: 90, step: 2, format: (v) => v + 'px' },
      { group: 'Size', type: 'slider', key: 'opts.padding', label: 'Spacing', min: 0, max: 10, step: 1, format: (v) => v + 'px' },
      { group: 'Colour', type: 'seg', key: 'opts.colorBy', label: 'Colour',
        options: [{ value: 'rank', label: 'Per word' }, { value: 'flat', label: 'One colour' }] },
      { group: 'Colour', type: 'color', key: 'opts.flat', label: 'Single colour' },
      { group: 'Colour', type: 'colors', key: 'words', label: 'Word colours', names: (s) => (s.words || []).map((w) => w.label) },
      { group: 'Labels', type: 'color', key: 'opts.textColor', label: 'Text colour' },
    ],
    canvas: {
      height: 400,
      helpers: [inkColor, layoutCloud],
      draw(ctx, spec, W, H, env) {
        const tip = (env && env.tip) || function () {};
        const compact = env && env.compact;
        const o = spec.opts;
        const words = (spec.words || []).filter((w) => w && w.label !== '');
        if (!words.length) return;

        const font = '"DM Sans", system-ui, sans-serif';
        const scale = compact ? 0.55 : 1;
        const placed = layoutCloud(ctx, words, W, H,
          o.minSize * scale, o.maxSize * scale, o.padding, font);

        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        placed.forEach((p) => {
          ctx.font = Math.round(p.size) + 'px ' + font;
          ctx.fillStyle = o.colorBy === 'flat' ? o.flat : (p.color || o.flat);
          ctx.fillText(String(p.label), p.tx, p.ty);
          tip(p.x, p.y, p.w, p.h, p.label + ' — ' + p.weight);
        });

        // A word that never found a clear spot is missing from the chart, and
        // silence about that is how a cloud lies about its own contents.
        const dropped = words.length - placed.length;
        if (dropped > 0 && !compact) {
          ctx.font = '10px "DM Mono", ui-monospace, monospace';
          ctx.fillStyle = inkColor(o.textColor, 0.7);
          ctx.textAlign = 'right';
          ctx.fillText(dropped + ' did not fit', W - 8, H - 8);
        }
      },
    },
    legend: () => null,
    metrics: (spec) => {
      const words = spec.words || [];
      const total = words.reduce((n, w) => n + (Number(w.weight) || 0), 0);
      const top = words.reduce((m, w) => ((Number(w.weight) || 0) > (Number(m.weight) || 0) ? w : m), words[0] || {});
      return [
        { label: 'Terms', value: words.length },
        { label: 'Total', value: total.toLocaleString() },
        { label: 'Top term', value: top.label || '—' },
      ];
    },
  },

  /* ── Dot matrix ────────────────────────────────────────────────────────── */
  {
    id: 'dot-matrix',
    title: 'Dot Matrix',
    category: 'Part to Whole',
    blurb: 'One dot per unit, blocked by category. The count is there to be counted rather than estimated off an axis.',
    tags: ['dot matrix', 'unit chart', 'dot plot', 'counts', 'isotype', 'part to whole'],
    spec: {
      items: MATRIX_ITEMS.map(([label, value], i) => ({
        label,
        value,
        color: [C.green, C.blue, C.amber, C.violet, C.cyan, C.rose][i % 6],
      })),
      opts: {
        textColor: '#808080',
        perDot: 1,
        radius: 5,
        gap: 5,
        rows: 5,
        unit: 'days',
        showCounts: true,
      },
    },
    controls: [
      { group: 'Data', type: 'series', key: 'items', data: false, max: 10, min: 1 },
      { group: 'Dots', type: 'slider', key: 'opts.perDot', label: 'Units per dot', min: 1, max: 20, step: 1 },
      { group: 'Dots', type: 'slider', key: 'opts.rows', label: 'Dots per column', min: 2, max: 12, step: 1 },
      { group: 'Dots', type: 'slider', key: 'opts.radius', label: 'Dot size', min: 2, max: 12, step: 1, format: (v) => v + 'px' },
      { group: 'Dots', type: 'slider', key: 'opts.gap', label: 'Dot spacing', min: 2, max: 14, step: 1, format: (v) => v + 'px' },
      { group: 'Labels', type: 'text', key: 'opts.unit', label: 'Unit name' },
      { group: 'Labels', type: 'toggle', key: 'opts.showCounts', label: 'Print the totals' },
      { group: 'Labels', type: 'color', key: 'opts.textColor', label: 'Text colour' },
    ],
    canvas: {
      height: 380,
      helpers: [inkColor],
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const compact = env && env.compact;
        const o = spec.opts;
        const items = spec.items || [];
        if (!items.length) return;

        const labelW = compact ? 0 : 128;
        const pad = { t: compact ? 8 : 16, r: 14, b: 10, l: compact ? 10 : 14 };
        const bandH = (H - pad.t - pad.b) / items.length;
        const step = o.radius * 2 + o.gap;
        const rows = Math.max(1, Math.min(o.rows, Math.floor(bandH / step)));

        ctx.textBaseline = 'middle';
        items.forEach((it, i) => {
          const top = pad.t + bandH * i;
          const dots = Math.max(0, Math.round((Number(it.value) || 0) / Math.max(1, o.perDot)));
          const x0 = pad.l + labelW;

          if (!compact) {
            ctx.fillStyle = ink(0.95);
            ctx.font = '12px "DM Sans", system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(it.label, pad.l + labelW - 12, top + bandH / 2);
          }

          ctx.fillStyle = it.color;
          for (let d = 0; d < dots; d++) {
            const col = Math.floor(d / rows);
            const row = d % rows;
            const cx = x0 + o.radius + col * step;
            const cy = top + o.radius + row * step;
            if (cx > W - pad.r) break;
            ctx.beginPath();
            ctx.arc(cx, cy, o.radius, 0, Math.PI * 2);
            ctx.fill();
          }

          if (o.showCounts && !compact) {
            const cols = Math.ceil(dots / rows);
            ctx.fillStyle = ink(0.75);
            ctx.font = '11px "DM Mono", ui-monospace, monospace';
            ctx.textAlign = 'left';
            ctx.fillText(String(it.value), Math.min(W - pad.r - 30, x0 + cols * step + 8),
              top + bandH / 2);
          }

          tip(0, top, W, bandH, it.label + ' — ' + it.value + ' ' + o.unit
            + '\n' + dots + (dots === 1 ? ' dot' : ' dots')
            + ' at ' + o.perDot + ' ' + o.unit + ' each');
        });
      },
    },
    legend: (spec) => (spec.items || []).map((it) => ({ label: it.label, color: it.color })),
    metrics: (spec) => {
      const items = spec.items || [];
      const total = items.reduce((n, it) => n + (Number(it.value) || 0), 0);
      return [
        { label: 'Total', value: total + ' ' + spec.opts.unit },
        { label: 'Categories', value: items.length },
        { label: 'Per dot', value: spec.opts.perDot },
      ];
    },
  },

  /* ── Tally chart ───────────────────────────────────────────────────────── */
  {
    id: 'tally-chart',
    title: 'Tally Chart',
    category: 'Comparison',
    blurb: 'Counts as five-bar gates, the way they were written down in the field. Exact for small numbers, useless for large ones.',
    tags: ['tally', 'gate marks', 'counts', 'field notes', 'frequency', 'five bar'],
    spec: {
      items: TALLY_ITEMS.map(([label, value], i) => ({
        label,
        value,
        color: [C.green, C.blue, C.amber, C.violet, C.cyan, C.rose][i % 6],
      })),
      opts: {
        textColor: '#808080',
        markHeight: 22,
        markGap: 6,
        groupGap: 14,
        lineWidth: 2.4,
        showCounts: true,
      },
    },
    controls: [
      { group: 'Data', type: 'series', key: 'items', data: false, max: 10, min: 1 },
      { group: 'Marks', type: 'slider', key: 'opts.markHeight', label: 'Mark height', min: 10, max: 40, step: 2, format: (v) => v + 'px' },
      { group: 'Marks', type: 'slider', key: 'opts.markGap', label: 'Mark spacing', min: 3, max: 14, step: 1, format: (v) => v + 'px' },
      { group: 'Marks', type: 'slider', key: 'opts.groupGap', label: 'Gap between gates', min: 6, max: 30, step: 2, format: (v) => v + 'px' },
      { group: 'Marks', type: 'slider', key: 'opts.lineWidth', label: 'Stroke width', min: 1, max: 5, step: 0.2, format: (v) => v + 'px' },
      { group: 'Labels', type: 'toggle', key: 'opts.showCounts', label: 'Print the totals' },
      { group: 'Labels', type: 'color', key: 'opts.textColor', label: 'Text colour' },
    ],
    canvas: {
      height: 340,
      helpers: [inkColor],
      draw(ctx, spec, W, H, env) {
        const ink = (a) => inkColor(spec.opts.textColor, a);
        const tip = (env && env.tip) || function () {};
        const compact = env && env.compact;
        const o = spec.opts;
        const items = spec.items || [];
        if (!items.length) return;

        const labelW = compact ? 0 : 110;
        const pad = { t: compact ? 6 : 14, r: 40, b: 10, l: compact ? 8 : 14 };
        const bandH = (H - pad.t - pad.b) / items.length;
        const h = Math.min(o.markHeight, bandH - 8);

        ctx.lineCap = 'round';
        ctx.textBaseline = 'middle';
        items.forEach((it, i) => {
          const cy = pad.t + bandH * i + bandH / 2;
          const top = cy - h / 2;
          const count = Math.max(0, Math.round(Number(it.value) || 0));
          let x = pad.l + labelW;

          if (!compact) {
            ctx.fillStyle = ink(0.95);
            ctx.font = '12px "DM Sans", system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(it.label, pad.l + labelW - 12, cy);
          }

          ctx.strokeStyle = it.color;
          ctx.lineWidth = o.lineWidth;
          for (let n = 0; n < count; n++) {
            const inGate = n % 5;
            if (inGate === 0 && n) x += o.groupGap;
            if (x > W - pad.r) break;
            ctx.beginPath();
            if (inGate === 4) {
              // The fifth mark is struck across the four before it.
              ctx.moveTo(x - o.markGap * 4 - 3, cy + h / 2 - 2);
              ctx.lineTo(x - 1, cy - h / 2 + 2);
            } else {
              ctx.moveTo(x, top);
              ctx.lineTo(x, top + h);
            }
            ctx.stroke();
            x += o.markGap;
          }

          if (o.showCounts) {
            ctx.fillStyle = ink(0.8);
            ctx.font = '12px "DM Mono", ui-monospace, monospace';
            ctx.textAlign = 'left';
            ctx.fillText(String(count), Math.min(W - pad.r + 8, x + 10), cy);
          }

          tip(0, pad.t + bandH * i, W, bandH, it.label + ' — ' + count
            + '\n' + Math.floor(count / 5) + ' full gates and ' + (count % 5) + ' over');
        });
      },
    },
    legend: () => null,
    metrics: (spec) => {
      const items = spec.items || [];
      return [
        { label: 'Total', value: items.reduce((n, it) => n + (Number(it.value) || 0), 0) },
        { label: 'Categories', value: items.length },
      ];
    },
  },

  /* ── Stem and leaf ─────────────────────────────────────────────────────── */
  {
    id: 'stem-leaf',
    title: 'Stem & Leaf Plot',
    category: 'Distribution',
    blurb: 'A histogram that keeps the digits. The bars are made of the numbers themselves, so nothing is rounded away.',
    tags: ['stem and leaf', 'stemplot', 'distribution', 'digits', 'histogram', 'exploratory'],
    spec: {
      groups: [{
        label: 'Customer age',
        color: C.green,
        values: HISTOGRAM_VALUES.slice(),
      }],
      opts: {
        textColor: '#808080',
        unit: 10,
        rowHeight: 18,
        leafSize: 12,
        sortLeaves: true,
        showCounts: true,
      },
      dataMode: 'observations',
    },
    controls: [
      { group: 'Stems', type: 'slider', key: 'opts.unit', label: 'Stem size', min: 1, max: 100, step: 1 },
      { group: 'Stems', type: 'toggle', key: 'opts.sortLeaves', label: 'Sort the leaves' },
      { group: 'Stems', type: 'toggle', key: 'opts.showCounts', label: 'Show the count per stem' },
      { group: 'Style', type: 'slider', key: 'opts.rowHeight', label: 'Row height', min: 12, max: 34, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.leafSize', label: 'Leaf size', min: 8, max: 20, step: 1, format: (v) => v + 'px' },
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
        const groups = (spec.groups || []).filter((g) => g && g.values && g.values.length);
        if (!groups.length) return;

        const unit = Math.max(1, Math.round(o.unit));
        // Leaves are coloured by the batch they came from, so two or three
        // groups can share one set of stems and still be told apart.
        const leaves = [];
        groups.forEach((g, gi) => {
          g.values.forEach((raw) => {
            const v = Number(raw);
            if (!Number.isFinite(v)) return;
            leaves.push({ stem: Math.floor(v / unit), leaf: Math.abs(v % unit), v: v, g: gi });
          });
        });
        if (!leaves.length) return;

        const stems = [];
        const lo = Math.min.apply(null, leaves.map((l) => l.stem));
        const hi = Math.max.apply(null, leaves.map((l) => l.stem));
        for (let s = lo; s <= hi; s++) {
          const mine = leaves.filter((l) => l.stem === s);
          if (o.sortLeaves) mine.sort((a, b) => a.leaf - b.leaf || a.g - b.g);
          stems.push({ stem: s, leaves: mine });
        }

        const pad = { t: compact ? 8 : 26, r: 12, b: 10, l: compact ? 24 : 56 };
        const rowH = Math.min(o.rowHeight, (H - pad.t - pad.b) / Math.max(1, stems.length));
        const leafW = o.leafSize * 0.72;

        if (!compact) {
          ctx.fillStyle = ink(0.7);
          ctx.font = '10px "DM Sans", system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText('stem', pad.l - 12, pad.t - 10);
          ctx.textAlign = 'left';
          ctx.fillText('leaves — one digit per observation', pad.l + 12, pad.t - 10);
        }

        ctx.strokeStyle = ink(0.3);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.l, pad.t - 2);
        ctx.lineTo(pad.l, pad.t + rowH * stems.length);
        ctx.stroke();

        ctx.textBaseline = 'middle';
        stems.forEach((row, i) => {
          const cy = pad.t + rowH * i + rowH / 2;

          ctx.fillStyle = ink(0.95);
          ctx.font = (compact ? 9 : 12) + 'px "DM Mono", ui-monospace, monospace';
          ctx.textAlign = 'right';
          ctx.fillText(String(row.stem), pad.l - 8, cy);

          ctx.textAlign = 'left';
          ctx.font = o.leafSize + 'px "DM Mono", ui-monospace, monospace';
          let x = pad.l + 8;
          for (let k = 0; k < row.leaves.length; k++) {
            if (x > W - pad.r - 20) {
              ctx.fillStyle = ink(0.55);
              ctx.fillText('+' + (row.leaves.length - k), x, cy);
              break;
            }
            const l = row.leaves[k];
            ctx.fillStyle = (groups[l.g] && groups[l.g].color) || ink(0.9);
            ctx.fillText(String(l.leaf), x, cy);
            x += leafW;
          }

          if (o.showCounts && !compact) {
            ctx.fillStyle = ink(0.5);
            ctx.font = '10px "DM Mono", ui-monospace, monospace';
            ctx.textAlign = 'right';
            ctx.fillText('n=' + row.leaves.length, W - 6, cy);
          }

          const from = row.stem * unit;
          tip(0, pad.t + rowH * i, W, rowH,
            row.stem + ' | ' + row.leaves.map((l) => l.leaf).join(' ')
            + '\n' + from + '–' + (from + unit - 1)
            + ' — ' + row.leaves.length
            + (row.leaves.length === 1 ? ' observation' : ' observations'));
        });
      },
    },
    legend: (spec) => {
      const groups = (spec.groups || []).filter((g) => g && g.values && g.values.length);
      return groups.length > 1 ? groups.map((g) => ({ label: g.label, color: g.color })) : null;
    },
    metrics: (spec) => {
      const all = (spec.groups || []).reduce((acc, g) => acc.concat(g.values || []), [])
        .map(Number).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
      if (!all.length) return [];
      return [
        { label: 'Observations', value: all.length },
        { label: 'Median', value: all[Math.floor(all.length / 2)] },
        { label: 'Range', value: all[0] + '–' + all[all.length - 1] },
      ];
    },
  },
];
