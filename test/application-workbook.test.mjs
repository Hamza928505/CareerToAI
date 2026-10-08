import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ExcelJS from "exceljs";
import { readApplicationWorkbook, saveApplicationWorkbook, regenerateApplicationWorkbook } from "../lib/application-workbook.mjs";
import { readTracker, writeTracker, SCHEMA } from "../lib/tracker.mjs";

test("workbook edits, comments, assignment and conflicts survive workbook/CSV round trips", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "career-workbook-"));
  try {
    const csv = path.join(root, SCHEMA.csv);
    const file = path.join(root, SCHEMA.workbook);
    writeTracker([{ id: "1", company: "Example", position: "Intern", status: "Not applied" }], csv);
    let snapshot = await readApplicationWorkbook({ root });
    assert.equal(snapshot.columns.length, SCHEMA.columns.length);
    assert.deepEqual(snapshot.columns.slice(0, 4).map(column => column.header), ['Company', 'Position', 'Website', 'Link to posting']);
    assert.equal(snapshot.rows[0].applicant, "Me");
    assert.deepEqual(snapshot.enums.applicants, ["Me", "Assistant"]);
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(file);
    const sheet = book.getWorksheet(SCHEMA.sheet);
    const columns = new Map();
    sheet.getRow(1).eachCell((cell, index) => columns.set(cell.value, index));
    const company = sheet.getCell(2, columns.get("Company"));
    company.value = { text: "Edited in Excel", hyperlink: "https://example.org" };
    company.note = "Excel comment";
    company.font = { bold: true };
    sheet.getCell(1, SCHEMA.columns.length + 1).value = "Extra column";
    sheet.getCell(2, SCHEMA.columns.length + 1).value = { formula: "1+1", result: 2 };
    book.addWorksheet("Keep me").getCell("A1").value = "Keep this";
    await book.xlsx.writeFile(file);
    await assert.rejects(saveApplicationWorkbook(snapshot.rows, { root, revision: snapshot.revision }), { statusCode: 409 });
    snapshot = await readApplicationWorkbook({ root });
    assert.equal(snapshot.rows[0].company, "Edited in Excel");
    assert.equal(snapshot.rows[0]._cellNotes.company, "Excel comment");
    assert.equal(readTracker(csv)[0].company, "Edited in Excel");
    snapshot.rows[0].applicant = "Assistant";
    snapshot.rows[0].notes = "A note with, comma\nand new line";
    snapshot.rows[0]._cellNotes.position = "Ask about start date";
    snapshot.rows.unshift({ id: "2", position: "New internship", job_url: "https://example.org/job", applicant: "Me" });
    snapshot = await saveApplicationWorkbook(snapshot.rows, { root, revision: snapshot.revision });
    const saved = new ExcelJS.Workbook();
    await saved.xlsx.readFile(file);
    assert.equal(saved.getWorksheet("Keep me").getCell("A1").value, "Keep this");
    const savedSheet = saved.getWorksheet(SCHEMA.sheet);
    assert.equal(savedSheet.getCell(3, columns.get("Company")).note, "Excel comment");
    assert.equal(savedSheet.getCell(3, columns.get("Company")).hyperlink, "https://example.org");
    assert.equal(savedSheet.getCell(3, columns.get("Company")).font.bold, true);
    assert.equal(savedSheet.getCell(3, SCHEMA.columns.length + 1).value.formula, "1+1");
    assert.equal(savedSheet.getCell(3, columns.get("Position")).note, "Ask about start date");
    assert.equal(savedSheet.getCell(3, columns.get("Who applies")).dataValidation.formulae[0], '"Me,Assistant"');
    assert.equal(readTracker(csv)[1].notes, snapshot.rows[1].notes);
    const invalid = structuredClone(snapshot.rows);
    invalid[0].applicant = "Someone else";
    await assert.rejects(saveApplicationWorkbook(invalid, { root, revision: snapshot.revision }), { statusCode: 400 });
    await assert.rejects(saveApplicationWorkbook([snapshot.rows[0], snapshot.rows[0]], { root, revision: snapshot.revision }), { statusCode: 400 });
    snapshot.rows[1]._cellNotes.company = "";
    snapshot = await saveApplicationWorkbook([snapshot.rows[1]], { root, revision: snapshot.revision });
    await regenerateApplicationWorkbook({ root });
    snapshot = await readApplicationWorkbook({ root });
    assert.equal(snapshot.rows.length, 1);
    assert.equal(snapshot.rows[0].id, "1");
    assert.equal(snapshot.rows[0]._cellNotes?.company, undefined);
    assert.equal(snapshot.rows[0]._cellNotes.position, "Ask about start date");
    assert.ok(fs.readdirSync(path.join(root, ".cache", "tracker-backups")).length >= 3);
  } finally {
    const resolved = path.resolve(root);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(resolved).startsWith("career-workbook-"));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});

test("CSV and Excel sync only one changed source and protect both from stale saves", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "career-workbook-sync-"));
  try {
    const csv = path.join(root, SCHEMA.csv);
    const file = path.join(root, SCHEMA.workbook);
    writeTracker([{ id: "1", company: "Original", position: "Intern", status: "Not applied" }], csv);
    let snapshot = await readApplicationWorkbook({ root });
    snapshot.rows[0]._cellNotes = { company: "Keep this cell note" };
    snapshot = await saveApplicationWorkbook(snapshot.rows, { root, revision: snapshot.revision });

    const csvRows = readTracker(csv);
    csvRows[0].company = "Edited by CLI";
    writeTracker(csvRows, csv);
    await assert.rejects(saveApplicationWorkbook(snapshot.rows, { root, revision: snapshot.revision }), { statusCode: 409 });
    snapshot = await readApplicationWorkbook({ root });
    assert.equal(snapshot.rows[0].company, "Edited by CLI");
    assert.equal(snapshot.rows[0]._cellNotes.company, "Keep this cell note");
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(file);
    const sheet = book.getWorksheet(SCHEMA.sheet);
    const companyColumn = snapshot.columns.findIndex(column => column.key === "company") + 1;
    assert.equal(sheet.getCell(2, companyColumn).value, "Edited by CLI");
    assert.equal(sheet.getCell(2, companyColumn).note, "Keep this cell note");

    sheet.getCell(2, companyColumn).value = "Edited in Excel";
    book.addWorksheet("Other tab").getCell("A1").value = "Retain me";
    await book.xlsx.writeFile(file);
    const excelBeforeImport = fs.readFileSync(file);
    await assert.rejects(regenerateApplicationWorkbook({ root }), { statusCode: 409 });
    snapshot = await readApplicationWorkbook({ root });
    assert.equal(readTracker(csv)[0].company, "Edited in Excel");
    assert.deepEqual(fs.readFileSync(file), excelBeforeImport, "import does not rewrite the workbook");
    assert.equal(snapshot.rows[0]._cellNotes.company, "Keep this cell note");

    // A canonical CSV export retains the workbook's tabs and comments.
    const exportRows = readTracker(csv);
    exportRows[0].position = "CLI title";
    writeTracker(exportRows, csv);
    snapshot = await regenerateApplicationWorkbook({ root });
    assert.equal(snapshot.rows[0]._cellNotes.company, "Keep this cell note");
    const exported = new ExcelJS.Workbook();
    await exported.xlsx.readFile(file);
    assert.equal(exported.getWorksheet("Other tab").getCell("A1").value, "Retain me");
    exported.getWorksheet(SCHEMA.sheet).getCell(2, companyColumn).value = "Unsynced Excel change";
    await exported.xlsx.writeFile(file);
    const conflictRows = readTracker(csv);
    conflictRows[0].company = "Unsynced CSV change";
    writeTracker(conflictRows, csv);
    const csvBefore = fs.readFileSync(csv);
    const workbookBefore = fs.readFileSync(file);
    const syncBefore = fs.readFileSync(path.join(root, ".cache", "tracker-sync.json"));
    await assert.rejects(readApplicationWorkbook({ root }), { statusCode: 409 });
    await assert.rejects(regenerateApplicationWorkbook({ root }), { statusCode: 409 });
    await assert.rejects(saveApplicationWorkbook(snapshot.rows, { root, revision: snapshot.revision }), { statusCode: 409 });
    assert.deepEqual(fs.readFileSync(csv), csvBefore);
    assert.deepEqual(fs.readFileSync(file), workbookBefore);
    assert.deepEqual(fs.readFileSync(path.join(root, ".cache", "tracker-sync.json")), syncBefore);
  } finally {
    const resolved = path.resolve(root);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(resolved).startsWith("career-workbook-sync-"));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});

test('old workbook columns migrate into the requested order without losing decisions or notes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'career-workbook-legacy-'));
  try {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Applications');
    const headers = ['ID', 'APPLY?', 'Who applies', 'Company name', 'Position', 'Job URL', 'Source site', 'Work model', 'Full address', 'Application status', 'Date applied', 'Notes', 'Extra legacy column'];
    sheet.addRow(headers);
    sheet.addRow(['old-1', 'Yes', 'Assistant', 'Example GmbH', 'Data Intern', 'https://indeed.de/viewjob?jk=123', 'Indeed', 'Hybrid', 'Berlin Hauptstraße 1', 'Not applied', '2026-10-01', 'Keep this decision', 'Custom value']);
    sheet.getCell('D2').note = 'Keep this cell note';
    book.addWorksheet('Other').getCell('A1').value = 'Keep tab';
    await book.xlsx.writeFile(path.join(root, SCHEMA.workbook));
    const snapshot = await readApplicationWorkbook({ root });
    assert.equal(snapshot.rows.length, 1);
    assert.equal(snapshot.rows[0].apply, 'Yes');
    assert.equal(snapshot.rows[0].applicant, 'Assistant');
    assert.equal(snapshot.rows[0].status, 'To apply');
    assert.equal(snapshot.rows[0].legacy_status, 'Not applied');
    assert.equal(snapshot.rows[0].source, 'Other');
    assert.equal(snapshot.rows[0].source_site, 'Indeed');
    assert.equal(snapshot.rows[0].job_url, 'https://indeed.de/viewjob?jk=123');
    assert.equal(snapshot.rows[0].follow_up, '2026-10-08');
    assert.equal(snapshot.rows[0]._cellNotes.company, 'Keep this cell note');
    const migrated = new ExcelJS.Workbook();
    await migrated.xlsx.readFile(path.join(root, SCHEMA.workbook));
    const active = migrated.getWorksheet('Applications');
    assert.deepEqual(active.getRow(1).values.slice(1, 34), SCHEMA.columns.slice(0, 33).map(column => column.header));
    assert.equal(active.getCell('A2').note, 'Keep this cell note');
    assert.equal(active.getCell('D2').value, 'https://indeed.de/viewjob?jk=123');
    assert.match(active.getCell('I2').value.formula, /^IF\(H2=/);
    assert.match(active.getCell('V2').value.formula, /^IF\(U2=/);
    assert.match(active.getCell('AG2').value.formula, /^IF\(COUNTIF/);
    assert.equal(migrated.getWorksheet('Other').getCell('A1').value, 'Keep tab');
    const extra = active.getRow(1).values.indexOf('Extra legacy column');
    assert.equal(active.getCell(2, extra).value, 'Custom value');
  } finally {
    const resolved = path.resolve(root);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
