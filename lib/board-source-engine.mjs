/**
 * The board's source from the JobSearchEngine (the sibling Python repo): postings from free job APIs whose terms allow
 * showing them publicly with a credit (Himalayas, Remote OK, Jobicy, and Adzuna and others when a key is set).
 *
 * The board is public, so only what may be shown is kept:
 *  - only sources the engine registry marks display "public-with-attribution" are asked at all, and the engine runs
 *    with JOBSEARCH_DEPLOYMENT=public, so personal-use sources (Arbeitnow, Remotive, ...) are never requested;
 *  - a structured record is kept only from such a source;
 *  - a search-engine LEAD (a title and link from a search engine, the page never read) is kept only from a site whose policy
 *    entry says publicLeads (data/source-access-policy.json: its terms had no clause on reproducing listings), and only as a
 *    link-only row: title and link, no snippet, labelled "(search lead, not checked)". Every other site's leads are dropped;
 *  - every posting keeps its source name (the board prints "via Himalayas") and its link back to the source.
 */
import fs from "node:fs";
import path from "node:path";

import { engineDir, enginePython, runEngine, toHit } from "./engine-search.mjs";
import { postingKey } from "./job-search.mjs";
import { publicLeads } from "./source-policy.mjs";

export const SOURCE_NAME = "JobSearchEngine";

/** Ids of the engine's API sources whose terms allow public display. */
export function publicSourceIds(dir = engineDir()) {
  const registry = JSON.parse(fs.readFileSync(path.join(dir, "config", "sources.json"), "utf8"));
  return registry.sources.filter((s) => s.display === "public-with-attribution" && (s.access?.methods || []).includes("api")).map((s) => s.id);
}

/** Ids of the engine's discovery sites whose policy entry allows a link-only lead on the public board (a site with no entry: no). */
export function leadSourceIds(dir = engineDir(), isAllowed = publicLeads) {
  const registry = JSON.parse(fs.readFileSync(path.join(dir, "config", "sources.json"), "utf8"));
  return registry.sources.filter((s) => s.type === "site" && (s.access?.methods || []).includes("discovery")
    && (s.domains || []).length > 0 && s.domains.every((d) => isAllowed(d))).map((s) => s.id);
}

/** A host that looks like a site's own back end or test copy (uno-production.absolventa.de): a link there may not open for a visitor. */
export const internalHost = (url) => { try { return /(^|[.-])(production|staging|stage|dev|test|internal)\./i.test(new URL(url).hostname); } catch { return true; } };

/** A search-engine lead that may be shown as a link-only row: only from the sites in `leadIds`, and only on a public host. */
export const publishableLead = (job, leadIds) => job.verification_status !== "from_source" && job.collection_method === "discovery"
  && (job.sources || []).length > 0 && job.sources.every((s) => leadIds.has(s.source_id)) && !internalHost(job.original_url);

/** Link-only: the title and the link, nothing a search engine quoted from the page. */
export function leadHit(job) {
  const hit = toHit(job);
  return { ...hit, snippet: "", company: "", location: "", date_posted: "", salary: "", work_model: "", industry: "", publishLead: true, source: `${hit.source} (search lead, not checked)` };
}

/** Only a structured record from sources that all allow public display may reach the board. */
export const publishable = (job) => job.verification_status === "from_source" && (job.sources || []).length > 0
  && job.sources.every((s) => s.display === "public-with-attribution");

const daysBetween = (from, to) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));

export async function fetchFromEngine({ oldest, today, isKnown = () => false, config = {}, dir = engineDir(), run = runEngine, ids } = {}) {
  const python = enginePython(dir);
  if (!python) throw new Error(`The search engine is not set up in ${dir} (see its README), so there is nothing to publish from it.`);
  const apiIds = ids || publicSourceIds(dir);
  const leadIds = new Set(ids ? [] : leadSourceIds(dir));
  const sources = [...apiIds, ...leadIds];
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
        const lead = !publishable(job) && publishableLead(job, leadIds);
        if (!publishable(job) && !lead) continue;
        const hit = lead ? leadHit(job) : toHit(job);
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

/**
 * EVERY way, for a local preview only (scripts/board-preview.mjs): all engine sources, including APIs whose terms allow
 * personal use only and search-engine leads for sites that forbid automated reading. Nothing published comes from this:
 * the preview is never pushed. A lead keeps its label so the page shows it was not checked.
 */
export async function fetchAllFromEngine({ oldest, today, isKnown = () => false, dir = engineDir(), run = runEngine, config = {} } = {}) {
  const python = enginePython(dir);
  if (!python) throw new Error(`The search engine is not set up in ${dir} (see its README).`);
  const base = { employment_types: ["internship"], country: "DE", posted_within_days: daysBetween(oldest, today), user: "board-preview", max_results_per_source: config.maxResults || 50 };
  const found = new Map();
  const known = [];
  const warnings = [];
  const providers = new Map();
  let answered = 0;
  for (const keywords of [["Praktikum"], ["Internship"]]) {
    try {
      const out = await run(python, dir, { ...base, keywords });
      answered++;
      for (const job of out.jobs || []) {
        const hit = toHit(job);
        const key = postingKey(hit.url);
        if (!hit.url || !key || found.has(key)) continue;
        if (hit.verified === false) hit.source = `${hit.source} (search lead, not checked)`;
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
  const ok = [...providers.values()].filter((p) => p.status === "ok").length;
  return { jobs: [...found.values()], known: [...new Set(known)], settled: [], warnings, stats: { sources: providers.size, answered: ok } };
}
