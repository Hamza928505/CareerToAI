/**
 * transform.js — reshaping a table before it becomes a chart.
 *
 * The wide-table work solved half of this already: `rankCharts` takes a
 * 45-column export and projects out the columns a chart can read. But a
 * projection only *chooses* columns; it cannot combine rows. The file most
 * people actually have is five hundred transactions, and the chart they want
 * is revenue by region — seven bars. No amount of column-picking gets from one
 * to the other, and until now the answer was "aggregate it in a spreadsheet
 * first", which is the step the tool exists to remove.
 *
 * **Transforms are an edit, not a layer.** They run once, in the data editor,
 * and what comes out is written into the grid as literal values — exactly what
 * a paste or a file drop produces. Nothing is stored on the spec and nothing
 * re-derives at render time.
 *
 * That is a deliberate choice against the obvious alternative. Vega-Lite keeps
 * transforms in the spec and applies them when it draws; doing that here would
 * break the rule the whole library is built on — *a renderer reads its data
 * from the spec and nothing else* — and would mean every exported chart had to
 * carry a transform engine to reproduce numbers it could simply have been
 * given. The reader can see what the aggregation produced before they accept
 * it, which is also the honest way round: the numbers on the chart are numbers
 * they looked at.
 *
 * Steps apply in order and each one sees the table the previous one made, so
 * `filter → group → sort → limit` reads exactly as it is written.
 */

import { looksNumeric, transposeTable } from './dataio.js';

/** How a group's rows are folded into one. */
export const AGGREGATES = [
  { id: 'sum', label: 'Total' },
  { id: 'mean', label: 'Average' },
  { id: 'median', label: 'Median' },
  { id: 'min', label: 'Smallest' },
  { id: 'max', label: 'Largest' },
  { id: 'count', label: 'Number of rows' },
];

/** Comparisons a filter can make. `needs` is how many values the UI collects. */
export const TESTS = [
  { id: 'is', label: 'is', needs: 1 },
  { id: 'not', label: 'is not', needs: 1 },
  { id: 'contains', label: 'contains', needs: 1 },
  { id: 'gt', label: 'is more than', needs: 1, numeric: true },
  { id: 'lt', label: 'is less than', needs: 1, numeric: true },
  { id: 'between', label: 'is between', needs: 2, numeric: true },
  { id: 'filled', label: 'is not blank', needs: 0 },
];

/** The operations, in the order the editor offers them. */
export const OPS = [
  { id: 'filter', label: 'Keep rows where…' },
  { id: 'group', label: 'Group rows by…' },
  { id: 'bin', label: 'Bucket a number into ranges' },
  { id: 'sort', label: 'Sort by…' },
  { id: 'limit', label: 'Keep only the first…' },
  { id: 'transpose', label: 'Swap rows and columns' },
];

/**
 * A cell as a number, or NaN.
 *
 * Tolerant in the same way `looksNumeric` is — currency, thousands separators
 * and a trailing percent all survive — because a column that reads as numeric
 * to the validator has to read as numeric to the arithmetic, or a filter would
 * silently drop every row of a table of prices.
 */
export function toNumber(cell) {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : NaN;
  if (cell == null) return NaN;
  const t = String(cell).trim();
  if (!t || !looksNumeric(t)) return NaN;
  const core = t
    .replace(/^[-+]?\s*[$£€¥₹]?\s*/, '')
    .replace(/\s*[%$£€¥₹]?$/, '')
    .replace(/[\s,](?=\d{3}\b)/g, '')
    .replace(',', '.');
  const n = Number(core);
  return Number.isFinite(n) ? (t.trim().startsWith('-') ? -Math.abs(n) : n) : NaN;
}

/**
 * Which columns hold numbers.
 *
 * A column counts as numeric when most of its filled cells read as numbers,
 * not all of them: a real export has a `—` or an `n/a` in a few rows, and
 * refusing to total a column because of three placeholders would rule out most
 * of the files this is for. The same judgement `classifyColumns` makes.
 */
export function numericColumns(table) {
  const out = [];
  const n = table.headers.length || (table.rows[0] || []).length;
  for (let c = 0; c < n; c++) {
    let filled = 0;
    let numeric = 0;
    for (const row of table.rows) {
      const v = row[c];
      if (v == null || String(v).trim() === '') continue;
      filled++;
      if (looksNumeric(v) && Number.isFinite(toNumber(v))) numeric++;
    }
    if (filled && numeric / filled >= 0.8) out.push(c);
  }
  return out;
}

/**
 * Column names that hold a number without meaning a quantity.
 *
 * Totalling an id column produces 124,750 and means nothing, so the group step
 * leaves these out by default. Matched on the *name* rather than the values on
 * purpose: every value-based rule that separates ids from measurements gets it
 * wrong in one direction or the other. Ids are frequently all-distinct
 * integers — and so was the revenue column in the first table this was tested
 * against, which a distinctness rule promptly discarded.
 *
 * A default, never a verdict: the editor shows which columns are being folded
 * and lets any of them be ticked back in.
 */
export const ID_NAME = /^(id|.*[_ -]id|.*id|code|key|uuid|guid|index|idx|no|num|number|row|rank|year|yr)$/i;

/** The columns a group step folds unless told otherwise. */
export function defaultValueCols(table, keyCol) {
  return numericColumns(table).filter((c) => {
    if (c === keyCol) return false;
    return !ID_NAME.test(String(table.headers[c] || '').trim());
  });
}

const clone = (t) => ({ headers: [...t.headers], rows: t.rows.map((r) => [...r]) });

/* ── the operations ──────────────────────────────────────────────────────── */

function opFilter(table, step) {
  const c = step.col | 0;
  const test = step.test || 'is';
  const a = step.a == null ? '' : String(step.a);
  const na = toNumber(step.a);
  const nb = toNumber(step.b);
  const lower = a.toLowerCase();

  const keep = (row) => {
    const raw = row[c] == null ? '' : String(row[c]);
    const text = raw.trim().toLowerCase();
    const num = toNumber(raw);
    switch (test) {
      case 'is': return text === lower.trim();
      case 'not': return text !== lower.trim();
      case 'contains': return text.includes(lower.trim());
      case 'gt': return Number.isFinite(num) && Number.isFinite(na) && num > na;
      case 'lt': return Number.isFinite(num) && Number.isFinite(na) && num < na;
      case 'between':
        return Number.isFinite(num) && Number.isFinite(na) && Number.isFinite(nb)
          && num >= Math.min(na, nb) && num <= Math.max(na, nb);
      case 'filled': return raw.trim() !== '';
      default: return true;
    }
  };

  return { headers: [...table.headers], rows: table.rows.filter(keep) };
}

export function fold(values, agg) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (agg === 'count') return values.length;
  if (!nums.length) return '';
  switch (agg) {
    case 'sum': return nums.reduce((a, b) => a + b, 0);
    case 'mean': return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'median': {
      const s = [...nums].sort((a, b) => a - b);
      const m = s.length >> 1;
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
    case 'min': return nums.reduce((a, b) => Math.min(a, b));
    case 'max': return nums.reduce((a, b) => Math.max(a, b));
    default: return nums.reduce((a, b) => a + b, 0);
  }
}

/** Trim the float noise `0.1 + 0.2` leaves, without lying about big numbers. */
const tidyNumber = (n) => {
  if (!Number.isFinite(n)) return '';
  const r = Math.round(n * 1e6) / 1e6;
  return String(Number.isInteger(r) ? r : +r.toFixed(4));
};

/** Shared by the editor and local analysis. Blank keys stay a separate group. */
export function groupRows(table, col) {
  const buckets = new Map();
  for (const row of table.rows) {
    const key = row[col] == null ? '' : String(row[col]).trim();
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }
  return buckets;
}

function opGroup(table, step) {
  const by = step.col | 0;
  const agg = step.agg || 'sum';
  // An explicit list wins; otherwise fold what looks like a measurement.
  const chosen = Array.isArray(step.vals) ? step.vals : null;
  const valueCols = (chosen || defaultValueCols(table, by))
    .filter((c) => c !== by && c >= 0 && c < (table.headers.length || 0));

  const buckets = groupRows(table, by);
  const order = [...buckets.keys()];

  // `count` answers a question about rows rather than about a column, so it
  // produces one new column instead of folding the ones already there.
  if (agg === 'count' || !valueCols.length) {
    return {
      headers: [table.headers[by] || 'Group', 'Count'],
      rows: order.map((k) => [k, String(buckets.get(k).length)]),
    };
  }

  return {
    headers: [table.headers[by] || 'Group', ...valueCols.map((c) => table.headers[c] || `Column ${c + 1}`)],
    rows: order.map((k) => {
      const group = buckets.get(k);
      return [k, ...valueCols.map((c) => tidyNumber(fold(group.map((r) => toNumber(r[c])), agg)))];
    }),
  };
}

function opSort(table, step) {
  const c = step.col | 0;
  const dir = step.dir === 'desc' ? -1 : 1;
  const rows = [...table.rows].sort((x, y) => {
    const nx = toNumber(x[c]);
    const ny = toNumber(y[c]);
    // Numbers compare as numbers; anything else compares as words, so a column
    // of names sorts alphabetically instead of all landing equal.
    if (Number.isFinite(nx) && Number.isFinite(ny)) return (nx - ny) * dir;
    return String(x[c] ?? '').localeCompare(String(y[c] ?? '')) * dir;
  });
  return { headers: [...table.headers], rows };
}

function opLimit(table, step) {
  const n = Math.max(1, step.n | 0 || 10);
  return { headers: [...table.headers], rows: table.rows.slice(0, n) };
}

function opBin(table, step) {
  const c = step.col | 0;
  const wanted = Math.max(2, Math.min(50, step.bins | 0 || 10));
  const values = table.rows.map((r) => toNumber(r[c])).filter(Number.isFinite);
  if (!values.length) return { headers: ['Range', 'Count'], rows: [] };

  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // Every value identical is one bucket, not a division by zero.
  if (lo === hi) return { headers: ['Range', 'Count'], rows: [[tidyNumber(lo), String(values.length)]] };

  const width = (hi - lo) / wanted;
  const counts = new Array(wanted).fill(0);
  for (const v of values) {
    // The top value belongs in the last bucket, not one past the end.
    const i = Math.min(wanted - 1, Math.floor((v - lo) / width));
    counts[i]++;
  }
  return {
    headers: [`${table.headers[c] || 'Value'} range`, 'Count'],
    rows: counts.map((n, i) => [
      `${tidyNumber(lo + i * width)}–${tidyNumber(lo + (i + 1) * width)}`,
      String(n),
    ]),
  };
}

/**
 * Each row becomes a column and each column a row.
 *
 * The one step here that changes nothing about the numbers — it changes which
 * of them a chart reads as a series. A file laid out with the series down the
 * side, `Product, Q1, Q2` over `Widgets, 10, 20`, is read as a bar per product
 * by every `labelSeries` chart; the same numbers as a bar per quarter need the
 * table the other way round, and this is the only way to get there that does
 * not go through a spreadsheet. `transposeTable` in dataio owns the arithmetic
 * so the gallery's matcher and the grid's own button turn a table identically.
 */
function opTranspose(table) {
  return transposeTable(table);
}

const RUNNERS = { filter: opFilter, group: opGroup, sort: opSort, limit: opLimit, bin: opBin, transpose: opTranspose };

/** The steps Arquero has no equivalent for; a pipeline holding one runs natively. */
const NATIVE_ONLY = new Set(['bin', 'transpose']);

/**
 * Run every step in order.
 *
 * Returns the table after each step as well as the final one, because the
 * editor has to offer each step the columns that exist *at that point* —
 * grouping renames and drops columns, so a sort added after it cannot be
 * choosing from the original headings.
 *
 * A step that throws is skipped and reported rather than taking the run down:
 * half-built steps exist while somebody is still typing one.
 *
 * When Arquero (`window.aq`) is available and no step uses the `bin`
 * operation (not yet ported), the entire pipeline is run through Arquero
 * for better performance on large tables.  If anything goes wrong the
 * function falls back to the built-in runners transparently.
 *
 * @returns {{ table: {headers:string[],rows:string[][]}, stages: Array, errors: string[] }}
 */
export function runSteps(table, steps) {
  let current = clone(table);
  const stages = [clone(current)];
  const errors = [];

  // Use Arquero if available for the entire pipeline.
  // Skip if any step is one Arquero has no equivalent for — a bin, or a
  // transpose, which is not a relational operation at all — because aborting
  // mid-pipeline leaves stages and current in an inconsistent state.
  const nativeOnly = steps && steps.some((s) => s && NATIVE_ONLY.has(s.op));
  if (typeof window.aq !== 'undefined' && steps && steps.length > 0 && !nativeOnly) {
    try {
      const aq = window.aq;
      // Convert to Arquero table
      const data = {};
      const colNames = table.headers.map((h, i) => h || `Column ${i + 1}`);
      colNames.forEach((h, i) => {
        const raw = table.rows.map((r) => r[i]);
        // Coerce a column, not a cell: the native runners fold per value and
        // never turn a whole column numeric, so a column is only numeric here
        // if every non-empty cell parses. Otherwise one stray label would make
        // aq.op.sum return NaN where `fold` quietly skips it.
        const filled = raw.filter((v) => v != null && String(v).trim() !== '');
        const numeric = filled.length > 0
          && filled.every((v) => Number.isFinite(toNumber(v)));
        data[h] = raw.map((v) => {
          if (v == null || String(v).trim() === '') return numeric ? null : '';
          return numeric ? toNumber(v) : String(v);
        });
      });
      let aqTable = aq.table(data);

      (steps || []).forEach((step, i) => {
        try {
          // A half-built step is skipped and reported, the same as the native
          // runners do — someone is still typing one.
          if (!step || !RUNNERS[step.op]) {
            errors.push(`Step ${i + 1} does nothing.`);
            stages.push(clone(current));
            return;
          }
          if (step.op === 'filter') {
            const colName = colNames[step.col];
            const test = step.test || 'is';
            const a = step.a == null ? '' : String(step.a).toLowerCase();
            const na = toNumber(step.a);
            const nb = toNumber(step.b);
            
            // Build arquero escape filter
            aqTable = aqTable.filter(aq.escape((d) => {
              const raw = d[colName];
              const text = raw == null ? '' : String(raw).trim().toLowerCase();
              const num = Number(raw);
              switch (test) {
                case 'is': return text === a.trim();
                case 'not': return text !== a.trim();
                case 'contains': return text.includes(a.trim());
                case 'gt': return Number.isFinite(num) && Number.isFinite(na) && num > na;
                case 'lt': return Number.isFinite(num) && Number.isFinite(na) && num < na;
                case 'between': return Number.isFinite(num) && Number.isFinite(na) && Number.isFinite(nb) && num >= Math.min(na, nb) && num <= Math.max(na, nb);
                case 'filled': return text !== '';
                default: return true;
              }
            }));
          } else if (step.op === 'group') {
            const by = step.col | 0;
            const agg = step.agg || 'sum';
            const byColName = colNames[by];
            const chosen = Array.isArray(step.vals) ? step.vals : null;
            const valueCols = (chosen || defaultValueCols({ headers: colNames, rows: current.rows }, by))
              .filter((c) => c !== by && c >= 0 && c < colNames.length)
              .map(c => colNames[c]);
            
            const rollups = {};
            if (agg === 'count' || !valueCols.length) {
              rollups['Count'] = aq.op.count();
            } else {
              valueCols.forEach(c => {
                if (agg === 'sum') rollups[c] = aq.op.sum(c);
                else if (agg === 'mean') rollups[c] = aq.op.mean(c);
                else if (agg === 'median') rollups[c] = aq.op.median(c);
                else if (agg === 'min') rollups[c] = aq.op.min(c);
                else if (agg === 'max') rollups[c] = aq.op.max(c);
                else rollups[c] = aq.op.sum(c);
              });
            }
            aqTable = aqTable.groupby(byColName).rollup(rollups);
            
          } else if (step.op === 'sort') {
            const colName = colNames[step.col];
            if (step.dir === 'desc') {
              aqTable = aqTable.orderby(aq.desc(colName));
            } else {
              aqTable = aqTable.orderby(colName);
            }
          } else if (step.op === 'limit') {
            const n = Math.max(1, step.n | 0 || 10);
            aqTable = aqTable.slice(0, n);
          }

          if (aqTable) {
            // Read back out
            const outHeaders = aqTable.columnNames();
            const outRows = [];
            aqTable.objects().forEach(obj => {
              outRows.push(outHeaders.map(h => {
                const v = obj[h];
                if (v == null) return '';
                // Match the native runners: trim the float noise an aggregate
                // leaves rather than writing 3.3333333333333335 into the grid.
                return typeof v === 'number' ? tidyNumber(v) : String(v);
              }));
            });
            current = { headers: outHeaders, rows: outRows };
            colNames.length = 0;
            colNames.push(...outHeaders);
          }
        } catch (err) {
          errors.push(`Step ${i + 1} (${step.op}) failed: ${err.message}`);
        }
        stages.push(clone(current));
      });

      return { table: current, stages, errors };
    } catch (e) {
      console.warn("Arquero transform failed, falling back to native", e);
      // fallback to native on error
    }
  }

  // Native fallback
  (steps || []).forEach((step, i) => {
    const run = RUNNERS[step && step.op];
    if (!run) { errors.push(`Step ${i + 1} does nothing.`); stages.push(clone(current)); return; }
    try {
      const next = run(current, step);
      current = {
        headers: next.headers.map((h) => String(h ?? '')),
        rows: next.rows.map((r) => r.map((c) => (c == null ? '' : String(c)))),
      };
    } catch (err) {
      errors.push(`Step ${i + 1} (${step.op}) failed: ${err.message}`);
    }
    stages.push(clone(current));
  });

  return { table: current, stages, errors };
}

/** One step, in the words the editor shows. */
export function describeStep(step, headers) {
  const name = (i) => headers[i] || `column ${(i | 0) + 1}`;
  switch (step && step.op) {
    case 'filter': {
      const t = TESTS.find((x) => x.id === step.test);
      const label = t ? t.label : 'is';
      if (t && t.needs === 0) return `Keep rows where ${name(step.col)} ${label}`;
      if (t && t.needs === 2) return `Keep rows where ${name(step.col)} ${label} ${step.a} and ${step.b}`;
      return `Keep rows where ${name(step.col)} ${label} ${step.a}`;
    }
    case 'group': {
      const a = AGGREGATES.find((x) => x.id === step.agg);
      const verb = (a ? a.label : 'Total').toLowerCase();
      if (step.agg === 'count') return `Group by ${name(step.col)} and count the rows`;
      // Naming the columns is the point: a fold that silently picked them is a
      // fold nobody can check.
      const cols = Array.isArray(step.vals) && step.vals.length
        ? step.vals.map(name).join(', ')
        : 'the number columns';
      return `Group by ${name(step.col)}, ${verb} of ${cols}`;
    }
    case 'bin': return `Bucket ${name(step.col)} into ${step.bins || 10} ranges`;
    case 'sort': return `Sort by ${name(step.col)}, ${step.dir === 'desc' ? 'largest first' : 'smallest first'}`;
    case 'limit': return `Keep the first ${step.n || 10} rows`;
    case 'transpose': return 'Swap rows and columns — each row becomes a column, headed by its first cell';
    default: return 'Unknown step';
  }
}

/** A sensible new step of this kind for the table as it currently stands. */
export function defaultStep(op, table) {
  const nums = numericColumns(table);
  const firstText = table.headers.findIndex((_, i) => !nums.includes(i));
  switch (op) {
    case 'filter': return { op, col: 0, test: 'is', a: '', b: '' };
    case 'group': {
      const key = firstText < 0 ? 0 : firstText;
      return { op, col: key, agg: 'sum', vals: defaultValueCols(table, key) };
    }
    case 'bin': return { op, col: nums[0] ?? 0, bins: 10 };
    case 'sort': return { op, col: nums[0] ?? 0, dir: 'desc' };
    case 'limit': return { op, n: 10 };
    case 'transpose': return { op };
    default: return { op };
  }
}
