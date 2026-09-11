/**
 * Build the GJU internship search tracker as a .xlsx workbook.
 *
 *   node scripts/make-internship-tracker.mjs [profile.json] [-o out.xlsx]
 *
 * Two inputs, both required for the sheet to be worth anything:
 *
 *   1. The profile JSON — either the repository's data/*.json (the default) or
 *      a careertoai-data.json exported from /editor/. It supplies the skills
 *      the Fit score matches against, plus the facts you retype into every
 *      application.
 *   2. The GJU internship documents in src/assets/gy-internships/. Their rules
 *      are compiled into the RULES/CHECKLIST/SCORE constants below: the 20-week
 *      minimum, the approved countries, the 861 EUR/month visa threshold, the
 *      two-week follow-up, and the document checklists from Parts 1-3.
 *
 * The scoring is done by Excel formulas rather than by this script, because the
 * rows do not exist yet when the file is generated — you fill them in as you
 * search, and the Fit % recalculates as you type.
 */

import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

import {
  ROOT,
  PROFILE_JSON,
  buildProfile,
  formatDateRange,
  loadCertificates,
  loadExperience,
  normalizeCertificate,
  normalizeExperience,
  readJson,
} from "../lib/content.mjs";

import { COLUMNS, STATUSES, CSV_PATH, COMPUTED, readTracker } from "../lib/tracker.mjs";

// ---------------------------------------------------------------------------
// Rules read out of the GY Internships documents
// ---------------------------------------------------------------------------

const GJU = readJson(path.join(ROOT, "data", "gju-rules.json"));

/** The GJU rules, read from data/gju-rules.json so the site's eligibility
    checker and this workbook can never disagree about a threshold. */
const RULES = GJU.rules;

const COUNTRIES = GJU.countries;

/** Fit % weights. The {minWeeks} / {minMonthlySalary} placeholders in the
    stored text are filled from RULES, so each number is written once. */
const SCORE = GJU.score.map(([name, points, why]) => [
  name,
  points,
  why.replace(/\{(\w+)\}/g, (_, key) => RULES[key]),
]);

/**
 * Statuses and columns are not defined here — they come from
 * data/tracker-schema.json via lib/tracker.mjs, so the workbook, the CSV and
 * the /rank, /outcome and /html-report commands cannot disagree about them.
 */

const CHECKLIST = [
  // group, item, source
  ["Application PDF", "Cover letter (Anschreiben), first in the file", "Part 3"],
  ["Application PDF", "CV (Lebenslauf) - may be merged with the cover letter", "Part 3"],
  ["Application PDF", "All certificates scanned into ONE readable PDF", "Part 3"],
  ["Application PDF", "Architecture & Design only: portfolio as a separate PDF under 3 MB", "Part 3"],
  ["Application PDF", "File named 'Bewerbung Vorname Nachname'", "Part 3"],

  ["Certificates bundle", "Enrolment confirmation from your German university", "Part 3"],
  ["Certificates bundle", "Enrolment confirmation from GJU", "Part 3"],
  ["Certificates bundle", "Bestätigung Pflichtpraktikum from the International Office", "Part 3"],
  ["Certificates bundle", "Current GJU transcript", "Part 3"],
  ["Certificates bundle", "Tawjihi certificate or equivalent", "Part 3"],
  ["Certificates bundle", "Letters of reference from earlier internships or voluntary work", "Part 3"],
  ["Certificates bundle", "Letter of recommendation from a GJU professor (optional)", "Part 3"],
  ["Certificates bundle", "GJU-Praktikumsrichtlinien", "Part 3"],

  ["CV", "One or two pages, no more", "Part 1"],
  ["CV", "Headed 'Lebenslauf', headlines left-aligned", "Part 1"],
  ["CV", "Calibri, Arial, Tahoma or Verdana, never below 11 pt", "Part 1"],
  ["CV", "Every date as MM/YYYY, month by month, no gaps", "Part 1"],
  ["CV", "Contact details complete: name, address, phone, mobile, e-mail", "Part 1"],
  ["CV", "Persönliche Daten complete (birth date and place, nationality)", "Part 1"],
  ["CV", "Practical experience names the company, the city AND the tasks", "Part 1"],
  ["CV", "Languages and computer skills each with an honest level", "Part 1"],
  ["CV", "Application photo, top right", "Part 1"],
  ["CV", "City, current date and a scanned signature at the foot", "Part 1"],
  ["CV", "Checked by a German friend, the Career Center or the Project Office", "Part 1"],

  ["Cover letter", "One page; four to eight sentences of body text", "Part 2"],
  ["Cover letter", "Same page header and font as the CV, 11-12 pt, single spacing", "Part 2"],
  ["Cover letter", "Left-aligned, not justified; real paragraphs", "Part 2"],
  ["Cover letter", "No abbreviations; not every sentence starting with 'ich'", "Part 2"],
  ["Cover letter", "Addressed to a named person, not 'Sehr geehrte Damen und Herren'", "Part 2"],
  ["Cover letter", "Bold subject line: job title, reference number, source, date", "Part 2"],
  ["Cover letter", "Individual opening - no 'Hiermit bewerbe ich mich...'", "Part 2"],
  ["Cover letter", "Your skills tied to the advertisement's requirements, with reasons", "Part 2"],
  ["Cover letter", "Says why YOU are right for the position", "Part 2"],
  ["Cover letter", "Polite request for an interview, then 'Mit freundlichen Grüßen'", "Part 2"],
  ["Cover letter", "Current date and a scanned signature", "Part 2"],
  ["Cover letter", "Company name and contact person double-checked (copy-paste trap)", "Part 2"],

  ["The moment you are accepted", "Tell the Office for Industrial Links", "Part 3"],
  ["The moment you are accepted", "Tell the Project Office in Magdeburg", "Part 3"],
  ["The moment you are accepted", "Send company details + contract to your Exchange Coordinator", "German Year Manual 4.2"],
  ["The moment you are accepted", "Cancel your other interviews - by phone if you can", "Part 3"],
  ["The moment you are accepted", "Check the contract is not shorter than 20 weeks", "Part 3"],
  ["The moment you are accepted", "Stay enrolled at your host university for the second semester", "Part 3"],

  ["After the internship", "Signed and stamped Praktikumszeugnis from the company", "Required documents 2015/46"],
  ["After the internship", "Internship report, 15-20 pages, English + German summary", "Report instructions"],
  ["After the internship", "Report signed and stamped by the company", "Required documents 2015/46"],
  ["After the internship", "Original certificate + 3 hard copies to OIL", "Required documents 2015/46"],
  ["After the internship", "Both handed in within two months of the next semester", "Required documents 2015/46"],
];

const BOARDS = [
  ["General job boards", "indeed.de", "https://de.indeed.com/"],
  ["General job boards", "jobmensa.de", "https://www.jobmensa.de/"],
  ["General job boards", "monster.de", "https://www.monster.de"],
  ["General job boards", "stepstone.de", "https://www.stepstone.de"],
  ["General job boards", "jobboerse.arbeitsagentur.de", "https://www.jobboerse.arbeitsagentur.de"],
  ["General job boards", "stellenanzeigen.de", "https://www.stellenanzeigen.de"],
  ["General job boards", "academics.de", "https://www.academics.de"],
  ["General job boards", "kimeta.de", "https://www.kimeta.de/"],
  ["General job boards", "jobworld.de", "https://www.jobworld.de"],
  ["General job boards", "meinestadt.de", "https://www.meinestadt.de/"],

  ["Internship portals", "meinpraktikum.de", "https://www.meinpraktikum.de/"],
  ["Internship portals", "praktikumsstellen.de", "https://www.praktikumsstellen.de/"],
  ["Internship portals", "praktika.de", "https://www.praktika.de/"],
  ["Internship portals", "praktikum.info", "https://www.praktikum.info/"],
  ["Internship portals", "praktikum.de", "https://www.praktikum.de"],
  ["Internship portals", "connecticum.de", "https://www.connecticum.de/praktikum"],
  ["Internship portals", "jobware.de", "https://www.jobware.de"],
  ["Internship portals", "unicum.de", "https://www.unicum.de"],
  ["Internship portals", "bonding.de", "https://www.bonding.de"],
  ["Internship portals", "absolventa.de", "https://www.absolventa.de/"],

  ["Rooms and flats", "wg-gesucht.de", "https://www.wg-gesucht.de"],
  ["Rooms and flats", "studis-online.de (Wohnungsbörse)", "https://www.studis-online.de"],
  ["Rooms and flats", "immobilienscout24.de", "https://www.immobilienscout24.de"],
  ["Rooms and flats", "immowelt.de", "https://www.immowelt.de"],
  ["Rooms and flats", "immonet.de", "https://www.immonet.de"],
  ["Rooms and flats", "zwischenmiete.de", "https://www.zwischenmiete.de"],
  ["Rooms and flats", "studenten-wg.de", "https://www.studenten-wg.de"],
  ["Rooms and flats", "housinganywhere.com", "https://housinganywhere.com"],
  ["Rooms and flats", "djh.de (hostels, for the first few days)", "https://www.djh.de"],

  ["Not a board - ask them", "Your host university: notice board, Career Center, International Office, your professors", ""],
  ["Not a board - ask them", "The GJU Project Office in Magdeburg sends company lists for your field", "mailto:interns@german-jordanian.org"],
  ["Not a board - ask them", "Google, in German: 'Praktikum im Bereich <your field>'", "https://www.google.de"],
];

// ---------------------------------------------------------------------------
// Look and feel — the site's own palette, so the sheet matches the profile
// ---------------------------------------------------------------------------

const C = {
  accent: "FF7A4522",
  accentSoft: "FFF3EBE2",
  border: "FFE2DDD4",
  paper: "FFFBFAF8",
  ink: "FF1C1B19",
  muted: "FF5D5A54",
  white: "FFFFFFFF",
  good: "FF2F6B4F",
  bad: "FF8C3A2B",
};

const thin = { style: "thin", color: { argb: C.border } };
const BOX = { top: thin, left: thin, bottom: thin, right: thin };

/**
 * The rows you have actually tracked, read from data/tracker.csv. They are the
 * source of truth; this workbook is a rendering of them, which is what makes
 * `npm run tracker` safe to re-run — it can no longer discard your work.
 */
const TRACKED = readTracker();

/** Tracked rows, plus blank pre-formulated rows to keep typing into. */
const ROWS = Math.max(150, TRACKED.length + 25);

const titleRow = (ws, row, text, span) => {
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { name: "Calibri", size: 15, bold: true, color: { argb: C.accent } };
  ws.mergeCells(row, 1, row, span);
  ws.getRow(row).height = 24;
  return cell;
};

const noteRow = (ws, row, text, span) => {
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { size: 10, italic: true, color: { argb: C.muted } };
  cell.alignment = { wrapText: true, vertical: "top" };
  ws.mergeCells(row, 1, row, span);
  return cell;
};

function headerRow(ws, row, labels, startCol = 1) {
  labels.forEach((label, i) => {
    const cell = ws.getCell(row, startCol + i);
    cell.value = label;
    cell.font = { bold: true, size: 10, color: { argb: C.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.accent } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = BOX;
  });
  ws.getRow(row).height = 30;
}

function sectionRow(ws, row, text, span) {
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { bold: true, size: 11, color: { argb: C.accent } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.accentSoft } };
  ws.mergeCells(row, 1, row, span);
  ws.getRow(row).height = 20;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  let input = null;
  let out = path.join(ROOT, "internship-tracker.xlsx");
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-o" || args[i] === "--out") out = path.resolve(args[++i]);
    else if (!input) input = path.resolve(args[i]);
  }
  return { input, out };
}

function loadStudent(input) {
  if (!input) {
    const certificates = loadCertificates();
    const experience = loadExperience();
    return {
      source: path.relative(ROOT, PROFILE_JSON).replace(/\\/g, "/"),
      profile: buildProfile(readJson(PROFILE_JSON), { certificates, experience }),
      certificates,
      experience,
    };
  }

  const payload = readJson(input);
  // An /editor/ export wraps everything; a bare profile.json does not.
  const raw = payload.profile || payload;
  const certificates = (payload.certificates || []).map(normalizeCertificate);
  const experience = (payload.experience || []).map(normalizeExperience);
  return {
    source: path.relative(ROOT, input).replace(/\\/g, "/"),
    profile: buildProfile(raw, { certificates, experience }),
    certificates,
    experience,
  };
}

// ---------------------------------------------------------------------------
// Sheet: Profile
// ---------------------------------------------------------------------------

function buildProfileSheet(wb, student) {
  const ws = wb.addWorksheet("Profile", { properties: { tabColor: { argb: C.accent } } });
  const { profile, experience, certificates } = student;
  const SPAN = 7;

  ws.columns = [
    { width: 26 }, { width: 40 }, { width: 18 }, { width: 22 },
    { width: 14 }, { width: 22 }, { width: 40 },
  ];

  titleRow(ws, 1, "Profile", SPAN);
  noteRow(
    ws, 2,
    `Read from ${student.source}. The Fit % on the Search sheet matches the skills below against ` +
    `the 'Skills they ask for' column, so keep them short and keep them the words a job ad would use. ` +
    `You can edit anything here by hand — nothing writes back to the website.`,
    SPAN
  );

  let r = 4;
  const facts = [
    ["Name", profile.name === "Unnamed Profile" ? "" : profile.name],
    ["Headline", profile.headline],
    ["E-mail", profile.email],
    ["Location", profile.location],
    ["Links", profile.links.map((l) => `${l.label}: ${l.url}`).join("  ·  ")],
    ["University / school", profile.education[0]?.school || ""],
    ["Study programme", profile.education[0]?.fieldOfStudy || profile.education[0]?.industry || ""],
  ];
  for (const [label, value] of facts) {
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).font = { bold: true, size: 10, color: { argb: C.muted } };
    ws.getCell(r, 2).value = value || null;
    ws.getCell(r, 2).alignment = { wrapText: true, vertical: "top" };
    r++;
  }

  // Fields the JSON has no answer for. They drive the score, so they are
  // deliberately empty and marked, not guessed.
  sectionRow(ws, r++, "Fill these in — the Fit % and the flags use them", SPAN);
  const germanLevelRow = r;
  const asks = [
    ["German level", "", ["A1", "A2", "B1", "B2", "C1", "C2"], "B2 or better scores full marks on a German-only internship."],
    ["Target field / Bereich", "", null, "The words you put in the German search, e.g. 'Softwareentwicklung'."],
    ["Earliest start", "", null, "Your internship semester start."],
    ["Phone in Germany", "", null, "Companies call. Part 3: answer properly and take names."],
    ["German address", "", null, "Goes in the CV page header."],
  ];
  for (const [label, value, list, hint] of asks) {
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).font = { bold: true, size: 10, color: { argb: C.muted } };
    const cell = ws.getCell(r, 2);
    cell.value = value || null;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.accentSoft } };
    cell.border = BOX;
    if (list) {
      cell.dataValidation = { type: "list", allowBlank: true, formulae: [`"${list.join(",")}"`] };
    }
    ws.getCell(r, 3).value = hint;
    ws.getCell(r, 3).font = { size: 9, italic: true, color: { argb: C.muted } };
    ws.mergeCells(r, 3, r, SPAN);
    r++;
  }

  // ---- skills, the range the Fit score searches --------------------------
  r++;
  sectionRow(ws, r++, "Skills — the Fit score looks for each of these in 'Skills they ask for'", SPAN);
  headerRow(ws, r++, ["Skill", "Evidenced by"], 1);

  const skillsFirst = r;
  const skills = profile.skills;
  for (const skill of skills) {
    ws.getCell(r, 1).value = skill.name;
    ws.getCell(r, 1).border = BOX;
    ws.getCell(r, 2).value = skill.count
      ? `${skill.count} role${skill.count === 1 ? "" : "s"} or certificate${skill.count === 1 ? "" : "s"}`
      : "listed on the profile";
    ws.getCell(r, 2).font = { size: 10, color: { argb: C.muted } };
    ws.getCell(r, 2).border = BOX;
    r++;
  }
  // Blank but formatted rows, so adding a skill needs no formula edit.
  const skillsLast = skillsFirst + Math.max(skills.length + 25, 45) - 1;
  for (let i = r; i <= skillsLast; i++) {
    ws.getCell(i, 1).border = BOX;
    ws.getCell(i, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.paper } };
    ws.getCell(i, 2).border = BOX;
  }
  r = skillsLast + 2;

  // ---- experience --------------------------------------------------------
  sectionRow(ws, r++, "Experience — the tasks you describe in the cover letter", SPAN);
  headerRow(ws, r++, ["Title", "Organization", "Employment type", "Location", "Location type", "Dates", "Skills"], 1);
  if (experience.length) {
    for (const role of experience) {
      const values = [
        role.title, role.organization, role.employmentType, role.location, role.locationType,
        role.dateRange || formatDateRange(role.startDate, role.endDate),
        (role.skills || []).join(", "),
      ];
      values.forEach((v, i) => {
        const cell = ws.getCell(r, i + 1);
        cell.value = v || null;
        cell.border = BOX;
        cell.alignment = { wrapText: true, vertical: "top" };
      });
      r++;
    }
  } else {
    noteRow(ws, r++, "No experience in the profile JSON yet.", SPAN);
  }
  r++;

  // ---- education ---------------------------------------------------------
  sectionRow(ws, r++, "Education", SPAN);
  headerRow(ws, r++, ["School", "Degree", "Field of study", "Industry", "Dates", "", ""], 1);
  if (profile.education.length) {
    for (const e of profile.education) {
      [e.school, e.degree, e.fieldOfStudy, e.industry, e.dateRange, "", ""].forEach((v, i) => {
        const cell = ws.getCell(r, i + 1);
        cell.value = v || null;
        cell.border = BOX;
        cell.alignment = { wrapText: true, vertical: "top" };
      });
      r++;
    }
  } else {
    noteRow(ws, r++, "No education in the profile JSON yet.", SPAN);
  }
  r++;

  // ---- certificates ------------------------------------------------------
  sectionRow(ws, r++, "Certificates — scan these into the one certificates PDF", SPAN);
  headerRow(ws, r++, ["Name", "Issuer", "Issued", "Expires", "Credential ID", "Skills", ""], 1);
  if (certificates.length) {
    for (const c of certificates) {
      [c.title, c.issuer, c.dateIssued, c.dateExpires, c.credentialId, (c.skills || []).join(", "), ""]
        .forEach((v, i) => {
          const cell = ws.getCell(r, i + 1);
          cell.value = v || null;
          cell.border = BOX;
          cell.alignment = { wrapText: true, vertical: "top" };
        });
      r++;
    }
  } else {
    noteRow(ws, r++, "No certificates in the profile JSON yet.", SPAN);
  }

  ws.views = [{ state: "frozen", ySplit: 3 }];

  return {
    skillsRange: `Profile!$A$${skillsFirst}:$A$${skillsLast}`,
    germanLevel: `Profile!$B$${germanLevelRow}`,
    skillCount: skills.length,
  };
}

// ---------------------------------------------------------------------------
// Sheet: Search — the tracker itself
// ---------------------------------------------------------------------------

/**
 * Punctuation that gets flattened to a space on BOTH sides of the skill match,
 * so "CI/CD" in the profile still meets "CI/CD-Pipeline" in a job ad. Doing it
 * to both sides is what keeps the two consistent. "*", "?" and "~" are in the
 * list because SEARCH would otherwise read them as wildcards.
 */
const PUNCTUATION = [",", ";", ":", ".", "/", "-", "(", ")", "[", "]", "*", "?", "~"];

/** Wrap an expression so the skill has to appear as a whole word, not a substring. */
const words = (expr) => {
  let out = expr;
  for (const ch of PUNCTUATION) out = `SUBSTITUTE(${out},"${ch}"," ")`;
  return `" "&SUBSTITUTE(${out},CHAR(10)," ")&" "`;
};

const col = (key) => {
  const i = COLUMNS.findIndex((c) => c.key === key);
  let n = i + 1, s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = ((n - m) / 26) | 0; }
  return s;
};

function buildSearchSheet(wb, refs) {
  const ws = wb.addWorksheet("Search", {
    properties: { tabColor: { argb: C.accent } },
    views: [{ state: "frozen", xSplit: 2, ySplit: 1 }],
  });

  ws.columns = COLUMNS.map((c) => ({ key: c.key, width: c.width }));
  headerRow(ws, 1, COLUMNS.map((c) => c.header));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };

  const european = ["Germany", "Austria", "Switzerland", "Luxembourg"];

  for (let row = 2; row <= ROWS + 1; row++) {
    const at = (key) => `$${col(key)}${row}`;

    // Seed from data/tracker.csv. Only the columns you fill in yourself — the
    // computed ones below stay formulas so they keep recalculating as you type.
    const tracked = TRACKED[row - 2];
    if (tracked) {
      for (const c of COLUMNS) {
        if (COMPUTED.has(c.key)) continue;
        const raw = tracked[c.key];
        if (raw == null || raw === "") continue;
        const cell = ws.getCell(row, COLUMNS.findIndex((x) => x.key === c.key) + 1);
        if (c.format === "date") {
          const d = new Date(raw);
          cell.value = Number.isNaN(d.getTime()) ? raw : d;
        } else if (c.format === "number") {
          const n = Number(String(raw).replace(/[^\d.-]/g, ""));
          cell.value = Number.isFinite(n) ? n : raw;
        } else {
          cell.value = raw;
        }
      }
    }

    ws.getCell(row, 1).value = { formula: `IF(${at("company")}="","",ROW()-1)` };

    // How many of my skills appear in their requirement text. SEARCH on an
    // empty skill cell would match everything, hence the (<>"") factor.
    ws.getCell(row, COLUMNS.findIndex((c) => c.key === "matched") + 1).value = {
      formula:
        `IF(${at("wants")}="","",` +
        `SUMPRODUCT((${refs.skillsRange}<>"")*` +
        `ISNUMBER(SEARCH(${words(refs.skillsRange)},${words(at("wants"))}))))`,
    };

    ws.getCell(row, COLUMNS.findIndex((c) => c.key === "due") + 1).value = {
      formula: `IF(${at("sent")}="","",${at("sent")}+${RULES.followUpDays})`,
    };

    ws.getCell(row, COLUMNS.findIndex((c) => c.key === "fit") + 1).value = {
      formula:
        `IF(${at("company")}="","",` +
        `MIN(40,ROUND(40*N(${at("matched")})/MAX(3,LEN(${at("wants")})-LEN(SUBSTITUTE(${at("wants")},",",""))+1),0))` +
        `+IF(${at("weeks")}="",0,IF(${at("weeks")}>=${RULES.minWeeks},20,IF(${at("weeks")}>=15,10,0)))` +
        `+IF(${at("country")}="",0,IF(${at("country")}="Germany",15,` +
        `IF(OR(${european.slice(1).map((c) => `${at("country")}="${c}"`).join(",")}),12,5)))` +
        `+IF(${at("paid")}="Yes",IF(N(${at("pay")})>=${RULES.minMonthlySalary},15,10),` +
        `IF(${at("paid")}="No",0,IF(${at("paid")}="",0,5)))` +
        `+IF(${at("language")}="",0,IF(OR(${at("language")}="English",${at("language")}="Both"),10,` +
        `IF(OR(${refs.germanLevel}="B2",${refs.germanLevel}="C1",${refs.germanLevel}="C2"),10,5))))`,
    };

    // Everything the GJU rules would object to, in one cell.
    ws.getCell(row, COLUMNS.findIndex((c) => c.key === "check") + 1).value = {
      formula:
        `IF(${at("company")}="","",TEXTJOIN(" · ",TRUE(),` +
        `IF(AND(${at("weeks")}<>"",${at("weeks")}<${RULES.minWeeks}),"Under the ${RULES.minWeeks}-week minimum",""),` +
        `IF(AND(${at("country")}<>"",${european.map((c) => `${at("country")}<>"${c}"`).join(",")}),"Needs Dean / President approval",""),` +
        `IF(AND(${at("paid")}="Yes",${at("pay")}<>"",${at("pay")}<${RULES.minMonthlySalary}),"Below ${RULES.minMonthlySalary} EUR/month",""),` +
        `IF(${at("paid")}="No","Unpaid - budget 700-1000 EUR/month",""),` +
        `IF(AND(${at("sent")}<>"",${at("followed")}="",TODAY()>${at("sent")}+${RULES.followUpDays}),"Follow up now",""),` +
        `IF(AND(${at("answer")}="Yes",${at("interview")}=""),"Book the interview",""),` +
        `IF(${at("status")}="Accepted","Tell OIL + Project Office + your Exchange Coordinator","")))`,
    };

    for (let c = 1; c <= COLUMNS.length; c++) {
      const cell = ws.getCell(row, c);
      cell.border = BOX;
      cell.alignment = { vertical: "top", wrapText: COLUMNS[c - 1].width >= 26 };
      cell.font = { size: 10 };
    }
    for (const key of ["start", "sent", "due", "followed", "interview"]) {
      ws.getCell(row, COLUMNS.findIndex((c) => c.key === key) + 1).numFmt = "yyyy-mm-dd";
    }
    ws.getCell(row, COLUMNS.findIndex((c) => c.key === "pay") + 1).numFmt = '#,##0 "€"';
    const fit = ws.getCell(row, COLUMNS.findIndex((c) => c.key === "fit") + 1);
    fit.numFmt = "0";
    fit.font = { size: 10, bold: true };
    fit.alignment = { horizontal: "center", vertical: "top" };
    ws.getCell(row, COLUMNS.findIndex((c) => c.key === "check") + 1).font = {
      size: 9, color: { argb: C.bad },
    };
  }

  const list = (key, values) => {
    const address = `${col(key)}2:${col(key)}${ROWS + 1}`;
    ws.dataValidations.add(address, {
      type: "list", allowBlank: true, showErrorMessage: false,
      formulae: [`"${values.join(",")}"`],
    });
  };
  list("country", COUNTRIES.map(([name]) => name));
  list("language", ["German", "English", "Both"]);
  list("paid", ["Yes", "No", "Unknown"]);
  list("type", ["E-mail", "Online form", "Speculative"]);
  list("answer", ["Waiting", "Yes", "No"]);
  list("status", STATUSES);

  // Fit % as a red-amber-green scale, so the list sorts itself by eye.
  ws.addConditionalFormatting({
    ref: `${col("fit")}2:${col("fit")}${ROWS + 1}`,
    rules: [{
      type: "colorScale", priority: 1,
      cfvo: [{ type: "num", value: 0 }, { type: "num", value: 55 }, { type: "num", value: 85 }],
      color: [{ argb: "FFE9A9A0" }, { argb: "FFF6E3B4" }, { argb: "FFA8D5B9" }],
    }],
  });
  ws.addConditionalFormatting({
    ref: `A2:${col("notes")}${ROWS + 1}`,
    rules: [
      {
        type: "expression", priority: 2,
        formulae: [`$${col("status")}2="Rejected"`],
        style: { font: { color: { argb: "FFA9A5A0" }, italic: true, size: 10 } },
      },
      {
        type: "expression", priority: 3,
        formulae: [`$${col("status")}2="Accepted"`],
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFE4F0E8" } } },
      },
    ],
  });

  return ws;
}

// ---------------------------------------------------------------------------
// Sheet: Read me
// ---------------------------------------------------------------------------

function buildReadmeSheet(wb, student, refs) {
  const ws = wb.addWorksheet("Read me", { properties: { tabColor: { argb: C.accent } } });
  ws.columns = [{ width: 26 }, { width: 12 }, { width: 96 }];
  const SPAN = 3;

  titleRow(ws, 1, "Internship search tracker", SPAN);
  let r = 2;
  noteRow(
    ws, r++,
    `Built ${new Date().toISOString().slice(0, 10)} from ${student.source} and the GJU internship ` +
    `documents in src/assets/gy-internships/. Regenerate any time with: ` +
    `npm run tracker  (or: npm run tracker -- careertoai-data.json)`,
    SPAN
  );
  r++;

  sectionRow(ws, r++, "The sheets", SPAN);
  const sheets = [
    ["Search", "", "One row per company. Everything else in the workbook exists to serve this sheet."],
    ["Profile", "", `Your details from the JSON. The ${refs.skillCount} skill${refs.skillCount === 1 ? "" : "s"} listed there are what the Fit % matches against — add to them freely.`],
    ["Checklist", "", "Every document GJU and the companies want, from Parts 1-3 and Decision 2015/46. Tick as you go."],
    ["GJU rules", "", "The numbers you would otherwise reopen the 30-page manual for."],
    ["Where to search", "", "The job boards and housing sites from Jobbörsen and Part 3, as clickable links."],
  ];
  for (const [a, b, c] of sheets) {
    ws.getCell(r, 1).value = a;
    ws.getCell(r, 1).font = { bold: true, size: 10 };
    ws.getCell(r, 2).value = b || null;
    ws.getCell(r, 3).value = c;
    ws.getCell(r, 3).alignment = { wrapText: true, vertical: "top" };
    r++;
  }
  r++;

  sectionRow(ws, r++, "How the Fit % is worked out — 100 points, recalculated as you type", SPAN);
  headerRow(ws, r++, ["Component", "Max", "Rule"]);
  for (const [name, max, why] of SCORE) {
    ws.getCell(r, 1).value = name;
    ws.getCell(r, 1).font = { bold: true, size: 10 };
    ws.getCell(r, 1).border = BOX;
    ws.getCell(r, 2).value = max;
    ws.getCell(r, 2).alignment = { horizontal: "center" };
    ws.getCell(r, 2).border = BOX;
    ws.getCell(r, 3).value = why;
    ws.getCell(r, 3).alignment = { wrapText: true, vertical: "top" };
    ws.getCell(r, 3).border = BOX;
    ws.getRow(r).height = 28;
    r++;
  }
  ws.getCell(r, 1).value = "Total";
  ws.getCell(r, 1).font = { bold: true, size: 10, color: { argb: C.accent } };
  ws.getCell(r, 2).value = SCORE.reduce((sum, [, m]) => sum + m, 0);
  ws.getCell(r, 2).font = { bold: true };
  ws.getCell(r, 2).alignment = { horizontal: "center" };
  r += 2;

  sectionRow(ws, r++, "Two columns do the work", SPAN);
  const how = [
    ["Skills they ask for", "", "Paste the requirements straight out of the advertisement — a comma-separated list scores most accurately, because the Fit % measures the share of them you have. This column is worth filling in for a second reason: npm run skills:harvest reads it back and feeds every skill into the editor's suggestions, so your catalogue grows out of real adverts in your field."],
    ["Check", "", "Reads the row back against the GJU rules and says what is wrong with it: under 20 weeks, a country that needs approval, pay below the visa threshold, an application you have not chased after two weeks."],
  ];
  for (const [a, b, c] of how) {
    ws.getCell(r, 1).value = a;
    ws.getCell(r, 1).font = { bold: true, size: 10 };
    ws.getCell(r, 2).value = b || null;
    ws.getCell(r, 3).value = c;
    ws.getCell(r, 3).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r).height = 42;
    r++;
  }
  r++;

  noteRow(
    ws, r,
    "A high Fit % is not permission to apply — the Check column and the GJU rules sheet are. " +
    "And Part 3 is blunt about the numbers: expect to send fifty or more applications, and expect rejections.",
    SPAN
  );
  ws.getRow(r).height = 30;

  return ws;
}

// ---------------------------------------------------------------------------
// Sheet: Checklist
// ---------------------------------------------------------------------------

function buildChecklistSheet(wb) {
  const ws = wb.addWorksheet("Checklist", { properties: { tabColor: { argb: C.accent } } });
  ws.columns = [{ width: 28 }, { width: 74 }, { width: 10 }, { width: 26 }];
  const SPAN = 4;

  titleRow(ws, 1, "Document checklist", SPAN);
  noteRow(ws, 2, "From Internship Information Parts 1-3 and Deans' Council Decision 2015/46. The originals are in src/assets/gy-internships/.", SPAN);

  const headerAt = 5;
  const first = headerAt + 1;
  ws.getCell(4, 1).value = "Done";
  ws.getCell(4, 1).font = { bold: true, size: 10, color: { argb: C.muted } };
  ws.getCell(4, 2).value = {
    formula: `COUNTIF(C${first}:C${first + CHECKLIST.length - 1},"Yes")&" of "&${CHECKLIST.length}&" ticked"`,
  };
  ws.getCell(4, 2).font = { bold: true, size: 11, color: { argb: C.accent } };

  headerRow(ws, headerAt, ["Group", "Item", "Done?", "Source"]);

  let r = first;
  let lastGroup = null;
  for (const [group, item, source] of CHECKLIST) {
    ws.getCell(r, 1).value = group === lastGroup ? null : group;
    ws.getCell(r, 1).font = { bold: true, size: 10, color: { argb: C.accent } };
    lastGroup = group;
    ws.getCell(r, 2).value = item;
    ws.getCell(r, 2).alignment = { wrapText: true, vertical: "top" };
    ws.getCell(r, 3).dataValidation = {
      type: "list", allowBlank: true, showErrorMessage: false, formulae: ['"Yes,No,N/A"'],
    };
    ws.getCell(r, 3).alignment = { horizontal: "center" };
    ws.getCell(r, 4).value = source;
    ws.getCell(r, 4).font = { size: 9, color: { argb: C.muted } };
    for (let c = 1; c <= SPAN; c++) ws.getCell(r, c).border = BOX;
    r++;
  }

  ws.addConditionalFormatting({
    ref: `A${first}:D${r - 1}`,
    rules: [{
      type: "expression", priority: 1, formulae: [`$C${first}="Yes"`],
      style: { font: { color: { argb: C.good } } },
    }],
  });

  ws.views = [{ state: "frozen", ySplit: headerAt }];
  return ws;
}

// ---------------------------------------------------------------------------
// Sheet: GJU rules
// ---------------------------------------------------------------------------

function buildRulesSheet(wb) {
  const ws = wb.addWorksheet("GJU rules", { properties: { tabColor: { argb: C.accent } } });
  ws.columns = [{ width: 42 }, { width: 30 }, { width: 66 }];
  const SPAN = 3;

  titleRow(ws, 1, "The numbers", SPAN);
  noteRow(ws, 2, "German Year Manual (23 June 2021), GJU-Praktikumsrichtlinien (September 2021), Decision 2015/46 and the visa notes. Where these and the PDFs disagree, the PDFs win.", SPAN);

  let r = 4;
  const facts = [
    ["Internship length", `${RULES.minWeeks} weeks minimum, full time`, `Up to ${RULES.maxRecognisedMonths} months is recognised if your residence permit covers it.`],
    ["Credit", `${RULES.creditHours} GJU credit hours`, "Awarded once OIL has your certificate and approved report."],
    ["Study semester load", "18-21 ECTS or 12 SWS", "Recognised up to 21 credit hours. Everything must be on the Learning Agreement."],
    ["Follow up after", `${RULES.followUpDays} days`, "Part 3: wait about two weeks, then call and ask politely."],
    ["Applications to expect", "50 or more", "Part 3. Rejections are normal; ask why when you can."],
    ["Blocked account", "10,332 € + 189 € Fintiba fees", "No proof of transfer, no visa process."],
    ["Visa deadline", "10 June / 10 December", "1st-semester start / 2nd-semester start. The visa itself takes 6-8 weeks."],
    ["Health insurance", "DAK, ~110 €/month", "Plus travel insurance from Jordan covering the first three months."],
    ["Liability insurance", "~60 €/year", "Not mandatory, strongly advised from the day you arrive."],
    ["Living costs", "700-1,000 €/month", "Dorm rooms 200-500 €/month, usually a two-month deposit."],
    ["Salary to extend a visa", `${RULES.minMonthlySalary} €/month`, "Or a refilled blocked account. Needed for a Fiktionsbescheinigung or a third semester."],
    ["Report", RULES.reportPages, "English, plus a 1-2 page German summary. Clip it, do not bind it. Signed and stamped."],
    ["Hand-in deadline", `${RULES.handInMonths} months into the next semester`, "Late means you are blocked from registering."],
    ["During the internship", "No GJU courses", "Only a final exam for a course you already took and failed."],
    ["Never", "Quit without another agreement", "Talk to your supervisor, then the Project Office / OIL / your Exchange Officer."],
  ];
  for (const [a, b, c] of facts) {
    ws.getCell(r, 1).value = a;
    ws.getCell(r, 1).font = { bold: true, size: 10 };
    ws.getCell(r, 2).value = b;
    ws.getCell(r, 2).font = { size: 10, color: { argb: C.accent }, bold: true };
    ws.getCell(r, 3).value = c;
    ws.getCell(r, 3).alignment = { wrapText: true, vertical: "top" };
    ws.getCell(r, 3).font = { size: 10, color: { argb: C.muted } };
    for (let cc = 1; cc <= SPAN; cc++) ws.getCell(r, cc).border = BOX;
    r++;
  }
  r++;

  sectionRow(ws, r++, "Where the internship may be — and who has to approve it", SPAN);
  headerRow(ws, r++, ["Country (as used on the Search sheet)", "Country points", "Approval needed"]);
  for (const [name, points, note] of COUNTRIES) {
    ws.getCell(r, 1).value = name;
    ws.getCell(r, 2).value = points;
    ws.getCell(r, 2).alignment = { horizontal: "center" };
    ws.getCell(r, 3).value = note;
    ws.getCell(r, 3).alignment = { wrapText: true, vertical: "top" };
    for (let cc = 1; cc <= SPAN; cc++) ws.getCell(r, cc).border = BOX;
    r++;
  }
  r++;

  sectionRow(ws, r++, "If you do not complete the 20 weeks", SPAN);
  headerRow(ws, r++, ["Completed in Germany", "Weeks required elsewhere", "Credit hours to register / transcript"]);
  const incomplete = [
    ["None, or under 5 weeks", "30 weeks", "12 CH — Fail 12, Pass 0"],
    ["5 to under 10 weeks", "20 weeks", "9 CH — Fail 9, Pass 3"],
    ["10 to under 15 weeks", "12 weeks", "6 CH — Fail 6, Pass 6"],
    ["15 to under 20 weeks", "6 weeks", "3 CH — Fail 3, Pass 9"],
  ];
  for (const rowVals of incomplete) {
    rowVals.forEach((v, i) => {
      ws.getCell(r, i + 1).value = v;
      ws.getCell(r, i + 1).border = BOX;
    });
    r++;
  }
  r++;

  sectionRow(ws, r++, "Who to tell, and when", SPAN);
  const contacts = [
    ["Office for Industrial Links (OIL)", "oil@gju.edu.jo · +962 6 429 4881", "The moment you are accepted, and where the certificate and report go."],
    ["Project Office, Magdeburg", "interns@german-jordanian.org", "Company lists for your field, and a second pair of eyes on your CV and cover letter."],
    ["Your Exchange Coordinator", "exchange.coordinator.<major>@gju.edu.jo", "Approves the placement and the contract; checks the certificate and report."],
    ["International Office", "—", "Nomination, distribution, university applications, Fintiba and the visa."],
  ];
  headerRow(ws, r++, ["Who", "Contact", "What for"]);
  for (const [a, b, c] of contacts) {
    ws.getCell(r, 1).value = a;
    ws.getCell(r, 1).font = { bold: true, size: 10 };
    ws.getCell(r, 2).value = b;
    ws.getCell(r, 3).value = c;
    ws.getCell(r, 3).alignment = { wrapText: true, vertical: "top" };
    for (let cc = 1; cc <= SPAN; cc++) ws.getCell(r, cc).border = BOX;
    r++;
  }

  ws.views = [{ state: "frozen", ySplit: 3 }];
  return ws;
}

// ---------------------------------------------------------------------------
// Sheet: Where to search
// ---------------------------------------------------------------------------

function buildBoardsSheet(wb) {
  const ws = wb.addWorksheet("Where to search", { properties: { tabColor: { argb: C.accent } } });
  ws.columns = [{ width: 24 }, { width: 62 }, { width: 12 }, { width: 40 }];
  const SPAN = 4;

  titleRow(ws, 1, "Where to search", SPAN);
  noteRow(ws, 2, "From Jobbörsen and Internship Information Part 3. Tick a site off once you have actually worked through it — Part 3's advice is to keep one list and fill it in as you go.", SPAN);

  let r = 4;
  headerRow(ws, r++, ["Group", "Site", "Worked through?", "What I found there"]);

  let lastGroup = null;
  const first = r;
  for (const [group, name, url] of BOARDS) {
    ws.getCell(r, 1).value = group === lastGroup ? null : group;
    ws.getCell(r, 1).font = { bold: true, size: 10, color: { argb: C.accent } };
    lastGroup = group;

    const cell = ws.getCell(r, 2);
    if (url) {
      cell.value = { text: name, hyperlink: url };
      cell.font = { size: 10, color: { argb: C.accent }, underline: true };
    } else {
      cell.value = name;
      cell.font = { size: 10 };
      cell.alignment = { wrapText: true, vertical: "top" };
    }

    ws.getCell(r, 3).dataValidation = {
      type: "list", allowBlank: true, showErrorMessage: false, formulae: ['"Yes,No"'],
    };
    ws.getCell(r, 3).alignment = { horizontal: "center" };
    for (let c = 1; c <= SPAN; c++) ws.getCell(r, c).border = BOX;
    r++;
  }

  ws.addConditionalFormatting({
    ref: `A${first}:D${r - 1}`,
    rules: [{
      type: "expression", priority: 1, formulae: [`$C${first}="Yes"`],
      style: { font: { color: { argb: C.good } } },
    }],
  });

  ws.views = [{ state: "frozen", ySplit: 4 }];
  return ws;
}

// ---------------------------------------------------------------------------

async function main() {
  const { input, out } = parseArgs(process.argv);
  const student = loadStudent(input);

  const wb = new ExcelJS.Workbook();
  wb.creator = "CareerToAI — make-internship-tracker.mjs";
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;

  // Profile first: the Search formulas point at ranges it defines.
  const refs = buildProfileSheet(wb, student);
  buildReadmeSheet(wb, student, refs);
  buildSearchSheet(wb, refs);
  buildChecklistSheet(wb);
  buildRulesSheet(wb);
  buildBoardsSheet(wb);

  // Tab order. The Profile sheet has to be built first — the Search formulas
  // point at ranges its layout decides — so the tabs are ordered afterwards.
  // workbook.worksheets sorts on orderNo, so setting it is all that is needed.
  const TABS = ["Read me", "Search", "Profile", "Checklist", "GJU rules", "Where to search"];
  for (const ws of wb.worksheets) ws.orderNo = TABS.indexOf(ws.name);

  await wb.xlsx.writeFile(out);

  const skills = refs.skillCount;
  console.log(`Wrote ${path.relative(ROOT, out).replace(/\\/g, "/")}`);
  console.log(`  profile   ${student.source}`);
  console.log(`  skills    ${skills} matched against "Skills they ask for"`);
  console.log(`  tracked   ${TRACKED.length} row(s) from ${path.relative(ROOT, CSV_PATH)}`);
  console.log(`  rows      ${ROWS} rows in the sheet (tracked + blanks to type into)`);
  console.log(`  checklist ${CHECKLIST.length} items`);
  if (!skills) {
    console.warn(
      "\n  The profile has no real skills yet, so every Fit % scores 0 for skills.\n" +
      "  Fill the profile in at /editor/, export the .json, and rerun:\n" +
      "    npm run tracker -- careertoai-data.json\n" +
      "  Or just type your skills straight into the Profile sheet."
    );
  }
}

await main();
