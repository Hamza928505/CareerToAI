/* The Indeed results a student loads from their scheduled Claude task: checking the file, merging it with what is
 * already saved, filtering, sorting, and the text for the clipboard and the CSV. Plain functions, no DOM, so they run
 * in the page and in Node tests. The file is the student's own, so everything in it is treated as untrusted text. */
const L = globalThis.BoardLogic;

export const VERDICTS = ["meets", "check", "fails"];
export const VERDICT_LABELS = { meets: "Meets the rules", check: "Needs checking", fails: "Does not meet" };
export const STATUSES = ["saved", "applied", "rejected", "hidden"];
export const STATUS_LABELS = { none: "No status", saved: "Saved", applied: "Applied", rejected: "Rejected", hidden: "Hidden" };
const STATES = ["ok", "warn", "bad"];
const STATE_WORDS = { ok: "meets", warn: "needs checking", bad: "does not meet" };

const text = (v, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : "");

/** The file's results, cleaned; throws an Error whose message tells the student what is wrong. */
export function parseResults(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error("This is not a JSON file. Choose the .json file your scheduled Claude task saved."); }
  if (!data || data.kind !== "gju-internships" || !Array.isArray(data.internships)) {
    throw new Error("This JSON file is not a GJU internships result. Choose the gju-internships-….json file your scheduled task saved.");
  }
  const at = Date.parse(data.runAt);
  if (isNaN(at)) throw new Error("The file does not say when the search ran (runAt). Run the task again with the latest instructions.");
  const seen = new Set();
  const internships = [];
  for (const r of data.internships) {
    const id = text(r && r.id, 80);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    internships.push({
      id, title: text(r.title, 200) || "Untitled advert", url: L.safeUrl(r.url), company: text(r.company, 120), city: text(r.city, 80),
      country: text(r.country, 60), posted: day(r.posted), verdict: VERDICTS.includes(r.verdict) ? r.verdict : "check", why: text(r.why),
      checks: (Array.isArray(r.checks) ? r.checks : []).slice(0, 12).map((c) => ({ rule: text(c && c.rule, 60), state: STATES.includes(c && c.state) ? c.state : "warn", quote: text(c && c.quote) })).filter((c) => c.rule),
      notes: (Array.isArray(r.notes) ? r.notes : []).slice(0, 12).map((n) => ({ label: text(n && n.label, 60), text: text(n && n.text) })).filter((n) => n.label),
    });
  }
  const q = data.query || {};
  return {
    runAt: new Date(at).toISOString(),
    query: { major: text(q.major, 120), location: text(q.location, 80) },
    internships,
  };
}

/** Saved results plus a newly loaded file. A row keeps the run it was first seen in; the newer copy of a row wins. */
export function mergeResults(saved, file) {
  const rows = new Map((saved ? saved.rows : []).map((r) => [r.id, r]));
  for (const r of file.internships) {
    const old = rows.get(r.id);
    const firstSeen = old && old.firstSeen < file.runAt ? old.firstSeen : file.runAt;
    const lastSeen = old && old.lastSeen > file.runAt ? old.lastSeen : file.runAt;
    rows.set(r.id, { ...(old && old.lastSeen > file.runAt ? old : r), firstSeen, lastSeen });
  }
  const newer = !saved || file.runAt > saved.runAt;
  const meta = newer
    ? { runAt: file.runAt, previousRunAt: saved ? saved.runAt : "", query: file.query }
    : { runAt: saved.runAt, previousRunAt: saved.previousRunAt, query: saved.query };
  return { ...meta, rows: [...rows.values()] };
}

/** New: first seen in the latest run, when there was a run before it. */
export const isNew = (row, saved) => Boolean(saved.previousRunAt) && row.firstSeen === saved.runAt;
export const inLatest = (row, saved) => row.lastSeen === saved.runAt;

export const defaultFilters = () => ({ q: "", verdicts: [], cities: [], posted: "", statuses: [] });

/** Rows that pass every filter; `skip` leaves one filter out, so a dropdown can count what each choice would give. */
export function filterRows(rows, f, status, skip, now = new Date()) {
  const tokens = L.norm(f.q).trim().split(/\s+/).filter(Boolean);
  const cities = new Set(f.cities);
  const since = f.posted ? new Date(now.getTime() - Number(f.posted) * 86400000).toISOString().slice(0, 10) : "";
  return rows.filter((r) => {
    if (tokens.length) {
      const hay = L.norm(`${r.title} ${r.company} ${r.city} ${r.why}`);
      if (!tokens.every((t) => hay.includes(t))) return false;
    }
    if (skip !== "verdicts" && f.verdicts.length && !f.verdicts.includes(r.verdict)) return false;
    if (skip !== "cities" && cities.size && !cities.has(L.norm(r.city))) return false;
    if (skip !== "posted" && since && !(r.posted && r.posted >= since)) return false;
    if (skip !== "statuses") {
      const s = status[r.id] || "none";
      // a hidden row stays out of sight until the student asks for hidden rows
      if (f.statuses.length ? !f.statuses.includes(s) : s === "hidden") return false;
    }
    return true;
  });
}

const VERDICT_ORDER = { meets: 0, check: 1, fails: 2 };
const blankLast = (x, y) => (!x) - (!y) || x.localeCompare(y);
const SORTS = {
  title: (a, b) => a.title.localeCompare(b.title),
  company: (a, b) => blankLast(a.company, b.company),
  city: (a, b) => blankLast(a.city, b.city),
  posted: (a, b) => (b.posted || "").localeCompare(a.posted || ""),
  verdict: (a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict],
};

/** Sorted by `key`, newest first among equals; dir -1 reverses. */
export function sortRows(rows, key, dir) {
  const by = SORTS[key] || SORTS.verdict;
  return rows.slice().sort((a, b) => dir * by(a, b) || SORTS.posted(a, b) || a.title.localeCompare(b.title));
}

/** One advert as plain text to paste into Claude. */
export function claudeText(r) {
  const place = [r.city, r.country].filter(Boolean).join(", ");
  return [
    `Internship: ${r.title}`,
    `Company: ${r.company || "not stated"}${place ? ` · ${place}` : ""}`,
    r.url ? `Advert: ${r.url}` : null,
    `GJU check (read from the advert, not GJU's approval): ${VERDICT_LABELS[r.verdict]}.${r.why ? ` ${r.why}` : ""}`,
    ...r.checks.map((c) => `- ${c.rule}: ${c.quote || "not stated"} (${STATE_WORDS[c.state]})`),
    ...r.notes.map((n) => `- ${n.label}: ${n.text || "not stated"}`),
    "",
    "Help me tailor my CV and cover letter to this advert. Ask me for anything you need.",
  ].filter((line) => line != null).join("\n");
}

/** A CSV cell: quoted, and a leading = + - @ made harmless so Excel never runs it as a formula. */
const cell = (v) => {
  let s = String(v == null ? "" : v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

/** The rows as a CSV that Excel opens with umlauts intact (UTF-8 with a byte order mark). */
export function toCsv(rows, status) {
  const head = ["Internship", "Company", "City", "Country", "Posted", "GJU verdict", "Why", "Status", "Checks", "Notes", "Link", "First seen", "Last seen"];
  const lines = rows.map((r) => [
    r.title, r.company, r.city, r.country, r.posted, VERDICT_LABELS[r.verdict], r.why, STATUS_LABELS[status[r.id] || "none"],
    r.checks.map((c) => `${c.rule}: ${c.quote || "not stated"} (${STATE_WORDS[c.state]})`).join("; "),
    r.notes.map((n) => `${n.label}: ${n.text || "not stated"}`).join("; "),
    r.url, r.firstSeen.slice(0, 10), r.lastSeen.slice(0, 10),
  ].map(cell).join(","));
  return "﻿" + [head.map(cell).join(","), ...lines].join("\r\n");
}
