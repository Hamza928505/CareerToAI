/**
 * One daily run of the public GJU board: read internships from two sources, keep only derived facts, and write the
 * files the static site reads.
 *
 *   arbeitsagentur  the Bundesagentur für Arbeit's Jobbörse (lib/board-source-ba.mjs): free, every area at once
 *   search          a rotating slice of areas and job sites, searched with the credit-based MCP tools within a daily budget
 *
 *   <boardDir>/data/postings.json   every active posting (pruned after keepDays unseen)
 *   <boardDir>/data/days/DATE.json  the postings first published that day (history for the "download a day" button)
 *   <boardDir>/data/index.json      totals, the list of days, and what the last run covered
 *
 * Nothing here reads the student's tracker or profile.
 */
import fs from "node:fs";
import path from "node:path";

import { SKILL_LIBRARY } from "../src/assets/skill-library.js";
import { boardVocabulary, toBoardPosting } from "./board-extract.mjs";
import { DEFAULT_CONFIG, capsFromCredits, limitedServers, nextState, orderGroups, pickAreas, pickPlatforms, strategyFor } from "./board-budget.mjs";
import { SOURCE_NAME as ARBEITSAGENTUR, fetchArbeitsagentur } from "./board-source-ba.mjs";
import { SEARCH_PLATFORMS, postingKey, searchPlatforms } from "./job-search.mjs";
import { mayFetch as mayFetchSite } from "./source-policy.mjs";
import { SOURCE_NAME as ENGINE, fetchFromEngine } from "./board-source-engine.mjs";

export const SOURCES = ["arbeitsagentur", "search", "engine"];

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } };
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 1)}\n`); };
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const LEAD_NOTICE = "Some rows are search-engine leads (marked \"search lead, not checked\" in the details): the page behind them was not read, so duration, pay and language are not stated. Open the link and check before you rely on one.";
const shiftDay = (day, days) => new Date(Date.parse(day) - days * 86_400_000).toISOString().slice(0, 10);

/** The GJU numbers the page explains and checks against, copied from data/gju-rules.json so the two cannot drift. */
export function publicRules(rules) {
  return {
    minWeeks: rules.rules.minWeeks,
    minMonthlySalary: rules.rules.minMonthlySalary,
    maxRecognisedMonths: rules.rules.maxRecognisedMonths, // the guide page explains these two as well
    handInMonths: rules.rules.handInMonths,
    approvedCountries: rules.countries.filter(([, score]) => score >= 12).map(([name]) => name),
  };
}

/** The library's groups for the page's skill menu, minus soft skills and language names; a skill sits in its first group only. */
export function skillGroups(libraryGroups, skip = []) {
  const skipped = new Set(skip.map((name) => name.toLowerCase()));
  const seen = new Set();
  return libraryGroups.map((group) => ({
    group: group.group,
    skills: group.skills.filter((name) => {
      const key = name.toLowerCase();
      if (skipped.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  })).filter((group) => group.skills.length);
}

/**
 * How far back the credit-based search accepts postings: an explicit lookbackDays (--since) wins; otherwise the short
 * window, except that an area never searched before gets the long backfill, since nothing of it is published yet.
 */
export const lookbackFor = ({ config, plan, state }) => config.lookbackDays ?? (plan.areas.every((a) => state.areas?.[a.area]) ? config.maxAgeDays : config.backfillDays);

/**
 * How far back the free source reads: an explicit lookbackDays (--since) wins; a first run takes the long backfill;
 * later runs go back to the last complete run, and never less than the short window.
 */
export function lookbackForFree({ config, state, today, source = "arbeitsagentur" }) {
  if (config.lookbackDays != null) return config.lookbackDays;
  const last = state.sources?.[source]?.lastRun;
  return last ? Math.min(config.backfillDays, Math.max(config.maxAgeDays, daysBetween(last, today) + 1)) : config.backfillDays;
}

/** What a run would do, without searching: used by --dry-run and to explain a skipped run. */
export function planRun({ majorsFile, state, config = DEFAULT_CONFIG, credits = [] }) {
  const areas = pickAreas(majorsFile, state, config.areasPerRun);
  const platforms = pickPlatforms(SEARCH_PLATFORMS, state, config.platformsPerRun);
  const groups = orderGroups(config.typeGroups, state);
  return { areas, platforms, groups, caps: capsFromCredits(config, credits) };
}

const norm = (value) => String(value || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** The same internship on two sites has two links; company, title and city identify it ("" when one is missing). */
const sameJob = (p) => { const [company, title, city] = [norm(p.company), norm(p.title), norm(p.city)]; return company && title && city ? `${company}|${title}|${city}` : ""; };
/** An internship found late (a backfill, or an advert a site keeps listing) counts from the day it was published. */
const firstSeenOf = (p, today, keepDays) => {
  const day = String(p.datePosted || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day < today && daysBetween(day, today) <= keepDays ? day : today;
};

export async function runBoard({
  boardDir, statePath, rules, germanCities, openServers, readCredits = async () => [], config = DEFAULT_CONFIG, today,
  search = searchPlatforms, sources = SOURCES, searchFree = fetchArbeitsagentur, searchEngine = fetchFromEngine, allowUnverified = false, fetchImpl, sleep, log = () => {}, mayFetch = mayFetchSite,
}) {
  const majorsFile = readJson(path.join(boardDir, "board", "majors.json"), null);
  if (!majorsFile) throw new Error(`No board/majors.json in ${boardDir}.`);
  const state = readJson(statePath, {});
  // Skills are named as in the profile editor's library, with the alias list for other spellings.
  const aliasFile = readJson(path.join(boardDir, "board", "skill-aliases.json"), {});
  const skills = { vocabulary: boardVocabulary(SKILL_LIBRARY, [], aliasFile.skip || []), aliases: aliasFile.aliases || {} };
  writeJson(path.join(boardDir, "data", "skills.json"), { groups: skillGroups(SKILL_LIBRARY, aliasFile.skip || []) });
  writeJson(path.join(boardDir, "data", "rules.json"), publicRules(rules));

  const wantFree = sources.includes("arbeitsagentur") && config.arbeitsagentur?.enabled === true; // opt-in: see lib/board-source-ba.mjs
  const wantPaid = sources.includes("search");
  const creditsBefore = wantPaid ? await readCredits() : [];
  const plan = planRun({ majorsFile, state, config, credits: creditsBefore });
  const paid = wantPaid && !Object.values(plan.caps).every((cap) => cap <= 0);
  const tally = {};
  const summary = { date: today, areas: [], platforms: [], caps: plan.caps, calls: tally, found: 0, added: 0, seenAgain: 0, notInternship: 0, notRelevant: 0, duplicates: 0, warnings: [], complete: true, sources: {} };
  if (wantPaid && !paid) {
    summary.warnings.push("No credits to spend today (balances are at the reserve), so the credit-based search was skipped.");
    summary.complete = false;
  }

  const postings = readJson(path.join(boardDir, "data", "postings.json"), []);
  const byId = new Map(postings.map((p) => [p.id, p]));
  const byUrl = new Map(postings.map((p) => [postingKey(p.url) || p.url, p]));
  const byJob = new Map(postings.map((p) => [sameJob(p), p]).filter(([job]) => job));
  const ignored = new Set(state.ignored || []); // pages already read and not publishable (not an internship, no fit, a duplicate, too old): never paid for or fetched twice
  const isKnown = (key) => byUrl.has(key) || ignored.has(key);
  const allMajors = majorsFile.majors;
  const newPostings = [];
  const sourceState = {};

  /** Turns what a source found into postings. `requireMajor`: the source lists everything, so only what fits a GJU major is kept. */
  const absorb = (result, label, { requireMajor = false } = {}) => {
    summary.warnings.push(...(result.warnings || []).map((w) => `${label}: ${w}`));
    for (const key of result.settled || []) ignored.add(key);
    for (const key of result.known || []) { const known = byUrl.get(key); if (known) { known.lastSeen = today; summary.seenAgain++; } }
    for (const hit of result.jobs || []) {
      // A search result whose page was not read is never published, except a link-only lead from a site whose policy
      // entry says publicLeads (hit.publishLead, set by lib/board-source-engine.mjs) and the local preview (allowUnverified).
      if (hit.verified === false && !allowUnverified && !hit.publishLead) continue;
      summary.found++;
      const key = postingKey(hit.url) || hit.url;
      const posting = toBoardPosting(hit, { majors: allMajors, rules, germanCities, today, skills });
      if (!posting.kind) { ignored.add(key); summary.notInternship++; continue; } // the board is for internships only
      if (requireMajor && !posting.majors.length) { ignored.add(key); summary.notRelevant++; continue; }
      const same = byId.get(posting.id);
      const job = sameJob(posting);
      const twin = same || (job ? byJob.get(job) : undefined);
      if (twin) {
        twin.lastSeen = today;
        twin.majors = [...new Set([...twin.majors, ...posting.majors])];
        if (!same) { ignored.add(key); summary.duplicates++; } // the same internship found on another site: not read again
        continue;
      }
      posting.firstSeen = firstSeenOf(posting, today, config.keepDays);
      byId.set(posting.id, posting);
      byUrl.set(postingKey(posting.url) || posting.url, posting);
      if (job) byJob.set(job, posting);
      newPostings.push(posting);
      summary.added++;
    }
  };

  if (wantFree) {
    const lookback = lookbackForFree({ config, state, today });
    try {
      const result = await searchFree({ oldest: shiftDay(today, lookback), today, isKnown, config: config.arbeitsagentur || {}, fetchImpl, sleep, log });
      absorb(result, "Arbeitsagentur", { requireMajor: true });
      summary.sources.arbeitsagentur = { lookbackDays: lookback, ...result.stats };
      summary.areas.push(...majorsFile.areas);
      summary.platforms.push(ARBEITSAGENTUR);
      // Only a run that read everything moves "last run" on, so what was left over is still inside the next run's window.
      if (!result.stats?.notFetched && !(result.warnings || []).length) sourceState.arbeitsagentur = { lastRun: today };
    } catch (error) {
      summary.warnings.push(`Arbeitsagentur: ${error.message}`);
      summary.complete = false;
    }
  }

  // The JobSearchEngine: free job APIs whose terms allow public display. Every posting keeps its source name and link.
  if (sources.includes("engine")) {
    const lookback = lookbackForFree({ config, state, today, source: "engine" });
    try {
      const result = await searchEngine({ oldest: shiftDay(today, lookback), today, isKnown, config: config.engine || {} });
      absorb(result, ENGINE, { requireMajor: true });
      summary.sources.engine = { lookbackDays: lookback, ...result.stats };
      summary.platforms.push(ENGINE);
      if (!(result.warnings || []).length) sourceState.engine = { lastRun: today };
    } catch (error) {
      summary.warnings.push(`${ENGINE}: ${error.message}`);
      summary.complete = false;
    }
  }

  // Only sites whose terms permit automated reading (data/source-access-policy.json) are searched for the board:
  // it publishes facts read from the posting page, which the other sites do not allow.
  const allowed = plan.platforms.filter((p) => mayFetch(p.domain));
  if (paid && !allowed.length) {
    summary.warnings.push("Platform search paused: none of today's sites permits automated reading (data/source-access-policy.json). No credits were spent.");
  } else if (paid && allowed.length < plan.platforms.length) {
    summary.warnings.push(`Not searched (terms do not permit automated reading): ${plan.platforms.filter((p) => !allowed.includes(p)).map((p) => p.name).join(", ")}.`);
  }

  if (paid && allowed.length) {
    const majors = plan.areas.flatMap((a) => a.majors);
    const guarded = limitedServers(openServers, plan.caps, tally);
    summary.areas.push(...plan.areas.map((a) => a.area));
    summary.platforms.push(...allowed.map((p) => p.name));
    for (const types of plan.groups) {
      let result;
      try {
        result = await search(strategyFor(majors, types), { openServers: guarded, platforms: allowed, maxVerify: config.maxVerify, isKnown, maxAgeDays: lookbackFor({ config, plan, state }), mayFetch });
      } catch (error) {
        summary.warnings.push(`${types.join("/")}: ${error.message}`);
        summary.complete = false;
        continue;
      }
      absorb(result, types.join("/"));
    }
    const creditsAfter = await readCredits();
    summary.creditsSpent = Object.fromEntries(creditsBefore.flatMap((b) => {
      const a = creditsAfter.find((x) => x.id === b.id);
      return b.remaining != null && a?.remaining != null ? [[b.id, b.remaining - a.remaining]] : [];
    }));
  }
  summary.areas = [...new Set(summary.areas)];
  summary.platforms = [...new Set(summary.platforms)];
  return finish({ boardDir, today, summary, newPostings, postings: [...byId.values()], config, statePath, state, plan: paid && allowed.length ? plan : undefined, ignored: [...ignored].slice(-10000), sourceState });
}

function finish({ boardDir, today, summary, newPostings, postings, config, statePath, state, plan, ignored, sourceState }) {
  const kept = postings.filter((p) => daysBetween(p.lastSeen, today) <= config.keepDays)
    .sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || a.title.localeCompare(b.title));
  summary.pruned = postings.length - kept.length;
  writeJson(path.join(boardDir, "data", "postings.json"), kept);

  // A day file holds the postings first published that day; an internship found late goes into the file of its own day.
  const perDay = new Map();
  for (const p of newPostings) perDay.set(p.firstSeen, [...(perDay.get(p.firstSeen) || []), p]);
  for (const [day, items] of perDay) {
    const dayFile = path.join(boardDir, "data", "days", `${day}.json`);
    const sameDay = readJson(dayFile, []);
    writeJson(dayFile, [...sameDay, ...items.filter((p) => !sameDay.some((q) => q.id === p.id))]);
  }

  const days = fs.existsSync(path.join(boardDir, "data", "days"))
    ? fs.readdirSync(path.join(boardDir, "data", "days")).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse()
      .map((f) => ({ date: f.slice(0, 10), count: readJson(path.join(boardDir, "data", "days", f), []).length }))
    : [];
  // Public: what was covered, not how the credits were spent (caps, calls and provider warnings stay in the private log).
  const { date, areas, platforms, found, added, complete } = summary;
  // A row that is only a search-engine lead is said so on the page itself, where a reader sees it.
  const notice = kept.some((p) => /search lead/.test(p.source || "")) ? LEAD_NOTICE : undefined;
  writeJson(path.join(boardDir, "data", "index.json"), { generatedAt: today, total: kept.length, days, ...(notice ? { notice } : {}), lastRun: { date, areas, platforms, found, added, complete } });

  writeJson(statePath, nextState(state, { areas: plan?.areas ?? [], platformCount: plan?.platforms.length ?? 0, today, ignored, sources: sourceState }));
  return summary;
}
