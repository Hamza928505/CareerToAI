import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import XLSX from "xlsx";
import { ROOT } from "../lib/content.mjs";
import { COLUMNS, SCHEMA, STATUSES, readTracker, writeTracker } from "../lib/tracker.mjs";

const execFileAsync = promisify(execFile);
const legacyPath = path.join(ROOT, "job_search_tracker.xlsx");
const schemaWorkbookPath = path.join(ROOT, "applications.xlsx");
const backupDir = path.join(ROOT, ".cache", `tracker-migration-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const byHeader = new Map(COLUMNS.map((column) => [column.header, column.key]));

const value = (row, names) => {
  for (const name of names) {
    const found = row[name];
    if (found instanceof Date && !Number.isNaN(found.valueOf())) return found.toISOString().slice(0, 10);
    if (found !== undefined && found !== null && String(found).trim()) return String(found).trim();
  }
  return "";
};

function normalizeStatus(status, notes) {
  const original = status;
  const aliases = new Map([["To apply", "Not applied"], ["Ghosted", "No response"], ["Interview", "Interview scheduled"], ["Submitted", "Applied"]]);
  const normalized = aliases.get(status) || status;
  if (STATUSES.includes(normalized)) return normalized;
  if (original) notes.push(`Legacy status: ${original}`);
  return "";
}

function fromSchemaWorkbook(filename) {
  if (!fs.existsSync(filename)) return [];
  const workbook = XLSX.readFile(filename, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames.includes(SCHEMA.sheet) ? SCHEMA.sheet : workbook.SheetNames[0]];
  const records = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return records.map((record) => {
    const row = {};
    for (const [header, key] of byHeader) if (record[header] !== undefined) row[key] = value(record, [header]);
    return row;
  });
}

function fromLegacyWorkbook(filename) {
  if (!fs.existsSync(filename)) return [];
  const workbook = XLSX.readFile(filename, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames.includes("Applications") ? "Applications" : workbook.SheetNames[0]];
  const records = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return records.map((record) => {
    const notes = [];
    const location = value(record, ["Location / Work mode"]);
    const workModel = location.match(/remote|hybrid|on[ -]?site/i)?.[0] || "";
    const city = location.replace(/\s*[|/]\s*(remote|hybrid|on[ -]?site)\s*/i, "").trim();
    const row = {
      id: value(record, ["ID"]),
      company: value(record, ["Company", "Company name"]),
      position: value(record, ["Position", "Role"]),
      website: value(record, ["Website"]),
      job_url: value(record, ["Link to posting", "Job URL"]),
      date_found: value(record, ["Date found"]),
      source: value(record, ["Source", "Source site"]),
      city,
      address: value(record, ["Address", "Full address"]),
      maps_link: value(record, ["Google Maps link", "Google Maps"]),
      contact_person: value(record, ["Contact person"]),
      contact_email: value(record, ["Contact e-mail", "Contact email"]),
      why_match: value(record, ["What interests me in the offer", "Why it matches"]),
      match_score: value(record, ["Role fit score", "Match score (0-100)"]),
      deadline: value(record, ["Deadline"]),
      date_applied: value(record, ["Date sent", "Date applied"]),
      follow_up: value(record, ["Follow-up date"]),
      response_date: value(record, ["Last contact date", "Response date"]),
      response_summary: value(record, ["Answer", "Response summary"]),
      interview_date: value(record, ["Interview date"]),
      salary: value(record, ["Salary / Stipend", "Salary amount"]),
      work_model: workModel,
      status: normalizeStatus(value(record, ["Status", "Application status"]), notes),
      data_source: value(record, ["Source", "Data source"]),
      notes: value(record, ["Notes"]),
      apply: "",
    };

    const extras = {};
    for (const [header, field] of Object.entries({
      "Commute / travel time": "Commute / travel time",
      "Referral / Advocate": "Referral / advocate",
      "Priority": "Priority",
      "Tailored application?": "Tailored application?",
      "Documents used": "Documents used",
      "Portfolio / work sample link": "Portfolio / work sample link",
      "Interview type": "Interview type",
      "Next action": "Next action",
      "Next action date": "Next action date",
      "Reason lost": "Reason lost",
      "Duplicate check": "Duplicate check",
    })) {
      const found = value(record, [header]);
      if (found) extras[field] = found;
    }
    if (Object.keys(extras).length) row.notes = [row.notes, `Migrated fields: ${JSON.stringify(extras)}`].filter(Boolean).join("\n");
    return row;
  }).filter((row) => Object.values(row).some((entry) => entry !== ""));
}

function normalizeUrl(input) {
  try {
    const url = new URL(input);
    const pathname = url.pathname.replace(/\/$/, "");
    if (!pathname || /\/(jobs?|search|careers?)$/i.test(pathname)) return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|from|ref|source)/i.test(key)) url.searchParams.delete(key);
    return url.href.replace(/\/$/, "").toLowerCase();
  } catch { return ""; }
}

function matchKey(row) {
  const url = normalizeUrl(row.job_url);
  if (url) return `url:${url}`;
  const company = String(row.company || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const role = String(row.position || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return company && role ? `job:${company}|${role}` : "";
}

function mergeSources(sources) {
  const rows = [];
  const index = new Map();
  let duplicates = 0;
  let conflicts = 0;
  for (const sourceRows of sources) for (const incoming of sourceRows) {
    const row = Object.fromEntries(COLUMNS.map((column) => [column.key, String(incoming[column.key] ?? "").trim()]));
    const key = matchKey(row);
    const existingIndex = key ? index.get(key) : undefined;
    if (existingIndex === undefined) {
      rows.push(row);
      if (key) index.set(key, rows.length - 1);
      continue;
    }
    duplicates++;
    const existing = rows[existingIndex];
    for (const column of COLUMNS) {
      const oldValue = existing[column.key];
      const newValue = row[column.key];
      if (!oldValue && newValue) existing[column.key] = newValue;
      else if (oldValue && newValue && oldValue !== newValue) conflicts++;
    }
  }
  let nextId = rows.reduce((max, row) => Math.max(max, Number(String(row.id || "").match(/\d+/)?.[0] || 0)), 0);
  for (const row of rows) {
    if (!row.id) row.id = `job-${++nextId}`;
    if (!row.status) row.status = "Not applied";
  }
  return { rows, duplicates, conflicts };
}

const existingCsv = readTracker();
const merged = mergeSources([
  fromLegacyWorkbook(legacyPath),
  existingCsv,
  fromSchemaWorkbook(schemaWorkbookPath),
]);

if (process.argv.includes("--dry-run")) {
  console.log(JSON.stringify({ rows: merged.rows.length, duplicates: merged.duplicates, fieldConflicts: merged.conflicts, written: false }));
} else {
  fs.mkdirSync(backupDir, { recursive: true });
  for (const source of [legacyPath, schemaWorkbookPath, path.join(ROOT, SCHEMA.csv)]) {
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(backupDir, path.basename(source)));
  }
  const count = writeTracker(merged.rows);
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  try {
    await execFileAsync(npm, ["run", "tracker"], { cwd: ROOT, timeout: 60_000, shell: process.platform === "win32" });
  } catch (error) {
    console.error("Workbook generation failed; original files remain in .cache tracker-migration backup.");
    throw error;
  }
  console.log(JSON.stringify({ rows: count, duplicates: merged.duplicates, fieldConflicts: merged.conflicts, backup: path.relative(ROOT, backupDir) }));
}
