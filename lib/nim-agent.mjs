/**
 * An NVIDIA NIM model searches for IT internships by calling search APIs itself, so Claude spends no tokens on it.
 *
 * Its tools are Tavily, Exa, Firecrawl (keys from .env) and the free Arbeitnow API. Indeed and Apify are NOT here: they are
 * connectors of the student's Claude account and stay with Claude (lib/indeed-agent.mjs, lib/apify-agent.mjs).
 *
 * What comes back is search-engine snippets, never an opened page, so every posting is `verified: false`. The model only
 * picks postings; the web address and the posting date are taken from the tool results by code, never from the model's
 * words, and a posting whose snippet states no date has none (the search drops undated postings, `newEligible`).
 */
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

export const clip = (value, n = 280) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const pad = (n) => String(n).padStart(2, "0");

/** The site's own name for a posting's address ("www.stepstone.de" -> "StepStone"), else the bare host. */
export function siteName(url) {
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
  const known = Object.keys(NIM_SITES).find((domain) => host === domain || host.endsWith(`.${domain}`));
  return known ? NIM_SITES[known] : host;
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

const system = (days) => `You search for IT internships (Praktikum, Pflichtpraktikum, Praxissemester, internship) in Germany for a computer science student. Use ONLY the tools; never invent a posting.
Search in German first (Praktikum Informatik, Pflichtpraktikum IT, Praktikum Softwareentwicklung, Praktikum Data Science, Praktikum Cyber Security, Praktikum Cloud DevOps, Praktikum KI) and some English (IT internship). Prefer postings from the last ${days} days.
Cover these sites with include_domains (in groups of up to 10): ${Object.keys(NIM_SITES).filter((d) => d !== "arbeitnow.com").join(", ")}. Do not search indeed.com: another tool does that.
Use tavily_search, exa_search AND firecrawl_search (each at least 3 times with different queries and domain groups) and arbeitnow_jobs once. Skip Ausbildung, Duales Studium, Trainee and school placements. A listing page's snippet may name several postings: list each one with that page's url. Make at most ${MAX_ROUNDS - 2} tool rounds.
When done, reply with ONLY JSON: {"postings":[{"title":"","company":"","location":"","url":"","evidence":"words from the tool result"}]}. Use a url exactly as a tool returned it.`;

async function chat(messages, { env, fetchImpl }, tools) {
  const res = await fetchImpl(`${BASE}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.NVIDIA_API_KEY}` },
    body: JSON.stringify({ model: env.NIM_MODEL || DEFAULT_MODEL, temperature: 0.1, messages, ...(tools ? { tools, tool_choice: "auto" } : {}) }), signal: AbortSignal.timeout(180_000) });
  if (res.status === 401 || res.status === 403) throw new Error("NVIDIA refused the key. Check NVIDIA_API_KEY in .env.");
  if (!res.ok) throw new Error(`NVIDIA NIM answered ${res.status}: ${clip(await res.text(), 160)}`);
  return res.json();
}

/**
 * Resolves to { jobs, warnings, stats }, the shape the workspace search merges. Fails when the key is missing or NVIDIA
 * refuses; one failing search tool only shows up in `stats.errors`.
 */
export async function searchNim({ days = 7, env = process.env, fetchImpl = fetch, now = Date.now() } = {}) {
  for (const name of ["NVIDIA_API_KEY"]) if (!env[name]) throw new Error(`Add ${name} to .env to search with NVIDIA NIM.`);
  const post = async (url, headers, body) => {
    const res = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
    return res.json();
  };
  const ctx = { env, fetchImpl, post, now, days };
  const messages = [{ role: "system", content: system(days) }, { role: "user", content: "Find as many current IT internships in Germany as you can." }];
  const seen = new Map(), usage = { prompt: 0, completion: 0 }, errors = [], calls = {};
  let answer = "";
  const count = (body) => { usage.prompt += body.usage?.prompt_tokens || 0; usage.completion += body.usage?.completion_tokens || 0; };
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const body = await chat(messages, ctx, round < MAX_ROUNDS ? toolSpec() : undefined);
    count(body);
    const msg = body.choices[0].message;
    messages.push({ role: "assistant", content: msg.content ?? "", ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}) });
    if (!msg.tool_calls?.length) { answer = msg.content || ""; break; }
    for (const call of msg.tool_calls) {
      const name = call.function.name;
      let rows;
      try { rows = await TOOLS[name].run(JSON.parse(call.function.arguments || "{}"), ctx); calls[name] = (calls[name] || 0) + 1; }
      catch (e) { rows = { error: clip(e.message, 160) }; errors.push(`${name}: ${rows.error}`); }
      if (Array.isArray(rows)) for (const r of rows) if (!seen.has(r.url)) seen.set(r.url, { ...r, tool: name });
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
  const jobs = real.map((p) => {
    const row = seen.get(p.url);
    return { url: p.url, title: clip(p.title, 200), company: clip(p.company, 120), location: clip(p.location, 120), date_posted: perPage.get(p.url) > 1 ? "" : row.date,
      snippet: clip(`${p.evidence || ""} ${row.snippet}`, 500), source: siteName(p.url), data_source: `NVIDIA NIM (${row.tool}, unverified)`, verified: false };
  });
  const dated = jobs.filter((j) => j.date_posted).length;
  const used = Object.entries(calls).map(([k, v]) => `${k} ${v}`).join(", ");
  return { jobs, stats: { usage, calls, errors, dated }, warnings: [
    `NVIDIA NIM (${env.NIM_MODEL || DEFAULT_MODEL}): ${jobs.length} postings from ${used || "no tools"}, ${dated} with a posting date. ${usage.prompt + usage.completion} NVIDIA tokens, none from Claude.`,
    ...errors.slice(0, 3).map((e) => `NVIDIA NIM tool problem: ${e}`) ] };
}
