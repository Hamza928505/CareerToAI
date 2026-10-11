import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { mergeSearchResults } from "../lib/application-flow.mjs";
import { enginePython, requestsFor, searchWithEngine, toHit } from "../lib/engine-search.mjs";

const strategy = { roles: ["Marketing", "Data analyst"], cities: ["Berlin", "Remote", "Hamburg"], types: ["Werkstudent", "Praktikum", "Something odd"] };

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

test("a strategy becomes one engine request per place, with types mapped and unknown words left out", () => {
  const requests = requestsFor(strategy);
  assert.deepEqual(requests.map((r) => r.city || (r.workplace ? "remote" : "country")), ["Berlin", "remote", "Hamburg"]);
  assert.deepEqual(requests[0].employment_types, ["working_student", "internship"]);
  assert.deepEqual(requests[0].keywords, ["Marketing", "Data analyst"]);
  assert.equal(requests[0].country, "DE");
  assert.deepEqual(requests[1].workplace, ["remote"]);
  assert.deepEqual(requestsFor({ roles: ["x"], cities: ["Germany-wide"], types: ["Praktikum"] }).map((r) => r.city), [undefined]);
  assert.deepEqual(requestsFor({ roles: ["x"], cities: ["Berlin"], types: ["Praktikum"], anyCity: true }).map((r) => r.city), [undefined, "Berlin"]);
  assert.equal(requestsFor({ roles: ["x"], cities: Array.from({ length: 30 }, (_, i) => `City${i}`), types: [] }).length, 6);
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
      return { jobs: [apiJob, ...(request.city === "Berlin" ? [lead] : [])], report: { providers: [
        { source_id: "arbeitnow", status: "ok" }, { source_id: "adzuna", status: "needs_key" }, { source_id: "remotive", status: "quota" }] } };
    };
    const result = await searchWithEngine(strategy, { dir: eng.dir, run });
    assert.equal(asked.length, 3);
    assert.equal(result.jobs.length, 2); // the same API job in three answers counts once
    assert.equal(result.unverified, 1);
    assert.ok(result.warnings.some((w) => /adzuna/.test(w) && /no key/.test(w)));
    assert.ok(result.warnings.some((w) => /remotive \(quota\)/.test(w)));
    assert.ok(result.warnings.some((w) => /1 result is a search-engine lead/.test(w)));
  } finally { eng.done(); }
});

test("one failing request is a warning; all failing, a missing install or no roles is an error", async () => {
  const eng = fakeEngine();
  try {
    let n = 0;
    const flaky = async () => { if (n++ === 0) throw new Error("boom"); return { jobs: [apiJob], report: { providers: [] } }; };
    const result = await searchWithEngine(strategy, { dir: eng.dir, run: flaky });
    assert.equal(result.jobs.length, 1);
    assert.ok(result.warnings.some((w) => /Berlin: boom/.test(w)));
    await assert.rejects(searchWithEngine(strategy, { dir: eng.dir, run: async () => { throw new Error("down"); } }), /down/);
    await assert.rejects(searchWithEngine({ roles: [], cities: ["Berlin"], types: [] }, { dir: eng.dir, run: async () => ({}) }), /at least one role/);
  } finally { eng.done(); }
  await assert.rejects(searchWithEngine(strategy, { dir: path.join(os.tmpdir(), "no-such-engine-dir") }), /not set up/);
  assert.equal(enginePython(path.join(os.tmpdir(), "no-such-engine-dir")), null);
});

test("the editor server's search no longer searches or opens job sites itself", () => {
  const server = fs.readFileSync(new URL("../scripts/editor-server.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(server, /searchPlatforms/);
  assert.match(server, /searchWithEngine\(/);
});
