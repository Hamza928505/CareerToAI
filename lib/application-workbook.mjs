import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { ROOT } from "./content.mjs";
import { COLUMNS, SCHEMA, computeTrackerRows, normalizeTrackerRow, readTracker, serializeCsv } from "./tracker.mjs";

const enums = Object.fromEntries(COLUMNS.filter(c => c.enum).map(c => [c.enum, SCHEMA[c.enum].map(v => typeof v === "string" ? v : v.value)]));
const queues = new Map();
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const locations = root => ({ workbook: path.join(root, SCHEMA.workbook), csv: path.join(root, SCHEMA.csv) });
const syncFile = root => path.join(root, ".cache", "tracker-sync.json");
const fileBytes = file => fs.existsSync(file) ? fs.readFileSync(file) : null;
const fingerprints = (workbook, csv) => ({ workbook: workbook ? digest(workbook) : null, csv: csv ? digest(csv) : null });
const revisionFor = hashes => digest(JSON.stringify(hashes));
const noteText = note => typeof note === "string" ? note : (note?.texts || []).map(t => t.text || "").join("");

function textValue(cell) {
  const value = cell.value;
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value !== "object") return String(value);
  if (value.richText) return value.richText.map(t => t.text).join("");
  if (value.formula || value.sharedFormula) return value.result == null ? "" : String(value.result);
  return String(value.text ?? value.hyperlink ?? value.error ?? "");
}

function headersFor(sheet) {
  const result = new Map();
  sheet.getRow(1).eachCell((cell, index) => result.set(textValue(cell).trim(), index));
  return result;
}

function rowsFrom(sheet) {
  const headers = headersFor(sheet);
  const rows = [];
  const originals = new Map();
  sheet.eachRow((sheetRow, index) => {
    if (index === 1 || !sheetRow.hasValues) return;
    const row = {};
    const notes = {};
    for (const column of COLUMNS) {
      const heading = [column.header, ...(column.legacyHeaders || [])].find(header => headers.has(header));
      const cell = heading ? sheetRow.getCell(headers.get(heading)) : null;
      row[column.key] = cell ? textValue(cell) : "";
      if (cell?.note && noteText(cell.note)) notes[column.key] = noteText(cell.note);
    }
    if (!Object.values(row).some(Boolean)) return;
    row.id ||= `workbook-row-${index}`;
    row.applicant ||= "Me";
    if (Object.keys(notes).length) row._cellNotes = notes;
    const normalized = normalizeTrackerRow(row);
    rows.push(normalized);
    originals.set(normalized.id, { row: normalized, sheetRow });
  });
  return { rows: computeTrackerRows(rows), originals, headers };
}

async function load(root) {
  const files = locations(root);
  const bytes = fileBytes(files.workbook);
  const csvBytes = fileBytes(files.csv);
  const hashes = fingerprints(bytes, csvBytes);
  const book = new ExcelJS.Workbook();
  if (bytes) await book.xlsx.load(bytes);
  let sheet = book.getWorksheet(SCHEMA.sheet);
  if (bytes && !sheet) throw fail(`The workbook needs a sheet named ${SCHEMA.sheet}. Existing sheets were left unchanged.`, 422);
  if (!sheet) sheet = book.addWorksheet(SCHEMA.sheet);
  return { book, sheet, bytes, csvBytes, hashes, revision: revisionFor(hashes), ...rowsFrom(sheet) };
}

function syncChanges(root, state) {
  const file = syncFile(root);
  if (!fs.existsSync(file)) return null;
  let synced;
  try {
    synced = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!["workbook", "csv"].every(key => synced[key] === null || /^[a-f0-9]{64}$/.test(synced[key]))) throw new Error();
  } catch {
    throw fail("The tracker sync record cannot be read. Restore .cache/tracker-sync.json from a backup before syncing; both tracker files were left unchanged.", 409);
  }
  const changes = { workbook: synced.workbook !== state.hashes.workbook, csv: synced.csv !== state.hashes.csv };
  if (changes.workbook && changes.csv) throw fail("Both Excel and the CSV changed since their last sync. Reconcile those edits before reloading or exporting; neither file was overwritten.", 409);
  return changes;
}

function writeSync(root, hashes) {
  const file = syncFile(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, JSON.stringify(hashes)); fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, { force: true }); }
}

function backupFiles(root) {
  const backup = path.join(root, ".cache", "tracker-backups", `${Date.now()}-${randomUUID()}`);
  fs.mkdirSync(backup, { recursive: true });
  for (const file of [...Object.values(locations(root)), syncFile(root)]) {
    if (fs.existsSync(file)) fs.copyFileSync(file, path.join(backup, path.basename(file)));
  }
}

function snapshot(state) {
  return { rows: state.rows, columns: COLUMNS, statuses: enums.statuses, decisions: enums.applyDecisions, enums, revision: state.revision, workbook: SCHEMA.workbook };
}

function normalizeRows(rows, originals) {
  if (!Array.isArray(rows)) throw fail("The tracker must contain a list of rows.");
  const allowed = new Set([...COLUMNS.map(c => c.key), "_cellNotes"]);
  const ids = new Set();
  return computeTrackerRows(rows.map((input, index) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw fail(`Row ${index + 1} is invalid.`);
    if (Object.keys(input).some(key => !allowed.has(key))) throw fail(`Row ${index + 1} has an unknown column.`);
    const row = {};
    for (const column of COLUMNS) {
      const value = input[column.key] ?? column.default ?? "";
      if (!["string", "number", "boolean"].includes(typeof value)) throw fail(`Row ${index + 1}: ${column.header} must be text or a number.`);
      row[column.key] = String(value);
    }
    row.id = row.id.trim();
    if (row.match_score && !/^(?:100|[0-9]|[1-9][0-9])$/.test(row.match_score)) throw fail(`Row ${index + 1}: match score must be a whole number from 0 to 100.`);
    row.applicant ||= "Me";
    if (!row.id || ids.has(row.id)) throw fail(`Row ${index + 1} needs a unique ID.`);
    ids.add(row.id);
    const original = originals.get(row.id)?.row;
    for (const column of COLUMNS.filter(c => c.enum)) {
      const value = row[column.key];
      // Preserve old free-text categories; new choices use the schema dropdowns.
      if (value && !enums[column.enum].includes(value) && value !== original?.[column.key]) throw fail(`Row ${index + 1}: choose a valid ${column.header}.`);
    }
    if (input._cellNotes !== undefined) {
      if (!input._cellNotes || typeof input._cellNotes !== "object" || Array.isArray(input._cellNotes)) throw fail(`Row ${index + 1} has invalid cell notes.`);
      row._cellNotes = { ...original?._cellNotes };
      for (const [key, value] of Object.entries(input._cellNotes)) {
        if (!COLUMNS.some(c => c.key === key) || typeof value !== "string") throw fail(`Row ${index + 1} has an invalid cell note.`);
        row._cellNotes[key] = value;
      }
    } else if (original?._cellNotes) {
      row._cellNotes = { ...original._cellNotes };
    }
    return normalizeTrackerRow(row);
  }));
}

function schemaMatches(headers) {
  return COLUMNS.every((column, index) => headers.get(column.header) === index + 1);
}

function reorderSheet(state) {
  const { sheet, headers } = state;
  if (schemaMatches(headers)) return;
  const oldHeaders = new Map(headers);
  const known = new Set(COLUMNS.flatMap(column => [column.header, ...(column.legacyHeaders || [])]));
  const extra = [...oldHeaders.keys()].filter(header => !known.has(header));
  const ordered = [...COLUMNS.map(column => column.header), ...extra];
  const saved = [];
  for (let index = 1; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    const cells = new Map();
    for (const header of ordered) {
      const column = COLUMNS.find(item => item.header === header);
      const originalHeader = column
        ? [column.header, ...(column.legacyHeaders || [])].find(name => oldHeaders.has(name))
        : header;
      if (originalHeader) {
        const cell = row.getCell(oldHeaders.get(originalHeader));
        if (cell.value != null || cell.note) cells.set(header, structuredClone(cell.model));
      }
    }
    saved.push({ cells, height: row.height });
    row.model = { ...(row.model || {}), number: index, cells: [] };
  }
  headers.clear();
  ordered.forEach((header, index) => {
    const column = index + 1;
    headers.set(header, column);
    sheet.getColumn(column).width = COLUMNS[index]?.width || 20;
  });
  saved.forEach(({ cells, height }, index) => {
    const row = sheet.getRow(index + 1);
    row.height = height;
    ordered.forEach((header, column) => {
      const cell = row.getCell(column + 1);
      const model = cells.get(header);
      if (model) cell.model = { ...model, address: cell.address };
      if (index === 0) cell.value = header;
    });
  });
}

function updateSheet(state, rows) {
  const { sheet, originals, headers } = state;
  const fresh = headers.size === 0;
  reorderSheet(state);
  for (const column of COLUMNS) {
    if (!headers.has(column.header)) {
      const index = Math.max(0, ...headers.values()) + 1;
      headers.set(column.header, index);
      sheet.getCell(1, index).value = column.header;
      sheet.getColumn(index).width = column.width || 20;
    }
  }
  // Snapshot cells before clearing, so notes, links and styles follow row IDs.
  const cellsById = new Map();
  for (const [id, original] of originals) {
    const cells = [];
    original.sheetRow.eachCell({ includeEmpty: true }, (cell, col) => cells.push([col, structuredClone(cell.model)]));
    cellsById.set(id, { cells, height: original.sheetRow.height });
  }
  const oldEnd = sheet.rowCount;
  for (let r = 2; r <= oldEnd; r++) {
    const row = sheet.getRow(r);
    row.model = { ...(row.model || {}), number: r, cells: [] };
  }
  rows.forEach((data, index) => {
    const target = sheet.getRow(index + 2);
    const previous = cellsById.get(data.id);
    if (previous) {
      target.height = previous.height;
      for (const [col, model] of previous.cells) {
        const cell = target.getCell(col);
        const key = COLUMNS.find(c => headers.get(c.header) === col)?.key;
        if (key && data._cellNotes?.[key] === "") delete model.comment;
        cell.model = { ...model, address: cell.address };
      }
    }
    for (const column of COLUMNS) {
      const cell = target.getCell(headers.get(column.header));
      if (column.computed) continue;
      if (column.format === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(data[column.key] || '')) {
        cell.value = new Date(`${data[column.key]}T00:00:00Z`);
        cell.numFmt = 'yyyy-mm-dd';
      } else if (!previous || data[column.key] !== originals.get(data.id)?.row[column.key] || (!cell.value && data[column.key])) cell.value = data[column.key] || null;
      const note = data._cellNotes?.[column.key];
      if (note && note !== originals.get(data.id)?.row._cellNotes?.[column.key]) cell.note = note;
      if ((column.key === "applicant" || column.key === "id") && !cell.value) cell.value = data[column.key];
    }
    const excelRow = index + 2;
    const formulae = {
      maps_link: `IF(H${excelRow}="","",HYPERLINK("https://www.google.com/maps/search/?api=1&query="&SUBSTITUTE(A${excelRow}&" "&H${excelRow}," ","+"),"Open map"))`,
      follow_up: `IF(U${excelRow}="","",U${excelRow}+7)`,
      duplicate_check: `IF(COUNTIF(A:A,A${excelRow})>1,IF(COUNTIFS(A:A,A${excelRow},B:B,B${excelRow})>1,"DUPLICATE",""),"")`,
    };
    for (const [key, formula] of Object.entries(formulae)) {
      const cell = target.getCell(headers.get(COLUMNS.find(column => column.key === key).header));
      const result = key === 'maps_link' ? (data.address ? 'Open map' : '')
        : key === 'follow_up' && data.follow_up ? Date.parse(`${data.follow_up}T00:00:00Z`) / 86400000 + 25569
        : data[key] || '';
      cell.value = { formula, result };
      if (key === 'follow_up') cell.numFmt = 'yyyy-mm-dd';
    }
  });
  state.book.calcProperties.fullCalcOnLoad = true;
  const end = Math.max(rows.length + 102, oldEnd);
  for (const column of COLUMNS.filter(c => c.enum)) {
    const col = headers.get(column.header);
    for (let r = 2; r <= end; r++) sheet.getCell(r, col).dataValidation = {
      type: "list", allowBlank: !column.default, showErrorMessage: true,
      errorTitle: "Choose a value", error: `Use the ${column.header} dropdown.`,
      formulae: [`"${enums[column.enum].join(",")}"`],
    };
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: sheet.columnCount } };
  if (fresh) {
    sheet.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF183B39" } };
    sheet.getRow(1).height = 30;
  }
}

function assertRevision(root, expected) {
  const files = locations(root);
  const current = revisionFor(fingerprints(fileBytes(files.workbook), fileBytes(files.csv)));
  if (current !== expected) throw fail("The Excel file or CSV changed since it was loaded. Reload the tracker before saving so those changes are preserved.", 409);
}

async function persist(root, state, rows) {
  const files = locations(root);
  updateSheet(state, rows);
  const bytes = Buffer.from(await state.book.xlsx.writeBuffer());
  const csv = serializeCsv(rows);
  assertRevision(root, state.revision);
  backupFiles(root);
  fs.mkdirSync(path.dirname(files.csv), { recursive: true });
  const suffix = `.${randomUUID()}.tmp`;
  const csvBefore = fs.existsSync(files.csv) ? fs.readFileSync(files.csv) : null;
  let workbookReplaced = false;
  try {
    fs.writeFileSync(files.workbook + suffix, bytes);
    fs.writeFileSync(files.csv + suffix, csv);
    assertRevision(root, state.revision);
    fs.renameSync(files.workbook + suffix, files.workbook);
    workbookReplaced = true;
    fs.renameSync(files.csv + suffix, files.csv);
  } catch (error) {
    if (workbookReplaced) {
      if (state.bytes) { fs.writeFileSync(files.workbook + suffix, state.bytes); fs.renameSync(files.workbook + suffix, files.workbook); }
      else fs.rmSync(files.workbook, { force: true });
      if (csvBefore) fs.writeFileSync(files.csv, csvBefore);
    }
    if (error.code === "EBUSY" || error.code === "EPERM") throw fail("Close the workbook in Excel, then save again. Your previous data is preserved.", 423);
    throw error;
  } finally {
    for (const file of Object.values(files)) fs.rmSync(file + suffix, { force: true });
  }
  const hashes = fingerprints(bytes, Buffer.from(csv));
  writeSync(root, hashes);
  return snapshot({ rows, revision: revisionFor(hashes) });
}

function serialized(root, action) {
  // ponytail: serialize local tracker operations; per-workbook locks if multiple trackers are added.
  const previous = queues.get(root) || Promise.resolve();
  const next = previous.catch(() => {}).then(action);
  queues.set(root, next);
  return next.finally(() => { if (queues.get(root) === next) queues.delete(root); });
}

/** Sync whichever file changed, preserving the canonical CSV and Excel edits. */
export function readApplicationWorkbook({ root = ROOT } = {}) {
  return serialized(root, async () => {
    const state = await load(root);
    const changes = syncChanges(root, state);
    if (changes && !changes.workbook && !changes.csv) {
      return schemaMatches(state.headers) ? snapshot(state) : persist(root, state, normalizeRows(state.rows, state.originals));
    }
    if (changes?.csv) return persist(root, state, normalizeRows(readTracker(locations(root).csv), state.originals));
    if (!state.bytes) return persist(root, state, normalizeRows(readTracker(locations(root).csv), state.originals));
    if (!schemaMatches(state.headers)) return persist(root, state, normalizeRows(state.rows, state.originals));
    const csv = serializeCsv(state.rows);
    const file = locations(root).csv;
    if (state.csvBytes?.toString("utf8") !== csv) {
      assertRevision(root, state.revision);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      backupFiles(root);
      const temporary = `${file}.${randomUUID()}.tmp`;
      try { fs.writeFileSync(temporary, csv); assertRevision(root, state.revision); fs.renameSync(temporary, file); }
      finally { fs.rmSync(temporary, { force: true }); }
    }
    const hashes = fingerprints(state.bytes, Buffer.from(csv));
    writeSync(root, hashes);
    return snapshot({ ...state, revision: revisionFor(hashes) });
  });
}

export function saveApplicationWorkbook(rows, { revision, root = ROOT } = {}) {
  return serialized(root, async () => {
    if (revision === undefined) throw fail("Reload the tracker before saving.", 409);
    const state = await load(root);
    if (revision !== state.revision) throw fail("The tracker changed since it was loaded. Reload before saving.", 409);
    return persist(root, state, normalizeRows(rows, state.originals));
  });
}

/** Explicit CSV-to-workbook export used by npm run tracker, retaining other sheets. */
export function regenerateApplicationWorkbook({ root = ROOT } = {}) {
  return serialized(root, async () => {
    const state = await load(root);
    const changes = syncChanges(root, state);
    if (changes?.workbook) throw fail("Excel changed since its last sync. Reload the tracker to import those edits before exporting the CSV.", 409);
    return persist(root, state, normalizeRows(readTracker(locations(root).csv), state.originals));
  });
}
