#!/usr/bin/env node
/**
 * Local editor server. Never deployed, never reachable from the internet.
 *
 *   npm run editor
 *
 * Builds the site, serves it on http://localhost:8081, and adds three routes
 * the published site does not have:
 *
 *   GET  __editor/status   is the helper running, and is an API key configured
 *   POST __editor/save     write data/*.json and the images, then rebuild
 *   POST __editor/extract  read an uploaded certificate with Claude
 *   POST __editor/skills   list the skills a pasted job advert asks for
 *   GET  __editor/tracker  the rows in data/applications.csv
 *   POST __editor/tracker  append one row to data/applications.csv
 *   POST __editor/run      run one of four named npm scripts (see TASKS)
 *
 * The API key is read from .env here, in Node, so it never reaches the browser.
 * It binds to 127.0.0.1 only, and lib/local-guard.mjs refuses what other web pages in the browser could still send it:
 * requests addressed to another host name (DNS rebinding), methods other than GET and POST, another site's POST, and
 * any /__editor/ request another site started.
 */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual, promisify } from "node:util";

import Eleventy from "@11ty/eleventy";
import { z } from "zod";

import { applyPayload } from "../lib/apply-data.mjs";
import { ROOT, readJson } from "../lib/content.mjs";
import { refusal } from "../lib/local-guard.mjs";
import {
  Anthropic,
  DEFAULT_MODEL,
  buildSourceBlock,
  extractCertificate,
  loadEnv,
} from "../lib/extract-certificate.mjs";
import { checkCredits } from "../lib/credits.mjs";
import { extractAdSkills } from "../lib/extract-skills.mjs";
import { resolveSite } from "../lib/site.mjs";
import { buildApplyPack } from "../lib/apply-pack.mjs";
import { SCHEMA, jobMatchKey } from "../lib/tracker.mjs";
import { getApplicationCapabilities, runBrowserApplication } from "../lib/job-search.mjs";
import { engineDir, enginePython, searchWithEngine } from "../lib/engine-search.mjs";
import { readField, searchPlan } from "../lib/search-focus.mjs";
import { searchIndeed } from "../lib/indeed-agent.mjs";
import { searchApify } from "../lib/apify-agent.mjs";
import { searchNim } from "../lib/nim-agent.mjs";
import { findCompanySites } from "../lib/company-site.mjs";
import { applyAssignments, decideApplicants } from "../lib/assign-applicant.mjs";
import { runLocalApplication } from "../lib/local-browser.mjs";
import { draftEmail, emailRecipient, gmailConfig, sendApplicationEmail, smtpConfig } from "../lib/send-email.mjs";
import { readApplicationWorkbook, saveApplicationWorkbook } from "../lib/application-workbook.mjs";
import { NEW_DAYS, applicationRoute, applicationTarget, assistantQueue, knownAddress, mergeSearchResults, newEligible } from "../lib/application-flow.mjs";
import { readSettings, saveSettings } from "../lib/env-settings.mjs";
import { chatJson, geminiConfig, llmConfig, llmOverview, llmStatus } from "../lib/llm.mjs";
import { readConfig as mailReadConfig } from "../lib/gmail-read.mjs";
import { applyProposals, candidates as mailCandidates, mailQuery, logMail, markProcessed, readLog as readMailLog, readState as readMailState, tally as tallyMail, validate as validateMail } from "../lib/mail-sync.mjs";
import { readWithAgy, readWithClaude, readWithGemini } from "../lib/mail-readers.mjs";
import { agyJson, agyModel, agyStatus } from "../lib/agy.mjs";
import { analyseSkills, scoreJobs } from "../lib/profile-ai.mjs";
import { hasStudentFiles, readStudent, TAILORED_DIRS, tailoredPaths } from "../lib/student-files.mjs";
import { slug, tailorDocuments } from "../lib/tailor-docs.mjs";

const execFileAsync = promisify(execFile);

/**
 * The only commands the workspace can start. A fixed map, not a string the
 * browser supplies: the page names a key, the server decides what that means.
 * All four are deterministic, read data/ and write generated files — none of
 * them touch the network or call a model.
 */
const TASKS = {
  profile: ["run", "profile"],
  tracker: ["run", "tracker"],
  skills: ["run", "skills:harvest"],
  build: ["run", "build"],
  "build:static": ["run", "build:static"],
  clean: ["run", "clean"],
  "add-cert": ["run", "add-cert"],
  "import-data": ["run", "import-data", "--", "src/assets/Student-data/student.json"],
  "make-samples": ["run", "make-samples"],
  "skills:import": ["run", "skills:import"],
  "profile:check": ["run", "profile:check"]
};

const PORT = Number(process.env.EDITOR_PORT || 8081);
const HOST = "127.0.0.1";
const OUTPUT_DIR = path.join(ROOT, "_site");
const MAX_BODY_BYTES = 64 * 1024 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
loadEnv();

const site = resolveSite();
const prefix = site.pathPrefix; // e.g. "/CareerToAI/"

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

async function build() {
  // The editor is served from the built output, so a rebuild after each save
  // is what makes the change visible without restarting anything.
  const eleventy = new Eleventy();
  await eleventy.write();
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const sendJson = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large. Remove or shrink an attached image."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(new Error(`Body was not valid JSON: ${error.message}`));
      }
    });
    req.on("error", reject);
  });
}

/** Resolve a URL path to a file inside `root` (_site by default), refusing anything that escapes it. */
function resolveStatic(pathname) {
  const decoded = decodeURIComponent(pathname);
  const candidate = path.resolve(OUTPUT_DIR, `.${decoded}`);
  if (candidate !== OUTPUT_DIR && !candidate.startsWith(OUTPUT_DIR + path.sep)) return null;

  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    const index = path.join(candidate, "index.html");
    return fs.existsSync(index) ? index : null;
  }
  return fs.existsSync(candidate) ? candidate : null;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

async function handleSave(req, res) {
  const payload = await readBody(req);
  const result = await applyPayload(payload);
  await build();
  console.log(
    `  saved — ${result.counts.experience} role(s), ${result.counts.projects} project(s), ` +
    `${result.counts.certificates} certificate(s), ${result.images} image(s)`
  );
  sendJson(res, 200, result);
}

async function handleExtract(req, res) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return sendJson(res, 400, {
      error: "ANTHROPIC_API_KEY is not set. Add it to .env and restart `npm run editor`.",
    });
  }

  const { dataUrl, type } = await readBody(req);
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl || ""));
  if (!match) return sendJson(res, 400, { error: "No readable file was sent." });

  const buffer = Buffer.from(match[3], "base64");
  const source = await buildSourceBlock(buffer, type || match[1] || "image/jpeg");

  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  console.log(`  extracting with ${model}…`);
  const fields = await extractCertificate({ client, model, source });

  sendJson(res, 200, { fields });
}

async function handleSkills(req, res) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return sendJson(res, 400, {
      error: "ANTHROPIC_API_KEY is not set. Add it to .env and restart `npm run editor`.",
    });
  }

  const { text } = await readBody(req);
  if (!String(text || "").trim()) {
    return sendJson(res, 400, { error: "Paste the advertisement text first." });
  }

  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  console.log(`  reading an advert with ${model}…`);
  const result = await extractAdSkills({ client, model, text });
  console.log(`  found ${result.skills.length} skill(s)`);

  sendJson(res, 200, result);
}


// One local workflow writes the workbook at a time. Excel edits are guarded by revision.
let runningFlow = null;
let pendingPreview = null;
let capabilitiesCache = null;
let capabilitiesChecked = 0;
const conflict = (message) => Object.assign(new Error(message), { statusCode: 409 });
async function withWorkflow(name, action) {
  if (runningFlow) throw conflict(`The ${runningFlow} flow is still running. Wait for it to finish.`);
  runningFlow = name;
  try { return await action(); } finally { runningFlow = null; }
}
// For a long background task's short write at the end (the search's new rows, the approved mail changes): wait for the
// flow that holds the workbook instead of failing, so the student can keep applying or saving while a search or an email
// check runs. Leaving the loop and taking the lock happen in one turn of the event loop, so two waiters cannot both get it.
async function whenFree(name, action, { wait = 15 * 60_000 } = {}) {
  const until = Date.now() + wait;
  while (runningFlow) {
    if (Date.now() > until) throw conflict(`The ${runningFlow} flow is still running. Try again when it has finished.`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return withWorkflow(name, action);
}

// What the background tasks are doing, for the page's task tray (GET /__editor/progress). Counts and stages only, never e-mail text.
const progress = { search: null, mail: null };
const track = (kind, fields) => { progress[kind] = { ...progress[kind], ...fields, updated: Date.now() }; };

async function handleApplicationsRead(res) {
  sendJson(res, 200, await readApplicationWorkbook());
}

async function handleApplicationsWrite(req, res) {
  const { rows, revision } = await readBody(req);
  const snapshot = await withWorkflow('save', () => saveApplicationWorkbook(rows, { revision }));
  sendJson(res, 200, { ok: true, ...snapshot });
}

// What each search source needs, for the page to show before anything is spent. Claude's connectors cannot be checked
// without running them, so that source is always offered and a failure shows up as a warning.
const searchSources = () => ({ claude: true, nim: Boolean(process.env.NVIDIA_API_KEY), apis: Boolean(enginePython(engineDir())) });

// GET /__editor/search-plan?mode=profile|global: the words a search would use, with no AI call and no search.
async function handleSearchPlan(req, res) {
  const mode = new URL(req.url, `http://${HOST}`).searchParams.get('mode') === 'global' ? 'global' : 'profile';
  const field = readField();
  const plan = field || mode === 'global' ? await searchPlan({ mode, field, ai: false }) : null;
  sendJson(res, 200, { ok: true, mode, field, available: searchSources(), plan: plan && { label: plan.label, matched: plan.matched, keywords: plan.engineKeywords, searches: plan.indeedSearches.map((item) => item.search) } });
}

async function handleSearch(req, res) {
  const { useProfile, mode = 'profile', sources = {} } = await readBody(req);
  if (!['profile', 'global'].includes(mode)) return sendJson(res, 400, { error: 'Choose a search by your major (profile) or a global search.' });
  const use = { claude: sources.claude !== false, nim: sources.nim !== false, apis: sources.apis !== false };
  if (!Object.values(use).some(Boolean)) return sendJson(res, 400, { error: 'Choose at least one search source.' });
  if (useProfile && !llmConfig()) return sendJson(res, 400, { error: 'Set up an AI provider in .env to score jobs with your profile files.' });
  if (useProfile && !hasStudentFiles()) return sendJson(res, 400, { error: 'Upload student.json and both base documents in the editor first.' });
  if (progress.search?.running) return sendJson(res, 409, { error: 'A search is already running. Its progress is in the top-right corner.' });
  track('search', { running: true, started: Date.now(), stage: 'Planning the search', sources: {}, error: '' });
  try {
    const plan = await searchPlan({ mode }); // the major's words (or every field's); fails with a clear message when the profile has no field of study
    track('search', { stage: `Searching for ${plan.label.toLowerCase()}` });
    // The student chooses the sources. The JobSearchEngine decides what each free source permits; this page never searches or
    // opens job sites itself. Indeed comes through the student's Claude connector (lib/indeed-agent.mjs) and
    // StepStone/Arbeitsagentur through Claude's Apify connector: those two are Claude's, they need its connectors.
    // Everything an NVIDIA NIM model can reach through plain search APIs (LinkedIn and the other boards) goes to it instead
    // (lib/nim-agent.mjs), so Claude spends no tokens there. Any may fail alone; that is a warning.
    const tasks = [
      use.apis && ['apis', 'Free job sources', searchWithEngine({ days: NEW_DAYS, keywords: plan.engineKeywords })],
      use.claude && ['claude', 'Indeed', searchIndeed({ days: NEW_DAYS, searches: plan.indeedSearches })],
      use.claude && ['claude', 'Apify', searchApify({ days: NEW_DAYS, searches: plan.apifySearches })],
      use.nim && ['nim', 'NVIDIA NIM', searchNim({ days: NEW_DAYS, plan, isKnown: knownAddress((await readApplicationWorkbook()).rows) })],
    ].filter(Boolean);
    const sources = Object.fromEntries(tasks.map(([, name]) => [name, 'searching…']));
    track('search', { sources });
    const settled = await Promise.allSettled(tasks.map(([, name, promise]) => promise.then(
      (value) => { sources[name] = `${value.jobs.length} found`; track('search', { sources }); return value; },
      (error) => { sources[name] = 'failed'; track('search', { sources }); throw error; },
    )));
    if (settled.every((r) => r.status === 'rejected')) throw settled[0].reason;
    const result = { jobs: [], warnings: [] };
    const bySource = {};
    settled.forEach((r, i) => {
      const [group, name] = tasks[i];
      if (r.status === 'rejected') return result.warnings.push(`${name} was not searched: ${r.reason.message}`);
      result.jobs.push(...r.value.jobs);
      result.warnings.push(...r.value.warnings);
      bySource[group] = (bySource[group] || 0) + r.value.jobs.length;
    });
    // Only what is new and can count for the German Year goes on, so AI scoring is spent on those alone. Every field is taken
    // (the search is already about the student's major or about everything) and no posting is dropped for a low Fit.
    const { jobs, skipped } = newEligible(result.jobs, (await readApplicationWorkbook()).rows, { field: null });
    track('search', { stage: `${jobs.length} new posting${jobs.length === 1 ? '' : 's'} passed the checks`, found: result.jobs.length, fresh: jobs.length });
    if (useProfile && jobs.length) {
      track('search', { stage: `AI is scoring ${jobs.length} new posting${jobs.length === 1 ? '' : 's'} against your files` });
      // Optional and best-effort: any failure keeps the built-in score and says so.
      try {
        const { scores, error } = await scoreJobs({ jobs });
        for (const job of jobs) if (scores.has(job.url)) job.match = scores.get(job.url);
        result.warnings.push(error ? `AI scoring stopped early: ${error}` : `AI scored ${scores.size} of ${jobs.length} new postings against your files.`);
      } catch (error) {
        result.warnings.push(`AI scoring was skipped: ${error.message}`);
      }
    }
    // A company with no logo and no website gets its website looked up by name (Exa), so the table can show its icon.
    const unplaced = jobs.filter((job) => job.company && !job.website && !job.logo_url);
    if (unplaced.length) {
      track('search', { stage: `Looking up ${unplaced.length} company website${unplaced.length === 1 ? '' : 's'}` });
      const { sites, error } = await findCompanySites(unplaced.map((job) => job.company));
      for (const job of unplaced) if (sites[job.company]) job.website = sites[job.company];
      if (error && error !== 'no Exa key') result.warnings.push(`Company websites were not all looked up: ${error}`);
    }
    const left = [[skipped.known, 'already in your workbook'], [skipped.undated, 'without a posting date'], [skipped.old, `posted more than ${NEW_DAYS} days ago`],
      [skipped.ineligible, 'not internships or failing the GJU rules']].filter(([count]) => count);
    if (left.length) result.warnings.push(`Left out: ${left.map(([count, why]) => `${count} ${why}`).join(', ')}.`);
    // Read after the network calls, and only once nothing else holds the workbook, so edits saved during the search are kept.
    track('search', { stage: 'Saving to your workbook' });
    const merged = await whenFree('search', async () => {
      const snapshot = await readApplicationWorkbook();
      const result = mergeSearchResults(snapshot.rows, jobs, { scoring: { keepLow: true, words: [...plan.de, ...plan.en], skills: plan.skills } });
      if (jobs.length) await saveApplicationWorkbook(result.rows, { revision: snapshot.revision });
      return result;
    });
    const { Meets = 0, Check = 0 } = merged.gju;
    if (merged.added) result.warnings.push(`GJU check of the ${merged.added} new jobs: meets the rules ${Meets}, check by hand ${Check}.`);
    track('search', { running: false, stage: 'Done', added: merged.added });
    sendJson(res, 200, { ok: true, found: result.jobs.length, added: merged.added, unverified: jobs.filter((job) => job.verified === false).length, rows: merged.rows.length, bySource, plan: { mode, label: plan.label }, warnings: result.warnings });
  } catch (error) {
    track('search', { running: false, stage: 'Failed', error: error.message });
    throw error;
  }
}

async function handleSettings(req, res) {
  if (req.method === "POST") {
    const { changes } = await readBody(req);
    const count = saveSettings(changes);
    capabilitiesCache = null; // the browser-tool check depends on the keys
    console.log(`  saved ${count} setting(s) to .env`);
  }
  sendJson(res, 200, { ok: true, fields: readSettings(), llm: llmStatus() });
}

// The Gemini card's test: one locked-down agy run (about 25 s) that only asks for {"ok": true}. It proves the Pro subscription answers.
async function handleGeminiTest(res) {
  const agy = await agyState(true);
  if (!agy.found) return sendJson(res, 400, { error: 'agy (the Antigravity CLI) was not found. Install it and sign in once by running agy in a terminal.' });
  if (!agy.signedIn) return sendJson(res, 400, { error: 'agy is not signed in. Run agy in a terminal and sign in with your Google account.' });
  const started = Date.now();
  await agyJson({ system: 'You are a connection test.', user: 'Reply with {"ok": true}.', schema: z.object({ ok: z.boolean() }) });
  sendJson(res, 200, { ok: true, model: agyModel(), seconds: Math.round((Date.now() - started) / 100) / 10 });
}

async function handleLlmTest(res) {
  const config = llmConfig();
  if (!config) return sendJson(res, 400, { error: "Choose an AI provider and save its key first." });
  await chatJson({ system: 'Reply with {"ok": true}.', user: "ping", schema: z.object({ ok: z.boolean() }), config });
  sendJson(res, 200, { ok: true, provider: config.provider, model: config.model });
}

// Rates the skills the editor holds (it may hold unsaved edits) with the configured AI provider.
// The last analysis is kept in data/skills-analysis.json (gitignored) so it is still there the next time the page opens.
const ANALYSIS_FILE = path.join(ROOT, "data", "skills-analysis.json");

async function handleSkillsAnalysis(req, res) {
  if (req.method === "GET") {
    return sendJson(res, 200, { ok: true, saved: fs.existsSync(ANALYSIS_FILE) ? readJson(ANALYSIS_FILE) : null });
  }
  if (!llmConfig()) return sendJson(res, 400, { error: "Set up an AI provider in .env (see API keys & AI provider in the workspace)." });
  const { profile } = await readBody(req);
  // The skills are rated for the student's own major (the words of lib/search-focus.mjs), not for IT in general.
  const focus = await searchPlan({ mode: "profile", ai: false }).catch(() => null);
  const target = focus ? `Internships (Pflichtpraktikum) in Germany for a student of ${focus.label.replace(/ internships$/, "")}: ${[...focus.de, ...focus.en].slice(0, 8).join(", ")}` : "Any internship (Pflichtpraktikum) in Germany";
  const result = await analyseSkills({ profile, targetRoles: [target] });
  const saved = { generatedAt: new Date().toISOString(), provider: llmConfig().provider, model: llmConfig().model, ...result };
  fs.writeFileSync(ANALYSIS_FILE, JSON.stringify(saved, null, 2) + "\n");
  sendJson(res, 200, { ok: true, ...saved });
}

async function handleAssignApplicant(req, res) {
  const { ids } = await readBody(req);
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string') || ids.length > 500) return sendJson(res, 400, { error: 'Send the ids of the rows you filtered.' });
  if (!llmConfig()) return sendJson(res, 400, { error: 'Set up an AI provider in .env so the assistant can read the applications.' });
  await withWorkflow('assign', async () => {
    const snapshot = await readApplicationWorkbook();
    // The model call can take a while; the revision check below refuses to overwrite edits made meanwhile.
    const { assign, keep } = await decideApplicants(snapshot.rows, ids);
    if (assign.length) await saveApplicationWorkbook(applyAssignments(snapshot.rows, assign), { revision: snapshot.revision });
    const label = (id) => { const row = snapshot.rows.find((item) => item.id === id) || {}; return { id, company: row.company || '', position: row.position || '' }; };
    sendJson(res, 200, { ok: true, assigned: assign.map((a) => ({ ...label(a.id), reason: a.reason })), kept: keep.map((k) => ({ ...label(k.id), reason: k.reason })) });
  });
}

async function handleTailor(req, res) {
  const { id } = await readBody(req);
  if (!llmConfig()) return sendJson(res, 400, { error: 'Set up an AI provider in .env to tailor your documents.' });
  if (!hasStudentFiles()) return sendJson(res, 400, { error: 'Upload student.json and both base documents in the editor first.' });
  const row = (await readApplicationWorkbook()).rows.find((item) => item.id === id);
  if (!row) return sendJson(res, 404, { error: 'That job is no longer in the workbook.' });

  // The model call can take minutes, so the workbook lock is taken only to record the result.
  const made = await tailorDocuments({ row, student: readStudent() });
  const name = `${slug(row.company)}_${slug(row.position)}_${new Date().toISOString().slice(0, 10)}`;
  const files = { cv: `${name}_cv.docx`, cl: `${name}_cl.docx` };
  for (const dir of TAILORED_DIRS) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, files.cv), made.cv);
    fs.writeFileSync(path.join(dir, files.cl), made.cl);
  }
  const served = { cv: `assets/Student-data/tailored/${files.cv}`, cl: `assets/Student-data/tailored/${files.cl}` };
  await withWorkflow('tailor', async () => {
    const snapshot = await readApplicationWorkbook();
    const current = snapshot.rows.find((item) => item.id === id);
    if (!current) throw conflict('The job was removed while its documents were being written. The files were still saved.');
    Object.assign(current, { cv_file: served.cv, cl_file: served.cl, tailored: 'Yes' });
    await saveApplicationWorkbook(snapshot.rows, { revision: snapshot.revision });
  });
  console.log(`  tailored documents for ${row.company || 'a job'}`);
  sendJson(res, 200, { ok: true, files: served, stats: made.stats, unfilled: made.unfilled });
}

const readData = (name) => { const file = path.join(ROOT, 'data', `${name}.json`); return fs.existsSync(file) ? readJson(file) : {}; };
// data/profile-private.json is gitignored: contact details (phone) the applications need but nothing published may carry.
const readExtras = () => ({ ...readData('profile-extras'), ...readData('profile-private') });

function handleApplyPack(res) {
  sendJson(res, 200, { fields: buildApplyPack(readData('profile'), readExtras()) });
}

async function handleApplyPreview(res) {
  const snapshot = await readApplicationWorkbook();
  const eligible = assistantQueue(snapshot.rows);
  const profile = Object.fromEntries(['profile', 'experience', 'projects'].map((name) => [name, readData(name)]));
  const drafts = new Map();
  // One model call per email row, in parallel (at most 15). A failed call leaves the template, never an error.
  const rows = await Promise.all(eligible.slice(0, 15).map(async (row) => {
    const route = applicationRoute(row);
    const files = tailoredPaths(row);
    let email;
    if (route === 'email') {
      email = await draftEmail(row, profile);
      drafts.set(row.id, { subject: email.subject, body: email.body });
      email = { to: emailRecipient(row), ...email };
    }
    return {
      id: row.id, company: row.company, position: row.position, url: row.app_url || row.job_url, method: row.app_method, route,
      attachments: Object.values(files).map((file) => path.basename(file)), email,
    };
  }));
  pendingPreview = {
    token: randomUUID(), revision: snapshot.revision, ids: rows.map((row) => row.id),
    approvedRows: new Map(eligible.slice(0, 15).map((row) => [row.id, structuredClone(row)])),
    drafts, expires: Date.now() + 10 * 60_000,
  };
  sendJson(res, 200, { count: rows.length, remaining: Math.max(0, eligible.length - rows.length), first: rows[0] || null, rows, confirmation: pendingPreview.token, batchLimit: 15 });
}

// ---------------------------------------------------------------------------
// Check my email: a reader (Claude's Gmail connector or Gemini) proposes status changes, the student approves, only then
// does anything reach the workbook. Same shape as the application preview: the server keeps the proposals, the browser
// only sends back the token and which ones were approved. The reading runs outside the workbook lock, so the page stays usable.
// ---------------------------------------------------------------------------
let pendingMail = null;
const berlinToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });

// Is agy (the Antigravity CLI, Gemini through the student's Pro subscription) installed and signed in? Asking Google takes a second, so it is kept for a minute.
let agyCache = null;
let agyChecked = 0;
async function agyState(fresh = false) {
  if (fresh || !agyCache || Date.now() - agyChecked > 60_000) { agyChecked = Date.now(); agyCache = await agyStatus(); }
  return agyCache;
}

// GET /__editor/mail: which readers can run. Only whether a key or token exists, never its value.
async function handleMailStatus(res) {
  sendJson(res, 200, { claude: true, gemini: { key: Boolean(geminiConfig()), gmail: Boolean(mailReadConfig()) }, agy: { ...(await agyState()), gmail: Boolean(mailReadConfig()) }, lastSync: readMailState().last_sync });
}

const NEEDS_MAIL_TOKEN = 'Gemini reads your mail through a read-only Gmail permission. In a terminal run: node scripts/gmail-auth.mjs --read';

async function handleMailScan(req, res) {
  const { reader, confirmed } = await readBody(req);
  if (!['claude', 'gemini', 'agy'].includes(reader)) return sendJson(res, 400, { error: 'Choose Claude or Gemini to read your email.' });
  if (reader === 'gemini') {
    if (!geminiConfig()) return sendJson(res, 400, { error: 'Add GEMINI_API_KEY under API keys & AI provider first.' });
    if (!mailReadConfig()) return sendJson(res, 400, { error: NEEDS_MAIL_TOKEN });
    if (confirmed !== true) return sendJson(res, 400, { error: 'Confirm that your Gemini key is on a paid plan. On the free tier Google may read what it receives, and this sends your e-mails.' });
  }
  if (reader === 'agy') {
    const agy = await agyState(true);
    if (!agy.found) return sendJson(res, 400, { error: 'agy (the Antigravity CLI) was not found. Install it and sign in once by running agy in a terminal.' });
    if (!agy.signedIn) return sendJson(res, 400, { error: 'agy is not signed in. Run agy in a terminal, sign in with your Google account, then try again.' });
    if (!mailReadConfig()) return sendJson(res, 400, { error: NEEDS_MAIL_TOKEN });
  }
  if (progress.mail?.running) return sendJson(res, 409, { error: 'An email check is already running. Its progress is in the top-right corner.' });
  const name = { claude: 'Claude', gemini: 'Gemini', agy: 'Gemini (agy)' }[reader];
  track('mail', { running: true, started: Date.now(), reader: name, stage: reader === 'claude' ? 'Claude is searching and reading your Gmail' : 'Searching your Gmail', read: 0, listed: 0, batch: 0, batches: 0, spotted: {}, counts: null, error: '' });
  try {
    // Reading the workbook needs no lock: the approval checks each row's status again before it writes.
    const snapshot = await readApplicationWorkbook();
    const list = mailCandidates(snapshot.rows);
    const state = readMailState();
    const skip = new Set(state.processed_message_ids);
    const query = mailQuery(list, { lastSync: state.last_sync });
    const read = reader === 'claude'
      ? await readWithClaude({ candidates: list, query })
      : reader === 'agy'
        ? await readWithAgy({ candidates: list, query, skip, mail: mailReadConfig(), onProgress: (fields) => track('mail', fields) })
        : await readWithGemini({ candidates: list, query, skip, mail: mailReadConfig(), onProgress: (fields) => track('mail', fields) });
    const checked = validateMail({ findings: read.findings, documents: read.documents, rows: list, skip });
    // Gemini covered every message it fetched. Claude's connector shows no id list we can trust, so only e-mails it proposed from count.
    const scanned = read.scanned.length ? read.scanned : checked.proposals.map((proposal) => proposal.messageId);
    // An hour to review: the student may be busy applying when the check finishes.
    pendingMail = { token: randomUUID(), proposals: new Map(checked.proposals.map((proposal) => [proposal.rowId, proposal])), scanned, expires: Date.now() + 60 * 60_000 };
    track('mail', { running: false, stage: 'Done', read: read.scanned.length || progress.mail.read, counts: tallyMail(checked.proposals), proposals: checked.proposals.length });
    sendJson(res, 200, { confirmation: pendingMail.token, reader, proposals: checked.proposals, counts: tallyMail(checked.proposals), read: read.scanned.length, review: checked.review, dropped: checked.dropped, candidates: list.length, warnings: read.warnings });
  } catch (error) {
    track('mail', { running: false, stage: 'Failed', error: error.message });
    throw error;
  }
}

// POST /__editor/mail/apply { confirmation, accept: [rowId, ...] }. An empty list is "none of these": the e-mails are still marked as seen.
async function handleMailApply(req, res) {
  const { confirmation, accept } = await readBody(req);
  if (!Array.isArray(accept) || !accept.every((id) => typeof id === 'string')) return sendJson(res, 400, { error: 'Send the rows you approved.' });
  // Waits for whatever holds the workbook (an application being sent, a save). A row whose status moved since the check is left alone (stale).
  await whenFree('mail', async () => {
    const snapshot = await readApplicationWorkbook();
    const pending = pendingMail;
    if (!pending || pending.token !== confirmation || pending.expires < Date.now()) {
      return sendJson(res, 409, { error: 'The email check expired. Check your email again.' });
    }
    pendingMail = null;
    const chosen = accept.map((id) => pending.proposals.get(id)).filter(Boolean);
    const done = applyProposals(snapshot.rows, chosen, berlinToday());
    if (done.applied.length) await saveApplicationWorkbook(done.rows, { revision: snapshot.revision });
    markProcessed(pending.scanned, berlinToday());
    logMail([...pending.proposals.values()].map((proposal) => ({ proposal, decision: proposal.untracked ? (chosen.includes(proposal) ? 'kept' : 'skipped') : done.applied.includes(proposal) ? 'applied' : done.stale.includes(proposal) ? 'stale' : 'skipped' })), berlinToday()); // the text of the e-mails that mattered, kept locally on purpose
    sendJson(res, 200, { ok: true, applied: done.applied.length, kept: chosen.filter((proposal) => proposal.untracked).length, counts: tallyMail([...done.applied, ...chosen.filter((proposal) => proposal.untracked)]), stale: done.stale.length, skipped: pending.proposals.size - chosen.length });
  });
}

async function handleApply(req, res) {
  const { confirmation, edits, fillOnly } = await readBody(req);
  await withWorkflow('apply', async () => {
    const snapshot = await readApplicationWorkbook();
    if (!pendingPreview || pendingPreview.token !== confirmation || pendingPreview.expires < Date.now() || pendingPreview.revision !== snapshot.revision) {
      return sendJson(res, 409, { error: 'The application preview expired or the workbook changed. Review the selected jobs again before submitting.' });
    }
    const ids = pendingPreview.ids;
    const approvedRows = pendingPreview.approvedRows;
    const drafts = pendingPreview.drafts;
    pendingPreview = null;
    const profile = Object.fromEntries(['profile', 'experience', 'projects', 'certificates'].map((name) => [name, readData(name)]));
    profile['profile-extras'] = readExtras();
    const counts = { submitted: 0, needsInput: 0, blocked: 0, attempted: 0, skipped: 0, notRun: 0, filled: 0 };
    let nextBrowserAt = 0;
    for (const id of ids) {
      let current = await readApplicationWorkbook();
      let row = assistantQueue(current.rows).find((item) => item.id === id);
      // Excel can change between submissions: approval covers only the previewed row.
      if (!row || !isDeepStrictEqual(row, approvedRows.get(id))) {
        counts.skipped++;
        continue;
      }
      const target = applicationTarget(row);
      const route = applicationRoute(row);
      // Fill-only is for the local browser alone: nothing is sent or submitted, so e-mail and remote-browser jobs wait.
      if (fillOnly === true && route !== 'upload') { counts.notRun++; continue; }
      let outcome;
      if (target.kind === 'missing') {
        outcome = { status: 'Needs input', evidence: 'Add a valid application URL, or the employer e-mail address.' };
      } else if (!profile.profile.email) {
        outcome = { status: 'Needs input', evidence: 'Add your contact email in the profile editor before applying.' };
      } else {
        const wait = route === 'email' ? 0 : nextBrowserAt - Date.now();
        if (wait > 0) {
          await delay(wait);
          current = await readApplicationWorkbook();
          row = assistantQueue(current.rows).find((item) => item.id === id);
          if (!row || !isDeepStrictEqual(row, approvedRows.get(id))) {
            counts.skipped++;
            continue;
          }
        }
        // Persist before an external submission: interruption must never cause an automatic retry.
        row.assistant_state = 'Needs input';
        row.notes = [row.notes, 'Assistant application started. If interrupted, check the portal before clearing Assistant state and retrying.'].filter(Boolean).join('\n');
        await saveApplicationWorkbook(current.rows, { revision: current.revision });
        try {
          if (route === 'email') {
            // The subject and text the student saw (and may have edited) in the preview; nothing else is ever sent.
            const edit = { ...drafts?.get(id), ...edits?.[id] };
            outcome = await sendApplicationEmail(row, profile, { subject: typeof edit.subject === 'string' ? edit.subject : undefined, body: typeof edit.body === 'string' ? edit.body : undefined });
          } else outcome = await (route === 'upload' ? (r, p) => runLocalApplication(r, p, { fillOnly: fillOnly === true }) : runBrowserApplication)(row, profile);
        }
        catch { outcome = { status: 'Needs input', evidence: 'The application run stopped. Check the application portal or your Sent folder before retrying.' }; }
        finally { if (route !== 'email') nextBrowserAt = Date.now() + 30_000; }
      }
      counts.attempted++;
      const latest = await readApplicationWorkbook();
      const updated = latest.rows.find((item) => item.id === id);
      if (!updated) throw conflict('An application row was removed while its submission was running. Check the portal before retrying.');
      updated.status = outcome.status === 'Applied' ? 'Applied' : 'To apply';
      updated.assistant_state = outcome.status === 'Applied' ? '' : outcome.status === 'Blocked' ? 'Blocked' : 'Needs input';
      updated.notes = [updated.notes, `Assistant: ${String(outcome.evidence || 'No submission confirmation was returned.').slice(0, 2000)}`].filter(Boolean).join('\n');
      if (outcome.filledOnly) counts.filled++;
      if (updated.status === 'Applied') {
        updated.date_applied = new Date().toISOString().slice(0, 10);
        counts.submitted++;
      } else if (updated.assistant_state === 'Blocked') counts.blocked++;
      else counts.needsInput++;
      await saveApplicationWorkbook(latest.rows, { revision: latest.revision });
    }
    sendJson(res, 200, { ok: true, ...counts });
  });
}

async function handleRun(req, res) {
  const { task } = await readBody(req);
  if (typeof task !== 'string') return sendJson(res, 400, { error: 'Choose a workspace task.' });

  if (task.startsWith("/") || task === "serve" || task === "editor") {
    console.log(`  requested AI command: ${task}`);
    return sendJson(res, 200, { ok: true, output: `Command '${task}' triggered. Check your terminal.` });
  }

  if (task === 'tracker') {
    const saved = await withWorkflow('save', async () => {
      const snapshot = await readApplicationWorkbook();
      return saveApplicationWorkbook(snapshot.rows, { revision: snapshot.revision });
    });
    return sendJson(res, 200, { ok: true, code: 0, output: `Saved ${saved.rows.length} rows to ${saved.workbook}.` });
  }
  const args = Object.prototype.hasOwnProperty.call(TASKS, task) ? TASKS[task] : null;
  if (!args) {
    return sendJson(res, 400, { error: `Unknown task: ${task}` });
  }

  console.log(`  running npm ${args.join(" ")}…`);
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";

  try {
    const { stdout, stderr } = await execFileAsync(npm, args, {
      cwd: ROOT,
      timeout: 5 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
      // shell:true is required on Windows to resolve npm.cmd; the argument
      // list is a fixed constant above, never anything the browser sent.
      shell: process.platform === "win32",
    });
    sendJson(res, 200, { ok: true, code: 0, output: stdout, error: stderr });
  } catch (error) {
    sendJson(res, 200, {
      ok: false,
      code: error.code ?? 1,
      output: error.stdout || "",
      error: error.stderr || error.message,
    });
  }
}

async function handleTrackerRead(res) { return await handleApplicationsRead(res); }
async function handleTrackerWrite(req, res) {
  const { row } = await readBody(req);
  if (!row || !String(row.company || '').trim()) return sendJson(res, 400, { error: 'A row needs a company name.' });
  await withWorkflow('save', async () => {
    const snapshot = await readApplicationWorkbook();
    const key = jobMatchKey(row);
    const existing = key ? snapshot.rows.findIndex((item) => jobMatchKey(item) === key) : -1;
    if (existing >= 0) snapshot.rows[existing] = { ...snapshot.rows[existing], ...row };
    else snapshot.rows.push({ ...row, id: row.id || `job-${randomUUID()}`, applicant: row.applicant || 'Me', status: row.status || 'To apply' });
    const saved = await saveApplicationWorkbook(snapshot.rows, { revision: snapshot.revision });
    sendJson(res, 200, { ok: true, rows: saved.rows.length, updated: existing >= 0 });
  });
}

// The phone number: private, so it lives in the gitignored data/profile-private.json, never in the published profile.json.
async function handlePrivateProfile(req, res) {
  const file = path.join(ROOT, "data", "profile-private.json");
  const current = fs.existsSync(file) ? readJson(file) : {};
  if (req.method === "GET") return sendJson(res, 200, { ok: true, phone: String(current.phone || "") });
  const { phone } = await readBody(req);
  const value = String(phone ?? "").trim();
  if (value.length > 30 || /[^\d+\s().-]/.test(value)) {
    return sendJson(res, 400, { error: "A phone number may only hold digits, spaces and + ( ) . -" });
  }
  fs.writeFileSync(file, JSON.stringify({ ...current, phone: value }, null, 2) + "\n");
  sendJson(res, 200, { ok: true, phone: value });
}

async function handleStudentData(req, res) {
  const dir = path.join(ROOT, "src", "assets", "Student-data");
  if (req.method === "GET") {
    const studentJsonPath = path.join(dir, "student.json");
    let data = null;
    if (fs.existsSync(studentJsonPath)) {
      data = JSON.parse(fs.readFileSync(studentJsonPath, "utf8"));
    }
    const existingDocs = [];
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file !== "student.json" && !file.startsWith(".") && fs.statSync(path.join(dir, file)).isFile()) {
          existingDocs.push(file);
        }
      }
    }
    sendJson(res, 200, { ok: true, data, existingDocs });
  } else if (req.method === "POST") {
    const payload = await readBody(req);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    if (payload.data) {
      fs.writeFileSync(path.join(dir, "student.json"), JSON.stringify(payload.data, null, 2));
    }
    
    if (payload.files) {
      for (const [name, base64] of Object.entries(payload.files)) {
        if (!base64) continue;
        const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(base64);
        if (match) {
          fs.writeFileSync(path.join(dir, name), Buffer.from(match[3], "base64"));
        }
      }
    }
    await build();
    sendJson(res, 200, { ok: true });
  }
}

const server = http.createServer(async (req, res) => {
  let pathname = new URL(req.url, `http://${HOST}`).pathname;

  // The site is built with a path prefix; accept URLs with or without it so
  // the editor works whether you open /editor/ or /CareerToAI/editor/.
  if (prefix !== "/" && pathname.startsWith(prefix)) {
    pathname = "/" + pathname.slice(prefix.length);
  }

  try {
    const refused = refusal(req, pathname, PORT); // lib/local-guard.mjs: own address only, GET/POST, no other site's requests
    if (refused) return sendJson(res, refused.status, { error: refused.error });
    if (pathname === '/__editor/application-settings' && req.method === 'GET') {
      const profile = readJson(path.join(ROOT, 'data', 'profile.json'));
      return sendJson(res, 200, { candidateEmail: profile.email || '', emailSendingAvailable: false });
    }
    if (pathname === '/__editor/application-capabilities' && req.method === 'GET') {
      if (!capabilitiesCache || Date.now() - capabilitiesChecked > 300_000) {
        capabilitiesChecked = Date.now();
        capabilitiesCache = getApplicationCapabilities().catch(() => ({ browser: { available: false }, email: { available: false }, localFileUploads: false }));
      }
      // Email and local uploads are this server's own, so they are read fresh instead of from the 5-minute cache.
      return sendJson(res, 200, { ...(await capabilitiesCache), email: { available: Boolean(gmailConfig() || smtpConfig()), via: gmailConfig() ? "gmail" : smtpConfig() ? "smtp" : null }, localFileUploads: true });
    }
    if (pathname === "/__editor/credits" && req.method === "GET") {
      const [providers, agy] = await Promise.all([checkCredits(), agyState()]);
      return sendJson(res, 200, { providers, ai: llmOverview(), gemini: { agy, key: Boolean(geminiConfig()), mailToken: Boolean(mailReadConfig()) } });
    }
    if (pathname === "/__editor/status") {
      return sendJson(res, 200, { ok: true, hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY), llm: llmStatus(), studentFiles: hasStudentFiles() });
    }
    if (pathname === "/__editor/skills-analysis") return await handleSkillsAnalysis(req, res);
    if (pathname === "/__editor/private-profile") return await handlePrivateProfile(req, res);
    if (pathname === "/__editor/save" && req.method === "POST") return await handleSave(req, res);
    if (pathname === "/__editor/extract" && req.method === "POST") return await handleExtract(req, res);
    if (pathname === "/__editor/skills" && req.method === "POST") return await handleSkills(req, res);
    if (pathname === "/__editor/run" && req.method === "POST") return await handleRun(req, res);
    if (pathname === "/__editor/student-data") return await handleStudentData(req, res);
    if (pathname === "/__editor/search" && req.method === "POST") return await handleSearch(req, res);
    if (pathname === "/__editor/search-plan" && req.method === "GET") return await handleSearchPlan(req, res);
    if (pathname === "/__editor/settings") return await handleSettings(req, res);
    if (pathname === "/__editor/llm-test" && req.method === "POST") return await handleLlmTest(res);
    if (pathname === "/__editor/tailor" && req.method === "POST") return await handleTailor(req, res);
    if (pathname === "/__editor/assign-applicant" && req.method === "POST") return await handleAssignApplicant(req, res);
    if (pathname === "/__editor/apply-pack" && req.method === "GET") return handleApplyPack(res);
    if (pathname === "/__editor/apply-preview" && req.method === "GET") return await handleApplyPreview(res);
    if (pathname === "/__editor/apply" && req.method === "POST") return await handleApply(req, res);
    if (pathname === "/__editor/mail" && req.method === "GET") return await handleMailStatus(res);
    if (pathname === "/__editor/gemini-test" && req.method === "POST") return await handleGeminiTest(res);
    if (pathname === "/__editor/mail/scan" && req.method === "POST") return await handleMailScan(req, res);
    if (pathname === "/__editor/progress" && req.method === "GET") return sendJson(res, 200, progress);
    if (pathname === "/__editor/mail/log" && req.method === "GET") return sendJson(res, 200, { entries: readMailLog(), counts: tallyMail(readMailLog().filter((entry) => entry.decision === 'applied')) });
    if (pathname === "/__editor/mail/apply" && req.method === "POST") return await handleMailApply(req, res);
    if (pathname === "/__editor/applications") {
      if (req.method === "POST") return await handleApplicationsWrite(req, res);
      return await handleApplicationsRead(res);
    }
    if (pathname === "/__editor/excel") {
      const excelPath = path.join(ROOT, SCHEMA.workbook);
      if (fs.existsSync(excelPath)) {
        res.writeHead(200, {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Cache-Control": "no-store",
        });
        return fs.createReadStream(excelPath).pipe(res);
      }
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    if (pathname === "/__editor/tracker") {
      if (req.method === "POST") return await handleTrackerWrite(req, res);
      return await handleTrackerRead(res);
    }

    if (pathname === "/") {
      res.writeHead(302, { Location: `${prefix}workspace/` });
      return res.end();
    }

    const file = resolveStatic(pathname);
    if (!file) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }

    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(file).pipe(res);
  } catch (error) {
    console.error(`  ${error.message}`);
    sendJson(res, error.statusCode || error.status || 500, { error: error.message });
  }
});

console.log("Building the site…");
await build();

server.listen(PORT, HOST, () => {
  console.log(`
Old draft export: http://${HOST}:${PORT}${prefix}editor/
Workspace ready:  http://${HOST}:${PORT}${prefix}workspace/
Site preview:     http://${HOST}:${PORT}${prefix}

  Profile editor: serve ../GJUBoard and open editor.html.
  Import its JSON here with npm run import-data -- <file>.

Press Ctrl+C to stop.
`);
});



