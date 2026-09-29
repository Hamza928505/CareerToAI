/**
 * palette.js — the one colour source for the whole studio.
 *
 * Every chart definition draws its default colours from PALETTE so a single
 * edit re-themes the entire library. The named keys mirror the legacy
 * `js/utils.js` `U.C` object so ported charts read the same as before.
 */

/**
 * The eight series colours, and the three hard constraints on them.
 *
 * 1. **No two may merge for a colour-blind reader.** `cvd.js` reports a pair
 *    that a trichromat can separate and a dichromat cannot; this set produces
 *    none, and its weakest pair sits at ΔE 13.2 against a threshold of 11.
 * 2. **Every colour must be visible on both grounds.** `PALETTE` is one literal
 *    set — it is serialised into exports that land in other people's pages, so
 *    it cannot be theme-reactive the way the CSS tokens are. Each colour
 *    therefore clears WCAG's 3:1 for a graphical object against white *and*
 *    against the dark surface.
 * 3. **They must read as one palette.** Chosen at a single perceived intensity
 *    (CIELAB chroma ≈ 52) rather than at maximum saturation, so no series
 *    shouts over the rest.
 *
 * Those pull against each other, which is the whole difficulty. Constraint 2
 * forces every colour into a middle band of lightness — and lightness is
 * exactly what constraint 1 relies on, because deuteranopia and protanopia
 * collapse the red-green axis and leave lightness and the blue-yellow axis as
 * the only separation left. The set was searched rather than picked, one colour
 * per named hue family so the result stays nameable.
 *
 * A worked example of the trap: lifting the olive to `#6E7A22` looks better in
 * isolation and collides with the amber at ΔE 7.9 under protanopia. The colours
 * here are the ones that survive all three rules at once.
 *
 * The green is the accent family. It is darker than the interface's
 * `--accent-solid` (`#22c55e`) because that value is only 2.3:1 on white and a
 * bar drawn in it would disappear in an export.
 */
export const PALETTE = [
  '#2e8d44', // green — the accent family, darkened to survive a white export
  '#2167b9', // blue
  '#b3852e', // amber
  '#a381d8', // violet
  '#289eb5', // cyan
  '#b53c5e', // rose
  '#676b89', // slate
  '#646a00', // olive
];

/**
 * The named keys, one per palette position.
 *
 * The previous set was named purple / teal / coral / blue / amber / pink /
 * gray / olive, and the chart definitions were rewritten onto these names *by
 * position* rather than by hue: a chart that drew its first three series in
 * `purple, teal, coral` now draws them in `green, blue, amber`, which is
 * `PALETTE[0..2]` exactly as before. Mapping by hue instead would have sent
 * both `coral` and `pink` to the same rose — two series in one chart with one
 * colour, and `confusablePairs` would not have said a word about it, because
 * colours that are identical to everyone are a palette choice rather than a
 * colour-vision fault.
 */
export const C = {
  green:  PALETTE[0],
  blue:   PALETTE[1],
  amber:  PALETTE[2],
  violet: PALETTE[3],
  cyan:   PALETTE[4],
  rose:   PALETTE[5],
  slate:  PALETTE[6],
  olive:  PALETTE[7],
  gray:   PALETTE[6],
  red:    '#b91c1c',
};

/** Swatch options offered by every colour picker in the control panel. */
export const SWATCHES = [
  ...PALETTE,
  '#166534', '#1e40af', '#92400e', '#6b21a8',
  '#155e75', '#9f1239', '#334155', '#3f6212',
];

/**
 * Append an alpha channel to a 6-digit hex colour.
 * Returns the input untouched if it is not a plain #rrggbb value, so rgba()
 * strings and CSS variables pass through unharmed.
 *
 * @param {string} hex   e.g. '#2e8d44'
 * @param {number} alpha 0–1
 */
export function withAlpha(hex, alpha) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return hex + a;
}

/** Lighten (amount > 0) or darken (amount < 0) a hex colour by a ratio. */
export function shade(hex, amount) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const next = amount >= 0 ? v + (255 - v) * amount : v * (1 + amount);
    return Math.round(Math.max(0, Math.min(255, next)));
  });
  return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Pick black or white text for legibility on the given background. */
export function contrastInk(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return '#ffffff';
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  // Rec. 709 relative luminance
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 150 ? '#111111' : '#ffffff';
}

/** Cycle the palette so any series index always resolves to a colour. */
export const paletteAt = (i) => PALETTE[i % PALETTE.length];

/* Shared label vocabularies used by several chart definitions. */
export const MONTHS   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const MONTHS6  = MONTHS.slice(0, 6);
export const QUARTERS = ['Q1','Q2','Q3','Q4'];
export const DAYS     = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
