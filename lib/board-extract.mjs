/**
 * Facts for the public GJU internship board, read out of a posting with plain rules (no AI).
 *
 * The board is for internships only: a posting whose title does not say Praktikum, Praktikant or
 * internship has no kind and is not published (see internshipKind).
 *
 * Anything a rule cannot establish stays "unknown": the board never guesses a duration, a pay or a
 * language level. The GJU check treats unknown as "check yourself", never as a pass.
 * Only these derived fields are published; advert text and contact details are not kept.
 */
import { createHash } from "node:crypto";

import { jobMatchKey } from "./tracker.mjs";

export const LEVELS = ["none", "A1", "A2", "B1", "B2", "C1", "C2"];
export const levelRank = (level) => LEVELS.indexOf(level);

const WEEKS_PER_MONTH = 4.345;
const BEFORE_IGNORED = /(probezeit|probation|berufserfahrung|experience|erfahrung|kündigungsfrist|notice|garantie|warranty|jahre|years)\W*$/i;
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "1.000" / "1,000" are thousands, "7,5" is a decimal. */
export function parseAmount(raw) {
  const text = String(raw).trim();
  return /^\d{1,3}([.,]\d{3})+$/.test(text) ? Number(text.replace(/[.,]/g, "")) : Number(text.replace(",", "."));
}

// ------------------------------------------------------------ duration

const DURATION = /(\d{1,2})(?:\s*(?:-|–|bis|to)\s*(\d{1,2}))?\s*(monate?n?|months?|wochen?|weeks?)\b/gi;

/** Duration in weeks as {min, max}; max is null when open-ended ("ab 6 Monate"). null when not stated. */
export function extractWeeks(text) {
  for (const match of String(text).matchAll(DURATION)) {
    const before = text.slice(Math.max(0, match.index - 30), match.index);
    if (BEFORE_IGNORED.test(before)) continue;
    const perUnit = /^w/i.test(match[3]) ? 1 : WEEKS_PER_MONTH;
    const low = Math.round(Number(match[1]) * perUnit);
    const high = match[2] ? Math.round(Number(match[2]) * perUnit) : low;
    if (/(?:ab|mindestens|minimum|at least|min\.)\s*$/i.test(before)) return { min: low, max: null };
    if (/(?:bis zu|up to|maximal|max\.)\s*$/i.test(before)) return { min: null, max: low };
    return { min: Math.min(low, high), max: Math.max(low, high) };
  }
  return null;
}

// ------------------------------------------------------------ pay

const AMOUNT = String.raw`(\d{1,3}(?:[.,]\d{3})+|\d{3,5})`;
const RANGE = (n) => String.raw`${n}(?:\s*(?:-|–|bis|to)\s*${n})?`;
const MONEY = String.raw`\s*(?:€|EUR|Euro)`;
const MONTHLY = new RegExp(`${RANGE(AMOUNT)}${MONEY}\\s*(?:\\/|pro|per|im|je|a)?\\s*(?:monat|month|mtl\\.?|monatlich)`, "i");
const UNPAID = /\b(unbezahlt\w*|unpaid|ohne vergütung|no remuneration)\b/i;

/**
 * Monthly pay in EUR as {min, max, basis}. Unpaid is 0. null when no monthly figure is stated: an
 * hourly or yearly rate is not turned into a monthly pay by guessing hours.
 */
export function extractPay(text) {
  const value = String(text);
  const monthly = MONTHLY.exec(value);
  if (monthly) {
    const low = parseAmount(monthly[1]);
    const high = monthly[2] ? parseAmount(monthly[2]) : low;
    return { min: Math.min(low, high), max: Math.max(low, high), basis: "monthly" };
  }
  if (UNPAID.test(value)) return { min: 0, max: 0, basis: "unpaid" };
  return null;
}

// ------------------------------------------------------------ kind of internship

const KINDS = [
  [/pflicht[\s-]?praktik|mandatory internship|compulsory internship/i, "Pflichtpraktikum"],
  [/praktik|praxissemester/i, "Praktikum"], // Praktikum, Praktikant/in, Praktika, Industriepraktikum
  [/internship|\binterns?\b/i, "Internship"], // not "Internal" or "International"
];

// Placements that are not student internships: pupils' ones (school placements, the FOS year, Berufskolleg, the practical
// part of the Fachhochschulreife) and the practical year of a vocational qualification (Berufspraktikum, Anerkennungsjahr).
const NOT_FOR_STUDENTS = /(?<![\p{L}])fos(?![\p{L}])|fachoberschul|fachhochschulreife|berufskolleg|berufsoberschul|schul[\s-]?praktik|sch(?:ü|ue)ler|schnupper|bogy|berufsorientierung|berufsfelderkundung|orientierungspraktik|berufspraktik|anerkennungsjahr/iu;

/** Pflichtpraktikum, Praktikum or Internship from the title; "" when the title names no internship for students. */
export const internshipKind = (title) => {
  const text = String(title || "");
  return NOT_FOR_STUDENTS.test(text) ? "" : KINDS.find(([pattern]) => pattern.test(text))?.[1] || "";
};

/** "Berlin, Deutschland" and "Berlin" are both the city Berlin. */
export const cityOf = (location) => String(location || "").split(",")[0].trim();

// ------------------------------------------------------------ language

const LANGUAGES = { german: /deutsch\w*|german/gi, english: /englisch\w*|english/gi };
const CEFR = /\b([ABC][12])\b/;
const NO_GERMAN = /(kein(?:e)?\s+deutsch|deutsch\w*\s+nicht\s+(?:erforderlich|notwendig)|no\s+german\s+(?:is\s+)?(?:required|needed)|german\s+(?:is\s+)?not\s+(?:required|needed)|ohne\s+deutschkenntnisse)/i;
const PHRASES = [
  [/(verhandlungssicher|fließend|fliessend|muttersprach|fluent|native|sehr gute|ausgezeichnet|excellent|very good)/i, "C1"],
  [/(gute|good|solide|fundierte)/i, "B2"],
  [/(grundkenntnisse|grundlegende|basic)/i, "A2"],
];

/** Required level of "german" or "english": none, A1..C2, or "unknown". */
export function extractLanguageLevel(text, language) {
  const value = String(text);
  if (language === "german" && NO_GERMAN.test(value)) return "none";
  const other = language === "german" ? LANGUAGES.english : LANGUAGES.german;
  for (const match of value.matchAll(new RegExp(LANGUAGES[language]))) {
    // The level written right before the language ("B2 Deutsch") wins, then the words right after it.
    const before = value.slice(Math.max(0, match.index - 8), match.index);
    const adjacent = /\b([ABC][12])\s+(?:(?:in|auf)\s+)?$/.exec(before);
    if (adjacent) return adjacent[1];
    let after = value.slice(match.index + match[0].length, match.index + match[0].length + 40);
    const cut = after.search(new RegExp(`${other.source}|[;.\\n]`, "i"));
    if (cut >= 0) after = after.slice(0, cut);
    const level = CEFR.exec(after);
    if (level) return level[1];
    const around = `${value.slice(Math.max(0, match.index - 30), match.index)} ${after}`;
    for (const [pattern, mapped] of PHRASES) if (pattern.test(around)) return mapped;
  }
  return "unknown";
}

// ------------------------------------------------------------ country

const COUNTRY_WORDS = [
  [/(?<![\p{L}])(deutschland|germany)(?![\p{L}])/iu, "Germany"], [/(?<![\p{L}])(österreich|austria)(?![\p{L}])/iu, "Austria"],
  [/(?<![\p{L}])(schweiz|switzerland|suisse)(?![\p{L}])/iu, "Switzerland"], [/(?<![\p{L}])(luxemburg|luxembourg)(?![\p{L}])/iu, "Luxembourg"],
];
const TLDS = { de: "Germany", at: "Austria", ch: "Switzerland", lu: "Luxembourg" };

/** Country of a posting from its location text, its link, then a known German city. */
export function extractCountry({ location = "", text = "", url = "", germanCities = new Set() } = {}) {
  const named = (source) => COUNTRY_WORDS.find(([pattern]) => pattern.test(source))?.[1];
  // The stated location is the strongest evidence, the advert text the weakest: it may mention other countries.
  const fromLocation = named(location);
  if (fromLocation) return fromLocation;
  try { const tld = new URL(url).hostname.split(".").at(-1); if (TLDS[tld]) return TLDS[tld]; } catch { /* no usable link */ }
  const place = String(location).split(/[,/(]/)[0].trim().toLowerCase();
  if (place && germanCities.has(place)) return "Germany";
  return named(text) || "unknown";
}

// ------------------------------------------------------------ GJU rules

/** yes / no / unknown for each rule in data/gju-rules.json, and an overall meets / fails / check. */
export function gjuCheck(posting, rules) {
  const { minWeeks, minMonthlySalary } = rules.rules;
  const approved = new Set(rules.countries.filter(([, score]) => score >= 12).map(([name]) => name));
  const { weeks, pay, country } = posting;
  const weeksResult = !weeks ? "unknown" : weeks.min != null && weeks.min >= minWeeks ? "yes" : weeks.max != null && weeks.max < minWeeks ? "no" : "unknown";
  const payResult = !pay ? "unknown" : pay.min >= minMonthlySalary ? "yes" : pay.max < minMonthlySalary ? "no" : "unknown";
  const countryResult = approved.has(country) ? "approved" : country && country !== "unknown" ? "approval-needed" : "unknown";
  const overall = weeksResult === "no" || payResult === "no" ? "fails"
    : weeksResult === "yes" && payResult === "yes" && countryResult === "approved" ? "meets" : "check";
  return { weeks: weeksResult, pay: payResult, country: countryResult, overall };
}

// ------------------------------------------------------------ majors and skills

/**
 * Major ids whose job-title words appear in the title, or in the text: a short snippet needs two different words, a long
 * advert three, because a long text names every industry it deals with (a recruiting advert mentions logistics).
 * "Different" is counted by the first five letters, so a word and its translation (Logistik, Logistics) count once.
 */
export function tagMajors(title, snippet, majors) {
  const find = (kw, text) => new RegExp(`(?<![\\p{L}])${escape(kw)}`, "iu").test(text);
  const needed = String(snippet).length > 600 ? 3 : 2;
  return majors.filter((major) => {
    const words = [...new Set([...major.de, ...major.en])];
    if (words.some((kw) => find(kw, title))) return true;
    return new Set(words.filter((kw) => find(kw, snippet)).map((kw) => kw.toLowerCase().slice(0, 5))).size >= needed;
  }).map((major) => major.id);
}

/**
 * The skill names the board looks for: the profile editor's library (so a posting and a student's profile
 * use the same words), plus extra names, minus soft skills and language names that would match every advert.
 */
export function boardVocabulary(libraryGroups, extraNames = [], skip = []) {
  const skipped = new Set(skip.map((name) => name.toLowerCase()));
  const names = [...libraryGroups.flatMap((group) => group.skills), ...extraNames];
  return [...new Map(names.filter((name) => !skipped.has(name.toLowerCase())).map((name) => [name.toLowerCase(), name])).values()];
}

/** Short names and acronyms (C, R, SEA, SAP, .NET) match with their exact capitals so "SEA" does not find "sea". */
const exactCase = (name) => name.length <= 3 || (name === name.toUpperCase() && /[A-Z]/.test(name));

/**
 * Skills from a vocabulary found in the text, reported under the vocabulary's spelling.
 * `aliases` maps a vocabulary name to other ways an advert may write it ("Microsoft Excel": ["Excel"]).
 */
export function extractSkills(text, vocabulary, aliases = {}) {
  // "&" and "/3" after a name rule out "R&D" and "SAP R/3" as the language R.
  const found = (term) => new RegExp(`(?<![\\p{L}\\p{N}+#.])${escape(term)}(?![\\p{L}\\p{N}+#&]|/\\d)`, exactCase(term) ? "u" : "iu").test(text);
  return [...new Set(vocabulary)].filter((skill) => found(skill) || (aliases[skill] || []).some(found));
}

// ------------------------------------------------------------ one posting

/**
 * The published record for a search hit. Nothing from the advert text itself is kept, only the
 * facts derived from it, and no contact person or e-mail.
 */
export function toBoardPosting(hit, { majors, rules, germanCities, today, skills = {} }) {
  // hit.field is the source's own name for the job's field (the Arbeitsagentur's occupations): evidence like the title.
  const text = [hit.title, hit.field, hit.snippet, hit.description].filter(Boolean).join("\n");
  const country = extractCountry({ location: hit.location, text, url: hit.url, germanCities });
  const weeks = extractWeeks(text);
  const pay = extractPay(text);
  const key = jobMatchKey({ job_url: hit.url, company: hit.company, position: hit.title }) || hit.url;
  const vocabulary = skills.vocabulary || majors.flatMap((major) => major.skills);
  return {
    id: createHash("sha1").update(key).digest("hex").slice(0, 12),
    title: hit.title, company: hit.company || "", city: cityOf(hit.location), country, url: hit.url, source: hit.source || "",
    kind: internshipKind(hit.title), datePosted: hit.date_posted || "", firstSeen: today, lastSeen: today,
    majors: tagMajors(`${hit.title || ""} ${hit.field || ""}`, [hit.snippet, hit.description].filter(Boolean).join(" "), majors),
    skills: extractSkills(text, vocabulary, skills.aliases), weeks, pay,
    germanLevel: extractLanguageLevel(text, "german"), englishLevel: extractLanguageLevel(text, "english"),
    gju: gjuCheck({ weeks, pay, country }, rules),
  };
}
