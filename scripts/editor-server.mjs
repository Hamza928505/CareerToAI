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
import { getApplicationCapabilities } from "../lib/job-search.mjs";
import { engineDir, enginePython, searchWithEngine } from "../lib/engine-search.mjs";
import { readField, searchPlan } from "../lib/search-focus.mjs";
import { searchIndeed } from "../lib/indeed-agent.mjs";
import { searchApify } from "../lib/apify-agent.mjs";
import { searchNim } from "../lib/nim-agent.mjs";
import { findCompanySites } from "../lib/company-site.mjs";
import { applyAssignments, decideApplicants } from "../lib/assign-applicant.mjs";
import { applyOnWeb, providerStates, webProvider, PROVIDERS as APPLY_PROVIDERS } from "../lib/apply-providers.mjs";
import { draftEmail, emailRecipient, gmailConfig, sendApplicationEmail, smtpConfig } from "../lib/send-email.mjs";
import { readApplicationWorkbook, saveApplicationWorkbook } from "../lib/application-workbook.mjs";
import { NEW_DAYS, applicationRoute, applicationTarget, assistantQueue, knownAddress, mergeSearchResults, newEligible } from "../lib/application-flow.mjs";
import { readSettings, saveSettings } from "../lib/env-settings.mjs";
import { canTest, claudeConnectors, testIntegration } from "../lib/integration-tests.mjs";
import { SIZE_BANDS, normalizeCompany, readCompanies, sizeBand, upsertCompanies, writeCompanies } from "../lib/company-directory.mjs";
import { SOURCES as COMPANY_SOURCES, createReader, discoverCompanies, findCareers, findWebsite } from "../lib/company-discovery.mjs";
import { APIS as BOARD_APIS, boardSize, canSearch, companyJobs, searchCompanySites } from "../lib/company-jobs.mjs";
import { addCustomBoard, readCustomBoards, readRuns, recordRuns, removeCustomBoard } from "../lib/search-runs.mjs";
import { PRESETS, addServer, describeServers, removeServer, setEnabled } from "../lib/mcp-config.mjs";
import { chatJson, geminiConfig, llmConfig, llmOverview, llmStatus } from "../lib/llm.mjs";
import { readConfig as mailReadConfig } from "../lib/gmail-read.mjs";
import { applyProposals, candidates as mailCandidates, mailQuery, logMail, markProcessed, readLog as readMailLog, readState as readMailState, tally as tallyMail, validate as validateMail } from "../lib/mail-sync.mjs";
import { readWithAgy, readWithClaude, readWithGemini } from "../lib/mail-readers.mjs";
import { agyJson, agyModel, agyStatus } from "../lib/agy.mjs";
import { analyseSkills, scoreJobs } from "../lib/profile-ai.mjs";
import { hasStudentFiles, readProfileFile, readStudent, STUDENT_DIR, TAILORED_DIRS, tailoredPaths } from "../lib/student-files.mjs";
import { analyseDocument, getDocument, listDocuments, markDocument, readers as documentReaders, removeDocument, saveDocument } from "../lib/document-intake.mjs";
import { slug, tailorDocuments } from "../lib/tailor-docs.mjs";
import {
  evaluatePostings,
  generateDocumentsForPosting,
  getStudioState,
  readDocParagraphs,
  runAtsCheckOnPdf,
  saveEditedDoc,
  saveStudioSettings,
  studioDirs,
  tailorModel,
} from "../lib/internships-studio.mjs";
import { assessPosting } from "../lib/ats-assess.mjs";
import { buildApplicationBrief } from "../lib/application-brief.mjs";

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
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
  // The same save keeps the private twin: the whole editor state, images and private sections included, in Student-data.
  // Every module reads the profile from it (readUserProfile), so the published data/ and the private copy cannot drift.
  fs.mkdirSync(STUDENT_DIR, { recursive: true });
  fs.writeFileSync(path.join(STUDENT_DIR, "student.json"), JSON.stringify(payload, null, 2));
  result.written.push("src/assets/Student-data/student.json (private)");
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
// One page reader for the whole server: its pauses between requests and its robots.txt answers are shared, so two
// open tabs cannot double the pace at which a company's website is read.
const siteReader = createReader();
const hasBoardApi = (company) => Boolean(company.platform.token && Object.hasOwn(BOARD_APIS, company.platform.name));

const searchSources = () => ({ claude: true, nim: Boolean(process.env.NVIDIA_API_KEY), apis: Boolean(enginePython(engineDir())), companies: readCompanies().some(hasBoardApi) });

// GET /__editor/search-plan?mode=profile|global: the words a search would use, with no AI call and no search.
async function handleSearchPlan(req, res) {
  const mode = new URL(req.url, `http://${HOST}`).searchParams.get('mode') === 'global' ? 'global' : 'profile';
  const field = readField();
  const plan = field || mode === 'global' ? await searchPlan({ mode, field, ai: false }) : null;
  sendJson(res, 200, { ok: true, mode, field, available: searchSources(), plan: plan && { label: plan.label, matched: plan.matched, keywords: plan.engineKeywords, searches: plan.indeedSearches.map((item) => item.search) } });
}

async function handleSearch(req, res) {
  const { useProfile, mode = 'profile', sources = {}, boards = {} } = await readBody(req);
  if (!['profile', 'global'].includes(mode)) return sendJson(res, 400, { error: 'Choose a search by your major (profile) or a global search.' });
  const claudeBoards = Array.isArray(boards.claude) ? boards.claude : ['Indeed', 'StepStone', 'Arbeitsagentur'];
  const apifyBoards = claudeBoards.filter((b) => b === 'StepStone' || b === 'Arbeitsagentur');
  const nimBoards = Array.isArray(boards.nim) ? boards.nim : undefined;
  const apiBoards = Array.isArray(boards.apis) ? boards.apis : undefined;
  const use = {
    claude: sources.claude !== false && claudeBoards.length > 0,
    nim: sources.nim !== false && (!nimBoards || nimBoards.length > 0),
    apis: sources.apis !== false && (!apiBoards || apiBoards.length > 0),
    // The careers platforms of the companies in the directory (lib/company-jobs.mjs). Off when no company has one yet.
    companies: sources.companies !== false && searchSources().companies,
  };
  if (!Object.values(use).some(Boolean)) return sendJson(res, 400, { error: 'Choose at least one search source and job board.' });
  if (useProfile && !llmConfig()) return sendJson(res, 400, { error: 'Set up an AI provider in .env to score jobs with your profile files.' });
  if (useProfile && !hasStudentFiles()) return sendJson(res, 400, { error: 'Upload student.json and both base documents in the editor first.' });
  if (progress.search?.running) return sendJson(res, 409, { error: 'A search is already running. Its progress is in the top-right corner.' });
  track('search', { running: true, started: Date.now(), stage: 'Planning the search', sources: {}, error: '' });
  try {
    const plan = await searchPlan({ mode }); // the major's words (or every field's); fails with a clear message when the profile has no field of study
    track('search', { stage: `Searching for ${plan.label.toLowerCase()}` });
    // The student chooses the sources and boards. The JobSearchEngine decides what each free source permits; this page never searches or
    // opens job sites itself. Indeed comes through the student's Claude connector (lib/indeed-agent.mjs) and
    // StepStone/Arbeitsagentur through Claude's Apify connector: those two are Claude's, they need its connectors.
    // Everything an NVIDIA NIM model can reach through plain search APIs (LinkedIn and the other boards) goes to it instead
    // (lib/nim-agent.mjs), so Claude spends no tokens there. Any may fail alone; that is a warning.
    const tasks = [
      use.apis && ['apis', 'Free job sources', searchWithEngine({ days: NEW_DAYS, keywords: plan.engineKeywords, sources: apiBoards })],
      use.claude && claudeBoards.includes('Indeed') && ['claude', 'Indeed', searchIndeed({ days: NEW_DAYS, searches: plan.indeedSearches })],
      use.claude && apifyBoards.length > 0 && ['claude', 'Apify', searchApify({ days: NEW_DAYS, searches: plan.apifySearches, boards: apifyBoards })],
      use.nim && ['nim', 'NVIDIA NIM', searchNim({ days: NEW_DAYS, plan, sites: nimBoards, isKnown: knownAddress((await readApplicationWorkbook()).rows) })],
      // By major: internships whose title has one of the major's words. Global: every internship those companies list in Germany.
      use.companies && ['companies', 'Company websites', searchCompanySites({ companies: readCompanies(), read: siteReader, words: mode === 'profile' ? [...plan.de, ...plan.en, ...plan.engineKeywords] : [] })],
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
    const failed = {}; // source name -> why it failed, so the page and the Job Boards record can say so
    settled.forEach((r, i) => {
      const [group, name] = tasks[i];
      if (r.status === 'rejected') { failed[name] = r.reason.message; return result.warnings.push(`${name} was not searched: ${r.reason.message}`); }
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
    // For the Job Boards page: when each board was last searched and what it returned. A board whose source failed keeps its last good scan.
    try {
      const ran = Object.fromEntries(tasks.map(([, name], i) => [name, settled[i].status === 'fulfilled']));
      const count = (board) => result.jobs.filter((job) => `${job.source || ''} ${job.data_source || ''} ${job.url || ''}`.toLowerCase().includes(board.toLowerCase().replace(/\s+/g, ''))).length;
      const boardsRun = {};
      const note = (names, task, via) => { if (task in ran) for (const board of names) boardsRun[board] = { ok: ran[task], found: count(board), via: ran[task] ? via : `${task} failed: ${failed[task]}` }; };
      note(claudeBoards.includes('Indeed') ? ['Indeed'] : [], 'Indeed', 'Claude connector');
      note(apifyBoards, 'Apify', 'Claude connector (Apify)');
      note(nimBoards || [], 'NVIDIA NIM', 'NVIDIA NIM search');
      note(apiBoards || [], 'Free job sources', 'JobSearchEngine');
      for (const name of ['Free job sources', 'NVIDIA NIM', 'Company websites']) if (name in ran) boardsRun[name] = { ok: ran[name], found: bySource[{ 'Free job sources': 'apis', 'NVIDIA NIM': 'nim', 'Company websites': 'companies' }[name]] || 0, via: ran[name] ? name : `${name} failed: ${failed[name]}` };
      recordRuns(boardsRun);
    } catch (error) { console.error(`  the search record was not saved: ${error.message}`); }
    sendJson(res, 200, { ok: true, found: result.jobs.length, added: merged.added, unverified: jobs.filter((job) => job.verified === false).length, rows: merged.rows.length, bySource, failed, plan: { mode, label: plan.label }, warnings: result.warnings });
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
      // Fill-only is for a browser on this computer: nothing is sent or submitted, so e-mail and remote-browser jobs wait.
      // Claude in a browser only ever fills, so it runs either way and never submits.
      const provider = route === 'email' ? 'email' : webProvider(route);
      if (fillOnly === true && !['local', 'claude'].includes(provider)) { counts.notRun++; continue; }
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
          } else outcome = await applyOnWeb(route, row, profile, { fillOnly: fillOnly === true }); // lib/apply-providers.mjs: the browser tool can be swapped there
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
    // The newest saved profile: student.json, or the export in the Internships folder while that one is newer.
    const saved = readProfileFile();
    const data = saved.source === "data/" ? null : saved.data;
    // A profile saved before the editor had these sections takes them from data/profile-extras.json.
    if (data && !data.extras) data.extras = readData("profile-extras");
    const existingDocs = [];
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file !== "student.json" && !file.startsWith(".") && fs.statSync(path.join(dir, file)).isFile()) {
          existingDocs.push(file);
        }
      }
    }
    sendJson(res, 200, { ok: true, data, existingDocs, source: saved.source, savedAt: saved.savedAt });
  } else if (req.method === "POST") {
    const payload = await readBody(req);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (payload.data) {
      fs.writeFileSync(path.join(dir, "student.json"), JSON.stringify(payload.data, null, 2));
    }

    // Only the two base documents can be written here, under their own names: a name from the browser is never a path.
    for (const [name, base64] of Object.entries(payload.files || {})) {
      if (!/^base_(cv|cover_letter)_en\.(docx|pdf)$/.test(name)) return sendJson(res, 400, { error: "Only the base CV and the base cover letter are saved here." });
      const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(base64 || ""));
      if (match) fs.writeFileSync(path.join(dir, name), Buffer.from(match[3], "base64"));
    }
    sendJson(res, 200, { ok: true });
  }
}

// ---------------------------------------------------------------------------
// GJU Internships Studio (/documents/) — C:\Users\Hamza928\Desktop\Internships
// ---------------------------------------------------------------------------

async function handleInternshipsState(res) {
  sendJson(res, 200, { ok: true, ...(await getStudioState()) });
}

async function handleInternshipsSettings(req, res) {
  const body = await readBody(req);
  const settings = saveStudioSettings(body);
  sendJson(res, 200, { ok: true, settings, ...(await getStudioState(settings.workingDir)) });
}

async function handleInternshipsEvaluate(req, res) {
  const body = await readBody(req);
  const postings = Array.isArray(body.postings) ? body.postings : [];
  if (!postings.length) return sendJson(res, 400, { error: "Provide at least one internship posting to evaluate." });
  const result = await evaluatePostings({ postings, settings: body.settings || {} });
  sendJson(res, 200, result);
}

async function handleInternshipsGenerate(req, res) {
  const body = await readBody(req);
  const posting = body.posting;
  if (!posting || typeof posting !== "object") {
    return sendJson(res, 400, { error: "Provide the posting object to generate CV & Cover Letter for." });
  }
  // With an assessment, the tailoring uses the terms it found the profile to support and leaves the gaps out.
  const result = await generateDocumentsForPosting({ posting, settings: body.settings || {}, assessment: body.assessment && typeof body.assessment === "object" ? body.assessment : null });
  sendJson(res, 200, { ...result, studio: await getStudioState() });
}

// POST /__editor/internships/brief { postings, settings }: one text file with the profile, the base CV and letter, and each
// posting with its GJU check and ATS assessment, for the student to give to an AI of their own. Calls no AI of ours.
async function handleInternshipsBrief(req, res) {
  const body = await readBody(req);
  const postings = Array.isArray(body.postings) ? body.postings.filter((p) => p && typeof p === "object") : [];
  if (!postings.length) return sendJson(res, 400, { error: "Add at least one internship posting first." });
  sendJson(res, 200, { ok: true, text: await buildApplicationBrief({ postings, settings: body.settings && typeof body.settings === "object" ? body.settings : {} }) });
}

const studioFolder = (key) => { const dirs = studioDirs(); return { CVs: dirs.cvs, CLs: dirs.cls, "Input Data": dirs.inputData }[key] || null; };

// POST /__editor/internships/ats-assess { posting: { company, title, url, text }, folder?, name? }: the posting against the
// profile by the ATS manuals, and against a CV PDF when one is named. Run it as often as the documents change.
async function handleInternshipsAssess(req, res) {
  const body = await readBody(req);
  const posting = body.posting && typeof body.posting === "object" ? body.posting : {};
  // The AI picked by the Phase 2 button (tailorModel: Claude Opus unless the student chose otherwise) reads the advert here too.
  const model = tailorModel(String(body.tailorModel || ""));
  if (!model.config) return sendJson(res, 400, { error: `${model.label} has no key yet. Add it in Settings, or pick a Claude model by the Phase 2 button.` });
  let pdfPath = "";
  if (body.name) {
    const folder = studioFolder(String(body.folder || "CVs"));
    const name = path.basename(String(body.name));
    if (!folder || !name.toLowerCase().endsWith(".pdf")) return sendJson(res, 400, { error: "Choose a .pdf file to check." });
    pdfPath = path.join(folder, name);
    if (!fs.existsSync(pdfPath)) return sendJson(res, 404, { error: `PDF not found: ${name}` });
  }
  console.log(`  ATS assessment for ${String(posting.company || "a posting").slice(0, 60)}…`);
  const assessment = await assessPosting({ posting: { company: String(posting.company || ""), title: String(posting.title || posting.position || ""), url: String(posting.url || ""), text: String(posting.text || posting.rawText || "") }, pdfPath }, { chat: (request) => chatJson({ ...request, config: model.config }) });
  sendJson(res, 200, { ok: true, assessment, checked: pdfPath ? path.basename(pdfPath) : "" });
}

const PAGE_ENTITIES = { nbsp: " ", "#160": " ", amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" };
const INTERNSHIPS_POSTING_TEXT_ALLOWED_HOSTS = [
  "linkedin.com",
  "indeed.com",
  "stepstone.de",
  "glassdoor.com",
  "xing.com",
  "greenhouse.io",
  "lever.co",
  "workable.com",
];

function isAllowedPostingTextHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return INTERNSHIPS_POSTING_TEXT_ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

// POST /__editor/internships/posting-text { url }: the advert's text from its own page, through the polite reader
// (robots.txt, the source policy, no private addresses). A job board that may not be read answers with the reason.
async function handleInternshipsPostingText(req, res) {
  const { url } = await readBody(req);
  let parsed;
  try {
    parsed = new URL(String(url || ""));
  } catch {
    return sendJson(res, 200, { ok: false, reason: "That is not a public web address." });
  }
  if (!["http:", "https:"].includes(parsed.protocol) || !isAllowedPostingTextHost(parsed.hostname)) {
    return sendJson(res, 200, { ok: false, reason: "That web address is not allowed here. Open the advert and paste its text." });
  }
  const page = await siteReader(parsed.href);
  if (!page.ok) {
    const why = page.blocked === "policy" ? "This job board does not allow its pages to be read automatically. Open the advert and paste its text."
      : page.blocked === "robots" ? "The site's robots.txt does not allow this page to be read automatically. Open the advert and paste its text."
        : page.blocked ? "That is not a public web address." : "The page did not answer. Open the advert and paste its text.";
    return sendJson(res, 200, { ok: false, reason: why });
  }
  const text = page.text.replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ").replace(/<\/(p|div|li|h[1-6]|tr|section)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")
    // One pass, so "&amp;lt;" becomes "&lt;" and never "<" (CodeQL js/double-escaping).
    .replace(/&(nbsp|#160|amp|lt|gt|quot|#39|apos);/g, (_, name) => PAGE_ENTITIES[name])
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
  // A page that draws its advert with a script has almost no text of its own.
  if (text.length < 300) return sendJson(res, 200, { ok: false, reason: "The page has no advert text a program can read (it is drawn by a script). Open the advert and paste its text." });
  sendJson(res, 200, { ok: true, text: text.slice(0, 15_000) });
}

// GET /__editor/internships/doc-text?folder=&name= : the paragraphs of a generated .docx.
// POST { folder, name, edits: { "<paragraph>": "text" } }: saves a new version (the original is kept) and checks its PDF again.
async function handleInternshipsDocText(req, res) {
  const query = new URL(req.url, `http://${HOST}`).searchParams;
  const body = req.method === "POST" ? await readBody(req) : { folder: query.get("folder"), name: query.get("name") };
  const folder = ["CVs", "CLs"].includes(body.folder) ? studioFolder(body.folder) : null;
  const name = path.basename(String(body.name || ""));
  if (!folder || !/\.docx$/i.test(name)) return sendJson(res, 400, { error: "Choose a generated .docx from CVs or CLs." });
  if (!fs.existsSync(path.join(folder, name))) return sendJson(res, 404, { error: `File not found: ${name}` });
  if (req.method === "GET") return sendJson(res, 200, { ok: true, name, paragraphs: await readDocParagraphs(path.join(folder, name)) });
  const saved = await saveEditedDoc({ folder, name, edits: body.edits && typeof body.edits === "object" ? body.edits : {} });
  const report = saved.pdfPath && body.folder === "CVs" ? await runAtsCheckOnPdf({ pdfPath: saved.pdfPath, keywords: Array.isArray(body.keywords) ? body.keywords.filter((k) => typeof k === "string").slice(0, 60) : [] }) : null;
  sendJson(res, 200, { ok: true, folder: body.folder, files: { docx: saved.docx, pdf: saved.pdf, pages: saved.pages }, changed: saved.changed, report: report?.ok ? { fails: report.fails, warns: report.warns, mustCoverage: report.mustCoverage, reportMd: report.reportMd } : null, studio: await getStudioState() });
}

async function handleInternshipsAtsCheck(req, res) {
  const body = await readBody(req);
  const dirs = studioDirs();
  const folder = body.folder === "CLs" ? dirs.cls : body.folder === "Input Data" ? dirs.inputData : dirs.cvs;
  const name = path.basename(String(body.name || ""));
  if (!name.toLowerCase().endsWith(".pdf")) {
    return sendJson(res, 400, { error: "Choose a .pdf file to run the ATS check on." });
  }
  const pdfPath = path.join(folder, name);
  if (!fs.existsSync(pdfPath)) {
    return sendJson(res, 404, { error: `PDF not found: ${name}` });
  }
  const keywords = Array.isArray(body.keywords)
    ? body.keywords
    : String(body.keywords || "").split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  const report = await runAtsCheckOnPdf({ pdfPath, keywords });
  sendJson(res, 200, { ok: true, name, folder: body.folder || "CVs", report });
}

function handleInternshipsManual(req, res) {
  const url = new URL(req.url, `http://${HOST}`);
  const rel = String(url.searchParams.get("path") || "").replace(/\\/g, "/");
  const dirs = studioDirs();
  const candidate = path.resolve(dirs.ats, rel);
  if (!candidate.startsWith(dirs.ats + path.sep) && candidate !== dirs.ats) {
    return sendJson(res, 400, { error: "Invalid manual path." });
  }
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
    return sendJson(res, 404, { error: "Manual not found." });
  }
  sendJson(res, 200, {
    ok: true,
    path: rel,
    name: path.basename(candidate),
    content: fs.readFileSync(candidate, "utf8"),
  });
}

function handleInternshipsFile(req, res) {
  const url = new URL(req.url, `http://${HOST}`);
  const folderKey = String(url.searchParams.get("folder") || "CVs");
  const name = path.basename(String(url.searchParams.get("name") || ""));
  if (!name) return sendJson(res, 400, { error: "Missing file name." });
  const dirs = studioDirs();
  const folderMap = {
    CVs: dirs.cvs,
    CLs: dirs.cls,
    "Input Data": dirs.inputData,
    root: dirs.root,
  };
  const baseDir = folderMap[folderKey];
  if (!baseDir) return sendJson(res, 400, { error: "Unknown folder." });
  const filePath = path.resolve(baseDir, name);
  if (!filePath.startsWith(baseDir + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("File not found");
  }
  const ext = path.extname(filePath).toLowerCase();
  const download = url.searchParams.get("download") === "1";
  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "no-store",
  };
  if (download || ext === ".docx") {
    headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(name)}"`;
  }
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

async function handleInternshipsTemplateUpload(req, res) {
  const body = await readBody(req);
  const slot = String(body.slot || "");
  const dataUrl = String(body.dataUrl || "");
  const slotNames = {
    cvDe: "Lebenslauf_Hamza_Salameh_DE.docx",
    cvEn: "CV_Hamza_Salameh_EN.docx",
    clDe: "Anschreiben_Hamza_Salameh_DE.docx",
    clEn: "CL_Hamza_Salameh_EN.docx",
  };
  const targetName = slotNames[slot];
  if (!targetName) return sendJson(res, 400, { error: "Invalid template slot." });
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return sendJson(res, 400, { error: "Invalid file upload payload." });
  const dirs = studioDirs();
  fs.mkdirSync(dirs.inputData, { recursive: true });
  const targetPath = path.join(dirs.inputData, targetName);
  // Back up existing template so we never lose originals
  if (fs.existsSync(targetPath)) {
    const backupName = targetName.replace(/\.docx$/i, `_backup_${Date.now()}.docx`);
    fs.copyFileSync(targetPath, path.join(dirs.inputData, backupName));
  }
  fs.writeFileSync(targetPath, Buffer.from(match[3], "base64"));
  sendJson(res, 200, { ok: true, targetName, ...(await getStudioState()) });
}

// ---------------------------------------------------------------------------
// Job Boards page: the last scan of each board, the boards added by hand, and the company directory with its
// discovery steps. Every step that reads a website goes through siteReader (robots.txt, pauses, size and time limits).
// ---------------------------------------------------------------------------

async function handleBoards(req, res) {
  if (req.method === "POST") {
    const { action, name, url } = await readBody(req);
    if (action === "add") addCustomBoard({ name, url });
    else if (action === "remove") removeCustomBoard(String(name || ""));
    else return sendJson(res, 400, { error: "Choose add or remove." });
  }
  sendJson(res, 200, { ok: true, runs: readRuns().boards, custom: readCustomBoards() });
}

const companyView = (company) => ({ ...company, size: sizeBand(company.employees), searchable: canSearch(company), hasApi: hasBoardApi(company) });
const idList = (value, max) => (Array.isArray(value) ? value.filter((id) => typeof id === "string").slice(0, max) : []);

/** Write back only the records a slow step changed: the file may have gained companies while the step was reading websites. */
function saveChanged(changed) {
  const latest = readCompanies();
  for (const company of changed) { const at = latest.findIndex((item) => item.id === company.id); if (at >= 0) latest[at] = company; }
  writeCompanies(latest);
}

async function handleCompanies(req, res, pathname) {
  const action = pathname.slice("/__editor/companies".length).replace(/^\//, "");
  if (req.method === "GET" && !action) {
    return sendJson(res, 200, { ok: true, companies: readCompanies().map(companyView), sources: Object.entries(COMPANY_SOURCES).map(([id, source]) => ({ id, label: source.label })), sizes: SIZE_BANDS, lookup: Boolean(process.env.EXA_API_KEY) });
  }
  if (req.method !== "POST") return sendJson(res, 404, { error: "Not found" });
  const body = await readBody(req);

  if (action === "discover") {
    const source = String(body.source || "");
    const options = source === "tracker" ? { rows: (await readApplicationWorkbook()).rows } : { limit: body.limit, offset: body.offset, minEmployees: body.minEmployees, city: body.city, name: body.name, website: body.website };
    console.log(`  looking for companies (${source})…`);
    const found = await discoverCompanies(source, options);
    const result = upsertCompanies(readCompanies(), found);
    writeCompanies(result.companies);
    return sendJson(res, 200, { ok: true, found: found.length, added: result.added, merged: result.merged, companies: result.companies.map(companyView) });
  }
  if (action === "verify") {
    // Website, then careers page and platform, for at most five companies a call: the page sends the next five itself, so
    // progress shows and a closed tab stops the work.
    const companies = readCompanies();
    const done = [];
    for (const id of idList(body.ids, 5)) {
      const company = companies.find((item) => item.id === id);
      if (!company) continue;
      await findWebsite(company, { read: siteReader });
      if (company.websiteStatus === "ok") await findCareers(company, { read: siteReader, check: boardSize(siteReader) });
      done.push(company);
    }
    saveChanged(done);
    return sendJson(res, 200, { ok: true, companies: done.map(companyView) });
  }
  if (action === "jobs") {
    const companies = readCompanies();
    const words = idList(body.words, 12).map((word) => word.trim()).filter((word) => word.length > 1);
    const results = [];
    for (const id of idList(body.ids, 8)) {
      const company = companies.find((item) => item.id === id);
      if (!company) continue;
      const found = await companyJobs(company, { read: siteReader, words, internshipsOnly: body.internshipsOnly !== false, germanyOnly: body.germanyOnly !== false });
      results.push({ id, name: company.name, ...found });
    }
    return sendJson(res, 200, { ok: true, results });
  }
  if (action === "shortlist") {
    // The same merge a search uses (GJU check, Fit, no duplicate), for postings the student picked by hand. Text fields only.
    const clean = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    const hits = (Array.isArray(body.jobs) ? body.jobs : []).slice(0, 50).map((job) => ({
      url: clean(job.url, 600), title: clean(job.title, 200), company: clean(job.company, 120), location: clean(job.location, 120), date_posted: /^\d{4}-\d{2}-\d{2}$/.test(job.date_posted || "") ? job.date_posted : "",
      snippet: clean(job.snippet, 400), source: clean(job.source, 120), data_source: clean(job.data_source, 120), website: clean(job.website, 300), industry: clean(job.industry, 120), ...(job.verified === false ? { verified: false } : {}),
    })).filter((hit) => /^https?:\/\//.test(hit.url) && hit.title);
    const merged = await whenFree("companies", async () => {
      const snapshot = await readApplicationWorkbook();
      const result = mergeSearchResults(snapshot.rows, hits, { scoring: { keepLow: true } });
      if (result.added) await saveApplicationWorkbook(result.rows, { revision: snapshot.revision });
      return result;
    });
    return sendJson(res, 200, { ok: true, added: merged.added });
  }
  if (action === "update") {
    const companies = readCompanies();
    const company = companies.find((item) => item.id === body.id);
    if (!company) return sendJson(res, 404, { error: "That company is no longer in the directory." });
    const next = normalizeCompany({ ...company, ...Object.fromEntries(["name", "industry", "hq", "employees", "website", "careersUrl"].filter((field) => field in body).map((field) => [field, body[field]])) });
    if (!next.name) return sendJson(res, 400, { error: "A company needs a name." });
    // An address typed by hand has not answered yet: it is checked again before it counts.
    if (next.website !== company.website) next.websiteStatus = "unverified";
    if (next.careersUrl !== company.careersUrl) { next.careersStatus = "unverified"; next.platform = { name: "", token: "", boardUrl: "" }; }
    Object.assign(company, next);
    writeCompanies(companies);
    return sendJson(res, 200, { ok: true, company: companyView(company) });
  }
  if (action === "remove") {
    const ids = new Set(idList(body.ids, 5000));
    writeCompanies(readCompanies().filter((company) => !ids.has(company.id)));
    return sendJson(res, 200, { ok: true, removed: ids.size });
  }
  sendJson(res, 404, { error: "Not found" });
}

// ---------------------------------------------------------------------------
// Uploaded documents (Profile / Editor). A document is read and turned into proposals; nothing reaches the profile
// until the student approves it in the editor and saves. Files stay in Student-data/documents and are served from
// this server only.
// ---------------------------------------------------------------------------

async function handleDocuments(req, res, pathname) {
  const action = pathname.slice("/__editor/documents".length).replace(/^\//, "");
  if (req.method === "GET" && !action) return sendJson(res, 200, { ok: true, documents: listDocuments(), readers: documentReaders() });
  if (req.method === "GET" && action === "file") {
    const doc = getDocument(String(new URL(req.url, `http://${HOST}`).searchParams.get("id") || ""));
    if (!fs.existsSync(doc.path)) return sendJson(res, 404, { error: "The file is missing from the documents folder." });
    res.writeHead(200, { "Content-Type": doc.type, "Cache-Control": "no-store", "Content-Disposition": `inline; filename="${encodeURIComponent(doc.name)}"`, "X-Content-Type-Options": "nosniff" });
    return fs.createReadStream(doc.path).pipe(res);
  }
  if (req.method !== "POST") return sendJson(res, 404, { error: "Not found" });
  const body = await readBody(req);
  if (action === "upload") return sendJson(res, 200, { ok: true, document: saveDocument(body) });
  if (action === "analyse") {
    console.log("  reading an uploaded document…");
    const { analysis, ...doc } = await analyseDocument(String(body.id || ""));
    return sendJson(res, 200, { ok: true, document: { ...doc, analysis: { ...analysis, extractedText: undefined } }, extractedText: analysis.extractedText });
  }
  if (action === "update") return sendJson(res, 200, { ok: true, document: markDocument(String(body.id || ""), body) });
  if (action === "remove") { removeDocument(String(body.id || "")); return sendJson(res, 200, { ok: true }); }
  sendJson(res, 404, { error: "Not found" });
}

// ---------------------------------------------------------------------------
// Settings page: test one integration, and manage the MCP connectors. The browser names an integration id or a preset;
// it never sends a command to run (lib/mcp-config.mjs), and no answer holds a key.
// ---------------------------------------------------------------------------

async function handleIntegrationTest(req, res) {
  const { id } = await readBody(req);
  if (typeof id !== "string" || !canTest(id)) return sendJson(res, 400, { error: "There is no test for this integration." });
  console.log(`  testing ${id}…`);
  sendJson(res, 200, await testIntegration(id));
}

async function handleMcp(req, res) {
  if (req.method === "POST") {
    const { action, name, preset, url, headerName, headerEnv } = await readBody(req);
    if (action === "add") addServer({ name, preset, url, headerName, headerEnv });
    else if (action === "remove") removeServer(String(name || ""));
    else if (action === "enable" || action === "disable") setEnabled(String(name || ""), action === "enable");
    else return sendJson(res, 400, { error: "Choose add, remove, enable or disable." });
    capabilitiesCache = null; // which browser tool is available depends on these servers
  }
  sendJson(res, 200, { ok: true, servers: describeServers(), presets: Object.keys(PRESETS) });
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
    if (pathname === "/__editor/documents" || pathname.startsWith("/__editor/documents/")) return await handleDocuments(req, res, pathname);
    if (pathname === "/__editor/search" && req.method === "POST") return await handleSearch(req, res);
    if (pathname === "/__editor/search-plan" && req.method === "GET") return await handleSearchPlan(req, res);
    if (pathname === "/__editor/settings") return await handleSettings(req, res);
    if (pathname === "/__editor/llm-test" && req.method === "POST") return await handleLlmTest(res);
    if (pathname === "/__editor/integration-test" && req.method === "POST") return await handleIntegrationTest(req, res);
    if (pathname === "/__editor/mcp") return await handleMcp(req, res);
    if (pathname === "/__editor/boards") return await handleBoards(req, res);
    if (pathname === "/__editor/companies" || pathname.startsWith("/__editor/companies/")) return await handleCompanies(req, res, pathname);
    if (pathname === "/__editor/claude-connectors" && req.method === "GET") return sendJson(res, 200, await claudeConnectors({ fresh: new URL(req.url, `http://${HOST}`).searchParams.has("fresh") }));
    if (pathname === "/__editor/tailor" && req.method === "POST") return await handleTailor(req, res);
    if (pathname === "/__editor/assign-applicant" && req.method === "POST") return await handleAssignApplicant(req, res);
    if (pathname === "/__editor/apply-pack" && req.method === "GET") return handleApplyPack(res);
    if (pathname === "/__editor/apply-preview" && req.method === "GET") return await handleApplyPreview(res);
    if (pathname === "/__editor/apply" && req.method === "POST") return await handleApply(req, res);
    if (pathname === "/__editor/apply-providers" && req.method === "GET") return sendJson(res, 200, { ok: true, ...(await providerStates()), choices: Object.keys(APPLY_PROVIDERS) });
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
    if (pathname === "/__editor/internships/state" && req.method === "GET") return await handleInternshipsState(res);
    if (pathname === "/__editor/internships/settings" && req.method === "POST") return await handleInternshipsSettings(req, res);
    if (pathname === "/__editor/internships/evaluate" && req.method === "POST") return await handleInternshipsEvaluate(req, res);
    if (pathname === "/__editor/internships/generate" && req.method === "POST") return await handleInternshipsGenerate(req, res);
    if (pathname === "/__editor/internships/brief" && req.method === "POST") return await handleInternshipsBrief(req, res);
    if (pathname === "/__editor/internships/ats-check" && req.method === "POST") return await handleInternshipsAtsCheck(req, res);
    if (pathname === "/__editor/internships/ats-assess" && req.method === "POST") return await handleInternshipsAssess(req, res);
    if (pathname === "/__editor/internships/posting-text" && req.method === "POST") return await handleInternshipsPostingText(req, res);
    if (pathname === "/__editor/internships/doc-text") return await handleInternshipsDocText(req, res);
    if (pathname === "/__editor/internships/ats-manual" && req.method === "GET") return handleInternshipsManual(req, res);
    if (pathname === "/__editor/internships/file" && req.method === "GET") return handleInternshipsFile(req, res);
    if (pathname === "/__editor/internships/template" && req.method === "POST") return await handleInternshipsTemplateUpload(req, res);

    // The app opens on Search. The public profile page itself is at /?public (the Profile / Editor links to it).
    if (pathname === "/" && !new URL(req.url, `http://${HOST}`).searchParams.has("public")) {
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
Search:           http://${HOST}:${PORT}${prefix}workspace/
Profile / Editor: http://${HOST}:${PORT}${prefix}editor/
Settings:         http://${HOST}:${PORT}${prefix}settings/
Public profile:   http://${HOST}:${PORT}${prefix}?public

Press Ctrl+C to stop.
`);
});



