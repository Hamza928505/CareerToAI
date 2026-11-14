/**
 * The MCP servers this app can open.
 *
 * Two files are merged, the app's own first:
 *   - data/mcp-servers.json (git-ignored): what the Settings page adds, removes and switches on or off;
 *   - the Antigravity config (~/.gemini/config/mcp_config.json, or ANTIGRAVITY_MCP_CONFIG): only ever read. It belongs
 *     to another program, so switching one of its servers off is recorded in the app's file ("off"), never written there.
 *
 * The browser never supplies a command to run. It can add a preset from PRESETS (fixed here) or a remote server by its
 * https address; a server that needs its own command is added by editing data/mcp-servers.json by hand. A definition can
 * hold a key (in its address, a header or an env value), so describeServers() returns the host name and the names of the
 * ${VARIABLES} it reads, never the definition itself. Write keys as ${NAME} and keep the value in .env.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ROOT } from "./content.mjs";

export const APP_FILE = path.join(ROOT, "data", "mcp-servers.json");
const externalFile = (env = process.env) => env.ANTIGRAVITY_MCP_CONFIG || path.join(os.homedir(), ".gemini", "config", "mcp_config.json");

/** What "Add" writes for each supported connector. ${NAME} is filled from .env when the server is opened. */
export const PRESETS = {
  firecrawl: { command: "npx", args: ["-y", "firecrawl-mcp"], env: { FIRECRAWL_API_KEY: "${FIRECRAWL_API_KEY}" } },
  tinyfish: { command: "npx", args: ["-y", "tinyfish-mcp"], env: { TINYFISH_API_KEY: "${TINYFISH_API_KEY}" } },
  tavily: { command: "npx", args: ["-y", "@mcptools/mcp-tavily"], env: { TAVILY_API_KEY: "${TAVILY_API_KEY}" } },
  exa: { serverUrl: "https://mcp.exa.ai/mcp" },
  playwright: { command: "npx", args: ["-y", "@playwright/mcp@latest"] },
};

const NAME = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const bad = (message) => Object.assign(new Error(message), { statusCode: 400 });

function readFile(file) {
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")); }
  catch { throw new Error(`${path.basename(file)} is not valid JSON.`); }
}

function writeApp(config, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try { fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`); fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, { force: true }); }
}

/** Every known server: { name: { definition, origin: "app" | "antigravity", enabled } }. A broken Antigravity file is skipped, not fatal. */
export function readServers({ file = APP_FILE, env = process.env } = {}) {
  const app = readFile(file);
  let external = {};
  try { external = readFile(externalFile(env)).mcpServers || {}; } catch { /* another program's file: leave it alone */ }
  const off = new Set(app.off || []);
  const servers = {};
  for (const [name, definition] of Object.entries(external)) servers[name] = { definition, origin: "antigravity", enabled: !definition.disabled && !off.has(name) };
  for (const [name, definition] of Object.entries(app.mcpServers || {})) servers[name] = { definition, origin: "app", enabled: !definition.disabled };
  return servers;
}

/** The shape lib/antigravity-mcp.mjs opens: definitions by name, `disabled` set on the ones switched off. */
export const clientDefinitions = (options) => Object.fromEntries(Object.entries(readServers(options)).map(([name, server]) => [name, { ...server.definition, disabled: !server.enabled }]));

const placeholders = (definition) => [...new Set([...JSON.stringify(definition).matchAll(/\$\{(?:env:)?([A-Z0-9_]+)\}/gi)].map((m) => m[1]))];

/** What the browser may see of each server: where it runs, which .env names it reads and whether they are set. Never an address path, a header or a value. */
export function describeServers({ file = APP_FILE, env = process.env } = {}) {
  return Object.entries(readServers({ file, env })).map(([name, { definition, origin, enabled }]) => {
    const address = definition.serverUrl || definition.url;
    let where = "";
    if (address) { try { where = new URL(String(address).replace(/\$\{[^}]+\}/g, "x")).host; } catch { where = "remote server"; } }
    else where = `${path.basename(String(definition.command || "command"))}${Object.entries(PRESETS).some(([, p]) => p.command === definition.command && String(p.args) === String(definition.args)) ? ` ${definition.args.at(-1)}` : ""}`;
    return { name, origin, enabled, kind: address ? "remote" : "local", where, needs: placeholders(definition).map((key) => ({ name: key, set: Boolean(env[key]) })) };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** Add a preset by name, or a remote server by address. An optional header carries a key as ${NAME}, kept in .env. */
export function addServer({ name, preset, url, headerName, headerEnv }, { file = APP_FILE } = {}) {
  const id = String(name || preset || "").trim().toLowerCase();
  if (!NAME.test(id)) throw bad("Name the connector with lower-case letters, digits, - or _ (for example: firecrawl).");
  let definition;
  if (preset) {
    if (!Object.hasOwn(PRESETS, preset)) throw bad("That connector is not one of the supported ones.");
    definition = structuredClone(PRESETS[preset]);
  } else {
    let parsed;
    try { parsed = new URL(String(url || "").replace(/\$\{[A-Z0-9_]+\}/g, "x")); } catch { throw bad("Enter the server's full address, starting with https://."); }
    const local = ["localhost", "127.0.0.1"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) throw bad("A remote connector must use https://.");
    definition = { serverUrl: String(url).trim() };
    if (headerName || headerEnv) {
      if (!/^[A-Za-z][A-Za-z0-9-]{0,60}$/.test(headerName || "") || !/^[A-Z][A-Z0-9_]{1,60}$/.test(headerEnv || "")) throw bad("A key header needs a header name (for example Authorization) and the name of a key saved under API keys (for example MY_SERVICE_API_KEY).");
      definition.headers = { [headerName]: headerName.toLowerCase() === "authorization" ? `Bearer \${${headerEnv}}` : `\${${headerEnv}}` };
    }
  }
  const app = readFile(file);
  app.mcpServers = { ...app.mcpServers, [id]: definition };
  app.off = (app.off || []).filter((item) => item !== id);
  writeApp(app, file);
  return id;
}

/** Remove a server this app added. One from the Antigravity config can only be switched off. */
export function removeServer(name, { file = APP_FILE } = {}) {
  const app = readFile(file);
  if (!app.mcpServers || !Object.hasOwn(app.mcpServers, name)) throw bad("Only connectors added here can be removed. Switch the others off instead.");
  delete app.mcpServers[name];
  writeApp(app, file);
}

export function setEnabled(name, on, options = {}) {
  const file = options.file || APP_FILE;
  const server = readServers(options)[name];
  if (!server) throw bad("That connector is not configured.");
  const app = readFile(file);
  if (server.origin === "app") { if (on) delete app.mcpServers[name].disabled; else app.mcpServers[name].disabled = true; }
  else app.off = on ? (app.off || []).filter((item) => item !== name) : [...new Set([...(app.off || []), name])];
  writeApp(app, file);
}
