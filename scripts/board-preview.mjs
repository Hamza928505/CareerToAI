#!/usr/bin/env node
/**
 * A LOCAL preview of the board filled from EVERY way the JobSearchEngine searches: free APIs, APIs whose terms allow
 * personal use only (Arbeitnow, Remotive, ...), published feeds, and search-engine leads for sites that forbid automated
 * reading. It is for you to look at, not to publish: the page is built into a git-ignored folder, never into the board
 * repo, and carries a notice saying so. The public board keeps only what each source's terms allow
 * (npm run board:search -- --sources=engine).
 *
 *   node scripts/board-preview.mjs [--since=2026-10-01] [--out .board-preview] [--serve [--port 4180]]
 *
 * Leads are labelled "(search lead, not checked)": they come from a search engine, the page behind them was never read, so
 * duration, pay and language level are usually "not stated" and the GJU check says "needs checking".
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import { ROOT, readJson } from "../lib/content.mjs";
import { runBoard } from "../lib/board-run.mjs";
import { fetchAllFromEngine } from "../lib/board-source-engine.mjs";

const flag = (name) => { const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`)); return hit === undefined ? undefined : hit.includes("=") ? hit.split("=")[1] : (process.argv[process.argv.indexOf(hit) + 1] ?? true); };
const board = path.resolve(ROOT, "..", "GJUBoard");
const out = path.resolve(ROOT, flag("out") && flag("out") !== true ? flag("out") : ".board-preview");
if (!fs.existsSync(path.join(board, "board", "majors.json"))) { console.error(`No board page found at ${board}.`); process.exit(1); }
if (out === board || out.startsWith(board + path.sep)) { console.error("The preview must not be built inside the board repo: it is never published."); process.exit(1); }

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const since = flag("since");
const days = since === undefined ? 14 : Math.round((Date.parse(today) - Date.parse(since)) / 86_400_000);
if (!(days >= 0 && days <= 60)) { console.error(`--since needs a date as YYYY-MM-DD within the last 60 days. Got "${since}".`); process.exit(1); }

// the page, without the board's own data and git history
fs.mkdirSync(out, { recursive: true });
for (const entry of fs.readdirSync(out)) fs.rmSync(path.join(out, entry), { recursive: true, force: true });
fs.cpSync(board, out, { recursive: true, filter: (src) => !/[\\/]\.git([\\/]|$)/.test(src) && !/[\\/]data([\\/]|$)/.test(src) });
fs.mkdirSync(path.join(out, "data", "days"), { recursive: true });

const rules = readJson(path.join(ROOT, "data", "gju-rules.json"));
const cities = readJson(path.join(ROOT, "src", "assets", "search-options.json")).cities;
const germanCities = new Set(cities.map((city) => String(city.name).toLowerCase()));
const config = { ...(await import("../lib/board-budget.mjs")).DEFAULT_CONFIG, lookbackDays: days, keepDays: Math.max(days + 1, 30) };

console.log(`Local preview from every way, postings from ${since ?? `the last ${days} days`} to ${today}. This can take a minute…`);
const summary = await runBoard({
  boardDir: out, statePath: path.join(out, "state.json"), rules, germanCities, openServers: async () => { throw new Error("not used"); }, config, today,
  sources: ["engine"], searchEngine: fetchAllFromEngine, allowUnverified: true, log: console.log,
});

const indexPath = path.join(out, "data", "index.json");
const index = readJson(indexPath);
index.notice = "LOCAL PREVIEW, not public. It includes search-engine leads that were not checked and sources whose terms allow personal use only. The public board keeps only what the sources' terms allow.";
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");

const postings = readJson(path.join(out, "data", "postings.json"));
const bySource = {};
for (const p of postings) bySource[p.source] = (bySource[p.source] || 0) + 1;
console.log(`Found ${summary.found}, added ${summary.added}, no fit for a GJU major ${summary.notRelevant}, not an internship ${summary.notInternship}.`);
console.log(`On the preview page: ${postings.length} internships. By source: ${JSON.stringify(bySource)}`);
for (const warning of summary.warnings) console.log(`Note: ${warning}`);
console.log(`Built in ${out} (git-ignored, never pushed).`);

if (flag("serve") !== undefined) {
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
  const port = Number(flag("port")) || 4180;
  http.createServer((req, res) => {
    let file = path.join(out, decodeURIComponent(req.url.split("?")[0]));
    if (!file.startsWith(out)) { res.statusCode = 403; return res.end(); }
    if (file.endsWith(path.sep) || (fs.existsSync(file) && fs.statSync(file).isDirectory())) file = path.join(file, "index.html");
    fs.readFile(file, (error, body) => {
      if (error) { res.statusCode = 404; return res.end(); }
      res.setHeader("content-type", types[path.extname(file)] || "application/octet-stream");
      res.end(body);
    });
  }).listen(port, "127.0.0.1", () => console.log(`Open http://127.0.0.1:${port}/  (Ctrl+C to stop)`));
}
