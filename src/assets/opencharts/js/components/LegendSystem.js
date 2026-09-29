/**
 * LegendSystem.js
 * Builds and manages a DOM-based legend for chart datasets.
 *
 * Renders outside the canvas (in a companion <div>) so it's:
 *   - Fully accessible (screen-reader friendly)
 *   - Selectable / copyable text
 *   - Styleable with CSS without re-drawing the canvas
 *
 * Supports click-to-toggle dataset visibility.
 */

export class LegendSystem {

  /**
   * @param {HTMLElement} container  The div that will hold the legend
   * @param {Object}      [options]
   */
  constructor(container, options = {}) {
    this._container = container;
    this._opts      = { ...DEFAULTS, ...options };
    this._items     = [];      // [{ label, color, hidden }]
    this._onChange  = null;    // fn(index, hidden) → void
  }

  /* ─────────────────────────────────────────────
   * Public API
   * ───────────────────────────────────────────── */

  /**
   * Register a callback fired when a legend item is toggled.
   * The chart uses this to hide/show its dataset.
   *
   * @param {Function} fn  fn(datasetIndex: number, hidden: boolean)
   */
  onChange(fn) {
    this._onChange = fn;
    return this;
  }

  /**
   * Render the legend from a list of datasets.
   *
   * @param {Array<{ label: string, color: string }>} datasets
   */
  render(datasets) {
    this._items = datasets.map((d, i) => ({
      index:  i,
      label:  d.label ?? `Series ${i + 1}`,
      color:  d.color ?? d.borderColor ?? d.backgroundColor ?? '#888',
      hidden: false,
    }));
    this._buildDOM();
  }

  /**
   * Update a single item's hidden state (e.g. after external toggle).
   */
  setHidden(index, hidden) {
    const item = this._items[index];
    if (!item) return;
    item.hidden = hidden;
    this._updateItem(index);
  }

  /** Remove all legend DOM nodes */
  clear() {
    this._container.innerHTML = '';
    this._items = [];
  }

  /* ─────────────────────────────────────────────
   * DOM building
   * ───────────────────────────────────────────── */

  _buildDOM() {
    const c    = this._container;
    const opts = this._opts;
    c.innerHTML = '';
    c.setAttribute('role', 'list');
    c.setAttribute('aria-label', 'Chart legend');

    Object.assign(c.style, {
      display:        'flex',
      flexWrap:       'wrap',
      gap:            opts.gap,
      justifyContent: opts.align,
      padding:        '0 0 8px',
    });

    this._items.forEach((item) => {
      const el = this._buildItem(item);
      c.appendChild(el);
    });
  }

  _buildItem(item) {
    const opts = this._opts;

    const el = document.createElement('button');
    el.type = 'button';
    el.setAttribute('role', 'listitem');
    el.setAttribute('aria-pressed', item.hidden ? 'true' : 'false');
    el.setAttribute('aria-label', `${item.label}: click to ${item.hidden ? 'show' : 'hide'}`);
    el.dataset.legendIndex = item.index;

    Object.assign(el.style, {
      display:        'inline-flex',
      alignItems:     'center',
      gap:            '6px',
      background:     'transparent',
      border:         'none',
      cursor:         'pointer',
      padding:        '3px 8px 3px 0',
      borderRadius:   '4px',
      fontSize:       opts.fontSize,
      fontFamily:     opts.fontFamily,
      color:          item.hidden ? opts.hiddenColor : opts.textColor,
      opacity:        item.hidden ? '0.45' : '1',
      transition:     'opacity 0.2s, color 0.2s',
    });

    // Colour swatch
    const swatch = document.createElement('span');
    Object.assign(swatch.style, {
      width:        opts.swatchSize,
      height:       opts.swatchSize,
      borderRadius: opts.swatchShape === 'circle' ? '50%' : '3px',
      background:   item.color,
      flexShrink:   '0',
      display:      'inline-block',
      transition:   'opacity 0.2s',
    });

    // Label text
    const text = document.createElement('span');
    text.textContent = item.label;

    el.appendChild(swatch);
    el.appendChild(text);

    // Hover style
    el.addEventListener('mouseenter', () => {
      if (!item.hidden) el.style.opacity = '0.75';
    });
    el.addEventListener('mouseleave', () => {
      el.style.opacity = item.hidden ? '0.45' : '1';
    });

    // Click toggle
    el.addEventListener('click', () => {
      item.hidden = !item.hidden;
      this._updateItem(item.index);
      if (this._onChange) this._onChange(item.index, item.hidden);
    });

    el._legendItem = item;
    return el;
  }

  _updateItem(index) {
    const item = this._items[index];
    const el   = this._container.querySelector(`[data-legend-index="${index}"]`);
    if (!el) return;

    el.style.opacity = item.hidden ? '0.45' : '1';
    el.style.color   = item.hidden ? this._opts.hiddenColor : this._opts.textColor;
    el.setAttribute('aria-pressed', item.hidden ? 'true' : 'false');
    el.setAttribute('aria-label', `${item.label}: click to ${item.hidden ? 'show' : 'hide'}`);
  }
}

/* ─────────────────────────────────────────────────
 * Defaults
 * ──────────────────────────────────────────────── */

const DEFAULTS = {
  align:       'flex-start',   // 'flex-start' | 'center' | 'flex-end'
  gap:         '4px 16px',
  fontSize:    '12px',
  fontFamily:  "'IBM Plex Sans', sans-serif",
  textColor:   '#aaa',
  hiddenColor: '#555',
  swatchSize:  '10px',
  swatchShape: 'circle',       // 'circle' | 'square'
};