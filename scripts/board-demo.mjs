#!/usr/bin/env node
/**
 * A preview copy of the public board, filled with INVENTED internships so the page can be looked at before the
 * first real search. Every title starts with "[SAMPLE]", every company is "Beispiel ...", and the page shows a
 * notice saying so. The postings go through the real extraction code (duration, pay, language level, skills,
 * GJU check), so the numbers on the page are computed, not typed in.
 *
 *   node scripts/board-demo.mjs --out <folder>     (then serve that folder, e.g. python -m http.server)
 *
 *   --board  the board repo to copy the page from (default ../GJUBoard)
 */
import fs from "node:fs";
import path from "node:path";

import { ROOT, readJson } from "../lib/content.mjs";
import { SKILL_LIBRARY } from "../src/assets/skill-library.js";
import { boardVocabulary, toBoardPosting } from "../lib/board-extract.mjs";
import { publicRules, skillGroups } from "../lib/board-run.mjs";

const flag = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const board = path.resolve(ROOT, flag("board") || "../GJUBoard");
const out = flag("out") && path.resolve(flag("out"));
if (!out) { console.error("Give --out <folder>."); process.exit(1); }

// the page, without the board's own data and git history
fs.mkdirSync(out, { recursive: true });
for (const entry of fs.readdirSync(out)) fs.rmSync(path.join(out, entry), { recursive: true, force: true }); // the folder itself may be in use by a server
fs.cpSync(board, out, { recursive: true, filter: (src) => !/[\\/]\.git([\\/]|$)/.test(src) && !/[\\/]data([\\/]|$)/.test(src) });
fs.mkdirSync(path.join(out, "data", "days"), { recursive: true });

const rules = readJson(path.join(ROOT, "data", "gju-rules.json"));
const majorsFile = readJson(path.join(board, "board", "majors.json"));
const aliasFile = readJson(path.join(board, "board", "skill-aliases.json"));
const germanCities = new Set(readJson(path.join(ROOT, "src", "assets", "search-options.json")).cities.map((c) => String(c.name).toLowerCase()));
const skills = { vocabulary: boardVocabulary(SKILL_LIBRARY, [], aliasFile.skip || []), aliases: aliasFile.aliases || {} };

// a small seeded random generator, so the preview is the same every time
let seed = 20261010;
const random = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (list) => list[Math.floor(random() * list.length)];
const some = (list, n) => [...list].sort(() => random() - 0.5).slice(0, n);

const NAMES = ["Nordlicht", "Rheinwerk", "Alpenblick", "Hansa", "Technik", "Bayern", "Spree", "Elbe", "Ruhr", "Schwarzwald", "Main", "Isar", "Weser", "Donau", "Lausitz", "Harz"];
const SUFFIX = ["GmbH", "AG", "Systems GmbH", "Gruppe", "Solutions GmbH", "& Co. KG"];
const PLACES = [
  ["Berlin", "Deutschland"], ["München", "Deutschland"], ["Hamburg", "Deutschland"], ["Stuttgart", "Deutschland"], ["Köln", "Deutschland"], ["Frankfurt", "Deutschland"],
  ["Dresden", "Deutschland"], ["Leipzig", "Deutschland"], ["Hannover", "Deutschland"], ["Nürnberg", "Deutschland"], ["Aachen", "Deutschland"], ["Karlsruhe", "Deutschland"],
  ["Wien", "Österreich"], ["Graz", "Österreich"], ["Zürich", "Schweiz"], ["Basel", "Schweiz"],
];
const DURATION = ["Dauer: 6 Monate.", "Dauer: 5 Monate.", "Praktikumsdauer: 20 Wochen.", "Dauer: 3 Monate.", "Dauer: 4-6 Monate.", "Mindestens 6 Monate.", "Dauer: 26 Wochen.", "", ""];
const PAY = ["Vergütung: 1.000 € pro Monat.", "900 € monatlich.", "Vergütung: 861 € pro Monat.", "700 € pro Monat.", "1.200 € pro Monat.", "Unbezahltes Praktikum.", "", ""];
const GERMAN = ["Deutsch B2.", "Gute Deutschkenntnisse.", "Deutsch B1.", "Deutsch C1.", "Deutschkenntnisse nicht erforderlich.", "Deutsch A2.", "", ""];
const ENGLISH = ["Englisch C1.", "Englisch B2.", "Englisch B1.", "", ""];

const today = new Date();
const dayStr = (ago) => new Date(today.getTime() - ago * 86400000).toISOString().slice(0, 10);
const generatedAt = dayStr(0);

const postings = [];
let n = 0;
for (const major of majorsFile.majors) {
  const copies = 2 + (random() < 0.5 ? 1 : 0);
  for (let i = 0; i < copies; i++) {
    const roll = random();
    const title = roll < 0.18 ? `Internship ${pick(major.en)}` : roll < 0.36 ? `Pflichtpraktikum ${pick(major.de)}` : `Praktikum ${pick(major.de)} (m/w/d)`;
    const [city, country] = pick(PLACES);
    const text = [pick(DURATION), pick(PAY), pick(GERMAN), pick(ENGLISH), `Kenntnisse in ${some(major.skills, 3 + Math.floor(random() * 3)).join(", ")}.`].filter(Boolean).join(" ");
    const posted = dayStr(Math.floor(random() * random() * 14));
    n++;
    const posting = toBoardPosting({
      title: `[SAMPLE] ${title}`, company: `Beispiel ${pick(NAMES)} ${pick(SUFFIX)}`, location: country === "Deutschland" ? city : `${city}, ${country}`,
      url: `https://example.com/sample/${n}`, source: "sample", date_posted: posted, snippet: text, description: text,
    }, { majors: majorsFile.majors, rules, germanCities, today: posted, skills });
    posting.lastSeen = generatedAt;
    postings.push(posting);
  }
}
postings.sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || a.title.localeCompare(b.title));

const write = (file, value) => fs.writeFileSync(path.join(out, file), JSON.stringify(value));
write("data/postings.json", postings);
const byDay = new Map();
postings.forEach((p) => byDay.set(p.firstSeen, [...(byDay.get(p.firstSeen) || []), p]));
for (const [date, list] of byDay) write(`data/days/${date}.json`, list);
write("data/skills.json", { groups: skillGroups(SKILL_LIBRARY, aliasFile.skip || []) });
write("data/rules.json", publicRules(rules));
write("data/index.json", {
  generatedAt, total: postings.length,
  days: [...byDay.entries()].map(([date, list]) => ({ date, count: list.length })).sort((a, b) => b.date.localeCompare(a.date)),
  lastRun: { date: generatedAt, areas: majorsFile.areas.slice(0, 3), platforms: ["sample"], found: postings.length, added: postings.length, complete: true },
  notice: "Sample data: these internships are invented to show how the page works. Real internships appear after the first daily update.",
});
const meets = postings.filter((p) => p.gju.overall === "meets").length, fails = postings.filter((p) => p.gju.overall === "fails").length;
console.log(`Preview written to ${out}: ${postings.length} sample internships (${meets} meet the rules, ${fails} below a limit, ${postings.length - meets - fails} to check).`);
