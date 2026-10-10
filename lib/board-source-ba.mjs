/**
 * The Jobbörse of the Bundesagentur für Arbeit as a free source for the public GJU board: no credits, no scraping.
 *
 * OFF BY DEFAULT, AND NOT FOR THE PUBLIC BOARD WITHOUT THE AGENCY'S PERMISSION. The agency offers no public API; this is the
 * JSON service behind arbeitsagentur.de/jobsuche that community projects describe (https://github.com/bundesAPI/jobsuche-api),
 * and it can change without notice (its search moved from v4 to v6). The agency's terms of use
 * (https://www.arbeitsagentur.de/en/terms-of-use, read on 2026-10-10) say in section 2a(3) that users may not "use robots, web
 * spiders or similar technologies" nor use interfaces to read content out of the portal "for the purpose of data collection
 * and evaluation"; section 3 keeps the copyright in the portal's content with the agency; section 8 names
 * hotline@service.arbeitsagentur.de for questions. The robots.txt of www.arbeitsagentur.de allows crawling, but that is not
 * the terms of use. Turn the source on (config.arbeitsagentur.enabled = true in data/board-config.json) only once the agency
 * has agreed. The code is kept polite either way: few calls, one at a time and spaced out, a user agent that says who we are,
 * and a stop when the service refuses us.
 *
 * What this relies on, measured on 2026-10-10:
 *  - GET /v6/jobs?angebotsart=34 lists the "Praktikum/Trainee" offers newest first, 100 per page, and refuses to go past
 *    10,000 results. Its "published since" parameter only honours a few values, so the window is cut here, from each
 *    entry's own first-publication date.
 *  - GET /v4/jobdetails/{base64(referenznummer)} has the advert text, and sometimes befristungInMonaten (the duration).
 *    Pay is never a structured field there.
 */
import { internshipKind } from "./board-extract.mjs";
import { postingKey } from "./job-search.mjs";

const ROOT = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc";
const HEADERS = {
  "X-API-Key": "jobboerse-jobsuche", // the public client id the agency's own site uses, documented by the community project above
  Accept: "application/json",
  "User-Agent": "GJUInternshipBoard/1.0 (+https://github.com/Hamza928505/GJUInternshipBoard)",
};
export const SOURCE_NAME = "Arbeitsagentur Jobbörse";
export const jobUrl = (refnr) => `https://www.arbeitsagentur.de/jobsuche/jobdetail/${refnr}`;

export class SourceError extends Error {
  constructor(message) { super(message); this.name = "SourceError"; }
}

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MIN_DELAY_MS = 250; // whatever the configuration says, never faster than four requests a second

/** A client that spaces its calls, retries a busy service a few times and gives up with a SourceError. */
export function createClient({ fetchImpl = fetch, sleep = realSleep, delayMs = 350, retries = 3, timeoutMs = 20_000 } = {}) {
  const gap = Math.max(MIN_DELAY_MS, Number(delayMs) || 0);
  let calls = 0;
  const backoff = (attempt) => 1000 * 2 ** attempt;
  const retryAfter = (response) => {
    const seconds = Number(response.headers?.get?.("retry-after"));
    return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 30) * 1000 : null;
  };

  /** The parsed answer, or null when the advert is gone (404). */
  async function get(path, params = {}) {
    const url = new URL(ROOT + path);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    for (let attempt = 0; ; attempt++) {
      if (calls++ > 0) await sleep(gap);
      let response;
      try {
        response = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) });
      } catch (error) {
        if (attempt < retries) { await sleep(backoff(attempt)); continue; }
        throw new SourceError(`no answer from the Arbeitsagentur (${error.message})`);
      }
      if (response.ok) {
        try { return await response.json(); } catch { throw new SourceError("the Arbeitsagentur sent an answer that cannot be read"); }
      }
      if (response.status === 404) return null;
      if ((response.status === 429 || response.status >= 500) && attempt < retries) { await sleep(retryAfter(response) ?? backoff(attempt)); continue; }
      throw new SourceError(`the Arbeitsagentur answered ${response.status}${response.status === 403 || response.status === 400 ? " (the service may have changed or blocked us)" : ""}`);
    }
  }
  return { get, calls: () => calls };
}

/** The day an entry was first published, as YYYY-MM-DD ("" when it has none). */
export const firstDate = (item) => String(item?.datumErsteVeroeffentlichung || item?.veroeffentlichungszeitraum?.von || "").slice(0, 10);

/** Entries first published on or after `oldest`, newest first; the walk ends at the first page with none. */
async function listWindow(client, { oldest, pageSize, maxPages }) {
  const entries = [];
  const warnings = [];
  let pages = 0;
  let listed = 0;
  for (let page = 1; page <= maxPages; page++) {
    let answer;
    try {
      answer = await client.get("/v6/jobs", { angebotsart: "34", size: String(pageSize), page: String(page) });
    } catch (error) {
      if (page === 1) throw error; // nothing read at all: the run should say so
      warnings.push(`stopped reading the list at page ${page}: ${error.message}`);
      break;
    }
    const items = answer?.ergebnisliste || [];
    pages++;
    listed += items.length;
    const inWindow = items.filter((item) => firstDate(item) >= oldest);
    entries.push(...inWindow);
    if (!inWindow.length) break; // newest first: a page with nothing in the window means nothing older is
    if (items.length < pageSize || page * pageSize >= (answer?.maxErgebnisse ?? 0)) break;
    if (page === maxPages) warnings.push(`the window is longer than the ${maxPages * pageSize} results one query can reach; older entries were not read`);
  }
  return { entries, pages, listed, warnings };
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß" };
/** Some titles arrive as HTML text ("Energie &amp; Umwelt"); the page shows text, so turn the entities back into characters. */
const decode = (value) => String(value ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code) => {
  if (code[0] !== "#") return ENTITIES[code] ?? all;
  const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
  return point > 0 && point < 0x110000 ? String.fromCodePoint(point) : all;
});
const oneLine = (value) => decode(value).replace(/\s+/g, " ").trim();

/** A board hit (the shape the credit-based search returns) from a list entry and its detail. */
export function toHit(item, detail) {
  const place = detail?.stellenlokationen?.[0]?.adresse || item.stellenlokationen?.[0]?.adresse || {};
  const country = place.land ? `${place.land.charAt(0)}${place.land.slice(1).toLowerCase()}` : ""; // DEUTSCHLAND -> Deutschland
  const months = Number(detail?.befristungInMonaten);
  const occupations = [...new Set([item.hauptberuf, ...(item.alleBerufe || [])].filter((value) => typeof value === "string" && value))];
  return {
    title: oneLine(item.stellenangebotsTitel),
    company: oneLine(detail?.firma || item.firma),
    location: oneLine([place.ort, country].filter(Boolean).join(", ")),
    url: jobUrl(item.referenznummer),
    date_posted: firstDate(item),
    source: SOURCE_NAME,
    data_source: "arbeitsagentur",
    field: occupations.join(", "), // the agency's own name for the job's field: evidence for the major, like the title
    // The structured duration goes first so it wins over a number the text happens to mention.
    description: decode([months > 0 && months <= 24 ? `Dauer: ${months} Monate.` : "", detail?.stellenangebotsBeschreibung].filter(Boolean).join("\n")),
  };
}

/**
 * Internships first published from `oldest` on, with their advert text, in the shape runBoard takes from a search:
 * { jobs, known, settled, warnings, stats }. Only internships for students (see internshipKind) are fetched, and only
 * those the board does not know yet; whether an advert fits a GJU major is for the board to decide from its text.
 */
export async function fetchArbeitsagentur({ oldest, today, isKnown = () => false, config = {}, fetchImpl, sleep, log = () => {} } = {}) {
  const { pageSize = 100, maxPages = 100, maxDetails = 1000, delayMs = 350, minutes = 20 } = config;
  const client = createClient({ fetchImpl, sleep, delayMs });
  const deadline = Date.now() + minutes * 60_000;
  const list = await listWindow(client, { oldest, pageSize: Math.min(100, pageSize), maxPages });
  const warnings = [...list.warnings];
  const stats = { pages: list.pages, listed: list.listed, inWindow: list.entries.length, notInternship: 0, known: 0, candidates: 0, fetched: 0, unavailable: 0, notFetched: 0 };

  const seen = new Set();
  const candidates = [];
  const known = [];
  for (const item of list.entries) {
    if (!item.referenznummer || seen.has(item.referenznummer) || firstDate(item) > today) continue;
    seen.add(item.referenznummer);
    if (!internshipKind(item.stellenangebotsTitel)) { stats.notInternship++; continue; }
    const key = postingKey(jobUrl(item.referenznummer));
    if (isKnown(key)) { known.push(key); continue; }
    candidates.push(item);
  }
  stats.known = known.length;
  stats.candidates = candidates.length;
  log(`Arbeitsagentur: ${stats.pages} list pages, ${stats.inWindow} entries since ${oldest}, ${candidates.length} new internships to read (${known.length} already known).`);

  const jobs = [];
  let attempted = 0;
  let failures = 0;
  for (const item of candidates.slice(0, maxDetails)) {
    if (Date.now() > deadline) { warnings.push(`stopped after ${minutes} minutes`); break; }
    attempted++;
    let detail;
    try {
      detail = await client.get(`/v4/jobdetails/${Buffer.from(item.referenznummer).toString("base64")}`);
      failures = 0;
    } catch (error) {
      stats.unavailable++;
      if (++failures >= 3) { warnings.push(`stopped reading adverts after three failures in a row: ${error.message}`); break; }
      continue;
    }
    if (!detail) { stats.unavailable++; continue; }
    jobs.push(toHit(item, detail));
    if (jobs.length % 100 === 0) log(`Arbeitsagentur: ${jobs.length} adverts read...`);
  }
  stats.fetched = jobs.length;
  stats.notFetched = candidates.length - attempted;
  if (stats.notFetched > 0) warnings.push(`${stats.notFetched} more internships were not read this run (limit ${maxDetails} adverts, or stopped early); they are picked up next run while they stay in the window.`);
  return { jobs, known, settled: [], warnings, stats };
}
