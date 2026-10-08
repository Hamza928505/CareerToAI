import { randomUUID } from 'node:crypto';
import { inferOpportunityType, jobMatchKey } from './tracker.mjs';
import { scoreJobMatch } from './job-match.mjs';

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

export function mergeSearchResults(rows, hits) {
  const merged = structuredClone(rows);
  const keys = new Map(merged.map((row, i) => [jobMatchKey(row), i]).filter(([key]) => key));
  const missingLinks = new Map(merged.map((row, i) => [!row.job_url ? jobMatchKey({ company: row.company, position: row.position }) : '', i]).filter(([key]) => key));
  let added = 0;
  for (const hit of hits) {
    let url;
    try { url = new URL(hit.url); if (!['https:', 'http:'].includes(url.protocol)) continue; } catch { continue; }
    const incoming = {
      id: `job-${randomUUID()}`, apply: '', applicant: 'Me', status: 'To apply',
      company: hit.company || '', position: hit.title || '', opportunity_type: hit.opportunity_type || inferOpportunityType(hit.title), website: hit.website || '', job_url: url.href,
      date_found: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()), source: 'Other', source_site: hit.source || '',
      date_posted: hit.date_posted || '', city: hit.location || '', data_source: hit.data_source || '', notes: String(hit.snippet || '').slice(0, 1500),
      address: hit.address || '', deadline: hit.deadline || '', work_model: hit.work_model || '', full_part: hit.full_part || '',
      salary: hit.salary || '', req_skills: hit.req_skills || '',
      posting_lang: hit.posting_lang || '', industry: hit.industry || '', start_date: hit.start_date || '',
      benefits: hit.benefits || '', contact_person: hit.contact_person || '', contact_email: hit.contact_email || '',
    };
    const match = hit.match || scoreJobMatch({ ...incoming, description: hit.description, snippet: hit.snippet });
    if (match) {
      incoming.match_score = String(match.score);
      incoming.why_match = match.reason;
      incoming.missing_reqs = match.missing;
    }
    const key = jobMatchKey(incoming);
    const titleKey = jobMatchKey({ company: incoming.company, position: incoming.position });
    const index = key ? (keys.get(key) ?? missingLinks.get(titleKey)) : undefined;
    if (index === undefined) { merged.push(incoming); if (key) keys.set(key, merged.length - 1); added++; }
    else {
      const row = merged[index];
      // User decisions, notes and assignment are always preserved, including blanks.
      for (const [field, value] of Object.entries(incoming)) {
        if (!['id', 'apply', 'applicant', 'status', 'notes'].includes(field) && !row[field] && value) row[field] = value;
      }
      if (key) keys.set(key, index);
    }
  }
  return { rows: merged, added };
}
