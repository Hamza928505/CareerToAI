/**
 * What a workspace search looks for: the student's own major, taken from the profile, or every field at once.
 *
 * A "plan" is the same list of job-title words written for each searcher: the free job sources (engine keywords), the
 * Claude connectors (Indeed searches, then the first of them for StepStone and the Arbeitsagentur) and the NVIDIA NIM
 * model (a short brief). The words for a GJU major come from data/majors.json; a field it does not list is searched by
 * its own name, plus German and English title words from the student's AI provider when one is set up.
 */
import path from "node:path";
import { z } from "zod";

import { PROFILE_JSON, ROOT, readJson } from "./content.mjs";
import { chatJson, llmConfig } from "./llm.mjs";
import { readStudent } from "./student-files.mjs";

export const loadMajors = () => readJson(path.join(ROOT, "data", "majors.json"));

const MIN_WORD = 5;        // the engine's free sources match a keyword anywhere in the text: "KI" would find "Kinder"
const MAX_ENGINE = 8;      // the engine asks every source once per keyword, one keyword after the other
const MAX_SEARCHES = 16;   // Indeed, ten postings a search
const MAX_APIFY = { profile: 6, global: 10 }; // Apify bills per result
const GENERIC_WORDS = ["Praktikum", "Pflichtpraktikum", "Praxissemester", "internship"];

const unique = (list) => [...new Set(list)];
const interleave = (a, b) => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => [a[i], b[i]]).flat().filter(Boolean);
const words = (list) => unique((list || []).map((word) => String(word || "").trim()).filter((word) => word && word.length <= 40));

/** The field of study of the student's latest education entry: the profile first, then the uploaded student.json. */
export function readField() {
  const latest = (list) => [...(list || [])].filter((entry) => entry?.fieldOfStudy)
    .sort((a, b) => String(b.endDate || "").localeCompare(String(a.endDate || "")))[0]?.fieldOfStudy || "";
  const fromProfile = latest(readJson(PROFILE_JSON).education);
  if (fromProfile) return fromProfile;
  try { return latest(readStudent().profile?.education); } catch { return ""; }
}

const norm = (text) => String(text || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

/** The GJU major a field of study names (exactly, or as a whole-word part of the other), or null. A tie is no match. */
export function matchMajor(field, majors = loadMajors().majors) {
  const text = norm(field);
  if (text.length < MIN_WORD) return null;
  const score = (major) => {
    const name = norm(major.name);
    if (text === name || text === norm(major.id)) return 3;
    if (` ${text} `.includes(` ${name} `)) return 2;
    if (` ${name} `.includes(` ${text} `)) return 1;
    return 0;
  };
  const ranked = majors.map((major) => [score(major), major]).filter(([points]) => points).sort((a, b) => b[0] - a[0]);
  if (!ranked.length || (ranked.length > 1 && ranked[0][0] === ranked[1][0] && ranked[0][0] < 2)) return null;
  return ranked[0][1];
}

const WordsSchema = z.object({ de: z.array(z.string()).default([]), en: z.array(z.string()).default([]) });

/** German and English job-title words for a field no list covers; empty when the provider fails: the field's own name still works. */
async function aiWords(field, chat) {
  try {
    const reply = await chat({
      system: `You help a student find internships in Germany. Given a field of study, reply {"de": [...], "en": [...]}: up to 5 German and up to 5 English job titles or topic words an employer would put in an internship advert for that field. Each at least ${MIN_WORD} letters; never "Praktikum" or "internship".`,
      user: JSON.stringify({ field }), schema: WordsSchema });
    return { de: words(reply.de).slice(0, 5), en: words(reply.en).slice(0, 5) };
  } catch { return { de: [], en: [] }; }
}

function build({ mode, label, de, en, engine, searches, brief, skills = [], matched = false }) {
  const keywords = words(engine).filter((word) => word.length >= MIN_WORD).slice(0, MAX_ENGINE);
  const all = words(searches).slice(0, MAX_SEARCHES);
  return {
    mode, label, de, en, skills, matched,
    engineKeywords: keywords,
    indeedSearches: all.map((search) => ({ search, location: "Deutschland" })),
    apifySearches: all.slice(0, MAX_APIFY[mode]),
    nimBrief: brief,
    nimQueries: all.slice(0, 8),
  };
}

const titleSearches = (de, en) => interleave(de.map((word) => `Praktikum ${word}`), en.map((word) => `${word} Internship`));
const NIM_WHAT = "internships (Praktikum, Pflichtpraktikum, Praxissemester, internship) in Germany";

/**
 * { mode: "profile" | "global", label, engineKeywords, indeedSearches, apifySearches, nimBrief, nimQueries }.
 * "profile" needs a field of study; "global" looks at every field once.
 */
export async function searchPlan({ mode = "profile", field = readField(), data = loadMajors(), chat = chatJson, ai = Boolean(llmConfig()) } = {}) {
  if (mode === "global") {
    const area = data.areas.map((name) => data.areaWords?.[name]).filter(Boolean);
    const de = words(area.map((item) => item.de)), en = words(area.map((item) => item.en));
    return build({ mode, label: "Internships in every field", de, en, engine: ["Praktikum", "Internship", ...de],
      searches: ["Praktikum", "Internship", ...titleSearches(de, en), "Pflichtpraktikum", "Praxissemester"],
      brief: `${NIM_WHAT}, in ANY field. Cover each of these fields with queries of their own: ${data.areas.join(", ")}` });
  }
  if (!String(field).trim()) throw Object.assign(new Error("Your profile has no field of study. Import your profile or choose the global search."), { statusCode: 400 });
  const major = matchMajor(field, data.majors);
  let de = major ? words(major.de) : [], en = major ? words(major.en) : [];
  const name = major ? major.name : String(field).trim();
  if (!major) {
    ({ de, en } = ai ? await aiWords(name, chat) : { de: [], en: [] });
    de = words([name, ...de]); en = words([name, ...en]);
  }
  const first = de[0];
  return build({ mode, label: `${name} internships`, de, en, engine: interleave(de, en),
    searches: [...titleSearches(de.slice(0, 1), en.slice(0, 1)), `Pflichtpraktikum ${first}`, ...titleSearches(de.slice(1), en.slice(1))],
    skills: major ? words(major.skills) : [], matched: Boolean(major),
    brief: `${NIM_WHAT} for a student of ${name}. Job titles and topics to look for: ${unique([...de, ...en]).slice(0, 10).join(", ")}` });
}
