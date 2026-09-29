/**
 * BaseChart.js
 * Abstract base class for all chart types.
 *
 * Lifecycle every subclass follows:
 *   init() → processData() → computeLayout() → draw() → animate()
 *
 * Subclasses MUST implement:
 *   processData()   — validate + normalise incoming data
 *   computeLayout() — calculate scales, axis ranges, pixel bounds
 *   drawChart()     — paint the chart-specific geometry onto the canvas
 *
 * Subclasses MAY override:
 *   getDefaultConfig() — merge extra defaults on top of the base ones
 *   onResize()         — react to container size changes
 *   onDestroy()        — clean up timers, listeners, etc.
 */

import { debounce } from '../utils/debounce.js';
import { EventBus }  from './EventBus.js';
import { Renderer }  from './Renderer.js';

export class BaseChart {

  /* ─────────────────────────────────────────────
   * Constructor
   * @param {string|HTMLCanvasElement} target  Canvas element or its id
   * @param {Object}                   config  User-supplied configuration
   * ───────────────────────────────────────────── */
  constructor(target, config = {}) {
    this._canvas  = this._resolveCanvas(target);
    this._ctx     = this._canvas.getContext('2d');
    this._config  = this._mergeConfig(config);
    this._data    = config.data ?? { labels: [], datasets: [] };

    this._renderer    = new Renderer(this._ctx);
    this._bus         = new EventBus();
    this._animationId = null;
    this._destroyed   = false;

    // Internal computed state — populated by computeLayout()
    this._layout = {
      width:        0,
      height:       0,
      paddingTop:   0,
      paddingRight: 0,
      paddingBottom:0,
      paddingLeft:  0,
      plotX:        0,   // plot area origin x
      plotY:        0,   // plot area origin y
      plotWidth:    0,
      plotHeight:   0,
    };

    this._scales = {
      x: null,   // set by computeLayout()
      y: null,
    };

    this._resizeObserver = null;
    this._init();
  }

  /* ─────────────────────────────────────────────
   * Public API
   * ───────────────────────────────────────────── */

  /** Re-render with new data without rebuilding everything */
  update(newData) {
    if (this._destroyed) return;
    if (newData) this._data = newData;
    this._processData();
    this._computeLayout();
    this._drawFrame();
    this._bus.emit('update', { chart: this });
  }

  /** Replace full config and re-render */
  setConfig(partialConfig) {
    if (this._destroyed) return;
    this._config = this._mergeConfig({ ...this._config, ...partialConfig });
    this.update();
  }

  /** Subscribe to chart events: 'update' | 'destroy' | 'resize' | 'animationEnd' */
  on(event, handler) {
    this._bus.on(event, handler);
    return this;  // chainable
  }

  /** Export canvas as a PNG data-URL */
  toDataURL(type = 'image/png', quality = 1) {
    return this._canvas.toDataURL(type, quality);
  }

  /** Download the chart as a PNG file */
  exportPNG(filename = 'chart.png') {
    const link = document.createElement('a');
    link.download = filename;
    link.href = this.toDataURL();
    link.click();
  }

  /** Tear down: cancel animation, remove listeners, clear canvas */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._cancelAnimation();
    this._resizeObserver?.disconnect();
    this._renderer.clear(this._layout.width, this._layout.height);
    this.onDestroy();
    this._bus.emit('destroy', { chart: this });
    this._bus.clear();
  }

  /* ─────────────────────────────────────────────
   * Abstract methods — subclasses MUST implement
   * ───────────────────────────────────────────── */

  /** Validate and normalise this._data. Store derived structures. */
  processData() {
    throw new Error(`${this.constructor.name} must implement processData()`);
  }

  /** Compute scales, axis tick values, and plot bounds into this._layout / this._scales */
  computeLayout() {
    throw new Error(`${this.constructor.name} must implement computeLayout()`);
  }

  /** Paint the chart geometry (lines, bars, arcs…) using this._renderer */
  drawChart() {
    throw new Error(`${this.constructor.name} must implement drawChart()`);
  }

  /* ─────────────────────────────────────────────
   * Overridable hooks — subclasses MAY implement
   * ───────────────────────────────────────────── */

  /** Return chart-type-specific config defaults. Merged on top of base defaults. */
  getDefaultConfig() { return {}; }

  /** Called after a resize event. Receive new { width, height }. */
  onResize(_size) {}

  /** Called just before the instance is destroyed. Release custom resources here. */
  onDestroy() {}

  /* ─────────────────────────────────────────────
   * Internal lifecycle
   * ───────────────────────────────────────────── */

  _init() {
    this._sizeCanvas();
    this._processData();
    this._computeLayout();
    this._drawFrame();

    if (this._config.animation.enabled) {
      this._startAnimation();
    }

    this._attachResizeObserver();
    this._bus.emit('init', { chart: this });
  }

  _processData() {
    try {
      this.processData();
    } catch (err) {
      console.error(`[BaseChart] processData error in ${this.constructor.name}:`, err);
    }
  }

  _computeLayout() {
    const { width, height } = this._getDimensions();
    const { padding } = this._config;

    this._layout.width         = width;
    this._layout.height        = height;
    this._layout.paddingTop    = padding.top;
    this._layout.paddingRight  = padding.right;
    this._layout.paddingBottom = padding.bottom;
    this._layout.paddingLeft   = padding.left;
    this._layout.plotX         = padding.left;
    this._layout.plotY         = padding.top;
    this._layout.plotWidth     = width  - padding.left - padding.right;
    this._layout.plotHeight    = height - padding.top  - padding.bottom;

    try {
      this.computeLayout();
    } catch (err) {
      console.error(`[BaseChart] computeLayout error in ${this.constructor.name}:`, err);
    }
  }

  _drawFrame() {
    const { width, height } = this._layout;
    this._renderer.clear(width, height);

    if (this._config.debug) {
      this._drawDebugOverlay();
    }

    try {
      this.drawChart();
    } catch (err) {
      console.error(`[BaseChart] drawChart error in ${this.constructor.name}:`, err);
    }
  }

  /* ─────────────────────────────────────────────
   * Animation engine
   * ───────────────────────────────────────────── */

  _startAnimation() {
    const { duration, easing } = this._config.animation;
    const easingFn = EASING[easing] ?? EASING.easeOutCubic;
    let start = null;

    const tick = (timestamp) => {
      if (this._destroyed) return;
      if (!start) start = timestamp;

      const elapsed  = timestamp - start;
      const progress = Math.min(elapsed / duration, 1);

      this._animationProgress = easingFn(progress);
      this._drawFrame();

      if (progress < 1) {
        this._animationId = requestAnimationFrame(tick);
      } else {
        this._animationProgress = 1;
        this._animationId = null;
        this._bus.emit('animationEnd', { chart: this });
      }
    };

    this._animationProgress = 0;
    this._animationId = requestAnimationFrame(tick);
  }

  _cancelAnimation() {
    if (this._animationId !== null) {
      cancelAnimationFrame(this._animationId);
      this._animationId = null;
    }
  }

  /* ─────────────────────────────────────────────
   * Canvas sizing + DPR
   * ───────────────────────────────────────────── */

  _sizeCanvas() {
    const dpr    = window.devicePixelRatio || 1;
    const rect   = this._canvas.getBoundingClientRect();
    const width  = rect.width  || this._canvas.offsetWidth  || 400;
    const height = rect.height || this._canvas.offsetHeight || 300;

    this._canvas.width  = Math.round(width  * dpr);
    this._canvas.height = Math.round(height * dpr);
    this._ctx.scale(dpr, dpr);

    this._canvas.style.width  = width  + 'px';
    this._canvas.style.height = height + 'px';

    this._cssWidth  = width;
    this._cssHeight = height;
  }

  _getDimensions() {
    return { width: this._cssWidth, height: this._cssHeight };
  }

  _attachResizeObserver() {
    if (typeof ResizeObserver === 'undefined') return;

    const onResize = debounce((entries) => {
      if (this._destroyed) return;
      const entry = entries[0];
      const { width, height } = entry.contentRect;

      const dpr = window.devicePixelRatio || 1;
      this._canvas.width  = Math.round(width  * dpr);
      this._canvas.height = Math.round(height * dpr);
      this._ctx.scale(dpr, dpr);
      this._cssWidth  = width;
      this._cssHeight = height;

      this._computeLayout();
      this._drawFrame();
      this.onResize({ width, height });
      this._bus.emit('resize', { chart: this, width, height });
    }, 150);

    this._resizeObserver = new ResizeObserver(onResize);
    this._resizeObserver.observe(this._canvas);
  }

  /* ─────────────────────────────────────────────
   * Config helpers
   * ───────────────────────────────────────────── */

  _mergeConfig(userConfig) {
    return deepMerge(deepMerge(BASE_DEFAULTS, this.getDefaultConfig()), userConfig);
  }

  _resolveCanvas(target) {
    if (target instanceof HTMLCanvasElement) return target;
    if (typeof target === 'string') {
      const el = document.getElementById(target) || document.querySelector(target);
      if (!el) throw new Error(`[BaseChart] Canvas not found: "${target}"`);
      return el;
    }
    throw new Error('[BaseChart] target must be a canvas element or selector string');
  }

  /* ─────────────────────────────────────────────
   * Debug overlay
   * ───────────────────────────────────────────── */

  _drawDebugOverlay() {
    const { plotX, plotY, plotWidth, plotHeight } = this._layout;
    const ctx = this._ctx;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,0,0,0.3)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(plotX, plotY, plotWidth, plotHeight);

    ctx.fillStyle   = 'rgba(255,0,0,0.6)';
    ctx.font        = '11px monospace';
    ctx.fillText(
      `plot ${Math.round(plotWidth)}×${Math.round(plotHeight)} @ (${Math.round(plotX)},${Math.round(plotY)})`,
      plotX + 4, plotY + 13
    );
    ctx.restore();
  }

  /* ─────────────────────────────────────────────
   * Accessors (read-only snapshots for subclasses)
   * ───────────────────────────────────────────── */

  get layout()   { return { ...this._layout }; }
  get scales()   { return this._scales; }
  get config()   { return this._config; }
  get renderer() { return this._renderer; }
  get ctx()      { return this._ctx; }
  get canvas()   { return this._canvas; }

  /** Progress value 0→1 driven by the animation engine. Use in drawChart(). */
  get progress() { return this._animationProgress ?? 1; }
}

/* ─────────────────────────────────────────────────
 * Base configuration defaults
 * ──────────────────────────────────────────────── */

const BASE_DEFAULTS = {
  padding: {
    top:    20,
    right:  20,
    bottom: 40,
    left:   50,
  },
  animation: {
    enabled:  true,
    duration: 600,    // ms
    easing:   'easeOutCubic',
  },
  font: {
    family: "'IBM Plex Sans', sans-serif",
    size:   12,
    color:  '#888',
  },
  grid: {
    show:       true,
    color:      'rgba(128,128,128,0.12)',
    lineWidth:  1,
  },
  tooltip: {
    enabled: true,
  },
  legend: {
    enabled: true,
    position: 'top',
  },
  responsive: true,
  debug:      false,
};

/* ─────────────────────────────────────────────────
 * Easing functions
 * ──────────────────────────────────────────────── */

const EASING = {
  linear:       (t) => t,
  easeInQuad:   (t) => t * t,
  easeOutQuad:  (t) => t * (2 - t),
  easeInOutQuad:(t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic:(t)=> t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  easeOutElastic:(t)=> {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1
      : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};

/* ─────────────────────────────────────────────────
 * Utility: deep merge plain objects (no arrays merged deeply)
 * ──────────────────────────────────────────────── */

function deepMerge(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override ?? {})) {
    const bv = base[key], ov = override[key];
    result[key] = (isPlainObj(bv) && isPlainObj(ov))
      ? deepMerge(bv, ov)
      : ov;
  }
  return result;
}

function isPlainObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export { EASING, BASE_DEFAULTS };