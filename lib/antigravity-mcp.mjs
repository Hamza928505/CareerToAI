import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const DEFAULT_CONFIG = path.join(os.homedir(), ".gemini", "config", "mcp_config.json");
const CONNECT_TIMEOUT = 45_000;
const CALL_TIMEOUT = 60_000;

function readConfig() {
  const filename = process.env.ANTIGRAVITY_MCP_CONFIG || DEFAULT_CONFIG;
  if (!fs.existsSync(filename)) throw new Error("Antigravity MCP config was not found. Set ANTIGRAVITY_MCP_CONFIG to its path.");
  try { return JSON.parse(fs.readFileSync(filename, "utf8").replace(/^\uFEFF/, "")); }
  catch { throw new Error("Antigravity MCP config is not valid JSON."); }
}

function expand(value) {
  return String(value).replace(/\$\{(?:env:)?([A-Z0-9_]+)\}/gi, (match, name) => process.env[name] ?? match);
}

function environmentFor(server) {
  const env = getDefaultEnvironment();
  for (const [name, value] of Object.entries(server.env || {})) env[name] = expand(value);
  return env;
}

function makeTransport(server) {
  const endpoint = server.serverUrl || server.url;
  if (endpoint) {
    const url = new URL(expand(endpoint));
    const headers = server.headers
      ? Object.fromEntries(Object.entries(server.headers).map(([key, value]) => [key, expand(value)]))
      : undefined;
    const options = headers ? { requestInit: { headers } } : undefined;
    return (server.transport || server.type) === "sse" || /\/sse\/?$/.test(url.pathname)
      ? new SSEClientTransport(url, options)
      : new StreamableHTTPClientTransport(url, options);
  }
  if (!server.command) throw new Error("Unsupported Antigravity MCP transport.");
  return new StdioClientTransport({
    command: expand(server.command),
    args: (server.args || []).map(expand),
    cwd: server.cwd ? expand(server.cwd) : undefined,
    env: environmentFor(server),
    stderr: "ignore",
  });
}

export async function openMcpServers(names) {
  const config = readConfig();
  const definitions = config.mcpServers || {};
  const clients = new Map();
  const errors = [];
  const errorDetails = [];

  await Promise.all(names.map(async (name) => {
    const definition = definitions[name] || Object.entries(definitions).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
    if (!definition || definition.disabled) {
      errors.push(name);
      errorDetails.push({ server: name, reason: "Not configured or disabled" });
      return;
    }
    const client = new Client({ name: "career-to-ai-workspace", version: "1.0.0" });
    let timer;
    try {
      await Promise.race([
        client.connect(makeTransport(definition), { timeout: CONNECT_TIMEOUT }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Connection timed out")), CONNECT_TIMEOUT); }),
      ]);
      clearTimeout(timer);
      const tools = [];
      let cursor;
      do {
        const listed = await client.listTools(cursor ? { cursor } : {}, { timeout: CONNECT_TIMEOUT });
        tools.push(...(listed.tools || []));
        cursor = listed.nextCursor;
      } while (cursor);
      clients.set(name, { client, tools });
    } catch (error) {
      errors.push(name);
      // Never surface raw transport errors: remote URLs and arguments may contain credentials.
      const detail = `${error.code || ""} ${error.cause?.code || ""} ${error.message || ""}`;
      const reason = /EACCES|EPERM/.test(detail) ? "Connection access denied"
        : /timeout|timed out/i.test(detail) ? "Connection timed out"
        : /401|403|unauthorized/i.test(detail) ? "Authentication failed"
        : "Could not connect to MCP server";
      errorDetails.push({ server: name, reason });
      await client.close().catch(() => {});
    } finally { clearTimeout(timer); }
  }));

  return {
    errors,
    errorDetails,
    tools(name) { return clients.get(name)?.tools || []; },
    async call(name, toolName, args, { timeout = CALL_TIMEOUT } = {}) {
      const server = clients.get(name);
      if (!server) throw new Error(`MCP server '${name}' is unavailable.`);
      return server.client.callTool({ name: toolName, arguments: args }, undefined, { timeout, maxTotalTimeout: timeout });
    },
    async close() {
      await Promise.all([...clients.values()].map(({ client }) => client.close().catch(() => {})));
    },
  };
}
