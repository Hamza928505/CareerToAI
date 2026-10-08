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
 * It binds to 127.0.0.1 only.
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
import { getApplicationCapabilities, runBrowserApplication, searchPlatforms } from "../lib/job-search.mjs";
import { readApplicationWorkbook, saveApplicationWorkbook } from "../lib/application-workbook.mjs";
import { assistantQueue, applicationTarget, mergeSearchResults } from "../lib/application-flow.mjs";
import { readSettings, saveSettings } from "../lib/env-settings.mjs";
import { chatJson, llmConfig, llmOverview, llmStatus } from "../lib/llm.mjs";
import { scoreJobs, suggestRoles } from "../lib/profile-ai.mjs";
import { hasStudentFiles, readStudent, TAILORED_DIRS } from "../lib/student-files.mjs";
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

/** Resolve a URL path to a file inside _site, refusing anything that escapes it. */
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

async function handleSearchStrategy(req, res) {
  const strategyPath = path.join(ROOT, "data", "search-strategy.json");
  if (req.method === "GET") {
    if (fs.existsSync(strategyPath)) {
      sendJson(res, 200, JSON.parse(fs.readFileSync(strategyPath, "utf-8")));
    } else {
      sendJson(res, 200, { roles: [], cities: [], types: [] });
    }
  } else if (req.method === "POST") {
    const payload = await readBody(req);
    const strategy = {};
    for (const key of ['roles', 'cities', 'types']) {
      if (!Array.isArray(payload[key]) || payload[key].length > 5000 || payload[key].some((item) => typeof item !== 'string' || item.length > 200)) {
        return sendJson(res, 400, { error: `Choose valid ${key} for your strategy.` });
      }
      strategy[key] = [...new Set(payload[key].map((item) => item.trim()).filter(Boolean))];
    }
    fs.writeFileSync(strategyPath, JSON.stringify(strategy, null, 2), "utf-8");
    sendJson(res, 200, { ok: true });
  }
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

async function handleApplicationsRead(res) {
  sendJson(res, 200, await readApplicationWorkbook());
}

async function handleApplicationsWrite(req, res) {
  const { rows, revision } = await readBody(req);
  const snapshot = await withWorkflow('save', () => saveApplicationWorkbook(rows, { revision }));
  sendJson(res, 200, { ok: true, ...snapshot });
}

async function handleSearch(req, res) {
  const { useProfile } = await readBody(req);
  if (useProfile && !llmConfig()) return sendJson(res, 400, { error: 'Set up an AI provider in .env to score jobs with your profile files.' });
  if (useProfile && !hasStudentFiles()) return sendJson(res, 400, { error: 'Upload student.json and both base documents in the editor first.' });
  await withWorkflow('search', async () => {
    const strategyPath = path.join(ROOT, 'data', 'search-strategy.json');
    if (!fs.existsSync(strategyPath)) return sendJson(res, 400, { error: 'Choose and save your search strategy first.' });
    const result = await searchPlatforms(JSON.parse(fs.readFileSync(strategyPath, 'utf8')));
    if (useProfile && result.jobs.length) {
      // Optional and best-effort: any failure keeps the built-in score and says so.
      try {
        const { scores, error } = await scoreJobs({ jobs: result.jobs });
        for (const job of result.jobs) if (scores.has(job.url)) job.match = scores.get(job.url);
        result.warnings = [...(result.warnings || []), error ? `AI scoring stopped early: ${error}` : `AI scored ${scores.size} of ${result.jobs.length} postings against your files.`];
      } catch (error) {
        result.warnings = [...(result.warnings || []), `AI scoring was skipped: ${error.message}`];
      }
    }
    // Read after the network calls so edits made in Excel during the search are retained.
    const snapshot = await readApplicationWorkbook();
    const merged = mergeSearchResults(snapshot.rows, result.jobs);
    if (result.jobs.length) await saveApplicationWorkbook(merged.rows, { revision: snapshot.revision });
    sendJson(res, 200, { ok: true, found: result.jobs.length, added: merged.added, rows: merged.rows.length, unavailableServers: result.unavailableServers || [], warnings: result.warnings || [] });
  });
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

async function handleLlmTest(res) {
  const config = llmConfig();
  if (!config) return sendJson(res, 400, { error: "Choose an AI provider and save its key first." });
  await chatJson({ system: 'Reply with {"ok": true}.', user: "ping", schema: z.object({ ok: z.boolean() }), config });
  sendJson(res, 200, { ok: true, provider: config.provider, model: config.model });
}

async function handleSearchSuggest(res) {
  if (!llmConfig()) return sendJson(res, 400, { error: 'Set up an AI provider in .env to get suggestions from your files.' });
  if (!hasStudentFiles()) return sendJson(res, 400, { error: 'Upload student.json and both base documents in the editor first.' });
  const options = readJson(path.join(ROOT, 'src', 'assets', 'search-options.json'));
  sendJson(res, 200, { ok: true, ...(await suggestRoles({ options })) });
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
  const rows = eligible.slice(0, 15).map((row) => ({ id: row.id, company: row.company, position: row.position, url: row.app_url || row.job_url, method: row.app_method }));
  pendingPreview = {
    token: randomUUID(), revision: snapshot.revision, ids: rows.map((row) => row.id),
    approvedRows: new Map(eligible.slice(0, 15).map((row) => [row.id, structuredClone(row)])),
    expires: Date.now() + 10 * 60_000,
  };
  sendJson(res, 200, { count: rows.length, remaining: Math.max(0, eligible.length - rows.length), first: rows[0] || null, rows, confirmation: pendingPreview.token, batchLimit: 15 });
}

async function handleApply(req, res) {
  const { confirmation } = await readBody(req);
  await withWorkflow('apply', async () => {
    const snapshot = await readApplicationWorkbook();
    if (!pendingPreview || pendingPreview.token !== confirmation || pendingPreview.expires < Date.now() || pendingPreview.revision !== snapshot.revision) {
      return sendJson(res, 409, { error: 'The application preview expired or the workbook changed. Review the selected jobs again before submitting.' });
    }
    const ids = pendingPreview.ids;
    const approvedRows = pendingPreview.approvedRows;
    pendingPreview = null;
    const profile = Object.fromEntries(['profile', 'experience', 'projects', 'certificates'].map((name) => [name, readData(name)]));
    profile['profile-extras'] = readExtras();
    const counts = { submitted: 0, needsInput: 0, blocked: 0, attempted: 0, skipped: 0 };
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
      let outcome;
      if (target.kind === 'email') {
        outcome = { status: 'Needs input', evidence: 'Email submission needs a connected sending account. Your contact email alone does not authorize email sending.' };
      } else if (target.kind === 'missing') {
        outcome = { status: 'Needs input', evidence: 'Add a valid application URL or job posting URL.' };
      } else if (!profile.profile.email) {
        outcome = { status: 'Needs input', evidence: 'Add your contact email in the profile editor before applying.' };
      } else {
        const wait = nextBrowserAt - Date.now();
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
        try { outcome = await runBrowserApplication(row, profile); }
        catch { outcome = { status: 'Needs input', evidence: 'The browser connection stopped. Check the application portal before retrying.' }; }
        finally { nextBrowserAt = Date.now() + 30_000; }
      }
      counts.attempted++;
      const latest = await readApplicationWorkbook();
      const updated = latest.rows.find((item) => item.id === id);
      if (!updated) throw conflict('An application row was removed while its submission was running. Check the portal before retrying.');
      updated.status = outcome.status === 'Applied' ? 'Applied' : 'To apply';
      updated.assistant_state = outcome.status === 'Applied' ? '' : outcome.status === 'Blocked' ? 'Blocked' : 'Needs input';
      updated.notes = [updated.notes, `Assistant: ${String(outcome.evidence || 'No submission confirmation was returned.').slice(0, 2000)}`].filter(Boolean).join('\n');
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
    if (req.method === 'POST' && req.headers.origin && ![`http://${HOST}:${PORT}`, `http://localhost:${PORT}`].includes(req.headers.origin)) {
      return sendJson(res, 403, { error: 'Open the local workspace to change its files.' });
    }
    if (pathname === '/__editor/application-settings' && req.method === 'GET') {
      const profile = readJson(path.join(ROOT, 'data', 'profile.json'));
      return sendJson(res, 200, { candidateEmail: profile.email || '', emailSendingAvailable: false });
    }
    if (pathname === '/__editor/application-capabilities' && req.method === 'GET') {
      if (!capabilitiesCache || Date.now() - capabilitiesChecked > 300_000) {
        capabilitiesChecked = Date.now();
        capabilitiesCache = getApplicationCapabilities().catch(() => ({ browser: { available: false }, email: { available: false }, localFileUploads: false }));
      }
      return sendJson(res, 200, await capabilitiesCache);
    }
    if (pathname === "/__editor/credits" && req.method === "GET") return sendJson(res, 200, { providers: await checkCredits(), ai: llmOverview() });
    if (pathname === "/__editor/status") {
      return sendJson(res, 200, { ok: true, hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY), llm: llmStatus(), studentFiles: hasStudentFiles() });
    }
    if (pathname === "/__editor/save" && req.method === "POST") return await handleSave(req, res);
    if (pathname === "/__editor/extract" && req.method === "POST") return await handleExtract(req, res);
    if (pathname === "/__editor/skills" && req.method === "POST") return await handleSkills(req, res);
    if (pathname === "/__editor/run" && req.method === "POST") return await handleRun(req, res);
    if (pathname === "/__editor/student-data") return await handleStudentData(req, res);
    if (pathname === "/__editor/search-strategy") return await handleSearchStrategy(req, res);
    if (pathname === "/__editor/search" && req.method === "POST") return await handleSearch(req, res);
    if (pathname === "/__editor/settings") return await handleSettings(req, res);
    if (pathname === "/__editor/llm-test" && req.method === "POST") return await handleLlmTest(res);
    if (pathname === "/__editor/search-suggest" && req.method === "POST") return await handleSearchSuggest(res);
    if (pathname === "/__editor/tailor" && req.method === "POST") return await handleTailor(req, res);
    if (pathname === "/__editor/apply-pack" && req.method === "GET") return handleApplyPack(res);
    if (pathname === "/__editor/apply-preview" && req.method === "GET") return await handleApplyPreview(res);
    if (pathname === "/__editor/apply" && req.method === "POST") return await handleApply(req, res);
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
      res.writeHead(302, { Location: `${prefix}editor/` });
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
Editor ready:     http://${HOST}:${PORT}${prefix}editor/
Workspace ready:  http://${HOST}:${PORT}${prefix}workspace/
Site preview:     http://${HOST}:${PORT}${prefix}

  "Save to data/" writes data/*.json plus src/certs/ and src/media/, then rebuilds.
  ${process.env.ANTHROPIC_API_KEY
    ? '"Extract with AI" is enabled (key found in .env).'
    : '"Extract with AI" is off — add ANTHROPIC_API_KEY to .env to enable it.'}

Press Ctrl+C to stop.
`);
});



