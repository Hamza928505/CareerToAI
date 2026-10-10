import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { DEFAULT_CONFIG, capsFromCredits, limitedServers, nextState, orderGroups, pickAreas, pickPlatforms, strategyFor } from "../lib/board-budget.mjs";
import { lookbackFor, planRun, runBoard } from "../lib/board-run.mjs";
import { SEARCH_PLATFORMS } from "../lib/job-search.mjs";

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
function fakeServers({ publishedDaysAgo = 0, pageTitle = () => "Praktikum Softwareentwicklung (m/w/d)", extraResults = [] } = {}) {
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
          hiringOrganization: { name: "Firma GmbH" }, jobLocation: { address: { addressLocality: "Berlin" } },
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

const smallConfig = { ...DEFAULT_CONFIG, areasPerRun: 2, platformsPerRun: 3, caps: { exa: 50, tavily: 50, firecrawl: 50 }, reserve: {} };
const run = (dir, servers, extra = {}) => runBoard({ boardDir: dir, statePath: path.join(dir, "state.json"), rules, germanCities: new Set(["berlin"]), openServers: servers.openServers, config: smallConfig, today, ...extra });
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
  assert.deepEqual(read(dir, "data", "rules.json"), { minWeeks: 20, minMonthlySalary: 861, approvedCountries: ["Germany", "Austria", "Switzerland", "Luxembourg"] });
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
