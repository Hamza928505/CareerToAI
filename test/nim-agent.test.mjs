import assert from "node:assert/strict";
import test from "node:test";

import { extractDate, searchNim, siteName } from "../lib/nim-agent.mjs";

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
    if (String(url).includes("nvidia.com")) {
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
  const { jobs } = await searchNim({ days: 7, env: { NVIDIA_API_KEY: "k", EXA_API_KEY: "k" }, fetchImpl, now: NOW });
  assert.deepEqual(jobs.map((j) => [j.title, j.source, j.date_posted, j.verified]), [
    ["Pflichtpraktikum Informatik", "praktikum.info", "2026-11-05", false],
    ["Praktikum A", "LinkedIn", "", false],
    ["Praktikum C", "LinkedIn", "", false] ]);
  assert.match(jobs[0].data_source, /NVIDIA NIM \(exa_search/);
});

test("no NVIDIA key is a clear error", async () => {
  await assert.rejects(searchNim({ env: {} }), /NVIDIA_API_KEY/);
});
