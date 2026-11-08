import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { mergeSearchResults } from "../lib/application-flow.mjs";
import { ENGINE_KEYWORDS, enginePython, requestsFor, searchWithEngine, toHit } from "../lib/engine-search.mjs";

const keywords = ["Marketing", "Data analyst", "Sales"];

const apiJob = {
  original_url: "https://www.arbeitnow.com/jobs/companies/x/marketing-1", title: "Marketing Intern", company: "Beispiel GmbH", posted_date: "2026-10-09",
  verification_status: "from_source", snippet: "Join us", workplace_type: null, industry: null,
  location: { city: null, region: null, text: "Berlin" }, salary: { min: 1200, max: null, currency: "EUR" },
  sources: [{ source_id: "arbeitnow", name: "Arbeitnow", collection_method: "api", attribution: "Jobs from Arbeitnow - link back required." }],
};
const lead = {
  original_url: "https://www.stepstone.de/stellenangebote--x--1-inline.html", title: "Praktikum Marketing", company: null, posted_date: null,
  verification_status: "unverified", snippet: "From the search engine", location: {}, salary: {},
  sources: [{ source_id: "stepstone", name: "StepStone", collection_method: "discovery", attribution: "Found with Parallel Search MCP; open the link on StepStone to check it." }],
};

// A fake engine install: only the .venv python has to exist.
function fakeEngine() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-"));
  const py = process.platform === "win32" ? path.join(dir, ".venv", "Scripts", "python.exe") : path.join(dir, ".venv", "bin", "python");
  fs.mkdirSync(path.dirname(py), { recursive: true });
  fs.writeFileSync(py, "");
  return { dir, py, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("the IT search is one engine request per keyword, for internships anywhere in Germany", () => {
  const requests = requestsFor({ days: 7 });
  assert.deepEqual(requests.map((r) => r.keywords), ENGINE_KEYWORDS.map((keyword) => [keyword]));
  assert.ok(requests.every((r) => r.country === "DE" && r.posted_within_days === 7 && !r.city && !r.workplace));
  assert.deepEqual(requests[0].employment_types, ["internship", "mandatory_internship"]);
  assert.ok(!ENGINE_KEYWORDS.some((keyword) => /^it$/i.test(keyword)), "\"it\" would match almost every advert");
  assert.equal(JSON.stringify(requestsFor()[0]).includes("posted_within_days"), false);
});

test("an engine job becomes a tracker hit; a search-engine lead stays unverified and attribution travels with it", () => {
  const hit = toHit(apiJob);
  assert.equal(hit.url, apiJob.original_url);
  assert.equal(hit.location, "Berlin");
  assert.equal(hit.salary, "1200 EUR");
  assert.equal(hit.verified, undefined);
  assert.match(hit.snippet, /link back required/);
  assert.equal(hit.data_source, "JobSearchEngine: arbeitnow api");
  const l = toHit(lead);
  assert.equal(l.verified, false);
  assert.match(l.data_source, /stepstone discovery.*\(unverified\)/);

  const merged = mergeSearchResults([], [hit, l]);
  assert.equal(merged.added, 2);
  assert.doesNotMatch(merged.rows[0].notes, /^Unverified/);
  assert.match(merged.rows[1].notes, /^Unverified search result: .*Nothing was read from the site\./);
  assert.equal(merged.rows[1].status, "To apply");
});

test("results from several requests are merged by link, source problems are reported, and a missing key is named", async () => {
  const eng = fakeEngine();
  try {
    const asked = [];
    const run = async (_py, _dir, request) => {
      asked.push(request);
      return { jobs: [apiJob, ...(request.keywords[0] === "Data analyst" ? [lead] : [])], report: { providers: [
        { source_id: "arbeitnow", status: "ok" }, { source_id: "adzuna", status: "needs_key" }, { source_id: "remotive", status: "quota" }] } };
    };
    const result = await searchWithEngine({ dir: eng.dir, run, keywords });
    assert.equal(asked.length, 3);
    assert.equal(result.jobs.length, 2); // the same API job in three answers counts once
    assert.equal(result.unverified, 1);
    assert.ok(result.warnings.some((w) => /adzuna/.test(w) && /no key/.test(w)));
    assert.ok(result.warnings.some((w) => /remotive \(quota\)/.test(w)));
    assert.ok(result.warnings.some((w) => /1 result is a search-engine lead/.test(w)));
  } finally { eng.done(); }
});

test("one failing request is a warning; all failing or a missing install is an error", async () => {
  const eng = fakeEngine();
  try {
    let n = 0;
    const flaky = async () => { if (n++ === 0) throw new Error("boom"); return { jobs: [apiJob], report: { providers: [] } }; };
    const result = await searchWithEngine({ dir: eng.dir, run: flaky, keywords });
    assert.equal(result.jobs.length, 1);
    assert.ok(result.warnings.some((w) => /Search for Marketing: boom/.test(w)));
    await assert.rejects(searchWithEngine({ dir: eng.dir, run: async () => { throw new Error("down"); }, keywords }), /down/);
  } finally { eng.done(); }
  await assert.rejects(searchWithEngine({ dir: path.join(os.tmpdir(), "no-such-engine-dir") }), /not set up/);
  assert.equal(enginePython(path.join(os.tmpdir(), "no-such-engine-dir")), null);
});

test("every new search result gets the German Year check: an internship of 20 weeks to 6 months, pay and language aside", () => {
  const hit = (n, title, snippet, url = `https://example.de/jobs/${n}`) => ({ url, title, company: "Beispiel GmbH", location: "Remote", snippet });
  const { rows, gju } = mergeSearchResults([], [
    hit(1, "Praktikum Marketing", "Dauer: 6 Monate, Vergütung 1.200 € pro Monat"),
    hit(2, "Praktikum Vertrieb", "Dauer: 3 Monate"),
    hit(3, "Pflichtpraktikum Logistik", "Start ab März", "https://jobs.example.com/3"),
    hit(4, "Werkstudent Marketing", "20 Stunden pro Woche, 6 Monate"),
    hit(5, "Praktikum Softwareentwicklung", "Unbezahlt, für 5-6 Monate. Deutsch C2 erforderlich."),
    hit(6, "Praktikum IT", "Vergütung 400 € pro Monat, Dauer 20 Wochen"),
    hit(7, "Praktikum Data", "Dauer: 12 Monate"),
  ]);
  assert.deepEqual(rows.map((r) => r.gju_check), [
    "Meets",
    "Fails: under 20 weeks",
    "Check: duration not stated", // the place is not named, and the search covers Germany only
    "Not an internship",
    "Meets", // unpaid and German C2: neither is a rule
    "Meets", // low pay is not a rule either
    "Check: longer than 6 months",
  ]);
  assert.deepEqual(gju, { Meets: 3, Fails: 1, Check: 2, "Not an internship": 1 });
});

test("the editor server's search no longer searches or opens job sites itself", () => {
  const server = fs.readFileSync(new URL("../scripts/editor-server.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(server, /searchPlatforms/);
  assert.match(server, /searchWithEngine\(/);
});
