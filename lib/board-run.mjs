/**
 * One daily run of the public GJU board: search a rotating slice of areas and job sites within a
 * credit budget, keep only derived facts, and write the files the static site reads.
 *
 *   <boardDir>/data/postings.json   every active posting (pruned after keepDays unseen)
 *   <boardDir>/data/days/DATE.json  the postings first seen that day (history for the "download a day" button)
 *   <boardDir>/data/index.json      totals, the list of days, and what the last run covered
 *
 * Nothing here reads the student's tracker or profile.
 */
import fs from "node:fs";
import path from "node:path";

import { SKILL_LIBRARY } from "../src/assets/skill-library.js";
import { boardVocabulary, toBoardPosting } from "./board-extract.mjs";
import { DEFAULT_CONFIG, capsFromCredits, limitedServers, nextState, orderGroups, pickAreas, pickPlatforms, strategyFor } from "./board-budget.mjs";
import { SEARCH_PLATFORMS, postingKey, searchPlatforms } from "./job-search.mjs";

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } };
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 1)}\n`); };
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** The GJU numbers the page explains and checks against, copied from data/gju-rules.json so the two cannot drift. */
export function publicRules(rules) {
  return {
    minWeeks: rules.rules.minWeeks,
    minMonthlySalary: rules.rules.minMonthlySalary,
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
 * How far back a run accepts postings: an explicit lookbackDays (--since) wins; otherwise the short window,
 * except that an area never searched before gets the long backfill, since nothing of it is published yet.
 */
export const lookbackFor = ({ config, plan, state }) => config.lookbackDays ?? (plan.areas.every((a) => state.areas?.[a.area]) ? config.maxAgeDays : config.backfillDays);

/** What a run would do, without searching: used by --dry-run and to explain a skipped run. */
export function planRun({ majorsFile, state, config = DEFAULT_CONFIG, credits = [] }) {
  const areas = pickAreas(majorsFile, state, config.areasPerRun);
  const platforms = pickPlatforms(SEARCH_PLATFORMS, state, config.platformsPerRun);
  const groups = orderGroups(config.typeGroups, state);
  return { areas, platforms, groups, caps: capsFromCredits(config, credits) };
}

export async function runBoard({ boardDir, statePath, rules, germanCities, openServers, readCredits = async () => [], config = DEFAULT_CONFIG, today, search = searchPlatforms }) {
  const majorsFile = readJson(path.join(boardDir, "board", "majors.json"), null);
  if (!majorsFile) throw new Error(`No board/majors.json in ${boardDir}.`);
  const state = readJson(statePath, {});
  // Skills are named as in the profile editor's library, with the alias list for other spellings.
  const aliasFile = readJson(path.join(boardDir, "board", "skill-aliases.json"), {});
  const skills = { vocabulary: boardVocabulary(SKILL_LIBRARY, [], aliasFile.skip || []), aliases: aliasFile.aliases || {} };
  writeJson(path.join(boardDir, "data", "skills.json"), { groups: skillGroups(SKILL_LIBRARY, aliasFile.skip || []) });
  writeJson(path.join(boardDir, "data", "rules.json"), publicRules(rules));
  const creditsBefore = await readCredits();
  const plan = planRun({ majorsFile, state, config, credits: creditsBefore });
  const tally = {};
  const summary = { date: today, areas: plan.areas.map((a) => a.area), platforms: plan.platforms.map((p) => p.name), caps: plan.caps, calls: tally, found: 0, added: 0, seenAgain: 0, notInternship: 0, warnings: [], complete: true };

  if (Object.values(plan.caps).every((cap) => cap <= 0)) {
    summary.warnings.push("No credits to spend today (balances are at the reserve). Nothing was searched.");
    summary.complete = false;
    return finish({ boardDir, today, summary, newPostings: [], postings: readJson(path.join(boardDir, "data", "postings.json"), []), config, statePath, state });
  }

  const postings = readJson(path.join(boardDir, "data", "postings.json"), []);
  const byId = new Map(postings.map((p) => [p.id, p]));
  const byUrl = new Map(postings.map((p) => [postingKey(p.url) || p.url, p]));
  const ignored = new Set(state.ignored || []); // pages already verified and not publishable (not an internship, too old, no date): never paid for twice
  const majors = plan.areas.flatMap((a) => a.majors);
  const allMajors = majorsFile.majors;
  const guarded = limitedServers(openServers, plan.caps, tally);
  const newPostings = [];

  for (const types of plan.groups) {
    let result;
    try {
      result = await search(strategyFor(majors, types), { openServers: guarded, platforms: plan.platforms, maxVerify: config.maxVerify, isKnown: (key) => byUrl.has(key) || ignored.has(key), maxAgeDays: lookbackFor({ config, plan, state }) });
    } catch (error) {
      summary.warnings.push(`${types.join("/")}: ${error.message}`);
      summary.complete = false;
      continue;
    }
    summary.warnings.push(...(result.warnings || []).map((w) => `${types.join("/")}: ${w}`));
    for (const key of result.settled || []) ignored.add(key);
    for (const key of result.known || []) { const known = byUrl.get(key); if (known) { known.lastSeen = today; summary.seenAgain++; } }
    for (const hit of result.jobs || []) {
      summary.found++;
      const posting = toBoardPosting(hit, { majors: allMajors, rules, germanCities, today, skills });
      if (!posting.kind) { ignored.add(postingKey(hit.url) || hit.url); summary.notInternship++; continue; } // the board is for internships only
      const existing = byId.get(posting.id);
      if (existing) { existing.lastSeen = today; existing.majors = [...new Set([...existing.majors, ...posting.majors])]; continue; }
      byId.set(posting.id, posting);
      byUrl.set(postingKey(posting.url) || posting.url, posting);
      newPostings.push(posting);
      summary.added++;
    }
  }
  const creditsAfter = await readCredits();
  summary.creditsSpent = Object.fromEntries(creditsBefore.flatMap((b) => {
    const a = creditsAfter.find((x) => x.id === b.id);
    return b.remaining != null && a?.remaining != null ? [[b.id, b.remaining - a.remaining]] : [];
  }));
  return finish({ boardDir, today, summary, newPostings, postings: [...byId.values()], config, statePath, state, plan, ignored: [...ignored].slice(-3000) });
}

function finish({ boardDir, today, summary, newPostings, postings, config, statePath, state, plan, ignored }) {
  const kept = postings.filter((p) => daysBetween(p.lastSeen, today) <= config.keepDays)
    .sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || a.title.localeCompare(b.title));
  summary.pruned = postings.length - kept.length;
  writeJson(path.join(boardDir, "data", "postings.json"), kept);

  const dayFile = path.join(boardDir, "data", "days", `${today}.json`);
  const sameDay = readJson(dayFile, []);
  const dayPostings = [...sameDay, ...newPostings.filter((p) => !sameDay.some((q) => q.id === p.id))];
  if (dayPostings.length) writeJson(dayFile, dayPostings);

  const days = fs.existsSync(path.join(boardDir, "data", "days"))
    ? fs.readdirSync(path.join(boardDir, "data", "days")).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse()
      .map((f) => ({ date: f.slice(0, 10), count: readJson(path.join(boardDir, "data", "days", f), []).length }))
    : [];
  // Public: what was covered, not how the credits were spent (caps, calls and provider warnings stay in the private log).
  const { date, areas, platforms, found, added, complete } = summary;
  writeJson(path.join(boardDir, "data", "index.json"), { generatedAt: today, total: kept.length, days, lastRun: { date, areas, platforms, found, added, complete } });

  if (plan) writeJson(statePath, nextState(state, { areas: plan.areas, platformCount: plan.platforms.length, today, ignored }));
  return summary;
}
