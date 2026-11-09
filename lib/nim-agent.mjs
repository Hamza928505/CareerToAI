/**
 * An NVIDIA NIM model searches for internships by calling search APIs itself, so Claude spends no tokens on it.
 *
 * Its tools are Tavily, Exa, Firecrawl (keys from .env), the free Arbeitnow API, and the search tools listed in MCP_TOOLS, which
 * it reaches through the MCP client of lib/antigravity-mcp.mjs. Indeed and Apify are NOT here: they are connectors of the
 * student's Claude account (only `claude -p` can load them) and stay with Claude (lib/indeed-agent.mjs, lib/apify-agent.mjs).
 *
 * What comes back is search-engine snippets, never an opened page, so every posting is `verified: false`. The model only
 * picks postings; the web address and the posting date are taken from the tool results by code, never from the model's
 * words, and a posting whose snippet states no date has none (the search drops undated postings, `newEligible`).
 */
import { setTimeout as sleep } from "node:timers/promises";

import { openMcpServers } from "./antigravity-mcp.mjs";
import { berlinDay, gjuVerdict } from "./application-flow.mjs";
import { isIndividualPosting, responseFailed, responseRecords } from "./job-search.mjs";

const BASE = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";
const MAX_ROUNDS = 14;

/** The boards NIM covers. Indeed is missing on purpose: it is searched by Claude only. */
export const NIM_SITES = {
  "linkedin.com": "LinkedIn", "monster.de": "Monster", "jobmensa.de": "jobmensa", "stellenanzeigen.de": "stellenanzeigen.de", "academics.de": "academics",
  "kimeta.de": "Kimeta", "jobworld.de": "JOBworld", "meinestadt.de": "meinestadt", "meinpraktikum.de": "MeinPraktikum", "praktikumsstellen.de": "praktikumsstellen",
  "praktika.de": "praktika.de", "praktikum.info": "praktikum.info", "praktikum.de": "praktikum.de", "connecticum.de": "connecticum", "jobware.de": "Jobware",
  "unicum.de": "Unicum", "bonding.de": "bonding", "absolventa.de": "Absolventa", "joboter.de": "joboter", "neuvoo.de": "Neuvoo", "kultweet.de": "KULTweet",
  "stepstone.de": "StepStone", "arbeitsagentur.de": "Arbeitsagentur", "arbeitnow.com": "Arbeitnow",
};

/**
 * The MCP tools the model may call, by server (the servers of ~/.gemini/config/mcp_config.json). An allowlist, never "every
 * tool": those servers also expose page scrapers, agents, monitors and paid people look-ups, and this search only reads
 * search-engine snippets, it never opens a page. A server is opened only when its <SERVER>_API_KEY is set. Exa, Tavily and
 * Firecrawl are absent on purpose: TOOLS already calls them through their APIs with the same keys, so their MCP twins would
 * only spend the same credits twice. Add a line here to give the model another MCP search tool; nothing else changes.
 */
export const MCP_TOOLS = { tinyfish: ["search"] };

export const clip = (value, n = 280) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const pad = (n) => String(n).padStart(2, "0");

/** The NIM_SITES domain a web address belongs to ("www.stepstone.de" -> "stepstone.de"), or "" when it is none of them. */
export function siteKey(url) {
  try { const host = new URL(url).hostname.replace(/^www\./, ""); return Object.keys(NIM_SITES).find((domain) => host === domain || host.endsWith(`.${domain}`)) || ""; } catch { return ""; }
}

/** The site's own name for a posting's address ("www.stepstone.de" -> "StepStone"), else the bare host. */
export function siteName(url) {
  const known = siteKey(url);
  if (known) return NIM_SITES[known];
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/** A posting date stated in a snippet: "Veröffentlicht am 21.05.2026", "Published: 2026-11-04", "vor 3 Tagen". "" when none. */
export function extractDate(text, now = Date.now()) {
  const s = String(text || "");
  const label = String.raw`(?:Ver(?:ö|oe)ffentlicht(?: am)?|Aktualit(?:ä|ae)t|Aktualisiert(?: am)?|Online seit|Published(?: on)?|Posted(?: on)?|Erschienen am|Datum)`;
  let m = s.match(new RegExp(`${label}\\D{0,6}(\\d{2})\\.(\\d{2})\\.(20\\d{2})`, "i"));
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(new RegExp(`${label}\\D{0,6}(20\\d{2})-(\\d{2})-(\\d{2})`, "i"));
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/\bvor (\d+) (Stunden?|Tagen?|Wochen?)\b/i);
  if (m) {
    const days = /^Stunde/i.test(m[2]) ? 0 : /^Tag/i.test(m[2]) ? Number(m[1]) : Number(m[1]) * 7;
    return new Date(now - days * 86400000).toISOString().slice(0, 10);
  }
  return "";
}

/** LinkedIn feed posts, profiles and company pages are not job ads and are often gone ("Post not found"): of linkedin.com only /jobs/ pages count. */
export const isJobLink = (url) => {
  try { const u = new URL(url); return !/(^|\.)linkedin\.com$/.test(u.hostname) || /^\/(comm\/)?jobs\//.test(u.pathname); } catch { return false; }
};
/** A model's "Not specified in snippet" is not a company name. */
const companyName = (c) => (/^\s*(not specified|unknown|unbekannt|n\/a|none)\b/i.test(c || "") ? "" : clip(c, 120));

const dateOf = (x) => String(x || "").slice(0, 10).replace(/^(?!\d{4}-\d{2}-\d{2}).*/, "");
const domains = (a) => (Array.isArray(a.include_domains) && a.include_domains.length ? a.include_domains.slice(0, 20) : undefined);

// Each tool returns short rows [{title,url,snippet,date}] so the model's context stays small.
export const TOOLS = {
  tavily_search: {
    description: "Web search (Tavily). Use German queries. include_domains limits results to those sites.",
    parameters: { query: "string", include_domains: "string[] (optional)", max_results: "number (optional, max 20)" },
    run: async (a, { env, post, now, days }) => {
      const r = await post("https://api.tavily.com/search", { Authorization: `Bearer ${env.TAVILY_API_KEY}` },
        { query: a.query, include_domains: domains(a), max_results: Math.min(a.max_results || 15, 20), country: "germany", search_depth: "basic", include_published_date: true, time_range: days <= 7 ? "week" : "month" });
      return (r.results || []).map((x) => ({ title: clip(x.title, 120), url: x.url, snippet: clip(x.content, 400), date: dateOf(x.published_date) || extractDate(`${x.title} ${x.content}`, now) }));
    },
  },
  exa_search: {
    description: "Semantic web search (Exa). Describe the page you want, in German.",
    parameters: { query: "string", include_domains: "string[] (optional)", num_results: "number (optional, max 15)" },
    run: async (a, { env, post, now, days }) => {
      const r = await post("https://api.exa.ai/search", { "x-api-key": env.EXA_API_KEY },
        { query: a.query, numResults: Math.min(a.num_results || 10, 15), includeDomains: domains(a), startPublishedDate: new Date(now - days * 86400000).toISOString(), contents: { text: { maxCharacters: 600 } } });
      return (r.results || []).map((x) => ({ title: clip(x.title, 120), url: x.url, snippet: clip(x.text, 400), date: dateOf(x.publishedDate) || extractDate(`${x.title} ${x.text}`, now) }));
    },
  },
  firecrawl_search: {
    description: "Web search (Firecrawl). Use German queries.",
    parameters: { query: "string", limit: "number (optional, max 15)" },
    run: async (a, { env, post, now, days }) => {
      const r = await post("https://api.firecrawl.dev/v2/search", { Authorization: `Bearer ${env.FIRECRAWL_API_KEY}` }, { query: a.query, limit: Math.min(a.limit || 10, 15), tbs: days <= 7 ? "qdr:w" : "qdr:m" });
      return (r.data?.web || r.data || []).map((x) => ({ title: clip(x.title, 120), url: x.url, snippet: clip(x.description, 400), date: extractDate(`${x.title} ${x.description}`, now) }));
    },
  },
  arbeitnow_jobs: {
    description: "Free Arbeitnow job API: one page of jobs, already reduced to internships and Werkstudent roles. Pages 1 to 3.",
    parameters: { page: "number 1-3" },
    run: async (a, { fetchImpl }) => {
      const res = await fetchImpl(`https://www.arbeitnow.com/api/job-board-api?page=${Math.min(Math.max(a.page || 1, 1), 3)}`, { headers: { "User-Agent": "CareerToAI-internship-search/1.0 (personal job search; read-only)" }, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`arbeitnow answered ${res.status}`);
      const student = /praktik|\bintern\b|internship|werkstud|working student/i;
      return (await res.json()).data.filter((j) => student.test(j.title) || (j.job_types || []).some((t) => student.test(t)))
        .map((j) => ({ title: clip(j.title, 120), url: j.url, snippet: clip(`${j.company_name} | ${j.location} | ${(j.job_types || []).join(", ")}`), date: new Date(j.created_at * 1000).toISOString().slice(0, 10) }));
    },
  },
};

const toolSpec = () => Object.entries(TOOLS).map(([name, t]) => ({ type: "function", function: { name, description: t.description, parameters: { type: "object", properties: Object.fromEntries(Object.entries(t.parameters).map(([k, v]) => [k, { type: v.startsWith("string[]") ? "array" : v.startsWith("number") ? "number" : "string", ...(v.startsWith("string[]") ? { items: { type: "string" } } : {}), description: v }])), required: Object.keys(t.parameters).filter((k) => !t.parameters[k].includes("optional")) } } }));

/** What the NIM model is asked to find. The default is the original IT search; the workspace passes the plan of lib/search-focus.mjs. */
export const DEFAULT_FOCUS = {
  nimBrief: "IT internships (Praktikum, Pflichtpraktikum, Praxissemester, internship) in Germany for a computer science student",
  nimQueries: ["Praktikum Informatik", "Pflichtpraktikum IT", "Praktikum Softwareentwicklung", "Praktikum Data Science", "Praktikum Cyber Security", "Praktikum Cloud DevOps", "Praktikum KI", "IT internship"],
};

const system = (days, { nimBrief, nimQueries }, mcpNames = []) => `You search for ${nimBrief}. Use ONLY the tools; never invent a posting.
Start from these queries (German first, then English) and add your own variations: ${nimQueries.join("; ")}. Prefer postings from the last ${days} days.
Cover these sites with include_domains (in groups of up to 10): ${Object.keys(NIM_SITES).filter((d) => d !== "arbeitnow.com").join(", ")}. Do not search indeed.com: another tool does that.
Use tavily_search, exa_search AND firecrawl_search (each at least 3 times with different queries and domain groups) and arbeitnow_jobs once.${mcpNames.length ? ` Also use ${mcpNames.join(", ")} (each at least 3 times with different queries; it has no include_domains, so write site:domain in the query).` : ""} Skip Ausbildung, Duales Studium, Trainee and school placements. A listing page's snippet may name several postings: list each one with that page's url. Make at most ${MAX_ROUNDS - 2} tool rounds.
When done, reply with ONLY JSON: {"postings":[{"title":"","company":"","location":"","url":"","evidence":"words from the tool result"}]}. Use a url exactly as a tool returned it.`;

async function chat(messages, { env, fetchImpl }, tools) {
  const res = await fetchImpl(`${BASE}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.NVIDIA_API_KEY}` },
    body: JSON.stringify({ model: env.NIM_MODEL || DEFAULT_MODEL, temperature: 0.1, messages, ...(tools ? { tools, tool_choice: "auto" } : {}) }), signal: AbortSignal.timeout(180_000) });
  if (res.status === 401 || res.status === 403) throw new Error("NVIDIA refused the key. Check NVIDIA_API_KEY in .env.");
  if (!res.ok) throw new Error(`NVIDIA NIM answered ${res.status}: ${clip(await res.text(), 160)}`);
  return res.json();
}

const SWEEP_PARALLEL = 3; // Firecrawl answers 429 above this
const SWEEP_CALLS = 10; // search calls one site may use: 2 queries on each of the 4 engines, plus Arbeitnow's pages
const SWEEP_MS = 150_000; // the sweep stops starting new calls after this
const ruledOut = (job) => /^(Fails|Not an internship)/.test(gjuVerdict(job));

/**
 * One posting, not a category page, a search page or an advice article, judged from the title and address alone (no page is opened,
 * so this is a heuristic that keeps the obvious ones out). A posting's address carries its id (5 digits or more, 4 when it is not a
 * year, or a uuid) or its title the German gender marker ("(m/w/d)", "Praktikant*in"); a listing's title counts results or names
 * the whole board ("1.868 freie Stellen", "Stellenangebote Praktika", "Praktikumsplätze", "Ratgeber").
 */
export function looksLikePosting({ title, url }) {
  if (/\b\d[\d.,]*\s+(?:freie\s+|offene\s+)?(?:stellen|jobs|angebote|praktika|praktikumsplätze)\b|\bstellenangebote\b|praktikumsplätze|praktikumsstellen|\bratgeber\b|\bjobs\b.*\bbei\b/i.test(title)) return false;
  const id = /\d{5,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}|[-/=](?!(?:19|20)\d\d(?:\D|$))\d{4}(?:\D|$)/i;
  const gender = /\(\s*[mwdfxi]\s*[/|]\s*[mwdfxi](?:\s*[/|]\s*[mwdfxi])?\s*\)|[*:]in\b|all genders/i;
  return id.test(url) || gender.test(title);
}

/**
 * The engines of the site sweep, in the order they are tried. `dated`: the engine reports posting dates (Exa's publishedDate,
 * Tavily's published_date, Arbeitnow's feed), so its hit can carry one. Firecrawl and TinyFish rarely do, and TinyFish has no
 * recency filter at all, so it comes last. `calls` lists the searches for one site: Exa and Tavily take include_domains,
 * Firecrawl and TinyFish get `site:` in the query.
 */
const SWEEP_ENGINES = [
  { tool: "arbeitnow_jobs", dated: true, only: "arbeitnow.com", calls: () => [1, 2, 3].map((page) => ({ page })) },
  { tool: "exa_search", dated: true, key: "EXA_API_KEY", calls: (d, qs) => qs.map((query) => ({ query, include_domains: [d], num_results: 10 })) },
  { tool: "tavily_search", dated: true, key: "TAVILY_API_KEY", calls: (d, qs) => qs.map((query) => ({ query, include_domains: [d], max_results: 10 })) },
  { tool: "firecrawl_search", dated: false, key: "FIRECRAWL_API_KEY", calls: (d, qs) => qs.map((query) => ({ query: `site:${d} ${query}`, limit: 10 })) },
  { tool: "tinyfish_search", dated: false, calls: (d, qs) => qs.map((query) => ({ query: `site:${d} ${query}` })) },
];

/**
 * The model picks what it likes, so some of the 24 sites come back empty. The sweep searches each such site on its own and keeps
 * ONE posting from it: a dated one inside the window when any engine finds it, else a lead with no date (`site_lead: true`, a blank
 * `date_posted`, tagged "no posting date" in `data_source`; never dated by the day it was found, because an old advert would
 * look new). The rules are the rest of this file's: the address and the date come from a tool result, only an individual
 * posting page of that very site whose title says internship counts, and no page is opened.
 */
async function sweepSites({ jobs, seen, callTool, engines, plan, now, days, errors, isKnown }) {
  const oldest = berlinDay(now - days * 86400000), deadline = Date.now() + SWEEP_MS;
  // The major's first query, for a post in the student's field; then the broad word, which is what a small site answers (the long
  // field queries often find nothing on one site). Two per engine, so the slow engines at the end of the list still get their turn.
  const queries = [plan.nimQueries[0], "Praktikum"];
  // `isKnown`: an address the workbook already has would be dropped by newEligible, so it cannot be a site's post.
  const usable = (r, domain) => r.title && !/^https?:\/\//i.test(r.title) && !isKnown(r.url) && isJobLink(r.url) && isIndividualPosting(r.url, domain) && looksLikePosting(r) && !ruledOut({ title: r.title, snippet: r.snippet, url: r.url });
  const queue = Object.keys(NIM_SITES).filter((d) => !jobs.some((j) => siteKey(j.url) === d && j.date_posted >= oldest && !ruledOut(j) && !isKnown(j.url)));
  const found = [];

  const sweepOne = async (domain) => {
    let hit = null, lead = null, used = 0;
    // A dated, in-window row wins at once; the first undated one is kept as the lead.
    const judge = (rows, tool) => {
      for (const r of rows) {
        if (!usable(r, domain)) continue;
        const row = { url: r.url, title: clip(r.title, 200), company: "", location: "", date_posted: r.date || "", snippet: clip(r.snippet, 500), source: siteName(r.url), verified: false };
        const label = (dated) => `NVIDIA NIM (site sweep: ${r.tool || tool}, unverified${dated ? "" : ", no posting date"})`;
        if (r.date >= oldest) return { ...row, data_source: label(true) };
        if (!r.date && !lead) lead = { ...row, data_source: label(false), site_lead: true };
      }
      return null;
    };
    hit = judge([...seen.values()].filter((r) => siteKey(r.url) === domain), "search");
    for (const [i, e] of engines.entries()) {
      if (hit) break;
      if (e.only && e.only !== domain) continue;
      for (const args of e.calls(domain, queries)) {
        if (hit || used >= SWEEP_CALLS || Date.now() > deadline) break;
        used++;
        for (let attempt = 0; ; attempt++) { // a rate limit (Firecrawl answers 429 under load) is waited out once
          try { hit = judge(await callTool(e.tool, args), e.tool); break; }
          catch (er) {
            if (attempt === 0 && /\b429\b/.test(er.message)) { await sleep(2000); continue; }
            errors.push(`${e.tool}: ${clip(er.message, 160)}`); break;
          }
        }
      }
      // An engine that can date has been tried, and there is a lead: the slower, undated engines would only find another lead.
      if (lead && !engines[i + 1]?.dated) break;
    }
    return hit || lead;
  };

  await Promise.all(Array.from({ length: Math.min(SWEEP_PARALLEL, queue.length) }, async () => {
    for (let domain; (domain = queue.shift()); ) { const row = await sweepOne(domain); if (row) found.push(row); }
  }));

  const order = Object.keys(NIM_SITES);
  found.sort((a, b) => order.indexOf(siteKey(a.url)) - order.indexOf(siteKey(b.url)));
  const known = new Map(jobs.map((j) => [j.url, j]));
  for (const row of found) { const old = known.get(row.url); if (old) Object.assign(row, { company: old.company, location: old.location }); }
  const taken = new Set(found.map((r) => r.url));
  return { found, jobs: [...jobs.filter((j) => !taken.has(j.url)), ...found], oldest };
}

/**
 * Sweep rows come from a title and a snippet only, so the employer and the city are blank. One more call to the model, with no
 * tools, reads them off that text; a value counts only when it appears in that row's own title or snippet, so it cannot invent one.
 */
async function fillCompanies(rows, ctx) {
  const todo = rows.filter((r) => !r.company);
  if (!todo.length) return 0;
  const body = await chat([
    { role: "system", content: 'For each internship below, read ONLY its title and snippet and give the employer and the city if that text states them, else "". Never guess. Reply with ONLY JSON: {"rows":[{"url":"","company":"","location":""}]}, each url copied exactly.' },
    { role: "user", content: JSON.stringify(todo.map(({ url, title, snippet }) => ({ url, title, snippet: clip(snippet, 300) }))) },
  ], ctx);
  let list = [];
  try { const text = body.choices[0].message.content || ""; list = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)).rows || []; } catch { /* nothing is filled in */ }
  const byUrl = new Map(todo.map((r) => [r.url, r]));
  const stated = (value, row) => value && `${row.title} ${row.snippet}`.toLowerCase().includes(value.toLowerCase());
  for (const x of list) {
    const row = byUrl.get(x?.url);
    if (!row) continue;
    const company = companyName(x.company), location = clip(x.location, 120);
    if (stated(company, row)) row.company = company;
    if (stated(location, row)) row.location = location;
  }
  return (body.usage?.prompt_tokens || 0) + (body.usage?.completion_tokens || 0);
}

/**
 * Resolves to { jobs, warnings, stats }, the shape the workspace search merges. Fails when the key is missing or NVIDIA
 * refuses; one failing search tool only shows up in `stats.errors`. `sweep: false` skips the per-site sweep (tests, quick runs);
 * `isKnown(url)` says whether the workbook already has an address, so the sweep picks a new post for each site.
 */
export async function searchNim({ days = 7, env = process.env, fetchImpl = fetch, now = Date.now(), plan = DEFAULT_FOCUS, openServers = openMcpServers, sweep = true, isKnown = () => false } = {}) {
  for (const name of ["NVIDIA_API_KEY"]) if (!env[name]) throw new Error(`Add ${name} to .env to search with NVIDIA NIM.`);
  const post = async (url, headers, body) => {
    const res = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
    return res.json();
  };
  const ctx = { env, fetchImpl, post, now, days };

  // The MCP search tools. Any failure here (no config file, a server that will not start) is a warning, never the end of the search.
  const mcp = new Map(), notes = [];
  let pool = null;
  const servers = Object.keys(MCP_TOOLS).filter((server) => env[`${server.toUpperCase()}_API_KEY`]);
  if (servers.length) {
    try {
      pool = await openServers(servers);
      for (const d of pool.errorDetails || []) notes.push(`NVIDIA NIM could not use the ${d.server} MCP: ${d.reason}.`);
      for (const server of servers) for (const t of pool.tools(server)) if (MCP_TOOLS[server].includes(t.name)) {
        const { $schema, ...parameters } = t.inputSchema || { type: "object", properties: {} };
        mcp.set(`${server}_${t.name}`, { server, tool: t.name, spec: { type: "function", function: { name: `${server}_${t.name}`, description: clip(t.description, 300), parameters } } });
      }
    } catch (e) { notes.push(`NVIDIA NIM could not use the MCP servers: ${clip(e.message, 160)}`); }
  }
  const specs = () => [...toolSpec(), ...[...mcp.values()].map((m) => m.spec)];
  // Rows have the same shape as TOOLS' rows, so the address and date still come from the tool result, never from the model.
  const tomorrow = berlinDay(now + 86400000);
  // A date after today is not when a posting went up (an engine may give a start or a closing date): such a row has no date.
  const callTool = async (name, args) => (await callRaw(name, args)).map((r) => (r.date > tomorrow ? { ...r, date: "" } : r));
  const callRaw = async (name, args) => {
    const m = mcp.get(name);
    if (!m) return TOOLS[name].run(args, ctx);
    const result = await pool.call(m.server, m.tool, args);
    if (responseFailed(result)) throw new Error(`${m.server} ${m.tool} failed`);
    return responseRecords(result).map((x) => ({ title: clip(x.title, 120), url: x.url, snippet: clip(x.snippet, 400), date: dateOf(x.date) || extractDate(`${x.title} ${x.snippet}`, now) }));
  };

  const messages = [{ role: "system", content: system(days, plan, [...mcp.keys()]) }, { role: "user", content: "Find as many current internships in Germany as you can, as described." }];
  const seen = new Map(), usage = { prompt: 0, completion: 0 }, errors = [], calls = {};
  let answer = "", notJobs = 0;
  const count = (body) => { usage.prompt += body.usage?.prompt_tokens || 0; usage.completion += body.usage?.completion_tokens || 0; };
  try { // the pool holds child processes, and the sweep below still calls it: close it whatever happens
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const body = await chat(messages, ctx, round < MAX_ROUNDS ? specs() : undefined);
      count(body);
      const msg = body.choices[0].message;
      messages.push({ role: "assistant", content: msg.content ?? "", ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}) });
      if (!msg.tool_calls?.length) { answer = msg.content || ""; break; }
      for (const call of msg.tool_calls) {
        const name = call.function.name;
        let rows;
        try { rows = await callTool(name, JSON.parse(call.function.arguments || "{}")); calls[name] = (calls[name] || 0) + 1; }
        catch (e) { rows = { error: clip(e.message, 160) }; errors.push(`${name}: ${rows.error}`); }
        if (Array.isArray(rows)) { // the model never sees a link that is not a job page
          const pages = rows.filter((r) => isJobLink(r.url));
          notJobs += rows.length - pages.length;
          rows = pages;
          for (const r of rows) if (!seen.has(r.url)) seen.set(r.url, { ...r, tool: name });
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(rows).slice(0, 14000) });
      }
    }
    if (!answer.includes("{")) { // the model ended on prose: ask once more, with no tools
      messages.push({ role: "user", content: 'Now reply with ONLY the JSON object {"postings":[...]} for every internship you found in the tool results. No other text.' });
      const body = await chat(messages, ctx, undefined);
      count(body);
      answer = body.choices[0].message.content || "";
    }
    let picked = [];
    try { picked = JSON.parse(answer.slice(answer.indexOf("{"), answer.lastIndexOf("}") + 1)).postings || []; } catch { /* no usable answer: nothing is added */ }
    // Only a posting whose address a tool really returned counts. A page that names several postings is a listing: its date is not theirs.
    const real = picked.filter((p) => p && seen.has(p.url) && p.title);
    const perPage = new Map();
    for (const p of real) perPage.set(p.url, (perPage.get(p.url) || 0) + 1);
    let jobs = real.map((p) => {
      const row = seen.get(p.url);
      return { url: p.url, title: clip(p.title, 200), company: companyName(p.company), location: clip(p.location, 120), date_posted: perPage.get(p.url) > 1 ? "" : row.date,
        snippet: clip(`${p.evidence || ""} ${row.snippet}`, 500), source: siteName(p.url), data_source: `NVIDIA NIM (${row.tool}, unverified)`, verified: false };
    });
    const dated = jobs.filter((j) => j.date_posted).length;
    const modelJobs = jobs.length;

    // Every site gets at least one posting where a search can find one (see sweepSites).
    let sweepLine = "", sweepStats = null;
    if (sweep) {
      const engines = SWEEP_ENGINES.filter((e) => (e.key ? env[e.key] : e.tool in TOOLS || mcp.has(e.tool)));
      const swept = await sweepSites({ jobs, seen, callTool, engines, plan, now, days, errors, isKnown });
      try { usage.completion += await fillCompanies(swept.found, ctx); } catch (e) { errors.push(`site sweep names: ${clip(e.message, 160)}`); }
      jobs = swept.jobs;
      const has = (j) => !ruledOut(j) && (j.date_posted >= swept.oldest || j.site_lead);
      // siteKey is "" for a posting from a site outside the 24 (the model finds some): that is not a site of the list.
      const withDate = new Set(jobs.filter((j) => j.date_posted >= swept.oldest && !ruledOut(j)).map((j) => siteKey(j.url)).filter(Boolean));
      const withAny = new Set(jobs.filter(has).map((j) => siteKey(j.url)).filter(Boolean));
      const none = Object.keys(NIM_SITES).filter((d) => !withAny.has(d)).map((d) => NIM_SITES[d]);
      sweepStats = { sites: Object.keys(NIM_SITES).length, dated: withDate.size, leads: withAny.size - withDate.size, none, added: swept.found.length };
      sweepLine = `NVIDIA NIM site sweep: ${withAny.size} of ${sweepStats.sites} sites have a posting (${withDate.size} dated, ${sweepStats.leads} without a posting date).${none.length ? ` None found for: ${none.join(", ")}.` : ""}`;
    }
    const used = Object.entries(calls).map(([k, v]) => `${k} ${v}`).join(", ");
    return { jobs, stats: { usage, calls, errors, dated, ...(sweepStats ? { sweep: sweepStats } : {}) }, warnings: [
      `NVIDIA NIM (${env.NIM_MODEL || DEFAULT_MODEL}): ${modelJobs} postings picked by the model from ${used || "no tools"}, ${dated} with a posting date. ${usage.prompt + usage.completion} NVIDIA tokens, none from Claude.`,
      ...(sweepLine ? [sweepLine] : []),
      ...(notJobs ? [`NVIDIA NIM ignored ${notJobs} LinkedIn links that are feed posts or profiles, not job pages.`] : []),
      ...notes, ...errors.slice(0, 3).map((e) => `NVIDIA NIM tool problem: ${e}`) ] };
  } finally { await pool?.close().catch(() => {}); }
}
