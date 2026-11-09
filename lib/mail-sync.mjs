/**
 * Check my email: what an AI reader may propose from the student's mail, and the rules that keep it honest.
 *
 * Two readers feed this (lib/mail-readers.mjs: Claude through the claude.ai Gmail connector, Gemini through a read-only
 * Gmail token). Both only *propose*. Their answer is untrusted, so nothing in it counts until the code has checked it
 * against the real e-mail text: the message must be one that was actually read, the quoted sentence must be in it, the
 * tracked company must be named in it, and the status move must be allowed (`transition`). The student then approves each
 * change, and only `applyProposals` writes. The rules are those of .claude/commands/gmail-sync.md: classify from full
 * bodies, never propose "hired" or "declined", a conflicting signal goes to manual review, idempotent by message id.
 */
import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import { ROOT } from "./content.mjs";
import { OPEN_STATUSES } from "./tracker.mjs";

export const STATE_FILE = path.join(ROOT, "job-search", "gmail_sync", "state.json"); // gitignored, shared with /gmail-sync
export const LOG_FILE = path.join(ROOT, "job-search", "gmail_sync", "mail-log.json"); // gitignored like the tracker: the text of the e-mails that mattered
export const SIGNALS = ["acknowledged", "interview", "assessment", "request", "offer", "rejection"];
export const SIGNAL_HELP = [
  'acknowledged: "we received your application"',
  "interview: an invitation to, or the scheduling of, an interview, call or next round",
  "assessment: an online test, coding challenge or assessment to complete",
  "request: the employer asks the student to send files or information (CV, certificates, references), fill in a form, or reply by a date",
  "offer: the employer offers the position",
  "rejection: the employer declines or is not moving forward",
].join("; ");

const TARGET = { acknowledged: "Applied", interview: "Interview scheduled", assessment: "Interview scheduled", offer: "Offer", rejection: "Rejected" }; // "request" changes no status
const LABEL = { acknowledged: "Application received", interview: "Interview invitation", assessment: "Assessment", request: "Request from the employer", offer: "Offer", rejection: "Rejection" };
const RANK = { "To apply": 0, Applied: 1, "Follow-up sent": 1, "Interview scheduled": 2, Offer: 3 };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CANDIDATES = 60;
const TEXT_MAX = 3000; // how much of one e-mail is kept when it produced a finding
const LOG_MAX = 500;   // entries kept in the mail log
const tidy = (text) => String(text || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, TEXT_MAX);

/** What a reader must answer. Each finding is checked one by one later, so one bad item never sinks the rest. */
export const findingsSchema = z.object({
  findings: z.array(z.object({
    messageId: z.string(), rowId: z.string(), signal: z.string(), evidence: z.string(),
    subject: z.string().optional(), date: z.string().optional(),
    detail: z.string().optional(), due: z.string().optional(), // what is asked, or when the interview is; a deadline or interview day as YYYY-MM-DD
    company: z.string().optional(), // for an e-mail about an application that is not in the tracker (rowId ""): the employer as the e-mail names it
  })).max(100),
});

/**
 * The applications worth looking for: open ones the student has actually applied to. A "To apply" row counts only when they
 * chose Apply = Yes, because the fill-only flow leaves those rows as "To apply" after they click Submit themselves.
 */
export function candidates(rows) {
  return rows
    .filter((row) => OPEN_STATUSES.includes(row.status) && String(row.company || "").trim() && (row.status !== "To apply" || row.apply === "Yes"))
    .slice(0, MAX_CANDIDATES)
    .map((row) => ({ id: row.id, company: String(row.company).trim(), position: row.position || "", status: row.status }));
}

const ATS = ["greenhouse.io", "lever.co", "myworkday.com", "ashbyhq.com", "smartrecruiters.com", "icims.com", "bamboohr.com", "personio.de", "personio.com", "join.com", "softgarden.io", "successfactors.com", "workable.com", "teamtailor.com"];

// Words in the subject of a reply about an application, in English and German, so mail about an application that is not in the tracker is found too.
const SUBJECTS = ["application", "Bewerbung", "interview", "Vorstellungsgespräch", "Praktikum", "internship", "Absage", "Einladung"];

/** The Gmail search: mail that is not the student's own, from the tracked companies, the usual hiring platforms or with an application word in the subject, since the last check. */
export function mailQuery(list, { lastSync = null } = {}) {
  const names = [...new Set(list.map((row) => row.company.replace(/["{}()]/g, " ").replace(/\s+/g, " ").trim()).filter((name) => name.length >= 3))];
  const since = DAY.test(lastSync || "") ? `after:${lastSync.replaceAll("-", "/")}` : "newer_than:30d";
  return `${since} -in:sent -in:drafts {${[...names.map((name) => `"${name}"`), ...ATS.map((domain) => `from:${domain}`), ...SUBJECTS.map((word) => `subject:${word}`)].join(" ")}}`;
}

// --- matching -------------------------------------------------------------------------------------------------------

const LEGAL_FORM = /\b(?:gmbh|mbh|ag|se|kg|ug|co|inc|llc|ltd|corp|corporation|group|holding|ev|and|und)\b/g; // "&" is "und" in German mail
/** A company name or text in one comparable form: lower case, German umlauts spelled out, no punctuation, no legal form, no "and"/"und". */
export const norm = (text) => ` ${String(text || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, " ").replace(LEGAL_FORM, " ").replace(/\s+/g, " ").trim()} `;
const flat = (text) => String(text || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const namesCompany = (text, company) => { const name = norm(company); return name.trim().length >= 3 && norm(text).includes(name); };

/** The status move a signal allows from the current status: { to }, { skip } (nothing to change) or { conflict }. Never "Ghosted", never beyond "Offer". */
export function transition(current, signal) {
  if (!(current in RANK) || ![...Object.keys(TARGET), "request"].includes(signal)) return { skip: true };
  if (signal === "request") return { to: current }; // asks for something, moves nothing
  if (signal === "acknowledged") return current === "To apply" ? { to: "Applied" } : { skip: true };
  if (signal === "rejection") return current === "Offer" ? { conflict: "A rejection arrived for a row that is already at Offer. Decide this one yourself." } : { to: "Rejected" };
  return RANK[TARGET[signal]] > RANK[current] ? { to: TARGET[signal] } : { skip: true };
}

/**
 * Findings from a reader -> { proposals, review, dropped }.
 * `documents` are what the reader really read: { id, text, subject, sender, date }. A document with no id (Claude hands over
 * whole threads) is matched by finding the message id inside its text.
 */
export function validate({ findings, documents, rows, skip = new Set() }) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const grounded = [], outside = new Map();
  let dropped = 0;
  for (const finding of findings) {
    const row = byId.get(finding.rowId);
    const company = row ? row.company : String(finding.company || "").replace(/\s+/g, " ").trim().slice(0, 120); // not in the tracker: the name the reader gives, checked against the text below
    const id = String(finding.messageId || "").trim();
    if (skip.has(id)) continue; // already handled in an earlier check
    const doc = id.length >= 6 && documents.find((d) => (d.id ? d.id === id : d.text.includes(id)));
    const evidence = flat(finding.evidence);
    const ok = company && SIGNALS.includes(finding.signal) && doc && evidence.length >= 12 && flat(doc.text).includes(evidence) && namesCompany(doc.text, company);
    if (!ok) { dropped++; continue; }
    const move = row ? transition(row.status, finding.signal) : { to: "" };
    if (move.skip) continue;
    const subject = doc.subject || (finding.subject && doc.text.includes(finding.subject) ? finding.subject : "");
    const date = DAY.test(doc.date || "") ? doc.date : DAY.test(finding.date || "") ? finding.date : "";
    // What the reader says is asked or when: not grounded in the text like the quote is, so it is cut short, one line, and shown to the student before it is written.
    const detail = String(finding.detail || "").replace(/\s+/g, " ").trim().slice(0, 200);
    const due = DAY.test(finding.due || "") ? finding.due : "";
    const item = { row, signal: finding.signal, move, id, subject: subject.slice(0, 160), sender: String(doc.sender || "").slice(0, 160), date, evidence: String(finding.evidence).trim().slice(0, 300), detail, due, text: tidy(doc.text) };
    if (row) grounded.push(item);
    else if (!outside.has(id)) outside.set(id, { ...item, company }); // one entry per e-mail; such mail changes no row, it is only kept
  }

  const proposals = [], review = [];
  const groups = new Map(); // per row (Map.groupBy needs Node 21; this project supports 20)
  for (const item of grounded) groups.set(item.row.id, [...(groups.get(item.row.id) || []), item]);
  for (const [rowId, group] of groups) {
    const row = byId.get(rowId);
    const byDate = (a, b) => a.date.localeCompare(b.date);
    const moves = group.filter((item) => item.signal !== "request").toSorted(byDate); // a request moves nothing, so it takes no part in the conflict rules
    const ask = group.filter((item) => item.signal === "request").toSorted(byDate).at(-1);
    const last = moves.at(-1);
    const conflict = last && (group.find((item) => item.move.conflict)?.move.conflict
      || (moves.some((item) => item.signal === "rejection" && item !== last) && "Mail from this employer points both ways (a rejection and something after it).")
      || (last.signal === "rejection" && moves.some((item) => item.signal === "offer") && "An offer and a rejection both arrived. Decide this one yourself."));
    if (conflict) { review.push({ rowId, company: row.company, position: row.position, reason: conflict }); continue; }
    const pick = !last ? ask : last.signal === "rejection" ? last : moves.reduce((best, item) => (RANK[item.move.to] > RANK[best.move.to] ? item : best));
    proposals.push({
      rowId, company: row.company, position: row.position, signal: pick.signal, label: LABEL[pick.signal], from: row.status, to: pick.move.to,
      messageId: pick.id, subject: pick.subject, sender: pick.sender, date: pick.date, evidence: pick.evidence, detail: pick.detail, due: pick.due, text: pick.text,
      ...(ask && ask !== pick ? { ask: { detail: ask.detail, due: ask.due, subject: ask.subject, date: ask.date, evidence: ask.evidence, text: ask.text } } : {}), // a request that came with the status change
    });
  }
  // Mail about an application that is not in the tracker: shown and, when ticked, kept on the Mail page. No row is touched.
  for (const item of outside.values()) {
    proposals.push({
      rowId: `new:${item.id}`, untracked: true, company: item.company, position: "", signal: item.signal, label: LABEL[item.signal], from: "", to: "",
      messageId: item.id, subject: item.subject, sender: item.sender, date: item.date, evidence: item.evidence, detail: item.detail, due: item.due, text: item.text,
    });
  }
  return { proposals, review, dropped };
}

/** How many of each kind the proposals hold, for the summary line. A request that came with a status change counts too. */
export function tally(proposals) {
  const counts = Object.fromEntries(SIGNALS.map((signal) => [signal, 0]));
  for (const item of proposals) { counts[item.signal]++; if (item.ask) counts.request++; }
  return counts;
}

/** Writes the approved proposals into rows. A row whose status changed since the scan is left alone and reported as stale. */
export function applyProposals(rows, proposals, today) {
  const applied = [], stale = [];
  const next = rows.map((row) => {
    const proposal = proposals.find((item) => item.rowId === row.id);
    if (!proposal) return row;
    if (row.status !== proposal.from) { stale.push(proposal); return row; }
    applied.push(proposal);
    const mention = (label, item) => `${today} gmail-sync: ${label}${item.detail ? `: ${item.detail}` : ""}${item.due ? ` (by ${item.due})` : ""}${item.date ? `, e-mail of ${item.date}` : ""}${item.subject ? ` ("${item.subject}")` : ""}`;
    const notes = [mention(proposal.label, proposal), ...(proposal.ask ? [mention(LABEL.request, proposal.ask)] : [])];
    const todo = proposal.ask || (["request", "assessment"].includes(proposal.signal) ? proposal : null); // what the student still has to do, and by when; never over what they wrote
    const set = {
      status: proposal.to,
      notes: [row.notes, ...notes].filter(Boolean).join("\n"),
      ...(proposal.signal === "acknowledged" && proposal.date ? { date_applied: proposal.date } : {}),
      ...(proposal.signal === "interview" && proposal.due && !row.interview_date ? { interview_date: proposal.due } : {}),
      ...(todo && !row.next_action ? { next_action: todo.detail || (todo === proposal ? proposal.label : LABEL.request), ...(todo.due && !row.next_action_date ? { next_action_date: todo.due } : {}) } : {}),
    };
    return { ...row, ...set };
  });
  return { rows: next, applied, stale };
}

// --- state (shared with the /gmail-sync command) ------------------------------------------------------------------------

export function readState(file = STATE_FILE) {
  try { return { last_sync: null, processed_message_ids: [], ...JSON.parse(fs.readFileSync(file, "utf8")) }; } catch { return { last_sync: null, processed_message_ids: [] }; }
}

/** Remembers message ids so the same e-mail is never proposed twice, and the day of this check. */
export function markProcessed(ids, today, file = STATE_FILE) {
  const state = readState(file);
  state.processed_message_ids = [...new Set([...state.processed_message_ids, ...ids])].slice(-5000);
  state.last_sync = today;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

// --- the mail log: what was read from the e-mails that mattered -----------------------------------------------------------
// By the student's choice the text of an e-mail that produced a finding (a rejection, an invitation, a request for files)
// is kept here, so it can be read again later. Only those e-mails, cut to TEXT_MAX; the rest is never stored.

/** Adds one entry per proposal, with what the student decided about it ("applied", "skipped" or "stale"). Keeps the newest LOG_MAX. */
export function logMail(entries, today, file = LOG_FILE) {
  if (!entries.length) return;
  let old = [];
  try { old = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* no log yet */ }
  const added = entries.map(({ proposal, decision }) => ({ logged: today, decision, ...proposal }));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify([...(Array.isArray(old) ? old : []), ...added].slice(-LOG_MAX), null, 2)}\n`);
}

/** The log, newest first. */
export function readLog(file = LOG_FILE) {
  try { const list = JSON.parse(fs.readFileSync(file, "utf8")); return Array.isArray(list) ? list.toReversed() : []; } catch { return []; }
}
