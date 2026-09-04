/**
 * Harvest the skills out of the internship tracker into data/skill-pool.json.
 *
 *   npm run skills:harvest                     # from data/tracker.csv
 *   npm run skills:harvest -- some-other.xlsx   # from a workbook elsewhere
 *
 * The "Skills they ask for" column fills up with real requirements from real
 * adverts in your field, in German as often as English. That is a far better
 * catalogue than anything hand-written: it is exactly the distribution of words
 * the employers you are applying to actually use.
 *
 * This reads that column back out and writes a pool the editor offers as
 * suggestions, ranked above the curated library. Run it whenever the tracker
 * has grown; it is additive, so nothing you harvested before is lost.
 */

import fs from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";

import { DATA_DIR, ROOT } from "../lib/content.mjs";
import { CSV_PATH, readTracker } from "../lib/tracker.mjs";
import { ALL_LIBRARY_SKILLS } from "../src/assets/skill-library.js";

const OUT = path.join(DATA_DIR, "skill-pool.json");
const COLUMN = "Skills they ask for";

/** Same normalisation as the editor and the Fit % formula, so all three agree. */
const forMatch = (text) =>
  ` ${String(text)
    .toLowerCase()
    .replace(/[,;:./\-()[\]*?~\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;

/**
 * A cell holds either a list someone typed or a paragraph pasted from an advert.
 * A list splits cleanly; a paragraph does not, so it is matched against what we
 * already know instead of being chopped into nonsense.
 */
function skillsFromCell(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];

  const parts = raw
    .split(/[\n\r,;|]+/)
    .map((s) => s.trim().replace(/^[-*•]\s*/, "").replace(/\.$/, ""))
    .filter(Boolean);

  // Short, non-sentence fragments are a list; anything else is prose.
  const looksLikeList =
    parts.length > 1 && parts.every((p) => p.length <= 60 && p.split(/\s+/).length <= 6);
  if (looksLikeList) return parts;

  const haystack = forMatch(raw);
  return ALL_LIBRARY_SKILLS.filter((skill) => skill.length > 1 && haystack.includes(forMatch(skill)));
}

function readExisting() {
  if (!fs.existsSync(OUT)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(OUT, "utf8"));
    return Array.isArray(parsed.skills) ? parsed.skills : [];
  } catch {
    return [];
  }
}

/**
 * The tracker rows, straight from data/tracker.csv. That file is the source of
 * truth, so harvesting no longer needs the workbook to have been built first;
 * an explicit .xlsx path still works for a workbook from somewhere else.
 */
function cellsFromCsv() {
  return readTracker().map((row) => row.wants).filter((v) => String(v ?? "").trim());
}

async function main() {
  const explicit = process.argv[2];

  if (!explicit) {
    const cells = cellsFromCsv();
    const seen = new Map();
    for (const skill of readExisting()) seen.set(skill.toLowerCase(), skill);
    const before = seen.size;
    for (const text of cells) {
      for (const skill of skillsFromCell(text)) {
        const key = skill.toLowerCase();
        if (!seen.has(key)) seen.set(key, skill);
      }
    }
    writePool(seen, before, cells.length, path.relative(ROOT, CSV_PATH).replace(/\\/g, "/"));
    return;
  }

  const file = path.resolve(explicit);
  if (!fs.existsSync(file)) {
    console.error(`No workbook at ${path.relative(ROOT, file).replace(/\\/g, "/")}.`);
    console.error("Omit the argument to harvest from data/tracker.csv, or pass a real path.");
    process.exitCode = 1;
    return;
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet("Search");
  if (!ws) {
    console.error("That workbook has no “Search” sheet — is it the internship tracker?");
    process.exitCode = 1;
    return;
  }

  let column = 0;
  for (let c = 1; c <= ws.columnCount; c++) {
    if (String(ws.getCell(1, c).value ?? "").trim() === COLUMN) column = c;
  }
  if (!column) {
    console.error(`That sheet has no “${COLUMN}” column.`);
    process.exitCode = 1;
    return;
  }

  const seen = new Map();
  for (const skill of readExisting()) seen.set(skill.toLowerCase(), skill);
  const before = seen.size;

  let rows = 0;
  for (let r = 2; r <= ws.rowCount; r++) {
    const cell = ws.getCell(r, column).value;
    const text = cell && typeof cell === "object" ? cell.text ?? "" : cell ?? "";
    if (!String(text).trim()) continue;
    rows += 1;
    for (const skill of skillsFromCell(text)) {
      const key = skill.toLowerCase();
      if (!seen.has(key)) seen.set(key, skill);
    }
  }

  writePool(seen, before, rows, path.relative(ROOT, file).replace(/\\/g, "/"));
}

/** Write data/skill-pool.json and report. Shared by the CSV and workbook paths. */
function writePool(seen, before, rows, source) {
  const skills = [...seen.values()].sort((a, b) => a.localeCompare(b));
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      { source, generatedAt: new Date().toISOString(), count: skills.length, skills },
      null,
      2
    ) + "\n"
  );

  console.log(`Wrote ${path.relative(ROOT, OUT).replace(/\\/g, "/")}`);
  console.log(`  source ${source}`);
  console.log(`  ${rows} row${rows === 1 ? "" : "s"} with requirements read`);
  console.log(`  ${skills.length} skills in the pool (${skills.length - before} new)`);
  if (!rows) {
    console.log("\n  Nothing to harvest yet — fill in “Skills they ask for” as you apply,");
    console.log("  pasting the requirements straight out of each advert.");
  }
}

await main();
