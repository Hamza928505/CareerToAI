/**
 * The board's source from the JobSearchEngine (the sibling Python repo): postings from free job APIs whose terms allow
 * showing them publicly with a credit (Himalayas, Remote OK, Jobicy, and Adzuna and others when a key is set).
 *
 * The board is public, so only what may be shown is kept:
 *  - only sources the engine registry marks display "public-with-attribution" are asked at all, and the engine runs
 *    with JOBSEARCH_DEPLOYMENT=public, so personal-use sources (Arbeitnow, Remotive, ...) are never requested;
 *  - a result is kept only if it is a structured record from such a source, never a search-engine lead;
 *  - every posting keeps its source name (the board prints "via Himalayas") and its link back to the source.
 */
import fs from "node:fs";
import path from "node:path";

import { engineDir, enginePython, runEngine, toHit } from "./engine-search.mjs";
import { postingKey } from "./job-search.mjs";

export const SOURCE_NAME = "JobSearchEngine";

/** Ids of the engine's API sources whose terms allow public display. */
export function publicSourceIds(dir = engineDir()) {
  const registry = JSON.parse(fs.readFileSync(path.join(dir, "config", "sources.json"), "utf8"));
  return registry.sources.filter((s) => s.display === "public-with-attribution" && (s.access?.methods || []).includes("api")).map((s) => s.id);
}

/** Only a structured record from sources that all allow public display may reach the board. */
export const publishable = (job) => job.verification_status === "from_source" && (job.sources || []).length > 0
  && job.sources.every((s) => s.display === "public-with-attribution");

const daysBetween = (from, to) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));

export async function fetchFromEngine({ oldest, today, isKnown = () => false, config = {}, dir = engineDir(), run = runEngine, ids } = {}) {
  const python = enginePython(dir);
  if (!python) throw new Error(`The search engine is not set up in ${dir} (see its README), so there is nothing to publish from it.`);
  const sources = ids || publicSourceIds(dir);
  if (!sources.length) throw new Error("The engine registry lists no source that allows public display.");
  const base = { employment_types: ["internship"], country: "DE", posted_within_days: daysBetween(oldest, today), sources, user: "board", max_results_per_source: config.maxResults || 50 };
  const found = new Map();
  const known = [];
  const warnings = [];
  const providers = new Map();
  let answered = 0;
  for (const keywords of [["Praktikum"], ["Internship"]]) { // the two words the sources know internships by
    try {
      const out = await run(python, dir, { ...base, keywords }, { env: { JOBSEARCH_DEPLOYMENT: "public" } });
      answered++;
      for (const job of out.jobs || []) {
        if (!publishable(job)) continue;
        const hit = toHit(job);
        const key = postingKey(hit.url);
        if (!hit.url || !key || found.has(key)) continue;
        if (isKnown(key)) known.push(key); else found.set(key, hit);
      }
      for (const p of out.report?.providers || []) if (!providers.has(p.source_id) || p.status === "ok") providers.set(p.source_id, p);
    } catch (error) {
      warnings.push(`Engine search for "${keywords[0]}": ${error.message}`);
    }
  }
  if (!answered) throw new Error(warnings[0] || "The search engine did not answer.");
  const skipped = [...providers.values()].filter((p) => p.status !== "ok");
  if (skipped.length) warnings.push(`Sources not used this run: ${skipped.map((p) => `${p.source_id} (${p.status})`).join(", ")}.`);
  return { jobs: [...found.values()], known: [...new Set(known)], settled: [], warnings, stats: { sources: sources.length, answered: [...providers.values()].filter((p) => p.status === "ok").length } };
}
