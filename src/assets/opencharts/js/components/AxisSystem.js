/**
 * AxisSystem.js
 * Renders X and Y axes onto a Renderer instance.
 *
 * Receives pre-computed scale objects from LayoutEngine and tick arrays,
 * then paints: axis line, tick marks, tick labels, and optional grid lines.
 *
 * Designed to be stateless — call draw() with fresh params each frame.
 */

import { LayoutEngine } from '../core/LayoutEngine.js';

export class AxisSystem {

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  constructor(renderer) {
    this._r = renderer;
  }

  /* ─────────────────────────────────────────────
   * Y Axis
   * ───────────────────────────────────────────── */

  /**
   * Draw the Y axis (left side by default).
   *
   * @param {Object} opts
   * @param {Object}   opts.scale       LinearScale from LayoutEngine
   * @param {number[]} opts.ticks       Tick values in data-space
   * @param {Object}   opts.layout      Chart layout object
   * @param {Object}   [opts.style]     Visual overrides
   * @param {Function} [opts.formatter] Tick label formatter fn(value) → string
   * @param {boolean}  [opts.grid]      Draw horizontal grid lines (default true)
   */
  drawY({
    scale,
    ticks,
    layout,
    style = {},
    formatter = null,
    grid = true,
  }) {
    const r = this._r;
    const {
      plotX, plotY, plotWidth, plotHeight, paddingLeft,
    } = layout;

    const axisX   = plotX;
    const s       = { ...Y_DEFAULTS, ...style };
    const fmt     = formatter ?? ((v) => LayoutEngine.formatTick(v, s.prefix, s.suffix));

    for (const tick of ticks) {
      const py = scale.toPixel(tick);

      // Skip ticks outside the plot area
      if (py < plotY - 1 || py > plotY + plotHeight + 1) continue;

      // Grid line
      if (grid && tick !== 0) {
        r.gridLineH({
          x: plotX, y: py, width: plotWidth,
          color: s.gridColor, dash: s.gridDash,
        });
      }

      // Zero line (more prominent if data crosses zero)
      if (tick === 0) {
        r.line({
          x1: plotX, y1: py, x2: plotX + plotWidth, y2: py,
          color: s.zeroLineColor, width: s.zeroLineWidth,
        });
      }

      // Tick mark
      r.tick({ axis: 'y', x: axisX, y: py, size: s.tickSize, color: s.tickColor });

      // Label
      const label = fmt(tick);
      r.text({
        x:        axisX - s.tickSize - s.labelGap,
        y:        py,
        content:  label,
        color:    s.labelColor,
        size:     s.labelSize,
        family:   s.labelFamily,
        align:    'right',
        baseline: 'middle',
      });
    }

    // Axis line
    r.line({
      x1: axisX, y1: plotY,
      x2: axisX, y2: plotY + plotHeight,
      color: s.axisColor, width: s.axisWidth,
    });

    // Optional Y axis title
    if (s.title) {
      const titleX = paddingLeft * 0.35;
      const titleY = plotY + plotHeight / 2;
      r.save();
      r.raw.translate(titleX, titleY);
      r.raw.rotate(-Math.PI / 2);
      r.text({
        x: 0, y: 0, content: s.title,
        color: s.titleColor, size: s.titleSize,
        align: 'center', baseline: 'middle',
      });
      r.restore();
    }
  }

  /* ─────────────────────────────────────────────
   * X Axis
   * ───────────────────────────────────────────── */

  /**
   * Draw the X axis (bottom by default).
   * Supports both linear (numeric) and categorical (label) modes.
   *
   * @param {Object} opts
   * @param {Object|null}  opts.scale      LinearScale (null for categorical)
   * @param {Object|null}  opts.bandScale  BandScale (null for numeric)
   * @param {string[]|number[]} opts.labels  Category labels OR numeric tick values
   * @param {Object}   opts.layout
   * @param {Object}   [opts.style]
   * @param {Function} [opts.formatter]
   * @param {boolean}  [opts.grid]        Draw vertical grid lines (default false)
   * @param {number}   [opts.maxLabels]   Max labels to show (auto-skip if crowded)
   */
  drawX({
    scale = null,
    bandScale = null,
    labels,
    layout,
    style = {},
    formatter = null,
    grid = false,
    maxLabels = 12,
  }) {
    const r = this._r;
    const { plotX, plotY, plotWidth, plotHeight } = layout;
    const axisY = plotY + plotHeight;
    const s     = { ...X_DEFAULTS, ...style };

    const count = labels.length;
    // Determine label-skip interval to avoid crowding
    const skip  = Math.max(1, Math.ceil(count / maxLabels));

    for (let i = 0; i < count; i++) {
      const label = labels[i];
      let px;

      if (bandScale) {
        px = bandScale.bandCentre(i);
      } else if (scale) {
        px = scale.toPixel(typeof label === 'number' ? label : i);
      } else {
        px = plotX + (i / (count - 1 || 1)) * plotWidth;
      }

      // Skip out-of-bounds
      if (px < plotX - 1 || px > plotX + plotWidth + 1) continue;

      // Vertical grid line
      if (grid) {
        r.gridLineV({
          x: px, y: plotY, height: plotHeight,
          color: s.gridColor, dash: s.gridDash,
        });
      }

      // Tick mark
      r.tick({ axis: 'x', x: px, y: axisY, size: s.tickSize, color: s.tickColor });

      // Label (skip if crowded)
      if (i % skip === 0) {
        const fmt = formatter ?? ((v) => String(v));
        r.text({
          x: px, y: axisY + s.tickSize + s.labelGap,
          content:  fmt(label),
          color:    s.labelColor,
          size:     s.labelSize,
          family:   s.labelFamily,
          align:    'center',
          baseline: 'top',
        });
      }
    }

    // Axis line
    r.line({
      x1: plotX, y1: axisY,
      x2: plotX + plotWidth, y2: axisY,
      color: s.axisColor, width: s.axisWidth,
    });

    // Optional X axis title
    if (s.title) {
      r.text({
        x: plotX + plotWidth / 2,
        y: axisY + s.tickSize + s.labelGap + s.labelSize + 10,
        content:  s.title,
        color:    s.titleColor,
        size:     s.titleSize,
        align:    'center',
        baseline: 'top',
      });
    }
  }

  /* ─────────────────────────────────────────────
   * Convenience: auto-ticks from a linear scale
   * ───────────────────────────────────────────── */

  /**
   * Given a LinearScale already created by LayoutEngine.linearScale(),
   * generate evenly spaced tick values within its data range.
   *
   * @param {Object}  scale        LinearScale
   * @param {number}  [target=5]   Desired number of ticks
   * @returns {number[]}
   */
  static autoTicks(scale, target = 5) {
    const { ticks } = LayoutEngine.niceLinear(scale.min, scale.max, target);
    return ticks;
  }
}

/* ─────────────────────────────────────────────────
 * Default styles
 * ──────────────────────────────────────────────── */

const SHARED = {
  axisColor:    'rgba(128,128,128,0.25)',
  axisWidth:    1,
  tickColor:    'rgba(128,128,128,0.4)',
  tickSize:     4,
  labelGap:     4,
  labelSize:    11,
  labelColor:   '#888',
  labelFamily:  "'IBM Plex Sans', sans-serif",
  gridColor:    'rgba(128,128,128,0.1)',
  gridDash:     [],
  titleColor:   '#aaa',
  titleSize:    11,
  title:        '',
};

const Y_DEFAULTS = {
  ...SHARED,
  prefix:         '',
  suffix:         '',
  zeroLineColor:  'rgba(128,128,128,0.35)',
  zeroLineWidth:  1,
};

const X_DEFAULTS = {
  ...SHARED,
};