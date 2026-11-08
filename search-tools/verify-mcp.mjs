// Connects to each search MCP server, lists the tools it advertises, and (with --call) makes one harmless call each.
// Run: node search-tools/verify-mcp.mjs [--call]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import os from "node:os";

const SERVERS = {
  "parallel-search": () => new StreamableHTTPClientTransport(new URL("https://search.parallel.ai/mcp")),
  exa: () => new StreamableHTTPClientTransport(new URL("https://mcp.exa.ai/mcp")),
  // Playwright writes snapshot files to its working folder, so it runs in the temp folder, not the repo.
  playwright: () => new StdioClientTransport({ command: process.platform === "win32" ? "cmd" : "npx", args: [...(process.platform === "win32" ? ["/c", "npx"] : []), "-y", "@playwright/mcp@latest", "--headless", "--isolated"], cwd: os.tmpdir(), stderr: "ignore" }),
};
// One harmless call per server: documentation searches and a public demo page. Nothing job-related is collected.
const CALLS = {
  "parallel-search": [["web_search", { objective: "Parallel Search MCP documentation", search_queries: ["Parallel Search MCP docs"] }]],
  exa: [["web_search_exa", { query: "Exa MCP server documentation", objective: "Find the Exa MCP server documentation page", numResults: 2 }]],
  playwright: [["browser_navigate", { url: "https://demo.playwright.dev/todomvc/" }], ["browser_close", {}]],
};

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const call = process.argv.includes("--call");
const schemas = process.argv.includes("--schemas");
for (const [name, make] of Object.entries(SERVERS)) {
  if (only.length && !only.includes(name)) continue;
  const client = new Client({ name: "careertoai-verify", version: "1.0.0" });
  const started = Date.now();
  try {
    await client.connect(make());
    const { tools } = await client.listTools();
    console.log(`\n${name}: connected in ${Date.now() - started} ms, ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}`);
    if (schemas) for (const t of tools) console.log(`  ${t.name}: ${JSON.stringify(t.inputSchema?.properties || {}).slice(0, 400)} required=${JSON.stringify(t.inputSchema?.required || [])}`);
    if (call) for (const [tool, args] of CALLS[name]) {
      const result = await client.callTool({ name: tool, arguments: args });
      const text = (result.content || []).map((c) => c.text || "").join(" ").replace(/\s+/g, " ");
      console.log(`  call ${tool}: ${result.isError ? "ERROR" : "ok"} — ${text.slice(0, 300)}`);
    }
  } catch (error) {
    console.log(`\n${name}: FAILED — ${String(error.message || error).split("\n")[0]}`);
  } finally {
    await client.close().catch(() => {});
  }
}
