/**
 * The workspace search: asks the JobSearchEngine (the sibling Python repo ../JobSearchEngine) instead of
 * searching the job sites itself.
 *
 * The engine decides what each source permits (free job APIs, published feeds, and search-engine discovery for
 * sites that forbid automated reading), so nothing here fetches a job site's pages. Its results come back as
 * "hits" for mergeSearchResults: structured records from APIs and feeds, and unverified leads from discovery.
 *
 * The engine is a separate program: it runs as a subprocess, the request goes in as JSON on stdin and one JSON
 * document comes back on stdout. No shell is involved.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { ROOT } from "./content.mjs";

const MAX_REQUESTS = 6; // one per city or the remote search; the engine caches, so a repeat costs nothing
const TIMEOUT_MS = 150_000;

/** Free-text opportunity types from the strategy -> the engine's employment types. Unknown words are left out. */
const TYPES = [
  [/pflichtpraktik/i, "mandatory_internship"],
  [/werkstudent|working student|studentische/i, "working_student"],
  [/praktik|intern/i, "internship"],
  [/trainee/i, "trainee"],
  [/ausbildung|apprentice/i, "apprenticeship"],
  [/graduate|absolvent|berufseinsteiger/i, "graduate"],
  [/freelance|freiberuf/i, "freelance"],
  [/teilzeit|part.?time/i, "part_time"],
  [/vollzeit|full.?time/i, "full_time"],
];

export const engineDir = (env = process.env) => path.resolve(env.JOBSEARCH_ENGINE_DIR || path.join(ROOT, "..", "JobSearchEngine"));

export function enginePython(dir) {
  const venv = process.platform === "win32" ? path.join(dir, ".venv", "Scripts", "python.exe") : path.join(dir, ".venv", "bin", "python");
  return fs.existsSync(venv) ? venv : null;
}

/** The engine requests for a saved strategy {roles, cities, types, anyCity?}. */
export function requestsFor(strategy, { country = "DE", user = "workspace" } = {}) {
  const clean = (list) => (list || []).map((v) => String(v).trim()).filter(Boolean);
  const keywords = clean(strategy.roles).slice(0, 20);
  const employment_types = [...new Set(clean(strategy.types).flatMap((t) => TYPES.filter(([re]) => re.test(t)).map(([, type]) => type).slice(0, 1)))];
  const base = { keywords, employment_types, country, user };
  const places = clean(strategy.cities);
  const requests = [];
  if (strategy.anyCity === true || !places.length || places.some((p) => /germany.?wide|deutschlandweit/i.test(p))) requests.push(base);
  for (const place of places) {
    if (/germany.?wide|deutschlandweit/i.test(place)) continue;
    requests.push(/^remote$/i.test(place) ? { ...base, workplace: ["remote"] } : { ...base, city: place });
  }
  return requests.slice(0, MAX_REQUESTS);
}

/** One engine job -> the hit shape mergeSearchResults reads. A search-engine lead keeps `verified: false`. */
export function toHit(job) {
  const place = job.location || {};
  const refs = job.sources || [];
  const lead = job.verification_status !== "from_source";
  const attribution = [...new Set(refs.map((s) => s.attribution).filter(Boolean))].join(" ");
  const salary = job.salary || {};
  return {
    url: job.original_url,
    title: job.title || "",
    company: job.company || "",
    location: [place.city, place.region, place.text].find(Boolean) || "",
    date_posted: job.posted_date || "",
    snippet: [job.snippet, attribution].filter(Boolean).join("\n"),
    source: refs.map((s) => s.name).join(", "),
    data_source: `JobSearchEngine: ${[...new Set(refs.map((s) => `${s.source_id} ${s.collection_method}`))].join(", ")}${lead ? " (unverified)" : ""}`,
    work_model: job.workplace_type || "",
    industry: job.industry || "",
    salary: salary.min || salary.max ? [salary.min, salary.max].filter(Boolean).join(" - ") + (salary.currency ? ` ${salary.currency}` : "") : "",
    ...(lead ? { verified: false } : {}),
  };
}

export function runEngine(python, dir, request, { execFileImpl = execFile, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFileImpl(python, ["main.py", "search", "--stdin-json", "--json"], { cwd: dir, timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, encoding: "utf8", windowsHide: true, env: { ...process.env, ...env, PYTHONIOENCODING: "utf-8" } },
      (error, stdout, stderr) => {
        if (error) return reject(new Error(String(stderr || error.message).trim().split("\n").slice(-2).join(" ") || "The search engine stopped."));
        try { resolve(JSON.parse(stdout)); } catch { reject(new Error("The search engine did not return JSON.")); }
      });
    child.stdin.end(JSON.stringify(request));
  });
}

/**
 * Runs the saved strategy through the engine. Resolves to the same shape searchPlatforms did:
 * { jobs, warnings, unavailableServers }, plus `unverified` and the engine's per-source report.
 */
export async function searchWithEngine(strategy, { dir = engineDir(), run = runEngine, country, user } = {}) {
  const python = enginePython(dir);
  if (!python) throw new Error(`The search engine is not set up: run "python -m venv .venv" and "pip install -r requirements.txt" in ${dir}, or set JOBSEARCH_ENGINE_DIR.`);
  const requests = requestsFor(strategy, { country, user });
  if (!requests.some((r) => r.keywords.length)) throw new Error("Choose at least one role to look for first.");
  const byUrl = new Map();
  const warnings = [];
  const sources = new Map();
  let answered = 0;
  for (const request of requests) {
    try {
      const out = await run(python, dir, request);
      answered++;
      for (const job of out.jobs || []) {
        const hit = toHit(job);
        if (hit.url && !byUrl.has(hit.url)) byUrl.set(hit.url, hit);
      }
      for (const p of out.report?.providers || []) {
        const seen = sources.get(p.source_id);
        if (!seen || p.status === "ok") sources.set(p.source_id, p);
      }
    } catch (error) {
      warnings.push(`Search for ${request.city || (request.workplace ? "remote jobs" : "Germany")}: ${error.message}`);
    }
  }
  if (!answered) throw new Error(warnings[0] || "The search engine did not answer.");
  const skipped = [...sources.values()].filter((p) => !["ok"].includes(p.status));
  const needsKey = skipped.filter((p) => p.status === "needs_key").map((p) => p.source_id);
  const paused = skipped.filter((p) => ["quota", "forbidden", "failed", "partial"].includes(p.status)).map((p) => `${p.source_id} (${p.status})`);
  if (paused.length) warnings.push(`Some sources did not answer: ${paused.join(", ")}.`);
  if (needsKey.length) warnings.push(`Not searched, no key set: ${needsKey.join(", ")}. See ${path.join(dir, ".env.example")}.`);
  const jobs = [...byUrl.values()];
  const unverified = jobs.filter((j) => j.verified === false).length;
  if (unverified) warnings.push(`${unverified} result${unverified === 1 ? ' is a search-engine lead' : 's are search-engine leads'}: open the link to check it is still open. Nothing was read from those sites.`);
  return { jobs, warnings, unavailableServers: [], unverified, sources: [...sources.values()] };
}
