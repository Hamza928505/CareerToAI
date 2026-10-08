/**
 * The application tracker, shared by the site and the job-search framework.
 *
 * `data/applications.csv` is the source of truth: git-diffable, readable by the
 * framework commands, and the thing `/apply`, `/rank` and `/outcome` write to.
 * `job_search_tracker.xlsx` is a rendering of it, rebuilt by
 * `scripts/make-internship-tracker.mjs` — which is why `npm run tracker` is now
 * safe to run: the rows live in the CSV, not in the workbook.
 *
 * The column list and the status vocabulary both come from
 * `data/tracker-schema.json` so neither is defined twice.
 */

import fs from "node:fs";
import path from "node:path";

import { ROOT, readJson } from "./content.mjs";
import { scoreJobMatch } from './job-match.mjs';

export const SCHEMA_JSON = path.join(ROOT, "data", "tracker-schema.json");

export const SCHEMA = readJson(SCHEMA_JSON);
export const COLUMNS = SCHEMA.columns;
export const STATUSES = SCHEMA.statuses.map((s) => s.value);
export const OPEN_STATUSES = SCHEMA.statuses.filter((s) => s.open).map((s) => s.value);

export const CSV_PATH = path.join(ROOT, ...SCHEMA.csv.split("/"));

/** Columns the sheet works out for itself — never written back from a row. */
export const COMPUTED = new Set(COLUMNS.filter((c) => c.computed).map((c) => c.key));
const CURRENT_STATUSES = new Set(STATUSES);
const SOURCE_CHOICES = new Set(SCHEMA.sourceChoices);

export function inferOpportunityType(position) {
  const title = String(position || '');
  if (/\b(?:werkstudent\w*|working[ -]student)\b/i.test(title)) return 'Werkstudent';
  if (/\b(?:bachelorarbeit|bachelor[ -](?:thesis|project))\b/i.test(title)) return 'Bachelor thesis';
  if (/\b(?:praktikum|praktikant\w*|praxissemester)\b/i.test(title)) return 'Praktikum';
  if (/\b(?:internship|intern)\b/i.test(title)) return 'Internship';
  if (/\b(?:junior|graduate|entry[ -]level)\b/i.test(title)) return 'Junior role';
  return '';
}

export function normalizeTrackerRow(row) {
  const value = { ...row };
  if (value.source && !SOURCE_CHOICES.has(value.source)) {
    value.source_site ||= value.source;
    value.source = 'Other';
  }
  if (value.status && !CURRENT_STATUSES.has(value.status)) {
    value.legacy_status ||= value.status;
    if (['Blocked', 'Needs input'].includes(value.status)) value.assistant_state ||= value.status;
    value.status = ({
      'Not applied': 'To apply', 'Failed': 'To apply', 'Blocked': 'To apply',
      'Needs input': 'To apply', 'Confirmation received': 'Applied',
      'Interview done': 'Interview scheduled', 'No response': 'Ghosted',
      'Withdrawn': 'Rejected',
    })[value.status] || 'To apply';
  }
  if (value.interest === undefined) value.interest = value.why_match || value.reason || '';
  if (value.documents_used === undefined) value.documents_used = [value.cv_file, value.cl_file].filter(Boolean).join('; ');
  return value;
}

export function computeTrackerRows(rows) {
  const counts = new Map();
  for (const row of rows) {
    row.job_id = postingIdFromUrl(row.job_url);
    if (!row.match_score) {
      const match = scoreJobMatch(row);
      if (match) {
        row.match_score = String(match.score);
        row.why_match ||= match.reason;
        row.missing_reqs ||= match.missing;
      }
    }
    const key = `${String(row.company || '').trim().toLowerCase()}\0${String(row.position || '').trim().toLowerCase()}`;
    if (row.company && row.position) counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const row of rows) {
    const address = String(row.address || '').trim();
    row.maps_link = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${row.company || ''} ${address}`.trim()).replace(/%20/g, '+')}` : '';
    const sent = /^\d{4}-\d{2}-\d{2}$/.test(row.date_applied || '') ? new Date(`${row.date_applied}T00:00:00Z`) : null;
    row.follow_up = sent && !Number.isNaN(sent.valueOf()) ? new Date(sent.valueOf() + 7 * 86400000).toISOString().slice(0, 10) : '';
    const key = `${String(row.company || '').trim().toLowerCase()}\0${String(row.position || '').trim().toLowerCase()}`;
    row.duplicate_check = counts.get(key) > 1 ? 'DUPLICATE' : '';
  }
  return rows;
}

export function postingIdFromUrl(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    for (const [key, id] of url.searchParams) {
      if (/^(?:id|jk|vjk|job_?id|jobadid|reference|refnr|stellenangebotsid)$/i.test(key) && id.trim()) return id.trim();
    }
    const last = decodeURIComponent(url.pathname.replace(/\/+$/, '').split('/').at(-1) || '');
    return last.match(/(?:^|[-_])j(\d{4,})(?:\.[a-z]+)?$/i)?.[1]
      || last.match(/(\d{4,}(?:-\d{4,})*(?:-[A-Z])?)(?:\.[a-z]+)?$/i)?.[1]
      || '';
  } catch { return ''; }
}

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
  const byHeader = new Map(COLUMNS.flatMap((c) => [c.header, ...(c.legacyHeaders || [])].map((header) => [header, c.key])));
  const keys = header.map((h) => byHeader.get(h) ?? null);

  const unknown = header.filter((h) => !byHeader.has(h));
  if (unknown.length) {
    throw new Error(
      `${path.relative(ROOT, file)} has columns that data/tracker-schema.json does not define: ` +
        `${unknown.join(", ")}. Add them to the schema, or fix the header.`,
    );
  }

  return computeTrackerRows(rows.slice(1).map((cells) => {
    const row = {};
    keys.forEach((key, i) => { if (key) row[key] = (cells[i] ?? "").trim(); });
    return normalizeTrackerRow(row);
  }));
}

export function writeTracker(rows, file = CSV_PATH) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, serializeCsv(rows), "utf8");
  return rows.length;
}

export function jobMatchKey(row) {
  try {
    const url = new URL(row.job_url || "");
    const pathName = url.pathname.replace(/\/$/, "");
    const postingId = [...url.searchParams.keys()].some((key) => /^(id|jk|vjk|job_?id|job|jobadid|reference|stellenangebotsid)$/i.test(key));
    if (postingId || (pathName && !/\/(jobs?|search|careers?)$/i.test(pathName))) {
      url.hash = "";
      for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key) || /^(from|ref|source|trackingId|referrer)$/i.test(key)) url.searchParams.delete(key);
      url.searchParams.sort();
      return `url:${url.href.replace(/\/$/, "")}`;
    }
  } catch {}
  const normalize = (value) => String(value || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const company = normalize(row.company);
  const position = normalize(row.position);
  return company && position ? `job:${company}|${position}` : "";
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
