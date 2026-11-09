import assert from "node:assert/strict";
import test from "node:test";
import { applyFilters, defaultFilters, foundBy, parsePay, parseWeeks, toPosting } from "../src/assets/workspace-board.js";

test("the board reads duration and pay as the search writes them, and as a person types them", () => {
  assert.deepEqual(parseWeeks("20–26 weeks"), { min: 20, max: 26 });
  assert.deepEqual(parseWeeks("26+ weeks"), { min: 26, max: null });
  assert.deepEqual(parseWeeks("up to 12 weeks"), { min: null, max: 12 });
  assert.deepEqual(parseWeeks("6 months"), { min: 26, max: 26 });
  assert.equal(parseWeeks(""), null);
  assert.deepEqual(parsePay("1000–1500 EUR/month"), { min: 1000, max: 1500 });
  assert.deepEqual(parsePay("1.200 €"), { min: 1200, max: 1200 });
  assert.deepEqual(parsePay("unpaid"), { min: 0, max: 0 });
  assert.deepEqual(parsePay("", "No"), { min: 0, max: 0 });
  assert.equal(parsePay("15 €/h"), null); // an hourly rate is not a monthly one
});

test("a tracker row becomes a board posting with its GJU verdict and reason", () => {
  const p = toPosting({ id: "job-1", position: "Praktikum Data", company: "Acme GmbH", gju_check: "Check: duration not stated", req_german: "Deutsch B2", req_skills: "Python, SQL; Python", date_posted: "2026-10-20" });
  assert.deepEqual([p.gju.overall, p.gju.why, p.germanLevel, p.englishLevel, p.posted], ["check", "duration not stated", "B2", "unknown", "2026-10-20"]);
  assert.deepEqual(p.skills, ["Python", "SQL"]);
  assert.equal(toPosting({ gju_check: "Not an internship" }).gju.overall, "fails");
  assert.equal(toPosting({ gju_check: "Meets" }).gju.overall, "meets");
  assert.equal(toPosting({ date_found: "2026-10-01" }).posted, ""); // undated stays undated, never the day it was found
});

test("the fit score is read from the row, clamped to 0-100, and null when the row was never scored", () => {
  const p = toPosting({ match_score: "72", why_match: "Profile comparison: 2/3 mentioned technologies found." });
  assert.equal(p.score, 72);
  assert.match(p.scoreWhy, /2\/3/);
  assert.equal(toPosting({ match_score: "250" }).score, 100);
  assert.equal(toPosting({ match_score: "" }).score, null);
  assert.equal(toPosting({}).score, null);
  assert.equal(toPosting({ match_score: "0" }).score, 0);
});

test("which AI found a posting is read from the data_source the search wrote", () => {
  assert.equal(foundBy("NVIDIA NIM (tavily_search, unverified)"), "NVIDIA NIM");
  assert.equal(foundBy("Indeed connector (Claude)"), "Claude");
  assert.equal(foundBy("Apify Actor (Claude connector)"), "Claude");
  assert.equal(foundBy("JobSearchEngine: arbeitnow api (unverified)"), "Search APIs");
  assert.equal(foundBy(""), "Added by hand");
});

test("the board starts on the last 7 days and filters by AI and by site", () => {
  const ago = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
  const rows = [
    { id: "a", date_posted: ago(2), data_source: "NVIDIA NIM (exa_search, unverified)", source_site: "LinkedIn" },
    { id: "b", date_posted: ago(2), data_source: "Indeed connector (Claude)", source_site: "Indeed" },
    { id: "c", date_posted: ago(20), data_source: "Indeed connector (Claude)", source_site: "Indeed" },
    { id: "d", data_source: "Indeed connector (Claude)", source_site: "Indeed" },
  ].map(toPosting);
  const ids = (f) => applyFilters(rows, f).map((p) => p.id).join("");
  assert.equal(ids(defaultFilters()), "ab"); // older and undated rows are not "new"
  assert.equal(ids({ ...defaultFilters(), recent: "" }), "abcd");
  assert.equal(ids({ ...defaultFilters(), by: "NVIDIA NIM" }), "a");
  assert.equal(ids({ ...defaultFilters(), recent: "", sites: ["Indeed"] }), "bcd");
});

// The NIM site sweep keeps one undated lead for a site with no dated posting. It is "new" for the week after the search found it.
test("a site lead shows in the last 7 days for a week after it was found, any other undated row does not", () => {
  const ago = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
  const sweep = "NVIDIA NIM (site sweep: tavily_search, unverified, no posting date)";
  const rows = [
    { id: "a", date_found: ago(2), data_source: sweep },
    { id: "b", date_found: ago(20), data_source: sweep }, // found long ago
    { id: "c", date_found: ago(2), data_source: "NVIDIA NIM (exa_search, unverified)" }, // undated, not a lead
    { id: "d", date_posted: ago(2), date_found: ago(1), data_source: "NVIDIA NIM (site sweep: exa_search, unverified)" }, // dated: an ordinary posting
  ].map(toPosting);
  assert.deepEqual(rows.map((p) => p.lead), [true, true, false, false]);
  assert.equal(applyFilters(rows, defaultFilters()).map((p) => p.id).join(""), "ad");
  assert.equal(applyFilters(rows, { ...defaultFilters(), recent: "" }).map((p) => p.id).join(""), "abcd");
});
