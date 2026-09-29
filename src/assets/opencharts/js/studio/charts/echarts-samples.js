export const echartsSamples = [
  {
    id: 'echarts-heatmap',
    title: 'ECharts Heatmap',
    category: 'Distribution',
    blurb: 'A row-by-column grid with colour for the value, rendered by Apache ECharts.',
    tags: ['echarts', 'heatmap', 'matrix', 'grid'],
    spec: {
      rows: ['Saturday', 'Friday', 'Thursday'],
      cols: ['12a', '1a', '2a', '3a', '4a', '5a'],
      cells: [
        { x: 0, y: 0, v: 5 }, { x: 1, y: 0, v: 1 }, { x: 2, y: 0, v: 0 },
        { x: 3, y: 0, v: 0 }, { x: 4, y: 0, v: 0 }, { x: 5, y: 0, v: 0 },
        { x: 0, y: 1, v: 3 }, { x: 1, y: 1, v: 2 }, { x: 2, y: 1, v: 0 },
        { x: 3, y: 1, v: 0 }, { x: 4, y: 1, v: 0 }, { x: 5, y: 1, v: 0 },
        { x: 0, y: 2, v: 1 }, { x: 1, y: 2, v: 0 }, { x: 2, y: 2, v: 0 },
        { x: 3, y: 2, v: 0 }, { x: 4, y: 2, v: 0 }, { x: 5, y: 2, v: 0 },
      ],
      dataMode: 'cells',
    },
    controls: [],
    echarts: {
      height: 400,
      build(spec, env) {
        const cells = (spec.cells || []).map((c) => [c.x, c.y, c.v]);
        const max = cells.reduce((m, c) => Math.max(m, Number(c[2]) || 0), 0) || 1;
        return {
          tooltip: { position: 'top' },
          grid: { height: '80%', top: '10%' },
          xAxis: { type: 'category', data: spec.cols || [], splitArea: { show: true } },
          yAxis: { type: 'category', data: spec.rows || [], splitArea: { show: true } },
          visualMap: {
            min: 0,
            max,
            calculable: true,
            orient: 'horizontal',
            left: 'center',
            bottom: '0%',
          },
          series: [
            {
              name: 'Value',
              type: 'heatmap',
              data: cells,
              label: { show: true },
              emphasis: {
                itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' },
              },
            },
          ],
        };
      },
    },
  },
];
