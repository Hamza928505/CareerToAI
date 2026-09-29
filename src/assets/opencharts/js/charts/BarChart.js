/**
 * BarChart.js
 * Full bar chart extending BaseChart.
 *
 * Modes: vertical | horizontal | stacked | grouped (default)
 * Features: rounded corners, value labels, animation (grow from baseline),
 *            tooltip, legend, click events.
 */

import { BaseChart }     from '../core/BaseChart.js';
import { LayoutEngine }  from '../core/LayoutEngine.js';
import { AxisSystem }    from '../components/AxisSystem.js';
import { GridSystem }    from '../components/GridSystem.js';
import { TooltipSystem } from '../components/TooltipSystem.js';
import { LegendSystem }  from '../components/LegendSystem.js';
import { normaliseDatasets, stackedBases } from '../utils/data.js';
import { inRect }        from '../utils/math.js';
import { withAlpha }     from '../utils/color.js';

export class BarChart extends BaseChart {

  getDefaultConfig() {
    return {
      mode:         'grouped',   // 'grouped' | 'stacked' | 'horizontal'
      radius:       5,           // bar corner radius px
      barPadding:   0.22,        // gap ratio between bars (0–1)
      groupPadding: 0.12,        // gap ratio between groups
      showValues:   false,       // show value labels on bars
      valuePrefix:  '',
      valueSuffix:  '',
      lineWidth:    0,
      padding: { top: 28, right: 24, bottom: 48, left: 58 },
      yAxis: { ticks: 5, prefix: '', suffix: '', title: '' },
      xAxis: { title: '', maxLabels: 14 },
      animation: { enabled: true, duration: 650, easing: 'easeOutCubic' },
    };
  }

  /* ── processData ─────────────────────────────── */
  processData() {
    this._datasets = normaliseDatasets(this._data.datasets ?? []);
    this._labels   = this._data.labels ?? [];
    this._visible  = this._datasets.filter((d) => !d.hidden);
    this._hoveredLi = -1;
  }

  /* ── computeLayout ───────────────────────────── */
  computeLayout() {
    const { mode } = this._config;
    const layout   = this._layout;
    const visible  = this._visible;
    if (!visible.length) return;

    const allData  = visible.map((d) => d.data);
    const isStacked = mode === 'stacked';
    const isHoriz  = mode === 'horizontal';

    // Compute data extent
    let rawMin, rawMax;
    if (isStacked) {
      const totals = this._labels.map((_, i) =>
        visible.reduce((s, d) => s + (d.data[i] ?? 0), 0)
      );
      rawMin = Math.min(0, ...totals);
      rawMax = Math.max(...totals);
    } else {
      const flat = allData.flat().filter((v) => v != null && isFinite(v));
      rawMin = Math.min(0, ...flat);
      rawMax = Math.max(...flat);
    }

    const { niceMin, niceMax, ticks } = LayoutEngine.niceLinear(rawMin, rawMax, this._config.yAxis.ticks);
    this._yTicks = ticks;

    if (isHoriz) {
      // Horizontal: data maps to X, categories to Y
      this._scales.x = LayoutEngine.linearScale({
        min: niceMin, max: niceMax,
        pixelMin: layout.plotX,
        pixelMax: layout.plotX + layout.plotWidth,
      });
      this._scales.y = LayoutEngine.bandScale({
        labels:   this._labels,
        pixelMin: layout.plotY,
        pixelMax: layout.plotY + layout.plotHeight,
        padding:  this._config.barPadding,
      });
    } else {
      this._scales.y = LayoutEngine.linearScale({
        min: niceMin, max: niceMax,
        pixelMin: layout.plotY + layout.plotHeight,
        pixelMax: layout.plotY,
      });
      this._scales.x = LayoutEngine.bandScale({
        labels:   this._labels,
        pixelMin: layout.plotX,
        pixelMax: layout.plotX + layout.plotWidth,
        padding:  this._config.barPadding,
      });
    }

    // Stacked bases per dataset
    this._bases = isStacked ? stackedBases(visible.map((d) => d.data)) : null;

    // Hit-rect cache (rebuilt each frame in drawChart)
    this._hitRects = [];
  }

  /* ── drawChart ───────────────────────────────── */
  drawChart() {
    if (!this._scales.y) return;
    const { mode } = this._config;
    const isHoriz  = mode === 'horizontal';
    const isStacked= mode === 'stacked';
    const p        = this.progress;
    const layout   = this._layout;
    const r        = this._renderer;
    const cfg      = this._config;

    // Grid
    if (!this._grid) this._grid = new GridSystem(r);
    if (!isHoriz) {
      this._grid.drawHorizontal({ ticks: this._yTicks, scale: this._scales.y, layout });
    } else {
      const xTicks = AxisSystem.autoTicks(this._scales.x, cfg.yAxis.ticks);
      this._grid.drawVertical({
        positions: xTicks.map((t) => this._scales.x.toPixel(t)),
        layout,
      });
    }

    // Axes
    if (!this._axis) this._axis = new AxisSystem(r);
    if (!isHoriz) {
      this._axis.drawY({ scale: this._scales.y, ticks: this._yTicks, layout,
        style: { prefix: cfg.yAxis.prefix, suffix: cfg.yAxis.suffix, title: cfg.yAxis.title } });
      this._axis.drawX({ bandScale: this._scales.x, labels: this._labels, layout,
        style: { title: cfg.xAxis.title }, maxLabels: cfg.xAxis.maxLabels });
    } else {
      const xTicks = AxisSystem.autoTicks(this._scales.x, cfg.yAxis.ticks);
      this._axis.drawY({ scale: this._scales.x, ticks: xTicks, layout,
        style: { prefix: cfg.yAxis.prefix, suffix: cfg.yAxis.suffix } });
      this._axis.drawX({ bandScale: this._scales.y, labels: this._labels, layout });
    }

    this._hitRects = [];
    const baselineY = this._scales.y?.toPixel?.(0) ?? (layout.plotY + layout.plotHeight);

    // Draw bars
    this._labels.forEach((_, li) => {
      const groupCount  = isStacked ? 1 : this._visible.length;
      const bandW       = this._scales[isHoriz ? 'y' : 'x'].barWidth;
      const barW        = isStacked ? bandW : bandW / groupCount;
      const groupStartX = this._scales[isHoriz ? 'y' : 'x'].bandStart(li);

      this._visible.forEach((ds, di) => {
        const val  = ds.data[li] ?? 0;
        const base = isStacked ? (this._bases[di][li] ?? 0) : 0;
        // Hover: lighten the hovered group with a semi-transparent overlay
        const isHovered  = this._hoveredLi === li;
        const fillColor  = isHovered ? withAlpha(ds.color, 0.75) : ds.color;
        const strokeCol  = isHovered ? ds.color : undefined;

        if (isHoriz) {
          const y  = groupStartX + (isStacked ? 0 : di * barW);
          const x0 = this._scales.x.toPixel(base);
          const x1 = this._scales.x.toPixel(base + val * p);
          const bx = Math.min(x0, x1);
          const bw = Math.abs(x1 - x0);
          const bh = barW - 2;

          r.rect({ x: bx, y, width: bw, height: bh,
            fillColor, strokeColor: strokeCol, strokeWidth: 1.5,
            radius: Math.min(cfg.radius, bw / 2, bh / 2) });
          this._hitRects.push({ x: bx, y, w: bw, h: bh, di, li, val });

          if (cfg.showValues && bw > 28) {
            r.text({ x: bx + bw + 4, y: y + bh / 2,
              content: cfg.valuePrefix + val + cfg.valueSuffix,
              color: '#aaa', size: 10, align: 'left', baseline: 'middle' });
          }
        } else {
          const x     = groupStartX + (isStacked ? 0 : di * barW);
          const y1    = this._scales.y.toPixel(base + val);
          const y0    = isStacked ? this._scales.y.toPixel(base) : baselineY;
          const animH = Math.abs(y0 - y1) * p;
          const top   = val >= 0 ? y0 - animH : y0;
          const bh    = animH;
          const bw    = barW - 2;

          r.rect({ x, y: top, width: bw, height: bh,
            fillColor, strokeColor: strokeCol, strokeWidth: 1.5,
            radius: Math.min(cfg.radius, bw / 2, bh / 2) });
          this._hitRects.push({ x, y: top, w: bw, h: bh, di, li, val });

          if (cfg.showValues && bh > 16) {
            const labelY = val >= 0 ? top - 5 : top + bh + 12;
            r.text({ x: x + bw / 2, y: labelY,
              content: cfg.valuePrefix + val + cfg.valueSuffix,
              color: '#ccc', size: 10, align: 'center', baseline: 'bottom' });
          }
        }
      });
    });

    // Tooltip highlight overlay
    if (this._tooltip) this._tooltip.drawHighlight(layout);
  }

  /* ── Hit test ────────────────────────────────── */
  _buildHitTest() {
    return (cx, cy) => {
      let hit = null;
      for (const rect of this._hitRects) {
        if (inRect(cx, cy, rect.x, rect.y, rect.w, rect.h)) { hit = rect; break; }
      }

      const newHovered = hit ? hit.li : -1;
      if (newHovered !== this._hoveredLi) {
        this._hoveredLi = newHovered;
        this._drawFrame();
      }

      if (!hit) return null;
      const ds = this._visible[hit.di];
      return {
        label: this._labels[hit.li],
        x: hit.x + hit.w / 2,
        y: hit.y,
        items: this._visible.map((d, di) => {
          const val = d.data[hit.li] ?? '—';
          return {
            datasetLabel: d.label,
            value: this._config.valuePrefix + val + this._config.valueSuffix,
            color: d.color,
            x: null, y: null,
          };
        }),
      };
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