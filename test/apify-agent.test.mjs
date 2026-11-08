import assert from "node:assert/strict";
import test from "node:test";

import { apifyPrompt, parseApifyRow, searchApify } from "../lib/apify-agent.mjs";

// Rows as the two Actors returned them on 2026-11-08 (shortened).
const STEPSTONE = { id: 14680904, title: "Praktikant (w/m/d) Real Estate IT- Consulting", url: "https://www.stepstone.de/stellenangebote--x--14680904-inline.html",
  datePosted: "2026-11-07T10:10:49+01:00", "location.location": "Stuttgart", "company.name": "Drees & Sommer SE", "company.logoUrl": "https://cdn.stepstone.de/logo.png", "salary.min": null, "salary.max": null, textSnippet: "Wir stehen jeden Morgen" };
const BA = { referenceId: "10001-1003396765-S", title: "Praktikum Informatik (m/ w/ d) - München", employer: "360 Consulting GmbH", location: "München",
  publishedDate: "2026-11-02", externalUrl: null, portalUrl: "https://www.arbeitsagentur.de/jobsuche/suche?id=10001-1003396765-S", salary: null, description: "Praktikum" };

const line = (event) => JSON.stringify(event);
const call = (id, name) => line({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input: {} }] } });
const answer = (id, text, extra = {}) => line({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text }], ...extra }] } });
const ACTOR = "mcp__claude_ai_Apify__call-actor";
const ITEMS = "mcp__claude_ai_Apify__get-dataset-items";

test("dataset rows from both Actors become postings with ISO dates", () => {
  assert.deepEqual(parseApifyRow(STEPSTONE), { id: "14680904", url: STEPSTONE.url, title: STEPSTONE.title, company: "Drees & Sommer SE", location: "Stuttgart",
    date_posted: "2026-11-07", salary: "", description: "Wir stehen jeden Morgen", snippet: "Wir stehen jeden Morgen", logo_url: "https://cdn.stepstone.de/logo.png", source: "StepStone", data_source: "Apify Actor (Claude connector)" });
  const ba = parseApifyRow(BA);
  assert.equal(ba.url, BA.portalUrl);
  assert.equal(ba.source, "Arbeitsagentur");
  assert.equal(ba.date_posted, "2026-11-02");
  assert.equal(parseApifyRow({ title: "x", url: "javascript:alert(1)" }), null);
  assert.equal(parseApifyRow({ url: "https://a.de/x" }), null);
});

test("postings are read from the dataset tool results; run summaries are ignored and duplicates collapse", async () => {
  const stream = [
    call("t1", ACTOR), answer("t1", JSON.stringify({ runId: "r", status: "SUCCEEDED", storages: {} })),
    call("t2", ITEMS), answer("t2", JSON.stringify({ items: [STEPSTONE, BA] })),
    call("t3", ITEMS), answer("t3", JSON.stringify({ items: [STEPSTONE] })),
    line({ type: "result", result: "DONE" }),
  ].join("\n");
  const asked = [];
  const { jobs, warnings } = await searchApify({ days: 7, run: async (prompt) => { asked.push(prompt); return stream; } });
  assert.equal(jobs.length, 2);
  assert.match(warnings[0], /2 postings from 1 run\./);
  assert.match(asked[0], /valig\/stepstone-jobs-scraper/);
  assert.match(asked[0], /"publishedSince":7/);
});

test("a run that never called Apify, or got only errors back, is an error", async () => {
  await assert.rejects(searchApify({ days: 7, run: async () => line({ type: "result", result: "I have no Apify tools." }) }), /did not run Apify \(I have no Apify tools\.\)/);
  const refused = [call("t1", ACTOR), answer("t1", "Authentication required", { is_error: true })].join("\n");
  await assert.rejects(searchApify({ days: 7, run: async () => refused }), /Apify answered with an error: Authentication required/);
});

test("the prompt names both Actors for every search", () => {
  const prompt = apifyPrompt(["a", "b"], { days: 7 });
  assert.match(prompt, /\["a","b"\]/);
  assert.match(prompt, /arbeitsagentur-jobs-feed/);
});
