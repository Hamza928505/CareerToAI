import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const logicPath = new URL("../../GJUBoard/board-logic.js", import.meta.url);
const present = fs.existsSync(logicPath);
const skip = !present && "GJUBoard repo not found next to CareerToAI";
const L = present ? createRequire(import.meta.url)(logicPath.pathname.replace(/^\/([A-Za-z]:)/, "$1")) : null;

const GJU = { meets: { weeks: "yes", pay: "yes", country: "approved", overall: "meets" }, check: { weeks: "unknown", pay: "unknown", country: "approved", overall: "check" }, fails: { weeks: "no", pay: "yes", country: "approved", overall: "fails" } };
const make = (o) => ({
  id: "x", title: "Praktikum Softwareentwicklung", company: "Firma", city: "Berlin", country: "Germany", url: "https://firma.de/job/1", source: "firma.de",
  kind: "Praktikum", datePosted: "2026-10-09", firstSeen: "2026-10-09", lastSeen: "2026-10-09", majors: ["computer-science"], skills: ["Python", "SQL"],
  weeks: { min: 26, max: 26 }, pay: { min: 1000, max: 1000, basis: "monthly" }, germanLevel: "B2", englishLevel: "unknown", gju: GJU.meets, ...o,
});
const postings = [
  make({ id: "a", firstSeen: "2026-10-10" }),
  make({ id: "b", title: "Pflichtpraktikum Logistik", company: "Spedition AG", kind: "Pflichtpraktikum", majors: ["logistic-sciences"], skills: ["SAP ERP"], germanLevel: "C1", weeks: null, pay: null, gju: GJU.check, firstSeen: "2026-10-09" }),
  make({ id: "c", title: "Praktikum Data Analyst", company: "Daten GmbH", majors: ["business-intelligence-data-analytics", "computer-science"], skills: ["SQL", "Power BI"], germanLevel: "none", weeks: { min: 12, max: 12 }, gju: GJU.fails, firstSeen: "2026-10-08" }),
  make({ id: "d", title: "Internship Mechatronics", company: "Robot GmbH", kind: "Internship", country: "Austria", city: "Wien", majors: ["mechatronics-engineering"], skills: ["MATLAB"], germanLevel: "unknown", englishLevel: "B2", pay: { min: 0, max: 0, basis: "unpaid" }, gju: { ...GJU.fails, weeks: "yes", pay: "no" }, firstSeen: "2026-10-08" }),
  make({ id: "e", title: "Praktikum Zürich Marketing", company: "Züri AG", city: "Zürich", country: "Switzerland", majors: ["digital-marketing"], skills: [], weeks: { min: 13, max: 26 }, pay: { min: 700, max: 1000, basis: "monthly" }, germanLevel: "A2", gju: GJU.check, firstSeen: "2026-10-07" }),
];
const ids = (f, skipDim) => L.applyFilters(postings, { ...L.defaultFilters(), ...f }, skipDim).map((p) => p.id).sort().join("");

test("search ignores accents and case and looks at title, company, city and skills", { skip }, () => {
  assert.equal(L.norm("Zürich Ünï"), "zurich uni");
  assert.equal(ids({ q: "zurich" }), "e");
  assert.equal(ids({ q: "SPEDITION logistik" }), "b");
  assert.equal(ids({ q: "power bi" }), "c"); // a skill
  assert.equal(ids({ q: "berlin python" }), "a"); // every word must match somewhere
  assert.equal(ids({ q: "berlin sql" }), "ac");
  assert.equal(ids({ q: "   " }), "abcde");
});

test("multi-value filters are any-of; skills are all-of or any-of", { skip }, () => {
  assert.equal(ids({ majors: ["computer-science"] }), "ac");
  assert.equal(ids({ majors: ["logistic-sciences", "mechatronics-engineering"] }), "bd");
  assert.equal(ids({ countries: ["Austria", "Switzerland"] }), "de");
  assert.equal(ids({ cities: ["wien", "zurich"] }), "de"); // city keys are normalised
  assert.equal(ids({ kinds: ["Pflichtpraktikum", "Internship"] }), "bd");
  assert.equal(ids({ skills: ["Python", "SQL"] }), "a");
  assert.equal(ids({ skills: ["python", "sql"], skillMode: "any" }), "ac");
  assert.equal(ids({ skills: ["sql"] }), "ac");
  assert.equal(ids({ skills: ["Kubernetes"], skillMode: "any" }), "");
});

test("language levels keep postings the student can meet, plus unstated ones", { skip }, () => {
  assert.equal(ids({ german: "B1" }), "cde"); // a (B2) and b (C1) need more; none, unknown and A2 pass
  assert.equal(ids({ german: "C2" }), "abcde");
  assert.equal(ids({ english: "A1" }), "abce"); // d needs B2
});

test("pay range and minimum weeks keep only postings that state them", { skip }, () => {
  assert.equal(ids({ minPay: "900" }), "ace"); // e's range 700-1000 reaches 900
  assert.equal(ids({ maxPay: "500" }), "d"); // unpaid
  assert.equal(ids({ minPay: "1000", maxPay: "1000" }), "ace");
  assert.equal(ids({ minPay: "abc" }), "abcde"); // not a number: ignored
  assert.equal(ids({ minWeeks: "20" }), "ade"); // e: 13-26 reaches 20 at its top; c is 12; b states none
  assert.equal(ids({ minWeeks: "27" }), "");
  assert.equal(ids({ minWeeks: "1" }), "acde");
});

test("GJU filter: meets, needs checking, below a limit, and hide the ones below", { skip }, () => {
  assert.equal(ids({ gju: "meets" }), "a");
  assert.equal(ids({ gju: "check" }), "be");
  assert.equal(ids({ gju: "fails" }), "cd");
  assert.equal(ids({ gju: "hide-fails" }), "abe");
});

test("dates, and 'skip' leaves one dimension out for counts and charts", { skip }, () => {
  assert.equal(ids({ from: "2026-10-09" }), "ab");
  assert.equal(ids({ to: "2026-10-08" }), "cde");
  assert.equal(ids({ from: "2026-10-08", to: "2026-10-08" }), "cd");
  assert.equal(ids({ majors: ["logistic-sciences"], countries: ["Austria"] }), "");
  assert.equal(ids({ majors: ["logistic-sciences"], countries: ["Austria"] }, "majors"), "d");
  assert.equal(ids({ majors: ["logistic-sciences"], gju: "meets" }, "gju"), "b");
});

test("how many filters are on", { skip }, () => {
  assert.equal(L.activeCount(L.defaultFilters()), 0);
  assert.equal(L.activeCount({ ...L.defaultFilters(), q: "x", majors: ["a", "b"], skills: ["S"], minPay: "1", maxPay: "2", from: "2026-01-01", to: "2026-02-01", german: "B1" }), 6);
});

test("facet counts say what each choice would leave, given the other filters", { skip }, () => {
  const f = { ...L.defaultFilters(), countries: ["Austria"] };
  assert.deepEqual([...L.facetCounts(postings, L.defaultFilters(), "countries")].sort(), [["Austria", 1], ["Germany", 3], ["Switzerland", 1]]);
  // With Austria chosen, the country list still counts every country (its own filter is left out) ...
  assert.equal(L.facetCounts(postings, f, "countries").get("Germany"), 3);
  // ... while the major list counts only what Austria leaves.
  assert.deepEqual([...L.facetCounts(postings, f, "majors")], [["mechatronics-engineering", 1]]);
  assert.equal(L.facetCounts(postings, L.defaultFilters(), "gju").get("fails"), 2);
  assert.equal(L.facetCounts(postings, L.defaultFilters(), "cities").get("zurich"), 1);
  assert.equal(L.facetCounts(postings, L.defaultFilters(), "skills").get("SQL"), 2);
});

test("chart numbers: top lists, the GJU split, days with zeros, duration and language buckets", { skip }, () => {
  const d = L.chartData(postings, L.defaultFilters(), { end: "2026-10-10", days: 5 });
  assert.equal(d.total, 5);
  assert.deepEqual(d.majors[0], { key: "computer-science", count: 2 });
  assert.deepEqual(d.gju, { meets: 1, check: 2, fails: 2 });
  assert.deepEqual(d.days.map((x) => x.count), [0, 1, 2, 1, 1]); // Oct 6..10
  assert.deepEqual(d.days.map((x) => x.date), ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"]);
  assert.deepEqual(d.weeks.map((x) => x.count), [1, 1, 0, 3, 0]); // not stated, under 13, 13-19, 20-26, 27+
  assert.deepEqual(d.german.map((x) => [x.key, x.count]), [["none", 1], ["A1", 0], ["A2", 1], ["B1", 0], ["B2", 1], ["C1", 1], ["C2", 0], ["unknown", 1]]);
  // A chart that can be clicked ignores its own filter: with one major chosen its bars still list the others.
  const picked = L.chartData(postings, { ...L.defaultFilters(), majors: ["logistic-sciences"] });
  assert.equal(picked.total, 1);
  assert.ok(picked.majors.length >= 4);
  assert.equal(picked.gju.check, 1);
  assert.deepEqual(L.chartData(postings, { ...L.defaultFilters(), gju: "meets" }).gju, { meets: 1, check: 2, fails: 2 });
});

const RULES = { minWeeks: 20, minMonthlySalary: 861, approvedCountries: ["Germany", "Austria", "Switzerland", "Luxembourg"] };

test("each GJU rule explained for one posting, from the published rule numbers", { skip }, () => {
  const by = (p) => Object.fromEntries(L.ruleLines(p, RULES).map((l) => [l.key, l.state]));
  assert.deepEqual(by(postings[0]), { weeks: "ok", pay: "ok", country: "ok", german: "info", english: "info" });
  assert.deepEqual(by(postings[1]), { weeks: "warn", pay: "warn", country: "ok", german: "info", english: "info" });
  assert.deepEqual(by(postings[2]), { weeks: "bad", pay: "ok", country: "ok", german: "info", english: "info" });
  assert.equal(by(postings[3]).pay, "bad");
  assert.equal(by(postings[4]).weeks, "warn"); // 13-26 straddles the minimum
  assert.equal(by(make({ country: "Spain" })).country, "warn");
  assert.equal(by(make({ country: "unknown" })).country, "warn");
  const unpaid = L.ruleLines(postings[3], RULES).find((l) => l.key === "pay").text;
  assert.match(unpaid, /Unpaid is below the 861 EUR threshold/);
  assert.match(L.ruleLines(postings[2], RULES).find((l) => l.key === "weeks").text, /12 weeks is below the 20-week minimum/);
  assert.match(L.ruleLines(postings[2], RULES).find((l) => l.key === "german").text, /none required/);
});

test("sorting, labels, links and spreadsheet rows", { skip }, () => {
  assert.equal(L.sortPostings(postings, "new")[0].id, "a");
  assert.equal(L.sortPostings(postings, "company")[0].company, "Daten GmbH");
  assert.equal(L.sortPostings(postings, "weeks")[0].weeks.max, 26);
  assert.equal(L.sortPostings(postings, "pay").at(-1).id, "b"); // unknown pay last
  assert.equal(L.formatWeeks({ min: 13, max: 26 }), "13–26 weeks");
  assert.equal(L.formatWeeks({ min: 26, max: null }), "26+ weeks");
  assert.equal(L.formatWeeks({ min: null, max: 13 }), "up to 13 weeks");
  assert.equal(L.formatWeeks(null), "not stated");
  assert.equal(L.formatPay({ min: 0, max: 0 }), "unpaid");
  assert.equal(L.formatPay({ min: 800, max: 1000 }), "800–1000 EUR");
  assert.equal(L.safeUrl("javascript:alert(1)"), "");
  assert.equal(L.safeUrl("https://a.de/x"), "https://a.de/x");
  const rows = L.toRows([postings[3]], { "mechatronics-engineering": "Mechatronics Engineering" });
  assert.equal(rows[0]["Kind"], "Internship");
  assert.equal(rows[0]["GJU check"], "Below a limit");
  assert.equal(rows[0]["Pay check"], "no");
  assert.equal(rows[0]["Majors"], "Mechatronics Engineering");
  assert.ok(!("Type" in rows[0]));
});

test("relative dates, company initials and avatar colours", { skip }, () => {
  const now = new Date("2026-10-10T15:00:00Z");
  assert.equal(L.ago("2026-10-10", now), "Today");
  assert.equal(L.ago("2026-10-09", now), "Yesterday");
  assert.equal(L.ago("2026-10-05", now), "5 days ago");
  assert.equal(L.ago("2026-09-20", now), "3 weeks ago");
  assert.equal(L.ago("2026-06-01", now), "2026-06-01");
  assert.equal(L.ago("nonsense", now), "nonsense");
  assert.equal(L.initials("Beispiel Software GmbH"), "BS");
  assert.equal(L.initials("Siemens AG"), "SI");
  assert.equal(L.initials("Zürich Versicherung"), "ZV");
  assert.equal(L.initials(""), "?");
  assert.equal(L.hue("Firma"), L.hue("Firma"));
  assert.ok(L.hue("Firma") >= 0 && L.hue("Firma") < 360);
});
