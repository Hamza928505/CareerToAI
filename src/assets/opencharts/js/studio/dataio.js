/**
 * dataio.js — parse pasted tabular text into the shapes chart specs use.
 *
 * The premise of OpenCharts is "bring your data, take the code", so every
 * chart needs a way in. Rather than 60-odd bespoke editors, charts declare a
 * `data` descriptor naming the shape they want, and this module turns whatever
 * the user pasted into that shape.
 *
 * Delimiters are sniffed rather than configured: people paste from Excel (tabs),
 * from a CSV file (commas), or type by hand (spaces). Asking them which is a
 * question they should never have to answer.
 */

import { PALETTE } from './palette.js';

/** Split a line respecting double-quoted fields. */
function splitLine(line, delim) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delim) {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Guess the delimiter from the first few lines: whichever candidate appears
 * the most consistently per line wins.
 *
 * Lines that do not split at all sit out the vote rather than ending it. An
 * exported spreadsheet opens with a title row — one cell of prose above the
 * table — and scoring the candidates from that row concluded there was no
 * delimiter in the file, then fell through to splitting on whitespace, which
 * shredded every real column before anything downstream saw it.
 */
function sniffDelimiter(lines) {
  const candidates = ['\t', ',', ';', '|'];
  let best = null;
  let bestScore = 0;
  for (const d of candidates) {
    const counts = lines.slice(0, 12).map((l) => splitLine(l, d).length).filter((c) => c > 1);
    if (!counts.length) continue;
    const first = counts[0];
    const consistent = counts.every((c) => c === first);
    const score = (consistent ? 100 : 0) + first;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  if (best) return best;
  // Fall back to whitespace for hand-typed input.
  return /\s{2,}|\s/.test(lines[0] || '') ? /\s+/ : ',';
}

/**
 * Split the whole text into records, honouring a quoted field that spans
 * newlines.
 *
 * Splitting into lines first and parsing each one is wrong for any cell holding
 * a line break — a wrapped note, an address — and a spreadsheet exports those
 * quoted, exactly as CSV says to. Every row after such a cell shifts by one and
 * the table quietly gains rows nobody typed.
 *
 * A quote only opens a field at the *start* of one, which is what stops a stray
 * inch mark (`5" pipe`) swallowing the rest of the file.
 */
function splitRecords(text, delim) {
  const rows = [];
  let row = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += ch;
    } else if (ch === '"' && cur === '') {
      quoted = true;
    } else if (ch === delim) {
      row.push(cur); cur = '';
    } else if (ch === '\n') {
      row.push(cur); rows.push(row); row = []; cur = '';
    } else {
      cur += ch;
    }
  }
  row.push(cur);
  rows.push(row);
  return rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c.length));
}

/** The most rows of title and banner that can sit above a table. */
const MAX_PREAMBLE = 6;

/**
 * How many leading rows to drop before the table proper begins.
 *
 * A spreadsheet written for people rarely starts at its header. It starts with
 * a title in A1, and often a second row of merged section banners — `DETECTION`
 * over three columns, `STEREO RAW` over four — with gaps between them. Both are
 * rows in the file and neither is data, so the header detection below saw prose
 * over prose, concluded there was no header at all, and named the columns
 * `Label, Series 1, …`. Every column then held those two rows of words, so no
 * column read as numbers and not one chart in the library could take the table.
 *
 * The rule is narrow on purpose. A preamble row is one that fills materially
 * fewer cells than the widest row does, and rows are dropped only when what is
 * left underneath reads as a header over data. A ragged first row of genuine
 * data — a tree whose first path is one level deep — fails that second test and
 * is kept.
 */
function preambleRows(grid) {
  const filled = (r) => r.reduce((n, c) => n + (String(c) === '' ? 0 : 1), 0);
  const body = Math.max(...grid.map(filled));
  // Below four columns "fills fewer cells" says nothing, and two rows leave no
  // room for a preamble and a header and a line of data.
  if (body < 4 || grid.length < 3) return 0;

  let i = 0;
  while (i < grid.length - 2 && i < MAX_PREAMBLE && filled(grid[i]) < body * 0.8) i++;
  if (!i) return 0;

  const head = grid[i];
  const under = grid[i + 1];
  const headIsWords = head.every((c) => c === '' || !looksNumeric(c));
  const underHasNumber = under.some((c) => c !== '' && looksNumeric(c));
  return headIsWords && underHasNumber ? i : 0;
}

/**
 * True when a cell reads as a number to a person.
 *
 * Deliberately narrower than "strip everything that is not a digit": that rule
 * makes `Q1` numeric, which breaks header detection on any table with quarter
 * or period columns. Currency symbols, thousands separators and a trailing
 * percent are allowed; stray letters are not.
 */
const CURRENCY = '$£€¥₹';
const isDigit = (c) => c >= '0' && c <= '9';
const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r'
  || c === '\f' || c === '\v' || c === '\u00a0';
const isGroupSep = (c) => c === ' ' || c === ',' || c === '.';
const isDecimalSep = (c) => c === ',' || c === '.';

/**
 * The mantissa, as digit runs and the separators between them.
 *
 * Scanned rather than matched. The two patterns this replaced were ambiguous —
 * `\d*[.,]?\d+` can split a run of digits in as many ways as it is long, and
 * `(?:[ ,.]\d{3})*(?:[.,]\d+)?` cannot tell a thousands group from a decimal
 * without trying both — so each cost O(n²) on a long run of digits that failed
 * at the end. Every cell of every pasted table comes through here, and a table
 * is somebody else's file, so quadratic was the wrong shape for it whatever
 * the constant. Reported by CodeQL as a polynomial regular expression on
 * uncontrolled data, and it was right.
 *
 * @returns {{runs: number[], seps: string[]} | null} null if a character
 *   appears that is neither a digit nor a separator.
 */
function scanMantissa(m) {
  const runs = [];
  const seps = [];
  let run = 0;
  for (let i = 0; i < m.length; i++) {
    const c = m[i];
    if (isDigit(c)) { run++; continue; }
    if (!isGroupSep(c)) return null;
    runs.push(run);
    seps.push(c);
    run = 0;
  }
  runs.push(run);
  return { runs, seps };
}

/** `1,234`, `1 234 567`, `1.234.567,89` — grouped thousands, maybe a decimal. */
function isGrouped(runs, seps) {
  if (runs[0] < 1 || runs[0] > 3) return false;
  const n = seps.length;
  if (n === 0) return true;
  // Either every separator introduces a group of exactly three…
  let allThrees = true;
  for (let i = 1; i <= n; i++) if (runs[i] !== 3) { allThrees = false; break; }
  if (allThrees) return true;
  // …or all but the last do, and the last introduces the decimal.
  for (let i = 1; i < n; i++) if (runs[i] !== 3) return false;
  return runs[n] >= 1 && isDecimalSep(seps[n - 1]);
}

/** `42`, `1234.5`, `.5` — one run, at most one decimal separator. */
function isPlain(runs, seps) {
  if (seps.length === 0) return runs[0] >= 1;
  if (seps.length !== 1) return false;
  return isDecimalSep(seps[0]) && runs[1] >= 1;
}

const looksNumeric = (cell) => {
  if (cell === '' || cell == null) return true;
  const s = String(cell).trim();
  if (!s) return true;

  // Peel a leading sign and currency, and a trailing percent or currency —
  // the same two edges the regexes used to strip, in the same order.
  let i = 0;
  let j = s.length;
  if (s[i] === '+' || s[i] === '-') i++;
  while (i < j && isSpace(s[i])) i++;
  if (i < j && CURRENCY.includes(s[i])) i++;
  while (i < j && isSpace(s[i])) i++;
  while (j > i && isSpace(s[j - 1])) j--;
  if (j > i && (s[j - 1] === '%' || CURRENCY.includes(s[j - 1]))) j--;
  while (j > i && isSpace(s[j - 1])) j--;
  if (j <= i) return false;

  const core = s.slice(i, j);

  // An exponent, if there is one, is everything from the first e — a second
  // one is a stray letter and fails below, as it did before.
  let mantissa = core;
  const e = core.search(/[eE]/);
  if (e >= 0) {
    mantissa = core.slice(0, e);
    let k = e + 1;
    if (core[k] === '+' || core[k] === '-') k++;
    if (k >= core.length) return false;
    for (; k < core.length; k++) if (!isDigit(core[k])) return false;
  }

  const scan = scanMantissa(mantissa);
  if (!scan) return false;
  return isGrouped(scan.runs, scan.seps) || isPlain(scan.runs, scan.seps);
};

const allNumeric = (cells) => cells.length > 0 && cells.every(looksNumeric);

const num = (v, fallback = 0) => {
  if (v == null || v === '') return fallback;
  // Tolerate 1,234.5 / 1 234,5 / $1,234 / 42% — people paste formatted numbers.
  const cleaned = String(v).replace(/[^0-9eE+\-.,]/g, '');
  const dot = cleaned.lastIndexOf('.');
  const comma = cleaned.lastIndexOf(',');
  let normalised = cleaned;
  if (comma > dot) normalised = cleaned.replace(/\./g, '').replace(',', '.');
  else normalised = cleaned.replace(/,/g, '');
  const n = Number(normalised);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Parse pasted text into { headers, rows }.
 *
 * A header row is detected rather than assumed: words on top, numbers below.
 *
 * @param {string} text
 * @param {string[]|boolean} [expected] `true` or `false` when the caller
 *   *knows* whether the first row is a header — the data editor does, because
 *   it holds the headers apart from the rows and only flattens them to CSV on
 *   the way here, and so does a reader who has been shown the question.
 *   Otherwise the column names this chart reads, from
 *   `expectedFormat(def).columns`, which are consulted for tables holding no
 *   numbers at all, where the shape of the data cannot say which row is which.
 * @returns {{ headers: string[], rows: string[][], hadHeader: boolean, skipped: number }}
 *   `skipped` is how many title or banner rows were dropped from above the
 *   table, so a caller can say so rather than leave the reader wondering where
 *   the first rows of their file went.
 */
/**
 * JSON, read as a table — where it is one.
 *
 * Developers arrive with `[{ region: 'North', sales: 520 }, …]` from an API,
 * and the matcher read only delimited text: the paste box turned it away as
 * "JSON, not a table", which was true of the syntax and false of the content.
 * Rows of records are a table whatever punctuation they came wrapped in.
 *
 * Four shapes are read, and only these:
 *   - an array of flat objects — the common API answer; nested objects
 *     flatten to `parent.child` keys, arrays of primitives join with `; `
 *   - an array of arrays — rows, with the header worked out as for CSV
 *   - an object wrapping one of those under some key — `{ rows: [...] }`,
 *     `{ data: [...] }`, or whichever property is the first array of records
 *   - a columnar object — `{ region: [...], sales: [...] }`, equal lengths
 * and JSON Lines, one object per line. Anything else — a config file, a
 * package.json, a lone number — is not a table and is refused as before.
 *
 * Returns the table as CSV text plus whether its header is known, so it
 * enters through `parseTable` and every later step is the one a paste takes.
 *
 * @returns {{ text: string, header: boolean } | null}
 */
export function jsonAsCsv(text) {
  const raw = String(text || '').trim();
  if (!/^[[{]/.test(raw)) return null;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    // JSON Lines: one record per line, no brackets around the lot.
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2 || !lines.every((l) => /^\{.*\}$/.test(l))) return null;
    try { value = lines.map((l) => JSON.parse(l)); } catch { return null; }
  }
  const isRecord = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const isRow = (v) => Array.isArray(v) || isRecord(v);

  // Unwrap: an object holding the rows under some key, or holding columns.
  if (isRecord(value)) {
    const keys = Object.keys(value);
    const preferred = ['rows', 'data', 'items', 'results', 'records', 'values'];
    const holder = preferred.find((k) => Array.isArray(value[k]) && value[k].length && value[k].every(isRow))
      || keys.find((k) => Array.isArray(value[k]) && value[k].length && value[k].every(isRow));
    if (holder) {
      value = value[holder];
    } else if (keys.length >= 2 && keys.every((k) => Array.isArray(value[k]))
      && new Set(keys.map((k) => value[k].length)).size === 1 && value[keys[0]].length) {
      // Columnar: turn the columns on their side.
      const n = value[keys[0]].length;
      const rows = Array.from({ length: n }, (_, i) => keys.map((k) => value[k][i]));
      return { text: toCSV(keys, rows.map((r) => r.map(cellText))), header: true };
    } else {
      return null;
    }
  }
  if (!Array.isArray(value) || !value.length || !value.every(isRow)) return null;

  if (value.every(Array.isArray)) {
    return { text: toCSV(null, value.map((r) => r.map(cellText))), header: false };
  }
  if (!value.every(isRecord)) return null;

  // Records: flatten, with keys in the order they were first seen.
  const flat = value.map((rec) => flattenRecord(rec));
  const headers = [];
  flat.forEach((rec) => Object.keys(rec).forEach((k) => { if (!headers.includes(k)) headers.push(k); }));
  if (!headers.length) return null;
  const rows = flat.map((rec) => headers.map((h) => cellText(rec[h])));
  return { text: toCSV(headers, rows), header: true };
}

/** A JSON value as one cell. */
function cellText(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(cellText).join('; ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** `{ a: { b: 1 } }` → `{ 'a.b': 1 }`, three levels down at most. */
function flattenRecord(rec, prefix = '', depth = 0, out = {}) {
  Object.keys(rec).forEach((k) => {
    const v = rec[k];
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && depth < 3) flattenRecord(v, key, depth + 1, out);
    else out[key] = v;
  });
  return out;
}

export function parseTable(text, expected) {
  // JSON comes in through the same door and leaves as CSV: what follows is
  // the one path every table takes, so a record's header row is a header row
  // by construction and needs no guessing.
  const asJson = jsonAsCsv(text);
  if (asJson) {
    text = asJson.text;
    if (asJson.header) expected = true;
  }
  const body = String(text || '').replace(/\r\n?/g, '\n');
  const lines = body.split('\n').map((l) => l.trim()).filter((l) => l.length);

  if (!lines.length) return { headers: [], rows: [], hadHeader: false, skipped: 0 };

  // The delimiter is sniffed from lines, but the records are read from the
  // whole text, so a quoted cell holding a line break stays one cell.
  const delim = sniffDelimiter(lines);
  const grid = delim instanceof RegExp
    ? lines.map((l) => l.split(delim).map((c) => c.trim()))
    : splitRecords(body, delim);

  const width = Math.max(...grid.map((r) => r.length));
  grid.forEach((r) => { while (r.length < width) r.push(''); });

  // A title and a row of merged section banners are rows in the file and
  // neither is data. Drop them before anything reasons about which row is the
  // header — a caller passing `false` has told us there is no header to find,
  // so it is telling us about the rows it already holds and nothing is dropped.
  const skipped = expected === false ? 0 : preambleRows(grid);
  if (skipped) grid.splice(0, skipped);

  // Header detection: the top row is all words, and the row under it has a
  // number somewhere.
  //
  // This used to look only at the columns *after* the first, and to require
  // every one of them to be numeric. Both halves were wrong for any table
  // that names more than one thing per row: `from,to,value` above
  // `Organic,Visit,4200` failed the test, so every flow chart read its own
  // header as data and drew a phantom "from → to" ribbon.
  //
  // Some tables are honestly ambiguous and no rule settles them: in
  // `label,2023,2024` over `North,520,680` the header row is numeric, because
  // the columns are years. A caller that knows passes `true` rather than
  // leaving the guess to fail — which it did, on the seventeen charts whose
  // series are named after a year.
  if (expected === false) {
    return {
      headers: grid[0].map((_, i) => (i === 0 ? 'Label' : `Series ${i}`)),
      rows: grid,
      hadHeader: false,
      skipped,
    };
  }
  let hadHeader = expected === true && grid.length > 1;
  if (!hadHeader && grid.length > 1) {
    const topIsWords = grid[0].every((c) => c === '' || !looksNumeric(c));
    hadHeader = topIsWords && grid[1].some((c) => c !== '' && looksNumeric(c));
  }

  // A table of names — an edge list, say — holds no numbers at all, so no
  // amount of staring at it reveals the header. The chart's own column names
  // do: a first row that reads `source,target` is a header, not an edge.
  if (!hadHeader && grid.length > 1 && Array.isArray(expected) && expected.length) {
    const norm = (v) => String(v).trim().toLowerCase();
    const want = expected.map(norm);
    const got = grid[0].map(norm);
    hadHeader = got.length >= want.length && want.every((w, i) => w === got[i]);
  }

  const headers = hadHeader
    ? grid[0].map((h, i) => h || `Column ${i + 1}`)
    : grid[0].map((_, i) => (i === 0 ? 'Label' : `Series ${i}`));

  return { headers, rows: hadHeader ? grid.slice(1) : grid, hadHeader, skipped };
}

/**
 * The same table turned ninety degrees: each row becomes a column, headed by
 * its first cell, and the header row becomes the first column.
 *
 * A chart reads a table one way — `labelSeries` takes a series from each
 * column, `rowSeries` from each row — and a file arrives whichever way its
 * author laid it out. `Product, Q1, Q2` over `Widgets, 10, 20` is a bar per
 * product with a series per quarter; the same numbers as a series per product
 * need the table the other way round, and until now the only way to get there
 * was a spreadsheet. This is that step, done in front of the reader.
 *
 * `headers` may be empty, for a table that had no header row: then the rows
 * alone are turned, and the first column — which is what actually named them —
 * becomes the header. Ragged rows are squared off with blanks first, so a
 * short row does not shift the columns under it.
 *
 * @param {{headers?: string[], rows: string[][]}} table
 * @returns {{headers: string[], rows: string[][]}}
 */
export function transposeTable(table) {
  const headers = (table && table.headers) || [];
  const rows = (table && table.rows) || [];
  const grid = headers.length ? [headers, ...rows] : [...rows];
  if (!grid.length) return { headers: [], rows: [] };

  const width = Math.max(...grid.map((r) => r.length));
  const cell = (r, c) => (r[c] == null ? '' : String(r[c]));
  const turned = [];
  for (let c = 0; c < width; c++) turned.push(grid.map((r) => cell(r, c)));

  return {
    headers: turned[0].map((h, i) => h || `Column ${i + 1}`),
    rows: turned.slice(1),
  };
}

/** Render a { headers, rows } table back to CSV, for the editor's initial value. */
export function toCSV(headers, rows) {
  const esc = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const out = [];
  if (headers && headers.length) out.push(headers.map(esc).join(','));
  rows.forEach((r) => out.push(r.map(esc).join(',')));
  return out.join('\n');
}

/* ── Shape adapters ──────────────────────────────────────────────────────────
 * Each takes the parsed table and returns a patch to merge into the spec.
 * They are deliberately forgiving: a user who pastes the wrong shape should
 * get a sensible chart, not an exception.
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * The colour a series gets when it does not already have one.
 *
 * Read from `palette.js` rather than copied. It *was* copied, and the copy had
 * already drifted: the palette was corrected for colour-blind readers and this
 * list still held the eight that collided, so every series created by a paste
 * or a new column brought the old set back one colour at a time. Two lists
 * that have to agree are one list.
 */
const colourAt = (i, existing) => (existing && existing[i] && existing[i].color)
  || PALETTE[i % PALETTE.length];

export const SHAPES = {
  /**
   * label + one column per series → { labels, series:[{label,color,data}] }
   * The most common shape by far.
   */
  labelSeries(table, spec, opts = {}) {
    const { headers, rows } = table;
    if (!rows.length) return null;
    const labels = rows.map((r) => r[0] || '');
    const seriesCount = Math.max(1, Math.min(headers.length - 1, opts.maxSeries || 8));
    const prev = spec[opts.key || 'series'] || [];
    const series = [];
    for (let c = 1; c <= seriesCount; c++) {
      series.push({
        label: headers[c] || `Series ${c}`,
        color: colourAt(c - 1, prev),
        data: rows.map((r) => num(r[c])),
      });
    }
    return { [opts.labelsKey || 'labels']: labels, [opts.key || 'series']: series };
  },

  /**
   * The transpose of labelSeries: each *row* is a series, each further column
   * a point along it.
   *
   * Sparklines, horizon bands and Likert scales are all naturally written this
   * way — one line per metric — and forcing people to transpose their
   * spreadsheet first would be a poor trade.
   */
  rowSeries(table, spec, opts = {}) {
    const { headers, rows } = table;
    if (!rows.length) return null;
    const key = opts.key || 'series';
    const prev = spec[key] || [];
    const series = rows.map((r, i) => {
      const existing = prev.find((p) => p.label === r[0]) || prev[i] || {};
      return {
        ...existing,
        label: r[0] || `Series ${i + 1}`,
        color: colourAt(i, prev),
        data: r.slice(1).map((c) => num(c)),
      };
    });
    const patch = { [key]: series };
    // Column headers become the shared category labels.
    if (opts.labelsKey !== false) patch[opts.labelsKey || 'labels'] = headers.slice(1);
    return patch;
  },

  /** label + single value column → { labels, values } */
  labelValue(table, spec, opts = {}) {
    const { rows } = table;
    if (!rows.length) return null;
    return {
      [opts.labelsKey || 'labels']: rows.map((r) => r[0] || ''),
      [opts.valuesKey || 'values']: rows.map((r) => num(r[1])),
    };
  },

  /** label + value → an array of {label, value, color} items. */
  items(table, spec, opts = {}) {
    const { rows } = table;
    if (!rows.length) return null;
    const key = opts.key || 'items';
    const prev = spec[key] || [];
    const extra = opts.fields || [];
    return {
      [key]: rows.map((r, i) => {
        const item = {
          label: r[0] || `Item ${i + 1}`,
          color: colourAt(i, prev),
        };
        // First numeric column is the primary value; any declared extra
        // fields consume the columns after it.
        item[opts.valueField || 'value'] = num(r[1]);
        extra.forEach((f, k) => { item[f] = num(r[2 + k]); });
        return item;
      }),
    };
  },

  /** label + two numeric columns → paired rows (dumbbell, span, spine, slope). */
  pairs(table, spec, opts = {}) {
    const { headers, rows } = table;
    if (!rows.length) return null;
    const key = opts.key || 'rows';
    const prev = spec[key] || [];
    const [a, b] = opts.fields || ['start', 'end'];
    const patch = {
      [key]: rows.map((r, i) => ({
        label: r[0] || `Row ${i + 1}`,
        [a]: num(r[1]),
        [b]: num(r[2]),
        color: colourAt(i, prev),
      })),
    };
    if (opts.headerLabels) {
      const [ha, hb] = opts.headerLabels;
      if (headers[1]) patch[ha] = headers[1];
      if (headers[2]) patch[hb] = headers[2];
    }
    return patch;
  },

  /** A flat numeric list → raw observations for the distribution charts. */
  observations(table, spec, opts = {}) {
    const { headers, rows } = table;
    if (!rows.length) return null;
    // Two layouts are both common: one column per group (wide), or a
    // group/value pair per row (long). Detect which.
    const wide = rows.every((r) => allNumeric(r.filter((c) => c !== '')));
    const key = opts.key || 'groups';
    const prev = spec[key] || [];

    if (wide) {
      const cols = Math.max(...rows.map((r) => r.length));
      const groups = [];
      for (let c = 0; c < cols; c++) {
        const values = rows.map((r) => r[c]).filter((v) => v !== '' && v != null).map((v) => num(v));
        if (!values.length) continue;
        groups.push({
          label: (table.hadHeader && headers[c]) || `Group ${c + 1}`,
          color: colourAt(groups.length, prev),
          values,
        });
      }
      return groups.length ? { [key]: groups, dataMode: 'observations' } : null;
    }

    // Long form: first column names the group, second holds the value.
    const byGroup = new Map();
    rows.forEach((r) => {
      const g = r[0] || 'Group 1';
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(num(r[1]));
    });
    const groups = [...byGroup.entries()].map(([label, values], i) => ({
      label, values, color: colourAt(i, prev),
    }));
    return groups.length ? { [key]: groups, dataMode: 'observations' } : null;
  },

  /**
   * from,to,…,value → flow links (sankey, chord).
   *
   * Every column but the last names a node, so one row may be a whole path:
   * `Ad, Visit, Checkout, 320` is 320 flowing Ad → Visit *and* Visit →
   * Checkout. A funnel with three stages is the ordinary case, and writing it
   * one hop per row means typing every middle stage twice and keeping the two
   * copies in step by hand.
   *
   * A hop that appears in more than one path is summed rather than pushed
   * twice: two routes through the same middle are one ribbon carrying their
   * total, not two ribbons drawn on top of each other.
   */
  links(table, spec, opts = {}) {
    const { rows } = table;
    if (!rows.length) return null;
    const key = opts.key || 'flows';
    const fromF = opts.fromField || 'from';
    const toF = opts.toField || 'to';
    const valF = opts.valueField || 'flow';

    // The last column is the amount; everything before it is a stage. Two
    // columns and no amount is still a link — each one counts as 1.
    const width = Math.max(2, ...rows.map((r) => r.length));
    const stages = Math.max(2, width - 1);

    const order = [];
    const byHop = new Map();
    rows.forEach((r) => {
      const value = num(r[stages], 1);
      for (let i = 0; i + 1 < stages; i++) {
        const a = String(r[i] ?? '').trim();
        const b = String(r[i + 1] ?? '').trim();
        // A blank stage is a shorter path, not a link to nowhere; a stage
        // repeated back to back is a loop the layout cannot resolve.
        if (!a || !b || a === b) continue;
        const id = JSON.stringify([a, b]);
        if (!byHop.has(id)) {
          byHop.set(id, { [fromF]: a, [toF]: b, [valF]: 0 });
          order.push(id);
        }
        byHop.get(id)[valF] += value;
      }
    });

    const links = order.map((id) => byHop.get(id));
    if (!links.length) return null;

    const patch = { [key]: links };
    // Refresh the node list so colours and legends follow the new links.
    if (opts.nodesKey) {
      const seen = [];
      links.forEach((l) => {
        [l[fromF], l[toF]].forEach((n) => { if (!seen.includes(n)) seen.push(n); });
      });
      patch[opts.nodesKey] = seen;
      patch[opts.colorsKey || 'colors'] = seen.map((_, i) => PALETTE[i % PALETTE.length]);
    }
    return patch;
  },

  /**
   * One column per dimension, then the count → records for parallel sets.
   *
   * This cannot be the `links` shape, and using it was a real bug: a parallel
   * set is not two columns and a value, it is however many columns the reader
   * has, keyed by *their* names for them. `links` wrote `{from, to, flow}`
   * into a renderer that reads `record[dimensionName]`, so every paste left
   * the chart drawing undefined categories.
   */
  dimensions(table, spec, opts = {}) {
    const { headers, rows } = table;
    if (!rows.length) return null;

    const width = Math.max(2, ...rows.map((r) => r.length));
    const dims = [];
    for (let i = 0; i + 1 < width; i++) {
      let name = String(headers[i] ?? '').trim() || `Dimension ${i + 1}`;
      // Two dimensions with one name would collapse into a single key.
      if (dims.includes(name)) name = `${name} (${i + 1})`;
      dims.push(name);
    }
    if (dims.length < 2) return null;

    const valueField = opts.valueField || 'value';
    const records = [];
    rows.forEach((r) => {
      if (dims.some((_, i) => !String(r[i] ?? '').trim())) return;   // a gap is not a record
      const rec = {};
      dims.forEach((d, i) => { rec[d] = String(r[i]).trim(); });
      rec[valueField] = num(r[dims.length], 1);
      records.push(rec);
    });
    if (!records.length) return null;

    const colorKey = opts.colorByKey || 'colorBy';
    return {
      [opts.key || 'records']: records,
      [opts.dimensionsKey || 'dimensions']: dims,
      // The colour dimension has to be one that now exists, or the renderer
      // looks up a dimension that is not there and throws.
      [colorKey]: dims.includes(spec[colorKey]) ? spec[colorKey] : dims[0],
    };
  },

  /** source,target → graph edges, deriving the node list from the edges. */
  edges(table, spec, opts = {}) {
    const { rows } = table;
    if (!rows.length) return null;
    const links = rows.filter((r) => r[0] && r[1]).map((r) => ({ source: r[0], target: r[1] }));
    if (!links.length) return null;

    const seen = [];
    links.forEach((l) => {
      [l.source, l.target].forEach((n) => { if (!seen.includes(n)) seen.push(n); });
    });
    // Preserve any group assignment the user already had for a known node.
    const prev = new Map((spec.nodes || []).map((n) => [n.id, n.group]));
    return {
      links,
      nodes: seen.map((id) => ({ id, group: prev.get(id) ?? 0 })),
    };
  },

  /**
   * Indented text, or `parent > child > leaf,value` paths, → a nested tree.
   * Both are far friendlier than asking anyone to type JSON.
   */
  tree(table, spec, opts = {}) {
    const { rows } = table;
    if (!rows.length) return null;
    const root = { name: opts.rootName || 'All', children: [] };

    rows.forEach((r) => {
      // Every column but the last is a level, and any of them may itself be a
      // `Parent > Child` path. Splitting both ways rather than choosing
      // between them means a table that mixes the two — the usual result of
      // adding a level to a table that started with paths — still reads.
      const path = r.slice(0, -1)
        .flatMap((cell) => String(cell ?? '').split('>'))
        .map((part) => part.trim())
        .filter(Boolean);
      const value = num(r[r.length - 1], 0);
      if (!path.length) return;

      let node = root;
      path.forEach((name, depth) => {
        node.children = node.children || [];
        let next = node.children.find((c) => c.name === name);
        if (!next) { next = { name }; node.children.push(next); }
        node = next;
        if (depth === path.length - 1) node.value = value;
      });
    });

    if (!root.children.length) return null;
    const patch = { [opts.key || 'tree']: root };
    if (opts.groupsKey) {
      patch[opts.groupsKey] = root.children.map((c) => c.name);
      patch[opts.colorsKey || 'colors'] = root.children.map((_, i) => PALETTE[i % PALETTE.length]);
    }
    return patch;
  },

  /**
   * group,x,y → grouped point clouds.
   *
   * Charts store the points under different field names (`points` for the
   * scatter families, `data` for the engine's), so the descriptor says which.
   */
  xyGroups(table, spec, opts = {}) {
    const { rows } = table;
    if (!rows.length) return null;
    const key = opts.key || 'groups';
    const prev = spec[key] || [];

    // Two numeric columns and no group name is still valid — one group.
    const grouped = new Map();
    rows.forEach((r) => {
      const named = r.length >= 3 && !Number.isFinite(Number(r[0]));
      const g = named ? (r[0] || 'Group 1') : 'Group 1';
      const x = num(named ? r[1] : r[0]);
      const y = num(named ? r[2] : r[1]);
      if (!grouped.has(g)) grouped.set(g, []);
      grouped.get(g).push({ x, y });
    });
    if (!grouped.size) return null;

    const field = opts.pointField || 'points';
    const groups = [...grouped.entries()].map(([label, pts], i) => {
      const existing = prev.find((p) => p.label === label) || prev[i] || {};
      const base = { ...existing, label, color: colourAt(i, prev) };
      // The engine scatter takes [x, y] pairs rather than objects.
      base[field] = opts.asPairs ? pts.map((p) => [p.x, p.y]) : pts;
      return base;
    });
    return { [key]: groups };
  },

  /** name,lon,lat,value → geographic points. */
  places(table, spec, opts = {}) {
    const { rows } = table;
    if (!rows.length) return null;
    const places = rows
      .filter((r) => r[0])
      .map((r) => ({
        name: r[0],
        lon: num(r[1]),
        lat: num(r[2]),
        value: num(r[3], 1),
      }))
      .filter((p) => Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180);
    return places.length ? { [opts.key || 'places']: places } : null;
  },

  /** country,value → a lookup the maps colour by. */
  regions(table, spec, opts = {}) {
    const { rows } = table;
    if (!rows.length) return null;
    const values = {};
    rows.forEach((r) => { if (r[0]) values[String(r[0]).trim()] = num(r[1]); });
    return Object.keys(values).length
      ? { [opts.key || 'regionValues']: values, dataMode: 'regions' }
      : null;
  },

  /** date/open/high/low/close → OHLC bars for the finance charts. */
  ohlc(table, spec, opts = {}) {
    const { rows } = table;
    if (!rows.length) return null;
    const bars = rows.map((r) => {
      // Accept either date,o,h,l,c or just o,h,l,c.
      const off = Number.isFinite(Number(r[0])) && r.length < 5 ? 0 : 1;
      const o = num(r[off]);
      const h = num(r[off + 1], o);
      const l = num(r[off + 2], o);
      const c = num(r[off + 3], o);
      return { o, h: Math.max(o, h, c), l: Math.min(o, l, c), c };
    }).filter((b) => Number.isFinite(b.o) && b.o !== 0);
    return bars.length ? { bars, dataMode: 'bars' } : null;
  },

  /** row,column,value → a matrix of cells. */
  matrix(table, spec, opts = {}) {
    const { headers, rows } = table;
    if (!rows.length) return null;
    // Wide form: first column is the row label, headers are column labels.
    const rowLabels = rows.map((r) => r[0] || '');
    const colLabels = headers.slice(1);
    const cells = [];
    rows.forEach((r, y) => {
      for (let x = 1; x < r.length; x++) {
        if (r[x] === '') continue;
        cells.push({ x: x - 1, y, v: num(r[x]) });
      }
    });
    return cells.length
      ? { [opts.rowsKey || 'rows']: rowLabels, [opts.colsKey || 'cols']: colLabels, cells, dataMode: 'cells' }
      : null;
  },
};

/**
 * Apply a chart's declared data descriptor to pasted text.
 *
 * @param {object} def   chart definition (reads def.data)
 * @param {object} spec  live spec, mutated in place
 * @param {string} text  what the user pasted
 * @returns {{ ok: boolean, message: string }}
 */
/**
 * @param {object} def
 * @param {object} spec  mutated in place on success
 * @param {string|{headers: string[], rows: string[][]}} input  text to parse,
 *   or a table whose header row is already known — which is what the data
 *   editor passes, since flattening the grid to CSV and guessing again where
 *   the headers went is a guess it does not have to make.
 */
export function applyData(def, spec, input) {
  const desc = def.data;
  if (!desc) return { ok: false, message: 'This chart has no data editor.' };

  const table = input && typeof input === 'object' && Array.isArray(input.rows)
    ? { headers: [...(input.headers || [])], rows: input.rows.map((r) => [...r]), hadHeader: true }
    : parseTable(input, expectedFormat(def).columns);
  if (!table.rows.length) return { ok: false, message: 'Nothing to read — paste some rows first.' };

  const shape = SHAPES[desc.shape];
  if (!shape) return { ok: false, message: `Unknown data shape "${desc.shape}".` };

  let patch;
  try {
    patch = shape(table, spec, desc);
  } catch (err) {
    return { ok: false, message: 'Could not read that: ' + err.message };
  }
  if (!patch) {
    return { ok: false, message: desc.hint || 'That does not look like the expected columns.' };
  }

  Object.assign(spec, patch);
  if (typeof def.onData === 'function') def.onData(spec, table);

  const n = table.rows.length;
  return { ok: true, message: `Loaded ${n} row${n === 1 ? '' : 's'}.` };
}

export { num, looksNumeric };

/* ── What a chart expects ────────────────────────────────────────────────────
 * A file arrives in whatever shape its author chose, which is rarely the shape
 * this chart wants. Rather than parsing it into something wrong and drawing
 * nonsense, the studio states the expected columns up front and says plainly
 * what did not match. Both come from here, so the promise and the check cannot
 * disagree.
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * How many columns each shape needs, whether extra ones mean anything, and
 * what the grid may do to them.
 *
 * `min` is a floor, not a target: a chart that reads one column per series is
 * perfectly happy with twelve. Only the shapes that genuinely read a fixed
 * number of positions set `exact`. `reads` is how far the numeric check should
 * look — `Infinity` where every further column is real data, so an ignored
 * trailing notes column is not reported as a broken value.
 *
 * `columns` is the grid's half of the same question:
 *
 *   text     how many leading columns hold words rather than numbers — a
 *            count, or a function of the current headers. The flow and
 *            hierarchy shapes take as many as the table is wide, because every
 *            column but the last names a stage. That is the whole reason a
 *            Sankey can have four columns, and the grid has to agree or it
 *            flags `Checkout` as a bad number.
 *   minText  the fewest of those the shape can work with, so the grid knows
 *            which ✕ it may offer.
 *   minCols  the narrowest the whole table may get.
 *   filled   how many leading columns a row must actually fill to count as a
 *            row. A flow needs both ends; a tree may stop at any level.
 *   add      what "+ Column" means here, or null where another column would be
 *            silently ignored — a button that does nothing is worse than no
 *            button. `stage: true` inserts it before the value column rather
 *            than after it, because a new stage belongs in the path, not past
 *            the amount.
 */

/** Everything but the last column, which holds the value. */
const levelColumns = (h) => Math.max(1, h.length - 1);
const stageColumns = (h) => Math.max(2, h.length - 1);

const SHAPE_RULES = {
  labelSeries: {
    min: 2, reads: Infinity, grows: 'each further column becomes a series',
    columns: { add: { label: '+ Series', name: (n) => 'Series ' + n }, swap: true },
  },
  rowSeries: {
    min: 2, reads: Infinity, grows: 'each further column becomes a point along the row',
    columns: { add: { label: '+ Point', name: (n) => 'Point ' + n }, swap: true },
  },
  labelValue:   { min: 2, exact: 2, columns: { add: null, swap: true } },
  items:        { min: 2, grows: 'extra columns are read as named fields', columns: { add: null, swap: true } },
  pairs:        { min: 3, exact: 3, columns: { minCols: 3, add: null } },
  observations: {
    min: 1, reads: Infinity, grows: 'either one column per group, or group and value',
    columns: { add: { label: '+ Group', name: (n) => 'Group ' + n }, swap: true },
  },
  links: {
    min: 3, reads: Infinity,
    grows: 'each further column is another stage — A, B, C, value is A to B to C',
    columns: {
      // Only both ends are required: the shape reads a blank trailing stage
      // as a shorter path, so nagging about one would contradict it.
      text: stageColumns, minText: 2, minCols: 3, filled: 2,
      add: { label: '+ Stage', name: (n) => 'Stage ' + n, stage: true },
    },
  },
  dimensions: {
    min: 3, reads: Infinity,
    grows: 'each further column is another dimension, with the count last',
    columns: {
      text: stageColumns, minText: 2, minCols: 3, filled: stageColumns,
      add: { label: '+ Dimension', name: (n) => 'Dimension ' + n, stage: true },
    },
  },
  edges: {
    min: 2, exact: 2, reads: Infinity,
    columns: { text: (h) => h.length, minText: 2, minCols: 2, filled: 2, add: null },
  },
  tree: {
    min: 2, reads: Infinity, grows: 'one level per column, with the value last',
    columns: {
      text: levelColumns, minText: 1, minCols: 2,
      add: { label: '+ Level', name: (n) => 'Level ' + n, stage: true },
    },
  },
  xyGroups:     { min: 2, grows: 'group, x and y — or just x and y', columns: { add: null } },
  places:       { min: 3, grows: 'name, longitude, latitude, and a value', columns: { minCols: 4, add: null } },
  regions:      { min: 2, exact: 2, columns: { add: null } },
  ohlc:         { min: 4, grows: 'open, high, low, close — a leading date is ignored', columns: { minCols: 4, add: null } },
  matrix: {
    min: 2, reads: Infinity, grows: 'a row label, then one column per cell',
    columns: { add: { label: '+ Column', name: (n) => 'Column ' + n }, swap: true },
  },
};

// `swap` is whether "Swap rows and columns" is offered on this shape. It is
// only true where a table is a grid of labels against series — turned round,
// it is still one. A path of stages, a place with its coordinates or a bar of
// open-high-low-close reads each column for what it *is*, and turning that
// ninety degrees makes a table nothing reads; offering the button there would
// be the same kind of promise as a `+ Column` that gets dropped in silence.
const DEFAULT_COLUMNS = {
  text: 1, minText: 1, minCols: 2, filled: 1,
  add: { label: '+ Column', name: (n) => 'Series ' + n, stage: false },
  swap: false,
};

/**
 * What the grid may do to this shape's columns, with the defaults filled in.
 *
 * Kept here rather than in the dialog so the grid, the paste preview and the
 * file check all read one table. They used to hold three separate ideas of
 * which columns were words, and only one of them knew about `from, to`.
 *
 * @returns {{text, minText: number, minCols: number, filled, add: object|null, swap: boolean}}
 */
export function columnRules(shape) {
  const rule = (SHAPE_RULES[shape] || {}).columns || {};
  return { ...DEFAULT_COLUMNS, ...rule };
}

/** Resolve a count that may be stated as a function of the headers. */
export function countOf(value, headers, fallback = 1) {
  const n = typeof value === 'function' ? value(headers || []) : value;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * The column names and count a chart is built to read.
 *
 * Taken from the descriptor's own example rather than a second list, so the
 * format shown to a reader is by construction the format the example obeys.
 *
 * @returns {{shape: string, columns: string[], min: number, exact: number|null, grows: string|null, hint: string}}
 */
export function expectedFormat(def) {
  const desc = (def && def.data) || {};
  const rule = SHAPE_RULES[desc.shape] || { min: 2 };
  const firstLine = String(desc.example || '').split('\n')[0] || '';
  const columns = firstLine
    ? firstLine.split(/[,\t;]/).map((c) => c.trim()).filter(Boolean)
    : [];
  return {
    shape: desc.shape || null,
    columns,
    min: rule.min,
    reads: rule.reads == null ? rule.min : rule.reads,
    exact: rule.exact || null,
    grows: rule.grows || null,
    hint: desc.hint || '',
  };
}

/**
 * Does this table look like something the chart can read?
 *
 * Deliberately advisory. It reports what does not line up and lets the caller
 * decide — a file with an extra notes column on the end is still perfectly
 * usable, and refusing it outright would be worse than saying so.
 *
 * @returns {{ok: boolean, message: string, expected: object}}
 */
export function checkTableShape(def, table) {
  const expected = expectedFormat(def);
  const got = table && table.headers ? table.headers.length : 0;
  const rows = table && table.rows ? table.rows.length : 0;
  const name = (n) => `${n} column${n === 1 ? '' : 's'}`;

  if (!rows) {
    return { ok: false, message: 'There are no rows in that file.', expected };
  }
  if (got < expected.min) {
    return {
      ok: false,
      expected,
      message: `This chart needs at least ${name(expected.min)}`
        + (expected.columns.length ? ` — ${expected.columns.join(', ')}` : '')
        + `. That file has ${name(got)}.`,
    };
  }
  if (expected.exact && got > expected.exact) {
    return {
      ok: false,
      expected,
      message: `This chart reads exactly ${name(expected.exact)}`
        + (expected.columns.length ? ` — ${expected.columns.join(', ')}` : '')
        + `. That file has ${name(got)}, so the extra ones will be ignored.`,
    };
  }

  // The value columns have to be numbers, or the chart draws a row of zeros.
  // Which columns those are comes from the same table the grid reads, so a
  // four-column flow is not told that its third stage is a bad number.
  const labelCols = countOf(columnRules(expected.shape).text, table.headers);
  let bad = 0;
  table.rows.slice(0, 200).forEach((r) => {
    for (let c = labelCols; c < Math.min(r.length, expected.reads); c++) {
      const v = String(r[c] ?? '').trim();
      if (v && !looksNumeric(v)) bad++;
    }
  });
  if (bad) {
    return {
      ok: false,
      expected,
      message: `${bad} cell${bad === 1 ? '' : 's'} in the value columns `
        + `${bad === 1 ? 'is' : 'are'} not a number. They will be read as 0 unless you fix them.`,
    };
  }

  return { ok: true, message: `${rows} row${rows === 1 ? '' : 's'}, ${name(got)}.`, expected };
}

/* ── Is this text a table at all? ────────────────────────────────────────────
 * `readDataFile` proves a file is *text* by its bytes, but there is no magic
 * number that separates text-which-is-CSV from text-which-is-SQL: both are
 * just characters. So a .sql renamed .txt used to be split on whitespace into
 * a grid of fragments, and the only complaint was that some cells were not
 * numbers — which is true, and entirely beside the point.
 *
 * This says the useful thing instead: that is not a table, and here is what it
 * looks like. Nothing here is about safety — source text is inert, never run,
 * never sent anywhere, never inserted as markup. It is about not drawing a
 * chart out of a file that was never data.
 *
 * **The order of the checks is the whole design.** Word-spotting runs *after*
 * the structural test, never before, because a real table can be full of any
 * words at all. A glossary of SQL keywords —
 *
 *     keyword,meaning
 *     SELECT,retrieves rows
 *     FROM,names the table
 *
 * — is a perfectly good CSV whose rows all begin with SQL statements. Checking
 * for keywords first threw it out. Checking the shape first keeps it, because
 * a file with a separator on every line and a consistent width *is* a table,
 * whatever it happens to say.
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Openers that identify a file outright. One line is enough for these: no CSV
 * begins `<?php`, and no spreadsheet starts with a shebang.
 */
const EXACT_OPENERS = [
  { name: 'PHP', test: /^\s*<\?php\b/i, advice: 'This reads data files, not source.' },
  { name: 'XML', test: /^\s*<\?xml\b/i, advice: 'Export the table from whatever produced it as CSV.' },
  { name: 'HTML', test: /^\s*<!DOCTYPE\s+html|^\s*<html[\s>]/i, advice: 'Export the table from whatever produced it as CSV.' },
  { name: 'a script', test: /^#!\s*\//, advice: 'This reads data files, not source.' },
  { name: 'LaTeX', test: /^\s*\\(documentclass|begin\{document\}|usepackage)\b/, advice: 'Export the table as CSV.' },
  { name: 'a diff', test: /^(---|\+\+\+)\s+[ab]?\//, advice: 'Apply it first, then export the data.' },
];

/**
 * Families that need corroboration — two or more lines, and a third of the
 * sample. One line of a CSV could say "SELECT"; a third of them could not.
 */
const LINE_SIGNATURES = [
  {
    name: 'SQL',
    advice: 'If it is a query, run it and export the result as CSV.',
    line: /^\s*(--|\/\*|\*\/)|^\s*(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+(TABLE|VIEW|INDEX|DATABASE)|ALTER\s+TABLE|DROP\s+(TABLE|VIEW)|BEGIN|COMMIT|ROLLBACK|WITH|GRANT|USE)\b|^\s*(FROM|WHERE|GROUP\s+BY|ORDER\s+BY|JOIN|VALUES|SET)\b/i,
  },
  {
    name: 'code',
    advice: 'This reads data files, not source.',
    line: /^\s*([{}();]+\s*$|(import|export|from|require|include|using|namespace|package|module|function|func|fn|def|const|let|var|class|struct|enum|interface|public|private|protected|static|void|return|if|for|while|switch|try|catch|throw|new|print|println|echo|puts|param|set|end)\b|[$@][A-Za-z_]|#include|#define|<\/?[a-z]+>)/,
  },
  {
    name: 'Markdown',
    advice: 'Copy just the table out of it, or export it as CSV.',
    line: /^\s{0,3}(#{1,6}\s|[-*+]\s|>\s|```|\[.+\]\(.+\))/,
  },
  {
    name: 'a settings file',
    advice: 'Settings are not a table. Export the data you want to chart as CSV.',
    line: /^\s*\[[^\]\t]+\]\s*$|^\s*[A-Za-z_][\w.-]*\s*=\s*\S/,
  },
  {
    name: 'YAML',
    advice: 'Convert it to CSV, or paste the rows you want into the table.',
    line: /^\s*-\s+\w|^\s*[\w.-]+:\s*(\S.*)?$/,
  },
  {
    name: 'CSS',
    advice: 'This reads data files, not source.',
    line: /^\s*[.#@][\w-]+.*\{\s*$|^\s*[a-z-]+\s*:\s*[^;]+;\s*$|^\s*\}\s*$/,
  },
];

/**
 * Impostors that survive the shape test, because they genuinely are comma
 * -structured: a run of INSERT statements, or one JSON object per line.
 *
 * These are matched on *whole-statement* forms, never bare keywords, so a
 * glossary CSV whose first column reads SELECT / FROM / WHERE is untouched —
 * its cells are the keywords, not statements built out of them.
 */
const DELIMITED_IMPOSTORS = [
  {
    name: 'SQL',
    advice: 'If it is a query, run it and export the result as CSV.',
    line: /\b(INSERT\s+INTO\b.*\bVALUES\b|SELECT\b.+\bFROM\b|UPDATE\b.+\bSET\b|DELETE\s+FROM\b|CREATE\s+(TABLE|VIEW|INDEX)\b|ALTER\s+TABLE\b|DROP\s+(TABLE|VIEW)\b)/i,
  },
  {
    name: 'JSON Lines',
    advice: 'Convert it to CSV, or paste the rows you want into the table.',
    line: /^\s*[{[].*[}\]],?\s*$/,
  },
];

/** The separators a real table is built from. Whitespace is not one of them. */
const SEPARATORS = [',', '\t', ';', '|'];

/**
 * Does this text read as a table?
 *
 * Advisory and deliberately hard to trip: a real CSV with an odd row, a
 * comment preamble or awkward words in it should pass. Only text that is
 * *mostly* something else, or has no consistent shape at all, is called out.
 *
 * @returns {{ok: boolean, looksLike: string|null, message: string}}
 */
export function looksLikeTable(text) {
  const whole = String(text || '');
  const lines = whole
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length);

  if (!lines.length) return { ok: false, looksLike: null, message: 'There is nothing in that file.' };

  // JSON first, before any counting of lines: an API answers with its rows
  // on one line, and a single line of records is a table all the same.
  // Proven by parsing rather than guessed from braces — brace-counting
  // mistook every C-family language for JSON. Rows of records read as a
  // table whatever punctuation they came in; JSON holding no rows, a config
  // or a manifest, is refused as JSON.
  if (/^[[{]/.test(whole.trim())) {
    if (jsonAsCsv(whole)) return { ok: true, looksLike: null, message: '' };
    try {
      const parsed = JSON.parse(whole.trim());
      if (parsed && typeof parsed === 'object') {
        return { ok: false, looksLike: 'JSON',
          message: 'That is JSON, but not rows of records — an array of objects, '
            + 'or an object holding one, is what reads as a table.' };
      }
    } catch { /* not JSON after all — keep going */ }
  }

  // A table is at least a header and a row. One line has nothing to chart,
  // and is how a minified bundle or a base64 blob arrives.
  if (lines.length < 2) {
    return { ok: false, looksLike: null,
      message: 'That file is a single line, so there are no rows in it.' };
  }

  const sample = lines.slice(0, 60);
  const no = (looksLike, message) => ({ ok: false, looksLike, message });
  const yes = { ok: true, looksLike: null, message: '' };

  /* 1. Openers that settle it on their own. */
  for (const sig of EXACT_OPENERS) {
    if (sig.test.test(lines[0]) || sig.test.test(whole.slice(0, 200))) {
      return no(sig.name, `That looks like ${sig.name}, not a table. ${sig.advice}`);
    }
  }

  /* 2. JSON was settled above, before the line count. */

  /* 3. The shape. A file with a separator on nearly every line and a
   *    consistent width is a table, whatever words are in it — so this runs
   *    before any keyword matching, not after. */
  //    A separator has to actually separate. Counting bare occurrences made
  //    JavaScript look like a semicolon-delimited CSV, because `;` ends most
  //    of its lines — so trailing empties are dropped before a line counts as
  //    having columns at all.
  const widthsFor = (d) => sample.map((l) => {
    const parts = splitLine(l, d);
    while (parts.length && parts[parts.length - 1] === '') parts.pop();
    return parts.length;
  });

  let sep = null;
  let onLines = 0;
  let sepWidths = null;
  for (const d of SEPARATORS) {
    const widths = widthsFor(d);
    const seen = widths.filter((w) => w >= 2).length;
    if (seen > onLines) { onLines = seen; sep = d; sepWidths = widths; }
  }
  const delimited = sep && onLines / sample.length >= 0.6;

  if (delimited) {
    // Comma-structured, but still not data: a page of INSERT statements has a
    // consistent width and means nothing as a table.
    //
    // Matched with quoted fields removed first, because a table *about* queries
    // is a real thing — a slow-query report reads
    //
    //     query,runtime_ms
    //     "SELECT * FROM sales",412
    //
    // and every row would otherwise look like SQL. In a real .sql file the
    // statement is the line; in a CSV it is inside a cell.
    const unquoted = (l) => l.replace(/"(?:[^"]|"")*"/g, '');
    for (const sig of DELIMITED_IMPOSTORS) {
      const hits = sample.filter((l) => sig.line.test(unquoted(l))).length;
      if (hits >= 2 && hits / sample.length >= 0.6) {
        return no(sig.name, `That looks like ${sig.name}, not a table. ${sig.advice}`);
      }
    }

    // Widths only mean something once there are enough rows to average over;
    // below that a single ragged line would condemn a perfectly good file.
    if (sample.length < 5) return yes;
    const widths = sepWidths;
    const tally = new Map();
    widths.forEach((w) => tally.set(w, (tally.get(w) || 0) + 1));
    let commonCount = 0;
    tally.forEach((count) => { if (count > commonCount) commonCount = count; });
    const agreement = commonCount / widths.length;
    if (agreement >= 0.5) return yes;

    return no(null, 'The lines in that file have wildly different numbers of columns, '
      + `so it does not read as a table (${Math.round(agreement * 100)}% agree on a width).`);
  }

  /* 4. Not delimited. Now the keywords get their turn, on what is left. */
  for (const sig of LINE_SIGNATURES) {
    const hits = sample.filter((l) => sig.line.test(l)).length;
    if (hits >= 2 && hits / sample.length >= 0.34) {
      return no(sig.name, `That looks like ${sig.name}, not a table. ${sig.advice}`);
    }
  }

  /* 5. One long line is a minified bundle or a blob, not a table — there is
   *    nothing to chart in a single row even when it parses. */
  if (sample.length === 1 && sample[0].length > 300) {
    return no(null, 'That file is one very long line, so there are no rows in it.');
  }

  /* 6. A single column is legitimate — a bare list of observations — but only
   *    if the lines read as values. Sentences and statements do not. */
  const value = sample.filter((l) => looksNumeric(l)
    || (l.length <= 24 && !/\s/.test(l) && !/[{}()<>;=\\/]/.test(l))).length;
  if (value / sample.length < 0.6) {
    return no(null, 'That does not read as a table — the lines are prose, not rows. '
      + 'A table needs a delimiter: a comma, a tab or a semicolon.');
  }

  return yes;
}
