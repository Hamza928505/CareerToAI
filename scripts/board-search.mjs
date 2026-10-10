#!/usr/bin/env node
/**
 * The daily run behind the public GJU internship board. Two sources:
 *   arbeitsagentur  the Bundesagentur für Arbeit's Jobbörse: free, every area in one go (unofficial, see lib/board-source-ba.mjs)
 *   search          the credit-based MCP search of a rotating slice of areas and job sites, within the daily caps
 *
 *   npm run board:search -- --dry-run     show what today's run would do and spend; searches nothing
 *   npm run board:search                  run both sources and write the board's data files
 *   npm run board:search -- --sources=arbeitsagentur   only the free source (no credits are read or spent)
 *   npm run board:search -- --publish     the same, then commit and push the data in the board repo
 *   npm run board:search -- --since=2026-10-01   accept postings from that date on (default: 3 days back, 14 for a first visit)
 *
 * The board repo is a separate folder (BOARD_REPO_DIR in .env, default ../GJUBoard). Only derived
 * facts are written there. Credit details and the rotation state stay here, in git-ignored files.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { checkCredits } from "../lib/credits.mjs";
import { ROOT, readJson } from "../lib/content.mjs";
import { loadEnv } from "../lib/extract-certificate.mjs";
import { openMcpServers } from "../lib/antigravity-mcp.mjs";
import { DEFAULT_CONFIG } from "../lib/board-budget.mjs";
import { SOURCES, lookbackFor, lookbackForFree, planRun, runBoard } from "../lib/board-run.mjs";

const git = promisify(execFile);
const args = new Set(process.argv.slice(2));
// PowerShell 5.1 swallows the `--` in `npm run x -- --flag`, so npm takes the flag itself and hands it on as npm_config_*.
// Read those too, or a swallowed --dry-run would quietly become a search that spends credits.
for (const name of ["dry-run", "publish"]) if (process.env[`npm_config_${name.replace("-", "_")}`] === "true") args.add(`--${name}`);
if (process.env.npm_config_since) args.add(`--since=${process.env.npm_config_since}`);
if (process.env.npm_config_sources) args.add(`--sources=${process.env.npm_config_sources}`);
loadEnv();

const boardDir = path.resolve(ROOT, process.env.BOARD_REPO_DIR || "../GJUBoard");
const statePath = path.join(ROOT, "data", "board-state.json");
const logPath = path.join(ROOT, "data", "board-run-log.jsonl");
const configPath = path.join(ROOT, "data", "board-config.json");
const config = { ...DEFAULT_CONFIG, ...(fs.existsSync(configPath) ? readJson(configPath) : {}) };
const berlinToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const since = [...args].find((a) => a.startsWith("--since="))?.slice(8);
if (since !== undefined) {
  const days = Math.round((Date.parse(berlinToday) - Date.parse(since)) / 86_400_000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !(days >= 0 && days <= config.keepDays)) {
    console.error(`--since needs a date as YYYY-MM-DD, from today back to ${config.keepDays} days ago. Got "${since}".`);
    process.exit(1);
  }
  config.lookbackDays = days;
}
const asked = [...args].find((a) => a.startsWith("--sources="))?.slice(10);
const sources = asked === undefined ? SOURCES : asked.split(",").map((name) => name.trim()).filter(Boolean);
if (!sources.length || sources.some((name) => !SOURCES.includes(name))) {
  console.error(`--sources takes ${SOURCES.join(" and/or ")}, separated by a comma. Got "${asked}".`);
  process.exit(1);
}
const wantFree = sources.includes("arbeitsagentur") && config.arbeitsagentur?.enabled === true; // opt-in: see lib/board-source-ba.mjs
const wantPaid = sources.includes("search");
const freeOff = "Arbeitsagentur Jobbörse: switched off. Its terms of use forbid robots and automated reading of the portal (section 2a(3)); set arbeitsagentur.enabled to true in data/board-config.json only with the agency's permission.";
if (!wantFree && !wantPaid) {
  console.error(sources.includes("arbeitsagentur") ? freeOff : "Nothing to do.");
  process.exit(1);
}

if (!fs.existsSync(path.join(boardDir, "board", "majors.json"))) {
  console.error(`No board/majors.json in ${boardDir}. Set BOARD_REPO_DIR in .env to the board repo folder.`);
  process.exit(1);
}
const majorsFile = readJson(path.join(boardDir, "board", "majors.json"));
const state = fs.existsSync(statePath) ? readJson(statePath) : {};
const windowText = (days) => `${days} days (postings from ${new Date(Date.parse(berlinToday) - days * 86_400_000).toISOString().slice(0, 10)} to ${berlinToday})`;
const freeWindow = () => windowText(lookbackForFree({ config, state, today: berlinToday }));
const paidWindow = (plan) => windowText(lookbackFor({ config, plan, state }));

if (args.has("--dry-run")) {
  console.log(`Board repo: ${boardDir}`);
  if (sources.includes("arbeitsagentur")) {
    console.log(wantFree ? `Arbeitsagentur Jobbörse (free, every area): posting age limit ${freeWindow()}.` : freeOff);
  }
  if (wantPaid) {
    const credits = await checkCredits();
    const plan = planRun({ majorsFile, state, config, credits });
    console.log(`Credit search, areas today: ${plan.areas.map((a) => `${a.area} (${a.majors.length} majors)`).join("; ")}`);
    console.log(`Job sites today: ${plan.platforms.map((p) => p.name).join(", ")}`);
    console.log(`Type groups:     ${plan.groups.map((g) => g.join("/")).join("  then  ")}`);
    console.log(`Provider call caps: ${JSON.stringify(plan.caps)} (balances: ${credits.map((c) => `${c.id}=${c.remaining ?? "unknown"}`).join(", ")})`);
    console.log(`Verify up to ${config.maxVerify} hits per site; posting age limit ${paidWindow(plan)}.`);
  }
  console.log("Dry run: nothing was searched, spent or written.");
  process.exit(0);
}

const rules = readJson(path.join(ROOT, "data", "gju-rules.json"));
const cities = readJson(path.join(ROOT, "src", "assets", "search-options.json")).cities;
const germanCities = new Set(cities.map((city) => String(city.name).toLowerCase()));

if (wantFree) console.log(`Arbeitsagentur Jobbörse (free): posting age limit ${freeWindow()}.`);
else if (asked !== undefined && sources.includes("arbeitsagentur")) console.log(freeOff); // said out loud only when it was asked for by name
if (wantPaid) console.log(`Credit search: posting age limit ${paidWindow(planRun({ majorsFile, state, config }))}.`);
const summary = await runBoard({ boardDir, statePath, rules, germanCities, openServers: openMcpServers, readCredits: checkCredits, config, today: berlinToday, sources, log: console.log });
fs.appendFileSync(logPath, `${JSON.stringify(summary)}\n`);
console.log(`Found ${summary.found}, added ${summary.added}, already known ${summary.seenAgain}, same internship on another site ${summary.duplicates}, no fit for a GJU major ${summary.notRelevant}, not an internship ${summary.notInternship}, pruned ${summary.pruned}.`);
const ba = summary.sources.arbeitsagentur;
if (ba) console.log(`Arbeitsagentur: ${ba.pages} list pages, ${ba.inWindow} entries in the window, ${ba.candidates} new internships (${ba.known} already known), ${ba.fetched} adverts read, ${ba.unavailable} gone.`);
if (wantPaid) console.log(`Areas: ${summary.areas.join("; ")}. Calls: ${JSON.stringify(summary.calls)}. Credits spent: ${JSON.stringify(summary.creditsSpent)}.`);
for (const warning of summary.warnings) console.log(`Note: ${warning}`);

if (args.has("--publish")) {
  const run = (...gitArgs) => git("git", gitArgs, { cwd: boardDir });
  await run("add", "data");
  const { stdout } = await run("status", "--porcelain", "data");
  if (!stdout.trim()) console.log("Nothing changed in the board data; nothing to publish.");
  else {
    await run("commit", "-m", `Board data ${berlinToday}`);
    const remotes = (await run("remote")).stdout.trim();
    if (remotes) { await run("push"); console.log("Published."); }
    else console.log("Committed locally. The board repo has no remote yet, so nothing was pushed.");
  }
}
