/**
 * cvd.js — does this palette still read for a colour-blind viewer?
 *
 * Roughly one man in twelve has some form of red-green colour vision
 * deficiency, and the two colours a chart leans on to separate its series are
 * exactly the two that tend to merge. A library whose help text already names
 * how each chart misleads should not hand out a palette that misleads.
 *
 * Deliberately advisory, never a gate — the same rule `checkTableShape`
 * follows. Somebody colouring a chart to match a brand does not need the tool
 * refusing them; they need to be told which two series just became one.
 *
 * The check is narrow on purpose: a pair is only reported when it is
 * **distinguishable normally and not distinguishable simulated**. Two colours
 * a reader has deliberately set close together are their business, and
 * reporting those would bury the real finding in noise.
 */

/**
 * Machado, Oliveira & Fernandes (2009), severity 1.0.
 *
 * These operate on *linear* RGB, which is why `toLinear` runs first — applying
 * them to gamma-encoded bytes is the usual way this comes out wrong, and it
 * fails quietly by shifting every colour a little rather than obviously.
 */
const MATRIX = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.011820, 0.042940, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.303900],
  ],
};

/** The three simulated, in the order a warning should mention them. */
export const CVD_KINDS = [
  { key: 'deuteranopia', label: 'green-blind', share: 'about 1 man in 16' },
  { key: 'protanopia', label: 'red-blind', share: 'about 1 man in 100' },
  { key: 'tritanopia', label: 'blue-blind', share: 'rare, both sexes' },
];

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

/** '#2e8d44' → [46, 141, 68], or null for anything that is not a plain hex. */
export function rgbOf(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim();
  if (/^#[0-9a-f]{3}$/i.test(h)) h = '#' + [...h.slice(1)].map((c) => c + c).join('');
  if (!/^#[0-9a-f]{6}$/i.test(h)) return null;
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const hexOf = (rgb) => '#' + rgb.map((v) => clamp(v).toString(16).padStart(2, '0')).join('');

/**
 * The colour as someone with this deficiency sees it.
 * Returns the input unchanged if it is not a plain hex — gradients, rgba()
 * strings and CSS variables pass through rather than becoming black.
 */
export function simulate(hex, kind = 'deuteranopia') {
  const rgb = rgbOf(hex);
  const m = MATRIX[kind];
  if (!rgb || !m) return hex;
  const lin = rgb.map((v) => toLinear(v / 255));
  const out = m.map((row) => row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]);
  return hexOf(out.map((v) => toSrgb(Math.max(0, Math.min(1, v))) * 255));
}

/* ── perceptual distance ──────────────────────────────────────────────── */

/** sRGB hex → CIELAB. D65, the white point the sRGB spec is defined against. */
function lab(hex) {
  const rgb = rgbOf(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => toLinear(v / 255));
  // Linear sRGB → XYZ
  let x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  let y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / 1.0;
  let z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  [x, y, z] = [f(x), f(y), f(z)];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/**
 * CIE76 ΔE between two hex colours, or Infinity if either will not parse.
 *
 * CIE76 rather than ΔE2000: this decides whether to show a sentence, not
 * whether to reject a print run, and the newer formula's extra hundred lines
 * would not move a single verdict at the threshold used here.
 */
export function distance(a, b) {
  const la = lab(a);
  const lb = lab(b);
  if (!la || !lb) return Infinity;
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

/**
 * Below this, two colours in a legend read as the same colour.
 *
 * ~11 sits above the "just noticeable" range and below the point where a
 * reader glancing between a line and its key would hesitate. Tuned against
 * the default palette: it flags teal/olive under deuteranopia, which is real,
 * and leaves purple/blue alone, which is fine.
 */
export const MERGE_THRESHOLD = 11;

/**
 * Pairs that a colour-blind reader cannot tell apart but a trichromat can.
 *
 * @param {string[]} colors  the palette, in series order
 * @param {object} [opts]
 * @param {number} [opts.threshold]
 * @param {(i:number) => string} [opts.name]  what to call series i
 * @returns {Array<{a:number, b:number, kind:string, label:string, delta:number}>}
 *   one entry per pair, worst first — a pair that fails under two kinds is
 *   reported once, for the kind it fails hardest under.
 */
export function confusablePairs(colors, opts = {}) {
  const threshold = opts.threshold ?? MERGE_THRESHOLD;
  const list = (colors || []).map((c) => (rgbOf(c) ? c : null));
  const found = new Map();

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (!list[i] || !list[j]) continue;
      // Already indistinguishable to everyone — a palette choice, not a
      // colour-vision problem, and not this function's business.
      if (distance(list[i], list[j]) < threshold) continue;

      for (const { key, label } of CVD_KINDS) {
        const delta = distance(simulate(list[i], key), simulate(list[j], key));
        if (delta >= threshold) continue;
        const id = `${i}:${j}`;
        const prev = found.get(id);
        if (!prev || delta < prev.delta) {
          found.set(id, { a: i, b: j, kind: key, label, delta });
        }
      }
    }
  }

  return [...found.values()].sort((x, y) => x.delta - y.delta);
}

/**
 * The colours a chart is actually drawing with, wherever it keeps them.
 *
 * The check first shipped reading the `colors` control, which 58 charts carry.
 * The other 56 hold a colour per series *inside* the data widget — so more
 * than half the library was quietly exempt from a check the product presents
 * as universal. Both places are one question with one answer, and this is it.
 *
 * Two rules it follows:
 *
 * - **Nothing is guessed.** A series with no colour of its own is left out
 *   rather than filled in from `paletteAt(i)`: reporting a pair a reader never
 *   chose would be the same noise the "distinguishable normally" rule exists
 *   to keep out.
 * - **Names travel with colours.** They are filtered in step, so the sentence
 *   `describePairs` writes names the right two series rather than the two that
 *   happened to land at those indices before filtering.
 *
 * @returns {{colors: string[], names: string[], from: 'colors'|'series'|null}}
 */
/** The colour an entry holds, whether it *is* one or merely carries one. */
const colourIn = (entry) => {
  if (typeof entry === 'string') return entry || '';
  if (entry && typeof entry === 'object' && typeof entry.color === 'string') return entry.color;
  return '';
};

export function paletteOf(def, spec) {
  const at = (obj, path) => String(path).split('.')
    .reduce((node, key) => (node == null ? node : node[key]), obj);
  const controls = (def && def.controls) || [];

  // `kept` carries the index each colour came from, so the setter can write
  // back to the entry it was read from rather than to the filtered position.
  const pack = (list, kept, from) => ({
    colors: kept.map((k) => k.colour),
    names: kept.map((k) => k.name),
    from,
    set(i, hex) {
      const slot = kept[i];
      if (!slot || !hex) return false;
      const entry = list[slot.at];
      if (entry && typeof entry === 'object') entry.color = hex;
      else list[slot.at] = hex;
      return true;
    },
  });

  for (const c of controls) {
    if (c.type !== 'colors') continue;
    const list = at(spec, c.key || 'colors');
    if (!Array.isArray(list) || !list.length) continue;
    // A `colors` control usually points at an array of hex. The word cloud
    // points at its words, which carry a colour each — so read the entry when
    // it is a string and its `color` when it is not, rather than dropping a
    // whole chart for keeping its colours one level down.
    const named = (typeof c.names === 'function' && c.names(spec)) || [];
    const kept = list
      .map((entry, i) => ({ colour: colourIn(entry), name: named[i] || '', at: i }))
      .filter((e) => e.colour);
    if (kept.length) return pack(list, kept, 'colors');
  }

  for (const c of controls) {
    if (c.type !== 'series') continue;
    const list = at(spec, c.key || 'series');
    if (!Array.isArray(list)) continue;
    const kept = list
      .map((entry, i) => ({
        colour: colourIn(entry),
        name: (entry && (entry.label || entry.name)) || '',
        at: i,
      }))
      .filter((e) => e.colour);
    // One colour is a palette worth *editing*, even though it is not one worth
    // *checking* — a lone series has no pair that can merge. This used to
    // demand two, which is a colour-vision rule, and it left every
    // single-series chart looking to the editor as though it had no colours at
    // all. Callers that need a pair check the length; this reports what is
    // there.
    if (kept.length) return pack(list, kept, 'series');
  }

  // A single-series chart has one colour and therefore no pair that can merge.
  // That is not a gap in the check; it is the check having nothing to say.
  return { colors: [], names: [], from: null, set: () => false };
}

/** One sentence a reader can act on, or '' when the palette is clear. */
export function describePairs(pairs, name) {
  if (!pairs || !pairs.length) return '';
  const call = (i) => (name && name(i)) || `colour ${i + 1}`;
  const first = pairs[0];
  const rest = pairs.length - 1;
  return `${call(first.a)} and ${call(first.b)} look the same to a ${first.label} reader`
    + (rest ? `, and ${rest} other pair${rest > 1 ? 's' : ''} merge too` : '')
    + '.';
}
