import assert from "node:assert/strict";
import test from "node:test";

import { knownAddress } from "../lib/application-flow.mjs";
import { extractDate, isJobLink, looksLikePosting, searchNim, siteName } from "../lib/nim-agent.mjs";

const NOW = Date.parse("2026-11-08T12:00:00Z");

test("a posting date is read only where a snippet states one", () => {
  assert.equal(extractDate("Pflichtpraktikum - Veröffentlicht am 04.11.2026 - Berlin", NOW), "2026-11-04");
  assert.equal(extractDate("Aktualität: 04.11.2026", NOW), "2026-11-04");
  assert.equal(extractDate("Published: 2026-11-05", NOW), "2026-11-05");
  assert.equal(extractDate("Praktikum IT vor 3 Tagen", NOW), "2026-11-05");
  assert.equal(extractDate("vor 1 Woche", NOW), "2026-11-01");
  assert.equal(extractDate("Bewerbungsfrist: 10.11.2026", NOW), ""); // a deadline is not a posting date
  assert.equal(extractDate("", NOW), "");
});

test("site names", () => {
  assert.equal(siteName("https://www.stepstone.de/jobs/x"), "StepStone");
  assert.equal(siteName("https://de.linkedin.com/jobs/view/1"), "LinkedIn");
  assert.equal(siteName("https://jobs.bosch.de/job/1"), "jobs.bosch.de");
});

// The model asks Exa once, then answers with one real posting, one invented address and a listing page naming two postings.
test("the NIM search keeps only postings a tool returned, and dates them from the tool", async () => {
  let nvidiaCalls = 0;
  const reply = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => "" });
  const fetchImpl = async (url) => {
    if (new URL(String(url)).hostname === "integrate.api.nvidia.com") {
      nvidiaCalls++;
      if (nvidiaCalls === 1) return reply({ usage: { prompt_tokens: 10, completion_tokens: 2 }, choices: [{ message: { content: "", tool_calls: [{ id: "c1", function: { name: "exa_search", arguments: '{"query":"Praktikum Informatik"}' } }] } }] });
      return reply({ usage: { prompt_tokens: 20, completion_tokens: 30 }, choices: [{ message: { content: JSON.stringify({ postings: [
        { title: "Pflichtpraktikum Informatik", company: "Acme", location: "Berlin", url: "https://www.praktikum.info/stellenangebote/1", evidence: "Pflichtpraktikum" },
        { title: "Invented", company: "Nobody", url: "https://example.com/made-up" },
        { title: "Praktikum A", company: "B", url: "https://de.linkedin.com/jobs/praktikum-informatik-stellen" },
        { title: "Praktikum C", company: "D", url: "https://de.linkedin.com/jobs/praktikum-informatik-stellen" } ] }) } }] });
    }
    return reply({ results: [
      { title: "Pflichtpraktikum Informatik", url: "https://www.praktikum.info/stellenangebote/1", text: "Veröffentlicht am 05.11.2026 Berlin", publishedDate: null },
      { title: "Listing", url: "https://de.linkedin.com/jobs/praktikum-informatik-stellen", text: "Veröffentlicht am 01.11.2026", publishedDate: null } ] });
  };
  const { jobs } = await searchNim({ days: 7, env: { NVIDIA_API_KEY: "k", EXA_API_KEY: "k" }, fetchImpl, now: NOW, sweep: false });
  assert.deepEqual(jobs.map((j) => [j.title, j.source, j.date_posted, j.verified]), [
    ["Pflichtpraktikum Informatik", "praktikum.info", "2026-11-05", false],
    ["Praktikum A", "LinkedIn", "", false],
    ["Praktikum C", "LinkedIn", "", false] ]);
  assert.match(jobs[0].data_source, /NVIDIA NIM \(exa_search/);
});

test("no NVIDIA key is a clear error", async () => {
  await assert.rejects(searchNim({ env: {} }), /NVIDIA_API_KEY/);
});

const reply = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => "" });
const answerWith = (postings) => reply({ usage: {}, choices: [{ message: { content: JSON.stringify({ postings }) } }] });

// The model may call the allowlisted MCP tool and nothing else the server offers; its rows are dated by the tool result, and the pool is closed.
test("NIM calls the allowlisted MCP search tool and closes the pool", async () => {
  const sent = [];
  let nvidiaCalls = 0, closed = 0, opened;
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    sent.push(body);
    if (++nvidiaCalls === 1) return reply({ usage: {}, choices: [{ message: { content: "", tool_calls: [{ id: "c1", function: { name: "tinyfish_search", arguments: '{"query":"Praktikum site:praktikum.info"}' } }] } }] });
    return answerWith([{ title: "Praktikum Marketing", company: "Acme", url: "https://www.praktikum.info/p/1", evidence: "Marketing" }]);
  };
  const called = [];
  const openServers = async (names) => {
    opened = names;
    return { errorDetails: [], close: async () => { closed++; },
      tools: () => [{ name: "search", description: "web search", inputSchema: { $schema: "x", type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
        { name: "fetch", description: "opens a page", inputSchema: { type: "object", properties: {} } }],
      call: async (server, tool, args) => { called.push([server, tool, args]); return { content: [{ type: "text", text: JSON.stringify({ results: [{ title: "Praktikum Marketing", url: "https://www.praktikum.info/p/1", snippet: "Veröffentlicht am 05.11.2026 Berlin" }] }) }] }; } };
  };
  const { jobs, warnings } = await searchNim({ env: { NVIDIA_API_KEY: "k", TINYFISH_API_KEY: "k" }, fetchImpl, now: NOW, sweep: false, openServers });
  assert.deepEqual(opened, ["tinyfish"]);
  assert.deepEqual(called, [["tinyfish", "search", { query: "Praktikum site:praktikum.info" }]]);
  const names = sent[0].tools.map((t) => t.function.name);
  assert.ok(names.includes("tinyfish_search") && !names.includes("tinyfish_fetch")); // a page-opening tool is never offered
  assert.equal("$schema" in sent[0].tools.find((t) => t.function.name === "tinyfish_search").function.parameters, false);
  assert.match(sent[0].messages[0].content, /tinyfish_search/);
  assert.deepEqual(jobs.map((j) => [j.title, j.date_posted, j.verified]), [["Praktikum Marketing", "2026-11-05", false]]);
  assert.match(jobs[0].data_source, /NVIDIA NIM \(tinyfish_search/);
  assert.equal(closed, 1);
  assert.equal(warnings.length, 1);
});

// No key, no config, or a failing tool: the search still runs on its built-in tools and says what it lacked.
test("NIM without MCP still searches", async () => {
  const fetchImpl = async () => answerWith([]);
  let opens = 0;
  const openServers = async () => { opens++; throw new Error("Antigravity MCP config was not found."); };
  await searchNim({ env: { NVIDIA_API_KEY: "k" }, fetchImpl, now: NOW, sweep: false, openServers });
  assert.equal(opens, 0); // no TINYFISH_API_KEY: nothing is started
  const { warnings } = await searchNim({ env: { NVIDIA_API_KEY: "k", TINYFISH_API_KEY: "k" }, fetchImpl, now: NOW, sweep: false, openServers });
  assert.equal(opens, 1);
  assert.ok(warnings.some((w) => /could not use the MCP servers: Antigravity MCP config was not found/.test(w)));

  let n = 0, closed = 0;
  const failing = async () => ({ errorDetails: [], close: async () => { closed++; }, tools: () => [{ name: "search", description: "", inputSchema: { type: "object", properties: {} } }], call: async () => ({ isError: true, content: [] }) });
  const body = async () => (++n === 1 ? reply({ usage: {}, choices: [{ message: { content: "", tool_calls: [{ id: "c", function: { name: "tinyfish_search", arguments: "{}" } }] } }] }) : answerWith([]));
  const out = await searchNim({ env: { NVIDIA_API_KEY: "k", TINYFISH_API_KEY: "k" }, fetchImpl: body, now: NOW, sweep: false, openServers: failing });
  assert.ok(out.warnings.some((w) => /tinyfish_search: tinyfish search failed/.test(w)));
  assert.equal(closed, 1);
});

// A LinkedIn feed post ("Post not found" once it is deleted) is not a job ad: the model never sees it, so it cannot be picked.
test("LinkedIn feed posts are dropped, job pages and placeholder companies are handled", async () => {
  assert.equal(isJobLink("https://www.linkedin.com/posts/someone_praktikum-activity-7523"), false);
  assert.equal(isJobLink("https://de.linkedin.com/in/someone"), false);
  assert.equal(isJobLink("https://de.linkedin.com/jobs/view/praktikum-at-acme-4485030230"), true);
  assert.equal(isJobLink("https://de.linkedin.com/jobs/praktikum-informatik-stellen"), true);
  assert.equal(isJobLink("https://www.stepstone.de/stellenangebote--x"), true);
  let n = 0, toolMessage = "";
  const post = "https://www.linkedin.com/posts/someone_praktikum-activity-7523", job = "https://de.linkedin.com/jobs/view/praktikum-at-acme-4485030230";
  const fetchImpl = async (url, init) => {
    if (new URL(String(url)).hostname === "integrate.api.nvidia.com") {
      if (++n === 1) return reply({ usage: {}, choices: [{ message: { content: "", tool_calls: [{ id: "c", function: { name: "exa_search", arguments: '{"query":"Praktikum"}' } }] } }] });
      toolMessage = JSON.parse(init.body).messages.find((m) => m.role === "tool").content;
      return answerWith([{ title: "Shared post", company: "Not specified in snippet", url: post }, { title: "Praktikum", company: "Not specified in snippet", url: job }]);
    }
    return reply({ results: [{ title: "Shared post", url: post, text: "vor 2 Tagen" }, { title: "Praktikum", url: job, text: "Veröffentlicht am 05.11.2026" }] });
  };
  const { jobs, warnings } = await searchNim({ env: { NVIDIA_API_KEY: "k", EXA_API_KEY: "k" }, fetchImpl, now: NOW, sweep: false });
  assert.deepEqual(jobs.map((j) => [j.url, j.company]), [[job, ""]]);
  assert.ok(!toolMessage.includes("/posts/"));
  assert.ok(warnings.some((w) => /ignored 1 LinkedIn links/.test(w)));
});

// The model is told what to look for by the plan: the student's major, or any field. With no plan it is the original IT search.
test("the NIM brief comes from the search plan", async () => {
  const prompts = [];
  const fetchImpl = async (url, init) => {
    prompts.push(JSON.parse(init.body).messages[0].content);
    return { ok: true, status: 200, json: async () => ({ usage: {}, choices: [{ message: { content: '{"postings":[]}' } }] }), text: async () => "" };
  };
  const env = { NVIDIA_API_KEY: "k" };
  const plan = { nimBrief: "internships in Germany for a student of Nursing Science. Job titles: Pflege, Klinik", nimQueries: ["Praktikum Pflege", "Nursing Internship"] };
  await searchNim({ env, fetchImpl, now: NOW, sweep: false, plan });
  assert.match(prompts[0], /You search for internships in Germany for a student of Nursing Science/);
  assert.match(prompts[0], /Praktikum Pflege; Nursing Internship/);
  assert.doesNotMatch(prompts[0], /computer science|Informatik/i);
  await searchNim({ env, fetchImpl, now: NOW, sweep: false });
  assert.match(prompts[1], /IT internships .* computer science student/);
});

// ---- The site sweep: one posting from every site, dated when a search can say when it was posted ----
const STEP = "https://www.stepstone.de/stellenangebote--praktikum-informatik-m-w-d-berlin-acme--123-inline.html";
const INFO = "https://www.praktikum.info/stellenangebote/pflichtpraktikum-it-44";
const PDE = "https://www.praktikum.de/stellenangebote/praktikum-marketing-7";
const OTHER = "https://jobs.example.com/job/praktikum-vertrieb-1";

/** A scripted world: NVIDIA answers the model's rounds from `rounds`, and `engines` answer Exa/Tavily/Firecrawl/Arbeitnow by site. */
function world({ rounds, exa = () => [], tavily = () => [], firecrawl = () => [], fill = () => [] }) {
  const log = { exa: [], tavily: [], firecrawl: [], fills: 0 };
  let round = 0;
  const fetchImpl = async (url, init) => {
    const host = new URL(String(url)).hostname, body = init?.body ? JSON.parse(init.body) : {};
    if (host === "integrate.api.nvidia.com") {
      if (/^For each internship below/.test(body.messages[0].content)) { log.fills++; return reply({ usage: {}, choices: [{ message: { content: JSON.stringify({ rows: fill(JSON.parse(body.messages[1].content)) }) } }] }); }
      const next = rounds[Math.min(round++, rounds.length - 1)];
      return reply({ usage: {}, choices: [{ message: next }] });
    }
    if (host === "api.exa.ai") { log.exa.push(body.includeDomains?.[0] || ""); return reply({ results: exa(body.includeDomains?.[0] || "") }); }
    if (host === "api.tavily.com") { log.tavily.push(body.include_domains?.[0] || ""); return reply({ results: tavily(body.include_domains?.[0] || "") }); }
    if (host === "api.firecrawl.dev") { log.firecrawl.push(body.query); return reply({ data: { web: firecrawl(body.query) } }); }
    if (host === "www.arbeitnow.com") return reply({ data: [] });
    throw new Error(`unexpected request to ${host}`);
  };
  return { fetchImpl, log };
}
const nothing = [{ content: '{"postings":[]}' }];

test("the sweep keeps a dated posting per site where one exists, else one lead with no date, and names the sites with none", async () => {
  const { fetchImpl, log } = world({
    rounds: nothing,
    exa: (d) => d === "stepstone.de" ? [
      { title: "Praktikum Informatik (m/w/d)", url: STEP, text: "Acme GmbH sucht Praktikanten in Berlin", publishedDate: "2026-11-06T08:00:00Z" } ]
      : d === "praktikum.info" ? [{ title: "Altes Praktikum", url: "https://www.praktikum.info/stellenangebote/altes-praktikum-3", text: "alt", publishedDate: "2026-10-01T00:00:00Z" }]
      : d === "jobmensa.de" ? [{ title: "Jobs bei jobmensa", url: "https://www.jobmensa.de/jobs", text: "Alle Jobs", publishedDate: "2026-11-06" }] // a listing, not a posting
      : d === "linkedin.com" ? [{ title: "Shared post", url: "https://www.linkedin.com/posts/x_praktikum-activity-1", text: "Praktikum", publishedDate: "2026-11-06" }] : [],
    tavily: (d) => d === "praktikum.info" ? [{ title: "Pflichtpraktikum IT (m/w/d) bei Beta AG", url: INFO, content: "Beta AG sucht Praktikanten in Hamburg." }] : [],
    fill: (rows) => [{ url: STEP, company: "Acme GmbH", location: "Berlin" }, { url: INFO, company: "Gamma Ltd", location: "Hamburg" }].filter((r) => rows.some((x) => x.url === r.url)),
  });
  const { jobs, stats, warnings } = await searchNim({ env: { NVIDIA_API_KEY: "k", EXA_API_KEY: "k", TAVILY_API_KEY: "k" }, fetchImpl, now: NOW });
  assert.deepEqual(jobs.map((j) => [j.source, j.date_posted, Boolean(j.site_lead)]), [["praktikum.info", "", true], ["StepStone", "2026-11-06", false]]); // in the order of NIM_SITES
  assert.match(jobs[0].data_source, /site sweep: tavily_search, unverified, no posting date\)$/);
  assert.match(jobs[1].data_source, /site sweep: exa_search, unverified\)$/);
  // Employer and city are read off the row's own text: "Gamma Ltd" is not in it, so it stays blank; "Hamburg" is, so it is kept.
  assert.deepEqual(jobs.map((j) => [j.company, j.location]), [["", "Hamburg"], ["Acme GmbH", "Berlin"]]);
  assert.equal(log.fills, 1);
  assert.deepEqual([stats.sweep.sites, stats.sweep.dated, stats.sweep.leads, stats.sweep.none.length], [24, 1, 1, 22]);
  assert.ok(stats.sweep.none.includes("LinkedIn") && stats.sweep.none.includes("jobmensa"));
  assert.ok(warnings.some((w) => /site sweep: 2 of 24 sites have a posting \(1 dated, 1 without a posting date\)\. None found for: LinkedIn, Monster/.test(w)));
});

test("the sweep does not search a covered site, reuses what the model's own searches returned, and tries Firecrawl only when Exa and Tavily found nothing", async () => {
  const main = [{ content: "", tool_calls: [{ id: "c1", function: { name: "exa_search", arguments: '{"query":"Praktikum"}' } }] },
    { content: JSON.stringify({ postings: [{ title: "Praktikum Marketing (m/w/d)", company: "Delta", url: PDE, evidence: "Marketing" }, { title: "Praktikum Vertrieb (m/w/d)", company: "Eta", url: OTHER, evidence: "Vertrieb" }] }) }];
  const { fetchImpl, log } = world({
    rounds: main,
    exa: (d) => d ? [] : [ // the model's own, unrestricted search
      { title: "Praktikum Marketing (m/w/d)", url: PDE, text: "Veröffentlicht am 05.11.2026", publishedDate: null },
      { title: "Praktikum Informatik (m/w/d)", url: STEP, text: "Veröffentlicht am 06.11.2026", publishedDate: null },
      { title: "Praktikum Vertrieb (m/w/d)", url: OTHER, text: "Veröffentlicht am 05.11.2026", publishedDate: null } ], // a site outside the 24
    firecrawl: (q) => /^site:monster\.de /.test(q) ? [{ title: "Praktikum Vertrieb (m/w/d)", url: "https://www.monster.de/stellenangebote/praktikum-vertrieb-9", description: "Vertrieb" }] : [],
  });
  const env = { NVIDIA_API_KEY: "k", EXA_API_KEY: "k", TAVILY_API_KEY: "k", FIRECRAWL_API_KEY: "k" };
  const { jobs, stats } = await searchNim({ env, fetchImpl, now: NOW });
  assert.deepEqual([stats.sweep.dated, stats.sweep.leads], [2, 1]); // praktikum.de and StepStone dated, Monster a lead; the posting on example.com is not one of the 24
  assert.ok(!log.exa.includes("praktikum.de") && !log.exa.includes("stepstone.de")); // covered by the model, and by its own search results
  assert.ok(log.firecrawl.length > 0 && log.firecrawl.every((q) => !/^site:(praktikum\.de|stepstone\.de) /.test(q)));
  const by = Object.fromEntries(jobs.map((j) => [j.source, j]));
  assert.equal(by.StepStone.date_posted, "2026-11-06");
  assert.match(by.StepStone.data_source, /site sweep: exa_search/);
  assert.match(by["praktikum.de"].data_source, /^NVIDIA NIM \(exa_search, unverified\)$/); // the model's own pick is untouched
  assert.equal(by.Monster.date_posted, "");
  assert.equal(by.Monster.site_lead, true);
  assert.match(by.Monster.data_source, /site sweep: firecrawl_search, unverified, no posting date/);
  // a site that was covered is not asked again, whatever Tavily or Firecrawl would say about it
  assert.ok(!log.tavily.includes("stepstone.de") && !log.tavily.includes("praktikum.de"));
});

test("a sweep row that is not an internship, or not a posting page of that site, is never kept", async () => {
  const { fetchImpl } = world({
    rounds: nothing,
    exa: (d) => d === "stepstone.de" ? [
      { title: "Software Engineer (m/w/d)", url: "https://www.stepstone.de/stellenangebote--software-engineer-berlin-acme--5-inline.html", text: "Vollzeit", publishedDate: "2026-11-06" }, // not an internship
      { title: "Praktikum Informatik (m/w/d)", url: "https://www.example.com/stellenangebote/praktikum-informatik-1", text: "x", publishedDate: "2026-11-06" }, // another site
      { title: "Praktikum Informatik, 12 Wochen", url: "https://www.stepstone.de/stellenangebote--praktikum-informatik-berlin-acme--6-inline.html", text: "Dauer: 8 Wochen", publishedDate: "2026-11-06" } ] // under 20 weeks
      : [],
  });
  const { jobs } = await searchNim({ env: { NVIDIA_API_KEY: "k", EXA_API_KEY: "k" }, fetchImpl, now: NOW });
  assert.deepEqual(jobs, []);
});

test("the sweep skips an address the workbook already has, so a site's post is a new one", async () => {
  const other = "https://www.stepstone.de/stellenangebote--praktikum-data-m-w-d-hamburg-beta--9-inline.html";
  const { fetchImpl } = world({
    rounds: nothing,
    exa: (d) => d === "stepstone.de" ? [
      { title: "Praktikum Informatik (m/w/d)", url: STEP, text: "x", publishedDate: "2026-11-06" },
      { title: "Praktikum Data (m/w/d)", url: other, text: "x", publishedDate: "2026-11-05" } ] : [],
  });
  const env = { NVIDIA_API_KEY: "k", EXA_API_KEY: "k" };
  assert.deepEqual((await searchNim({ env, fetchImpl, now: NOW })).jobs.map((j) => j.url), [STEP]);
  const isKnown = knownAddress([{ job_url: STEP }]);
  assert.deepEqual((await searchNim({ env, fetchImpl, now: NOW, isKnown })).jobs.map((j) => j.url), [other]);
});

test("the sweep waits out one rate limit, and a title that is only a web address is no posting", async () => {
  const bare = "https://www.stepstone.de/stellenangebote--praktikum-x--1-inline.html";
  const { fetchImpl: inner } = world({
    rounds: nothing,
    exa: (d) => d === "stepstone.de" ? [
      { title: bare, url: bare, text: "x", publishedDate: "2026-11-06" },
      { title: "Praktikum Informatik (m/w/d)", url: STEP, text: "x", publishedDate: "2026-11-06" } ] : [],
  });
  let limited = 0;
  const fetchImpl = async (url, init) => (new URL(String(url)).hostname === "api.exa.ai" && !limited++
    ? { ok: false, status: 429, json: async () => ({}), text: async () => "" } // the very first Exa call is refused once
    : inner(url, init));
  const { jobs, stats } = await searchNim({ env: { NVIDIA_API_KEY: "k", EXA_API_KEY: "k" }, fetchImpl, now: NOW });
  assert.deepEqual(jobs.map((j) => j.url), [STEP]);
  assert.deepEqual(stats.errors, []); // the retry worked, so nothing is reported
});

// The titles and addresses are the ones a live search returned: category pages, an advice article and a board front page passed the URL-shape test.
test("a posting is told from a category page, a listing or an advice article by its title and address", () => {
  const no = [
    ["Praktikum Jobs - 1.868 freie Stellen verfügbar", "https://www.jobworld.de/praktikum-jobs"],
    ["Jobs praktikum bei Joboter.de - Die erfolgreiche Jobsuche", "https://www.joboter.de/jobs-praktikum.html"],
    ["Praktikum Wirtschaftsinformatik: Praktikumsplätze | connecticum", "https://www.connecticum.de/praktikum/wirtschaftsinformatik"],
    ["Pflichtpraktikum vs. freiwilliges Praktikum: Die wichtigsten Unterschiede", "https://www.praktikumsstellen.de/praktikum-ratgeber/pflichtpraktikum-vs-freiwilliges-praktikum"],
    ["Stellenangebote Praktika, Werkstudentenplätze | Trieris", "https://volksfreund.stellenanzeigen.de/stellenangebote/praktikum-werkstudent"],
    ["Praktikum 2026", "https://www.example.org/praktikum-2026"], // a year is not an id
  ];
  const yes = [
    ["Praktikum Social Media & Growth Marketing (m/w/d) | jobmensa", "https://www.jobmensa.de/jobs/ex/praktikum-social-media-growth-marketing-m-w-d"],
    ["Praktikant:in SAP IT-Consulting", "https://www.stepstone.de/stellenangebote--Praktikant-in-SAP-IT-Consulting--1-inline.html"],
    ["Praktikum Drohnenbau und Entwicklung", "https://jobs.meinestadt.de/bilshausen/standard?id=260419456"],
    ["Praktikum in der Softwareentwicklung", "https://www.praktika.de/praktikum/praktikum-in-der-softwareentwicklung-8962"],
    ["Praktikant*in Absicherung ADAS", "https://www.arbeitsagentur.de/jobsuche/jobdetail/x"],
  ];
  for (const [title, url] of no) assert.equal(looksLikePosting({ title, url }), false, title);
  for (const [title, url] of yes) assert.equal(looksLikePosting({ title, url }), true, title);
});

test("a date after today is no posting date: the row becomes an undated lead", async () => {
  const url = "https://www.arbeitsagentur.de/jobsuche/jobdetail/13151-1638241-1-S";
  const { fetchImpl } = world({
    rounds: nothing,
    exa: (d) => d === "arbeitsagentur.de" ? [{ title: "Praktikant*in Absicherung ADAS- und Fahrerassistenz", url, text: "x", publishedDate: "2026-11-16" }] : [],
  });
  const { jobs } = await searchNim({ env: { NVIDIA_API_KEY: "k", EXA_API_KEY: "k" }, fetchImpl, now: NOW });
  assert.deepEqual(jobs.map((j) => [j.url, j.date_posted, j.site_lead]), [[url, "", true]]);
});
