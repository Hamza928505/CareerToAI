/**
 * A company's own website, found by name through Exa, so the table can show its icon when the job source gave no logo.
 *
 * Only the company's name goes to Exa. A hit is accepted only when the site's name matches the company's (so "Drees &
 * Sommer SE" -> drees-sommer.com, never a job board or a news article): a wrong site would show a wrong logo, and
 * the initials are better than that. Answers, including "none found", are cached in .cache/company-sites.json.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE = path.join(process.cwd(), ".cache", "company-sites.json");
const MAX_PER_SEARCH = 40;
const NOT_THE_COMPANY = /(^|\.)(stepstone|indeed|linkedin|xing|glassdoor|kununu|arbeitsagentur|monster|jooble|adzuna|careerjet|jobware|meinestadt|wikipedia|facebook|instagram|youtube|twitter|x|northdata|firmenwissen|dnb|crunchbase|bloomberg|google|bing)\./;
const LEGAL = /\b(gmbh|ag|se|kg|ohg|ug|mbh|co|inc|ltd|llc|e\.?v\.?|gruppe|group|deutschland|germany|holding|und|and)\b/g;

const squash = (text) => String(text).toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/&/g, " ");
const words = (name) => squash(name).replace(LEGAL, " ").split(/[^a-z0-9]+/).filter((w) => w.length >= 3);

/** The site's own name matches the company's: a long enough company word is in the host, or the host's name is in the company's. */
export function siteMatches(company, url) {
  let host;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return false; }
  if (NOT_THE_COMPANY.test(`${host}.`) || /\.(gov|edu)\./.test(host)) return false;
  const label = host.split(".").slice(0, -1).join("").replace(/[^a-z0-9]/g, ""); // "drees-sommer.com" -> "dreessommer"
  const significant = words(company);
  const joined = significant.join("");
  return label.length >= 3 && (significant.some((w) => w.length >= 4 && label.includes(w)) || (joined.length >= 3 && joined.includes(label)));
}

async function exaSearch(company, key, fetchImpl) {
  const res = await fetchImpl("https://api.exa.ai/search", {
    method: "POST", headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify({ query: `${company} official website`, numResults: 5, type: "auto" }), signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Exa answered ${res.status}`);
  return ((await res.json()).results || []).map((r) => r.url);
}

async function readCache(file) { try { return JSON.parse(await readFile(file, "utf8")); } catch { return {}; } }

/**
 * { company -> "https://host" } for the companies Exa could place, "" for those it could not. Does nothing without an
 * Exa key. Resolves with { sites, asked, error }: a failed lookup stops the rest and is reported, never thrown.
 */
export async function findCompanySites(companies, { key = process.env.EXA_API_KEY, fetchImpl = fetch, file = CACHE } = {}) {
  const wanted = [...new Set(companies.map((c) => String(c || "").trim()).filter(Boolean))].slice(0, MAX_PER_SEARCH);
  const cache = await readCache(file);
  const sites = Object.fromEntries(wanted.filter((c) => c in cache).map((c) => [c, cache[c]]));
  const todo = wanted.filter((c) => !(c in cache));
  let error = "";
  if (!key || !todo.length) return { sites, asked: 0, error: key ? "" : "no Exa key" };
  let next = 0;
  const worker = async () => {
    while (!error && next < todo.length) {
      const company = todo[next++];
      try {
        const hit = (await exaSearch(company, key, fetchImpl)).find((url) => siteMatches(company, url));
        sites[company] = cache[company] = hit ? new URL(hit).origin : "";
      } catch (e) { error = e.message; }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(cache, null, 1));
  return { sites, asked: todo.length, error };
}
