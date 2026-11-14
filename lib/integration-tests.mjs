/**
 * "Does it work?" for every integration on the Settings page (src/_data/integrations.json lists them).
 *
 * Each test is the cheapest real request that proves the connection: a balance read where the service has one, one tiny
 * model call for an AI provider, a sign-in for mail, the tool list for an MCP server. Runs in the local editor server
 * only. The answer is { ok, message } and never holds a key, an address path or a header.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import nodemailer from "nodemailer";
import { z } from "zod";

import { agyJson, agyModel, agyStatus } from "./agy.mjs";
import { openMcpServers } from "./antigravity-mcp.mjs";
import { checkCredits } from "./credits.mjs";
import { ROOT } from "./content.mjs";
import { engineDir, enginePython } from "./engine-search.mjs";
import { readConfig as mailReadConfig } from "./gmail-read.mjs";
import { internshipsDir } from "./indeed-agent.mjs";
import { chatJson, providerConfig } from "./llm.mjs";
import { readServers } from "./mcp-config.mjs";
import { accessToken, gmailConfig, smtpConfig } from "./send-email.mjs";
import { atsDir } from "./student-files.mjs";

const ok = (message, more = {}) => ({ ok: true, message, ...more });
const fail = (message) => ({ ok: false, message });
const seconds = (started) => `${((Date.now() - started) / 1000).toFixed(1)} s`;
const PING = z.object({ ok: z.boolean() });

const AI = ["claude", "anthropic", "openrouter", "nvidia", "github", "gemini", "ollama"];

async function testAi(id, env) {
  // The provider in use keeps its own model and address. Any other is tried with its defaults, so a saved key can be checked before switching to it.
  const config = providerConfig(id, env);
  if (!config) return fail("Save its key first.");
  const started = Date.now();
  await chatJson({ system: 'Reply with {"ok": true}.', user: "ping", schema: PING, config });
  return ok(`${config.model} answered in ${seconds(started)}.`);
}

async function testAgy() {
  const agy = await agyStatus();
  if (!agy.found) return fail("agy (the Antigravity CLI) was not found. Install it and sign in once by running agy in a terminal.");
  if (!agy.signedIn) return fail("agy is not signed in. Run agy in a terminal and sign in with your Google account.");
  const started = Date.now();
  await agyJson({ system: "You are a connection test.", user: 'Reply with {"ok": true}.', schema: PING });
  return ok(`${agyModel()} answered through agy in ${seconds(started)}.`);
}

async function testBalance(id, env) {
  const [p] = await checkCredits(env, [id]);
  if (p.status !== "ok") return fail(p.message || "No answer.");
  if (p.remaining == null) return ok("The key was accepted.");
  const amount = p.unit === "USD" ? `$${p.remaining.toFixed(2)}` : `${p.remaining.toLocaleString("en-US")} ${p.unit}`;
  return ok(`Connected. ${amount} left${p.total ? ` of ${p.unit === "USD" ? `$${p.total}` : p.total.toLocaleString("en-US")}` : ""}.`);
}

async function request(url, init, name) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  if (response.status === 401 || response.status === 403) return fail(`${name} refused the key.`);
  if (!response.ok) return fail(`${name} answered ${response.status}.`);
  return response;
}

async function testExa(env) {
  if (!env.EXA_API_KEY) return fail("Save the Exa key first.");
  const response = await request("https://api.exa.ai/search", { method: "POST", headers: { "content-type": "application/json", "x-api-key": env.EXA_API_KEY }, body: JSON.stringify({ query: "Praktikum Informatik", numResults: 1 }) }, "Exa");
  return response.ok === false ? response : ok("Connected. One search was used.");
}

async function testAdzuna(env) {
  if (!env.ADZUNA_APP_ID || !env.ADZUNA_APP_KEY) return fail("Save the Adzuna app ID and app key first.");
  const query = new URLSearchParams({ app_id: env.ADZUNA_APP_ID, app_key: env.ADZUNA_APP_KEY, results_per_page: "1", what: "praktikum" });
  const response = await request(`https://api.adzuna.com/v1/api/jobs/de/search/1?${query}`, {}, "Adzuna");
  if (response.ok === false) return response;
  const body = await response.json().catch(() => ({}));
  return ok(`Connected. Adzuna lists ${Number(body.count || 0).toLocaleString("en-US")} internships in Germany. One search was used.`);
}

async function testGmail(config, what) {
  if (!config) return fail(what.missing);
  await accessToken(config, fetch, what);
  return ok(`Google accepted the ${what.noun} permission. Nothing was ${what.noun === "sending" ? "sent" : "read"}.`);
}

async function testSmtp(env) {
  const config = smtpConfig(env);
  if (!config) return fail("Save the SMTP server, user and password first.");
  const transport = nodemailer.createTransport({ ...config, connectionTimeout: 15_000, greetingTimeout: 15_000 });
  try { await transport.verify(); } finally { transport.close(); }
  return ok(`Signed in to ${config.host}. Nothing was sent.`);
}

// ---- the claude command and the connectors of the Claude account --------------------------------------------------

let connectorCache = null;
let connectorChecked = 0;

/** "claude.ai Indeed: https://… - ✔ Connected" lines of `claude mcp list`, as { Indeed: "connected" | "needs sign-in" | "failed" }. */
export function parseConnectors(text) {
  const found = {};
  for (const line of String(text).split(/\r?\n/)) {
    const match = /^claude\.ai (.+?): \S.* - (.+)$/.exec(line.trim());
    if (match) found[match[1]] = /\bConnected\b/.test(match[2]) ? "connected" : /authentication/i.test(match[2]) ? "needs sign-in" : "failed";
  }
  return found;
}

/** Which connectors the claude command has. Asking takes a few seconds, so the answer is kept for a minute. */
export async function claudeConnectors({ fresh = false, execFileImpl = execFile } = {}) {
  if (!fresh && connectorCache && Date.now() - connectorChecked < 60_000) return connectorCache;
  const cwd = fs.existsSync(internshipsDir()) ? internshipsDir() : ROOT;
  // As in lib/indeed-agent.mjs: connectors load only with the claude.ai sign-in, never while an Anthropic key is in the environment.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("ANTHROPIC_") && key !== "CLAUDECODE"));
  connectorChecked = Date.now();
  connectorCache = await new Promise((resolve) => {
    execFileImpl("claude", ["mcp", "list"], { cwd, env, timeout: 90_000, maxBuffer: 4 * 1024 * 1024, encoding: "utf8", windowsHide: true }, (error, stdout) => {
      if (error && !stdout) return resolve({ found: error.code !== "ENOENT", connectors: {}, message: error.code === "ENOENT" ? "Claude Code is not installed (no claude command)." : "The claude command did not answer." });
      resolve({ found: true, connectors: parseConnectors(stdout) });
    });
  });
  return connectorCache;
}

async function testClaude(connector) {
  const state = await claudeConnectors({ fresh: true });
  if (!state.found) return fail(state.message);
  const names = Object.keys(state.connectors);
  if (!connector) return state.message ? fail(state.message) : ok(names.length ? `Signed in. Connected: ${names.filter((name) => state.connectors[name] === "connected").join(", ") || "none"}.` : "The claude command answers, but no connector of a Claude account was listed. Run claude and sign in with your Claude account.");
  const status = state.connectors[connector];
  if (status === "connected") return ok(`${connector} is connected to your Claude account.`);
  return fail(status === "needs sign-in" ? `${connector} needs signing in again: open Claude, Settings, Connectors.` : status ? `${connector} failed to connect.` : `${connector} is not connected to your Claude account. Add it in Claude under Settings, Connectors.`);
}

// ---- MCP servers and local programs --------------------------------------------------------------------------------

async function testMcp(name) {
  const server = readServers()[name];
  if (!server) return fail("This connector is not added yet.");
  if (!server.enabled) return fail("This connector is switched off.");
  const pool = await openMcpServers([name]);
  try {
    const problem = (pool.errorDetails || []).find((detail) => detail.server === name);
    if (problem) return fail(`${problem.reason}.`);
    const tools = pool.tools(name).map((tool) => tool.name);
    return ok(`Connected. It offers ${tools.length} tool${tools.length === 1 ? "" : "s"}.`, { tools: tools.slice(0, 60) });
  } finally { await pool.close(); }
}

async function testChromium() {
  const { chromium } = await import("playwright");
  return fs.existsSync(chromium.executablePath()) ? ok("Chromium is installed.") : fail("Chromium is not installed. In a terminal in this folder run: npx playwright install chromium");
}

async function testAtsCheck() {
  const script = path.join(atsDir(path.join(internshipsDir(), "Input Data", "ATS")), "ats_check.py");
  if (!fs.existsSync(script)) return fail("ats_check.py was not found with the ATS manuals.");
  const version = await new Promise((resolve) => execFile("python", ["--version"], { timeout: 10_000, windowsHide: true }, (error, stdout, stderr) => resolve(error ? "" : String(stdout || stderr).trim())));
  return version ? ok(`${version} and ats_check.py were found.`) : fail("Python was not found. Install Python 3 and restart npm run editor.");
}

const TESTS = {
  agy: () => testAgy(),
  firecrawl: (env) => testBalance("firecrawl", env),
  tavily: (env) => testBalance("tavily", env),
  tinyfish: (env) => testBalance("tinyfish", env),
  apify: (env) => testBalance("apify", env),
  exa: testExa,
  adzuna: testAdzuna,
  engine: () => (enginePython(engineDir()) ? ok("The JobSearchEngine and its Python were found.") : fail("The JobSearchEngine folder or its Python was not found.")),
  "gmail-send": (env) => testGmail(gmailConfig(env), { noun: "sending", fix: "npm run gmail:auth", missing: "Save the Gmail client ID and secret, then run npm run gmail:auth." }),
  "gmail-read": (env) => testGmail(mailReadConfig(env), { noun: "reading", fix: "node scripts/gmail-auth.mjs --read", missing: "Save the Gmail client ID and secret, then run node scripts/gmail-auth.mjs --read." }),
  smtp: testSmtp,
  "claude-cli": () => testClaude(""),
  "connector-indeed": () => testClaude("Indeed"),
  "connector-apify": () => testClaude("Apify"),
  "connector-gmail": () => testClaude("Gmail"),
  chromium: testChromium,
  "ats-check": testAtsCheck,
};

export const canTest = (id) => AI.includes(id) || Object.hasOwn(TESTS, id) || id.startsWith("mcp:");

/** Run one test. A thrown error becomes its message: the helpers above word theirs for the page and never include a key. */
export async function testIntegration(id, { env = process.env } = {}) {
  try {
    if (AI.includes(id)) return await testAi(id, env);
    if (id.startsWith("mcp:")) return await testMcp(id.slice(4));
    if (Object.hasOwn(TESTS, id)) return await TESTS[id](env);
    return fail("There is no test for this integration.");
  } catch (error) {
    return fail(error.name === "TimeoutError" ? "No answer in time." : String(error.message || error).split("\n")[0].slice(0, 300));
  }
}
