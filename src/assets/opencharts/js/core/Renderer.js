/**
 * Renderer.js
 * Low-level canvas drawing primitives.
 *
 * All chart types use this class for every canvas operation.
 * It wraps the raw 2D context, adds state management helpers,
 * and provides a typed API that avoids repetitive ctx.save/restore chains.
 *
 * Rule: Renderer methods are STATELESS from the caller's perspective.
 * Every method that changes context state must save/restore around it.
 */

export class Renderer {

  /** @param {CanvasRenderingContext2D} ctx */
  constructor(ctx) {
    this._ctx   = ctx;
    this._stack = [];  // manual save/restore stack for complex paths
  }

  /* ─────────────────────────────────────────────
   * Canvas management
   * ───────────────────────────────────────────── */

  /** Wipe the entire canvas */
  clear(width, height) {
    this._ctx.clearRect(0, 0, width, height);
  }

  /** Save context state — pair with restore() */
  save() {
    this._ctx.save();
    return this;
  }

  /** Restore last saved context state */
  restore() {
    this._ctx.restore();
    return this;
  }

  /* ─────────────────────────────────────────────
   * Lines & paths
   * ───────────────────────────────────────────── */

  /**
   * Draw a straight line between two points.
   * @param {LineOptions} opts
   */
  line({ x1, y1, x2, y2, color = '#888', width = 1, dash = [] }) {
    const ctx = this._ctx;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = width;
    ctx.setLineDash(dash);
    ctx.lineCap     = 'round';
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Stroke a polyline (array of {x, y} points).
   * @param {PolylineOptions} opts
   */
  polyline({ points, color = '#888', width = 2, dash = [], cap = 'round', join = 'round' }) {
    if (!points || points.length < 2) return;
    const ctx = this._ctx;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = width;
    ctx.lineCap     = cap;
    ctx.lineJoin    = join;
    ctx.setLineDash(dash);
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Stroke a smooth Bézier curve through a set of points.
   * Uses Catmull-Rom → cubic Bézier conversion (tension 0.4).
   * @param {CurveOptions} opts
   */
  curve({ points, color = '#888', width = 2, dash = [], tension = 0.4 }) {
    if (!points || points.length < 2) return;
    const ctx = this._ctx;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = width;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.setLineDash(dash);
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] ?? points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] ?? p2;

      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }

    ctx.stroke();
    ctx.restore();
  }

  /**
   * Fill the area under a curve (or polyline) down to a baseline.
   * Shares path logic with curve()/polyline() — call after drawing the line.
   * @param {AreaOptions} opts
   */
  area({ points, baseY, fillColor, tension = 0.4, smooth = true }) {
    if (!points || points.length < 2) return;
    const ctx = this._ctx;
    ctx.save();
    ctx.beginPath();

    if (smooth) {
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] ?? points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] ?? p2;
        const cp1x = p1.x + (p2.x - p0.x) * tension;
        const cp1y = p1.y + (p2.y - p0.y) * tension;
        const cp2x = p2.x - (p3.x - p1.x) * tension;
        const cp2y = p2.y - (p3.y - p1.y) * tension;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }
    } else {
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
    }

    // Close the area path along the baseline
    const last = points[points.length - 1];
    ctx.lineTo(last.x, baseY);
    ctx.lineTo(points[0].x, baseY);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.restore();
  }

  /* ─────────────────────────────────────────────
   * Rectangles
   * ───────────────────────────────────────────── */

  /**
   * Fill and/or stroke a rectangle with optional corner rounding.
   * @param {RectOptions} opts
   */
  rect({ x, y, width, height, fillColor, strokeColor, strokeWidth = 1, radius = 0 }) {
    if (width === 0 || height === 0) return;
    const ctx = this._ctx;
    ctx.save();
    ctx.beginPath();

    if (radius > 0) {
      roundRect(ctx, x, y, width, height, radius);
    } else {
      ctx.rect(x, y, width, height);
    }

    if (fillColor) {
      ctx.fillStyle = fillColor;
      ctx.fill();
    }
    if (strokeColor) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth   = strokeWidth;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ─────────────────────────────────────────────
   * Circles & arcs
   * ───────────────────────────────────────────── */

  /**
   * Fill and/or stroke a circle.
   * @param {CircleOptions} opts
   */
  circle({ cx, cy, r, fillColor, strokeColor, strokeWidth = 1 }) {
    const ctx = this._ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (fillColor) { ctx.fillStyle = fillColor; ctx.fill(); }
    if (strokeColor) { ctx.strokeStyle = strokeColor; ctx.lineWidth = strokeWidth; ctx.stroke(); }
    ctx.restore();
  }

  /**
   * Draw a pie/doughnut arc segment.
   * @param {ArcOptions} opts
   */
  arc({ cx, cy, r, innerR = 0, startAngle, endAngle, fillColor, strokeColor, strokeWidth = 1 }) {
    const ctx = this._ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    if (innerR > 0) {
      ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
    } else {
      ctx.lineTo(cx, cy);
    }
    ctx.closePath();
    if (fillColor) { ctx.fillStyle = fillColor; ctx.fill(); }
    if (strokeColor) { ctx.strokeStyle = strokeColor; ctx.lineWidth = strokeWidth; ctx.stroke(); }
    ctx.restore();
  }

  /* ─────────────────────────────────────────────
   * Text
   * ───────────────────────────────────────────── */

  /**
   * Render a single-line text label.
   * @param {TextOptions} opts
   */
  text({
    x, y,
    content,
    color     = '#888',
    size      = 12,
    family    = "'IBM Plex Sans', sans-serif",
    weight    = '400',
    align     = 'left',    // 'left' | 'center' | 'right'
    baseline  = 'middle',  // 'top' | 'middle' | 'bottom' | 'alphabetic'
    maxWidth  = undefined,
  }) {
    if (!content && content !== 0) return;
    const ctx = this._ctx;
    ctx.save();
    ctx.fillStyle    = color;
    ctx.font         = `${weight} ${size}px ${family}`;
    ctx.textAlign    = align;
    ctx.textBaseline = baseline;
    ctx.fillText(String(content), x, y, maxWidth);
    ctx.restore();
  }

  /**
   * Measure a text string's rendered width (no draw).
   * @returns {number} pixel width
   */
  measureText(content, size = 12, family = "'IBM Plex Sans', sans-serif", weight = '400') {
    const ctx = this._ctx;
    ctx.save();
    ctx.font = `${weight} ${size}px ${family}`;
    const w = ctx.measureText(String(content)).width;
    ctx.restore();
    return w;
  }

  /* ─────────────────────────────────────────────
   * Grid helpers
   * ───────────────────────────────────────────── */

  /**
   * Draw a full horizontal grid line across the plot area.
   */
  gridLineH({ x, y, width, color = 'rgba(128,128,128,0.12)', dash = [] }) {
    this.line({ x1: x, y1: y, x2: x + width, y2: y, color, width: 1, dash });
  }

  /**
   * Draw a full vertical grid line across the plot area.
   */
  gridLineV({ x, y, height, color = 'rgba(128,128,128,0.12)', dash = [] }) {
    this.line({ x1: x, y1: y, x2: x, y2: y + height, color, width: 1, dash });
  }

  /* ─────────────────────────────────────────────
   * Clipping
   * ───────────────────────────────────────────── */

  /**
   * Apply a rectangular clip region.
   * Call restore() when done to remove the clip.
   */
  clipRect({ x, y, width, height }) {
    this._ctx.save();
    this._ctx.beginPath();
    this._ctx.rect(x, y, width, height);
    this._ctx.clip();
    return this;  // caller must call restore() when done
  }

  /* ─────────────────────────────────────────────
   * Gradient factories
   * ───────────────────────────────────────────── */

  /**
   * Create a vertical linear gradient (top → bottom).
   * @param {number} x  horizontal position (for the gradient object)
   * @param {number} y  top y
   * @param {number} h  height
   * @param {string} colorTop    CSS color at y
   * @param {string} colorBottom CSS color at y+h
   * @returns {CanvasGradient}
   */
  linearGradientV(x, y, h, colorTop, colorBottom) {
    const grad = this._ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, colorTop);
    grad.addColorStop(1, colorBottom);
    return grad;
  }

  /**
   * Create a horizontal linear gradient (left → right).
   */
  linearGradientH(x, y, w, colorLeft, colorRight) {
    const grad = this._ctx.createLinearGradient(x, y, x + w, y);
    grad.addColorStop(0, colorLeft);
    grad.addColorStop(1, colorRight);
    return grad;
  }

  /* ─────────────────────────────────────────────
   * Tick marks
   * ───────────────────────────────────────────── */

  /**
   * Draw a small tick mark on an axis.
   * @param {'x'|'y'} axis
   */
  tick({ axis, x, y, size = 4, color = 'rgba(128,128,128,0.5)' }) {
    if (axis === 'x') {
      this.line({ x1: x, y1: y, x2: x, y2: y + size, color, width: 1 });
    } else {
      this.line({ x1: x - size, y1: y, x2: x, y2: y, color, width: 1 });
    }
  }

  /* ─────────────────────────────────────────────
   * Dot / data point marker
   * ───────────────────────────────────────────── */

  /**
   * Draw a filled circle marker at a data point.
   */
  dot({ x, y, r = 4, fillColor = '#fff', strokeColor = '#888', strokeWidth = 2 }) {
    this.circle({ cx: x, cy: y, r, fillColor, strokeColor, strokeWidth });
  }

  /* ─────────────────────────────────────────────
   * Raw context access (escape hatch)
   * ───────────────────────────────────────────── */

  /** Direct context access for complex operations not covered above */
  get raw() { return this._ctx; }
}

/* ─────────────────────────────────────────────────
 * Internal helper: polyfill for ctx.roundRect
 * (Safari < 15.4 doesn't support it natively)
 * ──────────────────────────────────────────────── */

function roundRect(ctx, x, y, w, h, r) {
  const maxR = Math.min(Math.abs(w) / 2, Math.abs(h) / 2);
  r = Math.min(r, maxR);

  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }

  // Manual fallback
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}