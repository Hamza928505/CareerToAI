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
export const PROJECTS_JSON = path.join(DATA_DIR, "projects.json");
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

/**
 * Order is the file's order, everywhere.
 *
 * The lists used to be re-sorted newest-first on load, which meant the order of
 * data/*.json was decorative — you could not put the role you want read first
 * at the top. Now the array is the order: the site, /llms.txt, the JSON-LD and
 * the generated candidate profile all publish it as written, and /editor/ is
 * where you arrange it by dragging. `sortKey` is still on every entry, and
 * `byDateDesc` still sorts by it, so the old order is one call away for anything
 * that wants it — it is just no longer imposed.
 */
export const byDateDesc = (a, b) => b.sortKey.localeCompare(a.sortKey);

/** All certificates, in the order data/certificates.json lists them. */
export function loadCertificates() {
  const raw = readJson(CERTS_JSON);
  if (!Array.isArray(raw)) throw new Error("data/certificates.json must contain a JSON array");
  return raw.map(normalizeCertificate);
}

/**
 * Union of profile.skills and the skills on every entry in each extra source
 * (certificates, experience, projects), deduplicated case-insensitively (first
 * spelling wins) and sorted by how many entries back them, then alphabetically.
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
// Experience, education and projects
//
// All three are edited through /editor/ and stored as plain JSON, same as
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
    // What byDateDesc reads when something asks for date order. Ongoing roles
    // sort above finished ones that started the same month.
    sortKey: `${started ? started.sortKey : "0000-00-00"}-${ended ? "0" : "1"}`,
  };
}

/** All roles, in the order data/experience.json lists them. */
export function loadExperience() {
  if (!fs.existsSync(EXPERIENCE_JSON)) return [];
  const raw = readJson(EXPERIENCE_JSON);
  if (!Array.isArray(raw)) throw new Error("data/experience.json must contain a JSON array");
  return raw.map(normalizeExperience);
}

// A project is work you can point at that no employer owns: a side project, a
// university capstone, an open-source contribution. It is deliberately not an
// experience entry — there is no employer, and the thing itself, not the role,
// is what a reader wants the link to.
export function normalizeProject(raw) {
  const started = parsePartialDate(raw.startDate);
  const ended = parsePartialDate(raw.endDate);
  const id = raw.id || slugify([raw.name, raw.organization].filter(Boolean).join("-"));
  return {
    ...raw,
    id,
    name: String(raw.name || "").trim(),
    role: real(raw.role),
    organization: real(raw.organization),
    url: real(raw.url),
    sourceUrl: real(raw.sourceUrl),
    description: String(raw.description || "").trim(),
    skills: Array.isArray(raw.skills) ? raw.skills.map((s) => String(s).trim()).filter(Boolean) : [],
    attachmentImage: raw.attachmentImage || "",
    started,
    ended,
    isOngoing: Boolean(started && !ended),
    dateRange: formatDateRange(raw.startDate, raw.endDate),
    // Addressable as a fragment wherever the profile is rendered, same as a
    // certificate — there is no per-project page.
    fragment: `#project-${id}`,
    // What byDateDesc reads when something asks for date order. Ongoing
    // projects sort above finished ones that started the same month.
    sortKey: `${started ? started.sortKey : "0000-00-00"}-${ended ? "0" : "1"}`,
  };
}

/** All projects, in the order data/projects.json lists them. */
export function loadProjects() {
  if (!fs.existsSync(PROJECTS_JSON)) return [];
  const raw = readJson(PROJECTS_JSON);
  if (!Array.isArray(raw)) throw new Error("data/projects.json must contain a JSON array");
  return raw.map(normalizeProject);
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
 * A working language and how well you actually work in it.
 *
 * This is not decoration: the Language Gate in the job-search framework treats
 * an undeclared language as a hard no rather than a gap to talk around, so a
 * language with no name is dropped rather than published half-stated.
 */
export function normalizeLanguage(raw) {
  return {
    ...raw,
    // real() so a "TODO:" language is dropped by the filter in buildProfile.
    language: real(raw.language),
    level: real(raw.level),
    notes: String(raw.notes || "").trim(),
  };
}

/**
 * Derive everything the templates need from the raw profile file.
 *
 * `name` is assembled from firstName/lastName, falling back to a legacy `name`
 * field so an older data/profile.json keeps working. Current role and employer
 * fall back to the ongoing experience entry, so they only have to be typed once.
 */
export function buildProfile(raw, { certificates = [], experience = [], projects = [] } = {}) {
  const first = real(raw.firstName);
  const last = real(raw.lastName);
  const assembled = [first, last].filter(Boolean).join(" ");
  const current = experience.find((e) => e.isCurrent);

  const links = (raw.links || []).filter((l) => l && l.url && !/TODO/i.test(l.url) && l.url.trim());
  // Kept in the order profile.json lists it, same as every other list.
  const education = (raw.education || [])
    .map(normalizeEducation)
    .filter((e) => e.school);
  const languages = (raw.languages || [])
    .map(normalizeLanguage)
    .filter((l) => l.language);

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
    languages,
    skills: aggregateSkills(raw.skills, certificates, experience, projects),
    certificateCount: certificates.length,
    languageCount: languages.length,
    experienceCount: experience.length,
    projectCount: projects.length,
  };
}
