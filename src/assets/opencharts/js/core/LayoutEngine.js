/**
 * LayoutEngine.js
 * Converts data-space values ↔ pixel-space coordinates.
 *
 * Responsibilities:
 *   - Compute min/max from dataset(s)
 *   - Generate "nice" axis tick values (human-friendly rounding)
 *   - Map data values to canvas pixel positions
 *   - Map pixel positions back to data values (for hit-testing)
 *
 * Usage:
 *   const scale = LayoutEngine.linearScale({ min, max, pixelMin, pixelMax });
 *   const px = scale.toPixel(value);
 *   const val = scale.toValue(px);
 */

export class LayoutEngine {

  /* ─────────────────────────────────────────────
   * Scale factories
   * ───────────────────────────────────────────── */

  /**
   * Create a linear scale mapping [dataMin, dataMax] → [pixelMin, pixelMax].
   *
   * @param {Object} opts
   * @param {number}  opts.min        Data-space minimum
   * @param {number}  opts.max        Data-space maximum
   * @param {number}  opts.pixelMin   Pixel-space minimum (e.g. plotX for X axis)
   * @param {number}  opts.pixelMax   Pixel-space maximum (e.g. plotX+plotWidth for X axis)
   * @param {boolean} [opts.clamp]    Clamp output to pixel range (default false)
   * @returns {LinearScale}
   */
  static linearScale({ min, max, pixelMin, pixelMax, clamp = false }) {
    if (min === max) { min -= 1; max += 1; }  // avoid zero-range
    const dataRange  = max - min;
    const pixelRange = pixelMax - pixelMin;

    return {
      min, max, pixelMin, pixelMax,

      toPixel(value) {
        const t  = (value - min) / dataRange;
        const px = pixelMin + t * pixelRange;
        return clamp ? Math.min(pixelMax, Math.max(pixelMin, px)) : px;
      },

      toValue(pixel) {
        const t = (pixel - pixelMin) / pixelRange;
        return min + t * dataRange;
      },

      /** Normalised 0→1 position for a value */
      normalise(value) {
        return (value - min) / dataRange;
      },
    };
  }

  /**
   * Create a band scale for categorical/ordinal X axes (bar charts, etc.).
   * Each band occupies an equal slice of the pixel range.
   *
   * @param {Object} opts
   * @param {string[]} opts.labels
   * @param {number}   opts.pixelMin
   * @param {number}   opts.pixelMax
   * @param {number}   [opts.padding]  Inner padding ratio 0–1 (default 0.2)
   * @returns {BandScale}
   */
  static bandScale({ labels, pixelMin, pixelMax, padding = 0.2 }) {
    const count     = labels.length;
    const totalWidth = pixelMax - pixelMin;
    const step      = totalWidth / count;
    const barWidth  = step * (1 - padding);
    const halfPad   = (step - barWidth) / 2;

    return {
      labels, pixelMin, pixelMax, step, barWidth,

      /** Pixel position of the band's left edge */
      bandStart(index) {
        return pixelMin + index * step + halfPad;
      },

      /** Pixel position of the band centre */
      bandCentre(index) {
        return pixelMin + (index + 0.5) * step;
      },

      /** Find the nearest band index for a pixel x coordinate */
      indexAt(px) {
        const i = Math.floor((px - pixelMin) / step);
        return Math.max(0, Math.min(count - 1, i));
      },
    };
  }

  /**
   * Create a time scale (thin wrapper around linearScale using timestamps).
   * Pass Date objects or UNIX ms numbers.
   */
  static timeScale({ dates, pixelMin, pixelMax, clamp = false }) {
    const timestamps = dates.map((d) => (d instanceof Date ? d.getTime() : Number(d)));
    const min = Math.min(...timestamps);
    const max = Math.max(...timestamps);

    const inner = LayoutEngine.linearScale({ min, max, pixelMin, pixelMax, clamp });

    return {
      ...inner,
      toPixelDate(date) {
        const ts = date instanceof Date ? date.getTime() : Number(date);
        return inner.toPixel(ts);
      },
    };
  }

  /* ─────────────────────────────────────────────
   * Data-range helpers
   * ───────────────────────────────────────────── */

  /**
   * Compute the overall min and max across one or more numeric arrays.
   *
   * @param {number[][]} arrays
   * @param {Object}  [opts]
   * @param {boolean} [opts.includeZero=false]  Force 0 into the range
   * @returns {{ min: number, max: number }}
   */
  static extent(arrays, { includeZero = false } = {}) {
    let min = Infinity, max = -Infinity;
    for (const arr of arrays) {
      for (const v of arr) {
        if (typeof v !== 'number' || !isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (!isFinite(min)) { min = 0; max = 1; }
    if (includeZero) {
      min = Math.min(0, min);
      max = Math.max(0, max);
    }
    return { min, max };
  }

  /**
   * Compute stacked extent — each index position is summed across all arrays.
   * Used for stacked bar / stacked area charts.
   *
   * @param {number[][]} arrays  Each sub-array is one dataset
   * @returns {{ min: number, max: number }}
   */
  static stackedExtent(arrays) {
    if (!arrays.length) return { min: 0, max: 1 };
    const len = arrays[0].length;
    let min = 0, max = -Infinity;
    for (let i = 0; i < len; i++) {
      const pos = arrays.reduce((s, a) => s + Math.max(0, a[i] ?? 0), 0);
      const neg = arrays.reduce((s, a) => s + Math.min(0, a[i] ?? 0), 0);
      if (pos > max) max = pos;
      if (neg < min) min = neg;
    }
    return { min, max };
  }

  /* ─────────────────────────────────────────────
   * "Nice" number helpers
   * ───────────────────────────────────────────── */

  /**
   * Expand a raw [min, max] to aesthetically pleasing rounded numbers
   * and generate evenly spaced tick values.
   *
   * Algorithm: Heckbert's "nice numbers" (from "Graphics Gems").
   *
   * @param {number}  rawMin
   * @param {number}  rawMax
   * @param {number}  targetTicks  Desired tick count (approximate)
   * @returns {{ niceMin: number, niceMax: number, tickStep: number, ticks: number[] }}
   */
  static niceLinear(rawMin, rawMax, targetTicks = 5) {
    if (rawMin === rawMax) {
      rawMin -= 1;
      rawMax += 1;
    }

    const range     = niceNum(rawMax - rawMin, false);
    const tickStep  = niceNum(range / (targetTicks - 1), true);
    const niceMin   = Math.floor(rawMin / tickStep) * tickStep;
    const niceMax   = Math.ceil(rawMax  / tickStep) * tickStep;

    const ticks = [];
    // Use integer loop to avoid floating-point drift
    const count = Math.round((niceMax - niceMin) / tickStep);
    for (let i = 0; i <= count; i++) {
      const v = niceMin + i * tickStep;
      ticks.push(parseFloat(v.toPrecision(10)));  // strip FP noise
    }

    return { niceMin, niceMax, tickStep, ticks };
  }

  /**
   * Round a value to a given number of significant digits.
   * Useful for tick label formatting.
   */
  static sigFigs(value, digits = 3) {
    if (value === 0) return 0;
    const d = Math.ceil(Math.log10(Math.abs(value)));
    const power = digits - d;
    const magnitude = Math.pow(10, power);
    return Math.round(value * magnitude) / magnitude;
  }

  /**
   * Auto-format a tick value for display.
   * Handles large numbers (K, M), small decimals, and zero.
   *
   * @param {number}  value
   * @param {string}  [prefix='']   e.g. '$'
   * @param {string}  [suffix='']   e.g. '%'
   * @returns {string}
   */
  static formatTick(value, prefix = '', suffix = '') {
    let str;
    const abs = Math.abs(value);
    if (abs === 0)          str = '0';
    else if (abs >= 1e9)    str = (value / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    else if (abs >= 1e6)    str = (value / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    else if (abs >= 1e3)    str = (value / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    else if (abs >= 1)      str = value.toFixed(0);
    else if (abs >= 0.01)   str = value.toFixed(2);
    else                    str = value.toPrecision(2);
    return prefix + str + suffix;
  }
}

/* ─────────────────────────────────────────────────
 * Heckbert nice-number algorithm
 * ──────────────────────────────────────────────── */

function niceNum(range, round) {
  const exp    = Math.floor(Math.log10(range));
  const frac   = range / Math.pow(10, exp);
  let nice;

  if (round) {
    if      (frac < 1.5) nice = 1;
    else if (frac < 3)   nice = 2;
    else if (frac < 7)   nice = 5;
    else                  nice = 10;
  } else {
    if      (frac <= 1)  nice = 1;
    else if (frac <= 2)  nice = 2;
    else if (frac <= 5)  nice = 5;
    else                  nice = 10;
  }

  return nice * Math.pow(10, exp);
}