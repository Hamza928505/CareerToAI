/**
 * The student's own files: student.json and the two base .docx documents.
 *
 * Everything an AI sees from here is text. student.json is mostly base64
 * images, so it is pruned before it goes anywhere. The .docx helpers edit
 * run text only: paragraph and run properties, styles, numbering, images and
 * every other part of the zip are left byte-for-byte as they were.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";

import { ROOT } from "./content.mjs";

/**
 * src/assets/Student-data/ is the one home of the student's own data and documents. Everything in it except .gitkeep and
 * README.md is git-ignored, and the site build leaves the whole folder out (eleventy.config.mjs), so nothing here is published:
 *
 *   student.json                 the profile as the Profile / Editor saved it, private fields included
 *   base_cv_en.docx, base_cover_letter_en.docx   the base documents the tailoring edits
 *   tailored/                    one CV and cover letter per application
 *   documents/                   uploaded source documents (certificates, references, transcripts, old CVs) and index.json, their register
 *   ats/                         the ATS manuals (.md), the company notes and ats_check.py
 */
export const STUDENT_DIR = path.join(ROOT, "src", "assets", "Student-data");
export const TAILORED_DIRS = [STUDENT_DIR, path.join(ROOT, "_site", "assets", "Student-data")].map((dir) => path.join(dir, "tailored"));
export const BASE_FILES = { cv: "base_cv_en.docx", cl: "base_cover_letter_en.docx" };
export const DOCUMENTS_DIR = path.join(STUDENT_DIR, "documents");
export const ATS_DIR = path.join(STUDENT_DIR, "ats");

/** The folder the ATS manuals are read from: Student-data/ats once it holds them, else the copy in the Internships folder they came from. */
export const atsDir = (fallback) => (fs.existsSync(path.join(ATS_DIR, "README.md")) || !fallback ? ATS_DIR : fallback);

/**
 * The tailored CV and cover letter of a tracker row, as absolute paths that exist.
 * Only the file name is used: a row value like "../../x" can never leave the tailored folder.
 */
export function tailoredPaths(row, dir = TAILORED_DIRS[0]) {
  const found = {};
  for (const [kind, column] of [["cv", "cv_file"], ["cl", "cl_file"]]) {
    const name = path.basename(String(row?.[column] || "").replace(/\\/g, "/"));
    const file = name ? path.join(dir, name) : "";
    if (file && /\.docx$/i.test(name) && fs.existsSync(file)) found[kind] = file;
  }
  return found;
}

const studentPath = (name) => path.join(STUDENT_DIR, name);
export const hasStudentFiles = () => fs.existsSync(studentPath("student.json")) && Object.values(BASE_FILES).every((name) => fs.existsSync(studentPath(name)));

const MAX_TEXT = 1500; // project descriptions can be whole README files

/** student.json as text a model can use: no images, attachment blobs, ids or empty fields; long texts clipped. */
export function pruneStudent(value) {
  if (Array.isArray(value)) return value.map(pruneStudent);
  if (typeof value === "string") return !value || value.startsWith("data:") ? undefined : value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value;
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (/^(_key|id|imageKey)$|image|attachment/i.test(key)) continue;
    const pruned = pruneStudent(item);
    if (pruned !== undefined) out[key] = pruned;
  }
  return out;
}

/** The export of the profile that the Cowork tasks in the Internships folder read. */
const exportedProfile = (env = process.env) => path.join(path.resolve(env.INTERNSHIPS_DIR || path.join(os.homedir(), "Desktop", "Internships")), "Input Data", "gju-profile.json");

/**
 * The student's profile as it was saved, with where it came from. Every module reads the profile through here, so there
 * is one answer to "what is true about the student": the Profile / Editor writes student.json; an export in the
 * Internships folder that is newer wins until the editor saves again (the editor loads it and says so); with neither,
 * the published data/*.json is read.
 */
export function readProfileFile({ dir = STUDENT_DIR, exported = exportedProfile() } = {}) {
  const found = [[path.join(dir, "student.json"), "Student-data/student.json"], [exported, "Internships/Input Data/gju-profile.json"]]
    .filter(([file]) => fs.existsSync(file))
    .map(([file, source]) => ({ file, source, time: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  if (found.length) return { data: JSON.parse(fs.readFileSync(found[0].file, "utf8")), source: found[0].source, savedAt: new Date(found[0].time).toISOString() };
  const read = (name, empty) => { const file = path.join(ROOT, "data", `${name}.json`); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : empty; };
  return { data: { profile: read("profile", {}), experience: read("experience", []), projects: read("projects", []), certificates: read("certificates", []), extras: read("profile-extras", {}) }, source: "data/", savedAt: "" };
}

/** The profile as text a model or a rule check can use: pruned, with allSkills (each skill of every entry, once) and its source. */
export function readUserProfile(options) {
  const { data, source } = readProfileFile(options);
  const profile = pruneStudent(data);
  const skills = [
    ...(profile.profile?.skills || []),
    ...["experience", "projects", "certificates"].flatMap((list) => (profile[list] || []).flatMap((entry) => entry.skills || [])),
    ...(profile.extras?.courses || []).flatMap((course) => course.skills || []),
  ];
  const seen = new Set();
  profile.allSkills = skills.filter((skill) => { const key = String(skill).trim().toLowerCase(); return key && !seen.has(key) && seen.add(key); });
  profile.source = source;
  return profile;
}

export const readStudent = () => readUserProfile();

export const readBaseDocx = (kind) => {
  const file = studentPath(BASE_FILES[kind]);
  if (!fs.existsSync(file)) throw new Error(`${BASE_FILES[kind]} is missing from src/assets/Student-data. Upload it in the editor first.`);
  return fs.readFileSync(file);
};

// ---------------------------------------------------------------- .docx text

const PARAGRAPH = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
const RUN = /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g;
const TEXT = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;

const unescapeXml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e) => {
  const named = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" }[e.toLowerCase()];
  if (named) return named;
  const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
  return String.fromCodePoint(code);
});
const escapeXml = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

const runText = (run) => unescapeXml([...run.matchAll(TEXT)].map((m) => m[1]).join(""));

export async function loadDocx(buffer) {
  const zip = await JSZip.loadAsync(buffer, { createFolders: false });
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("This file is not a Word document.");
  return { zip, xml: await entry.async("string") };
}

/** Every paragraph that has text, as the text of each of its runs. */
export function docxParagraphs(xml) {
  const out = [];
  let index = 0;
  for (const [paragraph] of xml.matchAll(PARAGRAPH)) {
    const runs = [...paragraph.matchAll(RUN)].map((m) => runText(m[0]));
    if (runs.some((text) => text.trim())) out.push({ i: index, runs });
    index++;
  }
  return out;
}

export const docxPlainText = (xml) => docxParagraphs(xml).map((p) => p.runs.join("")).join("\n");

/**
 * Write new run text into paragraphs. `edits` maps paragraph index to one
 * string per run. A paragraph whose run count does not match is left alone;
 * so is a run with no text element to write into.
 */
export function applyParagraphEdits(xml, edits) {
  let index = 0;
  let changed = 0;
  let skipped = 0;
  const out = xml.replace(PARAGRAPH, (paragraph) => {
    const wanted = edits[index++];
    if (!wanted) return paragraph;
    const runs = [...paragraph.matchAll(RUN)];
    if (!Array.isArray(wanted) || wanted.length !== runs.length || wanted.some((t) => typeof t !== "string")) { skipped++; return paragraph; }
    let cursor = 0;
    let touched = false;
    const rebuilt = paragraph.replace(RUN, (run) => {
      const text = wanted[cursor++];
      if (text === runText(run)) return run;
      let first = true;
      let wrote = false;
      const next = run.replace(TEXT, () => {
        if (!first) return '<w:t xml:space="preserve"></w:t>';
        first = false;
        wrote = true;
        return `<w:t xml:space="preserve">${escapeXml(text)}</w:t>`;
      });
      if (wrote) touched = true;
      return next;
    });
    if (touched) changed++;
    return rebuilt;
  });
  return { xml: out, changed, skipped };
}

export async function saveDocx(zip, xml) {
  zip.file("word/document.xml", xml, { createFolders: false });
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
