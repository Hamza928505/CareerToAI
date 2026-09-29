/**
 * OpenCharts custom-engine chart definitions.
 *
 * These five run on `js/core` + `js/charts` rather than Chart.js — no external
 * charting dependency at all. The exported code imports the engine classes by
 * relative path, so the Standalone file needs the js/ folder beside it.
 */

import { LineChart } from '../../charts/LineChart.js';
import { BarChart } from '../../charts/BarChart.js';
import { PieChart } from '../../charts/PieChart.js';
import { ScatterChart } from '../../charts/ScatterChart.js';
import { C, MONTHS, QUARTERS } from '../palette.js';

/** The engine takes datasets as { label, data, color }. */
const toDatasets = (series) => series.map((s) => ({
  label: s.label,
  data: s.data,
  color: s.color,
}));

export const engineCharts = [
  {
    id: 'engine-line',
    title: 'Line — Custom Engine',
    category: 'Custom Engine',
    blurb: 'The same line chart with no Chart.js on the page. Canvas, DPR-aware, ~12KB of engine.',
    tags: ['custom engine', 'line', 'no dependency', 'canvas'],
    spec: {
      labels: [...MONTHS],
      series: [
        { label: 'Revenue', color: C.green, data: [185, 210, 198, 240, 275, 310, 295, 330, 285, 320, 355, 410] },
        { label: 'Costs',   color: C.blue,   data: [140, 152, 149, 168, 180, 195, 188, 205, 190, 210, 220, 246] },
      ],
      opts: { smooth: true, tension: 0.4, stepped: false, showArea: false, areaAlpha: 0.15, pointRadius: 4, lineWidth: 2.5, animate: true, yTicks: 5, prefix: '$', suffix: 'K' },
    },
    controls: [
      { group: 'Data',  type: 'labels', key: 'labels', label: 'Category labels' },
      { group: 'Data',  type: 'series', key: 'series', data: true, max: 6 },
      { group: 'Curve', type: 'seg',    key: 'opts.curveMode', label: 'Interpolation',
        options: [{ value: 'smooth', label: 'Smooth' }, { value: 'linear', label: 'Linear' }, { value: 'stepped', label: 'Stepped' }] },
      { group: 'Curve', type: 'slider', key: 'opts.tension', label: 'Tension', min: 0, max: 1, step: 0.05, format: (v) => v.toFixed(2) },
      { group: 'Style', type: 'toggle', key: 'opts.showArea', label: 'Fill area' },
      { group: 'Style', type: 'slider', key: 'opts.areaAlpha', label: 'Fill opacity', min: 0.05, max: 0.6, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'slider', key: 'opts.pointRadius', label: 'Point size', min: 0, max: 10, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.lineWidth', label: 'Line width', min: 1, max: 6, step: 0.5, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.animate', label: 'Animate on load' },
      { group: 'Axis',  type: 'slider', key: 'opts.yTicks', label: 'Y tick count', min: 3, max: 10, step: 1 },
      { group: 'Axis',  type: 'text',   key: 'opts.prefix', label: 'Value prefix' },
      { group: 'Axis',  type: 'text',   key: 'opts.suffix', label: 'Value suffix' },
    ],
    onInit(spec) { spec.opts.curveMode = spec.opts.stepped ? 'stepped' : spec.opts.smooth ? 'smooth' : 'linear'; },
    onChange(spec) {
      const mode = spec.opts.curveMode;
      spec.opts.smooth = mode === 'smooth';
      spec.opts.stepped = mode === 'stepped' ? 'before' : false;
    },
    native: {
      Class: LineChart,
      className: 'LineChart',
      build: (spec) => ({
        data: { labels: spec.labels, datasets: toDatasets(spec.series) },
        config: {
          smooth: spec.opts.smooth,
          tension: spec.opts.tension,
          stepped: spec.opts.stepped,
          showArea: spec.opts.showArea,
          areaAlpha: spec.opts.areaAlpha,
          pointRadius: spec.opts.pointRadius,
          lineWidth: spec.opts.lineWidth,
          yAxis: { ticks: spec.opts.yTicks, prefix: spec.opts.prefix, suffix: spec.opts.suffix },
          animation: { enabled: spec.opts.animate, duration: 700, easing: 'easeOutCubic' },
        },
      }),
    },
    legend: (spec) => spec.series.map((s, i) => ({ label: s.label, color: s.color, line: true, datasetIndex: i })),
  },

  {
    id: 'engine-area',
    title: 'Area — Custom Engine',
    category: 'Custom Engine',
    blurb: 'The engine has no separate area class — it is the line chart with the fill switched on.',
    tags: ['custom engine', 'area', 'fill', 'no dependency'],
    spec: {
      labels: [...MONTHS],
      series: [
        { label: 'Sessions', color: C.blue,   data: [820, 910, 950, 1080, 1120, 1200, 1240, 1300, 1350, 1410, 1460, 1560] },
        { label: 'Signups',  color: C.green, data: [310, 340, 360, 410, 430, 470, 490, 520, 540, 580, 610, 660] },
      ],
      opts: { smooth: true, tension: 0.4, stepped: false, showArea: true, areaAlpha: 0.22, pointRadius: 0, lineWidth: 2, animate: true, yTicks: 5, prefix: '', suffix: '' },
    },
    controls: [
      { group: 'Data',  type: 'labels', key: 'labels', label: 'Category labels' },
      { group: 'Data',  type: 'series', key: 'series', data: true, max: 6 },
      { group: 'Style', type: 'slider', key: 'opts.areaAlpha', label: 'Fill opacity', min: 0.05, max: 0.8, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'slider', key: 'opts.tension', label: 'Tension', min: 0, max: 1, step: 0.05, format: (v) => v.toFixed(2) },
      { group: 'Style', type: 'slider', key: 'opts.pointRadius', label: 'Point size', min: 0, max: 10, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.lineWidth', label: 'Line width', min: 1, max: 6, step: 0.5, format: (v) => v + 'px' },
      { group: 'Style', type: 'toggle', key: 'opts.animate', label: 'Animate on load' },
      { group: 'Axis',  type: 'slider', key: 'opts.yTicks', label: 'Y tick count', min: 3, max: 10, step: 1 },
      { group: 'Axis',  type: 'text',   key: 'opts.suffix', label: 'Value suffix' },
    ],
    native: {
      Class: LineChart,
      className: 'LineChart',
      build: (spec) => ({
        data: { labels: spec.labels, datasets: toDatasets(spec.series) },
        config: {
          smooth: spec.opts.smooth,
          tension: spec.opts.tension,
          showArea: true,
          areaAlpha: spec.opts.areaAlpha,
          pointRadius: spec.opts.pointRadius,
          lineWidth: spec.opts.lineWidth,
          yAxis: { ticks: spec.opts.yTicks, prefix: spec.opts.prefix, suffix: spec.opts.suffix },
          animation: { enabled: spec.opts.animate, duration: 700, easing: 'easeOutCubic' },
        },
      }),
    },
    legend: (spec) => spec.series.map((s, i) => ({ label: s.label, color: s.color, line: true, datasetIndex: i })),
  },

  {
    id: 'engine-bar',
    title: 'Bar — Custom Engine',
    category: 'Custom Engine',
    blurb: 'Grouped, stacked or horizontal from one config key, drawn straight to canvas.',
    tags: ['custom engine', 'bar', 'stacked', 'no dependency'],
    spec: {
      labels: [...QUARTERS],
      series: [
        { label: '2024', color: C.green, data: [520, 680, 740, 910] },
        { label: '2023', color: C.violet,   data: [440, 575, 625, 770] },
      ],
      opts: { mode: 'grouped', radius: 5, barPadding: 0.22, groupPadding: 0.12, showValues: false, animate: true, yTicks: 5, prefix: '$', suffix: 'K' },
    },
    controls: [
      { group: 'Data',  type: 'labels', key: 'labels', label: 'Category labels' },
      { group: 'Data',  type: 'series', key: 'series', data: true, max: 6 },
      { group: 'Layout', type: 'seg',   key: 'opts.mode', label: 'Layout',
        options: [{ value: 'grouped', label: 'Grouped' }, { value: 'stacked', label: 'Stacked' }, { value: 'horizontal', label: 'Bars →' }] },
      { group: 'Style', type: 'slider', key: 'opts.radius', label: 'Corner radius', min: 0, max: 16, step: 1, format: (v) => v + 'px' },
      { group: 'Style', type: 'slider', key: 'opts.barPadding', label: 'Bar gap', min: 0, max: 0.6, step: 0.02, format: (v) => v.toFixed(2) },
      { group: 'Style', type: 'toggle', key: 'opts.showValues', label: 'Show value labels' },
      { group: 'Style', type: 'toggle', key: 'opts.animate', label: 'Animate on load' },
      { group: 'Axis',  type: 'slider', key: 'opts.yTicks', label: 'Y tick count', min: 3, max: 10, step: 1 },
      { group: 'Axis',  type: 'text',   key: 'opts.prefix', label: 'Value prefix' },
      { group: 'Axis',  type: 'text',   key: 'opts.suffix', label: 'Value suffix' },
    ],
    native: {
      Class: BarChart,
      className: 'BarChart',
      build: (spec) => ({
        data: { labels: spec.labels, datasets: toDatasets(spec.series) },
        config: {
          mode: spec.opts.mode,
          radius: spec.opts.radius,
          barPadding: spec.opts.barPadding,
          groupPadding: spec.opts.groupPadding,
          showValues: spec.opts.showValues,
          valuePrefix: spec.opts.prefix,
          valueSuffix: spec.opts.suffix,
          yAxis: { ticks: spec.opts.yTicks, prefix: spec.opts.prefix, suffix: spec.opts.suffix },
          animation: { enabled: spec.opts.animate, duration: 650, easing: 'easeOutCubic' },
        },
      }),
    },
    legend: (spec) => spec.series.map((s, i) => ({ label: s.label, color: s.color, datasetIndex: i })),
  },

  {
    id: 'engine-pie',
    title: 'Pie / Doughnut — Custom Engine',
    category: 'Custom Engine',
    blurb: 'One class covers both, with a centre-text slot the doughnut hole was made for.',
    tags: ['custom engine', 'pie', 'doughnut', 'no dependency'],
    spec: {
      labels: ['Organic', 'Paid', 'Social', 'Direct', 'Referral'],
      series: [
        { label: 'Organic',  color: C.green, data: [40] },
        { label: 'Paid',     color: C.blue,   data: [27] },
        { label: 'Social',   color: C.amber,  data: [15] },
        { label: 'Direct',   color: C.violet,   data: [11] },
        { label: 'Referral', color: C.cyan,  data: [7]  },
      ],
      opts: { mode: 'doughnut', cutout: 0.58, showLabels: true, explodeHover: true, explodeAmount: 12, centreText: '100%', centreSubtext: 'of traffic', animate: true },
    },
    controls: [
      { group: 'Data',   type: 'series', key: 'series', data: true, max: 8, min: 2 },
      { group: 'Layout', type: 'seg',    key: 'opts.mode', label: 'Shape',
        options: [{ value: 'pie', label: 'Pie' }, { value: 'doughnut', label: 'Doughnut' }] },
      { group: 'Layout', type: 'slider', key: 'opts.cutout', label: 'Hole size', min: 0, max: 0.85, step: 0.02, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style',  type: 'toggle', key: 'opts.showLabels', label: 'Show percentage labels' },
      { group: 'Style',  type: 'toggle', key: 'opts.explodeHover', label: 'Lift slice on hover' },
      { group: 'Centre', type: 'text',   key: 'opts.centreText', label: 'Centre text' },
      { group: 'Centre', type: 'text',   key: 'opts.centreSubtext', label: 'Centre subtext' },
    ],
    native: {
      Class: PieChart,
      className: 'PieChart',
      build: (spec, env) => ({
        // The pie engine reads one value per dataset, each its own slice.
        data: {
          labels: spec.series.map((s) => s.label),
          datasets: spec.series.map((s) => ({ label: s.label, data: s.data, color: s.color })),
        },
        config: {
          mode: spec.opts.mode,
          cutout: spec.opts.cutout,
          showLabels: spec.opts.showLabels,
          explodeHover: spec.opts.explodeHover,
          explodeAmount: spec.opts.explodeAmount,
          // The centre block does not scale down, so leave it out of previews.
          centreText: env && env.compact ? '' : spec.opts.centreText,
          centreSubtext: env && env.compact ? '' : spec.opts.centreSubtext,
          animation: { enabled: spec.opts.animate, duration: 800, easing: 'easeOutCubic' },
        },
      }),
    },
    legend: (spec) => spec.series.map((s, i) => ({ label: s.label, color: s.color, datasetIndex: i })),
  },

  {
    id: 'engine-scatter',
    title: 'Scatter — Custom Engine',
    category: 'Custom Engine',
    blurb: 'Points, optional bubble sizing, and a least-squares trend line the engine computes itself.',
    tags: ['custom engine', 'scatter', 'regression', 'no dependency'],
    spec: {
      series: [
        { label: 'High-value', color: C.green, points: [[75, 82], [80, 78], [68, 88], [72, 74], [85, 90], [78, 69], [90, 84], [65, 79]] },
        { label: 'Regular',    color: C.blue,   points: [[45, 48], [50, 42], [38, 55], [42, 39], [55, 52], [48, 61], [35, 44], [52, 46]] },
        { label: 'Occasional', color: C.amber,  points: [[20, 25], [25, 18], [15, 30], [22, 22], [28, 27], [18, 14], [12, 21], [30, 19]] },
      ],
      opts: { mode: 'scatter', pointRadius: 6, showRegression: false, showQuadrants: false, animate: true, xTitle: 'Order value', yTitle: 'Frequency' },
    },
    controls: [
      { group: 'Data',   type: 'series', key: 'series', data: false, max: 5, min: 1 },
      { group: 'Layout', type: 'seg',    key: 'opts.mode', label: 'Mode',
        options: [{ value: 'scatter', label: 'Scatter' }, { value: 'bubble', label: 'Bubble' }] },
      { group: 'Style',  type: 'slider', key: 'opts.pointRadius', label: 'Point size', min: 2, max: 14, step: 1, format: (v) => v + 'px' },
      { group: 'Style',  type: 'toggle', key: 'opts.showRegression', label: 'Trend line' },
      { group: 'Style',  type: 'toggle', key: 'opts.showQuadrants', label: 'Quadrant guides' },
      { group: 'Style',  type: 'toggle', key: 'opts.animate', label: 'Animate on load' },
      { group: 'Axis',   type: 'text',   key: 'opts.xTitle', label: 'X axis title' },
      { group: 'Axis',   type: 'text',   key: 'opts.yTitle', label: 'Y axis title' },
    ],
    onChange(spec) {
      spec.series.forEach((s, i) => {
        if (!Array.isArray(s.points)) {
          s.points = Array.from({ length: 8 }, (_, k) => [20 + i * 20 + k * 3, 25 + i * 18 + (k % 4) * 5]);
        }
      });
    },
    native: {
      Class: ScatterChart,
      className: 'ScatterChart',
      build: (spec) => ({
        data: {
          datasets: spec.series.map((s) => ({
            label: s.label,
            color: s.color,
            data: s.points.map(([x, y]) => ({ x, y })),
          })),
        },
        config: {
          mode: spec.opts.mode,
          pointRadius: spec.opts.pointRadius,
          showRegression: spec.opts.showRegression,
          showQuadrants: spec.opts.showQuadrants,
          xAxis: { title: spec.opts.xTitle },
          yAxis: { title: spec.opts.yTitle },
          animation: { enabled: spec.opts.animate, duration: 700, easing: 'easeOutCubic' },
        },
      }),
    },
    legend: (spec) => spec.series.map((s, i) => ({ label: s.label, color: s.color, datasetIndex: i })),
  },
];
