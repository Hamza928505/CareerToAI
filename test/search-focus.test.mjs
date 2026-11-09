import assert from "node:assert/strict";
import test from "node:test";

import { loadMajors, matchMajor, searchPlan } from "../lib/search-focus.mjs";

const data = loadMajors();
const noAi = { ai: false };

test("a field of study names a GJU major exactly or as a whole-word part, and a tie names none", () => {
  assert.equal(matchMajor("Computer Science", data.majors).id, "computer-science");
  assert.equal(matchMajor("BSc Computer Science and Engineering", data.majors).id, "computer-science");
  assert.equal(matchMajor("mechanical and maintenance engineering", data.majors).id, "mechanical-maintenance-engineering");
  assert.equal(matchMajor("Engineering", data.majors), null); // part of several majors
  assert.equal(matchMajor("Aerospace Engineering", data.majors), null);
  assert.equal(matchMajor("", data.majors), null);
});

test("every major has German and English title words of at least 5 letters for the free sources", () => {
  assert.equal(data.majors.length, 22);
  for (const major of data.majors) {
    assert.ok(major.de.length && major.en.length, major.id);
    assert.ok(data.areas.includes(major.area), major.id);
  }
  for (const area of data.areas) assert.ok(data.areaWords[area]?.de && data.areaWords[area]?.en, area);
});

test("Computer Science searches software, data and AI words in both languages", async () => {
  const plan = await searchPlan({ mode: "profile", field: "Computer Science", ...noAi });
  assert.equal(plan.label, "Computer Science internships");
  assert.equal(plan.matched, true);
  assert.ok(plan.engineKeywords.length <= 8 && plan.engineKeywords.every((word) => word.length >= 5), plan.engineKeywords.join());
  assert.ok(plan.engineKeywords.includes("Machine Learning") && plan.engineKeywords.includes("Informatik"));
  const searches = plan.indeedSearches.map((item) => item.search);
  assert.ok(searches.includes("Praktikum Künstliche Intelligenz") && searches.includes("Pflichtpraktikum Softwareentwicklung") && searches.includes("Data Science Internship"));
  assert.ok(searches.length <= 16 && plan.indeedSearches.every((item) => item.location === "Deutschland"));
  assert.deepEqual(plan.apifySearches, searches.slice(0, 6));
  assert.match(plan.nimBrief, /student of Computer Science/);
  assert.ok(plan.skills.includes("Python"));
});

test("another major searches its own words, not IT", async () => {
  const plan = await searchPlan({ mode: "profile", field: "Nursing Science", ...noAi });
  assert.ok(plan.engineKeywords.includes("Pflege") && plan.engineKeywords.includes("Healthcare"));
  assert.ok(!plan.indeedSearches.some((item) => /Informatik|Software/.test(item.search)));
});

test("a field no list covers is searched by its own name, plus the AI provider's title words when there is one", async () => {
  const bare = await searchPlan({ mode: "profile", field: "Aerospace Engineering", ...noAi });
  assert.equal(bare.matched, false);
  assert.deepEqual(bare.engineKeywords, ["Aerospace Engineering"]);
  assert.deepEqual(bare.indeedSearches.map((item) => item.search), ["Praktikum Aerospace Engineering", "Aerospace Engineering Internship", "Pflichtpraktikum Aerospace Engineering"]);
  const asked = [];
  const chat = async (request) => { asked.push(request.user); return { de: ["Luftfahrttechnik", "Triebwerke"], en: ["Avionics"] }; };
  const smart = await searchPlan({ mode: "profile", field: "Aerospace Engineering", ai: true, chat });
  assert.equal(asked.length, 1);
  assert.deepEqual(smart.engineKeywords, ["Aerospace Engineering", "Aerospace Engineering", "Luftfahrttechnik", "Avionics", "Triebwerke"].filter((word, i, all) => all.indexOf(word) === i));
  // A provider that fails must not fail the search.
  const failing = await searchPlan({ mode: "profile", field: "Aerospace Engineering", ai: true, chat: async () => { throw new Error("quota"); } });
  assert.deepEqual(failing.engineKeywords, ["Aerospace Engineering"]);
});

test("the global search covers every area once, with the generic internship words", async () => {
  const plan = await searchPlan({ mode: "global" });
  assert.equal(plan.mode, "global");
  assert.deepEqual(plan.engineKeywords.slice(0, 2), ["Praktikum", "Internship"]);
  assert.equal(plan.engineKeywords.length, 8);
  const searches = plan.indeedSearches.map((item) => item.search);
  assert.equal(searches.length, 16);
  for (const area of data.areas) assert.ok(searches.includes(`Praktikum ${data.areaWords[area].de}`), area);
  assert.equal(plan.apifySearches.length, 10);
  assert.match(plan.nimBrief, /ANY field/);
});

test("a profile search without a field of study fails with a clear message", async () => {
  await assert.rejects(searchPlan({ mode: "profile", field: "  ", ...noAi }), (error) => error.statusCode === 400 && /no field of study/.test(error.message));
});
