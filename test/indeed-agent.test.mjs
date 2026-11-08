import assert from "node:assert/strict";
import { mkdtemp, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { INDEED_SEARCHES, parseIndeed, runClaude, searchIndeed } from "../lib/indeed-agent.mjs";

// What the Indeed connector returned on 2026-10-24 (search results, then one job's details), shortened.
const SEARCH = "**Job Title:** Duales Studium Informatik (w/m/d) 2027\n            **Job Id:** JOBSEARCH_100907\n            **Company:** ANDREAS STIHL AG & Co. KG\n            **Location:** Stuttgart\n            **Posted on:** September 28, 2026\n            **Job Type:** Apprenticeship\n            **Compensation:** N/A\n            **View Job URL:** https://to.indeed.com/aa2xgwxpjj4k\n            \n\n**Job Title:** Praktikum Softwareentwicklung & Künstliche Intelligenz (KI)\n            **Job Id:** JOBSEARCH_100908\n            **Company:** SYSTAG Systemhaus\n            **Location:** Metzingen\n            **Posted on:** October 14, 2026\n            **Job Type:** Internship\n            **Compensation:** N/A\n            **View Job URL:** https://to.indeed.com/aab74nl6vx9k\n            ";
const DETAILS = "### Praktikum Softwareentwicklung & Künstliche Intelligenz (KI)\n        **View Job URL:** https://to.indeed.com/aajpmjm8gnzz\n        **Job Id:** JOBSEARCH_100908\n        **Company:** SYSTAG Systemhaus\n        **Location:** Metzingen\n        **Posted on:** October 14, 2026\n        **Job Type:** Internship\n        **Compensation:** None\n\n        Praktikum Softwareentwicklung & KI bei SYSTAG in Metzingen.\n\nDabei arbeitest du mit C#, .NET, n8n, REST APIs, Git und Microsoft Azure.\n\nBeginn: jederzeit nach Absprache\n        ";

const NONE = path.join(os.tmpdir(), "no-such-presearch.md");
const line = (event) => JSON.stringify(event);
const call = (id, name) => line({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input: {} }] } });
const answer = (id, content, extra = {}) => line({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content, ...extra }] } });

test("the connector's search results and job details become postings with ISO dates", () => {
  const found = parseIndeed(SEARCH);
  assert.deepEqual(found.map((j) => [j.title, j.company, j.location, j.date_posted, j.url]), [
    ["Duales Studium Informatik (w/m/d) 2027", "ANDREAS STIHL AG & Co. KG", "Stuttgart", "2026-09-28", "https://to.indeed.com/aa2xgwxpjj4k"],
    ["Praktikum Softwareentwicklung & Künstliche Intelligenz (KI)", "SYSTAG Systemhaus", "Metzingen", "2026-10-14", "https://to.indeed.com/aab74nl6vx9k"],
  ]);
  assert.equal(found[0].salary, "");
  assert.equal(found[0].description, "");
  const [job] = parseIndeed(DETAILS);
  assert.equal(job.title, "Praktikum Softwareentwicklung & Künstliche Intelligenz (KI)");
  assert.equal(job.id, "JOBSEARCH_100908");
  assert.equal(job.date_posted, "2026-10-14");
  assert.match(job.description, /^Praktikum Softwareentwicklung & KI bei SYSTAG/);
  assert.match(job.description, /C#, \.NET/);
  assert.doesNotMatch(job.description, /View Job URL|Posted on/);
  assert.equal(job.source, "Indeed");
  assert.deepEqual(parseIndeed("No jobs found."), []);
});

test("Indeed postings are read from the tool results, a job's details replace its search line", async () => {
  const stream = [
    line({ type: "system", subtype: "init" }),
    call("t1", "ToolSearch"), answer("t1", [{ type: "text", text: "Loaded 2 tools." }]),
    call("t2", "mcp__claude_ai_Indeed__search_jobs"), answer("t2", [{ type: "text", text: JSON.stringify({ result: SEARCH }) }]),
    call("t3", "mcp__claude_ai_Indeed__get_job_details"), answer("t3", JSON.stringify({ result: DETAILS })),
    line({ type: "result", subtype: "success", is_error: false, result: "DONE" }),
  ].join("\n");
  const asked = [];
  const run = async (prompt) => { asked.push(prompt); return stream; };
  const { jobs, warnings } = await searchIndeed({ days: 7, now: Date.parse("2026-10-16T10:00:00Z"), run, presearch: NONE });
  assert.equal(jobs.length, 2);
  const systag = jobs.find((j) => j.company === "SYSTAG Systemhaus");
  assert.equal(systag.url, "https://to.indeed.com/aajpmjm8gnzz");
  assert.match(systag.description, /REST APIs/);
  assert.match(asked[0], /"search":"Pflichtpraktikum Informatik","location":"Deutschland"/);
  assert.match(asked[0], /2026-10-09 or later/);
  assert.match(warnings[0], /2 postings from 1 search\./);
});

test("a run that never searched Indeed, or got only errors back, is an error", async () => {
  await assert.rejects(searchIndeed({ days: 7, presearch: NONE, run: async () => line({ type: "result", result: "I have no Indeed tools." }) }),
    /did not search Indeed \(I have no Indeed tools\.\)/);
  const refused = [call("t1", "mcp__claude_ai_Indeed__search_jobs"), answer("t1", "Authentication required", { is_error: true })].join("\n");
  await assert.rejects(searchIndeed({ days: 7, presearch: NONE, run: async () => refused }), /Indeed answered with an error: Authentication required/);
});

test("Indeed is asked for IT internships all over Germany, in German and in English", () => {
  assert.ok(INDEED_SEARCHES.every(({ location }) => location === "Deutschland"));
  const terms = INDEED_SEARCHES.map(({ search }) => search);
  assert.ok(terms.some((term) => /^Pflichtpraktikum /.test(term)) && terms.some((term) => /^Praktikum /.test(term)) && terms.some((term) => / Internship$/.test(term)));
  assert.equal(new Set(terms).size, terms.length);
});

test("the headless run gets only ToolSearch and the Indeed tools, and never an Anthropic key", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "sk-test";
  try {
    let seen;
    const fake = (file, args, options, done) => ({ stdin: { end: (input) => { seen = { file, args, options, input }; done(null, "events", ""); } } });
    assert.equal(await runClaude("PROMPT", { cwd: "C:/Internships", execFileImpl: fake }), "events");
    const flag = (name) => seen.args[seen.args.indexOf(name) + 1];
    assert.equal(seen.file, "claude");
    assert.equal(seen.input, "PROMPT");
    assert.equal(seen.options.cwd, "C:/Internships");
    assert.equal(flag("--tools"), "ToolSearch");
    assert.equal(flag("--allowedTools"), "ToolSearch,mcp__claude_ai_Indeed__search_jobs,mcp__claude_ai_Indeed__get_job_details");
    assert.equal(flag("--permission-mode"), "dontAsk");
    assert.equal(seen.options.env.ANTHROPIC_API_KEY, undefined);
    const missing = (file, args, options, done) => ({ stdin: { end: () => done(Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" }), "", "") } });
    await assert.rejects(runClaude("PROMPT", { execFileImpl: missing }), /Claude Code is not installed/);
  } finally {
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved;
  }
});

test("a Cowork pre-search file is merged with the live run, and used alone when the live run fails or the file is old or missing", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "presearch-"));
  const file = path.join(dir, "indeed-presearch.md");
  await writeFile(file, SEARCH);
  const now = Date.parse("2026-10-16T10:00:00Z");
  await utimes(file, new Date(now - 3 * 86400000), new Date(now - 3 * 86400000)); // the laptop was off for three days
  const live = [call("t2", "mcp__claude_ai_Indeed__search_jobs"), answer("t2", JSON.stringify({ result: DETAILS }))].join("\n");
  const merged = await searchIndeed({ days: 7, now, presearch: file, run: async () => live });
  assert.equal(merged.jobs.length, 2); // SYSTAG once, its live details win
  assert.match(merged.jobs.find((j) => j.company === "SYSTAG Systemhaus").description, /REST APIs/);
  assert.match(merged.warnings[0], /Cowork pre-search: 2 postings, 3 days old.*laptop may have been off/);
  const down = await searchIndeed({ days: 7, now, presearch: file, run: async () => { throw new Error("usage limit reached"); } });
  assert.equal(down.jobs.length, 2);
  assert.match(down.warnings.join(" "), /Live Indeed search failed \(usage limit reached\)/);
  await assert.rejects(searchIndeed({ days: 7, now, presearch: NONE, run: async () => { throw new Error("usage limit reached"); } }), /usage limit reached/);
});
