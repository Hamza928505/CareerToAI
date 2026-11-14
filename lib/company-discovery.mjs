/**
 * Company discovery, in separate steps that can each be run again on their own:
 *
 *   1. discoverCompanies()  who operates in Germany (SOURCES: add a new source there)
 *   2. findWebsite()        the company's official website, and whether it answers
 *   3. findCareers()        its careers page, found on the website itself
 *   4. detectPlatform()     the recruitment platform (ATS) behind that page
 *
 * Step 5 is the directory (lib/company-directory.mjs) and step 6 the vacancy search (lib/company-jobs.mjs).
 *
 * How a website is read here:
 *   - only the home page and at most a few candidate careers pages, one request at a time per site, at least
 *     two seconds apart, each with a time limit and a size limit;
 *   - robots.txt is fetched first and obeyed: a page it disallows is recorded as "blocked", never read;
 *   - a site that data/source-access-policy.json marks as prohibited is never read, whatever robots.txt says;
 *   - an address on this computer or a private network is refused, so a web address from a source can never be
 *     used to reach something local.
 * Nothing found is stored as fact until the address has answered: an unverified address stays "unverified".
 */
import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { hostKey, logAttempt, nameKey } from "./company-directory.mjs";
import { findCompanySites } from "./company-site.mjs";
import { policyFor } from "./source-policy.mjs";
import { ATS_DIR } from "./student-files.mjs";

export const USER_AGENT = "CareerToAI/1.0 (personal job search on one computer; obeys robots.txt)";
const TIMEOUT_MS = 12_000;
const MAX_BYTES = 700_000;
const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|\[.*\])$/i;
const MAX_REDIRECTS = 5;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

// Loopback, private, shared (CGNAT), link-local, multicast and reserved ranges. BlockList checks an IPv4-mapped IPv6
// address (::ffff:127.0.0.1, ::ffff:7f00:1) against the IPv4 rules itself.
const PRIVATE_NETS = new net.BlockList();
for (const [network, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16], ["224.0.0.0", 3]]) PRIVATE_NETS.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [["::", 127], ["fc00::", 7], ["fe80::", 10]]) PRIVATE_NETS.addSubnet(network, prefix, "ipv6");

/** True for an address the reader may never contact; anything that is not an IP address counts as private. */
export function isPrivateAddress(address) {
  if (net.isIPv4(address)) return PRIVATE_NETS.check(address, "ipv4");
  return net.isIPv6(address) ? PRIVATE_NETS.check(address, "ipv6") : true;
}

const resolveHost = async (hostname) => (await dns.lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

// ---- robots.txt ---------------------------------------------------------------------------------------------------------

/** The Allow and Disallow rules that apply to us: the group naming this program, else the group for every robot. */
export function parseRobots(text, agent = "careertoai") {
  const groups = [];
  let current = null, readingAgents = false;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*(?:#.*)?$/.exec(raw);
    if (!match) continue;
    const key = match[1].toLowerCase(), value = match[2];
    if (key === "user-agent") {
      if (!readingAgents) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      readingAgents = true;
    } else {
      readingAgents = false;
      if (current && (key === "allow" || key === "disallow") && value) current.rules.push({ allow: key === "allow", path: value });
    }
  }
  const group = groups.find((g) => g.agents.some((name) => name !== "*" && agent.includes(name))) || groups.find((g) => g.agents.includes("*"));
  return group ? group.rules : [];
}

const robotsPattern = (rule) => new RegExp(`^${rule.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*").replace(/\\\$$/, "$")}`);

/** May this path be read? The longest matching rule decides, and Allow wins a tie (RFC 9309). */
export function robotsAllows(rules, pathname) {
  let best = null;
  for (const rule of rules) {
    if (!robotsPattern(rule.path).test(pathname)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) best = rule;
  }
  return !best || best.allow;
}

// ---- reading a page politely ------------------------------------------------------------------------------------------

/**
 * A page reader that keeps the rules above. Returns get(url) -> { ok, status, url, text } for a page that was read, or
 * { ok: false, blocked: "robots" | "policy" | "private" } / { ok: false, status } / { ok: false, error } otherwise.
 * `api: true` is for a recruitment platform's published job-board API, which is made to be called by programs: the
 * pause between requests still applies, robots.txt (which speaks to crawlers of web pages) does not.
 */
export function createReader({ fetchImpl = fetch, pauseMs = 2000, wait = sleep, now = Date.now, resolve = resolveHost } = {}) {
  const robots = new Map();
  const nextAt = new Map();

  // A public-looking name can point at this computer or the home network, and a public site can redirect there, so every
  // hop is checked by the addresses its name resolves to, and redirects are followed here rather than by fetch.
  // ponytail: the check and fetch's own lookup are two lookups (DNS rebinding could slip between them); pin the address
  // with an undici dispatcher if this reader ever runs anywhere but the student's own computer.
  async function publicHost(target) {
    if (!["http:", "https:"].includes(target.protocol) || PRIVATE_HOST.test(target.hostname)) return false;
    const addresses = await resolve(target.hostname);
    return addresses.length > 0 && !addresses.some(isPrivateAddress);
  }

  async function request(url, accept) {
    let target = new URL(url);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!(await publicHost(target))) return { ok: false, blocked: "private" };
      if (policyFor(target.hostname)?.automatedExtraction === "prohibited") return { ok: false, blocked: "policy" };
      const at = Math.max(now(), nextAt.get(target.host) || 0);
      nextAt.set(target.host, at + pauseMs);
      if (at > now()) await wait(at - now());
      const response = await fetchImpl(target.href, { headers: { "user-agent": USER_AGENT, accept }, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
      const location = REDIRECTS.has(response.status) ? response.headers?.get("location") : null;
      if (location) { target = new URL(location, target); continue; }
      const body = response.ok ? (await response.text()).slice(0, MAX_BYTES) : "";
      return { ok: response.ok, status: response.status, url: target.href, text: body };
    }
    return { ok: false, error: "too many redirects" };
  }

  function rulesFor(origin) {
    if (!robots.has(origin)) {
      robots.set(origin, request(`${origin}/robots.txt`, "text/plain").then(
        // No robots.txt (4xx) means nothing is disallowed. A server error means we cannot know, so the site is left alone.
        (result) => (result.ok ? parseRobots(result.text) : result.status >= 500 ? null : []),
        () => "unreachable",
      ));
    }
    return robots.get(origin);
  }

  return async function get(url, { api = false, accept = api ? "application/json, application/xml, text/xml" : "text/html,application/xhtml+xml" } = {}) {
    let parsed;
    try { parsed = new URL(url); } catch { return { ok: false, error: "not a web address" }; }
    if (!["http:", "https:"].includes(parsed.protocol) || PRIVATE_HOST.test(parsed.hostname)) return { ok: false, blocked: "private" };
    if (policyFor(parsed.hostname)?.automatedExtraction === "prohibited") return { ok: false, blocked: "policy" };
    try {
      if (!api) {
        const rules = await rulesFor(parsed.origin);
        if (rules === "unreachable") return { ok: false, error: "could not connect" };
        if (!rules || !robotsAllows(rules, parsed.pathname + parsed.search)) return { ok: false, blocked: "robots" };
      }
      return await request(parsed.href, accept);
    } catch (error) {
      return { ok: false, error: error.name === "TimeoutError" ? "no answer in time" : "could not connect" };
    }
  };
}

// ---- step 1: who operates in Germany ------------------------------------------------------------------------------------

/** The employers the ATS manuals describe (Student-data/ats/Companies/*.md), with the platform each manual names. */
function fromManuals({ dir = path.join(ATS_DIR, "Companies") } = {}) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((file) => file.endsWith(".md")).map((file) => {
    const body = fs.readFileSync(path.join(dir, file), "utf8");
    const platform = /^\|\s*ATS\s*\|\s*([^|(]+?)\s*(?:\(|\|)/m.exec(body)?.[1] || "";
    return { name: file.replace(/\.md$/, ""), platform: { name: /unknown|proprietary|probably/i.test(platform) ? "" : platform }, source: "ATS manuals" };
  });
}

/** Every employer already in the tracker, with what its rows know: website, careers page, city, industry. */
function fromTracker({ rows = [] } = {}) {
  return rows.filter((row) => String(row.company || "").trim()).map((row) => ({
    name: row.company, website: row.website, careersUrl: row.careers_url, hq: row.city, industry: row.industry,
    employees: /^\d[\d.,\s]*$/.test(String(row.company_size || "")) ? row.company_size : "", source: "Your tracker",
  }));
}

const SPARQL = ({ limit, offset, minEmployees, city }) => `SELECT ?c ?cLabel ?website ?hqLabel ?industryLabel ?employees WHERE {
  ?c wdt:P17 wd:Q183 ; wdt:P856 ?website ; wdt:P452 ?industry ; wdt:P1128 ?employees .
  ?c wdt:P159 ?hq . ?hq wdt:P17 wd:Q183 .
  FILTER(?employees >= ${minEmployees})
  ${city ? `?hq rdfs:label ?hqName . FILTER(LANG(?hqName) = "de" && LCASE(STR(?hqName)) = "${city.toLowerCase().replace(/["\\]/g, "")}")` : ""}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". }
} ORDER BY DESC(?employees) LIMIT ${limit} OFFSET ${offset}`;

/**
 * Companies with their headquarters in Germany, from Wikidata (free, CC0): name, official website, industry, head
 * office and number of employees. Largest first; `offset` continues where the last run stopped. One request per run.
 */
async function fromWikidata({ limit = 100, offset = 0, minEmployees = 250, city = "", fetchImpl = fetch } = {}) {
  const query = SPARQL({ limit: Math.min(Math.max(Number(limit) || 100, 1), 300) * 3, offset: Math.max(Number(offset) || 0, 0) * 3, minEmployees: Math.max(Number(minEmployees) || 0, 0), city: String(city || "").trim() });
  const response = await fetchImpl(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, { headers: { "user-agent": USER_AGENT, accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Wikidata answered ${response.status}. Try again in a minute, or ask for fewer companies.`);
  const byId = new Map();
  for (const row of (await response.json()).results?.bindings || []) {
    const id = row.c?.value;
    const name = row.cLabel?.value || "";
    if (!id || !name || /^Q\d+$/.test(name)) continue; // no label in German or English: not usable as a name
    // A company with two industries or two head offices comes back as several rows: the first of each is kept.
    const company = byId.get(id) || { name, website: row.website?.value, industry: row.industryLabel?.value || "", hq: row.hqLabel?.value || "", employees: 0, source: "Wikidata" };
    company.employees = Math.max(company.employees, Number(row.employees?.value) || 0);
    byId.set(id, company);
  }
  return [...byId.values()];
}

/** One company typed in by hand. */
const fromInput = ({ name = "", website = "" } = {}) => (String(name).trim() ? [{ name, website, source: "Added by you" }] : []);

/** Where companies come from. To add a source, add a function here that resolves to [{ name, website?, industry?, hq?, employees?, source }]. */
export const SOURCES = {
  manuals: { label: "Employers in the ATS manuals", find: fromManuals },
  tracker: { label: "Employers in your tracker", find: fromTracker },
  wikidata: { label: "Companies in Germany (Wikidata)", find: fromWikidata },
  manual: { label: "A company you name", find: fromInput },
};

export async function discoverCompanies(source, options = {}) {
  if (!Object.hasOwn(SOURCES, source)) throw Object.assign(new Error("Choose where to look for companies."), { statusCode: 400 });
  return SOURCES[source].find(options);
}

// ---- step 2: the official website -------------------------------------------------------------------------------------

const outcome = (result) => (result.ok ? "ok" : result.blocked || [401, 403, 429].includes(result.status) ? "blocked" : "broken");
const why = (result) => (result.blocked === "robots" ? "the site's robots.txt does not allow reading it" : result.blocked === "policy" ? "this site may not be read automatically" : result.blocked ? "not a public web address" : result.status ? `the site answered ${result.status}` : result.error || "no answer");

/**
 * Give a company its official website and check that it answers. A company without one is looked up by name (Exa,
 * lib/company-site.mjs: only a site whose own name matches the company's is accepted). Changes `company` and returns it.
 */
export async function findWebsite(company, { read, lookup = findCompanySites } = {}) {
  if (!company.website) {
    const { sites, error } = await lookup([company.name]);
    if (sites[company.name]) company.website = sites[company.name];
    else return logAttempt(company, "website", false, error === "no Exa key" ? "No website known. Add an Exa key in Settings to look it up, or type the address." : "No official website was found by name.");
  }
  const result = await read(company.website);
  company.websiteStatus = outcome(result);
  if (result.ok) company.website = new URL(result.url).origin; // after redirects: the address the company actually uses
  return logAttempt(company, "website", result.ok, result.ok ? "The website answered." : `Website: ${why(result)}.`);
}

// ---- steps 3 and 4: the careers page and the platform behind it -----------------------------------------------------------

const CAREERS_WORDS = /karriere|career|jobs?\b|stellen(?:angebot|markt|anzeigen|ausschreibung)|offene[\s-]?stellen|vacanc|praktik|internship|students?\b|studierende|absolvent|graduates?|werkstudent|working[\s-]?student|join[\s-]?us|work[\s-]?with[\s-]?us|arbeiten[\s-]?bei/i;
const CAREERS_STRONG = /karriere|career|stellen(?:angebot|markt)|offene[\s-]?stellen|\bjobs\b/i;
const NOT_A_PAGE = /\.(pdf|jpe?g|png|svg|zip|docx?)(\?|$)|^(mailto|tel|javascript):|facebook\.|instagram\.|twitter\.|x\.com|youtube\.|linkedin\.|xing\.|kununu\.|glassdoor\./i;

/** Recruitment platforms by their address. `token` is the company's name on the platform; `api` marks the ones lib/company-jobs.mjs can ask for postings. */
export const PLATFORMS = [
  { name: "Greenhouse", api: true, rx: /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([A-Za-z0-9_-]+)|boards-api\.greenhouse\.io\/v1\/boards\/([A-Za-z0-9_-]+)/i },
  { name: "Lever", api: true, rx: /jobs\.(?:eu\.)?lever\.co\/([A-Za-z0-9_.-]+)/i },
  { name: "Personio", api: true, rx: /\b([a-z0-9-]+)\.jobs\.personio\.(?:de|com)/i },
  { name: "SmartRecruiters", api: true, rx: /(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9_.-]+)|api\.smartrecruiters\.com\/v1\/companies\/([A-Za-z0-9_.-]+)/i },
  { name: "Recruitee", api: true, rx: /\b([a-z0-9-]+)\.recruitee\.com/i },
  { name: "Ashby", api: true, rx: /jobs\.ashbyhq\.com\/([A-Za-z0-9_.%-]+)/i },
  { name: "Workable", api: true, rx: /apply\.workable\.com\/([A-Za-z0-9_-]+)/i },
  { name: "softgarden", rx: /\b([a-z0-9-]+)\.softgarden\.(?:io|de)/i },
  { name: "Workday", rx: /\b([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com/i },
  { name: "SAP SuccessFactors", rx: /career\d*\.successfactors\.(?:eu|com)|\.successfactors\.(?:eu|com)\/career/i },
  { name: "d.vinci", rx: /\b([a-z0-9-]+)\.dvinci(?:-hr)?\.(?:de|com)/i },
  { name: "Avature", rx: /\b([a-z0-9-]+)\.avature\.net/i },
  { name: "iCIMS", rx: /\b([a-z0-9-]+)\.icims\.com/i },
  { name: "Oracle Taleo / ORC", rx: /\b([a-z0-9-]+)\.taleo\.net|\.oraclecloud\.com\/hcmUI\/CandidateExperience/i },
  { name: "BeeSite (milch & zucker)", rx: /beesite\.de/i },
  { name: "Phenom", rx: /phenompeople\.com|cdn\.phenom/i },
  { name: "Eightfold", rx: /\b([a-z0-9-]+)\.eightfold\.ai/i },
];
const GENERIC_TOKEN = /^(www|jobs|careers?|api|app|embed|boards?|cdn|static|assets)$/i;

/** The recruitment platform an address or a page's HTML points to: { name, token, boardUrl }, or null. */
export function detectPlatform(text) {
  for (const platform of PLATFORMS) {
    const match = platform.rx.exec(String(text || ""));
    if (!match) continue;
    const token = decodeURIComponent(match.slice(1).find(Boolean) || "");
    if (GENERIC_TOKEN.test(token)) continue;
    return { name: platform.name, token, boardUrl: `https://${match[0]}` };
  }
  return null;
}

/** The links of a page: [{ url (absolute), text }], each address once, in page order. */
export function pageLinks(html, base) {
  const links = new Map();
  for (const match of String(html || "").matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (NOT_A_PAGE.test(match[1])) continue;
    let url;
    try { url = new URL(match[1], base).href; } catch { continue; }
    if (!links.has(url)) links.set(url, match[2].replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().slice(0, 120));
  }
  return [...links].map(([url, text]) => ({ url, text }));
}

/** The link of a home page most likely to be the careers page: on the company's own site or on a recruitment platform. */
export function pickCareersLink(links, website) {
  const site = hostKey(website);
  const scored = links.map(({ url, text }) => {
    const host = hostKey(url);
    const own = host === site || host.endsWith(`.${site}`) || site.endsWith(`.${host}`);
    const platform = detectPlatform(url);
    if (!own && !platform) return null;
    const path = new URL(url).pathname + new URL(url).hostname;
    if (!CAREERS_WORDS.test(text) && !CAREERS_WORDS.test(path) && !platform) return null;
    const score = (CAREERS_STRONG.test(text) ? 4 : 0) + (CAREERS_STRONG.test(path) ? 3 : 0) + (platform ? 3 : 0) + (CAREERS_WORDS.test(text) ? 1 : 0) - Math.min(new URL(url).pathname.split("/").filter(Boolean).length, 4) * 0.5;
    return { url, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score);
  return scored[0]?.url || "";
}

const COMMON_PATHS = ["/karriere", "/careers", "/jobs"];

const HINTS = [["Greenhouse", /greenhouse\.io|gh_jid=/i], ["Lever", /lever\.co/i], ["Personio", /personio\.(?:de|com)/i], ["SmartRecruiters", /smartrecruiters\.com/i], ["Recruitee", /recruitee\.com/i], ["Ashby", /ashbyhq\.com/i], ["Workable", /workable\.com/i]];

/**
 * The company's board on a platform when the page names the platform but not the board (a job list loaded by a script).
 * The only guess made is the company's own name, and it is kept only when the platform's API has postings under it:
 * `check(platformName, token)` resolves to the number of postings, or -1 when there is no such board.
 */
export async function confirmBoard(company, html, check) {
  const known = company.platform?.name;
  const names = [...new Set([known, ...HINTS.filter(([, rx]) => rx.test(html)).map(([name]) => name)].filter((name) => HINTS.some(([hint]) => hint === name)))];
  const token = nameKey(company.name);
  if (!token) return null;
  for (const name of names.slice(0, 2)) if ((await check(name, token)) > 0) return { name, token, boardUrl: "" };
  return null;
}

/**
 * Find a company's careers page on its own website and the recruitment platform behind it. Reads the home page, follows
 * the best careers link (or tries three usual addresses), and looks at that page for a platform. Changes `company`.
 */
export async function findCareers(company, { read, check = null } = {}) {
  if (!company.website) return logAttempt(company, "careers", false, "No website to look on.");
  const home = await read(company.website);
  if (!home.ok) {
    company.careersStatus = outcome(home) === "blocked" ? "blocked" : "broken";
    company.websiteStatus = outcome(home);
    return logAttempt(company, "careers", false, `Home page: ${why(home)}.`);
  }
  company.websiteStatus = "ok";
  const candidates = [pickCareersLink(pageLinks(home.text, home.url), home.url), ...COMMON_PATHS.map((p) => new URL(p, home.url).href)].filter(Boolean);
  let blocked = false;
  for (const candidate of [...new Set(candidates)].slice(0, 4)) {
    // A link straight to a recruitment platform is the careers page; its own page is not read here (the vacancy search asks its API).
    const direct = hostKey(candidate) !== hostKey(home.url) ? detectPlatform(candidate) : null;
    const page = direct ? { ok: true, url: candidate, text: "" } : await read(candidate);
    if (!page.ok) { blocked ||= Boolean(page.blocked); continue; }
    if (!direct && !CAREERS_WORDS.test(page.text.slice(0, 200_000))) continue; // a soft 404 or an unrelated page that happens to answer
    company.careersUrl = page.url;
    company.careersStatus = "found";
    const platform = direct || detectPlatform(page.url) || detectPlatform(page.text) || (check ? await confirmBoard(company, page.text, check) : null);
    if (platform) company.platform = platform;
    company.applyMethods = [...new Set([platform ? `Online form (${platform.name})` : "Company careers page", /href\s*=\s*["']mailto:[^"']*(?:bewerbung|career|karriere|jobs|recruit|hr@|personal)/i.test(page.text) ? "E-mail" : ""].filter(Boolean))];
    return logAttempt(company, "careers", true, platform ? `Careers page found; it runs on ${platform.name}.` : "Careers page found; no known recruitment platform on it.");
  }
  company.careersStatus = blocked ? "blocked" : "not found";
  return logAttempt(company, "careers", false, blocked ? "The site's robots.txt does not allow reading its careers page." : "No careers page was found on the website.");
}
