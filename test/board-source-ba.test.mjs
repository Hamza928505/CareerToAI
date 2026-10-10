import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { toBoardPosting } from "../lib/board-extract.mjs";
import { SourceError, createClient, fetchArbeitsagentur, jobUrl, toHit } from "../lib/board-source-ba.mjs";
import { postingKey } from "../lib/job-search.mjs";

const rules = JSON.parse(fs.readFileSync(new URL("../data/gju-rules.json", import.meta.url), "utf8"));
const TODAY = "2026-10-10";
const day = (ago) => new Date(Date.parse(TODAY) - ago * 86_400_000).toISOString().slice(0, 10);

// ------------------------------------------------------------ a fake Jobbörse

const reply = (status, body, headers = {}) => ({ ok: status < 400, status, headers: { get: (name) => headers[name.toLowerCase()] ?? null }, json: async () => body });
const place = (entry) => [{ adresse: { ort: entry.ort || "Berlin", land: "DEUTSCHLAND" } }];
const listItem = (e) => ({
  stellenangebotsart: "PRAKTIKUM_TRAINEE", stellenangebotsTitel: e.title, firma: e.firma || "Firma GmbH", referenznummer: e.ref,
  datumErsteVeroeffentlichung: e.date, veroeffentlichungszeitraum: { von: e.date }, hauptberuf: e.job || "Softwareentwickler/in", alleBerufe: [e.job || "Softwareentwickler/in"], stellenlokationen: place(e),
});
const detailOf = (e) => ({ stellenangebotsBeschreibung: e.text || "Du entwickelst Software in Python.", firma: e.firma || "Firma GmbH", befristungInMonaten: e.months, stellenlokationen: place(e) });
const entry = (n, over = {}) => ({ ref: `10000-${n}-S`, title: "Praktikum Softwareentwicklung (m/w/d)", date: day(1), ...over });

/** `entries` newest first. `answer(url, callNumber)` may replace a reply (to simulate trouble). Every call is recorded. */
function service(entries, { answer } = {}) {
  const calls = [];
  const byRef = new Map(entries.map((e) => [e.ref, e]));
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), headers: options.headers });
    const u = new URL(url);
    const special = answer?.(u, calls.length);
    if (special) return special;
    if (u.pathname.endsWith("/v6/jobs")) {
      const size = Number(u.searchParams.get("size"));
      const page = Number(u.searchParams.get("page"));
      return reply(200, { ergebnisliste: entries.slice((page - 1) * size, page * size).map(listItem), maxErgebnisse: entries.length, page, size });
    }
    const found = byRef.get(Buffer.from(u.pathname.split("/").pop(), "base64").toString());
    return found ? reply(200, detailOf(found)) : reply(404, {});
  };
  const pages = () => calls.filter((c) => c.url.includes("/v6/jobs")).map((c) => Number(new URL(c.url).searchParams.get("page")));
  const details = () => calls.filter((c) => c.url.includes("/jobdetails/")).length;
  return { fetchImpl, calls, pages, details };
}
const noWait = () => { const waits = []; return { sleep: async (ms) => { waits.push(ms); }, waits }; };
const read = (fake, extra = {}) => { const { sleep, waits } = noWait(); return { ...fake, waits, run: (options = {}) => fetchArbeitsagentur({ oldest: day(5), today: TODAY, fetchImpl: fake.fetchImpl, sleep, ...extra, ...options }) }; };

// ------------------------------------------------------------ reading the list

test("the list is read newest first and the walk ends at the first page with nothing in the window", async () => {
  // 120 entries from yesterday, then 130 from a month ago; internships at positions 0, 110 (in the window) and 200 (too old)
  const entries = Array.from({ length: 250 }, (_, i) => entry(i, { title: [0, 110, 200].includes(i) ? "Praktikum Softwareentwicklung (m/w/d)" : "Elektriker (m/w/d)", date: i < 120 ? day(1) : day(30) }));
  const fake = service(entries);
  const result = await read(fake).run();
  assert.deepEqual(fake.pages(), [1, 2, 3]); // page 3 is wholly older: page 4 is never asked for
  assert.equal(result.stats.inWindow, 120);
  assert.equal(result.jobs.length, 2);
  assert.equal(fake.details(), 2);
});

test("only internships for students are read, once each, and what the board knows is not read again", async () => {
  const entries = [
    entry(1), entry(1), // the same reference twice (a list can overlap between pages)
    entry(2, { title: "Werkstudent Softwareentwicklung (m/w/d)" }),
    entry(3, { title: "FOS-Praktikum Büromanagement (m/w/d)" }),
    entry(4, { title: "Pflichtpraktikum Logistik (m/w/d)" }),
    entry(5, { date: day(30) }), // published before the window
  ];
  const known = postingKey(jobUrl("10000-4-S"));
  const fake = service(entries);
  const result = await read(fake).run({ isKnown: (key) => key === known });
  assert.deepEqual(result.jobs.map((job) => job.url), [jobUrl("10000-1-S")]);
  assert.deepEqual(result.known, [known]);
  assert.equal(result.stats.notInternship, 2);
  assert.equal(fake.details(), 1);
});

test("a hit gives the board's extractors what they read: the structured duration wins, the city and country come from the place", async () => {
  const majors = [{ id: "computer-science", name: "Computer Science", area: "Computing", de: ["Softwareentwicklung"], en: [], skills: ["Python"] }];
  const ctx = { majors, rules, germanCities: new Set(), today: TODAY, skills: { vocabulary: ["Python", "SQL"], aliases: {} } };
  const text = "Nach 3 Monaten Einarbeitung arbeitest du in Softwareentwicklung mit Python. Deutsch B2 und Englisch C1. Kontakt: Erika Muster, erika@firma.de";
  const withMonths = toHit(listItem(entry(1, { ort: "Ulm, Donau", firma: "ZwickRoell GmbH & Co. KG", text, months: 6 })), detailOf(entry(1, { ort: "Ulm, Donau", firma: "ZwickRoell GmbH & Co. KG", text, months: 6 })));
  assert.equal(withMonths.url, "https://www.arbeitsagentur.de/jobsuche/jobdetail/10000-1-S");
  assert.equal(withMonths.location, "Ulm, Donau, Deutschland");
  assert.equal(withMonths.source, "Arbeitsagentur Jobbörse");
  const posting = toBoardPosting(withMonths, ctx);
  assert.deepEqual(posting.weeks, { min: 26, max: 26 }); // the 6 months of the form, not the 3 months of the text
  assert.equal(posting.city, "Ulm");
  assert.equal(posting.country, "Germany");
  assert.equal(posting.company, "ZwickRoell GmbH & Co. KG");
  assert.equal(posting.datePosted, day(1));
  assert.equal(posting.kind, "Praktikum");
  assert.deepEqual(posting.majors, ["computer-science"]);
  assert.deepEqual([posting.germanLevel, posting.englishLevel], ["B2", "C1"]);
  assert.ok(!JSON.stringify(posting).includes("erika@firma.de"), "contact details must not be published");

  const withoutMonths = toBoardPosting(toHit(listItem(entry(2)), detailOf(entry(2, { text: "Dauer: 4 Monate. Python." }))), ctx);
  assert.deepEqual(withoutMonths.weeks, { min: 17, max: 17 }); // no structured duration: the text decides
  const nothing = toBoardPosting(toHit(listItem(entry(3)), detailOf(entry(3, { text: "Python." }))), ctx);
  assert.equal(nothing.weeks, null); // never guessed
});

test("titles and companies come out as plain text on one line, and the occupations travel as the field", () => {
  const item = { ...listItem(entry(1, { title: "Praktikant (w/m/d) Energie &amp;  Umwelt   &#220;bernahme", firma: "  Müller &amp; Söhne \n GmbH " })), hauptberuf: "Energietechniker/in", alleBerufe: ["Energietechniker/in", "Umwelttechniker/in"] };
  const hit = toHit(item, detailOf(entry(1, { text: "Fit f&uuml;r Energie &amp; Umwelt.", firma: "  Müller &amp; Söhne \n GmbH " })));
  assert.equal(hit.title, "Praktikant (w/m/d) Energie & Umwelt Übernahme");
  assert.equal(hit.company, "Müller & Söhne GmbH");
  assert.equal(hit.field, "Energietechniker/in, Umwelttechniker/in");
  assert.equal(hit.description, "Fit für Energie & Umwelt.");
  assert.equal(toHit(listItem(entry(2, { title: "Praktikum &bogus; &#0; (m/w/d)" })), {}).title, "Praktikum &bogus; &#0; (m/w/d)"); // what is not an entity we know stays as it is
});

// ------------------------------------------------------------ being a good guest

test("it says who it is, sends the public key, and never calls faster than four times a second", async () => {
  const fake = service([entry(1), entry(2)]);
  const run = read(fake);
  await run.run({ config: { delayMs: 0 } }); // a configured 0 is raised to the floor
  assert.ok(fake.calls.length >= 3);
  for (const { headers } of fake.calls) {
    assert.equal(headers["X-API-Key"], "jobboerse-jobsuche");
    assert.match(headers["User-Agent"], /GJUInternshipBoard.*github\.com\/Hamza928505\/GJUInternshipBoard/);
  }
  assert.equal(run.waits.length, fake.calls.length - 1); // a pause before every call but the first
  assert.ok(run.waits.every((ms) => ms >= 250), JSON.stringify(run.waits));
});

test("a busy service is retried after a pause; a refusal on the first page stops the source with a clear message", async () => {
  const busy = service([entry(1)], { answer: (u, n) => (n === 1 ? reply(503, {}) : n === 2 ? reply(429, {}, { "retry-after": "7" }) : null) });
  const run = read(busy);
  const result = await run.run();
  assert.equal(result.jobs.length, 1);
  assert.ok(run.waits.includes(1000) && run.waits.includes(7000), JSON.stringify(run.waits)); // the first backoff, then the one the service asked for

  const down = read(service([entry(1)], { answer: () => reply(503, {}) }));
  await assert.rejects(down.run(), (error) => error instanceof SourceError && /answered 503/.test(error.message));

  const refused = read(service([entry(1)], { answer: () => reply(403, "No match found for request") }));
  await assert.rejects(refused.run(), /403.*changed or blocked/);

  const silent = read({ fetchImpl: async () => { throw new Error("socket hang up"); }, calls: [] });
  await assert.rejects(silent.run(), /no answer from the Arbeitsagentur \(socket hang up\)/);
});

test("trouble after the first page keeps what was read and says so", async () => {
  const entries = Array.from({ length: 150 }, (_, i) => entry(i, { title: i === 3 ? "Praktikum Softwareentwicklung (m/w/d)" : "Elektriker (m/w/d)" }));
  const fake = service(entries, { answer: (u) => (u.searchParams.get("page") === "2" ? reply(500, {}) : null) });
  const result = await read(fake).run();
  assert.equal(result.jobs.length, 1);
  assert.match(result.warnings.join(" "), /stopped reading the list at page 2/);
});

test("an advert that is gone is skipped, three failures in a row stop the reading", async () => {
  const gone = service([entry(1), entry(2)]);
  const withGap = { ...gone, fetchImpl: async (url, options) => (String(url).includes(Buffer.from("10000-1-S").toString("base64")) ? reply(404, {}) : gone.fetchImpl(url, options)) };
  const result = await read(withGap).run();
  assert.deepEqual(result.jobs.map((job) => job.url), [jobUrl("10000-2-S")]);
  assert.equal(result.stats.unavailable, 1);
  assert.deepEqual(result.settled, []); // a 404 may be a hiccup: it is asked again next run

  const entries = Array.from({ length: 6 }, (_, i) => entry(i));
  const failing = service(entries, { answer: (u) => (u.pathname.includes("/jobdetails/") ? reply(400, {}) : null) });
  const stopped = await read(failing).run();
  assert.equal(stopped.jobs.length, 0);
  assert.equal(failing.details(), 3);
  assert.match(stopped.warnings.join(" "), /three failures in a row/);
});

test("the per-run limit leaves the rest for next time and a too long window says so", async () => {
  const capped = await read(service(Array.from({ length: 5 }, (_, i) => entry(i)))).run({ config: { maxDetails: 2 } });
  assert.equal(capped.jobs.length, 2);
  assert.equal(capped.stats.notFetched, 3);
  assert.match(capped.warnings.join(" "), /3 more internships were not read this run/);

  const deep = await read(service(Array.from({ length: 300 }, (_, i) => entry(i, { title: "Elektriker (m/w/d)" })))).run({ config: { maxPages: 2, pageSize: 100 } });
  assert.match(deep.warnings.join(" "), /longer than the 200 results one query can reach/);
});

test("the client turns an unreadable answer into a SourceError", async () => {
  const client = createClient({ fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => { throw new Error("bad json"); } }), sleep: async () => {} });
  await assert.rejects(client.get("/v6/jobs"), /cannot be read/);
});
