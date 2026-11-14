/**
 * When each job board and search source was last searched, and what came back: data/search-runs.json (git-ignored).
 * The workspace search writes it; the Job Boards page shows it as "last scan". Also the boards the student added by
 * hand (data/job-boards.json), which that page lists beside the built-in ones.
 */
import fs from "node:fs";
import path from "node:path";

import { ROOT } from "./content.mjs";

const RUNS = path.join(ROOT, "data", "search-runs.json");
const BOARDS = path.join(ROOT, "data", "job-boards.json");
const read = (file, empty) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return empty; } };
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 1)}\n`); };

export const readRuns = (file = RUNS) => read(file, { boards: {} });

/**
 * Record one search. `boards` maps a board's name to { ok, found, via }: `ok` false means the source that covers the
 * board failed, so its last successful scan stays what it was.
 */
export function recordRuns(boards, { file = RUNS, now = new Date().toISOString() } = {}) {
  const runs = readRuns(file);
  for (const [name, run] of Object.entries(boards)) {
    const previous = runs.boards[name] || {};
    runs.boards[name] = run.ok ? { lastScan: now, found: run.found, via: run.via, lastTry: now } : { ...previous, lastTry: now, lastError: run.via };
  }
  write(file, runs);
  return runs;
}

const key = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

export const readCustomBoards = (file = BOARDS) => read(file, { boards: [] }).boards;

export function addCustomBoard({ name, url }, file = BOARDS) {
  const label = String(name || "").replace(/\s+/g, " ").trim().slice(0, 60);
  let parsed;
  try { parsed = new URL(String(url || "").trim()); } catch { parsed = null; }
  if (!label || !parsed || !["http:", "https:"].includes(parsed.protocol)) throw Object.assign(new Error("Give the board a name and its full web address, starting with https://."), { statusCode: 400 });
  const boards = readCustomBoards(file).filter((board) => key(board.name) !== key(label));
  boards.push({ name: label, url: parsed.href, addedAt: new Date().toISOString().slice(0, 10) });
  write(file, { boards });
  return boards;
}

export function removeCustomBoard(name, file = BOARDS) {
  const boards = readCustomBoards(file).filter((board) => key(board.name) !== key(name));
  write(file, { boards });
  return boards;
}
