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
 *   GET  __editor/tracker  the rows in data/tracker.csv
 *   POST __editor/tracker  append one row to data/tracker.csv
 *   POST __editor/run      run one of four named npm scripts (see TASKS)
 *
 * The API key is read from .env here, in Node, so it never reaches the browser.
 * It binds to 127.0.0.1 only.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";

import Eleventy from "@11ty/eleventy";

import { applyPayload } from "../lib/apply-data.mjs";
import { ROOT } from "../lib/content.mjs";
import {
  Anthropic,
  DEFAULT_MODEL,
  buildSourceBlock,
  extractCertificate,
  loadEnv,
} from "../lib/extract-certificate.mjs";
import { extractAdSkills } from "../lib/extract-skills.mjs";
import { resolveSite } from "../lib/site.mjs";
import { COLUMNS, assertStatus, readTracker, writeTracker } from "../lib/tracker.mjs";

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
};

const PORT = Number(process.env.EDITOR_PORT || 8081);
const HOST = "127.0.0.1";
const OUTPUT_DIR = path.join(ROOT, "_site");
const MAX_BODY_BYTES = 64 * 1024 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
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

async function handleRun(req, res) {
  const { task } = await readBody(req);
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

function handleTrackerRead(res) {
  sendJson(res, 200, { rows: readTracker() });
}

async function handleTrackerWrite(req, res) {
  const { row } = await readBody(req);
  if (!row || !String(row.company || "").trim()) {
    return sendJson(res, 400, { error: "A row needs a company name." });
  }

  // Keep only columns the schema defines, and never accept a value for one the
  // workbook computes — those are formulas, not data.
  const clean = {};
  for (const column of COLUMNS) {
    if (column.computed) continue;
    const value = row[column.key];
    if (value != null && String(value).trim()) clean[column.key] = String(value).trim();
  }

  try {
    assertStatus(clean);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }

  const rows = readTracker();
  const existing = rows.findIndex(
    (r) => (r.company || "").toLowerCase() === clean.company.toLowerCase(),
  );

  // Match on company first, the same rule /apply follows, so a second attempt
  // at the same employer updates the row instead of duplicating it.
  if (existing >= 0) rows[existing] = { ...rows[existing], ...clean };
  else rows.push(clean);

  const written = writeTracker(rows);
  console.log(`  tracker: ${existing >= 0 ? "updated" : "added"} ${clean.company} (${written} rows)`);
  sendJson(res, 200, { ok: true, rows: written, updated: existing >= 0 });
}

const server = http.createServer(async (req, res) => {
  let pathname = new URL(req.url, `http://${HOST}`).pathname;

  // The site is built with a path prefix; accept URLs with or without it so
  // the editor works whether you open /editor/ or /CareerToAI/editor/.
  if (prefix !== "/" && pathname.startsWith(prefix)) {
    pathname = "/" + pathname.slice(prefix.length);
  }

  try {
    if (pathname === "/__editor/status") {
      return sendJson(res, 200, { ok: true, hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY) });
    }
    if (pathname === "/__editor/save" && req.method === "POST") return await handleSave(req, res);
    if (pathname === "/__editor/extract" && req.method === "POST") return await handleExtract(req, res);
    if (pathname === "/__editor/skills" && req.method === "POST") return await handleSkills(req, res);
    if (pathname === "/__editor/run" && req.method === "POST") return await handleRun(req, res);
    if (pathname === "/__editor/tracker") {
      if (req.method === "POST") return await handleTrackerWrite(req, res);
      return handleTrackerRead(res);
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
    sendJson(res, 500, { error: error.message });
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
