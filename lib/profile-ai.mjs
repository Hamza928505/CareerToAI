/**
 * Search, guided by the student's own files (student.json and the base CV and
 * cover letter). Two jobs, both opt-in per run:
 *   suggestRoles     propose job titles (places and kinds of position stay the student's own choice)
 *   scoreJobs        score new postings against what the student really has
 * Both only ever send text, and both are optional: a failure here must never
 * cost the user their search.
 */
import { z } from "zod";

import { chatJson } from "./llm.mjs";
import { docxPlainText, loadDocx, readBaseDocx, readStudent } from "./student-files.mjs";

const clip = (text, max) => String(text ?? "").slice(0, max);

async function studentContext() {
  const [cv, cl] = await Promise.all(["cv", "cl"].map(async (kind) => docxPlainText((await loadDocx(readBaseDocx(kind))).xml)));
  return { STUDENT_DATA: readStudent(), CV: clip(cv, 6000), COVER_LETTER: clip(cl, 3000) };
}

// ------------------------------------------------------------ strategy

const RolesSchema = z.object({ roles: z.array(z.string()).default([]) });

const norm = (value) => String(value).trim().toLocaleLowerCase();

/** Keep only roles the form can show, by the catalogue's own name (English or German titles both match). */
function restrictRoles(suggested, roles) {
  const index = new Map();
  for (const role of roles) for (const name of [role.name, role.de]) if (name) index.set(norm(name), role.name);
  const match = (value) => {
    const key = norm(value);
    if (index.has(key)) return index.get(key);
    if (key.length < 4) return null;
    const hit = [...index.keys()].find((name) => name.includes(key) || key.includes(name));
    return hit ? index.get(hit) : null;
  };
  return [...new Set(suggested.map(match).filter(Boolean))].slice(0, 8);
}

/** Suggests job titles only. Where to search and which kinds of position stay the student's own choice. */
export async function suggestRoles({ options, chat = chatJson, context = studentContext }) {
  const reply = await chat({
    system: `You help a student in Germany pick what to search for. From their files, propose roles: 3 to 8 job titles that fit what they have actually done (English or German titles, as employers write them).
Base everything on the files. Do not invent experience.
Answer shape: {"roles": [...]}`,
    user: JSON.stringify(await context()),
    schema: RolesSchema,
  });
  return { roles: restrictRoles(reply.roles, options.roles) };
}

// ------------------------------------------------------------ skills radar

const AnalysisSchema = z.object({
  axes: z.array(z.object({
    label: z.string(),
    score: z.number(),
    evidence: z.string().default(""),
  })).min(3),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  advice: z.array(z.string()).default([]),
});

const list = (value, max) => (Array.isArray(value) ? value : []).slice(0, max).map((v) => clip(v, 120));

/**
 * Rates the skills the editor holds, field by field, and names strong and weak points.
 * Works from what the editor sends (it may hold unsaved edits) plus the roles being searched for.
 */
export async function analyseSkills({ profile = {}, targetRoles = [], chat = chatJson }) {
  const input = {
    SKILLS: list(profile.skills, 200),
    ROLES: (profile.roles || []).slice(0, 15).map((r) => ({ title: clip(r.title, 100), skills: list(r.skills, 30) })),
    PROJECTS: (profile.projects || []).slice(0, 20).map((p) => ({ name: clip(p.name, 100), skills: list(p.skills, 30) })),
    CERTIFICATES: list(profile.certificates, 40),
    LANGUAGES: list(profile.languages, 10),
    SKILLS_JOB_ADVERTS_ASKED_FOR: list(profile.advertSkills, 100),
    ROLES_THE_STUDENT_IS_SEARCHING_FOR: list(targetRoles, 10),
  };
  const reply = await chat({
    system: `You assess a student's skills for a job search in Germany. From the data, build a radar: 5 to 8 axes, each a skill field that matters for the roles they search for (for example Backend development, Cloud and DevOps, Databases, Security, Testing, Languages). Score each axis 0-100 on the evidence in the data only: 0-30 little or none, 31-60 some, 61-85 solid, 86-100 strong with several projects or roles behind it. Never invent experience.
For each axis add a short "evidence" phrase naming what backs the score. Then list "strengths" (up to 5), "weaknesses" (up to 5, tied to the searched roles and the skills adverts ask for), and "advice" (up to 5 concrete next steps).
Answer shape: {"axes":[{"label","score","evidence"}],"strengths":[],"weaknesses":[],"advice":[]}`,
    user: JSON.stringify(input),
    schema: AnalysisSchema,
  });
  return {
    axes: reply.axes.slice(0, 8).map((a) => ({ label: clip(a.label, 40), score: Math.max(0, Math.min(100, Math.round(a.score))), evidence: clip(a.evidence, 160) })),
    strengths: reply.strengths.slice(0, 5).map((s) => clip(s, 200)),
    weaknesses: reply.weaknesses.slice(0, 5).map((s) => clip(s, 200)),
    advice: reply.advice.slice(0, 5).map((s) => clip(s, 200)),
  };
}

// ------------------------------------------------------------ scoring

const ScoresSchema = z.object({
  scores: z.array(z.object({
    n: z.number(),
    score: z.number(),
    reason: z.string().default(""),
    missing: z.string().default(""),
  })).default([]),
});

const BATCH = 5;
export const MAX_SCORED = 30;

/** Scores by posting URL for the postings it could score; `error` is set if it stopped early. */
export async function scoreJobs({ jobs, chat = chatJson, student = readStudent }) {
  const scores = new Map();
  let error = "";
  const data = student();
  const slice = jobs.slice(0, MAX_SCORED);
  for (let start = 0; start < slice.length; start += BATCH) {
    const batch = slice.slice(start, start + BATCH);
    let reply;
    try { reply = await chat({
      system: `You compare job postings with one student's real background and score the fit from 0 to 100.
- Score only on the student's actual skills and experience in STUDENT_DATA. Never assume skills they do not list.
- A posting that asks for skills the student lacks scores lower; list those in "missing" as a short comma-separated string.
- "reason" is one plain sentence (under 200 characters) naming what matches.
- Do not judge visa, eligibility or hiring odds.
Answer shape: {"scores": [{"n": <posting number>, "score": 0-100, "reason": "...", "missing": "..."}]}`,
      user: JSON.stringify({
        STUDENT_DATA: data,
        POSTINGS: batch.map((job, n) => ({ n, title: job.title, company: job.company, location: job.location, requirements: clip(job.req_skills, 800), description: clip(job.description || job.snippet, 1500) })),
      }),
      schema: ScoresSchema,
    }); } catch (e) { error = e.message; break; }
    for (const item of reply.scores) {
      const job = batch[item.n];
      if (!job || !Number.isFinite(item.score)) continue;
      scores.set(job.url, { score: Math.max(0, Math.min(100, Math.round(item.score))), reason: clip(item.reason, 300) || "AI comparison with your profile files.", missing: clip(item.missing, 300) });
    }
  }
  return { scores, error };
}
