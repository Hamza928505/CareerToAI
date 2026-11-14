import assert from "node:assert/strict";
import test from "node:test";

import { filterCompanies, nameKey, normalizeCompany, sizeBand, upsertCompanies } from "../lib/company-directory.mjs";
import { confirmBoard, createReader, detectPlatform, findCareers, findWebsite, pageLinks, parseRobots, pickCareersLink, robotsAllows } from "../lib/company-discovery.mjs";
import { companyJobs, inGermany, matchesSearch, searchCompanySites } from "../lib/company-jobs.mjs";

test("a company found twice is one record, whatever its legal form or source, and nothing known is overwritten", () => {
  assert.equal(nameKey("SAP SE"), nameKey("SAP"));
  assert.equal(nameKey("Drees & Sommer SE"), "dreessommer");
  const first = upsertCompanies([], [{ name: "SAP", source: "ATS manuals", platform: { name: "SAP SuccessFactors" } }, { name: "Celonis", website: "https://www.celonis.com", source: "Wikidata" }]);
  assert.equal(first.added, 2);
  const second = upsertCompanies(first.companies, [
    { name: "SAP SE", website: "https://www.sap.com/", industry: "Software", employees: 107000, source: "Wikidata" },
    { name: "Celonis GmbH", website: "https://celonis.com/de", industry: "Software" }, // same host
    { name: "Neu AG" },
  ]);
  assert.deepEqual([second.added, second.merged, second.companies.length], [1, 2, 3]);
  const sap = second.companies.find((c) => c.name === "SAP");
  assert.equal(sap.website, "https://www.sap.com/");
  assert.equal(sap.source, "ATS manuals"); // the first source is kept
  assert.equal(sap.platform.name, "SAP SuccessFactors");
  assert.equal(sizeBand(sap.employees), "10,000+");
  assert.deepEqual(filterCompanies(second.companies, { q: "software", size: "10,000+" }).map((c) => c.name), ["SAP"]);
  assert.equal(normalizeCompany({ name: "X", website: "javascript:alert(1)", careersUrl: "ftp://x" }).website, ""); // only web addresses are kept
});

test("robots.txt is obeyed: the longest rule decides, and our own group wins over the one for every robot", () => {
  const rules = parseRobots("User-agent: *\nDisallow: /intern/\nAllow: /intern/karriere\nDisallow: /*.pdf$\n\nUser-agent: badbot\nDisallow: /");
  assert.equal(robotsAllows(rules, "/karriere"), true);
  assert.equal(robotsAllows(rules, "/intern/akte"), false);
  assert.equal(robotsAllows(rules, "/intern/karriere/jobs"), true);
  assert.equal(robotsAllows(rules, "/files/a.pdf"), false);
  assert.equal(robotsAllows(parseRobots("User-agent: *\nDisallow:"), "/anything"), true); // an empty Disallow allows everything
  assert.equal(robotsAllows(parseRobots("User-agent: *\nAllow: /\n\nUser-agent: CareerToAI\nDisallow: /"), "/jobs"), false);
});

/** A fake web: { url: body | { status } }. Counts requests and records the pauses the reader asked for. */
function fakeWeb(pages) {
  const seen = [], waits = [];
  let clock = 0;
  const fetchImpl = async (url) => {
    seen.push(url);
    if (!(url in pages)) { if (url.endsWith("/robots.txt")) return { ok: false, status: 404, url, text: async () => "" }; throw new Error("ENOTFOUND"); }
    const page = pages[url];
    return typeof page === "string" ? { ok: true, status: 200, url, text: async () => page } : { ok: false, status: page.status, url, text: async () => "" };
  };
  const read = createReader({ fetchImpl, now: () => clock, wait: async (ms) => { waits.push(ms); clock += ms; } });
  return { read, seen, waits };
}

test("a site is read slowly and only where it allows; private addresses and prohibited job boards are never read", async () => {
  const web = fakeWeb({ "https://firma.example/robots.txt": "User-agent: *\nDisallow: /privat", "https://firma.example/": "home", "https://firma.example/karriere": "jobs" });
  assert.equal((await web.read("https://firma.example/")).ok, true);
  assert.equal((await web.read("https://firma.example/karriere")).ok, true);
  assert.deepEqual(await web.read("https://firma.example/privat/x"), { ok: false, blocked: "robots" });
  assert.equal(web.seen.filter((url) => url.endsWith("robots.txt")).length, 1); // robots.txt is asked once per site
  assert.ok(web.waits.length >= 2 && web.waits.every((ms) => ms > 0 && ms <= 2000)); // requests to one site are spaced out
  for (const url of ["http://localhost:8081/__editor/tracker", "http://127.0.0.1/", "http://192.168.1.1/", "file:///etc/passwd"]) assert.equal((await web.read(url)).ok, false, url);
  assert.equal(web.seen.some((url) => /localhost|127\.0|192\.168/.test(url)), false);
  assert.deepEqual(await web.read("https://www.linkedin.com/jobs/"), { ok: false, blocked: "policy" }); // data/source-access-policy.json
  assert.equal((await web.read("https://gibtesnicht.example/")).error, "could not connect"); // unreachable is broken, not "blocked"
});

test("the careers page is found on the company's own site and the platform behind it is recognised", async () => {
  assert.deepEqual(detectPlatform('<iframe src="https://boards.greenhouse.io/embed/job_board?for=celonis">'), { name: "Greenhouse", token: "celonis", boardUrl: "https://boards.greenhouse.io/embed/job_board?for=celonis" });
  assert.equal(detectPlatform("https://acme.jobs.personio.de/").token, "acme");
  assert.equal(detectPlatform("https://jobs.lever.co/acme/123").name, "Lever");
  assert.equal(detectPlatform("https://acme.wd3.myworkdayjobs.com/External").name, "Workday");
  assert.equal(detectPlatform("https://www.acme.de/ueber-uns"), null);

  const home = '<a href="/produkte">Produkte</a><a href="/karriere/">Karriere</a><a href="https://www.facebook.com/acme">Facebook</a><a href="/presse/jobs-studie.pdf">Jobs-Studie</a>';
  assert.equal(pickCareersLink(pageLinks(home, "https://www.acme.example/"), "https://www.acme.example/"), "https://www.acme.example/karriere/");

  const web = fakeWeb({
    "https://www.acme.example/": home,
    "https://www.acme.example/karriere/": '<h1>Karriere bei ACME</h1><a href="https://acme.jobs.personio.de/">Offene Stellen</a><a href="mailto:bewerbung@acme.example">Bewerbung per E-Mail</a>',
  });
  const company = normalizeCompany({ name: "ACME GmbH", website: "https://www.acme.example/" });
  await findWebsite(company, { read: web.read });
  await findCareers(company, { read: web.read });
  assert.deepEqual([company.websiteStatus, company.careersStatus, company.careersUrl, company.platform.name, company.platform.token], ["ok", "found", "https://www.acme.example/karriere/", "Personio", "acme"]);
  assert.deepEqual(company.applyMethods, ["Online form (Personio)", "E-mail"]);
  assert.ok(company.verifiedAt);

  // A website that does not answer is recorded as broken with the reason, and no careers page is invented for it.
  const dead = normalizeCompany({ name: "Weg AG", website: "https://weg.example/" });
  await findWebsite(dead, { read: fakeWeb({}).read });
  assert.equal(dead.websiteStatus, "broken");
  assert.match(dead.attempts.at(-1).note, /could not connect/);
  // Without a website and without a name lookup, the attempt is logged instead of guessed.
  const unknown = normalizeCompany({ name: "Ohne Seite" });
  await findWebsite(unknown, { read: web.read, lookup: async () => ({ sites: {}, error: "no Exa key" }) });
  assert.equal(unknown.website, "");
  assert.equal(unknown.attempts.at(-1).ok, false);
});

test("a platform named without the company's board is kept only when its API really lists postings under the company's name", async () => {
  const company = normalizeCompany({ name: "Celonis SE" });
  assert.deepEqual(await confirmBoard(company, "…greenhouse.io…", async (platform, token) => (platform === "Greenhouse" && token === "celonis" ? 12 : -1)), { name: "Greenhouse", token: "celonis", boardUrl: "" });
  assert.equal(await confirmBoard(company, "…greenhouse.io…", async () => -1), null);
  assert.equal(await confirmBoard(company, "no platform named here", async () => 99), null);
});

test("vacancies come from the platform's job board with their dates; jobs abroad and non-internships stay out", async () => {
  assert.equal(matchesSearch("Praktikum Softwareentwicklung (m/w/d)"), true);
  assert.equal(matchesSearch("Senior Account Executive"), false);
  assert.equal(matchesSearch("Praktikum Marketing", { words: ["Software", "Data"] }), false);
  for (const place of ["Munich, Germany", "München", "Stuttgart-Feuerbach, DE", "Berlin", ""]) assert.equal(inGermany({ location: place }), true, place);
  for (const place of ["New York, US, New York", "Paris, France", "Worcester, GB", "Remote"]) assert.equal(inGermany({ location: place }), false, place);

  const board = JSON.stringify({ jobs: [
    { id: 1, title: "Intern Software Engineering", location: { name: "Munich, Germany" }, absolute_url: "https://job-boards.greenhouse.io/acme/jobs/1", first_published: "2026-11-05T10:00:00Z" },
    { id: 2, title: "Intern Marketing", location: { name: "New York, US" }, absolute_url: "https://job-boards.greenhouse.io/acme/jobs/2", first_published: "2026-11-06T10:00:00Z" },
    { id: 3, title: "Staff Engineer", location: { name: "Berlin" }, absolute_url: "https://job-boards.greenhouse.io/acme/jobs/3", updated_at: "2026-11-01T10:00:00Z" },
  ] });
  const web = fakeWeb({ "https://boards-api.greenhouse.io/v1/boards/acme/jobs": board, "https://www.other.example/karriere": '<a href="/jobs/praktikum-it">Praktikum IT-Administration (m/w/d)</a><a href="/jobs/leiter">Leiter Vertrieb</a>' });
  const acme = normalizeCompany({ name: "ACME", platform: { name: "Greenhouse", token: "acme" }, careersStatus: "found" });
  const found = await companyJobs(acme, { read: web.read });
  assert.deepEqual(found.jobs.map((job) => [job.title, job.date_posted, job.location]), [["Intern Software Engineering", "2026-11-05", "Munich, Germany"]]);
  assert.match(found.jobs[0].data_source, /Greenhouse job board API/);

  // A company without such a platform gives undated leads from its careers page, marked as not checked.
  const other = normalizeCompany({ name: "Other", website: "https://www.other.example", careersUrl: "https://www.other.example/karriere", careersStatus: "found" });
  const leads = await companyJobs(other, { read: web.read });
  assert.deepEqual(leads.leads.map((lead) => [lead.title, lead.date_posted, lead.verified]), [["Praktikum IT-Administration (m/w/d)", "", false]]);

  // The workspace search asks only the companies with an API, and says how many answered.
  const result = await searchCompanySites({ companies: [acme, other, normalizeCompany({ name: "Gone", platform: { name: "Lever", token: "gone" } })], read: web.read });
  assert.equal(result.jobs.length, 1);
  assert.match(result.warnings[0], /asked 2 companies' job boards, 1 matching posting, 1 did not answer/);
});
