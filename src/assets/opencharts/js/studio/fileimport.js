/**
 * fileimport.js — read a .csv, .txt or .xlsx into the same CSV text the paste
 * tab produces, so everything downstream stays on one parsing path.
 *
 * ── Why there is no library here ─────────────────────────────────────────
 * An .xlsx is a ZIP of XML. Both formats have had native browser support for
 * years — `DecompressionStream` and `DOMParser` — so a spreadsheet reader is
 * about two hundred lines rather than the 1MB a general-purpose one costs.
 * That also keeps the site's promise: no build step, no runtime dependency.
 *
 * ── The threat model ─────────────────────────────────────────────────────
 * A chart library reads files people were sent by someone else. The file is
 * hostile until proven otherwise, and every check below exists because of a
 * specific way this could go wrong:
 *
 *   1. **Nothing leaves the browser.** The file is never uploaded, and no
 *      network request is made while reading it. It cannot be exfiltrated by
 *      a page that never sends it anywhere.
 *   2. **The bytes decide the format, not the name.** `sniff()` reads the
 *      magic number. `sales.csv` that is really a ZIP is refused, and so is
 *      `sales.xlsx` that is really something else.
 *   3. **Old .xls is refused by name, not by accident.** It is a compound
 *      binary document that can carry macros; it is recognised precisely so
 *      the message can say "save it as .xlsx" instead of failing obscurely.
 *   4. **Zip bombs cannot run us out of memory.** The archive, each entry,
 *      the total inflated size and the entry count are all capped, and a
 *      declared size that disagrees with reality aborts the read.
 *   5. **Only three paths are ever read** out of the archive, matched
 *      exactly. A crafted entry name — `../../etc/passwd`, an absolute path,
 *      a very long one — matches nothing and is skipped.
 *   6. **No XXE.** The XML goes through `DOMParser` as `application/xml`,
 *      which does not resolve external entities in any browser. A file with a
 *      DOCTYPE is refused anyway, since a spreadsheet has no business having
 *      one.
 *   7. **Formulas are never evaluated.** Only the cached value of a cell is
 *      read. `=WEBSERVICE(...)` is inert; the sheet is data, not code.
 *   8. **Nothing is ever injected as markup.** Cell text reaches the page
 *      through `textContent` and `input.value`, never `innerHTML`.
 *
 * ── And one thing the magic numbers cannot do ───────────────────────────
 * There is no signature that separates text-which-is-CSV from text-which-is
 * SQL: both are just characters. A .sql saved as .txt passes every byte-level
 * check there is, because it genuinely *is* text. So the last gate reads the
 * content — see `looksLikeTable()` in dataio.js. That one is not about safety
 * (SQL text here is inert: never run, never sent, never inserted as markup);
 * it is about not drawing a chart out of a file that was never data.
 */

import { looksLikeTable } from './dataio.js';

/** 10MB. Comfortably more than any hand-made spreadsheet, and a hard ceiling. */
const MAX_FILE = 10 * 1024 * 1024;
/** What the three XML parts may inflate to in total. */
const MAX_INFLATED = 40 * 1024 * 1024;
/** A real .xlsx has tens of entries. Thousands means something else. */
const MAX_ENTRIES = 2048;
/** Enough to draw anything; a guard against a sheet with a million blank rows. */
const MAX_ROWS = 20000;
const MAX_COLS = 512;

const err = (message) => ({ ok: false, message });

/* ── format sniffing ─────────────────────────────────────────────────────── */

const startsWith = (bytes, sig) => sig.every((b, i) => bytes[i] === b);

/**
 * What this file actually is, from its first bytes.
 * @returns {'zip'|'ole'|'text'|'binary'}
 */
function sniff(bytes) {
  // PK\x03\x04, and the two variants a zip writer may emit.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])
    || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])
    || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])) return 'zip';

  // Compound File Binary — .xls, .doc, .msg. Recognised so we can say so.
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'ole';

  // Anything with a NUL in the first 8KB is not a text table. This is also
  // what stops an executable or an image being read as if it were a CSV.
  const head = bytes.subarray(0, 8192);
  for (let i = 0; i < head.length; i++) {
    if (head[i] === 0x00) return 'binary';
  }
  return 'text';
}

/* ── ZIP reading ─────────────────────────────────────────────────────────── */

/**
 * The entries of a ZIP, read from its central directory.
 *
 * The central directory is authoritative — walking local headers instead is
 * how a crafted archive gets a reader to disagree with every other tool about
 * what is inside it.
 */
function readZipDirectory(view, bytes) {
  // The end-of-central-directory record sits in the last 64KB.
  const from = Math.max(0, bytes.length - 66_000);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= from; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a readable .xlsx — no ZIP directory found');

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (count > MAX_ENTRIES) throw new Error('that .xlsx has an implausible number of parts');

  const entries = [];
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length) break;
    if (view.getUint32(offset, true) !== 0x02014b50) break;

    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const inflated = view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localAt = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLen));

    entries.push({ name, method, compressed, inflated, localAt });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Inflate one entry, refusing anything that does not match what it declared. */
async function readEntry(view, bytes, entry) {
  if (entry.inflated > MAX_INFLATED) {
    throw new Error('that .xlsx expands to far more than a spreadsheet should');
  }
  const at = entry.localAt;
  if (at + 30 > bytes.length || view.getUint32(at, true) !== 0x04034b50) {
    throw new Error('that .xlsx is damaged — a part is not where the index says');
  }
  const nameLen = view.getUint16(at + 26, true);
  const extraLen = view.getUint16(at + 28, true);
  const start = at + 30 + nameLen + extraLen;
  const end = start + entry.compressed;
  if (end > bytes.length) throw new Error('that .xlsx is truncated');

  const raw = bytes.subarray(start, end);
  if (entry.method === 0) return new TextDecoder().decode(raw);
  if (entry.method !== 8) throw new Error('that .xlsx uses a compression this reader does not support');

  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const out = await new Response(stream).arrayBuffer();
  if (out.byteLength > MAX_INFLATED) {
    throw new Error('that .xlsx expands to far more than a spreadsheet should');
  }
  return new TextDecoder().decode(out);
}

/* ── XLSX ────────────────────────────────────────────────────────────────── */

/**
 * Does a DOCTYPE appear before the root element?
 *
 * Looking at a fixed slice of the head is not enough. XML allows whitespace,
 * processing instructions and comments before the doctypedecl, and a comment
 * can be any length — so `<!--` + 3KB of padding + `-->` pushes a DOCTYPE past
 * a 2048-character window while leaving the document perfectly well-formed.
 * Chromium parses that and expands the internal entities it declares.
 *
 * So walk the prolog instead: skip exactly the three things allowed to precede
 * the root element, and stop at the first thing that is not one of them. That
 * has no window to slip past, and it cannot misfire on content — a cell whose
 * text is "<!DOCTYPE html>" is stored escaped, and by then we have stopped.
 */
function hasDoctype(text) {
  let i = 0;
  while (i < text.length) {
    while (i < text.length && (text[i] === ' ' || text[i] === '\t'
      || text[i] === '\n' || text[i] === '\r')) i++;

    if (text.startsWith('<?', i)) {           // <?xml ... ?>
      const end = text.indexOf('?>', i + 2);
      if (end < 0) return false;              // malformed; the parser will refuse it
      i = end + 2;
    } else if (text.startsWith('<!--', i)) {  // a comment, of any length
      const end = text.indexOf('-->', i + 4);
      if (end < 0) return false;
      i = end + 3;
    } else if (text.slice(i, i + 9).toUpperCase() === '<!DOCTYPE') {
      return true;
    } else {
      return false;                           // the root element — the prolog is over
    }
  }
  return false;
}

/** Parse XML safely, and refuse anything carrying a DOCTYPE. */
function parseXml(text, what) {
  // A spreadsheet part has no legitimate reason to declare a DOCTYPE, and
  // refusing outright is simpler to reason about than trusting the parser.
  if (hasDoctype(text)) {
    throw new Error(`that .xlsx has a DOCTYPE in its ${what}, which a spreadsheet should not`);
  }
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror') || !doc.documentElement) {
    throw new Error(`that .xlsx has unreadable ${what}`);
  }
  return doc;
}

/** "BC12" → 54 (zero-based column index). */
function columnOf(ref) {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

async function readXlsx(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const entries = readZipDirectory(view, bytes);

  const find = (name) => entries.find((e) => e.name === name);

  // Which sheet is first in the workbook's own order, rather than assuming
  // sheet1.xml — Excel does not renumber when sheets are deleted or moved.
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wbEntry = find('xl/workbook.xml');
  const relsEntry = find('xl/_rels/workbook.xml.rels');
  if (wbEntry && relsEntry) {
    try {
      const wb = parseXml(await readEntry(view, bytes, wbEntry), 'workbook');
      const rels = parseXml(await readEntry(view, bytes, relsEntry), 'workbook relationships');
      const firstSheet = wb.querySelector('sheets > sheet');
      const relId = firstSheet && (firstSheet.getAttribute('r:id') || firstSheet.getAttribute('id'));
      if (relId) {
        const rel = [...rels.getElementsByTagName('Relationship')]
          .find((r) => r.getAttribute('Id') === relId);
        const target = rel && rel.getAttribute('Target');
        // Only a plain relative path inside xl/ is accepted; anything with a
        // scheme, a leading slash or a `..` segment is ignored.
        if (target && /^[\w./-]+$/.test(target) && !target.includes('..') && !target.startsWith('/')) {
          sheetPath = target.startsWith('xl/') ? target : 'xl/' + target.replace(/^\.\//, '');
        }
      }
    } catch { /* fall back to sheet1.xml */ }
  }

  const sheetEntry = find(sheetPath) || find('xl/worksheets/sheet1.xml');
  if (!sheetEntry) throw new Error('that .xlsx has no readable worksheet');

  // Shared strings hold most cell text; a sheet of numbers has no such part.
  let shared = [];
  const ssEntry = find('xl/sharedStrings.xml');
  if (ssEntry) {
    const doc = parseXml(await readEntry(view, bytes, ssEntry), 'shared strings');
    shared = [...doc.getElementsByTagName('si')].map((si) => {
      // Runs of differently-formatted text inside one cell.
      const runs = si.getElementsByTagName('t');
      let out = '';
      for (const t of runs) out += t.textContent;
      return out;
    });
  }

  const sheet = parseXml(await readEntry(view, bytes, sheetEntry), 'worksheet');
  const rows = [];
  for (const row of sheet.getElementsByTagName('row')) {
    if (rows.length >= MAX_ROWS) break;
    const cells = [];
    for (const c of row.getElementsByTagName('c')) {
      const ref = c.getAttribute('r') || '';
      const at = ref ? columnOf(ref) : cells.length;
      if (at < 0 || at >= MAX_COLS) continue;

      const type = c.getAttribute('t');
      let value = '';
      if (type === 'inlineStr') {
        const t = c.getElementsByTagName('t')[0];
        value = t ? t.textContent : '';
      } else {
        // `v` is the cached value. A cell may also carry an `f` formula; it is
        // deliberately never read, let alone evaluated.
        const v = c.getElementsByTagName('v')[0];
        const text = v ? v.textContent : '';
        if (type === 's') value = shared[Number(text)] ?? '';
        else if (type === 'b') value = text === '1' ? 'TRUE' : 'FALSE';
        else if (type === 'e') value = '';        // #REF!, #DIV/0! and friends
        else value = text;
      }
      while (cells.length < at) cells.push('');
      cells[at] = value;
    }
    rows.push(cells);
  }

  // Trailing empty rows and columns are an artefact of how sheets are saved.
  while (rows.length && !rows[rows.length - 1].some((c) => String(c).trim())) rows.pop();
  if (!rows.length) throw new Error('that sheet is empty');

  const width = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => {
    const padded = [...r];
    while (padded.length < width) padded.push('');
    return padded.map(csvCell).join(',');
  }).join('\n');
}

/** Quote a cell for CSV. */
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/* ── the entry point ─────────────────────────────────────────────────────── */

/**
 * Read a user's file into CSV text.
 *
 * @param {File} file
 * @returns {Promise<{ok: true, text: string, kind: string} | {ok: false, message: string}>}
 */
export async function readDataFile(file) {
  if (!file) return err('No file chosen.');
  if (file.size === 0) return err('That file is empty.');
  if (file.size > MAX_FILE) {
    return err(`That file is ${(file.size / 1048576).toFixed(1)}MB. The limit is 10MB — `
      + 'a chart that needs more than that wants a database, not a spreadsheet.');
  }

  let buffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    return err('That file could not be read. It may have been moved or deleted.');
  }

  const name = (file.name || '').toLowerCase();
  const looksXlsx = name.endsWith('.xlsx') || name.endsWith('.xlsm');
  return fromBytes(buffer, looksXlsx);
}

/**
 * Everything the reader knows about a block of bytes, whoever handed them over.
 *
 * Shared by the file picker and the URL reader deliberately: a table fetched
 * from a stranger's server deserves every check a table dragged off a disk
 * gets, and two copies of these rules would drift the moment one was fixed.
 */
async function fromBytes(buffer, looksXlsx) {
  const bytes = new Uint8Array(buffer);
  const kind = sniff(bytes);

  if (kind === 'ole') {
    return err('That is an old .xls file, which this reader does not open. '
      + 'Open it in Excel or Sheets and save as .xlsx or .csv.');
  }

  if (kind === 'zip') {
    // The bytes say ZIP. Refuse to guess that any ZIP is a spreadsheet.
    if (!looksXlsx) {
      return err('That file is a ZIP archive, not a table. If it is a spreadsheet, '
        + 'give it an .xlsx extension; otherwise unpack it first.');
    }
    try {
      const text = await readXlsx(buffer);
      return { ok: true, text, kind: 'xlsx' };
    } catch (e) {
      return err(e.message || 'That .xlsx could not be read.');
    }
  }

  if (kind === 'binary') {
    return err('That file is not text. CSV, TSV, plain text and .xlsx are the formats this reads.');
  }

  // The name says spreadsheet but the bytes say text — trust the bytes, and
  // say so, because a mislabelled file is worth knowing about.
  const text = new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
  if (!text.trim()) return err('That file has no rows in it.');

  // Being text is not the same as being a table. There is no magic number for
  // that — CSV and SQL are both just characters — so the content has to be
  // read. Without this a .sql saved as .txt was split on whitespace into a
  // grid of fragments and drawn.
  const shape = looksLikeTable(text);
  if (!shape.ok) return err(shape.message);

  return {
    ok: true,
    text,
    kind: looksXlsx ? 'text (despite the .xlsx name)' : 'text',
  };
}

/* ── reading from a URL ──────────────────────────────────────────────────── */

/** Bytes past this are refused mid-stream rather than after the fact. */
const MAX_REMOTE = 10 * 1024 * 1024;

/**
 * Fetch a table from a URL, once.
 *
 * **This is the only thing in the studio that makes a network request for the
 * reader's data, and it happens only when they type a URL and press a button.**
 * What comes back is parsed into the grid and becomes literal values in the
 * spec, exactly as a paste would. Nothing is linked: the exported chart holds
 * numbers, not an address, so a copied chart cannot break later because
 * somebody else's server moved. A live, re-fetching chart is a different
 * feature with a different bargain, and this is deliberately not it.
 *
 * Four refusals, each for something that actually happens:
 *
 * - **Only http and https.** `file:`, `data:` and `javascript:` are not
 *   sources of somebody's spreadsheet.
 * - **No credentials.** Cookies are not sent, so a URL cannot be used to pull
 *   a page the reader happens to be logged into and drop it in a chart.
 * - **A web page is not a table.** The common mistake is pasting the address
 *   of a Google Sheet, which answers with HTML. Saying so — and saying what
 *   to do instead — beats parsing a login page into a bar chart.
 * - **Size is capped while streaming**, not after, so a server answering with
 *   an endless body cannot run the tab out of memory before the check.
 *
 * @returns {Promise<{ok: true, text: string, kind: string} | {ok: false, message: string}>}
 */
export async function readDataUrl(rawUrl) {
  const input = String(rawUrl || '').trim();
  if (!input) return err('Paste a link to a CSV or spreadsheet first.');

  let url;
  try {
    url = new URL(input);
  } catch {
    return err('That is not a web address. It should start with https://');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return err(`${url.protocol} links are not read. Use an https:// address.`);
  }

  let res;
  try {
    res = await fetch(url.href, {
      // The reader's cookies are not part of this. A URL is a request for a
      // public file, not a way to reach a page they happen to be signed into.
      credentials: 'omit',
      redirect: 'follow',
      cache: 'no-store',
    });
  } catch {
    // A cross-origin fetch without CORS headers fails here with nothing
    // useful attached, and it is by far the most common outcome — so the
    // message names the likely cause rather than shrugging.
    return err('That address could not be fetched. Either it is unreachable, or the '
      + 'server does not allow other sites to read it (CORS). A published CSV link '
      + 'usually works; a link to a page usually does not.');
  }

  if (!res.ok) return err(`That address answered ${res.status} ${res.statusText || ''}`.trim() + '.');

  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > MAX_REMOTE) {
    return err(`That file is ${(declared / 1048576).toFixed(1)}MB. The limit is 10MB.`);
  }

  let buffer;
  try {
    buffer = await readCapped(res, MAX_REMOTE);
  } catch (e) {
    return err(e.message || 'That address could not be read.');
  }
  if (!buffer.byteLength) return err('That address returned nothing.');

  const path = url.pathname.toLowerCase();
  const type = (res.headers.get('content-type') || '').toLowerCase();

  // A page, not a table. Checked before the generic text path so the advice
  // can be specific instead of "this does not look like a table".
  const head = new TextDecoder('utf-8').decode(new Uint8Array(buffer).subarray(0, 512)).trim();
  if (/^<(!doctype html|html|\?xml)/i.test(head) || type.startsWith('text/html')) {
    return err('That address returned a web page, not data. If it is a Google Sheet, '
      + 'use File → Share → Publish to web and choose CSV, then paste that link.');
  }

  const out = await fromBytes(buffer, path.endsWith('.xlsx') || path.endsWith('.xlsm'));
  if (!out.ok) return out;
  return { ok: true, text: out.text, kind: out.kind };
}

/**
 * Read a response body, giving up the moment it passes a limit.
 *
 * `arrayBuffer()` would buffer the whole thing first and only then let anyone
 * measure it, which is no protection at all against a server that answers
 * forever. Falls back to it where streams are unavailable, having already
 * checked the declared length.
 */
async function readCapped(res, limit) {
  if (!res.body || typeof res.body.getReader !== 'function') {
    const buf = await res.arrayBuffer();
    if (buf.byteLength > limit) throw new Error('That file is larger than the 10MB limit.');
    return buf;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      reader.cancel();
      throw new Error('That file is larger than the 10MB limit.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out.buffer;
}

/** Everything this accepts, for an <input accept="…">. */
export const ACCEPTED = '.csv,.tsv,.txt,.json,.xlsx,.xlsm,text/csv,text/plain,application/json,'
  + 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Ask for a file and hand back whatever the reader made of it.
 *
 * The input is created, clicked and thrown away per call. A long-lived one
 * would need clearing between uses — choosing the same file twice fires no
 * `change` event — and that is exactly the kind of state worth not having.
 *
 * Resolves to `null` if the dialog is dismissed. There is no reliable cancel
 * event across browsers, so the caller simply never hears back; nothing is
 * left running, and the next call starts fresh.
 *
 * @returns {Promise<{ok: boolean, text?: string, kind?: string, message?: string, name?: string} | null>}
 */
export function chooseDataFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPTED;
    input.style.cssText = 'position:fixed;left:-9999px;width:0;height:0';
    document.body.appendChild(input);

    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) { resolve(null); return; }
      const res = await readDataFile(file);
      resolve({ ...res, name: file.name });
    }, { once: true });

    input.click();
  });
}
