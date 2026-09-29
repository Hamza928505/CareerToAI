/**
 * data.js
 * Dataset validation, normalisation, and parsing utilities.
 * All functions are pure — no side effects, no DOM/canvas dependencies.
 */

import { PALETTE } from './color.js';

/* ── Validation ───────────────────────────────── */

/**
 * Validate chart data structure.
 * Returns { valid: boolean, errors: string[] }.
 *
 * Expected shape:
 * {
 *   labels:   string[],
 *   datasets: [{ label, data: number[], color?, ... }]
 * }
 */
export function validateData(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['data must be an object'] };
  }
  if (!Array.isArray(data.labels)) {
    errors.push('data.labels must be an array');
  }
  if (!Array.isArray(data.datasets)) {
    errors.push('data.datasets must be an array');
  } else {
    data.datasets.forEach((ds, i) => {
      if (!Array.isArray(ds.data)) {
        errors.push(`datasets[${i}].data must be an array`);
      }
      if (data.labels && ds.data && ds.data.length !== data.labels.length) {
        errors.push(`datasets[${i}].data length (${ds.data.length}) must match labels length (${data.labels.length})`);
      }
    });
  }
  return { valid: errors.length === 0, errors };
}

/* ── Normalisation ────────────────────────────── */

/**
 * Assign default colors, labels, and fill colors to datasets
 * that don't specify them. Returns a new array (immutable).
 *
 * @param {Object[]} datasets  Raw dataset array from user config
 * @returns {Object[]}         Normalised datasets with guaranteed color fields
 */
export function normaliseDatasets(datasets) {
  return datasets.map((ds, i) => {
    const color = ds.color ?? ds.borderColor ?? PALETTE[i % PALETTE.length];
    return {
      label:           ds.label ?? `Series ${i + 1}`,
      data:            ds.data  ?? [],
      color,
      borderColor:     color,
      backgroundColor: ds.backgroundColor ?? (color + '26'),  // ~15% alpha hex
      hidden:          ds.hidden ?? false,
      ...ds,           // keep any extra fields the user passed
      // Ensure resolved values always win
      color,
    };
  });
}

/**
 * Filter out null/undefined values from a dataset's data array,
 * returning { values: number[], indices: number[] } for sparse datasets.
 */
export function sparseFilter(data) {
  const values  = [];
  const indices = [];
  data.forEach((v, i) => {
    if (v != null && isFinite(v)) {
      values.push(v);
      indices.push(i);
    }
  });
  return { values, indices };
}

/**
 * Convert a dataset with possible null gaps into segments of
 * consecutive non-null values. Used to draw line charts with gaps.
 *
 * @param {(number|null)[]} data
 * @returns {Array<{ start: number, values: number[] }>}
 */
export function toSegments(data) {
  const segments = [];
  let current    = null;

  data.forEach((v, i) => {
    if (v != null && isFinite(v)) {
      if (!current) { current = { start: i, values: [] }; }
      current.values.push(v);
    } else {
      if (current) { segments.push(current); current = null; }
    }
  });
  if (current) segments.push(current);
  return segments;
}

/* ── CSV / plain-text parsing ─────────────────── */

/**
 * Parse a simple CSV string into a chart-ready data object.
 *
 * Expected format (first row = headers, first col = labels):
 *   Category, Series A, Series B
 *   Jan,      100,      80
 *   Feb,      120,      95
 *
 * @param {string}  csvText
 * @param {Object}  [opts]
 * @param {string}  [opts.delimiter=',']
 * @returns {{ labels: string[], datasets: Object[] }}
 */
export function parseCSV(csvText, { delimiter = ',' } = {}) {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return { labels: [], datasets: [] };

  const headers = lines[0].split(delimiter).map((h) => h.trim());
  const seriesLabels = headers.slice(1);

  const labels  = [];
  const rawData = seriesLabels.map(() => []);

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delimiter).map((c) => c.trim());
    labels.push(cells[0]);
    seriesLabels.forEach((_, j) => {
      const v = parseFloat(cells[j + 1]);
      rawData[j].push(isNaN(v) ? null : v);
    });
  }

  const datasets = seriesLabels.map((label, i) => ({
    label,
    data: rawData[i],
    color: PALETTE[i % PALETTE.length],
  }));

  return { labels, datasets };
}

/**
 * Parse a JSON string or plain object into validated chart data.
 * Throws a descriptive error if shape is wrong.
 */
export function parseJSON(input) {
  const obj = typeof input === 'string' ? JSON.parse(input) : input;
  const { valid, errors } = validateData(obj);
  if (!valid) throw new Error(`[data.js] Invalid chart data:\n  ${errors.join('\n  ')}`);
  return { labels: obj.labels, datasets: normaliseDatasets(obj.datasets) };
}

/* ── Aggregation helpers ──────────────────────── */

/**
 * Compute cumulative (running) total across datasets at each index.
 * Used to offset bars in stacked bar charts.
 *
 * @param {number[][]} arrays  One per dataset, same length
 * @returns {number[][]}       Cumulative bottom values for each dataset
 */
export function stackedBases(arrays) {
  const len   = arrays[0]?.length ?? 0;
  const bases  = arrays.map(() => new Array(len).fill(0));
  const totals = new Array(len).fill(0);

  arrays.forEach((arr, di) => {
    arr.forEach((v, i) => {
      bases[di][i] = totals[i];
      totals[i]   += v ?? 0;
    });
  });
  return bases;
}

/**
 * Normalise all datasets to 100% at each index (for 100% stacked charts).
 *
 * @param {number[][]} arrays
 * @returns {number[][]}
 */
export function normalise100(arrays) {
  const len = arrays[0]?.length ?? 0;
  const totals = Array.from({ length: len }, (_, i) =>
    arrays.reduce((s, a) => s + Math.abs(a[i] ?? 0), 0)
  );
  return arrays.map((arr) =>
    arr.map((v, i) => totals[i] ? (v / totals[i]) * 100 : 0)
  );
}