/**
 * Credit control for the public GJU board's daily run.
 *
 * The search spends provider credits (one search per job site plus a verifying scrape per hit), so a
 * run is capped in three ways: how many provider calls it may make, how many areas and job sites it
 * searches, and how many hits it verifies per site. Areas and sites rotate, so everything is refreshed
 * over several days instead of the whole lot being searched on day one and then never again.
 */

export const DEFAULT_CONFIG = {
  caps: { exa: 25, tavily: 25, firecrawl: 45 }, // provider calls per run
  reserve: { exa: 0, tavily: 100, firecrawl: 100 }, // credits never touched, so the key keeps working for the workspace
  areasPerRun: 1,
  platformsPerRun: 8,
  maxVerify: 2,
  maxAgeDays: 3, // normal runs accept postings up to this old
  backfillDays: 14, // the first run, with nothing published yet, looks back this far
  // The board is for internships only, so one group. (The search treats any "Werkstudent" in a type list
  // as Werkstudent-only, so adding that back would need a second group, not another word here.)
  typeGroups: [["Praktikum", "Praktikant", "Praxissemester", "Internship"]],
  keepDays: 45,
};

export class BudgetError extends Error {
  constructor(server) { super(`The daily budget for ${server} is used up.`); this.name = "BudgetError"; }
}

/**
 * An openServers() that refuses calls past a provider's cap. The existing search treats a refused call
 * as that provider being unavailable and moves on, so hitting a cap ends the run quietly instead of
 * failing it. `tally` counts the calls actually made.
 */
export function limitedServers(openServers, caps, tally = {}) {
  return async (names) => {
    const pool = await openServers(names);
    return {
      ...pool,
      tools: (name) => pool.tools(name),
      close: () => pool.close(),
      async call(server, tool, args, options) {
        const cap = caps[server];
        if (cap !== undefined && (tally[server] || 0) >= cap) throw new BudgetError(server);
        tally[server] = (tally[server] || 0) + 1;
        return pool.call(server, tool, args, options);
      },
    };
  };
}

/** The caps for today: never more than configured, and never into a provider's reserve. Unknown balance keeps the cap. */
export function capsFromCredits(config, providers = []) {
  const caps = { ...config.caps };
  for (const provider of providers) {
    if (provider.status === "no-key" && provider.id in caps) caps[provider.id] = 0;
    else if (provider.status === "ok" && provider.remaining != null && provider.id in caps) {
      caps[provider.id] = Math.max(0, Math.min(caps[provider.id], provider.remaining - (config.reserve?.[provider.id] || 0)));
    }
  }
  return caps;
}

/** Areas with their majors, least recently refreshed first (never refreshed counts as oldest). */
export function pickAreas(majorsFile, state, count) {
  const byArea = new Map(majorsFile.areas.map((area) => [area, []]));
  for (const major of majorsFile.majors) byArea.get(major.area)?.push(major);
  const refreshed = state.areas || {};
  return [...byArea.entries()]
    .filter(([, majors]) => majors.length)
    .sort((a, b) => String(refreshed[a[0]] || "").localeCompare(String(refreshed[b[0]] || "")) || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([area, majors]) => ({ area, majors }));
}

/** The next `count` job sites in a fixed rotation. */
export function pickPlatforms(all, state, count) {
  const start = (state.platformCursor || 0) % all.length;
  const n = Math.min(count, all.length);
  return Array.from({ length: n }, (_, i) => all[(start + i) % all.length]);
}

/** A search strategy for the existing searchPlatforms: job-title words of these majors, Germany-wide. */
export function strategyFor(majors, types) {
  const roles = [...new Set(majors.flatMap((major) => [...major.de.slice(0, 3), ...major.en.slice(0, 2)]))].slice(0, 60);
  return { roles, cities: ["Germany-wide"], types, anyCity: true, typeInTitle: true }; // German sites only, so no city filter; the title must name the internship before a credit is spent verifying it
}

/** The type groups in the order to try them today: the one that went second last time goes first. */
export function orderGroups(groups, state) {
  const start = (state.groupCursor || 0) % groups.length;
  return [...groups.slice(start), ...groups.slice(0, start)];
}

export function nextState(state, { areas, platformCount, today, ignored }) {
  return {
    ...((ignored ?? state.ignored) ? { ignored: ignored ?? state.ignored } : {}),
    groupCursor: (state.groupCursor || 0) + 1,
    areas: { ...state.areas, ...Object.fromEntries(areas.map(({ area }) => [area, today])) },
    platformCursor: (state.platformCursor || 0) + platformCount,
  };
}
