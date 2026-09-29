/**
 * ScatterChart.js
 * Scatter and bubble chart extending BaseChart.
 *
 * Features: scatter | bubble modes, optional regression line,
 *            quadrant lines, animated point pop-in, tooltip.
 */

import { BaseChart }     from '../core/BaseChart.js';
import { LayoutEngine }  from '../core/LayoutEngine.js';
import { AxisSystem }    from '../components/AxisSystem.js';
import { GridSystem }    from '../components/GridSystem.js';
import { TooltipSystem } from '../components/TooltipSystem.js';
import { LegendSystem }  from '../components/LegendSystem.js';
import { normaliseDatasets } from '../utils/data.js';
import { inCircle }      from '../utils/math.js';
import { withAlpha }     from '../utils/color.js';

export class ScatterChart extends BaseChart {

  getDefaultConfig() {
    return {
      mode:           'scatter',  // 'scatter' | 'bubble'
      pointRadius:    5,
      pointHoverRadius: 8,
      showRegression: false,
      showQuadrants:  false,
      padding: { top: 24, right: 24, bottom: 48, left: 58 },
      yAxis: { ticks: 5, prefix: '', suffix: '', title: '' },
      xAxis: { ticks: 5, prefix: '', suffix: '', title: '' },
      animation: { enabled: true, duration: 700, easing: 'easeOutElastic' },
    };
  }

  /* ── processData ─────────────────────────────── */
  processData() {
    this._datasets = normaliseDatasets(this._data.datasets ?? []);
    this._visible  = this._datasets.filter((d) => !d.hidden);
  }

  /* ── computeLayout ───────────────────────────── */
  computeLayout() {
    const layout   = this._layout;
    const visible  = this._visible;
    if (!visible.length) return;

    const allX = visible.flatMap((d) => d.data.map((p) => p?.x ?? p?.[0] ?? 0));
    const allY = visible.flatMap((d) => d.data.map((p) => p?.y ?? p?.[1] ?? 0));

    const { niceMin: xMin, niceMax: xMax, ticks: xTicks } = LayoutEngine.niceLinear(
      Math.min(...allX), Math.max(...allX), this._config.xAxis.ticks ?? 5
    );
    const { niceMin: yMin, niceMax: yMax, ticks: yTicks } = LayoutEngine.niceLinear(
      Math.min(...allY), Math.max(...allY), this._config.yAxis.ticks
    );

    this._xTicks = xTicks;
    this._yTicks = yTicks;

    this._scales.x = LayoutEngine.linearScale({
      min: xMin, max: xMax,
      pixelMin: layout.plotX,
      pixelMax: layout.plotX + layout.plotWidth,
    });
    this._scales.y = LayoutEngine.linearScale({
      min: yMin, max: yMax,
      pixelMin: layout.plotY + layout.plotHeight,
      pixelMax: layout.plotY,
    });

    // Precompute pixel points
    this._pixelPoints = visible.map((ds) =>
      ds.data.map((pt) => {
        const x = pt?.x ?? pt?.[0] ?? 0;
        const y = pt?.y ?? pt?.[1] ?? 0;
        const r = pt?.r ?? pt?.[2] ?? this._config.pointRadius;
        return {
          px: this._scales.x.toPixel(x),
          py: this._scales.y.toPixel(y),
          r,
          rawX: x, rawY: y,
          label: pt?.label ?? `(${x}, ${y})`,
        };
      })
    );

    if (this._config.showRegression) {
      this._regressionLines = visible.map((ds, di) =>
        computeRegression(this._pixelPoints[di], this._scales.x, this._scales.y, ds.data)
      );
    }
  }

  /* ── drawChart ───────────────────────────────── */
  drawChart() {
    if (!this._scales.x) return;
    const p   = this.progress;
    const cfg = this._config;
    const r   = this._renderer;
    const layout = this._layout;

    // Grid
    if (!this._grid) this._grid = new GridSystem(r);
    this._grid.draw({
      yTicks: this._yTicks, yScale: this._scales.y,
      xPositions: this._xTicks.map((t) => this._scales.x.toPixel(t)),
      layout,
    });

    // Quadrant lines
    if (cfg.showQuadrants) {
      const midX = this._scales.x.toPixel((this._scales.x.min + this._scales.x.max) / 2);
      const midY = this._scales.y.toPixel((this._scales.y.min + this._scales.y.max) / 2);
      r.line({ x1: midX, y1: layout.plotY, x2: midX, y2: layout.plotY + layout.plotHeight,
        color: 'rgba(255,255,255,0.08)', width: 1, dash: [6, 4] });
      r.line({ x1: layout.plotX, y1: midY, x2: layout.plotX + layout.plotWidth, y2: midY,
        color: 'rgba(255,255,255,0.08)', width: 1, dash: [6, 4] });
    }

    // Axes
    if (!this._axis) this._axis = new AxisSystem(r);
    this._axis.drawY({ scale: this._scales.y, ticks: this._yTicks, layout,
      style: { prefix: cfg.yAxis.prefix, suffix: cfg.yAxis.suffix, title: cfg.yAxis.title } });
    this._axis.drawX({ scale: this._scales.x, labels: this._xTicks, layout,
      formatter: (v) => cfg.xAxis.prefix + v + cfg.xAxis.suffix,
      style: { title: cfg.xAxis.title } });

    // Regression lines
    if (cfg.showRegression && this._regressionLines) {
      this._regressionLines.forEach((line, di) => {
        if (!line) return;
        const ds = this._visible[di];
        r.polyline({ points: [line.start, line.end],
          color: withAlpha(ds.color, 0.5), width: 1.5, dash: [5, 3] });
      });
    }

    // Points (animate: pop in with scale 0→1)
    this._visible.forEach((ds, di) => {
      const pts = this._pixelPoints[di];
      pts.forEach((pt, pi) => {
        // Stagger animation per point
        const staggerP = Math.min(1, p * pts.length - pi * 0.5);
        if (staggerP <= 0) return;
        const animR = (cfg.mode === 'bubble' ? pt.r : cfg.pointRadius) * staggerP;

        r.circle({
          cx: pt.px, cy: pt.py, r: animR,
          fillColor:   withAlpha(ds.color, 0.75),
          strokeColor: ds.color,
          strokeWidth: 1.5,
        });
      });
    });

    // Tooltip highlight
    if (this._tooltip) this._tooltip.drawHighlight(layout);
  }

  /* ── Hit test ────────────────────────────────── */
  _buildHitTest() {
    return (cx, cy) => {
      if (!this._pixelPoints) return null;
      let best = null, bestDist = Infinity;

      this._visible.forEach((ds, di) => {
        this._pixelPoints[di]?.forEach((pt) => {
          const d = Math.sqrt((cx - pt.px) ** 2 + (cy - pt.py) ** 2);
          const threshold = (this._config.mode === 'bubble' ? pt.r : this._config.pointRadius) + 8;
          if (d < threshold && d < bestDist) {
            bestDist = d;
            best = {
              label: pt.label,
              x: pt.px, y: pt.py,
              items: [{
                datasetLabel: ds.label,
                value:        `x: ${pt.rawX}  y: ${pt.rawY}`,
                color:        ds.color,
                x: pt.px, y: pt.py,
              }],
            };
          }
        });
      });

      return best;
    };
  }

  onDestroy() {
    this._tooltip?.destroy();
    this._legend?.clear();
  }

  enableTooltip() {
    if (this._tooltip) return this;
    this._tooltip = new TooltipSystem(this._canvas, this._renderer);
    this._tooltip.setHitTest(this._buildHitTest());
    this._tooltip.setRedraw(() => { this._computeLayout(); this._drawFrame(); });
    return this;
  }

  enableLegend(container) {
    if (!container) return this;
    this._legend = new LegendSystem(container);
    this._legend.render(this._datasets);
    this._legend.onChange((index, hidden) => {
      this._datasets[index].hidden = hidden;
      this._visible = this._datasets.filter((d) => !d.hidden);
      this.update();
    });
    return this;
  }
}

/* ── Linear regression helper ─────────────────── */
function computeRegression(pixelPts, scaleX, scaleY, rawData) {
  if (!rawData || rawData.length < 2) return null;
  const xs = rawData.map((p) => p?.x ?? p?.[0] ?? 0);
  const ys = rawData.map((p) => p?.y ?? p?.[1] ?? 0);
  const n  = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  if (den === 0) return null;
  const slope = num / den;
  const intercept = my - slope * mx;
  const yAt = (x) => slope * x + intercept;
  return {
    start: { x: scaleX.pixelMin, y: scaleY.toPixel(yAt(scaleX.min)) },
    end:   { x: scaleX.pixelMax, y: scaleY.toPixel(yAt(scaleX.max)) },
  };
}