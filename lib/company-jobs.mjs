/**
 * Vacancies straight from the companies in the directory (step 6 of company discovery).
 *
 * Two ways, by what the company's careers page runs on:
 *   - a recruitment platform with a published job-board API (Greenhouse, Lever, Personio, SmartRecruiters, Recruitee,
 *     Ashby, Workable): one request to that API returns the company's open postings with their dates. These APIs exist
 *     so that other programs can list a company's jobs; they need no key and no page is scraped;
 *   - anything else: the careers page itself is read once (robots.txt obeyed, lib/company-discovery.mjs) and the links
 *     whose text names an internship are returned as leads: a title and a link, no date, nothing else read.
 *
 * A posting from an API carries the date the platform gives. A lead has none, so the workspace search (which only adds
 * postings with a known date, lib/application-flow.mjs) never adds one; the company directory shows it for the student
 * to open. Rows from here are for the private tracker only, like every other search result.
 */
import path from "node:path";

import { extractCountry } from "./board-extract.mjs";
import { pageLinks } from "./company-discovery.mjs";
import { readJson, ROOT } from "./content.mjs";

const GERMAN_CITIES = new Set(readJson(path.join(ROOT, "src", "assets", "search-options.json")).cities.map((city) => String(city.name).toLowerCase()));
// Platforms write places their own way: "Munich" for München, ", DE" for the country, a district after a hyphen.
const GERMAN_PLACE = /\b(munich|cologne|nuremberg|hanover|frankfurt|dusseldorf|duesseldorf|brunswick|deutschland|germany)\b|,\s*DE\b/i;
/**
 * Is a posting's stated place in Germany? A posting that states no place counts (the directory holds companies in
 * Germany); one that states a place this cannot recognise as German does not, so a company's jobs abroad stay out.
 */
export function inGermany(job) {
  const location = String(job.location || "").trim();
  if (!location) return true;
  return GERMAN_PLACE.test(location) || location.split(/[,/(;]/).some((part) => extractCountry({ location: part.trim().split("-")[0], germanCities: GERMAN_CITIES }) === "Germany");
}

const day = (value) => {
  const time = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : "";
};
const clip = (value, n = 200) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const tag = (xml, name) => (new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`).exec(xml)?.[1] || "").trim();

/** Each platform: the address of its job-board API for a company, and how one of its postings reads. */
export const APIS = {
  Greenhouse: {
    url: (token) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs`,
    read: (body) => (JSON.parse(body).jobs || []).map((job) => ({ id: job.id, title: job.title, location: job.location?.name, url: job.absolute_url, date: job.first_published || job.updated_at })),
  },
  Lever: {
    url: (token) => `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`,
    read: (body) => JSON.parse(body).map((job) => ({ id: job.id, title: job.text, location: job.categories?.location, url: job.hostedUrl, date: job.createdAt, kind: job.categories?.commitment })),
  },
  Personio: {
    url: (token) => `https://${encodeURIComponent(token)}.jobs.personio.de/xml`,
    read: (body, token) => [...body.matchAll(/<position>([\s\S]*?)<\/position>/g)].map(([, xml]) => ({ id: tag(xml, "id"), title: tag(xml, "name"), location: tag(xml, "office"), url: `https://${token}.jobs.personio.de/job/${tag(xml, "id")}`, date: tag(xml, "createdAt"), kind: tag(xml, "employmentType") })),
  },
  SmartRecruiters: {
    // ponytail: the first 100 postings in Germany; page with `offset` if a company lists more than that.
    url: (token) => `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings?country=de&limit=100`,
    read: (body, token) => (JSON.parse(body).content || []).map((job) => ({ id: job.id, title: job.name, location: [job.location?.city, job.location?.country?.toUpperCase()].filter(Boolean).join(", "), url: `https://jobs.smartrecruiters.com/${token}/${job.id}`, date: job.releasedDate, kind: job.typeOfEmployment?.label })),
  },
  Recruitee: {
    url: (token) => `https://${encodeURIComponent(token)}.recruitee.com/api/offers/`,
    read: (body) => (JSON.parse(body).offers || []).map((job) => ({ id: job.id, title: job.title, location: job.location || [job.city, job.country].filter(Boolean).join(", "), url: job.careers_url, date: job.published_at || job.created_at, kind: job.employment_type_code })),
  },
  Ashby: {
    url: (token) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}`,
    read: (body) => (JSON.parse(body).jobs || []).map((job) => ({ id: job.id, title: job.title, location: job.location, url: job.jobUrl, date: job.publishedAt, kind: job.employmentType })),
  },
  Workable: {
    url: (token) => `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(token)}`,
    read: (body) => (JSON.parse(body).jobs || []).map((job) => ({ id: job.shortcode, title: job.title, location: [job.city, job.country].filter(Boolean).join(", "), url: job.url, date: job.published_on || job.created_at, kind: job.employment_type })),
  },
};

/** How many postings a platform lists for a board name, or -1 when it has no such board. For lib/company-discovery.mjs to confirm a guessed board. */
export const boardSize = (read) => async (platformName, token) => {
  const api = APIS[platformName];
  if (!api) return -1;
  const result = await read(api.url(token), { api: true });
  if (!result.ok) return -1;
  try { return api.read(result.text, token).length; } catch { return -1; }
};

export const canSearch = (company) => Boolean((company.platform?.token && Object.hasOwn(APIS, company.platform.name)) || company.careersStatus === "found");

const INTERNSHIP = /praktik|\bintern(?:ship)?s?\b|pflichtpraktik|trainee|werkstudent|working[\s-]?student|abschlussarbeit|thesis/i;

/** Does a title match what is searched for? No words means every posting; "internships" keeps internship-like titles. */
export function matchesSearch(title, { words = [], internshipsOnly = true } = {}) {
  const text = String(title || "").toLowerCase();
  if (internshipsOnly && !INTERNSHIP.test(text)) return false;
  return !words.length || words.some((word) => text.includes(String(word).toLowerCase()));
}

/**
 * The open postings of one company: { jobs, leads, error }. `jobs` are hits in the shape the workspace search merges
 * (lib/application-flow.mjs); `leads` are undated links from a careers page. Never throws: a company that cannot be
 * read comes back with `error` and the others go on.
 */
export async function companyJobs(company, { read, words = [], internshipsOnly = true, germanyOnly = true } = {}) {
  const platform = company.platform || {};
  try {
    if (platform.token && Object.hasOwn(APIS, platform.name)) {
      const api = APIS[platform.name];
      const result = await read(api.url(platform.token), { api: true });
      if (!result.ok) return { jobs: [], leads: [], error: result.status === 404 ? `${platform.name} has no job board named "${platform.token}".` : `${platform.name} did not answer${result.status ? ` (${result.status})` : ""}.` };
      const jobs = api.read(result.text, platform.token)
        .filter((job) => job.title && /^https?:\/\//.test(job.url || "") && matchesSearch(job.title, { words, internshipsOnly }) && (!germanyOnly || inGermany(job)))
        .map((job) => ({
          url: job.url, title: clip(job.title), company: company.name, location: clip(job.location || company.hq, 120), date_posted: day(job.date),
          snippet: clip([job.kind && `Employment type: ${job.kind}`, `Listed on ${company.name}'s own job board (${platform.name}).`].filter(Boolean).join(" "), 400),
          source: `${company.name} careers`, data_source: `Company site: ${platform.name} job board API`, website: company.website, industry: company.industry,
        }));
      return { jobs, leads: [] };
    }
    if (!company.careersUrl) return { jobs: [], leads: [], error: "No careers page is known for this company yet." };
    const page = await read(company.careersUrl);
    if (!page.ok) return { jobs: [], leads: [], error: page.blocked ? "The site does not allow its careers page to be read automatically." : "The careers page did not answer." };
    const leads = pageLinks(page.text, page.url)
      .filter((link) => link.text.length > 8 && matchesSearch(link.text, { words, internshipsOnly }))
      .slice(0, 40)
      .map((link) => ({ url: link.url, title: clip(link.text, 160), company: company.name, location: company.hq, date_posted: "", source: `${company.name} careers`, data_source: "Company site: careers page link (not checked)", website: company.website, verified: false }));
    return { jobs: [], leads };
  } catch {
    return { jobs: [], leads: [], error: "The answer could not be read." };
  }
}

/**
 * The vacancy search over the directory, for the workspace search: the companies whose platform has an API (at most
 * `max`, so one search stays a bounded number of requests), three at a time. Resolves like the other search sources,
 * { jobs, warnings }.
 */
export async function searchCompanySites({ companies, read, words = [], max = 60 } = {}) {
  const searchable = companies.filter((company) => company.platform?.token && Object.hasOwn(APIS, company.platform.name));
  const todo = searchable.slice(0, max);
  const jobs = [];
  let failed = 0, next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const result = await companyJobs(todo[next++], { read, words });
      if (result.error) failed++;
      jobs.push(...result.jobs);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const warnings = [];
  if (!searchable.length) warnings.push("Company websites: no company in your directory has a job board that can be asked yet. Open Job Boards, Companies, and find their careers pages first.");
  else warnings.push(`Company websites: asked ${todo.length} compan${todo.length === 1 ? "y's" : "ies'"} job boards${searchable.length > todo.length ? ` (of ${searchable.length})` : ""}, ${jobs.length} matching posting${jobs.length === 1 ? "" : "s"}${failed ? `, ${failed} did not answer` : ""}.`);
  return { jobs, warnings };
}
