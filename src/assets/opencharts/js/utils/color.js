/**
 * color.js
 * Color utilities: parsing, conversion, manipulation, and palette generation.
 * No external dependencies.
 */

/* ── Parsing ──────────────────────────────────── */

/**
 * Parse a CSS color string into { r, g, b, a }.
 * Supports: #rgb, #rrggbb, #rrggbbaa, rgb(...), rgba(...)
 *
 * @param {string} color
 * @returns {{ r:number, g:number, b:number, a:number }} Values 0–255 (a 0–1)
 */
export function parseColor(color) {
  color = color.trim();

  // Hex shorthand #rgb
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [, r, g, b] = color;
    return { r: parseInt(r+r,16), g: parseInt(g+g,16), b: parseInt(b+b,16), a: 1 };
  }
  // Hex #rrggbb
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return {
      r: parseInt(color.slice(1,3),16),
      g: parseInt(color.slice(3,5),16),
      b: parseInt(color.slice(5,7),16),
      a: 1,
    };
  }
  // Hex #rrggbbaa
  if (/^#[0-9a-f]{8}$/i.test(color)) {
    return {
      r: parseInt(color.slice(1,3),16),
      g: parseInt(color.slice(3,5),16),
      b: parseInt(color.slice(5,7),16),
      a: parseInt(color.slice(7,9),16) / 255,
    };
  }
  // rgb(r, g, b) or rgba(r, g, b, a)
  const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (m) {
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] != null ? +m[4] : 1 };
  }
  // Fallback: transparent grey
  console.warn(`[color.js] Could not parse: "${color}"`);
  return { r: 128, g: 128, b: 128, a: 1 };
}

/* ── Conversion ───────────────────────────────── */

/** RGBA components → CSS rgba() string */
export const toRgba = (r, g, b, a = 1) =>
  `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;

/** RGBA components → 6-digit hex string */
export const toHex = (r, g, b) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Add transparency to any CSS color string */
export function withAlpha(color, alpha) {
  const { r, g, b } = parseColor(color);
  return toRgba(r, g, b, alpha);
}

/* ── Manipulation ─────────────────────────────── */

/**
 * Lighten a color by mixing it toward white by `amount` (0–1).
 */
export function lighten(color, amount) {
  const { r, g, b, a } = parseColor(color);
  return toRgba(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount,
    a,
  );
}

/**
 * Darken a color by mixing it toward black by `amount` (0–1).
 */
export function darken(color, amount) {
  const { r, g, b, a } = parseColor(color);
  return toRgba(r * (1 - amount), g * (1 - amount), b * (1 - amount), a);
}

/**
 * Mix two CSS colors by ratio t (0 = colorA, 1 = colorB).
 */
export function mix(colorA, colorB, t) {
  const a = parseColor(colorA), b = parseColor(colorB);
  return toRgba(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t,
    a.a + (b.a - a.a) * t,
  );
}

/**
 * Return a contrasting text color (black or white) for a given background.
 * Uses WCAG relative luminance formula.
 */
export function contrastColor(bgColor) {
  const { r, g, b } = parseColor(bgColor);
  // sRGB luminance
  const lum = ([r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }).reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0));
  return lum > 0.179 ? '#111' : '#fff';
}

/* ── Palettes ─────────────────────────────────── */

/**
 * The OpenCharts brand palette — primary colours for datasets.
 * Matches the CSS variables used in global.css.
 */
export const PALETTE = [
  '#7F77DD',   // purple  (accent)
  '#1D9E75',   // teal    (accent2)
  '#D85A30',   // coral   (accent3)
  '#378ADD',   // blue    (accent4)
  '#E8B84B',   // amber
  '#9B5DE5',   // violet
  '#F15BB5',   // pink
  '#00BBF9',   // cyan
];

/**
 * Generate a palette of `n` colours by interpolating around a hue wheel.
 * Used when more than PALETTE.length datasets are needed.
 *
 * @param {number} n      Number of colours
 * @param {number} [sat]  Saturation 0–100 (default 65)
 * @param {number} [lit]  Lightness  0–100 (default 58)
 * @returns {string[]}    CSS hsl() strings
 */
export function generatePalette(n, sat = 65, lit = 58) {
  if (n <= PALETTE.length) return PALETTE.slice(0, n);
  return Array.from({ length: n }, (_, i) => {
    const hue = Math.round((i / n) * 360);
    return `hsl(${hue},${sat}%,${lit}%)`;
  });
}

/**
 * Produce a fill colour for a dataset: semi-transparent version of its line colour.
 *
 * @param {string} lineColor
 * @param {number} [alpha=0.15]
 */
export const fillColor = (lineColor, alpha = 0.15) => withAlpha(lineColor, alpha);