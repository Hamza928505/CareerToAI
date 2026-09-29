/**
 * profile.js — what is actually in this table.
 *
 * The gallery could already answer "which charts can read this?", which is a
 * question about *shape*. It could not answer the question a reader holding a
 * spreadsheet actually has, which is "what is in here, is any of it wrong, and
 * what should I draw?" — and those need to know what the columns hold, not
 * merely how many there are.
 *
 * Everything here is a pure function of a `{ headers, rows }` table. No
 * rendering, no DOM, no library: the numbers have to be checkable, and a
 * reader who is told their revenue column has four bad cells has to be able to
 * go and find those four cells.
 *
 * Two rules it keeps, both borrowed from the rest of this codebase:
 *
 * - **Nothing is invented.** A column with no numbers gets no mean. A pair of
 *   columns with too few pairs or no variation gets no correlation. Where there is
 *   not enough to say something true, nothing is said.
 * - **A finding names its evidence.** "4 of 500 cells will read as 0" is
 *   actionable; "data quality issues detected" is not.
 */

import { looksNumeric } from './dataio.js';
import { toNumber, ID_NAME, fold, groupRows, AGGREGATES } from './transform.js';
import { looksDateLike } from './timeaxis.js';

/**
 * Is this an identifier?
 *
 * **By name, never by distinctness**, and that is a lesson this codebase has
 * already paid for once — `transform.js` says it plainly: "every value-based
 * rule breaks in one direction or the other — ids are often all-distinct
 * integers, and so was the revenue column in the first table this was tested
 * against, which a distinctness rule promptly discarded."
 *
 * Written here with a distinctness rule anyway, it flagged `revenue`,
 * `visits`, `value` and 41 of 42 measure columns in a wide export as
 * identifiers — which dropped them from the profile, so the most obvious table
 * in the world (five regions and one measure) produced no suggestion at all.
 *
 * The one value-based signal kept is exact: a column that counts 1, 2, 3 … in
 * order is a row number whatever it is called, and no measurement looks like
 * that by accident.
 */
const looksLikeIdName = (name) => ID_NAME.test(String(name || '').trim());
const isRowCounter = (nums) =>
  nums.length > 3 && nums[0] <= 1 && nums.every((n, i) => n === nums[0] + i);

/** A column of words distinct in every row is a name, not a class. */
const ALL_DISTINCT_MIN_ROWS = 6;

/** Above this many distinct values, a column of words is a name rather than a class. */
const CATEGORY_CEILING = 50;

const isBlank = (v) => v == null || String(v).trim() === '';


// Round for display only: tiny scientific measurements must not become zero.
const tidy = (n) => Number.isFinite(n) ? +n.toPrecision(12) : null;

/**
 * One column, described.
 *
 * `type` is the useful distinction rather than the true one: a chart cares
 * whether a column *measures* something, *names* something, or *orders*
 * something, and those are the three that change what you should draw.
 */
function profileColumn(name, index, values) {
  const filled = values.filter((v) => !isBlank(v));
  const missing = values.length - filled.length;
  const distinct = new Set(filled.map((v) => String(v).trim())).size;

  const nums = filled.map(toNumber).filter(Number.isFinite);
  const numericShare = filled.length ? nums.length / filled.length : 0;
  // The same reading the time axis uses, plus the bare month and quarter
  // names it refuses — a column of `Jan … Dec` is still ordered. One parser,
  // so the report cannot call a column dates that the axis then draws as words.
  const dateShare = filled.length
    ? filled.filter((v) => looksDateLike(v)).length / filled.length
    : 0;

  const col = {
    name, index, missing, distinct,
    count: values.length,
    filled: filled.length,
    numericCount: nums.length,
    invalid: filled.length - nums.length,
    repeated: filled.length - distinct,
    // How many cells a chart would silently read as zero. The single most
    // useful number here, and the one no other surface reports.
    unreadable: filled.filter((v) => !looksNumeric(v)).length,
    numericShare: tidy(numericShare),
    sample: filled.slice(0, 3).map((v) => String(v).trim()),
    type: 'text',
  };

  if (!filled.length) { col.type = 'empty'; return col; }

  // Keep statistics even for mixed columns; the valid/excluded counts explain
  // the denominator. Classification must not make an average inaccessible.
  if (nums.length) {
    const mean = fold(nums, 'mean');
    const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length;
    Object.assign(col, {
      min: fold(nums, 'min'), max: fold(nums, 'max'), mean,
      median: fold(nums, 'median'), sum: fold(nums, 'sum'),
      stdev: Math.sqrt(variance),
    });
  }

  // A date column is ordered, which is what makes a line chart honest.
  if (dateShare >= 0.9) { col.type = 'date'; return col; }

  if (numericShare >= 0.9) {
    const mean = col.mean;
    const sd = col.stdev;
    col.type = 'number';
    col.zeros = nums.filter((n) => n === 0).length;
    col.negatives = nums.filter((n) => n < 0).length;
    // Three standard deviations, reported as the values themselves rather than
    // a count — a reader wants to know *which* row is wrong.
    col.outliers = sd > 0
      ? nums.filter((n) => Math.abs(n - mean) > 3 * sd).slice(0, 5).map(tidy)
      : [];
    col.idLike = looksLikeIdName(name) || isRowCounter(nums);
    return col;
  }

  // Mostly numbers, with enough stragglers to fail the test above. This is the
  // single most useful thing the report can say and it nearly went unsaid: the
  // column is not treated as a measure, so no suggestion mentions it and no
  // "cells will read as 0" warning fires either — the reader is told nothing
  // about the column that is actually stopping them.
  col.nearlyNumeric = numericShare >= 0.5 && numericShare < 0.9;
  if (col.nearlyNumeric) {
    col.badCells = filled.filter((v) => !Number.isFinite(toNumber(v)))
      .slice(0, 4).map((v) => String(v).trim());
  }

  col.type = distinct <= CATEGORY_CEILING ? 'category' : 'text';
  // Words are the case where distinctness *does* mean something: a column with
  // a different value in every row names each row rather than grouping them,
  // so splitting by it gives one group per row and shows nothing.
  col.idLike = looksLikeIdName(name)
    || (distinct === filled.length && filled.length >= ALL_DISTINCT_MIN_ROWS);
  return col;
}

/** Pearson's r over the rows where both columns are numbers. */
export function correlate(a, b) {
  const pairs = [];
  for (let i = 0; i < a.length && i < b.length; i++) {
    const x = toNumber(a[i]);
    const y = toNumber(b[i]);
    if (Number.isFinite(x) && Number.isFinite(y)) pairs.push([x, y]);
  }
  const n = pairs.length;
  if (n < 3) return { n, r: null };
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
  const my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let num = 0; let dx = 0; let dy = 0;
  for (const [x, y] of pairs) {
    num += (x - mx) * (y - my);
    dx += (x - mx) ** 2;
    dy += (y - my) ** 2;
  }
  if (!dx || !dy) return { n, r: null };
  return { n, r: tidy(Math.max(-1, Math.min(1, num / Math.sqrt(dx * dy)))) };
}

/** Full-table grouped arithmetic, never an average of already-averaged groups. */
export function groupSummary(table, by, measure, agg = 'mean') {
  const validColumn = (i) => Number.isInteger(i) && i >= 0 && i < table.headers.length;
  if ((by !== null && !validColumn(by)) || (agg !== 'count' && !validColumn(measure))
    || !AGGREGATES.some((a) => a.id === agg)) throw new Error('Choose valid columns and a calculation.');
  const groups = by === null ? new Map([['All rows', table.rows]]) : groupRows(table, by);
  return [...groups].map(([key, rows]) => {
    const values = rows.map((r) => toNumber(r[measure]));
    const valid = values.filter(Number.isFinite).length;
    const missing = rows.filter((r) => isBlank(r[measure])).length;
    return { key, count: rows.length, valid, missing, invalid: rows.length - valid - missing,
      value: agg === 'count' ? rows.length : (valid ? fold(values, agg) : null) };
  });
}

/** Equality is trimmed cell text, case-sensitive; headers are not column data. */
function duplicateGroups(table) {
  const collect = (items) => {
    const seen = new Map();
    items.forEach((cells, i) => {
      const key = JSON.stringify(cells.map((v) => String(v ?? '').trim()));
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(i);
    });
    return [...seen.values()].filter((group) => group.length > 1);
  };
  const rows = collect(table.rows.map((r) => table.headers.map((_, i) => r[i])));
  const columns = table.rows.length ? collect(table.headers.map((_, i) => table.rows.map((r) => r[i]))) : [];
  return { rows, columns,
    rowCount: rows.reduce((n, group) => n + group.length - 1, 0),
    columnCount: columns.reduce((n, group) => n + group.length - 1, 0) };
}

/**
 * Which categorical column most separates a measure.
 *
 * "Worth plotting against what" is the question, and the answer is the column
 * whose groups have the most different means — the split that would actually
 * show something.
 */
function separation(rows, byCol, measureCol) {
  const groups = new Map();
  for (const r of rows) {
    const k = String(r[byCol.index] ?? '').trim();
    const v = toNumber(r[measureCol.index]);
    if (!k || !Number.isFinite(v)) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(v);
  }
  if (groups.size < 2 || [...groups.values()].some((vs) => vs.length < 2)) return null;
  const means = [...groups.values()].map((vs) => vs.reduce((a, b) => a + b, 0) / vs.length);
  const lo = Math.min(...means);
  const hi = Math.max(...means);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi === lo) return null;
  // As a share of the measure's own spread, so it compares across columns.
  const range = (measureCol.max ?? hi) - (measureCol.min ?? lo);
  return {
    by: byCol.name,
    measure: measureCol.name,
    groups: groups.size,
    spread: tidy(range ? (hi - lo) / range : 0),
  };
}

/**
 * Everything that is wrong, or worth a second look, before this becomes a chart.
 *
 * Ordered by how badly it would mislead: a cell that silently reads as zero
 * beats a duplicated row, which beats a column nobody will be able to read.
 */
function qualityNotes(cols, duplicates) {
  const out = [];

  for (const c of cols) {
    if (c.type === 'empty') {
      out.push({ level: 'warn', column: c.name, text: `"${c.name}" is empty — every cell is blank.` });
      continue;
    }
    // The one that actually ruins charts: mostly-numbers with a few that are not.
    if (c.type === 'number' && c.unreadable) {
      out.push({
        level: 'bad',
        column: c.name,
        text: `${c.unreadable} of ${c.filled} cells in "${c.name}" will be read as 0 — they are not numbers.`,
      });
    }
    if (c.nearlyNumeric) {
      out.push({
        level: 'bad',
        column: c.name,
        text: `"${c.name}" is ${Math.round(c.numericShare * 100)}% numbers — `
          + `${c.filled - Math.round(c.numericShare * c.filled)} cell`
          + `${c.filled - Math.round(c.numericShare * c.filled) === 1 ? '' : 's'} `
          + `(${c.badCells.join(', ')}) stop it being read as a measure at all.`,
      });
    }
    if (c.missing) {
      out.push({
        level: c.missing / c.count > 0.2 ? 'warn' : 'info',
        column: c.name,
        text: `"${c.name}" is missing ${c.missing} of ${c.count} values.`,
      });
    }
    if (c.idLike && c.type === 'number') {
      out.push({
        level: 'warn',
        column: c.name,
        text: `"${c.name}" looks like an identifier — totalling it produces a number that means nothing.`,
      });
    }
    if (c.type === 'number' && c.outliers && c.outliers.length) {
      out.push({
        level: 'info',
        column: c.name,
        text: `"${c.name}" has ${c.outliers.length === 5 ? '5+' : c.outliers.length} `
          + `value${c.outliers.length === 1 ? '' : 's'} more than three deviations out (${c.outliers.join(', ')}) — `
          + 'they will set the axis for everything else.',
      });
    }
    // A date stored as text still sorts as text, so 10 March lands before 2 March.
    if ((c.type === 'text' || c.type === 'category') && c.sample.some((v) => looksDateLike(v))) {
      out.push({
        level: 'warn',
        column: c.name,
        text: `"${c.name}" looks like dates in an inconsistent format — they will sort as words, not as time.`,
      });
    }
  }

  const dupes = duplicates.rowCount;
  if (dupes) {
    out.push({
      level: 'warn',
      text: `${dupes} row${dupes === 1 ? ' is a duplicate' : 's are duplicates'} of an earlier one — `
        + 'totals will count them twice.',
    });
  }

  const order = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/**
 * Describe a table.
 *
 * @param {{headers: string[], rows: string[][]}} table
 * @returns {object} columns, quality notes and relationships
 */
export function profileTable(table) {
  const headers = table.headers || [];
  const rows = table.rows || [];

  const columns = headers.map((h, i) =>
    profileColumn(h || `Column ${i + 1}`, i, rows.map((r) => r[i])));

  const numbers = columns.filter((c) => c.type === 'number' && !c.idLike);
  const categories = columns.filter((c) => c.type === 'category' && !c.idLike);
  const dates = columns.filter((c) => c.type === 'date');
  const groups = columns.filter((c) => !c.idLike && c.distinct >= 2
    && c.distinct <= CATEGORY_CEILING && c.distinct < c.filled);
  const duplicates = duplicateGroups({ headers, rows });

  // Every numeric pair, strongest first, and only the ones worth a sentence.
  const correlations = [];
  const copies = new Set(duplicates.columns.flatMap((g) => g.slice(1)));
  const variable = numbers.filter((c) => c.min !== c.max && !copies.has(c.index));
  // ponytail: bound automatic pair scanning on very wide tables; any pair is
  // still available in the explicit comparison, always using every row.
  const scanned = variable.slice(0, 40);
  const values = scanned.map((c) => rows.map((row) => toNumber(row[c.index])));
  for (let i = 0; i < scanned.length; i++) {
    for (let j = i + 1; j < scanned.length; j++) {
      const { r, n } = correlate(
        values[i], values[j],
      );
      if (r != null && n >= 12 && Math.abs(r) >= 0.5) {
        correlations.push({ a: scanned[i].name, b: scanned[j].name, r, n,
          aIndex: scanned[i].index, bIndex: scanned[j].index });
      }
    }
  }
  correlations.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));

  const separators = [];
  for (const cat of groups.slice(0, 40)) {
    for (const num of scanned) {
      if (cat.index === num.index) continue;
      const s = separation(rows, cat, num);
      if (s && s.spread >= 0.25) separators.push(s);
    }
  }
  separators.sort((a, b) => b.spread - a.spread);

  return {
    rows: rows.length,
    cols: headers.length,
    columns,
    numbers,
    categories,
    dates,
    groups,
    duplicates,
    relationshipsLimited: variable.length > scanned.length || groups.length > 40,
    quality: qualityNotes(columns, duplicates),
    correlations: correlations.slice(0, 5),
    separators: separators.slice(0, 3),
  };
}
