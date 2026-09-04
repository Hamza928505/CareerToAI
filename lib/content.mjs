// Shared content layer. Used by the Eleventy data files (build time) and by
// scripts/add-cert.mjs (local authoring time) so both agree on the schema.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = path.join(ROOT, "data");
export const CERTS_JSON = path.join(DATA_DIR, "certificates.json");
export const PROFILE_JSON = path.join(DATA_DIR, "profile.json");
export const SITE_JSON = path.join(DATA_DIR, "site.json");
export const EXPERIENCE_JSON = path.join(DATA_DIR, "experience.json");
export const PUBLISHED_CERT_DIR = path.join(ROOT, "src", "certs");
export const PUBLISHED_MEDIA_DIR = path.join(ROOT, "src", "media");

const TODO = /^\s*TODO\b/i;

/** True for a placeholder value the user has not filled in yet. */
export const isPlaceholder = (v) => typeof v === "string" && TODO.test(v);

/** Placeholder-aware read: returns "" for unfilled TODO values. */
export const real = (v) => (typeof v === "string" && !isPlaceholder(v) ? v.trim() : "");

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

/**
 * Turn arbitrary text into a stable, URL-safe id.
 * "AWS Certified Solutions Architect – Associate" -> "aws-certified-solutions-architect-associate"
 */
export function slugify(text) {
  return String(text)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Accepts YYYY, YYYY-MM or YYYY-MM-DD. Returns null for anything else. */
export function parsePartialDate(value) {
  const s = real(value);
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(s);
  if (!m) return null;
  const [, y, mo, d] = m;
  return {
    iso: [y, mo, d].filter(Boolean).join("-"),
    year: Number(y),
    precision: d ? "day" : mo ? "month" : "year",
    sortKey: `${y}-${mo ?? "01"}-${d ?? "01"}`,
  };
}

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

/** Human label for a partial date: "15 March 2024", "March 2024", "2024". */
export function formatDate(value) {
  const p = parsePartialDate(value);
  if (!p) return "";
  const [y, mo, d] = p.iso.split("-");
  if (p.precision === "year") return y;
  if (p.precision === "month") return `${MONTHS[Number(mo) - 1]} ${y}`;
  return `${Number(d)} ${MONTHS[Number(mo) - 1]} ${y}`;
}

export const CERT_FIELDS = [
  "id", "title", "issuer", "dateIssued", "dateExpires", "credentialId",
  "credentialUrl", "description", "skills", "certificateImage",
  "certificateImageWidth", "certificateImageHeight", "certificateFile",
  "sourceFileType", "extractedText", "addedAt",
];

/** Fill in derived/defaulted fields so templates never have to guard. */
export function normalizeCertificate(raw) {
  const issued = parsePartialDate(raw.dateIssued);
  const expires = parsePartialDate(raw.dateExpires);
  const skills = Array.isArray(raw.skills) ? raw.skills.map((s) => String(s).trim()).filter(Boolean) : [];
  return {
    ...raw,
    id: raw.id,
    title: String(raw.title || "").trim(),
    issuer: String(raw.issuer || "").trim(),
    description: String(raw.description || "").trim(),
    extractedText: String(raw.extractedText || "").trim(),
    skills,
    credentialId: real(raw.credentialId),
    credentialUrl: real(raw.credentialUrl),
    certificateImage: raw.certificateImage || "",
    certificateFile: raw.certificateFile || "",
    sourceFileType: raw.sourceFileType || "image",
    issued,
    expires,
    // Expired only when we know the date and it is in the past.
    isExpired: Boolean(expires && new Date(expires.sortKey) < new Date()),
    // Addressable as a fragment on the profile page — there is no per-certificate page.
    fragment: `#credential-${raw.id}`,
    sortKey: issued ? issued.sortKey : "0000-00-00",
  };
}

/** All certificates, newest issue date first. */
export function loadCertificates() {
  const raw = readJson(CERTS_JSON);
  if (!Array.isArray(raw)) throw new Error("data/certificates.json must contain a JSON array");
  return raw.map(normalizeCertificate).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

/**
 * Union of profile.skills and the skills on every entry in each extra source
 * (certificates, experience), deduplicated case-insensitively (first spelling
 * wins) and sorted by how many entries back them, then alphabetically.
 */
export function aggregateSkills(profileSkills, ...sources) {
  const byKey = new Map();
  const add = (name, fromCert) => {
    const label = String(name).trim();
    if (!label || isPlaceholder(label)) return;
    const key = label.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, { name: label, count: 0 });
    if (fromCert) byKey.get(key).count += 1;
  };
  for (const s of profileSkills || []) add(s, false);
  for (const list of sources) {
    for (const entry of list || []) for (const s of entry.skills || []) add(s, true);
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Experience and education
//
// Both are edited through /editor/ and stored as plain JSON, same as
// certificates. An empty endDate means "still there", which is why every
// range formatter has to handle a missing end rather than treating it as bad
// data.
// ---------------------------------------------------------------------------

/** "March 2024 – Present" / "August 2021 – June 2023" / "2019". */
export function formatDateRange(start, end) {
  const from = formatDate(start);
  const to = formatDate(end);
  if (!from && !to) return "";
  if (!from) return to;
  if (!to) return `${from} – Present`;
  if (from === to) return from;
  return `${from} – ${to}`;
}

export function normalizeExperience(raw) {
  const started = parsePartialDate(raw.startDate);
  const ended = parsePartialDate(raw.endDate);
  return {
    ...raw,
    id: raw.id || slugify([raw.title, raw.organization].filter(Boolean).join("-")),
    title: String(raw.title || "").trim(),
    organization: String(raw.organization || "").trim(),
    employmentType: real(raw.employmentType),
    location: real(raw.location),
    locationType: real(raw.locationType),
    description: String(raw.description || "").trim(),
    skills: Array.isArray(raw.skills) ? raw.skills.map((s) => String(s).trim()).filter(Boolean) : [],
    attachmentImage: raw.attachmentImage || "",
    started,
    ended,
    isCurrent: Boolean(started && !ended),
    dateRange: formatDateRange(raw.startDate, raw.endDate),
    // Ongoing roles sort above finished ones that started the same month.
    sortKey: `${started ? started.sortKey : "0000-00-00"}-${ended ? "0" : "1"}`,
  };
}

/** All roles, most recent start first; ongoing roles win ties. */
export function loadExperience() {
  if (!fs.existsSync(EXPERIENCE_JSON)) return [];
  const raw = readJson(EXPERIENCE_JSON);
  if (!Array.isArray(raw)) throw new Error("data/experience.json must contain a JSON array");
  return raw.map(normalizeExperience).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

export function normalizeEducation(raw) {
  return {
    ...raw,
    // real() so a "TODO:" school is dropped by the filter in buildProfile
    // rather than published as placeholder text.
    school: real(raw.school),
    industry: real(raw.industry),
    degree: real(raw.degree),
    fieldOfStudy: real(raw.fieldOfStudy),
    description: String(raw.description || "").trim(),
    dateRange: formatDateRange(raw.startDate, raw.endDate),
    started: parsePartialDate(raw.startDate),
    ended: parsePartialDate(raw.endDate),
    sortKey: parsePartialDate(raw.endDate)?.sortKey || parsePartialDate(raw.startDate)?.sortKey || "0000-00-00",
  };
}

/**
 * Derive everything the templates need from the raw profile file.
 *
 * `name` is assembled from firstName/lastName, falling back to a legacy `name`
 * field so an older data/profile.json keeps working. Current role and employer
 * fall back to the ongoing experience entry, so they only have to be typed once.
 */
export function buildProfile(raw, { certificates = [], experience = [] } = {}) {
  const first = real(raw.firstName);
  const last = real(raw.lastName);
  const assembled = [first, last].filter(Boolean).join(" ");
  const current = experience.find((e) => e.isCurrent);

  const links = (raw.links || []).filter((l) => l && l.url && !/TODO/i.test(l.url) && l.url.trim());
  const education = (raw.education || [])
    .map(normalizeEducation)
    .filter((e) => e.school)
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey));

  return {
    ...raw,
    firstName: first,
    lastName: last,
    name: assembled || real(raw.name) || "Unnamed Profile",
    headline: real(raw.headline),
    bio: real(raw.bio),
    location: real(raw.location),
    email: real(raw.email),
    pronouns: real(raw.pronouns),
    jobTitle: real(raw.jobTitle) || current?.title || "",
    worksFor: real(raw.worksFor) || current?.organization || "",
    links,
    education,
    skills: aggregateSkills(raw.skills, certificates, experience),
    certificateCount: certificates.length,
    experienceCount: experience.length,
  };
}
