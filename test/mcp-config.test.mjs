import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parseConnectors } from "../lib/integration-tests.mjs";
import { addServer, clientDefinitions, describeServers, removeServer, setEnabled } from "../lib/mcp-config.mjs";

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-config-"));
  const external = path.join(dir, "antigravity.json");
  fs.writeFileSync(external, JSON.stringify({ mcpServers: { secret: { serverUrl: "https://mcp.example.com/KEY-abc123/mcp?token=hunter2", headers: { Authorization: "Bearer hunter2" } } } }));
  return { file: path.join(dir, "mcp-servers.json"), env: { ANTIGRAVITY_MCP_CONFIG: external, FIRECRAWL_API_KEY: "fc-x" }, external };
}

test("the browser sees a host and the names of the keys a server reads, never an address, a header or a value", () => {
  const box = sandbox();
  addServer({ preset: "firecrawl" }, box);
  addServer({ name: "mine", url: "https://mcp.mine.example/v1/${MINE_API_KEY}/mcp", headerName: "Authorization", headerEnv: "MINE_API_KEY" }, box);
  const seen = JSON.stringify(describeServers(box));
  assert.doesNotMatch(seen, /hunter2|KEY-abc123|fc-x|Bearer|\/v1\//);
  const byName = Object.fromEntries(describeServers(box).map((server) => [server.name, server]));
  assert.equal(byName.secret.where, "mcp.example.com");
  assert.deepEqual(byName.firecrawl.needs, [{ name: "FIRECRAWL_API_KEY", set: true }]);
  assert.deepEqual(byName.mine.needs, [{ name: "MINE_API_KEY", set: false }]);
});

test("a command can never come from the browser: only a preset or an https address is accepted", () => {
  const box = sandbox();
  assert.throws(() => addServer({ preset: "unknown" }, box), /not one of the supported/);
  assert.throws(() => addServer({ name: "x", url: "http://mcp.example.com/mcp" }, box), /https/);
  assert.throws(() => addServer({ name: "../x", url: "https://a.example/mcp" }, box), /Name the connector/);
  addServer({ name: "local", url: "http://localhost:3000/mcp" }, box); // a server on this computer may use http
  assert.equal(clientDefinitions(box).local.serverUrl, "http://localhost:3000/mcp");
});

test("the Antigravity file is only read: switching its server off is recorded in the app's own file", () => {
  const box = sandbox();
  const before = fs.readFileSync(box.external, "utf8");
  setEnabled("secret", false, box);
  assert.equal(clientDefinitions(box).secret.disabled, true);
  assert.throws(() => removeServer("secret", box), /Only connectors added here/);
  setEnabled("secret", true, box);
  assert.equal(clientDefinitions(box).secret.disabled, false);
  assert.equal(fs.readFileSync(box.external, "utf8"), before);
  addServer({ preset: "exa" }, box);
  removeServer("exa", box);
  assert.equal(clientDefinitions(box).exa, undefined);
});

test("connector states are read from the claude command's own list", () => {
  assert.deepEqual(parseConnectors([
    "Checking MCP server health…", "",
    "claude.ai Indeed: https://mcp.indeed.com/claude/mcp - ✔ Connected",
    "claude.ai Canva: https://mcp.canva.com/mcp - ! Needs authentication",
    "claude.ai Broken: https://x.example/mcp - ✘ Failed to connect",
    "playwright: npx @playwright/mcp@latest - ✔ Connected",
  ].join("\n")), { Indeed: "connected", Canva: "needs sign-in", Broken: "failed" });
});
