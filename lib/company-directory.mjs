/**
 * The company directory: companies operating in Germany, their official websites, careers pages and recruitment
 * platforms. One JSON file, data/companies.json (git-ignored: it is this computer's working state, rebuilt by discovery).
 *
 * A record is only ever built by the functions here, so every source ends up in the same shape, and a company found
 * twice (two sources, or the same source again) is one record: upsertCompanies() matches on the website's host first
 * and on the name without its legal form second ("SAP SE" and "SAP" are the same company).
 */
import fs from "node:fs";
import path from "node:path";

import { ROOT } from "./content.mjs";

export const COMPANIES_FILE = path.join(ROOT, "data", "companies.json");

const LEGAL = /\b(gmbh|ag|se|kg|kgaa|ohg|ug|mbh|co|inc|ltd|llc|plc|e\.?\s?v\.?|gruppe|group|holding|deutschland|germany|und|and|the)\b/g;
const fold = (text) => String(text || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");

/** "SAP SE" -> "sap", "Drees & Sommer SE" -> "dreessommer": the name a company is recognised by whatever its legal form. */
export const nameKey = (name) => fold(name).replace(/&/g, " ").replace(LEGAL, " ").replace(/[^a-z0-9]+/g, "");

/** "https://www.sap.com/germany/" -> "sap.com". "" for anything that is not a web address. */
export function hostKey(url) {
  try { const parsed = new URL(url); return ["http:", "https:"].includes(parsed.protocol) ? parsed.hostname.toLowerCase().replace(/^www\./, "") : ""; } catch { return ""; }
}

const text = (value, max = 200) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const web = (value) => (hostKey(value) ? String(value).trim().slice(0, 500) : "");
const list = (value, max = 12) => [...new Set((Array.isArray(value) ? value : []).map((item) => text(item, 80)).filter(Boolean))].slice(0, max);

export const SIZE_BANDS = ["1-49", "50-249", "250-999", "1,000-9,999", "10,000+"];
/** A number of employees as one of SIZE_BANDS, or "" when it is not known. */
export function sizeBand(employees) {
  const n = Number(String(employees ?? "").replace(/[^\d]/g, ""));
  if (!n) return "";
  return n < 50 ? SIZE_BANDS[0] : n < 250 ? SIZE_BANDS[1] : n < 1000 ? SIZE_BANDS[2] : n < 10000 ? SIZE_BANDS[3] : SIZE_BANDS[4];
}

/** A clean record from whatever a source or the page sent. Unknown fields are dropped; nothing is invented. */
export function normalizeCompany(raw = {}) {
  const platform = raw.platform && typeof raw.platform === "object" ? raw.platform : {};
  return {
    id: text(raw.id, 80),
    name: text(raw.name, 120),
    industry: text(raw.industry, 120),
    employees: Number(String(raw.employees ?? "").replace(/[^\d]/g, "")) || 0,
    hq: text(raw.hq, 120),
    locations: list(raw.locations),
    website: web(raw.website),
    careersUrl: web(raw.careersUrl),
    platform: { name: text(platform.name, 80), token: text(platform.token, 120), boardUrl: web(platform.boardUrl) },
    applyMethods: list(raw.applyMethods, 6),
    source: text(raw.source, 80),
    discoveredAt: text(raw.discoveredAt, 30),
    verifiedAt: text(raw.verifiedAt, 30),
    // unverified: not tried yet. ok / found: the address answered. broken: it did not. blocked: the site's robots.txt or
    // a refusal says not to read it. not found: the website has no careers page this could find.
    websiteStatus: ["ok", "broken", "blocked"].includes(raw.websiteStatus) ? raw.websiteStatus : "unverified",
    careersStatus: ["found", "not found", "broken", "blocked"].includes(raw.careersStatus) ? raw.careersStatus : "unverified",
    attempts: (Array.isArray(raw.attempts) ? raw.attempts : []).slice(-8).map((attempt) => ({ at: text(attempt.at, 30), step: text(attempt.step, 30), ok: attempt.ok === true, note: text(attempt.note, 200) })),
  };
}

export function readCompanies(file = COMPANIES_FILE) {
  try { return (JSON.parse(fs.readFileSync(file, "utf8")).companies || []).map(normalizeCompany).filter((company) => company.name); } catch { return []; }
}

export function writeCompanies(companies, file = COMPANIES_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try { fs.writeFileSync(temporary, `${JSON.stringify({ updated: new Date().toISOString(), companies }, null, 1)}\n`); fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, { force: true }); }
  return companies;
}

/**
 * Add what a source found to the directory. A company already there is filled in, never duplicated and never
 * downgraded: a field that has a value keeps it, and a verified address is not replaced by an unverified one.
 * Returns { companies, added, merged }.
 */
export function upsertCompanies(existing, found, now = new Date().toISOString()) {
  const companies = existing.map((company) => ({ ...company }));
  const byHost = new Map(companies.filter((c) => hostKey(c.website)).map((c) => [hostKey(c.website), c]));
  const byName = new Map(companies.filter((c) => nameKey(c.name)).map((c) => [nameKey(c.name), c]));
  let added = 0, merged = 0;
  for (const raw of found) {
    const incoming = normalizeCompany(raw);
    const key = nameKey(incoming.name);
    if (!key) continue;
    const match = byHost.get(hostKey(incoming.website)) || byName.get(key);
    if (match) {
      for (const field of ["industry", "hq", "website", "careersUrl", "source"]) if (!match[field] && incoming[field]) match[field] = incoming[field];
      if (!match.employees && incoming.employees) match.employees = incoming.employees;
      if (!match.platform.name && incoming.platform.name) match.platform = incoming.platform;
      match.locations = list([...match.locations, ...incoming.locations]);
      match.applyMethods = list([...match.applyMethods, ...incoming.applyMethods], 6);
      if (hostKey(match.website)) byHost.set(hostKey(match.website), match);
      merged++;
    } else {
      // The id never changes once given, so the page and the tracker can refer to a company.
      let id = key.slice(0, 40), n = 2;
      while (companies.some((c) => c.id === id)) id = `${key.slice(0, 40)}-${n++}`;
      const record = { ...incoming, id, discoveredAt: incoming.discoveredAt || now };
      companies.push(record);
      byName.set(key, record);
      if (hostKey(record.website)) byHost.set(hostKey(record.website), record);
      added++;
    }
  }
  return { companies, added, merged };
}

/** Record that a step was tried on a company (the last eight are kept), so a broken address is visible and not retried blindly. */
export function logAttempt(company, step, ok, note = "", now = new Date().toISOString()) {
  company.attempts = [...(company.attempts || []), { at: now, step, ok, note: text(note, 200) }].slice(-8);
  if (ok) company.verifiedAt = now;
  return company;
}

/** The directory as the page filters it: free text over name, industry and places, plus exact filters. */
export function filterCompanies(companies, { q = "", industry = "", city = "", size = "", platform = "", status = "" } = {}) {
  const needle = fold(q).trim();
  return companies.filter((c) => {
    if (needle && !fold([c.name, c.industry, c.hq, ...c.locations, c.platform.name].join(" ")).includes(needle)) return false;
    if (industry && c.industry !== industry) return false;
    if (city && ![c.hq, ...c.locations].some((place) => fold(place).includes(fold(city)))) return false;
    if (size && sizeBand(c.employees) !== size) return false;
    if (platform && c.platform.name !== platform) return false;
    if (status === "careers" && c.careersStatus !== "found") return false;
    if (status === "todo" && (c.websiteStatus !== "unverified" && c.careersStatus !== "unverified")) return false;
    if (status === "problem" && !["broken", "blocked"].includes(c.websiteStatus) && !["broken", "blocked", "not found"].includes(c.careersStatus)) return false;
    return true;
  });
}
