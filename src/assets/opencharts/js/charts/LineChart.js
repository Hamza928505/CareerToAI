/**
 * LineChart.js
 * Full line chart implementation extending BaseChart.
 *
 * Features:
 *   - Single and multi-series
 *   - Smooth (Catmull-Rom) or linear mode
 *   - Stepped line mode (before | middle | after)
 *   - Optional area fill per dataset
 *   - Animation: lines grow from left → right
 *   - Tooltip with crosshair and dot highlights
 *   - Legend with click-to-hide
 *   - Null gap support (sparse data)
 *
 * Usage:
 *   const chart = new LineChart('myCanvas', {
 *     data: {
 *       labels:   ['Jan','Feb','Mar'],
 *       datasets: [{ label:'Revenue', data:[100,120,115], color:'#7F77DD' }]
 *     },
 *     smooth:   true,
 *     showArea: true,
 *   });
 */

import { BaseChart }     from '../core/BaseChart.js';
import { LayoutEngine }  from '../core/LayoutEngine.js';
import { AxisSystem }    from '../components/AxisSystem.js';
import { GridSystem }    from '../components/GridSystem.js';
import { TooltipSystem } from '../components/TooltipSystem.js';
import { LegendSystem }  from '../components/LegendSystem.js';
import { normaliseDatasets, sparseFilter } from '../utils/data.js';
import { nearestIndex, inRect } from '../utils/math.js';
import { withAlpha }     from '../utils/color.js';

export class LineChart extends BaseChart {

  /* ─────────────────────────────────────────────
   * Default config (merged on top of BaseChart defaults)
   * ───────────────────────────────────────────── */
  getDefaultConfig() {
    return {
      smooth:    true,       // Catmull-Rom curve vs straight lines
      tension:   0.4,        // Curve tension (0 = linear, 1 = very bendy)
      stepped:   false,      // false | 'before' | 'middle' | 'after'
      showArea:  false,      // fill below each line
      areaAlpha: 0.15,       // fill opacity
      pointRadius: 4,        // px — set 0 to hide points
      lineWidth:   2.5,
      padding: {
        top: 24, right: 24, bottom: 44, left: 56,
      },
      yAxis: {
        ticks:    5,
        prefix:   '',
        suffix:   '',
        title:    '',
      },
      xAxis: {
        title:    '',
        maxLabels: 12,
      },
      animation: {
        enabled:  true,
        duration: 700,
        easing:   'easeOutCubic',
      },
    };
  }

  /* ─────────────────────────────────────────────
   * Lifecycle: processData
   * ───────────────────────────────────────────── */
  processData() {
    this._datasets = normaliseDatasets(this._data.datasets ?? []);
    this._labels   = this._data.labels ?? [];
    this._visibleDatasets = this._datasets.filter((d) => !d.hidden);
  }

  /* ─────────────────────────────────────────────
   * Lifecycle: computeLayout
   * ───────────────────────────────────────────── */
  computeLayout() {
    const layout  = this._layout;
    const visible = this._visibleDatasets;

    // Y scale: nice linear across all dataset values
    const allValues = visible.flatMap((d) => d.data.filter((v) => v != null && isFinite(v)));
    if (!allValues.length) { this._scales.y = null; this._scales.x = null; return; }

    const { niceMin, niceMax, ticks: yTicks } = LayoutEngine.niceLinear(
      Math.min(0, Math.min(...allValues)),
      Math.max(...allValues),
      this._config.yAxis.ticks,
    );

    this._scales.y = LayoutEngine.linearScale({
      min: niceMin, max: niceMax,
      pixelMin: layout.plotY + layout.plotHeight,
      pixelMax: layout.plotY,
    });
    this._yTicks = yTicks;

    // X scale: band / categorical
    this._scales.x = LayoutEngine.bandScale({
      labels:   this._labels,
      pixelMin: layout.plotX,
      pixelMax: layout.plotX + layout.plotWidth,
      padding:  0,  // line charts: centre on label positions (no bar gap)
    });

    // Pre-compute pixel points for each dataset (full progress = 1)
    this._pixelSeries = visible.map((ds) =>
      this._labels.map((_, i) => {
        const v = ds.data[i];
        if (v == null || !isFinite(v)) return null;
        return {
          x: this._scales.x.bandCentre(i),
          y: this._scales.y.toPixel(v),
          value: v,
          label: this._labels[i],
        };
      })
    );
  }

  /* ─────────────────────────────────────────────
   * Lifecycle: drawChart
   * ───────────────────────────────────────────── */
  drawChart() {
    if (!this._scales.y) return;

    const p   = this.progress;   // 0→1 from animation engine
    const cfg = this._config;
    const layout = this._layout;

    // Draw grid
    if (!this._grid) this._grid = new GridSystem(this._renderer);
    this._grid.drawHorizontal({
      ticks: this._yTicks,
      scale: this._scales.y,
      layout,
    });

    // Draw axes
    if (!this._axis) this._axis = new AxisSystem(this._renderer);
    this._axis.drawY({
      scale: this._scales.y,
      ticks: this._yTicks,
      layout,
      style: {
        prefix: cfg.yAxis.prefix,
        suffix: cfg.yAxis.suffix,
        title:  cfg.yAxis.title,
      },
    });
    this._axis.drawX({
      bandScale: this._scales.x,
      labels:    this._labels,
      layout,
      style: { title: cfg.xAxis.title },
      maxLabels: cfg.xAxis.maxLabels,
    });

    // Clip drawing to plot area
    this._renderer.clipRect({
      x:      layout.plotX,
      y:      layout.plotY - 4,
      width:  layout.plotWidth  * p,   // animation: reveal left-to-right
      height: layout.plotHeight + 8,
    });

    // Draw each dataset
    this._visibleDatasets.forEach((ds, di) => {
      const pts = this._pixelSeries[di];
      if (!pts) return;

      // Get non-null consecutive segments (handle sparse data)
      const segments = toSegments(pts);

      segments.forEach(({ points }) => {
        // Area fill (under the line)
        if (cfg.showArea || ds.showArea) {
          const baseY = this._scales.y.toPixel(Math.max(0, this._scales.y.min));
          const fillCol = withAlpha(ds.color, cfg.areaAlpha);

          if (cfg.stepped && cfg.stepped !== false) {
            const steppedPts = toSteppedPoints(points, cfg.stepped);
            this._renderer.area({
              points:    steppedPts,
              baseY,
              fillColor: fillCol,
              smooth:    false,
            });
          } else if (cfg.smooth) {
            this._renderer.area({
              points:    points,
              baseY,
              fillColor: fillCol,
              smooth:    true,
              tension:   cfg.tension,
            });
          } else {
            this._renderer.area({
              points:    points,
              baseY,
              fillColor: fillCol,
              smooth:    false,
            });
          }
        }

        // Line stroke
        if (cfg.stepped && cfg.stepped !== false) {
          const steppedPts = toSteppedPoints(points, cfg.stepped);
          this._renderer.polyline({
            points: steppedPts,
            color:  ds.color,
            width:  cfg.lineWidth,
          });
        } else if (cfg.smooth) {
          this._renderer.curve({
            points:  points,
            color:   ds.color,
            width:   cfg.lineWidth,
            tension: cfg.tension,
          });
        } else {
          this._renderer.polyline({
            points: points,
            color:  ds.color,
            width:  cfg.lineWidth,
          });
        }

        // Data point dots
        if (cfg.pointRadius > 0) {
          points.forEach((pt) => {
            this._renderer.dot({
              x:           pt.x,
              y:           pt.y,
              r:           cfg.pointRadius,
              fillColor:   '#fff',
              strokeColor: ds.color,
              strokeWidth: 2,
            });
          });
        }
      });
    });

    // Restore clip
    this._renderer.restore();

    // Tooltip highlight (drawn on top of clip)
    if (this._tooltip) {
      this._tooltip.drawHighlight(layout);
    }
  }

  /* ─────────────────────────────────────────────
   * Tooltip hit-test
   * ───────────────────────────────────────────── */
  _buildHitTest() {
    return (cx, cy) => {
      const layout = this._layout;
      if (!inRect(cx, cy, layout.plotX, layout.plotY, layout.plotWidth, layout.plotHeight)) {
        return null;
      }

      // Find the nearest X index
      const centres = this._labels.map((_, i) => this._scales.x.bandCentre(i));
      const idx     = nearestIndex(centres, cx);

      const items = this._visibleDatasets.map((ds, di) => {
        const pt = this._pixelSeries[di]?.[idx];
        return {
          datasetLabel: ds.label,
          value:        ds.data[idx] ?? '—',
          color:        ds.color,
          x:            pt?.x ?? null,
          y:            pt?.y ?? null,
        };
      }).filter((it) => it.value !== '—');

      if (!items.length) return null;

      return {
        label: this._labels[idx],
        x:     centres[idx],
        y:     layout.plotY,
        items,
      };
    };
  }

  /* ─────────────────────────────────────────────
   * onResize hook — rebuild pixel series after layout changes
   * ───────────────────────────────────────────── */
  onResize() {
    // computeLayout() is already called by BaseChart before onResize()
    // so pixel series are up to date. Nothing extra needed.
  }

  /* ─────────────────────────────────────────────
   * onDestroy hook
   * ───────────────────────────────────────────── */
  onDestroy() {
    this._tooltip?.destroy();
    this._legend?.clear();
  }

  /* ─────────────────────────────────────────────
   * attachTooltip — call after construction if tooltip is desired
   * ───────────────────────────────────────────── */

  /**
   * Enable the interactive tooltip.
   * @returns {this}  chainable
   */
  enableTooltip() {
    if (this._tooltip) return this;
    this._tooltip = new TooltipSystem(this._canvas, this._renderer, {});
    this._tooltip.setHitTest(this._buildHitTest());
    this._tooltip.setRedraw(() => {
      this._computeLayout();
      this._drawFrame();
    });
    return this;
  }

  /**
   * Enable the DOM legend.
   * @param {HTMLElement} container  Element to render the legend into
   * @returns {this}
   */
  enableLegend(container) {
    if (!container) return this;
    this._legend = new LegendSystem(container);
    // render() returns undefined, so it cannot be chained — call the two
    // steps separately, the way the other chart classes do.
    this._legend.render(this._datasets);
    this._legend.onChange((index, hidden) => {
      this._datasets[index].hidden = hidden;
      this._visibleDatasets = this._datasets.filter((d) => !d.hidden);
      this.update();
    });
    return this;
  }
}

/* ─────────────────────────────────────────────────
 * Internal helpers
 * ──────────────────────────────────────────────── */

/** Split an array of nullable points into consecutive non-null segments */
function toSegments(pts) {
  const segments = [];
  let current    = null;

  pts.forEach((pt) => {
    if (pt !== null) {
      if (!current) { current = { points: [] }; }
      current.points.push(pt);
    } else {
      if (current) { segments.push(current); current = null; }
    }
  });
  if (current) segments.push(current);
  return segments;
}

/**
 * Convert smooth pixel points to a stepped polyline.
 *
 * @param {{ x, y }[]} pts
 * @param {'before'|'middle'|'after'} mode
 * @returns {{ x, y }[]}
 */
function toSteppedPoints(pts, mode) {
  if (pts.length < 2) return pts;
  const out = [];

  for (let i = 0; i < pts.length; i++) {
    const curr = pts[i];
    const next = pts[i + 1];

    if (!next) { out.push(curr); break; }

    if (mode === 'before') {
      // Step happens at the START of the interval (vertical then horizontal)
      out.push(curr);
      out.push({ x: curr.x, y: next.y });
    } else if (mode === 'after') {
      // Step happens at the END of the interval (horizontal then vertical)
      out.push(curr);
      out.push({ x: next.x, y: curr.y });
    } else {
      // 'middle': step happens halfway between points
      const midX = (curr.x + next.x) / 2;
      out.push(curr);
      out.push({ x: midX, y: curr.y });
      out.push({ x: midX, y: next.y });
    }
  }
  return out;
}