import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { DEFAULT_CONFIG, capsFromCredits, limitedServers, nextState, orderGroups, pickAreas, pickPlatforms, strategyFor } from "../lib/board-budget.mjs";
import { lookbackFor, lookbackForFree, planRun, runBoard } from "../lib/board-run.mjs";
import { SEARCH_PLATFORMS } from "../lib/job-search.mjs";
import { mayFetch } from "../lib/source-policy.mjs";

const rules = JSON.parse(fs.readFileSync(new URL("../data/gju-rules.json", import.meta.url), "utf8"));
const berlin = (offsetDays = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - offsetDays * 86400000));
const today = berlin();

const majorsFile = {
  areas: ["Business", "Computing and data"],
  majors: [
    { id: "computer-science", name: "Computer Science", area: "Computing and data", de: ["Softwareentwicklung", "Informatik"], en: ["Software Engineering"], skills: ["Python", "SQL"] },
    { id: "logistic-sciences", name: "Logistic Sciences", area: "Business", de: ["Logistik"], en: ["Logistics"], skills: ["SAP"] },
  ],
};

function boardDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "board-"));
  fs.mkdirSync(path.join(dir, "board"), { recursive: true });
  fs.writeFileSync(path.join(dir, "board", "majors.json"), JSON.stringify(majorsFile));
  return dir;
}

const exaTool = { name: "web_search_exa", inputSchema: { properties: { query: { type: "string" }, objective: { type: "string" }, numResults: { type: "number" } }, required: ["query", "objective"] } };
const scrapeTool = { name: "firecrawl_scrape" };

/**
 * A search provider that finds two postings per site, and a scraper that proves them.
 * `pageTitle(id)` is the title the posting page itself carries; `extraResults` are more search hits per site.
 */
function fakeServers({ publishedDaysAgo = 0, pageTitle = (id) => `Praktikum Softwareentwicklung ${id} (m/w/d)`, extraResults = [] } = {}) {
  const calls = { exa: 0, firecrawl: 0 };
  const pool = {
    errors: [],
    tools: (name) => (name === "exa" ? [exaTool] : name === "firecrawl" ? [scrapeTool] : []),
    close: async () => {},
    async call(server, tool, args) {
      if (tool === "firecrawl_scrape") {
        calls.firecrawl++;
        const posting = {
          "@type": "JobPosting", title: pageTitle(new URL(args.url).searchParams.get("jobId")), url: args.url, datePosted: berlin(publishedDaysAgo),
          hiringOrganization: { name: `Firma ${new URL(args.url).hostname}` }, jobLocation: { address: { addressLocality: "Berlin" } }, // one company per site: the same company, title and city would be one internship
          description: "Dauer: 6 Monate. 1.000 € pro Monat. Deutsch B2. Python und SQL. Kontakt: hr@firma.de",
        };
        return { structuredContent: { metadata: { url: args.url, statusCode: 200 }, rawHtml: `<script type="application/ld+json">${JSON.stringify(posting)}</script>` } };
      }
      calls.exa++;
      const domain = args.query.match(/^site:([^ ]+)/)[1];
      const hits = [{ id: "A", title: "Praktikum Softwareentwicklung A" }, { id: "B", title: "Praktikum Softwareentwicklung B" }, ...extraResults];
      return { content: [{ type: "text", text: hits.map(({ id, title, text = `Beschreibung ${id}` }) => `Title: ${title}\nURL: https://${domain}/jobs?jobId=${id}\nText: ${text}`).join("\n\n") }] };
    },
  };
  return { openServers: async () => pool, calls };
}

// The free Arbeitsagentur source is off here so these tests never reach the network; its own tests inject a fake source.
const smallConfig = { ...DEFAULT_CONFIG, areasPerRun: 2, platformsPerRun: 3, caps: { exa: 50, tavily: 50, firecrawl: 50 }, reserve: {}, arbeitsagentur: { enabled: false } };
// mayFetch: true stands for sites whose terms permit reading their pages; the policy gate has its own tests below.
const noEngine = async () => ({ jobs: [], known: [], settled: [], warnings: [] }); // the engine has its own tests below; the others must not start it
const run = (dir, servers, extra = {}) => runBoard({ boardDir: dir, searchEngine: noEngine, statePath: path.join(dir, "state.json"), rules, germanCities: new Set(["berlin"]), openServers: servers.openServers, config: smallConfig, today, mayFetch: () => true, ...extra });
const read = (dir, ...parts) => JSON.parse(fs.readFileSync(path.join(dir, ...parts), "utf8"));

test("budget: caps never go below a provider's reserve, and unknown balances keep the cap", () => {
  const config = { caps: { exa: 25, tavily: 25, firecrawl: 45 }, reserve: { tavily: 100, firecrawl: 100 } };
  assert.deepEqual(capsFromCredits(config, []), config.caps);
  const caps = capsFromCredits(config, [
    { id: "firecrawl", status: "ok", remaining: 120 }, { id: "tavily", status: "ok", remaining: 100 },
    { id: "exa", status: "ok", remaining: null },
  ]);
  assert.deepEqual(caps, { exa: 25, tavily: 0, firecrawl: 20 });
  assert.equal(capsFromCredits(config, [{ id: "firecrawl", status: "no-key" }]).firecrawl, 0);
  assert.equal(capsFromCredits(config, [{ id: "firecrawl", status: "ok", remaining: 9999 }]).firecrawl, 45);
});

test("rotation: the least recently refreshed area first, sites wrap around, type groups alternate", () => {
  assert.deepEqual(pickAreas(majorsFile, {}, 1).map((a) => a.area), ["Business"]);
  assert.deepEqual(pickAreas(majorsFile, { areas: { Business: "2026-10-09" } }, 1).map((a) => a.area), ["Computing and data"]);
  assert.deepEqual(pickAreas(majorsFile, { areas: { Business: "2026-10-09", "Computing and data": "2026-10-01" } }, 1).map((a) => a.area), ["Computing and data"]);
  const names = pickPlatforms(SEARCH_PLATFORMS, { platformCursor: SEARCH_PLATFORMS.length - 1 }, 3).map((p) => p.name);
  assert.deepEqual(names, [SEARCH_PLATFORMS.at(-1).name, SEARCH_PLATFORMS[0].name, SEARCH_PLATFORMS[1].name]);
  assert.deepEqual(orderGroups([["a"], ["b"]], {}), [["a"], ["b"]]);
  assert.deepEqual(orderGroups([["a"], ["b"]], { groupCursor: 1 }), [["b"], ["a"]]);
  const next = nextState({ areas: { Business: "x" }, platformCursor: 2, groupCursor: 0 }, { areas: [{ area: "Computing and data" }], platformCount: 3, today: "2026-10-10" });
  assert.deepEqual(next, { groupCursor: 1, areas: { Business: "x", "Computing and data": "2026-10-10" }, platformCursor: 5 });
  assert.equal(strategyFor(majorsFile.majors, ["Praktikum"]).anyCity, true);
});

test("limitedServers refuses calls past a cap and counts the ones it allowed", async () => {
  const tally = {};
  const pool = await limitedServers(async () => ({ tools: () => [], close: async () => {}, call: async () => "ok" }), { exa: 2 }, tally)(["exa"]);
  await pool.call("exa", "t", {}); await pool.call("exa", "t", {});
  await assert.rejects(pool.call("exa", "t", {}), /budget for exa/);
  assert.equal(tally.exa, 2);
  assert.equal(await pool.call("firecrawl", "t", {}), "ok"); // a server without a cap is not limited
});

test("a run publishes derived facts only, within the caps, and keeps the public index free of credit details", async () => {
  const dir = boardDir();
  const servers = fakeServers();
  const summary = await run(dir, servers, { config: { ...smallConfig, caps: { exa: 50, tavily: 50, firecrawl: 50 } } });
  assert.ok(summary.added > 0, JSON.stringify(summary));
  assert.ok(summary.calls.exa <= 50 && summary.calls.firecrawl <= 50);

  const postings = read(dir, "data", "postings.json");
  assert.equal(postings.length, summary.added);
  const first = postings[0];
  assert.equal(first.country, "Germany");
  assert.deepEqual(first.weeks, { min: 26, max: 26 });
  assert.equal(first.pay.min, 1000);
  assert.equal(first.gju.overall, "meets");
  assert.ok(first.majors.includes("computer-science"));
  assert.ok(first.skills.includes("Python"));
  const published = JSON.stringify([postings, read(dir, "data", "index.json")]);
  assert.ok(!published.includes("hr@firma.de") && !published.includes("Kontakt") && !published.includes("firecrawl"), "private or internal detail leaked");

  const index = read(dir, "data", "index.json");
  assert.equal(index.total, postings.length);
  assert.equal(index.days[0].date, today);
  assert.deepEqual(Object.keys(index.lastRun).sort(), ["added", "areas", "complete", "date", "found", "platforms"]);
  assert.equal(read(dir, "data", "days", `${today}.json`).length, summary.added);
  assert.deepEqual(read(dir, "state.json").areas, { Business: today, "Computing and data": today });
});

test("a second run the same day pays nothing to verify postings it already has", async () => {
  const dir = boardDir();
  await run(dir, fakeServers());
  fs.rmSync(path.join(dir, "state.json")); // the rotation would otherwise move on to other sites, whose postings are genuinely new
  const again = fakeServers();
  const summary = await run(dir, again);
  assert.equal(summary.added, 0);
  assert.ok(summary.seenAgain > 0);
  assert.equal(again.calls.firecrawl, 0); // no scrape for known URLs
  assert.equal(read(dir, "data", "postings.json").length, read(dir, "data", "days", `${today}.json`).length);
});

test("caps are respected exactly and a capped run still finishes with what it found", async () => {
  const dir = boardDir();
  const servers = fakeServers();
  const summary = await run(dir, servers, { config: { ...smallConfig, caps: { exa: 2, tavily: 0, firecrawl: 1 } } });
  assert.ok(servers.calls.exa <= 2 && servers.calls.firecrawl <= 1, JSON.stringify(servers.calls));
  assert.ok(summary.added <= 1);
  assert.ok(fs.existsSync(path.join(dir, "data", "index.json")));
});

test("a day with nothing to spend searches nothing and says so", async () => {
  const dir = boardDir();
  const servers = fakeServers();
  const summary = await run(dir, servers, { config: { ...smallConfig, reserve: { exa: 0, tavily: 100, firecrawl: 100 }, caps: { exa: 0, tavily: 5, firecrawl: 5 } },
    readCredits: async () => [{ id: "tavily", status: "ok", remaining: 100 }, { id: "firecrawl", status: "ok", remaining: 100 }] });
  assert.equal(summary.complete, false);
  assert.match(summary.warnings[0], /No credits/);
  assert.equal(servers.calls.exa + servers.calls.firecrawl, 0);
  assert.equal(read(dir, "data", "index.json").lastRun.complete, false);
});

test("old postings are pruned and the posting age limit is honoured", async () => {
  const dir = boardDir();
  fs.mkdirSync(path.join(dir, "data"), { recursive: true });
  const old = { id: "old000000000", title: "Alt", url: "https://x.de/a", firstSeen: berlin(90), lastSeen: berlin(60), majors: [], skills: [], gju: {} };
  fs.writeFileSync(path.join(dir, "data", "postings.json"), JSON.stringify([old]));
  const stale = await run(dir, fakeServers({ publishedDaysAgo: 2 }), { config: { ...smallConfig, maxAgeDays: 0, backfillDays: 0 } });
  assert.equal(stale.added, 0); // two days old is too old when only today counts
  assert.equal(stale.pruned, 1);
  assert.deepEqual(read(dir, "data", "postings.json"), []);
  const recent = await run(dir, fakeServers({ publishedDaysAgo: 2 }), { config: { ...smallConfig, maxAgeDays: 3, backfillDays: 3 } });
  assert.ok(recent.added > 0);
});

test("the dry-run plan names the areas, sites and caps without searching", () => {
  const plan = planRun({ majorsFile, state: {}, config: smallConfig, credits: [] });
  assert.deepEqual(plan.areas.map((a) => a.area), ["Business", "Computing and data"]);
  assert.equal(plan.platforms.length, 3);
  assert.deepEqual(plan.groups, DEFAULT_CONFIG.typeGroups);
});

test("how far back a run looks: the long backfill for an area's first visit, the short window after, --since over both", async () => {
  const plan = planRun({ majorsFile, state: {}, config: smallConfig });
  const searched = { areas: Object.fromEntries(plan.areas.map((a) => [a.area, today])) };
  assert.equal(lookbackFor({ config: smallConfig, plan, state: {} }), smallConfig.backfillDays);
  assert.equal(lookbackFor({ config: smallConfig, plan, state: { areas: { [plan.areas[0].area]: today } } }), smallConfig.backfillDays); // one of the two is still new
  assert.equal(lookbackFor({ config: smallConfig, plan, state: searched }), smallConfig.maxAgeDays);
  assert.equal(lookbackFor({ config: { ...smallConfig, lookbackDays: 9 }, plan, state: searched }), 9);
  const asked = [];
  const search = async (_strategy, options) => { asked.push(options.maxAgeDays); return { jobs: [], known: [], settled: [], warnings: [] }; };
  await run(boardDir(), fakeServers(), { search, config: { ...smallConfig, lookbackDays: 9 } });
  assert.deepEqual(asked, [9]);
});

// ------------------------------------------------------------ internships only

test("only internships are published; a page that is not one is skipped and never paid for again", async () => {
  const dir = boardDir();
  // Posting B's search title says Praktikum but its page is a regular job: the page decides.
  const pageTitle = (id) => (id === "B" ? "Softwareentwickler (m/w/d)" : "Praktikum Softwareentwicklung (m/w/d)");
  const first = fakeServers({ pageTitle });
  const summary = await run(dir, first);
  assert.ok(summary.added > 0, JSON.stringify(summary));
  const postings = read(dir, "data", "postings.json");
  assert.ok(postings.length > 0 && postings.every((p) => ["Praktikum", "Pflichtpraktikum", "Internship"].includes(p.kind)));
  assert.ok(postings.every((p) => !p.url.endsWith("jobId=B")));
  // The pages for B were paid for once, then remembered as settled.
  const { ignored } = read(dir, "state.json");
  assert.ok(ignored.length > 0 && ignored.every((url) => url.endsWith("jobId=B")), JSON.stringify(ignored));

  // Search the same sites again (the rotation would move on): neither the known internships nor the skipped pages are verified.
  fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify({ ignored }));
  const again = fakeServers({ pageTitle });
  const second = await run(dir, again);
  assert.equal(again.calls.firecrawl, 0);
  assert.equal(second.notInternship, 0);
  assert.equal(second.added, 0);
});

test("the search title must name the internship before a verification credit is spent", async () => {
  const dir = boardDir();
  const servers = fakeServers({ extraResults: [{ id: "C", title: "Softwareentwickler (m/w/d)", text: "Wir bieten auch ein Praktikum an" }] });
  const summary = await run(dir, servers);
  // Two internship results per site are verified; the regular job whose snippet only mentions Praktikum is not.
  assert.equal(servers.calls.firecrawl, 2 * smallConfig.platformsPerRun);
  assert.ok(read(dir, "data", "postings.json").every((p) => !p.url.endsWith("jobId=C")));
  assert.equal(summary.notInternship, 0);
});

test("the page gets the library's skill groups, without soft skills or language names", async () => {
  const dir = boardDir();
  fs.writeFileSync(path.join(dir, "board", "skill-aliases.json"), JSON.stringify({ aliases: {}, skip: ["Teamwork", "German"] }));
  await run(dir, fakeServers());
  const { groups } = read(dir, "data", "skills.json");
  const names = groups.flatMap((g) => g.skills);
  assert.ok(groups.length >= 20 && names.includes("Patient Care") && names.includes("Microsoft Excel"));
  assert.ok(!names.includes("Teamwork") && !names.includes("German"));
  assert.equal(new Set(names.map((n) => n.toLowerCase())).size, names.length); // a skill sits in one group only
  // The page explains the GJU rules from these numbers, not from its own copy.
  assert.deepEqual(read(dir, "data", "rules.json"), { minWeeks: 20, minMonthlySalary: 861, maxRecognisedMonths: 6, handInMonths: 2, approvedCountries: ["Germany", "Austria", "Switzerland", "Luxembourg"] });
});

test("a hit that slips past the search but is not an internship is dropped by the board itself", async () => {
  const dir = boardDir();
  const job = { title: "Softwareentwickler (m/w/d)", url: "https://indeed.de/jobs?jobId=Z", company: "Firma", location: "Berlin", date_posted: today, source: "Indeed", description: "Praktikum wird auch angeboten." };
  const search = async () => ({ jobs: [job], known: [], settled: [], warnings: [] });
  const summary = await run(dir, fakeServers(), { search });
  assert.equal(summary.found, 1);
  assert.equal(summary.notInternship, 1);
  assert.equal(summary.added, 0);
  assert.deepEqual(read(dir, "data", "postings.json"), []);
  assert.ok(read(dir, "state.json").ignored.some((url) => url.includes("jobId=Z")));
});

// ------------------------------------------------------------ the free source (Arbeitsagentur), injected so nothing reaches the network

const ago = (days) => new Date(Date.parse(today) - days * 86_400_000).toISOString().slice(0, 10);
const baUrl = (n) => `https://www.arbeitsagentur.de/jobsuche/jobdetail/${n}-A-S`;
const baHit = (over = {}) => ({
  title: "Praktikum Softwareentwicklung (m/w/d)", company: "Firma GmbH", location: "Berlin, Deutschland", url: baUrl(1), date_posted: today,
  source: "Arbeitsagentur Jobbörse", data_source: "arbeitsagentur", snippet: "Softwareentwickler/in", description: "Dauer: 6 Monate. Deutsch B2. Python und SQL.", ...over,
});
/** A stand-in for fetchArbeitsagentur that returns `jobs` and remembers what it was asked. */
const fromFree = (jobs, extra = {}) => {
  const asked = [];
  const searchFree = async (options) => { asked.push(options); return { jobs, known: [], settled: [], warnings: [], stats: { notFetched: 0, fetched: jobs.length }, ...extra }; };
  return { searchFree, asked };
};
const freeConfig = { ...smallConfig, arbeitsagentur: { enabled: true } };

test("the free source fills the board without credits, keeps what fits a GJU major, and dates each internship by its publication day", async () => {
  const dir = boardDir();
  const servers = fakeServers();
  const { searchFree, asked } = fromFree([
    baHit({ date_posted: ago(4) }),
    baHit({ title: "Praktikum Friseurhandwerk (m/w/d)", url: baUrl(2), snippet: "Friseur/in", description: "Dauer: 3 Monate. Haare schneiden." }), // fits no GJU major
    baHit({ title: "Werkstudent Softwareentwicklung (m/w/d)", url: baUrl(3) }), // not an internship
  ]);
  const readCredits = async () => { throw new Error("the free source must not read credits"); };
  const summary = await run(dir, servers, { config: freeConfig, sources: ["arbeitsagentur"], searchFree, readCredits });

  assert.equal(summary.added, 1);
  assert.equal(summary.notRelevant, 1);
  assert.equal(summary.notInternship, 1);
  assert.equal(servers.calls.exa + servers.calls.firecrawl, 0);
  const [posting] = read(dir, "data", "postings.json");
  assert.equal(posting.source, "Arbeitsagentur Jobbörse");
  assert.deepEqual(posting.weeks, { min: 26, max: 26 });
  assert.equal(posting.firstSeen, ago(4)); // counts from the day it was published, so the charts and the date filter tell the truth
  assert.equal(read(dir, "data", "days", `${ago(4)}.json`).length, 1);
  assert.ok(!fs.existsSync(path.join(dir, "data", "days", `${today}.json`)));
  assert.deepEqual(read(dir, "data", "index.json").days, [{ date: ago(4), count: 1 }]);

  assert.deepEqual([asked[0].oldest, asked[0].today], [ago(DEFAULT_CONFIG.backfillDays), today]); // nothing read before: the long window
  const state = read(dir, "state.json");
  assert.equal(state.sources.arbeitsagentur.lastRun, today);
  assert.deepEqual(state.areas, {}); // the credit search did not run: no area counts as searched
  assert.ok(state.ignored.includes(baUrl(2)) && state.ignored.includes(baUrl(3))); // read and rejected: never read again
  const { lastRun } = read(dir, "data", "index.json");
  assert.deepEqual(lastRun.platforms, ["Arbeitsagentur Jobbörse"]);
  assert.deepEqual(lastRun.areas, majorsFile.areas);
});

test("with no credits left the free source still runs, and the run says the credit search was skipped", async () => {
  const dir = boardDir();
  const servers = fakeServers();
  const summary = await run(dir, servers, {
    config: { ...freeConfig, reserve: { exa: 0, tavily: 100, firecrawl: 100 }, caps: { exa: 0, tavily: 5, firecrawl: 5 } },
    readCredits: async () => [{ id: "tavily", status: "ok", remaining: 100 }, { id: "firecrawl", status: "ok", remaining: 100 }],
    searchFree: fromFree([baHit()]).searchFree,
  });
  assert.equal(summary.added, 1);
  assert.equal(summary.complete, false);
  assert.match(summary.warnings.join(" "), /No credits/);
  assert.equal(servers.calls.exa + servers.calls.firecrawl, 0);
});

test("the same internship found on another site is published once, and its second link is not read again", async () => {
  const dir = boardDir();
  await run(dir, fakeServers()); // the credit search publishes "Praktikum Softwareentwicklung A" of "Firma indeed.de" in Berlin
  const before = read(dir, "data", "postings.json");
  const twin = before.find((p) => p.company === "Firma indeed.de" && / A \(m\/w\/d\)$/.test(p.title));
  assert.ok(twin, "the fixture changed");
  const { searchFree } = fromFree([baHit({ company: twin.company, title: twin.title, url: baUrl(77) })]); // same company, title and city, a link of its own
  const summary = await run(dir, fakeServers(), { config: freeConfig, sources: ["arbeitsagentur"], searchFree });
  assert.equal(summary.added, 0);
  assert.equal(summary.duplicates, 1);
  assert.equal(read(dir, "data", "postings.json").length, before.length);
  assert.ok(read(dir, "state.json").ignored.includes(baUrl(77)));
});

test("the free source looks back to its last complete run; a run that left something unread does not move that date on", async () => {
  const state = (lastRun) => ({ sources: { arbeitsagentur: { lastRun } } });
  assert.equal(lookbackForFree({ config: freeConfig, state: {}, today }), freeConfig.backfillDays); // first run: the long window
  assert.equal(lookbackForFree({ config: freeConfig, state: state(ago(1)), today }), freeConfig.maxAgeDays); // daily: the short window
  assert.equal(lookbackForFree({ config: freeConfig, state: state(ago(6)), today }), 7); // after a gap: back to the last run
  assert.equal(lookbackForFree({ config: freeConfig, state: state(ago(40)), today }), freeConfig.backfillDays); // never beyond the backfill
  assert.equal(lookbackForFree({ config: { ...freeConfig, lookbackDays: 9 }, state: state(ago(1)), today }), 9); // --since wins

  const dir = boardDir();
  const left = fromFree([baHit()], { stats: { notFetched: 3 }, warnings: ["3 more internships were not read this run"] });
  await run(dir, fakeServers(), { config: freeConfig, sources: ["arbeitsagentur"], searchFree: left.searchFree });
  assert.equal(read(dir, "state.json").sources?.arbeitsagentur, undefined);
  const all = fromFree([baHit({ url: baUrl(5), title: "Praktikum Softwareentwicklung Zwei (m/w/d)" })]);
  await run(dir, fakeServers(), { config: freeConfig, sources: ["arbeitsagentur"], searchFree: all.searchFree });
  assert.equal(read(dir, "state.json").sources.arbeitsagentur.lastRun, today);
});

test("the sources can be chosen and switched off; a failing free source does not stop the credit search", async () => {
  const spy = fromFree([baHit()]);
  const onlyCredits = await run(boardDir(), fakeServers(), { config: freeConfig, sources: ["search"], searchFree: spy.searchFree });
  assert.equal(spy.asked.length, 0);
  assert.ok(onlyCredits.added > 0);

  const off = await run(boardDir(), fakeServers(), { config: smallConfig, searchFree: spy.searchFree }); // arbeitsagentur.enabled is false
  assert.equal(spy.asked.length, 0);
  assert.ok(off.added > 0);

  const broken = async () => { throw new Error("the Arbeitsagentur answered 403 (the service may have changed or blocked us)"); };
  const failing = await run(boardDir(), fakeServers(), { config: freeConfig, searchFree: broken });
  assert.ok(failing.added > 0); // the credit search ran
  assert.equal(failing.complete, false);
  assert.match(failing.warnings.join(" "), /Arbeitsagentur: the Arbeitsagentur answered 403/);
  assert.equal(failing.sources.arbeitsagentur, undefined);
});

// The agency's terms of use forbid robots and automated reading of its portal (section 2a(3)), so the source is opt-in and the switch is strict.
test("the free source is off unless the configuration says true: not by default, not when the setting leaves 'enabled' out", async () => {
  assert.equal(DEFAULT_CONFIG.arbeitsagentur.enabled, false);
  const spy = fromFree([baHit()]);
  for (const arbeitsagentur of [DEFAULT_CONFIG.arbeitsagentur, undefined, { maxDetails: 5 }, { enabled: "yes" }, { enabled: 1 }]) {
    const summary = await run(boardDir(), fakeServers(), { config: { ...smallConfig, arbeitsagentur }, searchFree: spy.searchFree });
    assert.ok(summary.added > 0); // the credit search still runs
  }
  assert.equal(spy.asked.length, 0);
});

// ------------------------------------------------------------ the source policy gate (data/source-access-policy.json)

test("with today's policy no search site permits automated reading, so the platform search pauses and spends nothing", async () => {
  const dir = boardDir();
  const servers = fakeServers();
  let searched = 0;
  const search = async () => { searched++; return { jobs: [], known: [], settled: [], warnings: [] }; };
  const summary = await run(dir, servers, { search, mayFetch, sources: ["search"] });
  assert.equal(searched, 0);
  assert.equal(servers.calls.exa + servers.calls.firecrawl, 0);
  assert.ok(summary.warnings.some((w) => /Platform search paused/.test(w)));
  assert.deepEqual(summary.platforms, []);
  assert.deepEqual(summary.areas, []); // nothing was searched, so no area counts as refreshed
});

test("only the permitted sites of the day are searched, and a search result whose page was not read is never published", async () => {
  const dir = boardDir();
  const asked = [];
  const job = { title: "Praktikum Softwareentwicklung (m/w/d)", url: "https://www.jobware.de/job/praktikum-1", company: "Firma", location: "Berlin", date_posted: today, source: "Jobware", verified: false };
  const search = async (_strategy, options) => { asked.push(options.platforms.map((p) => p.name)); return { jobs: [job], known: [], settled: [], warnings: [] }; };
  const permitted = (domain) => domain !== SEARCH_PLATFORMS[0].domain; // the first site of the rotation is not permitted
  const summary = await run(dir, fakeServers(), { search, mayFetch: permitted });
  assert.ok(asked.length && asked.every((names) => !names.includes(SEARCH_PLATFORMS[0].name)));
  assert.ok(summary.warnings.some((w) => w.startsWith("Not searched") && w.includes(SEARCH_PLATFORMS[0].name)));
  assert.equal(summary.found, 0);
  assert.equal(summary.added, 0);
  assert.deepEqual(read(dir, "data", "postings.json"), []);
});

// ------------------------------------------------------------ the JobSearchEngine source (free APIs that allow public display)

const engineJob = (over = {}) => ({
  original_url: "https://himalayas.app/companies/acme/jobs/praktikum-softwareentwicklung-1", title: "Praktikum Softwareentwicklung (m/w/d)", company: "Acme GmbH",
  posted_date: today, verification_status: "from_source", snippet: "Python und SQL im Backend. Dauer: 6 Monate. Vergütung 600 EUR im Monat.",
  location: { country: "Germany", text: "Germany" }, salary: {}, sources: [{ source_id: "himalayas", name: "Himalayas", collection_method: "api", attribution: "Source: Himalayas - visible link back to himalayas.app.", display: "public-with-attribution" }], ...over,
});
const engineFrom = (jobs, extra = {}) => {
  const asked = [];
  const run = async (_py, _dir, request, options) => { asked.push({ request, options }); return { jobs, report: { providers: [{ source_id: "himalayas", status: "ok" }] }, ...extra }; };
  return { run, asked };
};
const fakeEngineDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-"));
  fs.mkdirSync(path.join(dir, "config"), { recursive: true });
  fs.writeFileSync(path.join(dir, "config", "sources.json"), JSON.stringify({ sources: [
    { id: "himalayas", type: "api", display: "public-with-attribution", access: { methods: ["api"] } }, { id: "arbeitnow", type: "api", display: "personal", access: { methods: ["api"] } },
    { id: "stepstone", type: "site", domains: ["stepstone.de"], display: "link-only", access: { methods: ["discovery"] } },
    { id: "absolventa", type: "site", domains: ["absolventa.de"], display: "link-only", access: { methods: ["discovery"] } },
    { id: "linkedin", type: "site", domains: ["linkedin.com"], display: "link-only", access: { methods: ["discovery"] } },
    { id: "nopolicy", type: "site", domains: ["no-policy-entry.example"], display: "link-only", access: { methods: ["discovery"] } }] }));
  const py = process.platform === "win32" ? path.join(dir, ".venv", "Scripts", "python.exe") : path.join(dir, ".venv", "bin", "python");
  fs.mkdirSync(path.dirname(py), { recursive: true });
  fs.writeFileSync(py, "");
  return dir;
};

test("the engine source asks only public-display sources, in public mode, and keeps only structured records from them", async () => {
  const { fetchFromEngine, publicSourceIds, publishable } = await import("../lib/board-source-engine.mjs");
  const dir = fakeEngineDir();
  try {
    assert.deepEqual(publicSourceIds(dir), ["himalayas"]); // not the personal-use API, not a discovery site
    const { leadSourceIds } = await import("../lib/board-source-engine.mjs");
    assert.deepEqual(leadSourceIds(dir), ["absolventa"]); // stepstone and linkedin are forbidden, a site with no policy entry is no
    const lead = engineJob({ original_url: "https://www.stepstone.de/stellenangebote--x-1-inline.html", verification_status: "unverified", sources: [{ source_id: "stepstone", display: "link-only" }] });
    const personal = engineJob({ original_url: "https://www.arbeitnow.com/jobs/x", sources: [{ source_id: "arbeitnow", display: "personal" }] });
    const mixed = engineJob({ original_url: "https://himalayas.app/x/2", sources: [{ source_id: "himalayas", display: "public-with-attribution" }, { source_id: "arbeitnow", display: "personal" }] });
    const { run, asked } = engineFrom([engineJob(), lead, personal, mixed]);
    const result = await fetchFromEngine({ oldest: "2026-10-01", today: "2026-10-11", dir, run });
    assert.deepEqual(result.jobs.map((j) => j.source), ["Himalayas"]);
    assert.equal(result.jobs[0].verified, undefined);
    assert.equal(asked.length, 2); // "Praktikum" and "Internship"
    assert.deepEqual(asked[0].request.sources, ["himalayas", "absolventa"]); // public-display APIs, then the discovery sites the policy allows
    assert.equal(asked[0].request.posted_within_days, 10);
    assert.equal(asked[0].options.env.JOBSEARCH_DEPLOYMENT, "public");
    assert.equal([lead, personal, mixed].filter(publishable).length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a run with the engine source publishes its internships with the source name, and a second run reads them as already known", async () => {
  const dir = boardDir();
  const search = async () => ({ jobs: [], known: [], settled: [], warnings: [] });
  const searchEngine = async ({ isKnown }) => {
    const { toHit } = await import("../lib/engine-search.mjs");
    const { postingKey } = await import("../lib/job-search.mjs");
    const hit = toHit(engineJob());
    return isKnown(postingKey(hit.url)) ? { jobs: [], known: [postingKey(hit.url)], settled: [], warnings: [] } : { jobs: [hit], known: [], settled: [], warnings: [], stats: { sources: 1, answered: 1 } };
  };
  const first = await run(dir, fakeServers(), { search, searchEngine, sources: ["engine"] });
  assert.equal(first.added, 1);
  const [posting] = read(dir, "data", "postings.json");
  assert.equal(posting.source, "Himalayas");
  assert.match(posting.url, /^https:\/\/himalayas\.app\//);
  assert.ok(first.platforms.includes("JobSearchEngine"));
  const second = await run(dir, fakeServers(), { search, searchEngine, sources: ["engine"] });
  assert.equal(second.added, 0);
  assert.equal(second.seenAgain, 1);
});

test("an engine that is not installed or fails is a warning and an incomplete run, not a crash", async () => {
  const dir = boardDir();
  const summary = await run(dir, fakeServers(), { sources: ["engine"], searchEngine: async () => { throw new Error("The search engine is not set up"); } });
  assert.equal(summary.complete, false);
  assert.ok(summary.warnings.some((w) => /JobSearchEngine: The search engine is not set up/.test(w)));
});

// ------------------------------------------------------------ the local "every way" preview

test("the preview source keeps every kind of result and labels the unchecked ones; the public source keeps none of them", async () => {
  const { fetchAllFromEngine, fetchFromEngine } = await import("../lib/board-source-engine.mjs");
  const dir = fakeEngineDir();
  try {
    const lead = engineJob({ original_url: "https://www.stepstone.de/stellenangebote--Praktikum-Softwareentwicklung-1-inline.html", verification_status: "unverified",
      sources: [{ source_id: "stepstone", name: "StepStone", collection_method: "discovery", display: "link-only" }] });
    const personal = engineJob({ original_url: "https://www.arbeitnow.com/jobs/companies/x/praktikum-softwareentwicklung-2", sources: [{ source_id: "arbeitnow", name: "Arbeitnow", collection_method: "api", display: "personal" }] });
    const jobs = [engineJob(), lead, personal];
    const { run, asked } = engineFrom(jobs);
    const all = await fetchAllFromEngine({ oldest: "2026-10-01", today: "2026-10-11", dir, run });
    assert.equal(all.jobs.length, 3);
    assert.deepEqual(asked[0].request.sources, undefined); // every source, not only the public-display ones
    assert.equal(asked[0].options, undefined);             // and not in public mode
    assert.equal(all.jobs.find((j) => j.url === lead.original_url).source, "StepStone (search lead, not checked)");
    const pub = await fetchFromEngine({ oldest: "2026-10-01", today: "2026-10-11", dir, run: engineFrom(jobs).run });
    assert.equal(pub.jobs.length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("allowUnverified lets a lead onto the board page of a preview, and is off for every real run", async () => {
  const lead = { url: "https://www.stepstone.de/stellenangebote--Praktikum-Softwareentwicklung-9-inline.html", title: "Praktikum Softwareentwicklung (m/w/d)", company: "", location: "", date_posted: "",
    snippet: "Python und SQL", source: "StepStone (search lead, not checked)", verified: false };
  const searchEngine = async () => ({ jobs: [lead], known: [], settled: [], warnings: [] });
  const strict = await run(boardDir(), fakeServers(), { sources: ["engine"], searchEngine });
  assert.equal(strict.added, 0);
  assert.equal(strict.found, 0);
  const dir = boardDir();
  const preview = await run(dir, fakeServers(), { sources: ["engine"], searchEngine, allowUnverified: true });
  assert.equal(preview.added, 1);
  assert.equal(read(dir, "data", "postings.json")[0].source, "StepStone (search lead, not checked)");
});

test("the preview script never writes into the board repo and its output folder is git-ignored", () => {
  const script = fs.readFileSync(new URL("../scripts/board-preview.mjs", import.meta.url), "utf8");
  assert.match(script, /must not be built inside the board repo/);
  assert.doesNotMatch(script, /execFile|child_process|--publish|"push"|git push/); // it runs no git command and has no publish step
  assert.match(fs.readFileSync(new URL("../.gitignore", import.meta.url), "utf8"), /^\/\.board-preview\/$/m);
});

test("a lead is published only from a site the policy allows, and only as a link-only row", async () => {
  const { fetchFromEngine, leadHit, publishableLead } = await import("../lib/board-source-engine.mjs");
  const dir = fakeEngineDir();
  try {
    const lead = (id, name, url) => engineJob({ original_url: url, title: "Praktikum Softwareentwicklung (m/w/d)", company: "Quoted by the search engine", posted_date: "", verification_status: "unverified",
      collection_method: "discovery", snippet: "A sentence the search engine quoted from the page.", sources: [{ source_id: id, name, collection_method: "discovery", display: "link-only", attribution: "Found with Parallel" }] });
    const allowed = lead("absolventa", "Absolventa", "https://www.absolventa.de/stellenangebote/1-b-praktikum-softwareentwicklung");
    const forbidden = lead("stepstone", "StepStone", "https://www.stepstone.de/stellenangebote--Praktikum-Softwareentwicklung-1-inline.html");
    const linkedin = lead("linkedin", "LinkedIn", "https://de.linkedin.com/jobs/view/praktikum-softwareentwicklung-1");
    const unknown = lead("nopolicy", "Nowhere", "https://no-policy-entry.example/job/1");
    const result = await fetchFromEngine({ oldest: "2026-10-01", today: "2026-10-11", dir, run: engineFrom([allowed, forbidden, linkedin, unknown]).run });
    assert.deepEqual(result.jobs.map((j) => j.source), ["Absolventa (search lead, not checked)"]);
    const [row] = result.jobs;
    assert.equal(row.snippet, "");                          // nothing the search engine quoted from the page
    assert.equal(row.company, "");
    assert.equal(row.url, allowed.original_url);            // the link is the point
    assert.equal(row.publishLead, true);
    assert.equal(publishableLead(allowed, new Set(["absolventa"])), true);
    assert.equal(publishableLead(forbidden, new Set(["absolventa"])), false);
    assert.equal(publishableLead({ ...allowed, verification_status: "from_source", collection_method: "api" }, new Set(["absolventa"])), false); // an API record is not a lead
    assert.equal(leadHit(allowed).verified, false);
    const { internalHost } = await import("../lib/board-source-engine.mjs");
    assert.equal(internalHost("https://uno-production.absolventa.de/stellenangebote/1-b-x"), true);
    assert.equal(internalHost("https://www.absolventa.de/stellenangebote/1-b-x"), false);
    assert.equal(publishableLead(lead("absolventa", "Absolventa", "https://uno-production.absolventa.de/stellenangebote/1-b-x"), new Set(["absolventa"])), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a published lead reaches the board with its label, and the page says some rows are leads", async () => {
  const dir = boardDir();
  const lead = { url: "https://www.absolventa.de/stellenangebote/9-b-praktikum-softwareentwicklung", title: "Praktikum Softwareentwicklung (m/w/d)", company: "", location: "", date_posted: "",
    snippet: "", source: "Absolventa (search lead, not checked)", verified: false, publishLead: true };
  const unmarked = { ...lead, url: "https://www.absolventa.de/stellenangebote/10-b-praktikum-softwareentwicklung", publishLead: undefined };
  await run(dir, fakeServers(), { sources: ["engine"], searchEngine: async () => ({ jobs: [lead, unmarked], known: [], settled: [], warnings: [] }) });
  const postings = read(dir, "data", "postings.json");
  assert.deepEqual(postings.map((p) => p.source), ["Absolventa (search lead, not checked)"]); // the lead without the publishLead mark is still refused
  assert.match(read(dir, "data", "index.json").notice, /search-engine leads.*not read/);
});
