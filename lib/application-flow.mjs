import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { extractCountry, extractLanguageLevel, extractPay, extractWeeks, internshipKind } from './board-extract.mjs';
import { readJson, ROOT } from './content.mjs';
import { inferOpportunityType, jobMatchKey } from './tracker.mjs';
import { scoreJobMatch } from './job-match.mjs';
import { tailoredPaths } from './student-files.mjs';

const GJU = readJson(path.join(ROOT, 'data', 'gju-rules.json'));
const GERMAN_CITIES = new Set(readJson(path.join(ROOT, 'src', 'assets', 'search-options.json')).cities.map((city) => String(city.name).toLowerCase()));

/** A search adds postings from the last NEW_DAYS days only. No posting is dropped for a low Fit: the score only sorts them. */
export const NEW_DAYS = 7;

export const berlinDay = (time) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(time);

// ponytail: the title alone decides, so a posting that names its IT field only in the advert text is left out; add the
// missing word here when one is.
const IT_TITLE = /informati|software|programmier|computer|data|daten|machine learning|künstliche intelligenz|\b(?:ki|ai|ml|qa|ux|ui|sap|app)\b|cloud|devops|cyber|security|it-sicherheit|informationssicherheit|\bweb|frontend|backend|full[- ]?stack|netzwerk|network|datenbank|database|embedded|digitali[sz]|systemadmin|systemintegr|testautomat|blockchain|java|python|\.net|c#|c\+\+|php|react|angular|game[- ]?dev|spieleentwickl/i;
/** Whether a title names an IT field: the search looks for IT internships only. */
export const isIT = (title) => IT_TITLE.test(title || '') || /\bIT\b/.test(title || '');

const APPROVED = new Set(GJU.countries.filter(([, score]) => score >= 12).map(([name]) => name));
const MAX_WEEKS = Math.round((GJU.rules.maxRecognisedMonths * 52) / 12);

/**
 * The German Year rules as one tracker cell: Meets, Fails, Check or Not an internship, with why. The compulsory
 * internship (Pflichtpraktikum, full time) runs at least 20 weeks, and up to 6 months is recognised (GJU
 * Praktikumsrichtlinien), in Germany or a country approved as easily. Pay and language are not rules: unpaid is allowed,
 * pay is often settled at the interview, and employers take students at their level. The search covers Germany only,
 * so a place no rule can name counts as Germany.
 */
export function gjuVerdict(hit) {
  if (!internshipKind(hit.title)) return 'Not an internship';
  const text = [hit.title, hit.snippet, hit.description].filter(Boolean).join('\n');
  const weeks = extractWeeks(text);
  const country = extractCountry({ location: hit.location, text, url: hit.url, germanCities: GERMAN_CITIES });
  const { minWeeks, maxRecognisedMonths } = GJU.rules;
  if (weeks?.max != null && weeks.max < minWeeks) return `Fails: under ${minWeeks} weeks`;
  const why = [
    !weeks && 'duration not stated',
    weeks?.min > MAX_WEEKS && `longer than ${maxRecognisedMonths} months`,
    country !== 'unknown' && !APPROVED.has(country) && `${country} needs approval`,
  ].filter(Boolean);
  return why.length ? `Check: ${why.join(', ')}` : 'Meets';
}

/**
 * What a search may add: postings not in the workbook yet (by link, and by company and title, so a job two sources found
 * counts once), posted in the last `days` days, that the GJU rules do not rule out. `field` is a title test (default: an IT
 * field in the title); the workspace passes null, because a search for any major takes every field. An undated posting is
 * never taken: dated by the day it was found, an old advert would look new (the board's rule, `absorb` in lib/board-run.mjs).
 * The one exception is a site lead (`site_lead`, set by the NIM site sweep in lib/nim-agent.mjs): the single undated posting of
 * a site that had no dated one. It keeps its blank date (never dated by the day it was found) and still has to be an internship.
 */
export function newEligible(hits, rows, { now = Date.now(), days = NEW_DAYS, field = isIT } = {}) {
  const oldest = berlinDay(now - days * 86400000);
  const keysOf = (item) => [jobMatchKey(item), jobMatchKey({ company: item.company, position: item.position })].filter(Boolean);
  const known = new Set(rows.flatMap(keysOf));
  const skipped = { known: 0, undated: 0, old: 0, ineligible: 0, notIT: 0 };
  const jobs = [];
  for (const hit of hits) {
    const keys = keysOf({ job_url: hit.url, company: hit.company, position: hit.title });
    const posted = String(hit.date_posted || '').slice(0, 10);
    const lead = hit.site_lead === true && !posted;
    if (keys.some((key) => known.has(key))) skipped.known++;
    else if (!lead && !/^\d{4}-\d{2}-\d{2}$/.test(posted)) skipped.undated++;
    else if (!lead && posted < oldest) skipped.old++;
    else if (/^(Fails|Not an internship)/.test(gjuVerdict(hit))) skipped.ineligible++;
    else if (field && !field(hit.title)) skipped.notIT++;
    else { keys.forEach((key) => known.add(key)); jobs.push(hit); }
  }
  return { jobs, skipped };
}

/** A test for "the workbook already has this address", by the key newEligible uses. The NIM site sweep skips such postings, so a site's one post is a new one. */
export function knownAddress(rows) {
  const known = new Set(rows.map((row) => jobMatchKey(row)).filter(Boolean));
  return (url) => known.has(jobMatchKey({ job_url: url }));
}

export const assistantQueue = (rows) => rows.filter((row) =>
  row.applicant === 'Assistant' && row.apply === 'Yes' && row.status === 'To apply' && !row.assistant_state);

export function applicationTarget(row) {
  const value = String(row.app_url || row.job_url || '').trim();
  if (/e[ -]?mail/i.test(row.app_method || '') || /^mailto:/i.test(value) || /^[^\s/@]+@[^\s/]+\.[^\s/]+$/.test(value)) {
    return { kind: 'email', url: value };
  }
  try { const url = new URL(value); if (['https:', 'http:'].includes(url.protocol)) return { kind: 'web', url: url.href }; } catch {}
  return { kind: 'missing', url: '' };
}

/** How an approved row is sent: by email, a local browser that uploads the tailored files, or the remote browser tool. */
export function applicationRoute(row) {
  const target = applicationTarget(row);
  if (target.kind !== 'web') return target.kind;
  return tailoredPaths(row).cv ? 'upload' : 'remote';
}

const weeksText = (w) => w.min == null ? `up to ${w.max} weeks` : w.max == null ? `${w.min}+ weeks` : w.min === w.max ? `${w.min} weeks` : `${w.min}–${w.max} weeks`;
const payText = (p) => p.max === 0 ? 'unpaid' : `${p.min === p.max ? p.min : `${p.min}–${p.max}`} EUR/month`;
const levelText = (level) => level === 'unknown' ? '' : level;

/** `scoring` is passed to scoreJobMatch for postings the AI did not score: a major's title words and skills, and keepLow. */
export function mergeSearchResults(rows, hits, { scoring } = {}) {
  const merged = structuredClone(rows);
  const keys = new Map(merged.map((row, i) => [jobMatchKey(row), i]).filter(([key]) => key));
  const missingLinks = new Map(merged.map((row, i) => [!row.job_url ? jobMatchKey({ company: row.company, position: row.position }) : '', i]).filter(([key]) => key));
  let added = 0;
  const gju = {};
  for (const hit of hits) {
    let url;
    try { url = new URL(hit.url); if (!['https:', 'http:'].includes(url.protocol)) continue; } catch { continue; }
    // Duration, pay and language levels as the advert states them (lib/board-extract.mjs), never guessed: blank when not stated.
    const text = [hit.title, hit.snippet, hit.description].filter(Boolean).join('\n');
    const weeks = extractWeeks(text), pay = extractPay(text);
    const incoming = {
      id: `job-${randomUUID()}`, apply: '', applicant: 'Me', status: 'To apply',
      company: hit.company || '', position: hit.title || '', opportunity_type: hit.opportunity_type || inferOpportunityType(hit.title), website: hit.website || '', job_url: url.href,
      date_found: berlinDay(Date.now()), source: 'Other', source_site: hit.source || '',
      date_posted: hit.date_posted || '', city: hit.location || '', data_source: hit.data_source || '',
      notes: [hit.verified === false ? 'Unverified search result: open the link to check it is still open. Nothing was read from the site.' : '', String(hit.snippet || '')].filter(Boolean).join('\n').slice(0, 1500),
      address: hit.address || '', deadline: hit.deadline || '', work_model: hit.work_model || '', full_part: hit.full_part || '',
      salary: hit.salary || (pay ? payText(pay) : ''), req_skills: hit.req_skills || '', duration: weeks ? weeksText(weeks) : '',
      req_german: levelText(extractLanguageLevel(text, 'german')), req_english: levelText(extractLanguageLevel(text, 'english')),
      posting_lang: hit.posting_lang || '', industry: hit.industry || '', start_date: hit.start_date || '',
      benefits: hit.benefits || '', contact_person: hit.contact_person || '', contact_email: hit.contact_email || '',
      gju_check: gjuVerdict(hit), company_logo: /^https:\/\/\S+$/.test(hit.logo_url || '') ? hit.logo_url : '',
    };
    const match = hit.match || scoreJobMatch({ ...incoming, description: hit.description, snippet: hit.snippet }, scoring);
    if (match) {
      incoming.match_score = String(match.score);
      incoming.why_match = match.reason;
      incoming.missing_reqs = match.missing;
    }
    const key = jobMatchKey(incoming);
    const titleKey = jobMatchKey({ company: incoming.company, position: incoming.position });
    const index = key ? (keys.get(key) ?? missingLinks.get(titleKey)) : undefined;
    if (index === undefined) {
      merged.push(incoming); if (key) keys.set(key, merged.length - 1); added++;
      const label = incoming.gju_check.split(':')[0]; gju[label] = (gju[label] || 0) + 1;
    }
    else {
      const row = merged[index];
      // User decisions, notes and assignment are always preserved, including blanks.
      for (const [field, value] of Object.entries(incoming)) {
        if (!['id', 'apply', 'applicant', 'status', 'notes'].includes(field) && !row[field] && value) row[field] = value;
      }
      if (key) keys.set(key, index);
    }
  }
  return { rows: merged, added, gju };
}
