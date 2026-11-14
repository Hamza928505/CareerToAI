// The text file the CVs & CLs page hands over, so the student can give everything about an application to an AI of their own.
// It holds the same facts generateDocumentsForPosting sends to Claude Opus: the profile, the base CV and letter, and per
// posting the advert, the GJU check and the ATS assessment. Nothing here calls an AI.
import fs from "node:fs";
import path from "node:path";
import { evaluateWithCity, loadCityHousing, readDocParagraphs, readInternshipsProfile, readStudioSettings, studioDirs } from "./internships-studio.mjs";

const BASE_DOCS = {
  de: ["Lebenslauf_Hamza_Salameh_DE.docx", "Anschreiben_Hamza_Salameh_DE.docx"],
  en: ["CV_Hamza_Salameh_EN.docx", "CL_Hamza_Salameh_EN.docx"],
};

const text = (value) => String(value ?? "").trim();
const list = (items) => (Array.isArray(items) && items.length ? items.join(", ") : "none");
const bullets = (items, line) => (Array.isArray(items) && items.length ? items.map((item) => `  - ${line(item)}`).join("\n") : "  (none)");
const field = (label, value) => (text(value) ? `${label}: ${text(value)}` : "");
const section = (title, body) => `${"=".repeat(78)}\n${title}\n${"=".repeat(78)}\n${body}\n`;

function formatAssessment(a) {
  const use = (a.requirements || []).filter((item) => item.status !== "GAP").map((item) => item.term).filter(Boolean);
  return [
    `ATS assessment (this tool's estimate, not the employer's score)`,
    `  Platform: ${text(a.ats)}. Its manual advises documents in ${a.language === "en" ? "English" : "German"}. Score: ${a.score?.total ?? "-"}.`,
    `  What the posting asks, against the profile:`,
    bullets(a.requirements, (r) => `[${r.status}] ${r.kind === "must" ? "must" : "nice"}: ${text(r.requirement)} (term "${text(r.term)}")${text(r.evidence) ? `; profile evidence: ${text(r.evidence)}` : "; nothing in the profile"}${text(r.wording) ? `; say it as: ${text(r.wording)}` : ""}`),
    `  Terms to use (the profile supports them): ${list(use)}`,
    `  Gaps, never claim: ${list((a.gaps || []).map((gap) => gap.term))}`,
    `  Weak areas:`, bullets(a.weakAreas, text),
    `  What to change, and why:`, bullets(a.recommendations, (r) => `${text(r.action)} (why: ${text(r.why)})`),
    `  Questions the form will likely ask:`, bullets(a.knockouts, (k) => `${text(k.question)} Your true answer: ${text(k.answer)}`),
  ].join("\n");
}

function formatPosting(p, n, total, settings) {
  const city = settings.matchCityAddress && p.cityAddress?.matched ? p.cityAddress : null;
  const head = [
    `APPLICATION ${n} OF ${total}: ${text(p.company) || "Unknown company"}, ${text(p.title || p.position) || "Internship"}`,
    field("Location", p.location), field("Reference", p.ref), field("Link", p.url), field("Contact person", p.contact),
    field("Advert language", p.postingLang === "en" ? "English" : p.postingLang === "de" ? "German" : ""),
    field("Sender address for this city", city && `${city.address} (student housing in ${city.city})`),
    field("Start and duration", p.startDuration), field("Hours and remote", p.hoursRemote),
  ].filter(Boolean).join("\n");
  const gju = [
    `GJU German Year check: ${text(p.verdict)} (fit ${text(p.fit)}). ${text(p.verdictReason)}`,
    bullets(p.rules, (r) => `${text(r.rule)}: ${text(r.status)}${text(r.evidence) ? `, ${text(r.evidence)}` : ""}`),
    p.assessment ? "" : `Profile skills the advert asks for: ${list(p.covered)}\nGaps, never claim: ${list(p.gaps)}`,
    p.email ? `Draft clarification e-mail:\nSubject: ${text(p.email.subject)}\n${text(p.email.body)}` : "",
  ].filter(Boolean).join("\n");
  return `${head}\n\n${gju}\n\n${p.assessment ? `${formatAssessment(p.assessment)}\n\n` : ""}ADVERT TEXT (all of it)\n${text(p.rawText) || "(no advert text was added)"}\n`;
}

/** The whole file as one string. Pure: everything it needs is passed in. */
export function formatBrief({ date, settings, profile, base, postings }) {
  const english = settings.docLang === "en";
  const baseDoc = (name, lines) => (lines ? lines.join("\n") : `(${name} was not found in the Input Data folder: add your own.)`);
  const intro = `APPLICATION BRIEF, ${date}

Give this whole file to an AI and ask it to write, for each application in section 5, a tailored CV (Lebenslauf) and cover letter (Anschreiben) in ${english ? "English" : "German (natural, professional, DIN 5008, no clichés)"}, starting from the base documents in sections 3 and 4.

Rules for the AI:
- Truth only. Use only facts from the profile in section 2 and from the base documents. Never invent skills, tools, employers, grades or dates.
- Tailor to the advert's own text, not just its title: put the experience, projects and skills the profile has that match the advert's tasks and requirements first, in the advert's own words.
- A gap is something the profile does not prove: never claim it.
- A term under "Terms to use" goes once into a sentence or the skills line, in the advert's spelling. No keyword lists, no repeated terms, no hidden text.
- Keep the base documents' layout and length: the CV 2 pages, the letter 1 page. Change only what the advert asks for. No placeholders or square brackets.
`;
  return [
    intro,
    section("1. SETTINGS", [
      field("Document language", english ? "English" : "German"), field("Earliest start", settings.earliestStart),
      field("Latest end", settings.latestEnd), field("Preferred duration (at least 20 weeks)", settings.preferredDuration),
    ].filter(Boolean).join("\n")),
    section("2. PROFILE (the only facts you may use)", JSON.stringify(profile, null, 2)),
    section("3. BASE CV", baseDoc(english ? BASE_DOCS.en[0] : BASE_DOCS.de[0], base.cv)),
    section("4. BASE COVER LETTER", baseDoc(english ? BASE_DOCS.en[1] : BASE_DOCS.de[1], base.cl)),
    section("5. THE APPLICATIONS", postings.map((p, i) => formatPosting(p, i + 1, postings.length, settings)).join(`\n${"-".repeat(78)}\n`)),
  ].join("\n");
}

async function paragraphs(dir, name) {
  const file = path.join(dir, name);
  return fs.existsSync(file) ? (await readDocParagraphs(file)).map((p) => p.text.trim()).filter(Boolean) : null;
}

/**
 * postings: raw ones from the workbench, or ones Phase 1 already evaluated (they carry their GJU check and, if it was run,
 * their ATS assessment). A raw one is evaluated here, which is deterministic apart from the optional city lookup.
 */
export async function buildApplicationBrief({ postings, settings: given = {} }) {
  const settings = { ...readStudioSettings(), ...given };
  const dirs = studioDirs(settings.workingDir);
  const profile = readInternshipsProfile(settings.workingDir);
  const housing = loadCityHousing(settings.workingDir);
  const evaluated = [];
  for (const [i, p] of postings.entries()) evaluated.push(p.verdict ? p : await evaluateWithCity(p, i + 1, profile, settings, housing));
  const [cvName, clName] = BASE_DOCS[settings.docLang === "en" ? "en" : "de"];
  return formatBrief({
    date: new Date().toISOString().slice(0, 10), settings, profile, postings: evaluated,
    base: { cv: await paragraphs(dirs.inputData, cvName), cl: await paragraphs(dirs.inputData, clName) },
  });
}
