import assert from "node:assert/strict";
import test from "node:test";
import { getApplicationCapabilities, matchesSearchStrategy, runBrowserApplication, SEARCH_PLATFORMS, searchPlatforms, verifyLivePosting } from "../lib/job-search.mjs";

const strategy = { roles: ["Data analyst"], cities: ["Berlin"], types: ["Internship"] };
const exa = { name: "web_search_exa", inputSchema: { properties: { query: { type: "string" }, objective: { type: "string" }, numResults: { type: "number" } }, required: ["query", "objective"] } };
const tavily = { name: "search", inputSchema: { properties: { query: { type: "string" }, options: { properties: { includeDomains: { type: "array" }, excludeDomains: { type: "array" }, maxResults: { type: "number" }, days: { type: "number" }, timeRange: { type: "string" } } } }, required: ["query"] } };
const browser = { name: "firecrawl_interact", inputSchema: { properties: { url: { type: "string" }, prompt: { type: "string" }, timeout: { type: "number" } } } };
const scrapeTool = { name: 'firecrawl_scrape' };
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function livePage(url, date = today, statusCode = 200) {
  return { structuredContent: { metadata: { url, statusCode }, rawHtml: `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'Data analyst internship Berlin', url, datePosted: date, hiringOrganization: { name: 'Example GmbH' }, jobLocation: { address: { addressLocality: 'Berlin' } } })}</script>` } };
}
function connection(tools, call, scrape = args => livePage(args.url)) {
  let closed = 0;
  const pool = { tools: (name) => name === 'firecrawl' ? [scrapeTool, ...(tools[name] || [])] : tools[name] || [], call: (server, tool, args) => tool === 'firecrawl_scrape' ? scrape(args) : call(server, tool, args), errors: [], close: async () => { closed++; } };
  return { openServers: async () => pool, get closed() { return closed; } };
}

test("Exa text blocks load only platform URLs and retain distinct posting IDs and case", async () => {
  let calls = 0;
  const mock = connection({ exa: [exa] }, async (_server, _tool, args) => {
    calls++;
    assert.ok(args.objective);
    assert.equal(args.numResults, 10);
    const domain = args.query.match(/^site:([^ ]+)/)[1];
    return { content: [{ type: "text", text: [
      `Title: Data analyst internship Berlin A\nURL: https://${domain}/Jobs?jobId=A&utm_source=search\nText: First description`,
      `Title: Data analyst internship Berlin duplicate\nURL: https://${domain}/Jobs?jobId=A\nText: Duplicate`,
      `Title: Data analyst internship Berlin B\nURL: https://${domain}/Jobs?jobId=B\nText: Second description`,
      `Title: Data analyst internship Berlin lower\nURL: https://${domain}/jobs?jobId=A\nText: Distinct path`,
      `Title: Unrelated\nURL: https://${domain}.attacker.example/jobs\nText: Wrong domain`,
    ].join("\n\n") }] };
  });
  const result = await searchPlatforms(strategy, mock);
  assert.equal(calls, SEARCH_PLATFORMS.length);
  assert.equal(result.jobs.length, SEARCH_PLATFORMS.length * 3);
  assert.equal(result.searchedPlatforms, 20);
  assert.equal(mock.closed, 1);
  assert.ok(result.jobs.every((job) => job.snippet && !job.url.includes("attacker.example")));
});

test('search keeps direct postings and discards board home and search pages', async () => {
  const mock = connection({ exa: [exa] }, async (_server, _tool, args) => {
    const domain = args.query.match(/^site:([^ ]+)/)[1];
    const posting = domain === 'arbeitsagentur.de'
      ? `https://www.arbeitsagentur.de/jobsuche/jobdetail/10001-1003759428-S`
      : `https://${domain}/job/data-analyst-internship-12345`;
    return { structuredContent: { results: [
      { title: 'Jobs homepage', url: `https://${domain}/` },
      { title: 'Search in Berlin', url: `https://${domain}/jobs/search?city=Berlin` },
      { title: 'Berlin category', url: `https://${domain}/jobs/berlin` },
      { title: 'Data analyst internship Berlin', url: posting },
    ] } };
  });
  const result = await searchPlatforms(strategy, mock);
  assert.equal(result.jobs.length, SEARCH_PLATFORMS.length);
  assert.ok(result.jobs.every(item => item.url.endsWith('/job/data-analyst-internship-12345') || item.url.includes('/jobsuche/jobdetail/10001-1003759428-S')));
});

test('a provider returning only board pages falls back to a direct posting from another MCP', async () => {
  let fallbackCalls = 0;
  const mock = connection({ exa: [exa], tavily: [tavily] }, async (server, _tool, args) => {
    const domain = server === 'exa' ? args.query.match(/^site:([^ ]+)/)[1] : args.options.includeDomains[0];
    if (server === 'exa') return { structuredContent: { results: [{ title: 'Jobs', url: `https://${domain}/` }] } };
    fallbackCalls++;
    return { content: [{ type: 'text', text: `Data analyst internship Berlin\nA current individual role\nURL: https://${domain}/job/data-internship-12345` }] };
  });
  const result = await searchPlatforms(strategy, mock);
  assert.equal(fallbackCalls, SEARCH_PLATFORMS.length);
  assert.equal(result.jobs.length, SEARCH_PLATFORMS.length);
});

test('an old Exa page falls back to a posting published today by Tavily', async () => {
  let tavilyCalls = 0;
  const mock = connection({ exa: [exa], tavily: [tavily] }, async (server, _tool, args) => {
    const domain = server === 'exa' ? args.query.match(/^site:([^ ]+)/)[1] : args.options.includeDomains[0];
    if (server === 'tavily') {
      tavilyCalls++;
      assert.equal(args.options.days, 1);
      assert.equal(args.options.timeRange, 'day');
    }
    return { structuredContent: { results: [{ title: 'Data analyst internship Berlin', url: `https://${domain}/job/${server}-12345` }] } };
  }, args => livePage(args.url, args.url.includes('/exa-') ? '2026-02-01' : today));
  const result = await searchPlatforms(strategy, mock);
  assert.equal(tavilyCalls, SEARCH_PLATFORMS.length);
  assert.equal(result.jobs.length, SEARCH_PLATFORMS.length);
  assert.ok(result.jobs.every(job => job.url.includes('/tavily-') && job.date_posted === today));
  assert.equal(result.rejected.stale, SEARCH_PLATFORMS.length);
});

test('live posting verification rejects expired, missing-date and gone pages', () => {
  const url = 'https://indeed.de/job/data-analyst-internship-12345';
  const hit = { url, title: 'Data analyst internship Berlin' };
  assert.equal(verifyLivePosting(hit, livePage(url, '2026-02-01'), today, 'indeed.de').reason, 'stale');
  if (today === '2026-10-05') assert.equal(verifyLivePosting(hit, livePage(url, '2026-10-04T23:30:00Z'), today, 'indeed.de').job.date_posted, today);
  assert.equal(verifyLivePosting(hit, livePage(url, today, 410), today, 'indeed.de').reason, 'unavailable');
  const noDate = livePage(url);
  noDate.structuredContent.rawHtml = noDate.structuredContent.rawHtml.replace(`"datePosted":"${today}",`, '');
  assert.equal(verifyLivePosting(hit, noDate, today, 'indeed.de').reason, 'unverified');
  assert.equal(verifyLivePosting(hit, livePage('https://indeed.de/jobs'), today, 'indeed.de').reason, 'not a posting');
});

test('verified structured posting supplies only stated extra fields', () => {
  const url = 'https://indeed.de/job/backend-internship-12345';
  const page = livePage(url);
  const posting = { '@type': 'JobPosting', url, title: 'Backend internship Berlin', datePosted: today,
    hiringOrganization: { name: 'Example GmbH', url: 'https://example.org/' }, description: '<p>Build REST APIs in C#.</p>',
    skills: 'C#, SQL', validThrough: '2026-10-31', employmentType: 'PART_TIME',
    inLanguage: 'de', industry: 'Software', jobStartDate: '2026-11-01', jobBenefits: 'Flexible hours',
    applicationContact: { name: 'Hiring Team', email: 'jobs@example.org' },
    jobLocation: { address: { streetAddress: 'Main Street 1', postalCode: '10115', addressLocality: 'Berlin' } },
    baseSalary: { currency: 'EUR', value: { value: 1200, unitText: 'MONTH' } } };
  page.structuredContent.rawHtml = `<script type="application/ld+json">${JSON.stringify(posting)}</script>`;
  const result = verifyLivePosting({ url }, page, today, 'indeed.de').job;
  assert.equal(result.address, 'Main Street 1, 10115, Berlin');
  assert.equal(result.req_skills, 'C#, SQL');
  assert.equal(result.deadline, '2026-10-31');
  assert.equal(result.salary, '1200 EUR / MONTH');
  assert.equal(result.full_part, 'Part time');
  assert.match(result.description, /REST APIs in C#/);
  assert.equal(result.work_model, '');
  assert.equal(result.website, 'https://example.org/');
  assert.equal(result.posting_lang, 'de');
  assert.equal(result.start_date, '2026-11-01');
  assert.equal(result.contact_email, 'jobs@example.org');
});

test("provider failures fall back to Tavily nested inclusion filters without excluded domains", async () => {
  let fallbackCalls = 0;
  const mock = connection({ exa: [exa], tavily: [tavily] }, async (server, _tool, args) => {
    if (server === "exa") return { isError: true };
    fallbackCalls++;
    assert.deepEqual(Object.keys(args.options).sort(), ["days", "includeDomains", "maxResults", "timeRange"]);
    assert.equal(args.options.maxResults, 10);
    const domain = args.options.includeDomains[0];
    return { structuredContent: { results: [{ title: "Data analyst internship Berlin", url: `https://${domain}/role?id=123` }] } };
  });
  const result = await searchPlatforms(strategy, mock);
  assert.equal(fallbackCalls, 20);
  assert.equal(result.jobs.length, 20);
});

test("search reports a failed run instead of a successful empty tracker update", async () => {
  const mock = connection({ exa: [exa] }, async () => { throw new Error("private transport details"); });
  await assert.rejects(searchPlatforms(strategy, mock), /All platform searches failed/);
  assert.equal(mock.closed, 1);
  const empty = connection({ exa: [exa] }, async () => ({ structuredContent: { results: [] } }));
  assert.equal((await searchPlatforms(strategy, empty)).jobs.length, 0);
});

test("partial platform failures are visible and do not discard successful results", async () => {
  const mock = connection({ exa: [exa] }, async (_server, _tool, args) => {
    if (args.query.startsWith("site:indeed.de ")) return { structuredContent: { results: [{ title: "Data analyst internship Berlin", url: "https://indeed.de/job?jk=a" }] } };
    return { content: [{ type: "text", text: '{"error":"failed"}' }] };
  });
  const result = await searchPlatforms(strategy, mock);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.searchedPlatforms, 1);
  assert.match(result.warnings[0], /Could not search/);
});

test('search rejects wrong city, opportunity type, role and cookie titles', () => {
  const search = { roles:['Software Engineering','Backend'], cities:['Deggendorf'], types:['Werkstudent'] };
  const hit = { title:'Werkstudent Backend Software Deggendorf', url:'https://example.com/job/12345' };
  assert.equal(matchesSearchStrategy(hit, search), true);
  for (const title of ['Werkstudent Backend Software Dortmund', 'Software Developer Deggendorf', 'Werkstudent Marketing Deggendorf', 'Leistung und Personalisierung']) {
    assert.equal(matchesSearchStrategy({ ...hit, title }, search), false, title);
  }
});

test("capability metadata distinguishes TinyFish search from Firecrawl form automation", async () => {
  const searchOnly = connection({ tinyfish: [tavily] }, () => assert.fail("Capability checks must not execute tools"));
  assert.equal((await getApplicationCapabilities(searchOnly)).browser.available, false);
  const withBrowser = connection({ firecrawl: [browser] }, () => assert.fail("Capability checks must not execute tools"));
  assert.deepEqual((await getApplicationCapabilities(withBrowser)).browser, { available: true, server: "firecrawl", tool: "firecrawl_interact" });
});

test("browser submits through a prompt with explicit confirmation and no pretend local uploads", async () => {
  let stopped = false;
  const mock = connection({ firecrawl: [browser, { name: "firecrawl_interact_stop" }] }, async (_server, tool, args) => {
    if (tool === "firecrawl_interact_stop") { stopped = true; assert.equal(args.scrapeId, "session-123"); return {}; }
    assert.equal(args.url, "https://employer.example/apply");
    assert.match(args.prompt, /required upload is unavailable/);
    assert.doesNotMatch(args.prompt, /C:\\private/);
    assert.match(args.prompt, /Optional CV or cover letter/);
    assert.match(args.prompt, /Eligibility gate/);
    assert.match(args.prompt, /A FAIL means Blocked/);
    return { structuredContent: { scrapeId: "session-123", output: { stdout: JSON.stringify({ status: "Applied", submitted: true, confirmationSeen: true, evidence: "Thank you. Your application has been received." }), exitCode: 0 } } };
  });
  const outcome = await runBrowserApplication({ app_url: "https://employer.example/apply", cv_file: "C:\\private\\cv.pdf", status: "Needs input" }, { email: "candidate@example.test" }, mock);
  assert.equal(outcome.status, "Applied");
  assert.equal(stopped, true);
  assert.equal(mock.closed, 1);
});

test("success prose, missing evidence, false confirmation and execution errors never become Applied", async () => {
  for (const payload of [
    { output: "The application was successful" },
    { status: "Applied", submitted: true, confirmationSeen: false, evidence: "No confirmation seen" },
    { status: "Applied", submitted: false, confirmationSeen: true, evidence: "Ready to submit" },
    { status: "Applied", submitted: true, confirmationSeen: true, evidence: "" },
    { status: "Applied", submitted: true, confirmationSeen: true, evidence: "No confirmation; the application was not submitted" },
    { status: "Applied", submitted: true, confirmationSeen: true, evidence: "Submission failed with an error" },
    { exitCode: 1, output: { status: "Applied", submitted: true, confirmationSeen: true, evidence: "Thank you" } },
  ]) {
    const mock = connection({ firecrawl: [browser] }, async () => ({ structuredContent: payload }));
    assert.equal((await runBrowserApplication({ job_url: "https://employer.example/job" }, {}, mock)).status, "Needs input");
  }
  const blocked = connection({ firecrawl: [browser] }, async () => ({ content: [{ type: "text", text: JSON.stringify({ status: "Blocked", evidence: "Account login is required" }) }] }));
  assert.equal((await runBrowserApplication({ job_url: "https://employer.example/job" }, {}, blocked)).status, "Blocked");
});

test("strategy.typeInTitle makes the title, not the snippet, name the wanted type; the default is unchanged", () => {
  const item = { title: "Software Developer (m/w/d)", snippet: "Wir bieten auch ein Praktikum an", location: "Berlin", url: "https://stepstone.de/job/1" };
  const base = { roles: ["Software"], cities: ["Berlin"], types: ["Praktikum"] };
  assert.equal(matchesSearchStrategy(item, base), true); // the workspace's behaviour: the snippet is evidence too
  assert.equal(matchesSearchStrategy(item, { ...base, typeInTitle: true }), false);
  assert.equal(matchesSearchStrategy({ ...item, title: "Praktikum Software Development" }, { ...base, typeInTitle: true }), true);
  assert.equal(matchesSearchStrategy({ ...item, title: "Praktikum Software Development", location: "Hamburg" }, { ...base, typeInTitle: true }), false); // other rules still apply
  assert.equal(matchesSearchStrategy({ ...item, title: "Praktikum Software Development", location: "Hamburg" }, { ...base, typeInTitle: true, anyCity: true }), true);
});
