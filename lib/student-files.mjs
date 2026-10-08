/**
 * The student's own files: student.json and the two base .docx documents.
 *
 * Everything an AI sees from here is text. student.json is mostly base64
 * images, so it is pruned before it goes anywhere. The .docx helpers edit
 * run text only: paragraph and run properties, styles, numbering, images and
 * every other part of the zip are left byte-for-byte as they were.
 */
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

import { ROOT } from "./content.mjs";

export const STUDENT_DIR = path.join(ROOT, "src", "assets", "Student-data");
export const TAILORED_DIRS = [STUDENT_DIR, path.join(ROOT, "_site", "assets", "Student-data")].map((dir) => path.join(dir, "tailored"));
export const BASE_FILES = { cv: "base_cv_en.docx", cl: "base_cover_letter_en.docx" };

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

export function readStudent() {
  const file = studentPath("student.json");
  if (!fs.existsSync(file)) throw new Error("student.json is missing from src/assets/Student-data. Upload it in the editor first.");
  return pruneStudent(JSON.parse(fs.readFileSync(file, "utf8")));
}

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
