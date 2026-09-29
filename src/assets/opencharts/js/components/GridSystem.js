/**
 * GridSystem.js
 * Draws the background grid (horizontal and/or vertical lines)
 * behind chart geometry. Kept separate from AxisSystem so charts
 * can render grid without axes (e.g. heatmaps) or vice-versa.
 */

export class GridSystem {

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  constructor(renderer) {
    this._r = renderer;
  }

  /**
   * Draw horizontal grid lines (one per Y tick).
   *
   * @param {Object}   opts
   * @param {number[]} opts.ticks    Y tick values in data-space
   * @param {Object}   opts.scale    LinearScale (Y)
   * @param {Object}   opts.layout   Chart layout
   * @param {Object}   [opts.style]
   */
  drawHorizontal({ ticks, scale, layout, style = {} }) {
    const s = { ...DEFAULTS, ...style };
    const { plotX, plotY, plotWidth, plotHeight } = layout;

    for (const tick of ticks) {
      const py = scale.toPixel(tick);
      if (py < plotY - 1 || py > plotY + plotHeight + 1) continue;

      this._r.line({
        x1: plotX, y1: py,
        x2: plotX + plotWidth, y2: py,
        color: tick === 0 ? s.zeroColor : s.color,
        width: tick === 0 ? s.zeroWidth : s.width,
        dash:  s.dash,
      });
    }
  }

  /**
   * Draw vertical grid lines (one per X tick / band centre).
   *
   * @param {Object}   opts
   * @param {number[]} opts.positions  Pixel x positions
   * @param {Object}   opts.layout
   * @param {Object}   [opts.style]
   */
  drawVertical({ positions, layout, style = {} }) {
    const s = { ...DEFAULTS, ...style };
    const { plotY, plotHeight } = layout;

    for (const px of positions) {
      this._r.line({
        x1: px, y1: plotY,
        x2: px, y2: plotY + plotHeight,
        color: s.color, width: s.width, dash: s.dash,
      });
    }
  }

  /**
   * Draw a full grid (horizontal + vertical) in one call.
   */
  draw({ yTicks, yScale, xPositions = [], layout, style = {} }) {
    this.drawHorizontal({ ticks: yTicks, scale: yScale, layout, style });
    if (xPositions.length) {
      this.drawVertical({ positions: xPositions, layout, style });
    }
  }
}

const DEFAULTS = {
  color:     'rgba(128,128,128,0.1)',
  width:     1,
  dash:      [],
  zeroColor: 'rgba(128,128,128,0.3)',
  zeroWidth: 1,
};