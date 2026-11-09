import { readJson, ROOT } from './content.mjs';
import path from 'node:path';

const profile = readJson(path.join(ROOT, 'data', 'profile.json'));
const candidate = [profile.headline, profile.bio].join(' ').toLowerCase();
const skills = [
  ['C#', /\bc#(?=\W|$)|\bcsharp\b/i], ['.NET', /(?:^|\W)\.net\b|\basp\.net\b/i],
  ['SQL', /\bsql\b|\bmysql\b/i], ['JavaScript', /\bjavascript\b|\btypescript\b/i],
  ['HTML', /\bhtml\b/i], ['CSS', /\bcss\b/i], ['Python', /\bpython\b/i],
  ['PyTorch', /\bpytorch\b/i], ['OpenCV', /\bopencv\b/i], ['Linux', /\blinux\b/i],
  ['Git', /\bgit\b/i], ['REST APIs', /\brest(?:ful)?(?:\s+apis?)?\b/i],
  ['Java', /\bjava\b/i], ['React', /\breact\b/i], ['Angular', /\bangular\b/i],
  ['Vue', /\bvue(?:\.js)?\b/i], ['SAP', /\bsap\b/i], ['AWS', /\baws\b/i],
  ['Azure', /\bazure\b/i], ['Docker', /\bdocker\b/i], ['Kubernetes', /\bkubernetes\b/i],
  ['Playwright', /\bplaywright\b/i], ['PHP', /\bphp\b/i], ['Go', /\bgolang\b|\bgo developer\b/i],
];

const clean = value => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A conservative profile comparison, never an eligibility or hiring prediction. It knows IT skills and titles; a search for
 * another major passes that major's title `words` and `skills`, and `keepLow` so that a posting matching nothing still gets
 * a low score instead of none (the student decides, the score only sorts).
 */
export function scoreJobMatch(row, { keepLow = false, words = [], skills: more = [] } = {}) {
  const title = clean(row.position || row.title);
  const details = clean([row.req_skills, row.description, row.snippet].filter(Boolean).join(' '));
  const known = new Set(skills.map(([name]) => name.toLowerCase()));
  const own = more.filter((name) => name && !known.has(name.toLowerCase())).map((name) => [name, new RegExp(`(?<!\\w)${escapeRegExp(name)}(?!\\w)`, 'i')]);
  const roleFit = /software|entwickl|developer|programmer|backend|frontend|full.?stack|\bweb\b|\.net|data|machine learning|computer vision|\b(?:ki|ai|it)\b|informatik|testautomatisierung/i.test(title)
    || words.some((word) => word && title.toLowerCase().includes(word.toLowerCase()));
  const mentioned = [...skills, ...own].filter(([, pattern]) => pattern.test(details));
  if (!roleFit && !mentioned.length && !keepLow) return null;
  const matched = mentioned.filter(([, pattern]) => pattern.test(candidate)).map(([name]) => name);
  const missing = mentioned.filter(([, pattern]) => !pattern.test(candidate)).map(([name]) => name);
  const technical = mentioned.length ? Math.round(45 * matched.length / mentioned.length) : 0;
  let score = (roleFit ? 45 : 20) + technical + (details.length >= 80 ? 10 : 0);
  if (!mentioned.length) score = Math.min(score, 55);
  if (mentioned.length === 1) score = Math.min(score, 80);
  if (mentioned.length === 2) score = Math.min(score, 90);
  // No penalty for a German level: employers take students at their level, so the student applies anyway.
  const reason = mentioned.length
    ? `Profile comparison: ${matched.length}/${mentioned.length} mentioned technologies found${matched.length ? ` (${matched.join(', ')})` : ''}.${mentioned.length < 3 ? ' Limited skill evidence.' : ''}`
    : roleFit ? 'Provisional title match; technical requirements were not available.' : 'Kept for you to judge: nothing in the title or advert names your field or skills yet.';
  return { score: Math.max(0, Math.min(100, score)), reason, missing: missing.join(', ') };
}
