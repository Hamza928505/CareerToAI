/**
 * math.js
 * Pure math utilities for the chart engine.
 * No canvas or DOM dependencies — fully unit-testable.
 */

/* ── Clamping & range ─────────────────────────── */

/** Constrain value to [min, max] */
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** Linear interpolation between a and b by factor t (0→1) */
export const lerp = (a, b, t) => a + (b - a) * t;

/** Inverse lerp: what t maps value v to in [a, b]? */
export const inverseLerp = (a, b, v) => (b === a) ? 0 : (v - a) / (b - a);

/** Map a value from one range to another */
export const remap = (v, fromMin, fromMax, toMin, toMax) =>
  lerp(toMin, toMax, inverseLerp(fromMin, fromMax, v));

/* ── Rounding ─────────────────────────────────── */

export const round = (v, decimals = 0) => {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
};

/** Round to the nearest multiple of `step` */
export const roundTo = (v, step) => Math.round(v / step) * step;

/* ── Angles ───────────────────────────────────── */

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

export const toRad = (deg) => deg * DEG_TO_RAD;
export const toDeg = (rad) => rad * RAD_TO_DEG;

/* ── Distance & geometry ──────────────────────── */

export const dist2D = (x1, y1, x2, y2) =>
  Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

/** Point-on-circle: angle in radians, radius r, centre (cx, cy) */
export const pointOnCircle = (cx, cy, r, angle) => ({
  x: cx + r * Math.cos(angle),
  y: cy + r * Math.sin(angle),
});

/** Midpoint of a line segment */
export const midpoint = (x1, y1, x2, y2) => ({
  x: (x1 + x2) / 2,
  y: (y1 + y2) / 2,
});

/* ── Statistics ───────────────────────────────── */

export const sum     = (arr) => arr.reduce((s, v) => s + v, 0);
export const mean    = (arr) => arr.length ? sum(arr) / arr.length : 0;
export const minOf   = (arr) => Math.min(...arr);
export const maxOf   = (arr) => Math.max(...arr);

export const median  = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const stdev   = (arr) => {
  const m  = mean(arr);
  const sq = arr.map((v) => (v - m) ** 2);
  return Math.sqrt(mean(sq));
};

export const quartiles = (arr) => {
  const s  = [...arr].sort((a, b) => a - b);
  const q2 = median(s);
  const lo = s.slice(0, Math.floor(s.length / 2));
  const hi = s.slice(Math.ceil(s.length / 2));
  return { q1: median(lo), q2, q3: median(hi) };
};

/* ── Array utilities ──────────────────────────── */

/** Stack arrays element-wise (for stacked charts) */
export const stackArrays = (arrays) => {
  if (!arrays.length) return [];
  return arrays.slice(1).reduce(
    (acc, arr) => acc.map((v, i) => v + (arr[i] ?? 0)),
    [...arrays[0]],
  );
};

/** Cumulative sum of an array */
export const cumsum = (arr) => {
  const out = [];
  let s = 0;
  for (const v of arr) { s += v; out.push(s); }
  return out;
};

/** Normalise array values to 0–1 range */
export const normalise = (arr) => {
  const lo = minOf(arr), hi = maxOf(arr), range = hi - lo || 1;
  return arr.map((v) => (v - lo) / range);
};

/** Normalise array so all values sum to 1 (for pie/percentage charts) */
export const normaliseSum = (arr) => {
  const total = sum(arr) || 1;
  return arr.map((v) => v / total);
};

/* ── Hit-test helpers ─────────────────────────── */

/**
 * Find the index of the value in `arr` closest to `target`.
 * Used for finding nearest data point under the cursor.
 */
export const nearestIndex = (arr, target) => {
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const d = Math.abs(arr[i] - target);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx;
};

/**
 * Check if point (px, py) is inside an axis-aligned rect.
 */
export const inRect = (px, py, x, y, w, h) =>
  px >= x && px <= x + w && py >= y && py <= y + h;

/**
 * Check if point (px, py) is within radius r of circle centre (cx, cy).
 */
export const inCircle = (px, py, cx, cy, r) =>
  dist2D(px, py, cx, cy) <= r;