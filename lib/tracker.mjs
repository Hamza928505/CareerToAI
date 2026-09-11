/**
 * The application tracker, shared by the site and the job-search framework.
 *
 * `data/tracker.csv` is the source of truth: git-diffable, readable by the
 * framework commands, and the thing `/apply`, `/rank` and `/outcome` write to.
 * `internship-tracker.xlsx` is a rendering of it, rebuilt by
 * `scripts/make-internship-tracker.mjs` — which is why `npm run tracker` is now
 * safe to run: the rows live in the CSV, not in the workbook.
 *
 * The column list and the status vocabulary both come from
 * `data/tracker-schema.json` so neither is defined twice.
 */

import fs from "node:fs";
import path from "node:path";

import { ROOT, readJson } from "./content.mjs";

export const SCHEMA_JSON = path.join(ROOT, "data", "tracker-schema.json");

export const SCHEMA = readJson(SCHEMA_JSON);
export const COLUMNS = SCHEMA.columns;
export const STATUSES = SCHEMA.statuses.map((s) => s.value);
export const OPEN_STATUSES = SCHEMA.statuses.filter((s) => s.open).map((s) => s.value);

export const CSV_PATH = path.join(ROOT, ...SCHEMA.csv.split("/"));

/** Columns the sheet works out for itself — never written back from a row. */
export const COMPUTED = new Set(COLUMNS.filter((c) => c.computed).map((c) => c.key));

/** RFC4180-ish parse: handles quoted fields, embedded commas, quotes and newlines. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ""));
}

const quote = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function serializeCsv(rows) {
  const headers = COLUMNS.map((c) => c.header);
  const lines = [headers.map(quote).join(",")];
  for (const row of rows) {
    lines.push(COLUMNS.map((c) => quote(row[c.key])).join(","));
  }
  return lines.join("\n") + "\n";
}

/**
 * Read the tracker. Returns row objects keyed by column key, in file order.
 * A missing CSV is not an error — it means you have not tracked anything yet.
 */
export function readTracker(file = CSV_PATH) {
  if (!fs.existsSync(file)) return [];
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  if (!rows.length) return [];

  const header = rows[0].map((h) => h.trim());
  const byHeader = new Map(COLUMNS.map((c) => [c.header, c.key]));
  const keys = header.map((h) => byHeader.get(h) ?? null);

  const unknown = header.filter((h) => !byHeader.has(h));
  if (unknown.length) {
    throw new Error(
      `${path.relative(ROOT, file)} has columns that data/tracker-schema.json does not define: ` +
        `${unknown.join(", ")}. Add them to the schema, or fix the header.`,
    );
  }

  return rows.slice(1).map((cells) => {
    const row = {};
    keys.forEach((key, i) => { if (key) row[key] = (cells[i] ?? "").trim(); });
    return row;
  });
}

export function writeTracker(rows, file = CSV_PATH) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, serializeCsv(rows), "utf8");
  return rows.length;
}

/** Rows still in play — what /rank triages and /html-report counts as open. */
export const isOpen = (row) => OPEN_STATUSES.includes((row.status || "").trim());

/** Throws on a status the schema does not define, naming the row. */
export function assertStatus(row) {
  const status = (row.status || "").trim();
  if (status && !STATUSES.includes(status)) {
    throw new Error(
      `Unknown status "${status}" for ${row.company || "(no company)"}. ` +
        `data/tracker-schema.json allows: ${STATUSES.join(", ")}.`,
    );
  }
  return row;
}
