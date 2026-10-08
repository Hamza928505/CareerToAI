import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";

import { chatJson, extractJson, llmConfig } from "../lib/llm.mjs";
import { scoreJobs, suggestRoles } from "../lib/profile-ai.mjs";
import { applyParagraphEdits, docxParagraphs, loadDocx, pruneStudent } from "../lib/student-files.mjs";
import { fillPlaceholders, slug, tailorDocuments } from "../lib/tailor-docs.mjs";
import { z } from "zod";

const run = (text, props = "<w:rPr><w:b/></w:rPr>") => `<w:r>${props}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const para = (...runs) => `<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr>${runs.join("")}</w:p>`;

async function fixture(paragraphs) {
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document><w:body>${paragraphs.join("")}</w:body></w:document>`);
  zip.file("word/media/image1.png", Buffer.from([1, 2, 3]));
  zip.file("word/styles.xml", "<styles/>");
  return zip.generateAsync({ type: "nodebuffer" });
}

const CV = [
  para(run("Profile")),
  para(),
  para(run("Final-year student, builds web apps.", "")),
  para(run("E-mail:"), run("me@example.com", "")),
  para(run("Skills: "), run("C#, SQL &amp; Git", "")),
];
const CL = [
  para(run("Application for [Role title]")),
  para(run("Dear [Hiring manager’s name / Hiring Team],")),
  para(run("I am applying to [Company name]. [Add one specific reason.]", "")),
  para(run("Deggendorf, [DD Month YYYY]")),
];

test("unedited document text round-trips and empty paragraphs are skipped", async () => {
  const { xml } = await loadDocx(await fixture(CV));
  assert.equal(applyParagraphEdits(xml, {}).xml, xml);
  const paragraphs = docxParagraphs(xml);
  assert.deepEqual(paragraphs.map((p) => p.i), [0, 2, 3, 4]);
  assert.deepEqual(paragraphs.at(-1).runs, ["Skills: ", "C#, SQL & Git"]);
});

test("an edit changes only the text of its runs and keeps every other part", async () => {
  const buffer = await fixture(CV);
  const { zip, xml } = await loadDocx(buffer);
  const result = applyParagraphEdits(xml, { 4: ["Skills: ", "C#, Python & <Docker>"], 2: ["Backend student."] });
  assert.equal(result.changed, 2);
  assert.equal(result.xml.replace(/<w:t[^>]*>[^<]*<\/w:t>/g, "<w:t/>"), xml.replace(/<w:t[^>]*>[^<]*<\/w:t>/g, "<w:t/>"));
  assert.deepEqual(docxParagraphs(result.xml).map((p) => p.runs), [["Profile"], ["Backend student."], ["E-mail:", "me@example.com"], ["Skills: ", "C#, Python & <Docker>"]]);
  zip.file("word/document.xml", result.xml);
  const saved = await JSZip.loadAsync(await zip.generateAsync({ type: "nodebuffer" }));
  assert.deepEqual(Object.keys(saved.files).sort(), ["word/document.xml", "word/media/", "word/media/image1.png", "word/styles.xml", "word/"].sort());
});

test("a paragraph with the wrong run count is left alone and counted as skipped", async () => {
  const { xml } = await loadDocx(await fixture(CV));
  const result = applyParagraphEdits(xml, { 4: ["only one run"] });
  assert.equal(result.xml, xml);
  assert.equal(result.skipped, 1);
});

test("placeholders fill from the job row, and empty values leave them for the model", () => {
  const row = { company: "Acme GmbH", position: "Backend intern", contact_person: "", opportunity_type: "Internship" };
  const now = new Date("2026-10-07T10:00:00Z");
  assert.equal(fillPlaceholders("Application for [Role title] at [Company name]", row, now), "Application for Backend intern at Acme GmbH");
  assert.equal(fillPlaceholders("Dear [Hiring manager’s name / Hiring Team],", row, now), "Dear Hiring Team,");
  assert.equal(fillPlaceholders("Deggendorf, [DD Month YYYY]", row, now), "Deggendorf, 7 October 2026");
  assert.equal(fillPlaceholders("[Company address]", row, now), "[Company address]");
});

test("tailorDocuments rewrites body text, protects contact lines and reports leftovers", async () => {
  const files = { cv: await fixture(CV), cl: await fixture(CL) };
  let seen;
  const chat = async ({ user }) => {
    seen = JSON.parse(user);
    return { cv: { 2: ["Backend student for Acme."], 3: ["E-mail:", "evil@example.com"] }, cl: { 2: ["I am applying to Acme GmbH because of its API work."] } };
  };
  const out = await tailorDocuments({
    row: { company: "Acme GmbH", position: "Backend intern", contact_person: "Ms Lee" },
    student: { profile: { firstName: "A" } }, now: new Date("2026-10-07T10:00:00Z"), chat, readDocx: (kind) => files[kind],
  });
  assert.equal(seen.COVER_LETTER_PARAGRAPHS[0].runs[0], "Application for Backend intern");
  const cv = docxParagraphs((await loadDocx(out.cv)).xml);
  assert.deepEqual(cv.map((p) => p.runs), [["Profile"], ["Backend student for Acme."], ["E-mail:", "me@example.com"], ["Skills: ", "C#, SQL & Git"]]);
  const cl = docxParagraphs((await loadDocx(out.cl)).xml);
  assert.equal(cl[1].runs[0], "Dear Ms Lee,");
  assert.equal(cl[2].runs[0], "I am applying to Acme GmbH because of its API work.");
  assert.deepEqual(out.stats, { cv: { changed: 1, skipped: 1 }, cl: { changed: 1, skipped: 0 } });
  assert.deepEqual(out.unfilled, []);
});

test("slug keeps file names safe", () => {
  assert.equal(slug("Müller & Söhne GmbH / Köln"), "muller-sohne-gmbh-koln");
  assert.equal(slug("../../etc"), "etc");
  assert.equal(slug(""), "job");
});

test("pruneStudent drops images and ids but keeps text", () => {
  assert.deepEqual(pruneStudent({ profile: { bio: "hi", photo: "data:image/png;base64,AAA" }, experience: [{ _key: "k", id: "1", title: "Dev", attachmentImage: "data:x", imageKey: "z" }] }), { profile: { bio: "hi" }, experience: [{ title: "Dev" }] });
});

// ------------------------------------------------------------ llm client

test("extractJson reads fenced and chatty replies", () => {
  assert.deepEqual(extractJson('Sure!\n```json\n{"a":1}\n```'), { a: 1 });
  assert.equal(extractJson("no json here"), null);
});

test("llmConfig picks the provider from env and never needs a key for ollama", () => {
  assert.equal(llmConfig({}), null);
  assert.equal(llmConfig({ LLM_PROVIDER: "openrouter" }), null);
  assert.equal(llmConfig({ LLM_PROVIDER: "ollama" }).baseUrl, "http://localhost:11434/v1");
  assert.equal(llmConfig({ LLM_PROVIDER: "nvidia", NVIDIA_API_KEY: "k", LLM_MODEL: "m" }).model, "m");
  assert.equal(llmConfig({ ANTHROPIC_API_KEY: "k" }).provider, "anthropic");
});

function stubFetch(replies) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: replies.shift() } }] }) };
  };
  return { impl, calls };
}
const config = { provider: "openrouter", baseUrl: "https://example.test/v1", key: "secret", model: "m" };
const schema = z.object({ n: z.number() });

test("chatJson sends the key as a bearer token and validates the reply", async () => {
  const { impl, calls } = stubFetch(['```json\n{"n": 2}\n```']);
  assert.deepEqual(await chatJson({ system: "s", user: "u", schema, config, fetchImpl: impl }), { n: 2 });
  assert.equal(calls[0].url, "https://example.test/v1/chat/completions");
  assert.equal(calls[0].headers.Authorization, "Bearer secret");
});

test("chatJson retries once on a bad reply, then gives up", async () => {
  const retry = stubFetch(["not json", '{"n": 1}']);
  assert.deepEqual(await chatJson({ system: "s", user: "u", schema, config, fetchImpl: retry.impl }), { n: 1 });
  assert.match(retry.calls[1].body.messages[1].content, /rejected/);
  const fail = stubFetch(['{"n":"x"}', "still bad"]);
  await assert.rejects(chatJson({ system: "s", user: "u", schema, config, fetchImpl: fail.impl }), /usable JSON/);
});

// ------------------------------------------------------------ search with files

test("suggestRoles returns only roles the form can show, and never cities or types", async () => {
  const options = { roles: [{ name: "Software developer", de: "Softwareentwickler/in" }, { name: "Data analyst", de: "" }], cities: [{ name: "München", value: "München" }] };
  const out = await suggestRoles({
    options,
    context: async () => ({}),
    chat: async () => ({ roles: ["software developer", "Astronaut", "Softwareentwickler", "data analyst"], cities: ["München"], types: ["Internship"] }),
  });
  assert.deepEqual(out, { roles: ["Software developer", "Data analyst"] });
});

test("scoreJobs clamps scores, maps them to postings and survives a failed batch", async () => {
  const jobs = Array.from({ length: 7 }, (_, n) => ({ url: `https://x.test/${n}`, title: `Job ${n}` }));
  let call = 0;
  const chat = async () => {
    if (++call === 2) throw new Error("rate limited");
    return { scores: [{ n: 0, score: 140, reason: "Matches C#", missing: "Go" }, { n: 9, score: 50 }] };
  };
  const { scores, error } = await scoreJobs({ jobs, chat, student: () => ({}) });
  assert.deepEqual(scores.get("https://x.test/0"), { score: 100, reason: "Matches C#", missing: "Go" });
  assert.equal(scores.size, 1);
  assert.equal(error, "rate limited");
});

test("mergeSearchResults uses an AI match when a hit carries one, the built-in score otherwise", async () => {
  const { mergeSearchResults } = await import("../lib/application-flow.mjs");
  const hit = (n, extra = {}) => ({ url: `https://jobs.test/job/${n}000`, title: "Software developer intern", company: `Co${n}`, ...extra });
  const { rows } = mergeSearchResults([], [hit(1, { match: { score: 91, reason: "AI says so", missing: "Go" } }), hit(2)]);
  assert.deepEqual([rows[0].match_score, rows[0].why_match, rows[0].missing_reqs], ["91", "AI says so", "Go"]);
  assert.notEqual(rows[1].why_match, "AI says so");
});

// ------------------------------------------------------------ settings in .env

test("saveSettings edits .env in place, keeps other lines, and never accepts unknown names", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { readSettings, saveSettings } = await import("../lib/env-settings.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "env-"));
  const file = path.join(dir, ".env");
  fs.writeFileSync(file, "# keep me\nTAVILY_API_KEY=old-tavily\nSOMETHING_ELSE=1\nEXA_API_KEY=abc\n");
  const env = { TAVILY_API_KEY: "old-tavily", EXA_API_KEY: "abc" };

  saveSettings({ TAVILY_API_KEY: "new-tavily-1234", LLM_PROVIDER: "openrouter", LLM_MODEL: "my model", EXA_API_KEY: null }, { file, env });
  assert.equal(fs.readFileSync(file, "utf8"), '# keep me\nTAVILY_API_KEY=new-tavily-1234\nSOMETHING_ELSE=1\nLLM_PROVIDER=openrouter\nLLM_MODEL="my model"\n');
  assert.deepEqual([env.TAVILY_API_KEY, env.LLM_PROVIDER, "EXA_API_KEY" in env], ["new-tavily-1234", "openrouter", false]);

  const before = fs.readFileSync(file, "utf8");
  assert.throws(() => saveSettings({ TAVILY_API_KEY: "ok", PATH: "x" }, { file, env }), /not a setting/);
  assert.throws(() => saveSettings({ LLM_PROVIDER: "skynet" }, { file, env }), /one of/);
  assert.throws(() => saveSettings({ TAVILY_API_KEY: "a\nEVIL=1" }, { file, env }), /cannot be saved/);
  assert.throws(() => saveSettings({ LLM_BASE_URL: "file:///etc" }, { file, env }), /http/);
  assert.equal(fs.readFileSync(file, "utf8"), before);

  const shown = readSettings(env);
  const tavily = shown.find((f) => f.name === "TAVILY_API_KEY");
  assert.deepEqual([tavily.set, tavily.hint, "value" in tavily], [true, "••••1234", false]);
  assert.equal(JSON.stringify(shown).includes("new-tavily-1234"), false);
  fs.rmSync(dir, { recursive: true });
});

test("other API keys can be added, listed (hint only), replaced and deleted, but only with credential-style names", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { readSettings, saveSettings } = await import("../lib/env-settings.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "env-"));
  const file = path.join(dir, ".env");
  fs.writeFileSync(file, "TAVILY_API_KEY=t\n");
  const env = {};

  saveSettings({ SERPER_API_KEY: "serper-secret-9999", MY_SERVICE_TOKEN: "tok-1" }, { file, env });
  let custom = readSettings(env, file).filter((f) => f.group === "custom");
  assert.deepEqual(custom.map((f) => [f.name, f.label, f.hint]), [["SERPER_API_KEY", "Serper", "••••9999"], ["MY_SERVICE_TOKEN", "My Service", "••••ok-1"]]);
  assert.equal(JSON.stringify(readSettings(env, file)).includes("serper-secret-9999"), false);

  saveSettings({ SERPER_API_KEY: "replaced-0000", MY_SERVICE_TOKEN: null }, { file, env });
  custom = readSettings(env, file).filter((f) => f.group === "custom");
  assert.deepEqual(custom.map((f) => [f.name, f.hint]), [["SERPER_API_KEY", "••••0000"]]);
  assert.equal(fs.readFileSync(file, "utf8").includes("MY_SERVICE_TOKEN"), false);

  for (const bad of ["PATH", "NODE_OPTIONS", "lowercase_api_key", "KEY", "X_API_KEY_EXTRA", "HTTPS_PROXY"]) {
    assert.throws(() => saveSettings({ [bad]: "x" }, { file, env }), /not a setting/, bad);
  }
  fs.rmSync(dir, { recursive: true });
});

test("the number of other keys is capped", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { saveSettings } = await import("../lib/env-settings.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "env-"));
  const file = path.join(dir, ".env");
  const many = Object.fromEntries(Array.from({ length: 30 }, (_, n) => [`SVC${n}_API_KEY`, "v"]));
  saveSettings(many, { file, env: {} });
  assert.throws(() => saveSettings({ ONE_MORE_API_KEY: "v" }, { file, env: {} }), /up to 30/);
  fs.rmSync(dir, { recursive: true });
});

import { buildApplyPack } from "../lib/apply-pack.mjs";

test("apply pack lists profile details and leaves unknown ones empty", () => {
  const pack = buildApplyPack(
    { firstName: "A", lastName: "B", email: "a@b.c", languages: [{ language: "German", level: "B1" }], links: [{ label: "Github", url: "https://g/x" }] },
    {},
  );
  const get = (label) => pack.find((f) => f.label === label)?.value;
  assert.equal(get("Full name"), "A B");
  assert.equal(get("Languages"), "German (B1)");
  assert.equal(get("Github"), "https://g/x");
  assert.equal(get("Phone"), "");
});
