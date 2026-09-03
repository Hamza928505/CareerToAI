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
 *
 * The API key is read from .env here, in Node, so it never reaches the browser.
 * It binds to 127.0.0.1 only.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

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
import { resolveSite } from "../lib/site.mjs";

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
  console.log(`  saved — ${result.counts.experience} role(s), ${result.counts.certificates} certificate(s), ${result.images} image(s)`);
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
Editor ready:  http://${HOST}:${PORT}${prefix}editor/
Site preview:  http://${HOST}:${PORT}${prefix}

  "Save to data/" writes data/*.json plus src/certs/ and src/media/, then rebuilds.
  ${process.env.ANTHROPIC_API_KEY
    ? '"Extract with AI" is enabled (key found in .env).'
    : '"Extract with AI" is off — add ANTHROPIC_API_KEY to .env to enable it.'}

Press Ctrl+C to stop.
`);
});
