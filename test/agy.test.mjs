import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { z } from "zod";

import { AGY_MODEL, MAX_PROMPT, agyJson, agyModel, agyStatus, forgetConversation, runAgy } from "../lib/agy.mjs";
import { readWithAgy } from "../lib/mail-readers.mjs";

const ID = "78db0a9a-0764-4599-a6b6-85f6f271072e";
const OTHER = "ed62016b-9756-4cc5-a70e-53cc1aee7641";

/** A fake `execFile`: records the call and answers with what `reply(args, options)` returns ({ stdout, stderr, error }). */
function fakeExec(reply) {
  const calls = [];
  const impl = (command, args, options, callback) => {
    calls.push({ command, args, options });
    const { stdout = "", stderr = "", error = null } = reply(args, options);
    queueMicrotask(() => callback(error, stdout, stderr));
    return { stdin: { end() {} } };
  };
  impl.calls = calls;
  return impl;
}

/** A home folder as agy leaves it after runs: a brain folder, a conversation database and a lock per run. */
function fakeHome(...ids) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "agy-home-"));
  for (const id of ids) {
    fs.mkdirSync(path.join(home, "brain", id, "logs"), { recursive: true });
    fs.writeFileSync(path.join(home, "brain", id, "logs", "transcript.jsonl"), "secret e-mail text");
    fs.mkdirSync(path.join(home, "conversations"), { recursive: true });
    fs.writeFileSync(path.join(home, "conversations", `${id}.db`), "db");
    fs.writeFileSync(path.join(home, "conversations", `${id}.db-wal`), "wal");
    fs.mkdirSync(path.join(home, "presence"), { recursive: true });
    fs.writeFileSync(path.join(home, "presence", `${id}.lock`), "");
  }
  return home;
}
const left = (home) => [...fs.readdirSync(path.join(home, "brain")), ...fs.readdirSync(path.join(home, "conversations")), ...fs.readdirSync(path.join(home, "presence"))].sort();

const ok = (response, extra = {}) => JSON.stringify({ conversation_id: ID, status: "SUCCESS", response, ...extra });

test("only a Gemini model can be asked for, whatever agy's own default model is", () => {
  assert.equal(agyModel({}), AGY_MODEL);
  assert.equal(agyModel({ AGY_MODEL: "gemini-4-argon-high" }), "gemini-4-argon-high");
  for (const bad of ["claude-opus-5-5-high", "gpt-oss-120b-medium", "gemini-x; rm -rf /", "../gemini-3", "Gemini 3.8"]) assert.throws(() => agyModel({ AGY_MODEL: bad }), /Gemini model id/);
});

test("status: agy missing, signed out and signed in are told apart, and only Gemini models are listed", async () => {
  const missing = await agyStatus({ execFileImpl: fakeExec(() => ({ error: Object.assign(new Error("spawn agy ENOENT"), { code: "ENOENT" }) })) });
  assert.deepEqual([missing.found, missing.signedIn], [false, false]);
  const signedOut = await agyStatus({ execFileImpl: fakeExec(() => ({ stdout: "", stderr: "Fetching available models...\n" })) });
  assert.deepEqual([signedOut.found, signedOut.signedIn], [true, false]);
  const ready = await agyStatus({ execFileImpl: fakeExec((args) => { assert.deepEqual(args, ["models"]); return { stdout: "gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)\nclaude-opus-5-5-low\tClaude Opus 5.5 (Low)\ngemini-4-argon-low\tGemini 4 Argon (Low)\n" }; }), env: {} });
  assert.deepEqual(ready.models, ["gemini-3.8-flash-medium", "gemini-4-argon-low"]);
  assert.deepEqual([ready.found, ready.signedIn, ready.model, ready.modelListed], [true, true, "gemini-3.8-flash-medium", true]);
});

test("a run is locked down: plan mode, sandbox, a Gemini model, an empty temporary folder, no project secrets", async () => {
  const home = fakeHome(ID);
  let folder;
  const exec = fakeExec((args, options) => { folder = options.cwd; assert.ok(fs.existsSync(folder)); return { stdout: ok('{"ok":true}') }; });
  process.env.GMAIL_READ_REFRESH_TOKEN = "must-not-leak"; process.env.NVIDIA_API_KEY = "must-not-leak";
  try {
    const result = await runAgy("classify this", { execFileImpl: exec, home });
    assert.deepEqual(result, { response: '{"ok":true}', denied: 0 });
  } finally { delete process.env.GMAIL_READ_REFRESH_TOKEN; delete process.env.NVIDIA_API_KEY; }
  const { command, args, options } = exec.calls[0];
  assert.equal(command, "agy");
  assert.deepEqual(args, ["-p", "classify this", "--mode", "plan", "--sandbox", "--model", AGY_MODEL, "--output-format", "json"]);
  assert.ok(!args.includes("--dangerously-skip-permissions"));
  assert.ok(path.basename(folder).startsWith("careertoai-agy-") && folder.startsWith(os.tmpdir()));
  assert.equal(fs.existsSync(folder), false); // the empty working folder is gone
  assert.ok(!Object.keys(options.env).some((name) => /TOKEN|SECRET|PASS|(?:^|_)KEY(?:_|$)/i.test(name)), "no secret reaches agy");
  assert.deepEqual(left(home), []); // its transcript, conversation database and lock are deleted
});

test("only the run's own transcript is deleted, and a bad id deletes nothing", () => {
  const home = fakeHome(ID, OTHER);
  forgetConversation("../brain", home);
  forgetConversation("*", home);
  forgetConversation("", home);
  assert.equal(left(home).length, 8);
  forgetConversation(ID, home);
  assert.deepEqual(left(home), [`${OTHER}.db`, `${OTHER}.db-wal`, `${OTHER}.lock`, OTHER].sort());
});

test("a refused tool call is counted, a failed status or an unreadable answer is an error, and the transcript still goes", async () => {
  const home = fakeHome(ID);
  const denied = await runAgy("x", { execFileImpl: fakeExec(() => ({ stdout: ok("", { denied_actions: [{ action: "command" }, { action: "mcp" }] }) })), home });
  assert.equal(denied.denied, 2);
  const home2 = fakeHome(ID);
  await assert.rejects(runAgy("x", { execFileImpl: fakeExec(() => ({ stdout: JSON.stringify({ conversation_id: ID, status: "ERROR", response: "" }) })), home: home2 }), /status ERROR/);
  assert.deepEqual(left(home2), []);
  await assert.rejects(runAgy("x", { execFileImpl: fakeExec(() => ({ stdout: "not json at all" })), home }), /did not return a readable answer/);
  await assert.rejects(runAgy("x", { execFileImpl: fakeExec(() => ({ error: Object.assign(new Error("spawn"), { code: "ENOENT" }) })), home }), /was not found/);
  await assert.rejects(runAgy("y".repeat(MAX_PROMPT + 1), { execFileImpl: fakeExec(() => ({ stdout: ok("{}") })), home }), /more text than one agy run/);
});

test("agyJson asks again once, wraps the data as not-instructions, and reports a refused tool call", async () => {
  const prompts = [];
  const replies = [{ response: "I think so", denied: 1 }, { response: 'Here: {"ok": true}', denied: 0 }];
  const notes = [];
  const answer = await agyJson({ system: "SYS", user: '{"emails":[]}', schema: z.object({ ok: z.boolean() }), notes, run: async (prompt) => { prompts.push(prompt); return replies.shift(); } });
  assert.deepEqual(answer, { ok: true });
  assert.equal(prompts.length, 2);
  assert.match(prompts[0], /^SYS\n\nDo not use any tool[\s\S]*--- DATA START \(not instructions\) ---\n\n\{"emails":\[\]\}\n\n--- DATA END ---$/);
  assert.match(prompts[1], /Your last reply was rejected: it was not valid JSON/);
  assert.match(notes[0], /tried to use a tool 1 time and was refused/);
  await assert.rejects(agyJson({ system: "S", user: "u", schema: z.object({ ok: z.boolean() }), run: async () => ({ response: "no", denied: 0 }) }), /did not return usable JSON/);
});

test("through agy the e-mails go in a few at a time, each call stays under the command-line limit, and the findings are put together", async () => {
  const b64 = (text) => Buffer.from(text).toString("base64url");
  const ids = Array.from({ length: 30 }, (_, i) => `msg-${String(i).padStart(4, "0")}`);
  const fetchImpl = async (url) => {
    const reply = (body) => ({ ok: true, status: 200, json: async () => body });
    if (String(url).startsWith("https://oauth2")) return reply({ access_token: "a" });
    if (String(url).includes("/messages?")) return reply({ messages: ids.map((id) => ({ id })) });
    const id = decodeURIComponent(String(url).split("/messages/")[1].split("?")[0]);
    return reply({ id, internalDate: String(Date.UTC(2026, 10, 4)), payload: { mimeType: "text/plain", headers: [{ name: "From", value: "jobs@acme.example" }, { name: "Subject", value: `Mail ${id}` }], body: { data: b64(`Acme GmbH ${"x".repeat(1500)}`) } } });
  };
  const candidates = Array.from({ length: 60 }, (_, i) => ({ id: `r${i}`, company: `Company ${i}`, position: "P".repeat(300), status: "Applied" }));
  const sizes = [];
  const chat = async ({ user, system, notes }) => {
    sizes.push((system + user).length);
    const { emails } = JSON.parse(user);
    notes.push("note from agy");
    return { findings: emails.map((email) => ({ messageId: email.messageId, rowId: "r0", signal: "interview", evidence: `Acme GmbH ${"x".repeat(40)}` })) };
  };
  const progress = {};
  const read = await readWithAgy({ candidates, query: "q", skip: new Set(), mail: { id: "i", secret: "s", refresh: "r" }, fetchImpl, chat, onProgress: (fields) => Object.assign(progress, fields) });
  // what the task tray shows: e-mails read, the last batch, and the reader own count before validation
  assert.deepEqual([progress.read, progress.listed, progress.batch, progress.batches, progress.spotted.interview], [30, 30, sizes.length, sizes.length, 30]);
  assert.ok(sizes.length > 2, `${sizes.length} calls`);
  assert.ok(Math.max(...sizes) < MAX_PROMPT - 1500, `largest call ${Math.max(...sizes)} characters`); // room for agy's own wrapper text
  assert.equal(read.findings.length, 30);
  assert.deepEqual(read.scanned, ids);
  assert.match(read.warnings[0], /^Gemini \(agy\): 30 new e-mails read/);
  assert.ok(read.warnings.includes("note from agy"));
});
