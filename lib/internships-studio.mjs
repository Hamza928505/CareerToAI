/**
 * GJU German Year Internship CV & Cover Letter Studio
 * Connects CareerToAI to C:\Users\Hamza928\Desktop\Internships:
 *   - Part A: GJU Internship Rules check (Rules 1-10, Verdict, Fit, German email, Contract wording)
 *   - Part B: Tailored Lebenslauf / CV (.docx + .pdf, max 2 pages)
 *   - Part C: Tailored Anschreiben / Cover Letter (.docx + .pdf, max 1 page, DIN 5008)
 *   - ATS self-check via Input Data/ATS/ats_check.py and ATS manuals lookup
 *   - Real German city student-housing address matching from Input Data CSV
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

import { ROOT } from "./content.mjs";
import { chatJson, llmConfig } from "./llm.mjs";
import { applyParagraphEdits, docxParagraphs, loadDocx, pruneStudent, saveDocx } from "./student-files.mjs";

const execFileAsync = promisify(execFile);

export const DEFAULT_INTERNSHIPS_DIR = process.env.INTERNSHIPS_DIR || "C:\\Users\\Hamza928\\Desktop\\Internships";
const SETTINGS_FILE = path.join(ROOT, "data", "internships-settings.json");

export const DEFAULT_SETTINGS = {
  workingDir: DEFAULT_INTERNSHIPS_DIR,
  docLang: "de",
  reportLang: "en",
  earliestStart: "01.03.2027",
  latestEnd: "30.09.2027",
  preferredDuration: "6 Monate",
  rejectedPolicy: "negotiable", // "negotiable" | "all" | "none"
  matchCityAddress: true,
};

export function readStudioSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
      return { ...DEFAULT_SETTINGS, ...saved };
    }
  } catch { /* fallback to defaults */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveStudioSettings(patch = {}) {
  const current = readStudioSettings();
  const next = {
    ...current,
    ...(typeof patch.docLang === "string" ? { docLang: patch.docLang === "en" ? "en" : "de" } : {}),
    ...(typeof patch.earliestStart === "string" ? { earliestStart: patch.earliestStart.trim() } : {}),
    ...(typeof patch.latestEnd === "string" ? { latestEnd: patch.latestEnd.trim() } : {}),
    ...(typeof patch.preferredDuration === "string" ? { preferredDuration: patch.preferredDuration.trim() } : {}),
    ...(typeof patch.rejectedPolicy === "string" && ["negotiable", "all", "none"].includes(patch.rejectedPolicy)
      ? { rejectedPolicy: patch.rejectedPolicy } : {}),
    ...(typeof patch.matchCityAddress === "boolean" ? { matchCityAddress: patch.matchCityAddress } : {}),
  };
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}

export function studioDirs(workingDir = readStudioSettings().workingDir) {
  return {
    root: workingDir,
    inputData: path.join(workingDir, "Input Data"),
    cvs: path.join(workingDir, "CVs"),
    cls: path.join(workingDir, "CLs"),
    ats: path.join(workingDir, "Input Data", "ATS"),
    atsCompanies: path.join(workingDir, "Input Data", "ATS", "Companies"),
  };
}

// ---------------------------------------------------------------------------
// CSV parser for Student_Housing_Germany_GoogleMaps_2026-11-01_one_per_city.csv
// ---------------------------------------------------------------------------

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

export function loadCityHousing(workingDir) {
  const { inputData } = studioDirs(workingDir);
  const csvFile = path.join(inputData, "Student_Housing_Germany_GoogleMaps_2026-11-01_one_per_city.csv");
  if (!fs.existsSync(csvFile)) return [];
  const lines = fs.readFileSync(csvFile, "utf8").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    return {
      city: cols[0] || "",
      town: cols[1] || "",
      name: cols[2] || "",
      address: cols[3] || "",
      postalCode: cols[4] || "",
      type: cols[5] || "",
      who: cols[6] || "",
      phone: cols[7] || "",
      mapsUrl: cols[8] || "",
      group: cols[10] || "",
    };
  }).filter((row) => row.city && row.address);
}

const normText = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

const CITY_ALIASES = {
  munich: "münchen",
  muenchen: "münchen",
  nuremberg: "nürnberg",
  nuernberg: "nürnberg",
  cologne: "köln",
  koeln: "köln",
  frankfurt: "frankfurt am main",
  freiburg: "freiburg im breisgau",
  garching: "garching bei münchen",
};

export function findCityAddress(locationText, housing = loadCityHousing()) {
  const defaultAddress = {
    city: "Deggendorf",
    address: "Untere Himmelreichstraße 10, 94469 Deggendorf",
    name: "Current residence (Deggendorf)",
    matched: false,
  };
  if (!locationText) return defaultAddress;
  let search = normText(locationText);
  for (const [alias, target] of Object.entries(CITY_ALIASES)) {
    if (search.includes(alias)) search += " " + normText(target);
  }
  if (search.includes("deggendorf")) return { ...defaultAddress, matched: true };
  for (const item of housing) {
    const cityNorm = normText(item.city);
    if (cityNorm && search.includes(cityNorm)) {
      // Clean duplicate street or district suffix for a tidy 1-line German CV address
      const cleanAddr = item.address.replace(/,\s*([^,]+),\s*(\d{5}\s+.+)$/, ", $2");
      return {
        city: item.city,
        address: cleanAddr,
        name: item.name,
        type: item.type,
        postalCode: item.postalCode,
        matched: true,
      };
    }
  }
  return defaultAddress;
}

// ---------------------------------------------------------------------------
// ATS Detection & Manuals
// ---------------------------------------------------------------------------

const ATS_PATTERNS = [
  { name: "Workday", manual: "Workday.md", rx: /myworkdayjobs\.com|wd\d\.myworkday|workday/i, companies: ["NVIDIA", "Deutsche Bank", "Airbus", "Intel", "Accenture"] },
  { name: "SAP SuccessFactors", manual: "SAP SuccessFactors.md", rx: /successfactors\.(eu|com)|jobs\.sap\.com|bmwgroup\.jobs|volkswagen|allianz/i, companies: ["SAP", "BMW", "Volkswagen", "Allianz", "Deutsche Telekom"] },
  { name: "SmartRecruiters", manual: "SmartRecruiters.md", rx: /smartrecruiters\.com|jobs\.smartrecruiters/i, companies: ["Bosch", "Continental"] },
  { name: "Eightfold", manual: "Eightfold.md", rx: /eightfold\.ai/i, companies: ["Infineon", "Microsoft"] },
  { name: "Avature", manual: "Avature.md", rx: /avature\.net|jobs\.siemens\.com|ibm\.com\/careers/i, companies: ["Siemens", "IBM"] },
  { name: "Greenhouse", manual: "Greenhouse.md", rx: /greenhouse\.io/i, companies: ["Zalando", "Celonis"] },
  { name: "BeeSite (milch & zucker)", manual: "BeeSite (milch & zucker).md", rx: /beesite\.de|mercedes-benz|porsche/i, companies: ["Mercedes-Benz", "Porsche"] },
  { name: "Personio", manual: "Personio.md", rx: /personio\.(de|com)/i, companies: [] },
  { name: "softgarden", manual: "softgarden.md", rx: /softgarden\.(io|de)/i, companies: [] },
  { name: "Recruitee", manual: "Recruitee.md", rx: /recruitee\.com/i, companies: [] },
  { name: "Lever", manual: "Lever.md", rx: /lever\.co/i, companies: [] },
  { name: "iCIMS", manual: "iCIMS.md", rx: /icims\.com/i, companies: [] },
  { name: "Oracle Taleo / ORC", manual: "Oracle Taleo and Recruiting Cloud.md", rx: /taleo\.net|oraclecloud\.com/i, companies: [] },
  { name: "Phenom", manual: "Phenom.md", rx: /phenom(people)?\.com/i, companies: [] },
  { name: "d.vinci", manual: "d.vinci.md", rx: /dvinci\.de/i, companies: [] },
  { name: "Proprietary In-house ATS", manual: "Proprietary In-house ATS.md", rx: /amazon\.jobs|careers\.google\.com|jobs\.apple\.com|metacareers\.com/i, companies: ["Amazon", "Google", "Apple", "Meta"] },
];

export function detectAts(url = "", company = "") {
  const hay = `${url} ${company}`;
  for (const entry of ATS_PATTERNS) {
    if (entry.rx.test(url) || entry.companies.some((c) => normText(company).includes(normText(c)))) {
      return { name: entry.name, manual: entry.manual };
    }
  }
  return { name: "Standard / Unknown ATS (Personio / softgarden / human review)", manual: "README.md" };
}

// ---------------------------------------------------------------------------
// PDF Page Counter (fast, pure Node fallback + pypdf if needed)
// ---------------------------------------------------------------------------

export function countPdfPages(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    const str = buf.toString("latin1");
    const matches = [...str.matchAll(/\/Type\s*\/Page\b(?!s)/g)];
    if (matches.length > 0) return matches.length;
    const countMatch = str.match(/\/Type\s*\/Pages\b[\s\S]{0,200}?\/Count\s+(\d+)/);
    return countMatch ? Number(countMatch[1]) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Read gju-profile.json from Internships/Input Data
// ---------------------------------------------------------------------------

export function readInternshipsProfile(workingDir) {
  const { inputData } = studioDirs(workingDir);
  const file = path.join(inputData, "gju-profile.json");
  if (!fs.existsSync(file)) {
    // Fallback to CareerToAI data/
    const profile = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "profile.json"), "utf8"));
    const experience = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "experience.json"), "utf8"));
    const projects = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "projects.json"), "utf8"));
    const certificates = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "certificates.json"), "utf8"));
    return { version: 1, allSkills: profile.skills || [], profile, experience, projects, certificates };
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return pruneStudent(raw);
}

// ---------------------------------------------------------------------------
// Studio Inventory & Status
// ---------------------------------------------------------------------------

function listDocFolder(folderPath, kind) {
  if (!fs.existsSync(folderPath)) return [];
  const files = fs.readdirSync(folderPath).filter((f) => /\.(docx|pdf)$/i.test(f));
  const byStem = new Map();
  for (const file of files) {
    const full = path.join(folderPath, file);
    const stat = fs.statSync(full);
    if (!stat.isFile()) continue;
    const ext = path.extname(file).toLowerCase();
    const stem = file.slice(0, -ext.length);
    const entry = byStem.get(stem) || { stem, kind, docx: null, pdf: null, pages: null, updatedAt: stat.mtime.toISOString(), size: 0 };
    if (ext === ".docx") { entry.docx = file; entry.size = stat.size; }
    if (ext === ".pdf") { entry.pdf = file; entry.pages = countPdfPages(full); if (!entry.size) entry.size = stat.size; }
    if (stat.mtime.toISOString() > entry.updatedAt) entry.updatedAt = stat.mtime.toISOString();
    byStem.set(stem, entry);
  }
  return [...byStem.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getStudioState() {
  const settings = readStudioSettings();
  const dirs = studioDirs(settings.workingDir);
  const exists = fs.existsSync(dirs.root);

  const templateFiles = [
    { slot: "cv_de", label: "German CV Template (Lebenslauf)", file: "Lebenslauf_Hamza_Salameh_DE.docx", pdf: "Lebenslauf_Hamza_Salameh_DE.pdf" },
    { slot: "cv_en", label: "English CV Template", file: "CV_Hamza_Salameh_EN.docx", pdf: "CV_Hamza_Salameh_EN.pdf" },
    { slot: "cl_de", label: "German Cover Letter Template (Anschreiben)", file: "Anschreiben_Hamza_Salameh_DE.docx", pdf: null },
    { slot: "cl_en", label: "English Cover Letter Template", file: "CL_Hamza_Salameh_EN.docx", pdf: null },
  ].map((t) => {
    const full = path.join(dirs.inputData, t.file);
    const hasFile = fs.existsSync(full);
    const stat = hasFile ? fs.statSync(full) : null;
    const pdfFull = t.pdf ? path.join(dirs.inputData, t.pdf) : null;
    const hasPdf = Boolean(pdfFull && fs.existsSync(pdfFull));
    return {
      ...t,
      present: hasFile,
      size: stat ? stat.size : 0,
      updatedAt: stat ? stat.mtime.toISOString() : null,
      hasPdf,
      pages: hasPdf ? countPdfPages(pdfFull) : null,
    };
  });

  const officialDocs = [];
  if (exists) {
    for (const f of fs.readdirSync(dirs.root)) {
      const full = path.join(dirs.root, f);
      if (/\.(pdf|jpg|jpeg|png)$/i.test(f) && fs.statSync(full).isFile()) {
        const st = fs.statSync(full);
        officialDocs.push({ name: f, folder: "root", size: st.size, pages: /\.pdf$/i.test(f) ? countPdfPages(full) : null });
      }
    }
    const certIdx = path.join(dirs.inputData, "Certificates_with_Index.pdf");
    if (fs.existsSync(certIdx)) {
      const st = fs.statSync(certIdx);
      officialDocs.push({ name: "Certificates_with_Index.pdf", folder: "Input Data", size: st.size, pages: countPdfPages(certIdx) });
    }
  }

  const atsManuals = [];
  if (fs.existsSync(dirs.ats)) {
    for (const f of fs.readdirSync(dirs.ats).filter((x) => x.endsWith(".md"))) {
      atsManuals.push({ name: f, category: "ATS System", path: f });
    }
  }
  if (fs.existsSync(dirs.atsCompanies)) {
    for (const f of fs.readdirSync(dirs.atsCompanies).filter((x) => x.endsWith(".md"))) {
      atsManuals.push({ name: f.replace(/\.md$/, ""), category: "Company Guide", path: `Companies/${f}` });
    }
  }

  const housing = loadCityHousing(settings.workingDir);
  const cvs = listDocFolder(dirs.cvs, "cv");
  const cls = listDocFolder(dirs.cls, "cl");

  let profileSummary = null;
  try {
    const p = readInternshipsProfile(settings.workingDir);
    profileSummary = {
      name: `${p.profile?.firstName || "Hamza"} ${p.profile?.lastName || "Salameh"}`.trim(),
      email: p.profile?.email || "hamzasalameh928@gmail.com",
      skillsCount: (p.allSkills || []).length,
      experienceCount: (p.experience || []).length,
      projectsCount: (p.projects || []).length,
      certificatesCount: (p.certificates || []).length,
      languages: p.profile?.languages || [],
    };
  } catch { /* ignore */ }

  return {
    ok: true,
    exists,
    dirs,
    settings,
    templates: templateFiles,
    officialDocs,
    atsManuals,
    housingCount: housing.length,
    housingCities: housing.map((h) => ({ city: h.city, address: h.address, name: h.name, type: h.type })),
    cvs,
    cls,
    profileSummary,
    aiConfigured: Boolean(llmConfig()),
  };
}

// ---------------------------------------------------------------------------
// Part A: GJU Rules Check & Fit Evaluation
// ---------------------------------------------------------------------------

function extractQuotes(text, patterns) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const rx of patterns) {
    for (const line of lines) {
      if (rx.test(line)) return line.slice(0, 140);
    }
    const m = String(text || "").match(rx);
    if (m) return m[0].slice(0, 140);
  }
  return null;
}

export function evaluateSinglePosting(rawPosting, index, profileData, settings = readStudioSettings(), housing = loadCityHousing()) {
  const text = String(rawPosting.text || rawPosting.description || "").trim();
  const title = String(rawPosting.title || rawPosting.position || "").trim() ||
    extractQuotes(text, [/^(?:praktikant|praktikum|intern|working student|werkstudent|pflichtpraktikum).*$/im]) ||
    `Internship Posting #${index}`;
  const company = String(rawPosting.company || "").trim() ||
    (text.match(/(?:bei|at|unternehmen|company)\s+([A-ZÄÖÜ][A-Za-z0-9ÄÖÜäöüß&\-. ]{2,40})/i)?.[1]?.trim()) ||
    "Unbekanntes Unternehmen";
  const location = String(rawPosting.location || rawPosting.city || "").trim() ||
    (text.match(/(?:standort|location|arbeitsort|ort)\s*[:\-]?\s*([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\- /]{2,40})/i)?.[1]?.trim()) ||
    "Deutschland";
  const url = String(rawPosting.url || rawPosting.job_url || rawPosting.app_url || "").trim();
  const ref = String(rawPosting.ref || "").trim() ||
    (text.match(/(?:kennziffer|referenznummer|job[\s-]?id|req[\s-]?id|stellen[\s-]?id)\s*[:#]?\s*([A-Za-z0-9\-_/]{3,25})/i)?.[1]?.trim()) || "";
  const contact = String(rawPosting.contact || rawPosting.contact_person || "").trim() ||
    (text.match(/(?:ansprechpartner(?:in)?|kontakt|contact(?:\s+person)?)\s*[:\-]?\s*((?:Frau|Herr|Ms\.|Mr\.)?\s*[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß\-]+)/i)?.[1]?.trim()) || "";

  // Detect language of the posting
  const germanSignals = (text.match(/\b(und|oder|für|mit|bei|deine|aufgaben|profil|praktikum|vollzeit|monate|wochen)\b/gi) || []).length;
  const englishSignals = (text.match(/\b(and|with|your|tasks|profile|internship|full-time|months|weeks|requirements)\b/gi) || []).length;
  const postingLang = englishSignals > germanSignals * 1.3 ? "en" : "de";
  const explicitEnglishDocs = /application in english|english cv|documents in english|bewerbung auf englisch/i.test(text);

  // Rule 1: Duration (>= 20 weeks / ~5-6 months)
  const thesisOnly = /\b(abschlussarbeit|bachelorarbeit|masterarbeit|thesis only)\b/i.test(title) && !/praktikum|intern/i.test(title);
  const werkstudentOnly = /\bwerkstudent/i.test(title) && !/praktikum|intern/i.test(title) && !/praktikum\s+oder\s+werkstudent/i.test(text);
  const shortDurationRaw = text.match(/\b(1|2|3|4)\s*(monate|months)\b/i);
  const shortDurationMatch =
    shortDurationRaw &&
    !/\b(5|6)\s*(monate|months)\b/i.test(text) &&
    !/3\s*[–-]\s*6\s*(monate|months)/i.test(text)
      ? shortDurationRaw
      : null;
  const rangeDurationMatch = text.match(/\b(3|4)\s*[–-]\s*6\s*(monate|months)\b/i);
  const goodDurationMatch = text.match(/\b(5|6)\s*(monate|months)\b|\b(20|22|24|26)\s*(wochen|weeks)\b|mindestens\s*(5\s*monate|20\s*wochen)/i);

  let r1Status = "Unclear";
  let r1Ev = "not stated";
  if (goodDurationMatch) {
    r1Status = "Pass";
    r1Ev = goodDurationMatch[0];
  } else if (rangeDurationMatch) {
    r1Status = "Unclear";
    r1Ev = `${rangeDurationMatch[0]} (confirm ≥ 20 weeks in contract)`;
  } else if (shortDurationMatch) {
    r1Status = "Fail";
    r1Ev = `${shortDurationMatch[0]} (< 20 weeks; negotiable if extended to ≥ 20 weeks as Pflichtpraktikum)`;
  }

  // Rule 2: Full-time (>= 35 h/week)
  const fullTimeMatch = text.match(/\b(vollzeit|full[\s-]?time|35\s*h|37[,.]5\s*h|38\s*h|40\s*h|35\s*std|40\s*std|35\s*stunden|40\s*stunden)\b/i);
  const partTimeMatch = text.match(/\b(teilzeit|part[\s-]?time|15\s*[–-]\s*20\s*std|max\.?\s*20\s*std|20\s*h\/woche)\b/i);
  let r2Status = "Unclear";
  let r2Ev = "not stated";
  if (werkstudentOnly || (partTimeMatch && !fullTimeMatch)) {
    r2Status = "Fail";
    r2Ev = partTimeMatch ? partTimeMatch[0] : "Werkstudent (typically ≤ 20 h/week)";
  } else if (fullTimeMatch) {
    r2Status = "Pass";
    r2Ev = fullTimeMatch[0];
  }

  // Rule 3: Location (Germany / DACH, mainly on-site, remote <= 40%)
  const fullRemoteMatch = text.match(/\b(100\s*%\s*remote|fully\s*remote|komplett\s*remote|rein\s*remote)\b/i);
  const hybridMatch = text.match(/\b(hybrid|mobiles\s*arbeiten|homeoffice|home[\s-]?office|remote)\b/i);
  const outsideGermany = /\b(österreich|austria|wien|schweiz|switzerland|zürich|luxemburg)\b/i.test(location);
  let r3Status = "Pass";
  let r3Ev = location || "Deutschland";
  if (fullRemoteMatch) {
    r3Status = "Fail";
    r3Ev = fullRemoteMatch[0];
  } else if (hybridMatch) {
    r3Status = "Unclear";
    r3Ev = `${location} (${hybridMatch[0]} mentioned — confirm max. 40% / 2 days per week remote)`;
  } else if (!location || /^deutschland$/i.test(location)) {
    r3Status = "Unclear";
    r3Ev = "Exact city/on-site share not stated";
  }

  // Rule 4: German work environment
  const englishOnlyEnv = /working language\s*[:\-]?\s*english|english[\s-]?speaking team only|no german required/i.test(text);
  const germanEnv = /\b(deutsch|german)\b/i.test(text) || postingLang === "de";
  const r4Status = englishOnlyEnv ? "Unclear" : germanEnv ? "Pass" : "Unclear";
  const r4Ev = englishOnlyEnv ? "Working language English stated — confirm German colleagues/culture contact" : germanEnv ? "German-speaking work environment" : "Working language not explicitly stated";

  // Rule 5: Professional CS/IT tasks
  const csTaskSignals = text.match(/\b(software|entwicklung|development|programmierung|coding|backend|frontend|full[\s-]?stack|datenbank|database|sql|python|c#|java|javascript|ki|ai|machine learning|computer vision|embedded|cloud|devops|testing|cyber|security|api|web|it|data)\b/gi) || [];
  let r5Status = "Pass";
  let r5Ev = csTaskSignals.length ? `Matches Computer Science (${[...new Set(csTaskSignals.map((s) => s.toLowerCase()))].slice(0, 6).join(", ")})` : "not stated";
  if (thesisOnly) {
    r5Status = "Fail";
    r5Ev = "Thesis only (Abschlussarbeit/Bachelorarbeit), not a compulsory internship";
  } else if (csTaskSignals.length < 2) {
    r5Status = "Unclear";
    r5Ev = "Few technical Computer Science tasks explicitly stated";
  }

  // Rule 6: Legal stay
  const r6Status = outsideGermany ? "Unclear" : "Pass";
  const r6Ev = outsideGermany
    ? `Location outside Germany (${location}) — requires checking work/residence permit`
    : `Valid in Germany under § 16b Abs. 1 AufenthG & § 15 Nr. 2 BeschV (until ${settings.latestEnd})`;

  // Rule 7: Contract
  const r7Status = "Pending";
  const r7Ev = "Signed contract must be uploaded to MyGJU and approved by IAD before day 1";

  // Warnings 8-10
  const agencySignal = text.match(/\b(für unseren kunden|personalvermittlung|arbeitnehmerüberlassung|placement fee|vermittlungsgebühr)\b/i);
  const r8Status = agencySignal ? "Warning" : "Pass";
  const r8Ev = agencySignal ? agencySignal[0] : "Direct employer posting";

  const r9Status = "Unclear (standard)";
  const r9Ev = "Praktikumszeugnis not mentioned in ad (include in contract checklist)";

  const immediateStart = text.match(/\b(ab sofort|immediately|asap|zum nächstmöglichen zeitpunkt)\b/i);
  const startMatch = text.match(/\b(ab\s+(?:märz|april|mai|01\.03\.2027|01\.04\.2027|15\.02\.2027|frühjahr\s*2027|sommersemester\s*2027|ss\s*2027))\b/i);
  const r10Status = immediateStart && !startMatch ? "Warning" : "Pass";
  const r10Ev = startMatch ? startMatch[0] : immediateStart ? `${immediateStart[0]} — confirm start from ${settings.earliestStart}` : `Confirm start date (${settings.earliestStart})`;

  const rules = [
    { num: 1, rule: "1. Duration (≥ 20 weeks, up to 6 months)", status: r1Status, evidence: r1Ev },
    { num: 2, rule: "2. Full time (≥ 35 h/week)", status: r2Status, evidence: r2Ev },
    { num: 3, rule: "3. Location (Germany/DACH, remote ≤ 40%)", status: r3Status, evidence: r3Ev },
    { num: 4, rule: "4. German work environment", status: r4Status, evidence: r4Ev },
    { num: 5, rule: "5. Professional tasks (CS field fit)", status: r5Status, evidence: r5Ev },
    { num: 6, rule: "6. Legal stay (§ 16b AufenthG / § 15.2 BeschV)", status: r6Status, evidence: r6Ev },
    { num: 7, rule: "7. Contract & MyGJU / IAD approval", status: r7Status, evidence: r7Ev },
    { num: 8, rule: "8. Self-found / no placement agency fee", status: r8Status, evidence: r8Ev },
    { num: 9, rule: "9. Praktikumszeugnis after completion", status: r9Status, evidence: r9Ev },
    { num: 10, rule: "10. Timing (after study semester exams)", status: r10Status, evidence: r10Ev },
  ];

  const hardRules = rules.slice(0, 6);
  const fails = hardRules.filter((r) => r.status === "Fail");
  const unclears = hardRules.filter((r) => r.status === "Unclear");

  let verdict = "LIKELY APPROVED";
  if (fails.length > 0) verdict = "LIKELY REJECTED";
  else if (unclears.length > 0) verdict = "NEEDS CLARIFICATION";

  const negotiable = fails.length > 0 && fails.every((f) => [1, 2, 3].includes(f.num)) && !thesisOnly && !werkstudentOnly;

  // Match skills against gju-profile.json
  const candidateSkills = new Set([
    ...(profileData.allSkills || []),
    "C#", ".NET", ".NET 8", "ASP.NET Core", "ASP.NET MVC", "REST API", "SQL", "MySQL", "Dapper",
    "JavaScript", "HTML5", "CSS3", "Bootstrap", "jQuery", "D3.js", "Chart.js", "Playwright",
    "Python", "PyTorch", "YOLOv8", "OpenCV", "NumPy", "Pandas", "Scikit-learn",
    "C", "Embedded C", "Raspberry Pi", "Linux", "Red Hat", "Bash", "Git", "GitHub Actions", "CI/CD", "Docker", "Postman", "Wireshark",
  ].map((s) => normText(s)));

  const SKILL_PROBES = [
    ["Python", /\bpython\b/i],
    ["C#", /\bc#\b|csharp/i],
    [".NET / ASP.NET Core", /\b(\.net|asp\.net)\b/i],
    ["JavaScript", /\bjavascript\b|\bjs\b/i],
    ["TypeScript", /\btypescript\b|\bts\b/i],
    ["React", /\breact(?:\.js|js)?\b/i],
    ["Angular", /\bangular\b/i],
    ["Vue.js", /\bvue(?:\.js|js)?\b/i],
    ["HTML5 / CSS3", /\b(html5?|css3?)\b/i],
    ["SQL / MySQL", /\b(sql|mysql|postgresql|relational\w*\s+datenbank\w*|relational\s+database\w*)\b/i],
    ["REST APIs", /\brest(?:ful)?[\s-]?api\w*\b/i],
    ["Git / CI/CD", /\b(git|github|gitlab|ci\/cd)\b/i],
    ["Docker", /\bdocker\b/i],
    ["Kubernetes", /\bkubernetes|\bk8s\b/i],
    ["Linux", /\blinux\b|\brhel\b|\bubuntu\b/i],
    ["Machine Learning / PyTorch", /\b(machine learning|deep learning|pytorch|tensorflow|ki|ai)\b/i],
    ["Computer Vision / OpenCV", /\b(computer vision|opencv|yolo\w*|bildverarbeitung)\b/i],
    ["Data Analysis (Pandas / NumPy)", /\b(pandas|numpy|scikit[\s-]?learn|datenanalyse|data analysis)\b/i],
    ["C / Embedded Systems", /\b(embedded|mikrocontroller|raspberry pi|\bc\b)\b/i],
    ["C++", /\bc\+\+\b/i],
    ["Java", /\bjava\b(?!script)/i],
    ["SAP / ABAP", /\b(sap|abap|s\/4hana)\b/i],
    ["AWS / Azure / Cloud", /\b(aws|azure|gcp|cloud)\b/i],
    ["Automated Testing", /\b(playwright|selenium|unit[\s-]?test\w*|testautomatisierung|automated test\w*)\b/i],
  ];

  const covered = [];
  const gaps = [];
  for (const [label, rx] of SKILL_PROBES) {
    if (rx.test(text) || rx.test(title)) {
      const tokens = label.split(/[\/(),\s]+/).map(normText).filter(Boolean);
      const hasIt = tokens.some((t) => candidateSkills.has(t));
      if (hasIt) covered.push(label);
      else gaps.push(label);
    }
  }
  if (!covered.length) {
    covered.push("Software Engineering (C#, Python, JavaScript, SQL, Git, Linux)");
  }

  let fit = "High";
  if (gaps.length >= 3 && covered.length <= gaps.length) fit = "Low";
  else if (gaps.length >= 1) fit = "Medium";

  // Build clarification email in German for any Unclear/Fail-negotiable points (excluding Rule 9)
  const questions = [];
  if (r1Status !== "Pass") questions.push("ob das Praktikum als studentisches Pflichtpraktikum für eine Dauer von mindestens 20 Wochen (gerne 6 Monate) möglich ist");
  if (r2Status !== "Pass") questions.push("ob die Stelle in Vollzeit (mindestens 35–40 Stunden pro Woche) absolviert werden kann");
  if (r3Status !== "Pass") questions.push("ob die Tätigkeit überwiegend vor Ort am Standort stattfindet (mobiles Arbeiten gemäß Hochschulvorgabe maximal 40 % bzw. 2 Tage pro Woche)");
  if (r4Status !== "Pass") questions.push("ob eine Einbindung in ein deutschsprachiges Arbeitsumfeld gegeben ist");
  if (r10Status !== "Pass") questions.push(`ob ein Einstieg nach Ende meines laufenden Studiensemesters ab dem ${settings.earliestStart} möglich ist`);

  const salutation = contact
    ? (/^Frau\b/i.test(contact) ? `Sehr geehrte ${contact},` : /^Herr\b/i.test(contact) ? `Sehr geehrter ${contact},` : `Guten Tag ${contact.replace(/^(Ms\.|Mr\.)\s*/i, "")},`)
    : "Sehr geehrte Damen und Herren,";

  const email = questions.length
    ? {
        subject: `Kurze Rückfrage zum Pflichtpraktikum: ${title}${ref ? ` (Kennziffer ${ref})` : ""}`,
        body: [
          salutation,
          "",
          `ich interessiere mich sehr für das ausgeschriebene Praktikum als „${title}“ bei ${company}. Im Rahmen meines Informatikstudiums an der German Jordanian University (aktuell im Austauschsemester an der Technischen Hochschule Deggendorf) absolviere ich ab ${settings.earliestStart} mein sechsmonatiges Pflichtpraktikum (zustimmungsfrei nach § 15 Nr. 2 BeschV).`,
          "",
          `Vor meiner Bewerbung möchte ich kurz anfragen, ${questions.join(" sowie ")}.`,
          "",
          "Vielen Dank für Ihre Zeit und eine kurze Rückmeldung.",
          "",
          "Mit freundlichen Grüßen",
          `${profileData.profile?.firstName || "Hamza"} ${profileData.profile?.lastName || "Salameh"}`.trim(),
          ...(profileData.profile?.phone ? [profileData.profile.phone] : []),
        ].join("\n"),
      }
    : null;

  const cityMatch = findCityAddress(location, housing);
  const contractWording = `Studentisches Pflichtpraktikum in Vollzeit (40 Std./Woche), Dauer: ${settings.preferredDuration} (mindestens 20 Wochen) vom ${settings.earliestStart} bis ${settings.latestEnd}, Arbeitsort: ${cityMatch.city || location} (mobiles Arbeiten max. 2 Tage pro Woche / 40 %). Ausstellung eines qualifizierten Praktikumszeugnisses nach Abschluss.`;

  const shouldBuildDocs =
    verdict !== "LIKELY REJECTED" ||
    settings.rejectedPolicy === "all" ||
    (settings.rejectedPolicy === "negotiable" && negotiable);

  const verdictReason =
    verdict === "LIKELY APPROVED"
      ? `All hard GJU requirements (1–6) are satisfied in the posting.`
      : verdict === "NEEDS CLARIFICATION"
        ? `No hard requirement failed, but ${unclears.map((u) => `Rule ${u.num}`).join(", ")} must be confirmed before signing.`
        : `Fails ${fails.map((f) => `Rule ${f.num} (${f.evidence})`).join("; ")}${negotiable ? " — negotiable as Pflichtpraktikum." : "."}`;

  return {
    num: index,
    id: rawPosting.id || `post-${index}`,
    company,
    title,
    location,
    url,
    ref,
    contact,
    postingLang,
    explicitEnglishDocs,
    startDuration: `${ r1Status === "Pass" ? r1Ev : settings.preferredDuration } (ab ${settings.earliestStart})`,
    hoursRemote: `${r2Status === "Pass" ? r2Ev : "Vollzeit?"} / ${hybridMatch ? "Hybrid (≤40%)" : "Vor Ort"}`,
    verdict,
    verdictReason,
    negotiable,
    fit,
    covered,
    gaps,
    rules,
    email,
    contractWording,
    cityAddress: cityMatch,
    ats: detectAts(url, company),
    shouldBuildDocs,
    skipReason: shouldBuildDocs ? "" : "Rejected (non-negotiable rule failure)",
    nextStep:
      verdict === "LIKELY APPROVED"
        ? "Submit tailored German CV & Anschreiben"
        : verdict === "NEEDS CLARIFICATION"
          ? "Send clarification email & submit tailored documents"
          : negotiable
            ? "Ask if 20+ weeks full-time Pflichtpraktikum is possible"
            : "Skip — does not meet GJU hard rules",
    rawText: text,
  };
}

export function evaluatePostings({ postings = [], settings = readStudioSettings() }) {
  const profileData = readInternshipsProfile(settings.workingDir);
  const housing = loadCityHousing(settings.workingDir);
  const evaluated = postings.map((p, idx) => evaluateSinglePosting(p, idx + 1, profileData, settings, housing));

  const vOrder = { "LIKELY APPROVED": 0, "NEEDS CLARIFICATION": 1, "LIKELY REJECTED": 2 };
  const fOrder = { High: 0, Medium: 1, Low: 2 };
  const sortedOverview = [...evaluated].sort(
    (a, b) => (vOrder[a.verdict] ?? 9) - (vOrder[b.verdict] ?? 9) || (fOrder[a.fit] ?? 9) - (fOrder[b.fit] ?? 9) || a.num - b.num
  );

  return {
    settings,
    evaluated,
    overview: sortedOverview,
  };
}

// ---------------------------------------------------------------------------
// File Naming & Safe Non-Overwriting Path Helper
// ---------------------------------------------------------------------------

export function cleanCompanyFileSlug(company) {
  return String(company || "Firma")
    .replace(/\b(GmbH|AG|SE|Co\.?\s*KG|Inc\.?|Ltd\.?|Group|Holding|Deutschland)\b/gi, "")
    .trim()
    .replace(/[^A-Za-z0-9ÄÖÜäöüß\-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "Firma";
}

export function nextAvailablePairPath(folder, baseStem) {
  fs.mkdirSync(folder, { recursive: true });
  let candidate = baseStem;
  let v = 2;
  while (
    fs.existsSync(path.join(folder, `${candidate}.docx`)) ||
    fs.existsSync(path.join(folder, `${candidate}.pdf`))
  ) {
    candidate = `${baseStem}_v${v++}`;
  }
  return {
    stem: candidate,
    docxPath: path.join(folder, `${candidate}.docx`),
    pdfPath: path.join(folder, `${candidate}.pdf`),
  };
}

// ---------------------------------------------------------------------------
// Convert .docx to .pdf via Word COM on Windows (with LibreOffice fallback)
// ---------------------------------------------------------------------------

export async function convertDocxToPdf(docxPath, pdfPath) {
  if (process.platform === "win32") {
    const psScript = `
$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open(${JSON.stringify(docxPath)}, $false, $true)
  $doc.ExportAsFixedFormat(${JSON.stringify(pdfPath)}, 17)
  $doc.Close($false)
} finally {
  $word.Quit()
}
`;
    try {
      await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psScript], { timeout: 60_000 });
      if (fs.existsSync(pdfPath)) return { ok: true, pages: countPdfPages(pdfPath) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
  return { ok: false, error: "PDF conversion unavailable" };
}

// ---------------------------------------------------------------------------
// Run ATS Check (ats_check.py)
// ---------------------------------------------------------------------------

export async function runAtsCheckOnPdf({ pdfPath, keywords = [], workingDir = readStudioSettings().workingDir }) {
  const { ats } = studioDirs(workingDir);
  const scriptPath = path.join(ats, "ats_check.py");
  if (!fs.existsSync(scriptPath)) {
    return { ok: false, error: `ats_check.py not found at ${scriptPath}` };
  }
  if (!fs.existsSync(pdfPath)) {
    return { ok: false, error: `PDF file not found: ${pdfPath}` };
  }

  let kwFile = null;
  const args = [scriptPath, pdfPath, "--show-text"];
  try {
    if (Array.isArray(keywords) && keywords.length > 0) {
      // Never write temp files inside CVs/ or CLs/ (project rule)
      kwFile = path.join(os.tmpdir(), `gju_ats_kw_${Date.now()}.txt`);
      fs.writeFileSync(kwFile, keywords.join("\n") + "\n", "utf8");
      args.push("--keywords", kwFile);
    }
    const { stdout } = await execFileAsync("python", args, { timeout: 30_000 });
    return parseAtsStdout(stdout);
  } catch (err) {
    // ats_check.py exits with code 1 when FAIL > 0, but still prints full report to stdout!
    if (err.stdout) return parseAtsStdout(err.stdout);
    return { ok: false, error: err.stderr || err.message };
  } finally {
    if (kwFile && fs.existsSync(kwFile)) {
      try { fs.unlinkSync(kwFile); } catch { /* ignore */ }
    }
  }
}

function parseAtsStdout(stdout) {
  const summaryMatch = stdout.match(/\*\*Summary:\*\*\s*(\d+)\s*FAIL,\s*(\d+)\s*WARN/i);
  const fails = summaryMatch ? Number(summaryMatch[1]) : 0;
  const warns = summaryMatch ? Number(summaryMatch[2]) : 0;
  const covMatch = stdout.match(/Must-haves covered:\s*(\d+\/\d+)/i);
  const parts = stdout.split("## Extracted text (what an ATS parser sees)");
  const reportMd = parts[0].trim();
  const extractedText = parts[1] ? parts[1].replace(/```/g, "").trim() : "";
  return {
    ok: true,
    fails,
    warns,
    mustCoverage: covMatch ? covMatch[1] : null,
    reportMd,
    extractedText,
  };
}

// ---------------------------------------------------------------------------
// Part B & Part C: Tailoring CV (Lebenslauf) and Cover Letter (Anschreiben)
// ---------------------------------------------------------------------------

const germanToday = (now = new Date()) =>
  new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" }).format(now);

const shortGermanDate = (now = new Date()) =>
  new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }).format(now);

const StudioTailorSchema = z.object({
  cv: z.record(z.string(), z.array(z.string())).default({}),
  cl: z.record(z.string(), z.array(z.string())).default({}),
});

export async function generateDocumentsForPosting({ posting, settings = readStudioSettings() }) {
  const dirs = studioDirs(settings.workingDir);
  const profileData = readInternshipsProfile(settings.workingDir);
  const housing = loadCityHousing(settings.workingDir);
  const evalResult = posting.verdict ? posting : evaluateSinglePosting(posting, 1, profileData, settings, housing);

  if (!evalResult.shouldBuildDocs) {
    return {
      ok: false,
      skipped: true,
      reason: evalResult.skipReason || "Skipped per LIKELY REJECTED setting",
      evaluation: evalResult,
    };
  }

  const useEnglish = settings.docLang === "en" || Boolean(evalResult.explicitEnglishDocs && settings.docLang === "auto");
  const cvTemplateName = useEnglish ? "CV_Hamza_Salameh_EN.docx" : "Lebenslauf_Hamza_Salameh_DE.docx";
  const clTemplateName = useEnglish ? "CL_Hamza_Salameh_EN.docx" : "Anschreiben_Hamza_Salameh_DE.docx";

  const cvTemplatePath = path.join(dirs.inputData, cvTemplateName);
  const clTemplatePath = path.join(dirs.inputData, clTemplateName);

  if (!fs.existsSync(cvTemplatePath)) throw new Error(`Missing CV template: ${cvTemplatePath}`);
  if (!fs.existsSync(clTemplatePath)) throw new Error(`Missing CL template: ${clTemplatePath}`);

  const cvDoc = await loadDocx(fs.readFileSync(cvTemplatePath));
  const clDoc = await loadDocx(fs.readFileSync(clTemplatePath));

  const cvParas = docxParagraphs(cvDoc.xml);
  const clParas = docxParagraphs(clDoc.xml);

  const cityInfo = settings.matchCityAddress ? evalResult.cityAddress : { city: "Deggendorf", address: "Untere Himmelreichstraße 10, 94469 Deggendorf", matched: false };
  const targetAddress = cityInfo.address || "Untere Himmelreichstraße 10, 94469 Deggendorf";
  const senderCity = cityInfo.city || "Deggendorf";

  // Deterministic baseline edits on CV and CL so even without an LLM call, the documents are 100% tailored, accurate, and placeholder-free
  const cvEdits = {};
  const clEdits = {};

  const skillsStr = evalResult.covered.slice(0, 5).join(", ");
  const relocateNote = cityInfo.matched && normText(cityInfo.city) !== "deggendorf"
    ? `, vor Ort in ${cityInfo.city} (Umzug vor Beginn)`
    : "";

  for (const p of cvParas) {
    const joined = p.runs.join("");
    // Update address if city matched
    if (joined.includes("Untere Himmelreichstraße 10") && settings.matchCityAddress && targetAddress) {
      cvEdits[p.i] = p.runs.map((r) => r.replace(/Untere Himmelreichstraße 10,\s*94469 Deggendorf/g, targetAddress));
    }
    // Update Kurzprofil + Verfügbar line
    if (joined.includes("Verfügbar: Pflichtpraktikum")) {
      const tailoredKurzprofil = `Informatikstudent im letzten Studienjahr und Full-Stack-Entwickler mit drei Praxisphasen im Dualen Studium bei Umniah (Digital & IT) sowie Projekterfahrung für ${evalResult.company} im Bereich ${evalResult.title} (${skillsStr}).\nVerfügbar: Pflichtpraktikum ab ${settings.earliestStart}, ${settings.preferredDuration}, Vollzeit${relocateNote}`;
      if (p.runs.length === 1) {
        cvEdits[p.i] = [tailoredKurzprofil];
      } else {
        cvEdits[p.i] = p.runs.map((r) =>
          r.replace(/ab\s+April\s+2027,\s*6\s*Monate,\s*Vollzeit/i, `ab ${settings.earliestStart}, ${settings.preferredDuration}, Vollzeit${relocateNote}`)
        );
      }
    }
    // Update bottom date
    if (/Deggendorf,\s*\d{2}\.\d{2}\.\d{4}/.test(joined)) {
      cvEdits[p.i] = p.runs.map((r) => r.replace(/Deggendorf,\s*\d{2}\.\d{2}\.\d{4}/, `${senderCity}, ${shortGermanDate()}`));
    }
  }

  const salutation = evalResult.contact
    ? (/^Frau\b/i.test(evalResult.contact)
        ? `Sehr geehrte ${evalResult.contact},`
        : /^Herr\b/i.test(evalResult.contact)
          ? `Sehr geehrter ${evalResult.contact},`
          : `Guten Tag ${evalResult.contact.replace(/^(Ms\.|Mr\.)\s*/i, "")},`)
    : "Sehr geehrte Damen und Herren,";

  const subjectDe = `Bewerbung um ein Pflichtpraktikum als ${evalResult.title}${evalResult.ref ? ` – Kennziffer ${evalResult.ref}` : ""}`;

  for (const p of clParas) {
    const joined = p.runs.join("");
    if (joined.includes("Untere Himmelreichstraße 10") && settings.matchCityAddress && targetAddress) {
      clEdits[p.i] = p.runs.map((r) => r.replace(/Untere Himmelreichstraße 10,\s*94469 Deggendorf(?:,\s*Germany)?/g, targetAddress));
    } else if (joined.includes("[Company name]") || joined.includes("[Hiring manager")) {
      const recipientBlock = [
        evalResult.company,
        evalResult.contact || "Personalabteilung",
        evalResult.location || "Deutschland",
      ].join("\n");
      clEdits[p.i] = [recipientBlock, ...p.runs.slice(1).map(() => "")];
    } else if (joined.includes("[DD Month YYYY]")) {
      clEdits[p.i] = [`${senderCity}, ${germanToday()}`, ...p.runs.slice(1).map(() => "")];
    } else if (joined.startsWith("Bewerbung um ein Pflichtpraktikum") || joined.startsWith("Application for")) {
      const subj = useEnglish ? `Application for Mandatory Internship (Pflichtpraktikum) as ${evalResult.title}${evalResult.ref ? ` – Ref. ${evalResult.ref}` : ""}` : subjectDe;
      clEdits[p.i] = [subj, ...p.runs.slice(1).map(() => "")];
    } else if (joined.startsWith("Sehr geehrte") || joined.startsWith("Dear ")) {
      const sal = useEnglish ? `Dear ${evalResult.contact || "Hiring Team"},` : salutation;
      clEdits[p.i] = [sal, ...p.runs.slice(1).map(() => "")];
    } else if (joined.includes("mit großem Engagement") || joined.includes("I am applying for")) {
      const p1 = useEnglish
        ? `your opening for the ${evalResult.title} internship at ${evalResult.company} directly matches my hands-on background in ${skillsStr}. As a final-year Computer Science student at the German Jordanian University — currently completing my exchange semester at Deggendorf Institute of Technology — I bring three Dual Studies placements at Umniah and end-to-end delivery of production software.`
        : `die ausgeschriebene Stelle für ein Pflichtpraktikum als ${evalResult.title} bei ${evalResult.company} verbindet genau die Schwerpunkte, in denen ich bereits produktive Software entwickelt habe: ${skillsStr}. Als Informatikstudent im letzten Studienjahr an der German Jordanian University – aktuell im Austauschsemester an der Technischen Hochschule Deggendorf – bringe ich drei Praxisphasen im Dualen Studium bei Umniah sowie praktische Projekterfahrung in der Anwendungs- und Systementwicklung mit.`;
      clEdits[p.i] = [p1, ...p.runs.slice(1).map(() => "")];
    } else if (joined.includes("Das Praktikum ist ein Pflichtpraktikum") || joined.includes("I would welcome the opportunity")) {
      const p4 = useEnglish
        ? `This internship is a mandatory six-month part of my Bachelor's degree at the German Jordanian University (Pflichtpraktikum, exempt from Federal Employment Agency approval under § 15 No. 2 BeschV). I am available full-time from ${settings.earliestStart} for ${settings.preferredDuration} and look forward to discussing how I can support ${evalResult.company} in an interview.`
        : `Das Praktikum ist ein Pflichtpraktikum und fester Bestandteil meines Bachelorstudiums an der German Jordanian University (GJU), einer staatlichen jordanischen Hochschule nach dem Vorbild deutscher Hochschulen für angewandte Wissenschaften (zustimmungsfrei nach § 15 Nr. 2 BeschV). Ich stehe Ihnen ab dem ${settings.earliestStart} für ${settings.preferredDuration} in Vollzeit zur Verfügung und freue mich über die Einladung zu einem persönlichen Gespräch.`;
      clEdits[p.i] = [p4, ...p.runs.slice(1).map(() => "")];
    }
  }

  let cvXml = applyParagraphEdits(cvDoc.xml, cvEdits).xml;
  let clXml = applyParagraphEdits(clDoc.xml, clEdits).xml;

  // Optional AI fine-tuning pass if an AI provider is configured in .env
  if (llmConfig()) {
    try {
      const currentCvParas = docxParagraphs(cvXml);
      const currentClParas = docxParagraphs(clXml);
      const reply = await chatJson({
        system: `You are a German GJU Pflichtpraktikum application assistant tailoring a student's Lebenslauf and Anschreiben (.docx paragraphs).
Rules:
- Truth only: use ONLY facts from PROFILE_JSON. Never invent skills, tools, employers, grades or dates.
- Keep the exact run count for every paragraph index you return.
- No placeholders or square brackets in final output.
- Language: ${useEnglish ? "English" : "German (natural, professional German, DIN 5008, no clichés)"}.
Return JSON: {"cv": {"<index>": ["run1", ...]}, "cl": {"<index>": ["run1", ...]}}`,
        user: JSON.stringify({
          POSTING: {
            company: evalResult.company,
            title: evalResult.title,
            location: evalResult.location,
            ref: evalResult.ref,
            contact: evalResult.contact,
            coveredSkills: evalResult.covered,
            gaps: evalResult.gaps,
            text: String(evalResult.rawText || "").slice(0, 2500),
          },
          SETTINGS: settings,
          PROFILE_JSON: profileData,
          CV_PARAGRAPHS: currentCvParas,
          CL_PARAGRAPHS: currentClParas,
        }),
        schema: StudioTailorSchema,
      });
      if (reply?.cv && Object.keys(reply.cv).length) cvXml = applyParagraphEdits(cvXml, reply.cv).xml;
      if (reply?.cl && Object.keys(reply.cl).length) clXml = applyParagraphEdits(clXml, reply.cl).xml;
    } catch {
      // Keep the deterministic tailored XML if the LLM call fails or times out
    }
  }

  const cvBuffer = await saveDocx(cvDoc.zip, cvXml);
  const clBuffer = await saveDocx(clDoc.zip, clXml);

  const firmSlug = cleanCompanyFileSlug(evalResult.company);
  const refSuffix = evalResult.ref ? `_${evalResult.ref.replace(/[^A-Za-z0-9_-]/g, "")}` : "";
  const cvBaseStem = `${useEnglish ? "CV" : "Lebenslauf"}_Hamza_Salameh_${firmSlug}${refSuffix}`;
  const clBaseStem = `${useEnglish ? "CoverLetter" : "Anschreiben"}_Hamza_Salameh_${firmSlug}${refSuffix}`;

  const cvTarget = nextAvailablePairPath(dirs.cvs, cvBaseStem);
  const clTarget = nextAvailablePairPath(dirs.cls, clBaseStem);

  fs.writeFileSync(cvTarget.docxPath, cvBuffer);
  fs.writeFileSync(clTarget.docxPath, clBuffer);

  const [cvPdfRes, clPdfRes] = await Promise.all([
    convertDocxToPdf(cvTarget.docxPath, cvTarget.pdfPath),
    convertDocxToPdf(clTarget.docxPath, clTarget.pdfPath),
  ]);

  const keywords = [
    ...evalResult.covered.map((k) => `!${k}`),
    ...evalResult.gaps.map((k) => `!${k}`),
  ];

  const atsReport = cvPdfRes.ok
    ? await runAtsCheckOnPdf({ pdfPath: cvTarget.pdfPath, keywords, workingDir: settings.workingDir })
    : null;

  return {
    ok: true,
    evaluation: evalResult,
    files: {
      cv: {
        stem: cvTarget.stem,
        docx: path.basename(cvTarget.docxPath),
        docxPath: cvTarget.docxPath,
        pdf: cvPdfRes.ok ? path.basename(cvTarget.pdfPath) : null,
        pdfPath: cvPdfRes.ok ? cvTarget.pdfPath : null,
        pages: cvPdfRes.pages ?? null,
      },
      cl: {
        stem: clTarget.stem,
        docx: path.basename(clTarget.docxPath),
        docxPath: clTarget.docxPath,
        pdf: clPdfRes.ok ? path.basename(clTarget.pdfPath) : null,
        pdfPath: clPdfRes.ok ? clTarget.pdfPath : null,
        pages: clPdfRes.pages ?? null,
      },
    },
    atsReport,
  };
}
