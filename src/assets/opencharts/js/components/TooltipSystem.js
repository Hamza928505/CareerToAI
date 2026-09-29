/**
 * TooltipSystem.js
 * Manages mouse/touch interaction and the floating tooltip DOM element.
 *
 * Architecture:
 *   - Listens to pointer events on the canvas
 *   - Calls back into the chart to get the nearest data point(s)
 *   - Renders a styled tooltip <div> positioned next to the cursor
 *   - Draws a crosshair / highlight onto the canvas via the Renderer
 *
 * The chart provides a `hitTest(x, y)` callback that returns hit info.
 */

export class TooltipSystem {

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../core/Renderer.js').Renderer} renderer
   * @param {Object} [options]
   */
  constructor(canvas, renderer, options = {}) {
    this._canvas   = canvas;
    this._renderer = renderer;
    this._opts     = { ...DEFAULTS, ...options };
    this._el       = null;       // tooltip DOM node
    this._active   = false;
    this._hitTest  = null;       // fn(x, y) → HitResult | null
    this._onDraw   = null;       // fn() — triggers chart redraw with highlight
    this._lastHit  = null;

    this._handleMove  = this._handleMove.bind(this);
    this._handleLeave = this._handleLeave.bind(this);

    this._attachListeners();
    this._createDOM();
  }

  /* ─────────────────────────────────────────────
   * Public API
   * ───────────────────────────────────────────── */

  /**
   * Register the hit-test function provided by the chart.
   * Called every time the pointer moves.
   *
   * @param {Function} fn  fn(canvasX, canvasY) → HitResult | null
   *   HitResult: { items: [{ label, value, color, datasetLabel }], x, y }
   */
  setHitTest(fn) { this._hitTest = fn; }

  /**
   * Register a redraw callback. Called when hover state changes
   * so the chart can repaint its highlight overlay.
   */
  setRedraw(fn) { this._onDraw = fn; }

  /** Current hover hit result (null if not hovering) */
  get hit() { return this._lastHit; }

  /**
   * Draw the crosshair / highlight for the current hit.
   * The chart calls this from inside its drawChart() method.
   *
   * @param {Object} layout  Chart layout object
   */
  drawHighlight(layout) {
    if (!this._lastHit) return;
    const { x, y, items } = this._lastHit;
    const r = this._renderer;
    const { plotY, plotHeight } = layout;

    // Vertical crosshair line
    r.line({
      x1: x, y1: plotY,
      x2: x, y2: plotY + plotHeight,
      color: this._opts.crosshairColor,
      width: this._opts.crosshairWidth,
      dash:  [4, 4],
    });

    // Dot on each dataset line
    for (const item of items) {
      if (item.x != null && item.y != null) {
        r.dot({
          x: item.x, y: item.y,
          r:           this._opts.dotRadius,
          fillColor:   '#fff',
          strokeColor: item.color,
          strokeWidth: 2.5,
        });
      }
    }
  }

  /** Remove all DOM elements and event listeners */
  destroy() {
    this._canvas.removeEventListener('pointermove',  this._handleMove);
    this._canvas.removeEventListener('pointerleave', this._handleLeave);
    this._el?.remove();
    this._el = null;
  }

  /* ─────────────────────────────────────────────
   * DOM tooltip
   * ───────────────────────────────────────────── */

  _createDOM() {
    const el = document.createElement('div');
    el.className = 'ca-tooltip';
    el.setAttribute('role', 'tooltip');
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, {
      position:      'fixed',
      pointerEvents: 'none',
      zIndex:        '9999',
      display:       'none',
      padding:       '8px 12px',
      borderRadius:  '8px',
      fontSize:      '12px',
      lineHeight:    '1.6',
      background:    this._opts.background,
      color:         this._opts.textColor,
      border:        `1px solid ${this._opts.borderColor}`,
      boxShadow:     '0 4px 16px rgba(0,0,0,0.25)',
      backdropFilter:'blur(8px)',
      fontFamily:    "'IBM Plex Sans', sans-serif",
      maxWidth:      '240px',
      transition:    'opacity 0.12s ease',
    });
    document.body.appendChild(el);
    this._el = el;
  }

  _showTooltip(hit, pointerX, pointerY) {
    const el = this._el;
    if (!el) return;

    // Build tooltip HTML
    let html = '';
    if (hit.label) {
      html += `<div style="font-weight:600;margin-bottom:4px;color:${this._opts.headerColor}">${escHtml(String(hit.label))}</div>`;
    }
    for (const item of hit.items) {
      html += `
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${item.color};flex-shrink:0;display:inline-block;"></span>
          <span style="color:${this._opts.labelColor}">${escHtml(item.datasetLabel ?? '')}</span>
          <span style="margin-left:auto;font-weight:600;">${escHtml(String(item.value))}</span>
        </div>`;
    }
    el.innerHTML = html;
    el.setAttribute('aria-hidden', 'false');

    // Position near pointer (avoid viewport overflow)
    el.style.display = 'block';
    const vw = window.innerWidth, vh = window.innerHeight;
    const ew = el.offsetWidth + 16, eh = el.offsetHeight + 16;
    let tx = pointerX + 14, ty = pointerY - 8;
    if (tx + ew > vw) tx = pointerX - ew + 2;
    if (ty + eh > vh) ty = vh - eh;
    if (ty < 0) ty = 4;
    el.style.left = tx + 'px';
    el.style.top  = ty + 'px';
  }

  _hideTooltip() {
    if (!this._el) return;
    this._el.style.display = 'none';
    this._el.setAttribute('aria-hidden', 'true');
  }

  /* ─────────────────────────────────────────────
   * Event handling
   * ───────────────────────────────────────────── */

  _attachListeners() {
    this._canvas.addEventListener('pointermove',  this._handleMove,  { passive: true });
    this._canvas.addEventListener('pointerleave', this._handleLeave, { passive: true });
  }

  _handleMove(e) {
    if (!this._hitTest) return;

    const rect = this._canvas.getBoundingClientRect();
    const cx   = e.clientX - rect.left;   // CSS pixel coords
    const cy   = e.clientY - rect.top;

    const hit = this._hitTest(cx, cy);
    const changed = JSON.stringify(hit) !== JSON.stringify(this._lastHit);

    if (changed) {
      this._lastHit = hit;
      if (this._onDraw) this._onDraw();
    }

    if (hit) {
      this._showTooltip(hit, e.clientX, e.clientY);
    } else {
      this._hideTooltip();
    }
  }

  _handleLeave() {
    this._lastHit = null;
    this._hideTooltip();
    if (this._onDraw) this._onDraw();
  }
}

/* ─────────────────────────────────────────────────
 * Defaults
 * ──────────────────────────────────────────────── */

const DEFAULTS = {
  background:     'rgba(24,24,32,0.92)',
  textColor:      '#e8e8f0',
  headerColor:    '#ffffff',
  labelColor:     '#aaaacc',
  borderColor:    'rgba(255,255,255,0.1)',
  crosshairColor: 'rgba(200,200,220,0.35)',
  crosshairWidth: 1,
  dotRadius:      5,
};

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}