/**
 * Radar and scatter-family chart definitions (Chart.js).
 */

import { C, withAlpha } from '../palette.js';
import { SCATTER_POINTS, SCATTER_CLUSTERS } from './_data.js';
import { baseOpts, yAxis, rAxis, TICK, seriesLegend } from '../chartjs-base.js';
import { tickFormat } from '../serialize.js';

const radarControls = [
  { group: 'Data',  type: 'labels', key: 'labels', label: 'Axis labels' },
  { group: 'Data',  type: 'series', key: 'series', data: true, max: 5 },
  { group: 'Style', type: 'toggle', key: 'opts.fill', label: 'Fill the shape' },
  { group: 'Style', type: 'slider', key: 'opts.fillAlpha', label: 'Fill opacity', min: 0.05, max: 0.6, step: 0.05,
    format: (v) => Math.round(v * 100) + '%' },
  { group: 'Style', type: 'slider', key: 'opts.lineWidth', label: 'Line width', min: 1, max: 5, step: 0.5,
    format: (v) => v + 'px' },
  { group: 'Style', type: 'slider', key: 'opts.pointRadius', label: 'Point size', min: 0, max: 9, step: 1,
    format: (v) => v + 'px' },
  { group: 'Axis',  type: 'slider', key: 'opts.max', label: 'Axis maximum', min: 20, max: 200, step: 10 },
];

function buildRadar(spec) {
  const o = spec.opts;
  return {
    type: 'radar',
    data: {
      labels: spec.labels,
      datasets: spec.series.map((s) => ({
        label: s.label,
        data: s.data,
        borderColor: s.color,
        backgroundColor: o.fill ? withAlpha(s.color, o.fillAlpha) : 'transparent',
        pointBackgroundColor: s.color,
        pointBorderColor: s.color,
        borderWidth: o.lineWidth,
        pointRadius: o.pointRadius,
        pointHoverRadius: o.pointRadius + 2,
        fill: o.fill,
      })),
    },
    options: baseOpts({
      interaction: { intersect: false, mode: 'nearest' },
      scales: { r: rAxis({ max: o.max, ticks: { stepSize: Math.round(o.max / 5), font: { size: 10 }, color: '#8a8880', backdropColor: 'transparent' } }) },
    }),
  };
}

export const radarCharts = [
  {
    id: 'radar-single',
    title: 'Radar',
    category: 'Radar',
    blurb: 'One profile across several dimensions. Good for shape, poor for exact values.',
    tags: ['radar', 'spider', 'profile', 'scorecard'],
    spec: {
      labels: ['Quality', 'Speed', 'Value', 'Support', 'UX', 'Reliability'],
      series: [{ label: 'Score', color: C.green, data: [82, 74, 68, 90, 78, 85] }],
      opts: { fill: true, fillAlpha: 0.18, lineWidth: 2, pointRadius: 5, max: 100 },
    },
    controls: radarControls,
    chartjs: { build: buildRadar },
    legend: (spec) => seriesLegend(spec, true),
  },

  {
    id: 'radar-multi',
    title: 'Radar — Comparison',
    category: 'Radar',
    blurb: 'Overlaid profiles. Three is the practical ceiling before the shapes stop separating.',
    tags: ['radar', 'spider', 'compare', 'competitors'],
    spec: {
      labels: ['Quality', 'Speed', 'Price', 'Support', 'UX', 'Reliability'],
      series: [
        { label: 'Our product',  color: C.green, data: [82, 74, 68, 90, 78, 85] },
        { label: 'Competitor A', color: C.amber,  data: [70, 80, 75, 65, 82, 72] },
        { label: 'Competitor B', color: C.blue,   data: [65, 70, 85, 70, 68, 78] },
      ],
      opts: { fill: true, fillAlpha: 0.12, lineWidth: 2, pointRadius: 4, max: 100 },
    },
    controls: radarControls,
    chartjs: { build: buildRadar },
    legend: (spec) => seriesLegend(spec, true),
  },

  {
    id: 'radar-filled',
    title: 'Radar — Filled',
    category: 'Radar',
    blurb: 'A single strongly filled profile, when the silhouette is the whole message.',
    tags: ['radar', 'filled', 'skills', 'team'],
    spec: {
      labels: ['Frontend', 'Backend', 'DevOps', 'Data', 'Security', 'Testing'],
      series: [{ label: 'Team average', color: C.blue, data: [85, 78, 62, 70, 55, 80] }],
      opts: { fill: true, fillAlpha: 0.38, lineWidth: 2.5, pointRadius: 5, max: 100 },
    },
    controls: radarControls,
    chartjs: { build: buildRadar },
    legend: (spec) => seriesLegend(spec, true),
  },
];

/* ── Scatter family ──────────────────────────────────────────────────────── */

const scatterAxisControls = [
  { group: 'Axis', type: 'text',   key: 'opts.xTitle', label: 'X axis title' },
  { group: 'Axis', type: 'text',   key: 'opts.yTitle', label: 'Y axis title' },
  { group: 'Axis', type: 'slider', key: 'opts.xMax',   label: 'X maximum', min: 20, max: 400, step: 10 },
  { group: 'Axis', type: 'slider', key: 'opts.yMax',   label: 'Y maximum', min: 5,  max: 200, step: 5  },
];

function scatterScales(spec) {
  const o = spec.opts;
  return {
    x: yAxis({
      min: o.xMin ?? 0,
      max: o.xMax,
      title: o.xTitle ? { display: true, text: o.xTitle, font: { size: 11 }, color: '#8a8880' } : { display: false },
      ticks: { ...TICK, callback: tickFormat({ prefix: o.xPrefix, suffix: o.xSuffix }) },
    }),
    y: yAxis({
      min: o.yMin ?? 0,
      max: o.yMax,
      title: o.yTitle ? { display: true, text: o.yTitle, font: { size: 11 }, color: '#8a8880' } : { display: false },
      ticks: { ...TICK, callback: tickFormat({ prefix: o.yPrefix, suffix: o.ySuffix }) },
    }),
  };
}

export const scatterCharts = [
  {
    id: 'scatter-basic',
    title: 'Scatter',
    category: 'Scatter',
    blurb: 'Two measures per item. The eye reads correlation from the cloud, not from any one dot.',
    tags: ['scatter', 'correlation', 'xy', 'price rating'],
    spec: {
      points: [...SCATTER_POINTS],
      label: 'Product',
      color: C.green,
      opts: { pointRadius: 5, alpha: 0.55, xMin: 0, xMax: 260, yMin: 2, yMax: 5.2, xTitle: 'Price ($)', yTitle: 'Rating', xPrefix: '$', ySuffix: '' },
    },
    controls: [
      { group: 'Series', type: 'text',  key: 'label', label: 'Series name' },
      { group: 'Style', type: 'colors', key: 'pointColor', label: 'Point colour' },
      { group: 'Style', type: 'slider', key: 'opts.pointRadius', label: 'Point size', min: 2, max: 12, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.alpha', label: 'Point opacity', min: 0.15, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      ...scatterAxisControls,
    ],
    onInit(spec) { spec.pointColor = [spec.color]; },
    onChange(spec) { spec.color = spec.pointColor[0]; },
    chartjs: {
      build(spec) {
        const o = spec.opts;
        const points = spec.points;
        return {
          type: 'scatter',
          data: {
            datasets: [{
              label: spec.label,
              data: points,
              backgroundColor: withAlpha(spec.color, o.alpha),
              borderColor: spec.color,
              borderWidth: 0,
              pointRadius: o.pointRadius,
              pointHoverRadius: o.pointRadius + 2,
            }],
          },
          options: baseOpts({
            interaction: { intersect: true, mode: 'nearest' },
            scales: scatterScales(spec),
          }),
        };
      },
    },
    legend: () => null,
  },

  {
    id: 'scatter-clusters',
    title: 'Scatter — Clusters',
    category: 'Scatter',
    blurb: 'Segments given their own colour, so the groups separate without a legend hunt.',
    tags: ['scatter', 'clusters', 'segments', 'customers'],
    spec: {
      groups: SCATTER_CLUSTERS.map((g, i) => ({
        ...g, color: [C.green, C.blue, C.amber, C.violet, C.cyan][i % 5],
      })),
      opts: { pointRadius: 6, alpha: 0.65, xMin: 0, xMax: 100, yMin: 0, yMax: 100, xTitle: 'Avg order value ($)', yTitle: 'Purchase frequency' },
    },
    controls: [
      { group: 'Series', type: 'series', key: 'groups', data: false, max: 5, min: 1 },
      { group: 'Style', type: 'slider', key: 'opts.pointRadius', label: 'Point size', min: 2, max: 12, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.alpha', label: 'Point opacity', min: 0.15, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      ...scatterAxisControls,
    ],
    onChange(spec) {
      // A group added from the sidebar starts empty; give it one point so the
      // chart still renders and there is something to drag in the data editor.
      spec.groups.forEach((g, i) => {
        if (!g.points || !g.points.length) g.points = [{ x: 30 + i * 18, y: 30 + i * 15 }];
      });
    },
    chartjs: {
      build: (spec) => ({
        type: 'scatter',
        data: {
          datasets: spec.groups.map((g, i) => ({
            label: g.label,
            data: g.points,
            backgroundColor: withAlpha(g.color, spec.opts.alpha),
            borderColor: g.color,
            borderWidth: 0,
            pointRadius: spec.opts.pointRadius,
            pointHoverRadius: spec.opts.pointRadius + 2,
          })),
        },
        options: baseOpts({
          interaction: { intersect: true, mode: 'nearest' },
          scales: scatterScales(spec),
        }),
      }),
    },
    legend: (spec) => spec.groups.map((g, i) => ({ label: g.label, color: g.color, datasetIndex: i })),
  },

  {
    id: 'bubble',
    title: 'Bubble',
    category: 'Scatter',
    blurb: 'A scatter with a third measure in the radius. Area encodes size — never diameter.',
    tags: ['bubble', 'scatter', 'three variables', 'margin'],
    spec: {
      groups: [
        { label: 'Women',  color: C.green, points: [{ x: 68, y: 42, r: 22 }, { x: 45, y: 55, r: 14 }, { x: 80, y: 35, r: 10 }] },
        { label: 'Men',    color: C.blue,   points: [{ x: 52, y: 38, r: 18 }, { x: 30, y: 60, r: 12 }, { x: 70, y: 48, r: 8 }] },
        { label: 'Living', color: C.amber,  points: [{ x: 38, y: 65, r: 9 },  { x: 60, y: 30, r: 15 }, { x: 20, y: 50, r: 7 }] },
      ],
      opts: { alpha: 0.62, scale: 1, xMin: 0, xMax: 100, yMin: 0, yMax: 100, xTitle: 'Revenue contribution (%)', yTitle: 'Gross margin (%)' },
    },
    controls: [
      { group: 'Data',  type: 'series', key: 'groups', data: false, max: 5, min: 1 },
      { group: 'Style', type: 'slider', key: 'opts.scale', label: 'Bubble scale', min: 0.4, max: 2.2, step: 0.1, format: (v) => v.toFixed(1) + '×' },
      { group: 'Style', type: 'slider', key: 'opts.alpha', label: 'Fill opacity', min: 0.15, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      ...scatterAxisControls,
    ],
    onChange(spec) {
      spec.groups.forEach((g, i) => {
        if (!Array.isArray(g.points)) {
          g.points = [{ x: 30 + i * 12, y: 40 + i * 8, r: 12 }, { x: 55 + i * 8, y: 30 + i * 10, r: 9 }];
        }
      });
    },
    chartjs: {
      build: (spec) => ({
        type: 'bubble',
        data: {
          datasets: spec.groups.map((g) => ({
            label: g.label,
            data: g.points.map((p) => ({ x: p.x, y: p.y, r: +(p.r * spec.opts.scale).toFixed(1) })),
            backgroundColor: withAlpha(g.color, spec.opts.alpha),
            borderColor: g.color,
            borderWidth: 1,
          })),
        },
        options: baseOpts({
          layout: { padding: 20 },
          interaction: { intersect: true, mode: 'nearest' },
          scales: scatterScales(spec),
          plugins: { tooltip: { callbacks: { label: (ctx) => ' ' + ctx.dataset.label + ': ' + ctx.parsed.x + ', ' + ctx.parsed.y + ' (r ' + ctx.raw.r + ')' } } },
        }),
      }),
    },
    legend: (spec) => spec.groups.map((g, i) => ({ label: g.label, color: g.color, datasetIndex: i })),
  },
];
