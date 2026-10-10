import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  cityOf, extractCountry, internshipKind, extractLanguageLevel, extractPay, extractSkills, extractWeeks, gjuCheck, parseAmount, tagMajors, toBoardPosting,
} from "../lib/board-extract.mjs";

const rules = JSON.parse(fs.readFileSync(new URL("../data/gju-rules.json", import.meta.url), "utf8"));
const majorsFile = new URL("../../GJUBoard/board/majors.json", import.meta.url);
const majors = fs.existsSync(majorsFile) ? JSON.parse(fs.readFileSync(majorsFile, "utf8")).majors : [];

test("amounts: thousands separators and decimals", () => {
  assert.equal(parseAmount("1.000"), 1000);
  assert.equal(parseAmount("1,000"), 1000);
  assert.equal(parseAmount("13,50"), 13.5);
  assert.equal(parseAmount("861"), 861);
});

test("duration: months and weeks, ranges, open ends, and noise that is not the internship length", () => {
  assert.deepEqual(extractWeeks("Dauer: 6 Monate"), { min: 26, max: 26 });
  assert.deepEqual(extractWeeks("Praktikum für 20 Wochen"), { min: 20, max: 20 });
  assert.deepEqual(extractWeeks("internship of 12 weeks"), { min: 12, max: 12 });
  assert.deepEqual(extractWeeks("3-6 Monate"), { min: 13, max: 26 });
  assert.deepEqual(extractWeeks("mindestens 6 Monaten"), { min: 26, max: null });
  assert.deepEqual(extractWeeks("bis zu 3 Monate"), { min: null, max: 13 });
  assert.equal(extractWeeks("Probezeit 6 Monate, danach unbefristet"), null);
  assert.equal(extractWeeks("mind. 3 Jahre Berufserfahrung"), null);
  assert.equal(extractWeeks("Praktikum im Bereich Softwareentwicklung"), null);
});

test("pay: monthly figures, unpaid, and silence; an hourly rate is not turned into a monthly pay", () => {
  assert.deepEqual(extractPay("Vergütung: 1.000 € pro Monat"), { min: 1000, max: 1000, basis: "monthly" });
  assert.deepEqual(extractPay("800-1.000 EUR/Monat"), { min: 800, max: 1000, basis: "monthly" });
  assert.deepEqual(extractPay("861 € monatlich"), { min: 861, max: 861, basis: "monthly" });
  assert.equal(extractPay("13,50 €/Stunde"), null); // hours per month are not guessed
  assert.deepEqual(extractPay("unbezahltes Pflichtpraktikum"), { min: 0, max: 0, basis: "unpaid" });
  assert.equal(extractPay("attraktive Vergütung nach Absprache"), null);
});

test("language level: CEFR, phrases, none, and not mixing up the two languages", () => {
  assert.equal(extractLanguageLevel("Deutsch B2, Englisch C1", "german"), "B2");
  assert.equal(extractLanguageLevel("Deutsch B2, Englisch C1", "english"), "C1");
  assert.equal(extractLanguageLevel("B2 Deutsch, C1 Englisch", "german"), "B2");
  assert.equal(extractLanguageLevel("Englisch C1", "german"), "unknown");
  assert.equal(extractLanguageLevel("German: B1", "german"), "B1");
  assert.equal(extractLanguageLevel("fließende Deutschkenntnisse", "german"), "C1");
  assert.equal(extractLanguageLevel("gute Deutschkenntnisse in Wort und Schrift", "german"), "B2");
  assert.equal(extractLanguageLevel("Grundkenntnisse in Deutsch", "german"), "A2");
  assert.equal(extractLanguageLevel("kein Deutsch erforderlich", "german"), "none");
  assert.equal(extractLanguageLevel("no German required, English is the team language", "german"), "none");
  assert.equal(extractLanguageLevel("Wir bieten einen sicheren Arbeitsplatz in Hamburg", "german"), "unknown");
});

test("country: location first, then link, then known city, then advert text", () => {
  const germanCities = new Set(["münchen", "berlin"]);
  assert.equal(extractCountry({ location: "Berlin, Deutschland" }), "Germany");
  assert.equal(extractCountry({ location: "Wien, Österreich" }), "Austria");
  assert.equal(extractCountry({ location: "Zürich", url: "https://firma.ch/job" }), "Switzerland");
  assert.equal(extractCountry({ location: "München", germanCities }), "Germany");
  assert.equal(extractCountry({ location: "London", text: "We also have an office in Germany" }), "Germany"); // text is the last resort
  assert.equal(extractCountry({ location: "Madrid", url: "https://firma.es/job" }), "unknown");
  assert.equal(extractCountry({ location: "Frankfurt", text: "", url: "https://firma.de/job" }), "Germany");
});

test("GJU check follows data/gju-rules.json and never turns unknown into a pass", () => {
  const check = (weeks, pay, country) => gjuCheck({ weeks, pay, country }, rules);
  const day = (min, max = min) => ({ min, max });
  assert.equal(check(day(26), { min: 900, max: 900 }, "Germany").overall, "meets");
  assert.equal(check(day(20), { min: 861, max: 861 }, "Austria").overall, "meets"); // the edges count
  assert.equal(check(day(19), { min: 900, max: 900 }, "Germany").weeks, "no");
  assert.equal(check(day(19), { min: 900, max: 900 }, "Germany").overall, "fails");
  assert.equal(check(day(26), { min: 860, max: 860 }, "Germany").pay, "no");
  assert.equal(check(day(13, 26), { min: 900, max: 900 }, "Germany").weeks, "unknown"); // a range across the line
  assert.equal(check(day(26), { min: 700, max: 1000 }, "Germany").pay, "unknown");
  assert.equal(check(null, null, "unknown").overall, "check");
  assert.equal(check(day(26), { min: 900, max: 900 }, "Spain").country, "approval-needed");
  assert.equal(check(day(26), { min: 900, max: 900 }, "Spain").overall, "check");
  assert.equal(check({ min: 26, max: null }, null, "Germany").weeks, "yes"); // open-ended "ab 6 Monate"
});

test("majors and skills come from title words and a fixed vocabulary", { skip: !majors.length && "majors.json not found" }, () => {
  assert.deepEqual(tagMajors("Praktikum Softwareentwicklung (m/w/d)", "", majors), ["computer-science"]);
  assert.ok(tagMajors("Werkstudent Logistik", "", majors).includes("logistic-sciences"));
  assert.deepEqual(tagMajors("Praktikant (m/w/d)", "Wir suchen Hilfe in Buchhaltung und Controlling.", majors).includes("international-accounting"), true);
  assert.deepEqual(tagMajors("Praktikant (m/w/d)", "Nur Controlling.", majors), []); // one snippet hit is not enough
  const found = extractSkills("Kenntnisse in C#, .NET und React; C++ von Vorteil. Cloud ist ein Plus.", ["C", "C#", "C++", ".NET", "React", "R", "Go"]);
  assert.deepEqual(found.sort(), [".NET", "C#", "C++", "React"].sort());
});

test("the published record keeps derived facts only: no advert text, no contact details", { skip: !majors.length && "majors.json not found" }, () => {
  const hit = {
    title: "Praktikum Softwareentwicklung (m/w/d)", company: "Firma GmbH", url: "https://jobs.firma.de/job/123?utm_source=x", location: "München",
    source: "firma.de", date_posted: "2026-10-09", snippet: "Dauer: 6 Monate, 1.000 € pro Monat. Deutsch B2. Python, SQL.",
    description: "Ansprechpartnerin Erika Muster, erika.muster@firma.de, Tel. 089 123456. Geheimer Werbetext.",
    contact_person: "Erika Muster", contact_email: "erika.muster@firma.de",
  };
  const posting = toBoardPosting(hit, { majors, rules, germanCities: new Set(["münchen"]), today: "2026-10-10" });
  assert.deepEqual(posting.majors, ["computer-science"]);
  assert.deepEqual(posting.weeks, { min: 26, max: 26 });
  assert.deepEqual(posting.pay, { min: 1000, max: 1000, basis: "monthly" });
  assert.equal(posting.germanLevel, "B2");
  assert.equal(posting.country, "Germany");
  assert.equal(posting.kind, "Praktikum");
  assert.equal(posting.city, "München");
  assert.ok(!("type" in posting)); // the board has one kind of posting, so no opportunity type
  assert.equal(posting.gju.overall, "meets");
  assert.ok(posting.skills.includes("Python") && posting.skills.includes("SQL"));
  assert.match(posting.id, /^[0-9a-f]{12}$/);
  const published = JSON.stringify(posting);
  for (const secret of ["Erika", "erika.muster", "089 123456", "Werbetext", "contact"]) assert.ok(!published.includes(secret), `leaked: ${secret}`);
});

// ------------------------------------------------------------ skill list shared with the profile editor

const aliasFileUrl = new URL("../../GJUBoard/board/skill-aliases.json", import.meta.url);
const aliasFile = fs.existsSync(aliasFileUrl) ? JSON.parse(fs.readFileSync(aliasFileUrl, "utf8")) : null;

test("vocabulary: the editor library minus soft skills and language names, aliases map to library spellings", async () => {
  const { boardVocabulary } = await import("../lib/board-extract.mjs");
  const { SKILL_LIBRARY } = await import("../src/assets/skill-library.js");
  const vocabulary = boardVocabulary(SKILL_LIBRARY, ["CAD", "Python"], ["Teamwork", "German", "Research"]);
  assert.ok(vocabulary.includes("Microsoft Excel") && vocabulary.includes("Patient Care") && vocabulary.includes("Search Engine Optimisation (SEO)"));
  assert.ok(!vocabulary.includes("Teamwork") && !vocabulary.includes("German") && !vocabulary.includes("Research"));
  assert.equal(vocabulary.filter((name) => name.toLowerCase() === "python").length, 1); // library and extras are de-duplicated

  const aliases = { "Microsoft Excel": ["Excel"], "Search Engine Advertising (SEA)": ["SEA"], "Nursing Care": ["Krankenpflege"] };
  const names = ["Microsoft Excel", "Search Engine Advertising (SEA)", "Nursing Care"];
  assert.deepEqual(extractSkills("Gute Excel-Kenntnisse und Erfahrung in der Krankenpflege", names, aliases).sort(), ["Microsoft Excel", "Nursing Care"]);
  assert.deepEqual(extractSkills("Schiffe auf der sea, nicht Werbung", names, aliases), []); // "sea" is not the acronym SEA
  assert.deepEqual(extractSkills("Kampagnen in SEA und SEO", names, aliases), ["Search Engine Advertising (SEA)"]);
});

// Found on the first real run: "Pflege der Stammdaten" tagged a logistics internship with Nursing Care, and "R&D" or "SAP R/3" with the language R.
test("everyday German office words and abbreviations do not become skills", { skip: !aliasFile && "skill-aliases.json not found" }, async () => {
  const { boardVocabulary } = await import("../lib/board-extract.mjs");
  const { SKILL_LIBRARY } = await import("../src/assets/skill-library.js");
  const vocabulary = boardVocabulary(SKILL_LIBRARY, [], aliasFile.skip);
  const skills = (text) => extractSkills(text, vocabulary, aliasFile.aliases);
  assert.ok(!skills("Pflege der Stammdaten, Datenpflege und Pflege von Kundenkontakten").includes("Nursing Care"));
  assert.ok(skills("Erfahrung in der Krankenpflege oder Altenpflege").includes("Nursing Care"));
  const office = skills("Du arbeitest mit SAP R/3 und in R&D, embedded in unser Team.");
  assert.ok(!office.includes("R") && !office.includes("Embedded Systems"), office.join(", "));
  assert.ok(skills("Kenntnisse in R und Python, Embedded Software von Vorteil").includes("R"));
  assert.ok(skills("Embedded Software in C").includes("Embedded Systems"));
});

test("the alias list only points at skills the editor library really has", { skip: !aliasFile && "skill-aliases.json not found" }, async () => {
  const { ALL_LIBRARY_SKILLS } = await import("../src/assets/skill-library.js");
  const library = new Set(ALL_LIBRARY_SKILLS.map((name) => name.toLowerCase()));
  const dangling = Object.keys(aliasFile.aliases).filter((name) => !library.has(name.toLowerCase()));
  assert.deepEqual(dangling, []);
  const skipped = aliasFile.skip.filter((name) => !library.has(name.toLowerCase()));
  assert.deepEqual(skipped, []);
});

test("every major's typical skills are mostly covered by the editor library plus aliases", { skip: (!majors.length || !aliasFile) && "board files not found" }, async () => {
  const { ALL_LIBRARY_SKILLS } = await import("../src/assets/skill-library.js");
  const library = new Set(ALL_LIBRARY_SKILLS.map((name) => name.toLowerCase()));
  const viaAlias = new Set(Object.entries(aliasFile.aliases).flatMap(([canon, list]) => (library.has(canon.toLowerCase()) ? list.map((a) => a.toLowerCase()) : [])));
  const covered = (skill) => library.has(skill.toLowerCase()) || viaAlias.has(skill.toLowerCase());
  // Languages are read into their own columns, so they do not count against a major.
  const languages = new Set(["deutsch", "englisch", "arabisch", "german", "english", "arabic"]);
  let total = 0, hit = 0;
  const weak = [];
  for (const major of majors) {
    const skills = major.skills.filter((skill) => !languages.has(skill.toLowerCase()));
    const share = skills.filter(covered).length / skills.length;
    total += skills.length; hit += skills.filter(covered).length;
    if (share < 0.6) weak.push(`${major.id} ${Math.round(share * 100)}%`);
  }
  assert.deepEqual(weak, [], "a major has too few skills in the shared list");
  assert.ok(hit / total >= 0.9, `overall coverage ${Math.round((100 * hit) / total)}%`);
});

// ------------------------------------------------------------ internships only

test("the board is for internships: the title must name one, and 'International' is not 'Intern'", () => {
  for (const [title, kind] of [
    ["Praktikum Softwareentwicklung (m/w/d)", "Praktikum"],
    ["Praktikant (m/w/d) im Bereich Logistik", "Praktikum"],
    ["Praktikantin Marketing", "Praktikum"],
    ["Industriepraktikum Maschinenbau", "Praktikum"],
    ["Praxissemester Elektrotechnik", "Praktikum"],
    ["Pflichtpraktikum Architektur", "Pflichtpraktikum"],
    ["Pflicht-Praktikum im Bereich Pflege", "Pflichtpraktikum"],
    ["Mandatory internship in data analytics", "Pflichtpraktikum"],
    ["Software Engineering Internship", "Internship"],
    ["Marketing Intern (m/f/d)", "Internship"],
    ["Summer Interns wanted", "Internship"],
  ]) assert.equal(internshipKind(title), kind, title);
  for (const title of [
    "Werkstudent Logistik", "Working student Data", "Bachelorarbeit Softwarearchitektur", "Softwareentwickler (m/w/d)",
    "International Sales Manager", "Internal Auditor", "Internet Marketing Manager", "Ausbildung Fachinformatiker", "", undefined,
  ]) assert.equal(internshipKind(title), "", String(title));
});

test("a city is just the city", () => {
  assert.equal(cityOf("Berlin, Deutschland"), "Berlin");
  assert.equal(cityOf("Frankfurt am Main, Hessen, Germany"), "Frankfurt am Main");
  assert.equal(cityOf("Remote"), "Remote");
  assert.equal(cityOf(undefined), "");
});
