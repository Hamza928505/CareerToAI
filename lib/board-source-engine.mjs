/**
 * The board's source from the JobSearchEngine (the sibling Python repo).
 *
 * One engine run can serve two audiences:
 *  - PRIVATE (the board owner only): every source the engine searches, including APIs whose terms allow personal use
 *    only and search-engine leads for sites whose terms forbid republishing. Written to a git-ignored folder, never pushed.
 *  - PUBLIC (the board): only what may be shown to others:
 *      - a structured record from an API whose registry entry says display "public-with-attribution" (today Himalayas,
 *        Remote OK, Jobicy; The Muse with a key), keeping its source name and its link back;
 *      - a search-engine LEAD only from a site whose policy entry says publicLeads (data/source-access-policy.json: its
 *        terms AND imprint were read and say nothing against it), as a link-only row: title and link, labelled
 *        "(search lead, not checked)", never from a back-end host.
 * publicPostingRule() is the same rule for postings already on the board, so a site that changes its terms (or a
 * re-check that finds a clause) takes its rows off the board at the next run.
 */
import fs from "node:fs";
import path from "node:path";

import { engineDir, enginePython, runEngine, toHit } from "./engine-search.mjs";
import { postingKey } from "./job-search.mjs";
import { mayFetch, publicLeads } from "./source-policy.mjs";

export const SOURCE_NAME = "JobSearchEngine";
const KEYWORDS = [["Praktikum"], ["Internship"]]; // the two words the sources know internships by

const readRegistry = (dir) => JSON.parse(fs.readFileSync(path.join(dir, "config", "sources.json"), "utf8"));
const isPublicApi = (s) => s.display === "public-with-attribution" && (s.access?.methods || []).includes("api");

/** Ids of the engine's API sources whose terms allow public display. */
export function publicSourceIds(dir = engineDir()) {
  return readRegistry(dir).sources.filter(isPublicApi).map((s) => s.id);
}

/** Ids of the engine's discovery sites whose policy entry allows a link-only lead on the public board (a site with no entry: no). */
export function leadSourceIds(dir = engineDir(), isAllowed = publicLeads) {
  return readRegistry(dir).sources.filter((s) => s.type === "site" && (s.access?.methods || []).includes("discovery")
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

/**
 * Whether a posting already on the public board may stay there under today's policy. A lead stays only from a site that
 * allows public leads; a structured record only from an API host that allows public display; a page read directly (the old
 * platform search) only from a site whose terms permit automated reading, which today is none.
 */
export function publicPostingRule(dir = engineDir(), { isLeadAllowed = publicLeads, mayFetchSite = mayFetch } = {}) {
  const apiDomains = readRegistry(dir).sources.filter(isPublicApi).flatMap((s) => s.domains || []);
  return (posting) => {
    let host;
    try { host = new URL(posting.url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return false; }
    if (/search lead/.test(posting.source || "")) return isLeadAllowed(host) && !internalHost(posting.url);
    if (apiDomains.some((d) => host === d || host.endsWith(`.${d}`))) return true;
    return mayFetchSite(host);
  };
}

const daysBetween = (from, to) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));

/** The engine, asked for internships in Germany with both keywords. Returns its jobs (one per link) and per-source status. */
async function runAll({ oldest, today, dir, run, config = {}, sources, env, user }) {
  const python = enginePython(dir);
  if (!python) throw new Error(`The search engine is not set up in ${dir} (see its README).`);
  const base = { employment_types: ["internship"], country: "DE", posted_within_days: daysBetween(oldest, today), user, max_results_per_source: config.maxResults || 50, ...(sources ? { sources } : {}) };
  const jobs = new Map();
  const warnings = [];
  const providers = new Map();
  let answered = 0;
  for (const keywords of KEYWORDS) {
    try {
      const out = await run(python, dir, { ...base, keywords }, ...(env ? [{ env }] : []));
      answered++;
      for (const job of out.jobs || []) if (job.original_url && !jobs.has(job.original_url)) jobs.set(job.original_url, job);
      for (const p of out.report?.providers || []) if (!providers.has(p.source_id) || p.status === "ok") providers.set(p.source_id, p);
    } catch (error) {
      warnings.push(`Engine search for "${keywords[0]}": ${error.message}`);
    }
  }
  if (!answered) throw new Error(warnings[0] || "The search engine did not answer.");
  const skipped = [...providers.values()].filter((p) => p.status !== "ok");
  if (skipped.length) warnings.push(`Sources not used this run: ${skipped.map((p) => `${p.source_id} (${p.status})`).join(", ")}.`);
  return { jobs: [...jobs.values()], warnings, providers: [...providers.values()] };
}

/** Turns engine jobs into board hits: `pick(job)` returns the hit to keep, or null. Known postings are reported, not re-added. */
function view(raw, pick, isKnown = () => false) {
  const found = new Map();
  const known = [];
  for (const job of raw.jobs) {
    const hit = pick(job);
    if (!hit) continue;
    const key = postingKey(hit.url);
    if (!hit.url || !key || found.has(key)) continue;
    if (isKnown(key)) known.push(key); else found.set(key, hit);
  }
  const answered = raw.providers.filter((p) => p.status === "ok").length;
  return { jobs: [...found.values()], known: [...new Set(known)], settled: [], warnings: [...raw.warnings], stats: { sources: raw.providers.length, answered } };
}

const publicPick = (leadIds) => (job) => (publishable(job) ? toHit(job) : publishableLead(job, leadIds) ? leadHit(job) : null);
/** The public result alone, asking only the sources that may be published (the engine in public mode). */
export async function fetchFromEngine({ oldest, today, isKnown, config = {}, dir = engineDir(), run = runEngine, ids } = {}) {
  const apiIds = ids || publicSourceIds(dir);
  const leadIds = new Set(ids ? [] : leadSourceIds(dir));
  const sources = [...apiIds, ...leadIds];
  if (!sources.length) throw new Error("The engine registry lists no source that allows public display.");
  const raw = await runAll({ oldest, today, dir, run, config, sources, env: { JOBSEARCH_DEPLOYMENT: "public" }, user: "board" });
  return { ...view(raw, publicPick(leadIds), isKnown), stats: { sources: sources.length, answered: raw.providers.filter((p) => p.status === "ok").length } };
}
