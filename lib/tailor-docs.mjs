/**
 * Adapt the student's base CV and cover letter to one job.
 *
 * The model reads the paragraphs of both documents plus student.json and
 * returns new text for the runs it wants to change. Only that text is
 * written back (lib/student-files.mjs), so the layout, fonts, images and
 * numbering of the base documents survive untouched.
 */
import { z } from "zod";

import { chatJson } from "./llm.mjs";
import { applyParagraphEdits, docxParagraphs, loadDocx, readBaseDocx, saveDocx } from "./student-files.mjs";

const Edits = z.record(z.string(), z.array(z.string()));
export const TailorSchema = z.object({ cv: Edits.default({}), cl: Edits.default({}) });

const SYSTEM = `You adapt a student's existing CV and cover letter to one specific job.

Rules:
- Use only facts found in STUDENT_DATA or in the base documents. Never invent employers, dates, degrees, skills, tools, numbers or contact details.
- Keep each paragraph's purpose and roughly its length. You may reword, and choose which of the student's real skills and projects to foreground for this job.
- Names, dates of study, employer names, past job titles and contact details: copy unchanged.
- Each paragraph arrives as a list of runs (pieces with their own formatting). Return the SAME number of runs for every paragraph you return, in the same order. Leave label runs such as "E-mail:" unchanged; put new wording in the run that carried the body text.
- Return only the paragraphs you change, keyed by their number.
- Text still in [square brackets] is a placeholder: fill it from the job data or remove it. Never leave brackets in your answer.
- Match the job's requirements honestly. If the student lacks a requirement, do not claim it.
Answer shape: {"cv": {"<paragraph number>": ["run text", ...]}, "cl": {"<paragraph number>": ["run text", ...]}}`;

const longDate = (date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" }).format(date);
const isoToLong = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value || "") ? longDate(new Date(`${value}T12:00:00Z`)) : value || "");
const roleKind = (type) => ({ Praktikum: "internship", Internship: "internship", Werkstudent: "working-student role", "Junior role": "graduate position", "Bachelor thesis": "thesis placement" })[type] || "";

/** Placeholders the row can fill without a model. Empty values leave the placeholder for the model. */
export function fillPlaceholders(text, row, now = new Date()) {
  const rules = [
    [/\[Company name\]/g, row.company],
    [/\[Role title\]/g, row.position],
    [/\[Company address\]/g, row.address],
    [/\[DD Month YYYY\]/g, longDate(now)],
    [/\[Hiring manager or recruitment team\]/g, row.contact_person || "Recruitment Team"],
    [/\[Hiring manager[’']s name \/ Hiring Team\]/g, row.contact_person || "Hiring Team"],
    [/\[Start date\]/g, isoToLong(row.start_date)],
    [/\[Internship \/ working-student role \/ graduate position\]/g, roleKind(row.opportunity_type)],
  ];
  return rules.reduce((out, [pattern, value]) => (value ? out.replace(pattern, () => value) : out), text);
}

// Contact lines are never rewritten, whatever the model says.
const PROTECTED = /@|https?:|linkedin|github|\+\d/i;

async function fillRows(doc, row, now) {
  const edits = {};
  for (const { i, runs } of docxParagraphs(doc.xml)) {
    const filled = runs.map((text) => fillPlaceholders(text, row, now));
    if (filled.some((text, n) => text !== runs[n])) edits[i] = filled;
  }
  return { ...doc, xml: applyParagraphEdits(doc.xml, edits).xml };
}

function acceptEdits(raw, paragraphs) {
  const accepted = {};
  for (const [key, runs] of Object.entries(raw || {})) {
    const original = paragraphs.find((p) => String(p.i) === key);
    if (!original || runs.length !== original.runs.length) continue;
    if (PROTECTED.test(original.runs.join(""))) continue;
    if (runs.some((text, n) => text.length > original.runs[n].length * 4 + 600)) continue;
    accepted[original.i] = runs;
  }
  return accepted;
}

/**
 * @returns {{cv: Buffer, cl: Buffer, stats: object, unfilled: string[]}}
 */
export async function tailorDocuments({ row, student, now = new Date(), chat = chatJson, readDocx = readBaseDocx }) {
  const cv = await fillRows(await loadDocx(readDocx("cv")), row, now);
  const cl = await fillRows(await loadDocx(readDocx("cl")), row, now);
  const cvParagraphs = docxParagraphs(cv.xml);
  const clParagraphs = docxParagraphs(cl.xml);

  const job = {
    company: row.company, position: row.position, type: row.opportunity_type, city: row.city,
    description: String(row.notes || "").slice(0, 3000), requirements: row.req_skills, language: row.posting_lang,
  };
  const reply = await chat({
    system: `${SYSTEM}\nWrite in ${row.doc_lang || "English"}.`,
    user: JSON.stringify({ JOB: job, STUDENT_DATA: student, CV_PARAGRAPHS: cvParagraphs, COVER_LETTER_PARAGRAPHS: clParagraphs }),
    schema: TailorSchema,
  });

  const cvEdits = acceptEdits(reply.cv, cvParagraphs);
  const clEdits = acceptEdits(reply.cl, clParagraphs);
  const cvResult = applyParagraphEdits(cv.xml, cvEdits);
  const clResult = applyParagraphEdits(cl.xml, clEdits);
  const unfilled = docxParagraphs(clResult.xml).flatMap((p) => p.runs.join("").match(/\[[^\]]{2,}\]/g) || []);
  return {
    cv: await saveDocx(cv.zip, cvResult.xml),
    cl: await saveDocx(cl.zip, clResult.xml),
    stats: {
      cv: { changed: cvResult.changed, skipped: Object.keys(reply.cv).length - Object.keys(cvEdits).length },
      cl: { changed: clResult.changed, skipped: Object.keys(reply.cl).length - Object.keys(clEdits).length },
    },
    unfilled: [...new Set(unfilled)],
  };
}

/** A file-name-safe piece of text. Output paths are built from this, never from raw input. */
export function slug(value) {
  return String(value || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "job";
}
