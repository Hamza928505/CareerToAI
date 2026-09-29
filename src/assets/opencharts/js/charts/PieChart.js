/**
 * PieChart.js
 * Pie and doughnut chart extending BaseChart.
 *
 * Features: pie | doughnut modes, centre stat, animated sweep,
 *            hover explode, percentage and value labels, legend.
 */

import { BaseChart }     from '../core/BaseChart.js';
import { TooltipSystem } from '../components/TooltipSystem.js';
import { LegendSystem }  from '../components/LegendSystem.js';
import { contrastColor, lighten, PALETTE } from '../utils/color.js';

const TAU = Math.PI * 2;
const START = -Math.PI / 2;   // start at top

export class PieChart extends BaseChart {

  getDefaultConfig() {
    return {
      mode:           'pie',     // 'pie' | 'doughnut'
      cutout:         0.58,      // doughnut hole ratio (0 = pie)
      showLabels:     true,      // slice percentage labels
      showLegend:     true,
      explodeHover:   true,      // offset slice outward on hover
      explodeAmount:  12,        // px offset
      centreText:     '',        // text shown in doughnut hole
      centreSubtext:  '',
      padding:        { top: 20, right: 20, bottom: 20, left: 20 },
      animation:      { enabled: true, duration: 800, easing: 'easeOutCubic' },
    };
  }

  /* ── processData ─────────────────────────────── */
  processData() {
    const raw = this._data.datasets?.[0]?.data
             ?? this._data.data
             ?? [];
    this._rawValues = raw.map((v) => Number(v) || 0).filter((v) => v > 0);
    this._labels    = this._data.labels?.slice(0, this._rawValues.length) ?? [];
    this._colors    = (this._data.datasets?.[0]?.colors
                    ?? this._data.colors
                    ?? PALETTE).slice(0, this._rawValues.length);

    // Preserve existing hidden state across update() calls
    const prevHidden = new Set(
      (this._slices ?? []).map((s, i) => s.hidden ? i : -1).filter((i) => i >= 0)
    );

    // Compute fractions excluding hidden slices
    const visible = this._rawValues.filter((_, i) => !prevHidden.has(i));
    const total   = visible.reduce((s, v) => s + v, 0) || 1;
    this._fractions = this._rawValues.map((v, i) =>
      prevHidden.has(i) ? 0 : v / total
    );

    // Initialise hover only once (first call — _slices doesn't exist yet)
    if (this._hoveredIndex === undefined) this._hoveredIndex = -1;
    // Preserve _hiddenSlices set for computeLayout
    this._hiddenSlices = prevHidden;
  }

  /* ── computeLayout ───────────────────────────── */
  computeLayout() {
    const { plotX, plotY, plotWidth, plotHeight } = this._layout;
    this._cx = plotX + plotWidth  / 2;
    this._cy = plotY + plotHeight / 2;
    this._r  = Math.min(plotWidth, plotHeight) / 2 - 8;

    const hidden = this._hiddenSlices ?? new Set();

    // Build slice angle table (hidden slices get zero sweep)
    this._slices = [];
    let angle = START;
    this._fractions.forEach((frac, i) => {
      const sweep = frac * TAU;
      this._slices.push({
        startAngle: angle,
        endAngle:   angle + sweep,
        midAngle:   angle + sweep / 2,
        frac,
        value:      this._rawValues[i],
        color:      this._colors[i] ?? PALETTE[i % PALETTE.length],
        label:      this._labels[i] ?? `Slice ${i + 1}`,
        hidden:     hidden.has(i),
      });
      angle += sweep;
    });
  }

  /* ── drawChart ───────────────────────────────── */
  drawChart() {
    if (!this._slices?.length) return;
    const p   = this.progress;
    const cfg = this._config;
    const r   = this._renderer;
    const innerR = cfg.mode === 'doughnut' ? this._r * cfg.cutout : 0;

    // Animated sweep (0→full using progress)
    const totalSweep = TAU * p;
    let drawn = 0;

    this._slices.forEach((s, i) => {
      const sliceSweep = s.frac * TAU;
      const visibleSweep = Math.min(sliceSweep, Math.max(0, totalSweep - drawn));
      drawn += sliceSweep;
      if (visibleSweep <= 0) return;

      const isHovered = i === this._hoveredIndex && p >= 1;
      const explode   = isHovered && cfg.explodeHover ? cfg.explodeAmount : 0;
      const cx = this._cx + Math.cos(s.midAngle) * explode;
      const cy = this._cy + Math.sin(s.midAngle) * explode;

      const fillColor = isHovered ? lighten(s.color, 0.12) : s.color;

      r.arc({
        cx, cy,
        r:          this._r,
        innerR,
        startAngle: s.startAngle,
        endAngle:   s.startAngle + visibleSweep,
        fillColor,
        strokeColor: 'rgba(15,15,23,0.6)',
        strokeWidth: 2,
      });

      // Percentage label (only when fully animated)
      if (cfg.showLabels && p >= 1 && s.frac > 0.04) {
        const labelR = innerR > 0
          ? innerR + (this._r - innerR) * 0.6
          : this._r * 0.65;
        const lx = cx + Math.cos(s.midAngle) * labelR;
        const ly = cy + Math.sin(s.midAngle) * labelR;
        r.text({
          x: lx, y: ly,
          content:  Math.round(s.frac * 100) + '%',
          color:    contrastColor(s.color),
          size:     Math.max(10, Math.min(13, this._r * 0.1)),
          weight:   '600',
          align:    'center',
          baseline: 'middle',
        });
      }
    });

    // Centre text (doughnut)
    if (cfg.mode === 'doughnut' && p >= 0.9) {
      const opacity = (p - 0.9) / 0.1;
      if (cfg.centreText) {
        r.text({ x: this._cx, y: this._cy - 8,
          content: cfg.centreText, color: `rgba(232,232,240,${opacity})`,
          size: 26, weight: '600', align: 'center', baseline: 'middle' });
      }
      if (cfg.centreSubtext) {
        r.text({ x: this._cx, y: this._cy + 16,
          content: cfg.centreSubtext, color: `rgba(136,136,153,${opacity})`,
          size: 11, align: 'center', baseline: 'middle' });
      }
    }
  }

  /* ── Hit test ────────────────────────────────── */
  _buildHitTest() {
    return (cx, cy) => {
      if (!this._slices?.length) return null;
      const dx = cx - this._cx, dy = cy - this._cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const innerR = this._config.mode === 'doughnut' ? this._r * this._config.cutout : 0;
      if (dist < innerR || dist > this._r + this._config.explodeAmount) return null;

      let angle = Math.atan2(dy, dx);
      if (angle < START) angle += TAU;

      // Find which slice this angle falls in
      for (let i = 0; i < this._slices.length; i++) {
        const s     = this._slices[i];
        let start   = s.startAngle;
        let end     = s.endAngle;
        // Normalise to same domain as `angle`
        if (start < START) { start += TAU; end += TAU; }
        if (angle >= start && angle <= end) {
          const prev = this._hoveredIndex;
          this._hoveredIndex = i;
          if (prev !== i) { this._computeLayout(); this._drawFrame(); }
          return {
            label: s.label,
            x: cx, y: cy,
            items: [{
              datasetLabel: s.label,
              value: `${s.value.toLocaleString()} (${Math.round(s.frac * 100)}%)`,
              color: s.color,
              x: null, y: null,
            }],
          };
        }
      }

      if (this._hoveredIndex !== -1) {
        this._hoveredIndex = -1;
        this._computeLayout(); this._drawFrame();
      }
      return null;
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
    this._legend.render(
      this._slices.map((s) => ({ label: s.label, color: s.color, borderColor: s.color }))
    );
    this._legend.onChange((index, hidden) => {
      // Persist hidden state in the durable set so update() preserves it
      if (!this._hiddenSlices) this._hiddenSlices = new Set();
      if (hidden) {
        this._hiddenSlices.add(index);
      } else {
        this._hiddenSlices.delete(index);
      }
      // Recompute fractions excluding all hidden slices
      const total = this._rawValues.reduce(
        (s, v, i) => s + (this._hiddenSlices.has(i) ? 0 : v), 0
      ) || 1;
      this._fractions = this._rawValues.map((v, i) =>
        this._hiddenSlices.has(i) ? 0 : v / total
      );
      // Recompute layout and redraw (no full update() to avoid resetting hover)
      this._computeLayout();
      this._drawFrame();
    });
    return this;
  }
}