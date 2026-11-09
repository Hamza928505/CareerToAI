/* The workspace board: the private board page's hero, filters and internship list, moved here and fed from the tracker.
 * Each tracker row is shown as an internship; the filters also drive the spreadsheet views (onFiltered), so every view
 * shows the same rows. Text from adverts is only ever set as text, never as HTML. */
import { Combo, norm } from "./board-combo.js";

const $ = (id) => document.getElementById(id);
const PAGE = 60;
const VIEW_KEY = "gjub-view";
const LEVELS = ["none", "A1", "A2", "B1", "B2", "C1", "C2"];
const LEVEL_NAMES = { A1: "Beginner", A2: "Elementary", B1: "Intermediate", B2: "Upper-intermediate", C1: "Advanced", C2: "Proficient" };
const GJU_LABELS = { meets: "Meets the rules", check: "Needs checking", fails: "Fails a rule" };
const GJU_ICONS = { meets: "fa-circle-check", check: "fa-triangle-exclamation", fails: "fa-circle-xmark" };
const LEGAL = /\b(gmbh|mbh|ag|se|kg|kgaa|ug|ohg|gbr|e\.v\.|co\.?|inc\.?|ltd\.?)(?=\s|$|,)/gi;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};
const icon = (classes) => { const i = el("i", `fa-solid ${classes}`); i.setAttribute("aria-hidden", "true"); return i; };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const day = (value) => (/^\d{4}-\d{2}-\d{2}/.test(value || "") ? String(value).slice(0, 10) : "");
const safeUrl = (url) => { try { const u = new URL(url); return u.protocol === "https:" || u.protocol === "http:" ? u.href : ""; } catch { return ""; } };
const initials = (name) => {
  const words = String(name || "").replace(LEGAL, " ").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words.length ? (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase() : "?";
};
const hue = (name) => [...String(name || "")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);

// ---------------------------------------------------------------- a tracker row read as an internship

/** "20–26 weeks", "26+ weeks", "up to 12 weeks", "6 months" -> { min, max } in weeks, or null when not stated. */
export function parseWeeks(text) {
  const s = String(text || "").toLowerCase();
  const n = [...s.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(",", ".")));
  if (!n.length) return null;
  const w = n.slice(0, 2).map((x) => Math.round(/month|monat/.test(s) ? x * 4.345 : x));
  if (/up to|bis zu|max/.test(s)) return { min: null, max: w[0] };
  if (w.length === 1 && /\+|at least|mindestens|min\./.test(s)) return { min: w[0], max: null };
  return { min: w[0], max: w[1] ?? w[0] };
}

/** "1200 EUR/month", "1.000–1.500 €", "unpaid" -> { min, max } EUR per month, or null. An hourly rate is not converted. */
export function parsePay(text, paid) {
  const s = String(text || "").toLowerCase();
  if (/unpaid|unbezahlt|unvergütet/.test(s) || (!s && paid === "No")) return { min: 0, max: 0 };
  if (/hour|stunde|\/\s*h\b/.test(s)) return null;
  const n = [...s.replace(/(\d)[.,](\d{3})\b/g, "$1$2").matchAll(/\d+/g)].map((m) => Number(m[0])).filter((x) => x > 0);
  if (!n.length) return null;
  const k = /year|jahr|annual|p\.\s?a\./.test(s) ? 1 / 12 : 1;
  const [a, b = a] = n.map((x) => Math.round(x * k));
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

const level = (text) => {
  const s = String(text || "");
  const cefr = s.match(/\b([ABC][12])\b/i);
  return cefr ? cefr[1].toUpperCase() : /\b(none|keine?|not required)\b/i.test(s) ? "none" : "unknown";
};

/** The tracker's GJU cell ("Meets", "Check: duration not stated", "Fails: under 20 weeks", "Not an internship"). */
function gjuOf(cell) {
  const text = String(cell || "");
  const at = text.indexOf(":");
  const label = (at < 0 ? text : text.slice(0, at)).trim();
  const overall = label === "Meets" ? "meets" : /^(Fails|Not an internship)/.test(label) ? "fails" : "check";
  return { overall, why: at < 0 ? (overall === "fails" ? label : text ? "" : "Not checked yet") : text.slice(at + 1).trim() };
}

/** Which AI searched for a posting, read from the data_source its search wrote. The job APIs and feeds are not an AI. */
export function foundBy(source) {
  const s = String(source || "");
  if (!s.trim()) return "Added by hand";
  if (/nvidia nim/i.test(s)) return "NVIDIA NIM";
  if (/jobsearchengine/i.test(s)) return "Search APIs";
  if (/claude|indeed|apify|cowork/i.test(s)) return "Claude";
  return "Search APIs";
}

/** The logo of an AI that searched (Claude, NVIDIA NIM), bundled with the page (assets/service-logos); "" for the rest, which keep their icon. */
const SERVICE_LOGO = { Claude: "anthropic", "NVIDIA NIM": "nvidia" };
export const serviceLogo = (by) => (SERVICE_LOGO[by] ? new URL(`./service-logos/${SERVICE_LOGO[by]}.png`, import.meta.url).href : "");

export function toPosting(row) {
  return {
    id: row.id, row,
    title: row.position || "Untitled role", company: row.company || "", city: row.city || "", kind: row.opportunity_type || "", url: row.job_url,
    skills: [...new Set(String(row.req_skills || "").split(/[,;\n•|]/).map((s) => s.trim()).filter((s) => s && s.length <= 40))],
    weeks: parseWeeks(row.duration), pay: parsePay(row.salary, row.paid),
    germanLevel: level(row.req_german), englishLevel: level(row.req_english),
    // Never dated by the day it was found: an old advert would look new (the board rule, `absorb` in lib/board-run.mjs).
    gju: gjuOf(row.gju_check), posted: day(row.date_posted),
    // A site lead: the one undated posting the NIM site sweep keeps for a site with no dated one. `found` is when the search found it.
    lead: !day(row.date_posted) && /site sweep/i.test(row.data_source || ""), found: day(row.date_found),
    // 0-100 fit with the profile, written by the search (AI-scored when asked, else the built-in comparison); null when never scored.
    score: String(row.match_score ?? "").trim() !== "" && Number.isFinite(Number(row.match_score)) ? Math.max(0, Math.min(100, Number(row.match_score))) : null, scoreWhy: row.why_match || "",
    status: row.status || "", apply: row.apply || "", applicant: row.applicant || "Me",
    by: foundBy(row.data_source), site: row.source_site || "",
  };
}

const formatWeeks = (w) => !w ? "not stated" : w.min == null ? `up to ${w.max} weeks` : w.max == null ? `${w.min}+ weeks` : w.min === w.max ? `${w.min} weeks` : `${w.min}–${w.max} weeks`;
const formatPay = (p) => !p ? "not stated" : p.max === 0 ? "unpaid" : `${p.min === p.max ? p.min : `${p.min}–${p.max}`} EUR`;

/** "Today", "3 days ago", "2 weeks ago", then the date. */
function ago(date) {
  const d = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(d)) return date || "Date unknown";
  const n = new Date();
  const days = Math.floor((Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) - d) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return date;
}

// ---------------------------------------------------------------- filtering

/** The search only ever adds postings from the last 7 days, so the board starts on the same window; "Any time" shows older rows. */
const RECENT_DAYS = 7;
const berlinDay = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });

export const defaultFilters = () => ({
  q: "", skills: [], skillMode: "all", statuses: [], cities: [], kinds: [], gju: "", apply: "", applicant: "",
  german: "", english: "", minWeeks: "", minPay: "", maxPay: "", from: "", to: "", by: "", sites: [], recent: String(RECENT_DAYS),
});

function activeCount(f) {
  let n = f.q.trim() ? 1 : 0;
  for (const k of ["skills", "statuses", "cities", "kinds", "sites"]) if (f[k].length) n++;
  for (const k of ["gju", "apply", "applicant", "german", "english", "minWeeks", "by", "recent"]) if (f[k] !== "") n++;
  if (f.minPay !== "" || f.maxPay !== "") n++;
  if (f.from || f.to) n++;
  return n;
}

/** A level filter lets through postings whose requirement the student meets, plus those that state none. */
const levelOk = (required, mine) => !mine || required === "unknown" || required === "none" || LEVELS.indexOf(required) <= LEVELS.indexOf(mine);
const num = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

/** The postings that pass every filter; `skip` leaves one dimension out, which is how a dropdown counts its own choices. */
export function applyFilters(postings, f, skip) {
  const tokens = norm(f.q).trim().split(/\s+/).filter(Boolean);
  const set = (list, map) => (list.length ? new Set(map ? list.map(map) : list) : null);
  const statuses = set(f.statuses), cities = set(f.cities, norm), kinds = set(f.kinds), sites = set(f.sites);
  const oldest = f.recent ? berlinDay(Number(f.recent)) : "";
  const skills = f.skills.map((s) => s.toLowerCase());
  const minPay = num(f.minPay), maxPay = num(f.maxPay), minWeeks = num(f.minWeeks);
  return postings.filter((p) => {
    if (tokens.length) {
      const hay = norm(`${p.title} ${p.company} ${p.city} ${p.skills.join(" ")}`);
      if (!tokens.every((t) => hay.includes(t))) return false;
    }
    if (skip !== "statuses" && statuses && !statuses.has(p.status)) return false;
    if (skip !== "cities" && cities && !cities.has(norm(p.city))) return false;
    if (skip !== "kinds" && kinds && !kinds.has(p.kind)) return false;
    if (skip !== "skills" && skills.length) {
      const have = p.skills.map((s) => s.toLowerCase());
      if (!(f.skillMode === "any" ? skills.some((s) => have.includes(s)) : skills.every((s) => have.includes(s)))) return false;
    }
    if (skip !== "gju" && f.gju && (f.gju === "hide-fails" ? p.gju.overall === "fails" : p.gju.overall !== f.gju)) return false;
    if (skip !== "apply" && f.apply && (f.apply === "_none" ? p.apply : p.apply !== f.apply)) return false;
    if (skip !== "applicant" && f.applicant && p.applicant !== f.applicant) return false;
    if (skip !== "by" && f.by && p.by !== f.by) return false;
    if (skip !== "sites" && sites && !sites.has(p.site)) return false;
    // "Last 7 days" keeps postings with a known posting date that recent, plus a site lead for the week after the search found it
    // (it shows "Date unknown"); any other undated row is never counted as new.
    if (oldest && !((p.posted && p.posted >= oldest) || (p.lead && p.found >= oldest))) return false;
    if (!levelOk(p.germanLevel, f.german) || !levelOk(p.englishLevel, f.english)) return false;
    // A pay range or a minimum duration only keeps postings that state them.
    if (minPay != null || maxPay != null) {
      if (!p.pay || (minPay != null && p.pay.max < minPay) || (maxPay != null && p.pay.min > maxPay)) return false;
    }
    if (minWeeks != null) {
      const top = p.weeks ? p.weeks.max ?? p.weeks.min : null;
      if (top == null || top < minWeeks) return false;
    }
    if (f.from && !(p.posted && p.posted >= f.from)) return false;
    if (f.to && !(p.posted && p.posted <= f.to)) return false;
    return true;
  });
}

function sortPostings(list, key) {
  const weeks = (p) => (p.weeks ? p.weeks.max ?? p.weeks.min : -1);
  const pay = (p) => (p.pay ? p.pay.max : -1);
  const by = {
    new: (a, b) => b.posted.localeCompare(a.posted), // undated rows go last, in the workbook's order
    company: (a, b) => (a.company || "~").localeCompare(b.company || "~"),
    weeks: (a, b) => weeks(b) - weeks(a),
    pay: (a, b) => pay(b) - pay(a),
    fit: (a, b) => (b.score ?? -1) - (a.score ?? -1), // unscored rows go last
  };
  return list.slice().sort(by[key] || by.new);
}

const valuesOf = {
  skills: (p) => p.skills, statuses: (p) => (p.status ? [p.status] : []), cities: (p) => (p.city ? [norm(p.city)] : []),
  kinds: (p) => (p.kind ? [p.kind] : []), gju: (p) => [p.gju.overall], apply: (p) => [p.apply || "_none"], applicant: (p) => [p.applicant],
  by: (p) => [p.by], sites: (p) => (p.site ? [p.site] : []),
};
function facetCounts(postings, f, dim) {
  const map = new Map();
  applyFilters(postings, f, dim).forEach((p) => valuesOf[dim](p).forEach((v) => map.set(v, (map.get(v) || 0) + 1)));
  return map;
}

// ---------------------------------------------------------------- the board

/**
 * statusField(row) -> the tracker's Status select for that row; info(row) opens every field of the row;
 * onFiltered(rows, reset) gets the filtered rows after every change, for the spreadsheet views.
 */
export function createBoard({ Swal, dialog, rules, statusField, info, onFiltered }) {
  const state = { all: [], byId: new Map(), f: defaultFilters(), sort: "new", view: "table", filtered: [], shown: 0, selected: new Set(), body: null, cityNames: {}, loaded: false };
  const combos = {};
  const view = $("tracker-column-view");
  const isBoard = () => view.value === "results";
  const minWeeks = rules.minWeeks || 20;
  const maxMonths = rules.maxRecognisedMonths || 6;

  // ---------------------------------------------------------- windows (the workspace's SweetAlert2 and its look)

  const toast = (kind, title) => Swal.fire({ toast: true, position: "bottom-end", icon: kind, titleText: title, showConfirmButton: false, timer: 2800, timerProgressBar: true });
  const notice = (kind, title, text) => Swal.fire({ ...dialog, icon: kind, titleText: title, text, confirmButtonText: "OK" });
  async function invalid({ title, html, focus }) {
    await Swal.fire({ ...dialog, icon: "error", titleText: title, html, confirmButtonText: "Fix it", focusConfirm: true });
    focus?.();
  }

  function showHelp() {
    const list = el("ul", "gb-help-list");
    const add = (iconClass, title, text) => { const li = el("li"); const body = el("div"); body.append(el("b", null, title), el("span", null, text)); li.append(icon(iconClass), body); list.append(li); };
    add("fa-hourglass-half", `At least ${minWeeks} weeks`, `The compulsory internship (Pflichtpraktikum, full time) must last at least ${minWeeks} weeks. Up to ${maxMonths} months are recognised; a longer one needs checking.`);
    add("fa-earth-europe", "Germany, or a country approved as easily", "Austria, Switzerland and Luxembourg are approved easily. Any other country needs approval from your dean or the president.");
    add("fa-scale-balanced", "Pay and language are not rules", `Unpaid is allowed and pay is often settled at the interview. Employers take students at their level. ${rules.minMonthlySalary || 861} EUR a month only matters for a visa extension.`);
    add("fa-circle-check", GJU_LABELS.meets, "The duration is stated and inside the limits, in an approved country.");
    add("fa-triangle-exclamation", GJU_LABELS.check, "Something is not stated, longer than recognised, or the country needs approval. Open the advert and confirm it.");
    add("fa-circle-xmark", GJU_LABELS.fails, `A stated duration under ${minWeeks} weeks, or not an internship. The badge says which.`);
    const root = el("div", "gb");
    root.append(list, el("p", "gb-sub", "Durations and countries are read from the advert text by fixed rules, never guessed. Always confirm with your department before relying on a posting."));
    return Swal.fire({ ...dialog, titleText: "How the GJU check works", html: root, width: 600, confirmButtonText: "Got it", showCloseButton: true });
  }

  // ---------------------------------------------------------- the popup menu (downloads)

  const menu = el("div", "gb-menu");
  menu.id = "board-menu"; menu.setAttribute("role", "menu"); menu.hidden = true;
  document.body.append(menu);
  let menuAnchor = null;
  function closeMenu(returnFocus = false) {
    if (menu.hidden) return;
    menu.hidden = true;
    if (menuAnchor) { menuAnchor.setAttribute("aria-expanded", "false"); if (returnFocus) menuAnchor.focus(); }
    menuAnchor = null;
  }
  function showMenu(anchor, items) {
    closeMenu(false);
    menu.replaceChildren();
    for (const item of items) {
      const node = el("button");
      node.type = "button"; node.setAttribute("role", "menuitem");
      node.append(icon(item.icon), document.createTextNode(item.label), el("small", null, String(item.small)));
      node.disabled = Boolean(item.disabled);
      node.addEventListener("click", () => { closeMenu(false); item.onClick(); });
      menu.append(node);
    }
    menu.hidden = false;
    menuAnchor = anchor;
    anchor.setAttribute("aria-expanded", "true");
    const r = anchor.getBoundingClientRect();
    menu.style.top = `${Math.max(8, Math.min(r.bottom + 6, window.innerHeight - menu.offsetHeight - 8))}px`;
    menu.style.left = `${Math.max(8, Math.min(r.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8))}px`;
    (menu.querySelector("button:not(:disabled)") || menu).focus();
  }
  document.addEventListener("pointerdown", (e) => { if (menuAnchor && !menu.contains(e.target) && !menuAnchor.contains(e.target)) closeMenu(false); });
  document.addEventListener("keydown", (e) => {
    if (menu.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); closeMenu(true); }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const items = [...menu.querySelectorAll("button:not(:disabled)")];
      items[(items.indexOf(document.activeElement) + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }
  });
  window.addEventListener("resize", () => closeMenu(false));
  document.addEventListener("scroll", (e) => { if (!menu.contains(e.target)) closeMenu(false); }, true);

  // ---------------------------------------------------------- the filter controls

  const levelItems = [{ value: "", label: "Any level", icon: "fa-infinity" }, ...LEVELS.filter((l) => l !== "none").map((l) => ({ value: l, label: `${l} · ${LEVEL_NAMES[l]}` }))];
  const set = (key) => (value) => { state.f[key] = value; refresh(); };

  function buildCombos(enums) {
    const values = (name) => (enums[name] || []).map((item) => (typeof item === "string" ? item : item.value));
    combos.skills = new Combo($("board-f-skills"), {
      id: "board-c-skills", label: "Skills", icon: "fa-screwdriver-wrench", multiple: true, placeholder: "Any skill", hideZero: true, items: [], onChange: set("skills"),
      footer: (slot) => {
        slot.append(el("span", null, "Match"));
        const seg = el("div", "gb-seg");
        seg.setAttribute("role", "group");
        seg.setAttribute("aria-label", "How many of the chosen skills must be in the advert");
        for (const [mode, text] of [["all", "All"], ["any", "Any"]]) {
          const b = el("button", null, text);
          b.type = "button"; b.dataset.mode = mode;
          b.addEventListener("click", () => { state.f.skillMode = mode; syncSkillMode(); refresh(); });
          seg.append(b);
        }
        slot.append(seg);
      },
    });
    combos.statuses = new Combo($("board-f-status"), { id: "board-c-status", label: "Status", icon: "fa-list-check", multiple: true, placeholder: "Any status", items: values("statuses").map((v) => ({ value: v, label: v })), onChange: set("statuses") });
    combos.cities = new Combo($("board-f-city"), { id: "board-c-city", label: "City", icon: "fa-location-dot", multiple: true, placeholder: "Any city", hideZero: true, items: [], onChange: set("cities") });
    combos.kinds = new Combo($("board-f-kind"), { id: "board-c-kind", label: "Kind", icon: "fa-briefcase", multiple: true, placeholder: "Any kind", items: values("opportunityTypes").map((v) => ({ value: v, label: v })), onChange: set("kinds") });
    combos.gju = new Combo($("board-f-gju"), {
      id: "board-c-gju", label: "GJU rules", icon: "fa-scale-balanced", placeholder: "All internships", value: "", onChange: set("gju"),
      items: [{ value: "", label: "All internships", icon: "fa-list" }, ...Object.entries(GJU_LABELS).map(([value, label]) => ({ value, label, icon: GJU_ICONS[value] })), { value: "hide-fails", label: "Hide the ones that fail", icon: "fa-eye-slash" }],
    });
    combos.apply = new Combo($("board-f-apply"), {
      id: "board-c-apply", label: "Apply?", icon: "fa-thumbs-up", placeholder: "Any decision", value: "", onChange: set("apply"),
      items: [{ value: "", label: "Any decision", icon: "fa-list" }, ...values("applyDecisions").map((v) => ({ value: v, label: v })), { value: "_none", label: "Not decided yet", icon: "fa-circle-question" }],
    });
    combos.applicant = new Combo($("board-f-applicant"), {
      id: "board-c-applicant", label: "Who applies", icon: "fa-user-pen", placeholder: "Anyone", value: "", onChange: set("applicant"),
      items: [{ value: "", label: "Anyone", icon: "fa-users" }, ...(values("applicants").length ? values("applicants") : ["Me", "Assistant"]).map((v) => ({ value: v, label: v }))],
    });
    combos.by = new Combo($("board-f-by"), {
      id: "board-c-by", label: "Searched by", icon: "fa-robot", placeholder: "Any", value: "", onChange: set("by"),
      items: [{ value: "", label: "Anyone", icon: "fa-list" }, { value: "Claude", label: "Claude (Indeed, StepStone, Arbeitsagentur)", icon: "fa-plug", logo: serviceLogo("Claude") }, { value: "NVIDIA NIM", label: "NVIDIA NIM (LinkedIn and other boards)", icon: "fa-microchip", logo: serviceLogo("NVIDIA NIM") }, { value: "Search APIs", label: "Job APIs and feeds (no AI)", icon: "fa-rss" }, { value: "Added by hand", label: "Added by hand", icon: "fa-pen" }],
    });
    combos.sites = new Combo($("board-f-sites"), { id: "board-c-sites", label: "Site", icon: "fa-globe", multiple: true, placeholder: "Any site", hideZero: true, items: [], onChange: set("sites") });
    combos.recent = new Combo($("board-f-recent"), {
      id: "board-c-recent", label: "Posted", icon: "fa-clock", placeholder: "Any time", value: String(RECENT_DAYS), onChange: set("recent"),
      items: [{ value: String(RECENT_DAYS), label: `Last ${RECENT_DAYS} days`, icon: "fa-clock" }, { value: "", label: "Any time", icon: "fa-infinity" }],
    });
    combos.german = new Combo($("board-f-german"), { id: "board-c-german", label: "My German level", icon: "fa-language", placeholder: "Any level", items: levelItems, value: "", onChange: set("german") });
    combos.english = new Combo($("board-f-english"), { id: "board-c-english", label: "My English level", icon: "fa-comments", placeholder: "Any level", items: levelItems, value: "", onChange: set("english") });
    combos.sort = new Combo($("board-f-sort"), {
      id: "board-c-sort", label: "Sort by", icon: "fa-arrow-down-wide-short", compact: true, placeholder: "Newest first", value: "new", onChange: (v) => { state.sort = v || "new"; refresh(); },
      items: [{ value: "new", label: "Newest first", icon: "fa-clock" }, { value: "company", label: "Company A–Z", icon: "fa-arrow-down-a-z" }, { value: "weeks", label: "Longest duration", icon: "fa-hourglass-half" }, { value: "pay", label: "Highest pay", icon: "fa-euro-sign" }, { value: "fit", label: "Best fit for me", icon: "fa-bullseye" }],
    });
    syncSkillMode();
  }

  /** The lists that come from the rows themselves: skills and cities, most common first. */
  function rowItems() {
    const skillCounts = new Map();
    state.all.forEach((p) => p.skills.forEach((s) => skillCounts.set(s, (skillCounts.get(s) || 0) + 1)));
    combos.skills.setItems([...skillCounts.keys()].sort((a, b) => skillCounts.get(b) - skillCounts.get(a) || a.localeCompare(b)).map((s) => ({ value: s, label: s })));
    const cityForms = new Map();
    state.all.forEach((p) => {
      if (!p.city) return;
      const e = cityForms.get(norm(p.city)) || { n: 0, forms: new Map() };
      e.n++; e.forms.set(p.city, (e.forms.get(p.city) || 0) + 1); cityForms.set(norm(p.city), e);
    });
    const cityItems = [...cityForms.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0])).map(([k, e]) => ({ value: k, label: [...e.forms.entries()].sort((a, b) => b[1] - a[1])[0][0] }));
    cityItems.forEach((c) => { state.cityNames[c.value] = c.label; });
    combos.cities.setItems(cityItems);
    const siteCounts = new Map(), siteDomain = new Map();
    state.all.forEach((p) => {
      if (!p.site) return;
      siteCounts.set(p.site, (siteCounts.get(p.site) || 0) + 1);
      if (!siteDomain.has(p.site)) siteDomain.set(p.site, siteDomainOf(p.site, p.url)); // the same icon the row's site chip shows
    });
    combos.sites.setItems([...siteCounts.keys()].sort((a, b) => siteCounts.get(b) - siteCounts.get(a) || a.localeCompare(b)).map((s) => ({ value: s, label: s, logo: favicon(siteDomain.get(s)) })));
    for (const key of ["skills", "cities", "sites"]) state.f[key] = combos[key].value;
  }

  const syncSkillMode = () => document.querySelectorAll("#board-f-skills .gb-seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === state.f.skillMode)));

  function updateFacets() {
    for (const key of ["skills", "statuses", "cities", "kinds", "apply", "applicant", "by", "sites"]) {
      const counts = facetCounts(state.all, state.f, key);
      if (key === "apply" || key === "applicant" || key === "by") counts.set("", applyFilters(state.all, state.f, key).length);
      combos[key].setCounts(counts);
    }
    const g = facetCounts(state.all, state.f, "gju");
    const meets = g.get("meets") || 0, check = g.get("check") || 0, fails = g.get("fails") || 0;
    combos.gju.setCounts(new Map([["", meets + check + fails], ["meets", meets], ["check", check], ["fails", fails], ["hide-fails", meets + check]]));
  }

  // ---------------------------------------------------------- validation of the typed fields

  const FIELD_KEY = { "board-min-weeks": "minWeeks", "board-min-pay": "minPay", "board-max-pay": "maxPay", "board-from": "from", "board-to": "to" };
  const GROUPS = [["board-min-weeks"], ["board-min-pay", "board-max-pay"], ["board-from", "board-to"]];
  let alerting = false;

  function check(id) {
    const box = $(id);
    const text = box.value.trim();
    const n = text === "" ? null : Number(text);
    if (box.validity?.badInput) return { title: "That is not a number", html: "Type digits only, for example <b>20</b>." };
    if (id === "board-min-weeks" && n != null && (!Number.isInteger(n) || n < 1 || n > 104)) return { title: "Check the duration", html: "Enter a whole number of weeks between <b>1</b> and <b>104</b>." };
    if ((id === "board-min-pay" || id === "board-max-pay") && n != null && (!Number.isFinite(n) || n < 0 || n > 20000)) return { title: "Check the pay", html: "Enter an amount between <b>0</b> and <b>20&nbsp;000</b> € per month." };
    if (id === "board-min-pay" || id === "board-max-pay") {
      const lo = num($("board-min-pay").value.trim()), hi = num($("board-max-pay").value.trim());
      if (lo != null && hi != null && lo > hi) return { title: "Check the pay range", html: `The minimum (<b>${lo}</b> €) is higher than the maximum (<b>${hi}</b> €). Make the minimum smaller or the maximum larger.` };
    }
    if (id === "board-from" || id === "board-to") {
      const a = $("board-from").value, b = $("board-to").value;
      if (a && b && a > b) return { title: "Check the dates", html: `“Posted from” (<b>${a}</b>) is after “Posted until” (<b>${b}</b>). Swap them or pick another day.` };
    }
    return null;
  }
  const mark = (id, problem) => { if (problem) $(id).setAttribute("aria-invalid", "true"); else $(id).removeAttribute("aria-invalid"); };

  function wireFields() {
    let timer;
    $("board-q").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { state.f.q = $("board-q").value; refresh(); }, 140); });
    for (const group of GROUPS) {
      for (const id of group) {
        // while typing, a good value filters at once and a bad one is only marked; on leaving the field, a window says what to fix
        $(id).addEventListener("input", () => {
          for (const other of group) { const problem = check(other); mark(other, problem); if (!problem) state.f[FIELD_KEY[other]] = $(other).value.trim(); }
          refresh();
        });
        $(id).addEventListener("change", async () => {
          const problem = check(id);
          if (!problem || alerting) return;
          alerting = true;
          try { await invalid({ ...problem, focus: () => { $(id).focus(); $(id).select?.(); } }); } finally { alerting = false; }
        });
      }
    }
  }

  // ---------------------------------------------------------- active filter chips

  function syncControls() {
    const f = state.f;
    for (const key of ["skills", "statuses", "cities", "kinds", "gju", "apply", "applicant", "german", "english", "by", "sites", "recent"]) combos[key].setValue(f[key], { silent: true });
    $("board-q").value = f.q;
    for (const [id, key] of Object.entries(FIELD_KEY)) { $(id).value = f[key]; mark(id, null); }
    syncSkillMode();
  }
  function change(key, value) { state.f[key] = value; syncControls(); refresh(); }
  // "Clear all" also lifts the 7-day window, so it really shows every internship.
  function clearAll() { state.f = { ...defaultFilters(), recent: "" }; syncControls(); refresh(); }

  function chips() {
    const f = state.f;
    const out = [];
    const add = (iconClass, label, remove) => out.push({ iconClass, label, remove });
    const without = (key, value) => () => change(key, f[key].filter((x) => x !== value));
    if (f.q.trim()) add("fa-magnifying-glass", `“${f.q.trim()}”`, () => change("q", ""));
    f.skills.forEach((s) => add("fa-screwdriver-wrench", s, without("skills", s)));
    if (f.skills.length > 1 && f.skillMode === "any") add("fa-code-branch", "Any of the skills", () => { f.skillMode = "all"; syncControls(); refresh(); });
    f.statuses.forEach((s) => add("fa-list-check", s, without("statuses", s)));
    f.cities.forEach((c) => add("fa-location-dot", state.cityNames[c] || c, without("cities", c)));
    f.kinds.forEach((k) => add("fa-briefcase", k, without("kinds", k)));
    if (f.gju) add("fa-scale-balanced", f.gju === "hide-fails" ? "Hiding the ones that fail" : GJU_LABELS[f.gju], () => change("gju", ""));
    if (f.apply) add("fa-thumbs-up", f.apply === "_none" ? "Apply? not decided" : `Apply? ${f.apply}`, () => change("apply", ""));
    if (f.applicant) add("fa-user-pen", `${f.applicant} applies`, () => change("applicant", ""));
    if (f.by) add("fa-robot", `Searched by ${f.by}`, () => change("by", ""));
    f.sites.forEach((s) => add("fa-globe", s, without("sites", s)));
    if (f.recent) add("fa-clock", `Posted in the last ${f.recent} days`, () => change("recent", ""));
    if (f.german) add("fa-language", `My German: ${f.german}`, () => change("german", ""));
    if (f.english) add("fa-comments", `My English: ${f.english}`, () => change("english", ""));
    if (f.minWeeks !== "") add("fa-hourglass-half", `At least ${f.minWeeks} weeks`, () => change("minWeeks", ""));
    if (f.minPay !== "" || f.maxPay !== "") add("fa-euro-sign", f.minPay !== "" && f.maxPay !== "" ? `Pay ${f.minPay}–${f.maxPay} €` : f.minPay !== "" ? `Pay from ${f.minPay} €` : `Pay up to ${f.maxPay} €`, () => { f.minPay = ""; f.maxPay = ""; syncControls(); refresh(); });
    if (f.from) add("fa-calendar-days", `Posted from ${f.from}`, () => change("from", ""));
    if (f.to) add("fa-calendar-check", `Posted until ${f.to}`, () => change("to", ""));
    return out;
  }

  function renderChips() {
    const row = $("board-active-row");
    const list = chips();
    row.replaceChildren();
    if (!list.length) { row.append(el("span", "gb-none", "No filters yet, so every internship is shown.")); return; }
    for (const c of list) {
      const chip = el("span", "gb-chip");
      const lead = icon(c.iconClass);
      lead.classList.add("gb-lead-i");
      const remove = el("button");
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove filter: ${c.label}`);
      remove.append(icon("fa-xmark"));
      remove.addEventListener("click", c.remove);
      chip.append(lead, document.createTextNode(c.label), remove);
      row.append(chip);
    }
    const clear = el("button", "gb-btn gb-btn-ghost gb-btn-sm");
    clear.type = "button";
    clear.append(icon("fa-filter-circle-xmark"), document.createTextNode("Clear all"));
    clear.addEventListener("click", clearAll);
    row.append(clear);
  }

  // ---------------------------------------------------------- the list

  const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, "").split(".").slice(-2).join("."); } catch { return ""; } };
  const favicon = (domain) => (domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : "");
  /** An <img> that removes itself when it fails to load, so the text under it shows instead. */
  function logoImg(src, className) {
    const img = el("img", className);
    Object.assign(img, { src, alt: "", loading: "lazy", referrerPolicy: "no-referrer" });
    img.addEventListener("error", () => img.remove());
    return img;
  }
  /** The company's own logo when the source gave one (StepStone), else its website's icon, else initials. */
  function avatar(name, row = {}) {
    const a = el("span", "gb-avatar", initials(name));
    a.style.setProperty("--h", String(hue(name)));
    a.setAttribute("aria-hidden", "true");
    const logo = /^https:\/\//.test(row.company_logo || "") ? row.company_logo : favicon(hostOf(row.website));
    // Loaded off-page first: initials stay until the image really arrives (a detached <img> still loads).
    if (logo) { const img = logoImg(logo, "gb-logo"); img.addEventListener("load", () => { a.textContent = ""; a.classList.add("has-logo"); a.append(img); }, { once: true }); }
    return a;
  }
  /** Indeed's short links hide the real host, so its name decides; every other site is its link's host. */
  const siteDomainOf = (site, url) => (/indeed/i.test(site) ? "indeed.com" : hostOf(url));
  /** The site the posting came from: its icon and name. */
  function siteChip(row) {
    if (!row.source_site) return null;
    const chip = el("span", "gb-tag site");
    const domain = siteDomainOf(row.source_site, row.job_url);
    if (domain) chip.append(logoImg(favicon(domain), "gb-site-logo"));
    chip.append(document.createTextNode(row.source_site));
    return chip;
  }
  /** How the posting was found, read from the data_source the search wrote. */
  function wayChip(row) {
    const text = String(row.data_source || "");
    const [label, iconClass] = /apify/i.test(text) ? ["Apify", "fa-cloud"] : /indeed connector|cowork/i.test(text) ? ["Indeed MCP", "fa-plug"]
      : /unverified|discovery/i.test(text) ? ["Search lead", "fa-magnifying-glass"] : /JobSearchEngine|api|rss/i.test(text) ? ["Free API", "fa-rss"] : ["", ""];
    if (!label) return null;
    const chip = el("span", "gb-tag way");
    chip.title = `Found through: ${text}`;
    chip.append(icon(iconClass), document.createTextNode(label));
    return chip;
  }
  /** Which AI searched for the posting (Claude, NVIDIA NIM), or that no AI did. */
  function byChip(p) {
    const [iconClass, title] = p.by === "Claude" ? ["fa-plug", "Searched by Claude, through its Indeed or Apify connector"]
      : p.by === "NVIDIA NIM" ? ["fa-microchip", "Searched by an NVIDIA NIM model through search APIs; Claude spent no tokens on it"]
        : p.by === "Search APIs" ? ["fa-rss", "Job APIs and feeds, no AI"] : ["fa-pen", "Added by hand"];
    const chip = el("span", `gb-tag by ${p.by === "NVIDIA NIM" ? "nim" : p.by === "Claude" ? "claude" : ""}`.trim());
    chip.title = title;
    const logo = serviceLogo(p.by);
    chip.append(logo ? logoImg(logo, "gb-site-logo") : icon(iconClass), document.createTextNode(p.by));
    return chip;
  }
  function stat(iconClass, text, tone) {
    const s = el("span", `gb-stat ${tone}`);
    if (iconClass) s.append(icon(iconClass));
    s.append(document.createTextNode(text));
    return s;
  }
  function titleLink(p) {
    const href = safeUrl(p.url);
    if (!href) return el("span", "gb-title", p.title);
    const a = el("a", "gb-title", p.title);
    Object.assign(a, { href, target: "_blank", rel: "noopener noreferrer" });
    a.append(icon("fa-arrow-up-right-from-square"));
    return a;
  }
  function tags(p, withSkills) {
    const row = el("div", "gb-tags");
    if (p.kind) row.append(el("span", "gb-tag kind", p.kind));
    row.append(...[siteChip(p.row), byChip(p), wayChip(p.row)].filter(Boolean));
    if (withSkills) {
      p.skills.slice(0, 4).forEach((s) => row.append(el("span", "gb-tag skill", s)));
      if (p.skills.length > 4) row.append(el("span", "gb-tag skill", `+${p.skills.length - 4}`));
    }
    return row;
  }
  function langPill(code, lvl) {
    const pill = el("span", "gb-lang" + (lvl === "unknown" ? " unknown" : ""));
    pill.append(el("small", null, code), document.createTextNode(lvl === "none" ? "none" : lvl !== "unknown" ? lvl : "?"));
    const name = code === "DE" ? "German" : "English";
    pill.title = lvl === "none" ? `No ${name} required` : lvl !== "unknown" ? `${name} level ${lvl}` : `${name} level not stated`;
    return pill;
  }
  /** The 0-100 fit as a coloured pill; the reason is its tooltip. */
  function fitPill(p) {
    const tone = p.score == null ? "unknown" : p.score >= 70 ? "high" : p.score >= 45 ? "mid" : "low";
    const pill = el("span", `gb-fit ${tone}`, p.score == null ? "—" : `${p.score}%`);
    pill.title = p.score == null ? "Not scored: the title and advert did not look like an IT role" : `Fit with your profile: ${p.score}%. ${p.scoreWhy}`;
    return pill;
  }
  function langs(p) { const box = el("div", "gb-langs"); box.append(langPill("DE", p.germanLevel), langPill("EN", p.englishLevel)); return box; }
  function gjuBadge(p) {
    const box = el("div", "gb-verdict");
    const b = el("button", `gb-badge ${p.gju.overall}`);
    b.type = "button";
    b.append(icon(GJU_ICONS[p.gju.overall]), document.createTextNode(GJU_LABELS[p.gju.overall]));
    b.setAttribute("aria-label", `${GJU_LABELS[p.gju.overall]}${p.gju.why ? `: ${p.gju.why}` : ""}. Show all information on ${p.title}`);
    b.dataset.action = "info";
    box.append(b);
    if (p.gju.why) box.append(el("small", "gb-why", p.gju.why));
    return box;
  }
  /** Duration against the GJU limits; pay is not a rule, so it has no colour of its own. */
  const weeksTone = (w) => (!w ? "unknown" : w.min != null && w.min >= minWeeks ? "ok" : w.max != null && w.max < minWeeks ? "bad" : "warn");
  function infoButton(p) {
    const b = el("button", "gb-row-info");
    b.type = "button"; b.dataset.action = "info"; b.title = "All information";
    b.setAttribute("aria-label", `All information: ${p.title}, ${p.company || "company not stated"}`);
    b.append(icon("fa-circle-info"));
    return b;
  }
  function pick(p) {
    const box = el("input", "gb-check");
    box.type = "checkbox";
    box.checked = state.selected.has(p.id);
    box.setAttribute("aria-label", `Tick ${p.title}`);
    return box;
  }
  function status(p) {
    const select = statusField(p.row);
    select.classList.add("gb-status");
    return select;
  }

  function rowEl(p, i) {
    const tr = el("tr", state.selected.has(p.id) ? "picked" : "");
    tr.dataset.id = p.id;
    tr.style.setProperty("--i", String(i));
    const cell = (className, ...children) => { const td = el("td", className); td.append(...children); return td; };
    const company = el("div", "gb-company");
    company.append(avatar(p.company, p.row), el("span", "name", p.company || "Company not stated"));
    tr.append(
      cell("c-check", pick(p)), cell("c-main", titleLink(p), tags(p, false)), cell("c-company", company), cell("c-city", document.createTextNode(p.city || "—")),
      cell("c-dur", stat("fa-hourglass-half", formatWeeks(p.weeks), weeksTone(p.weeks))), cell("c-pay", stat("fa-euro-sign", formatPay(p.pay), p.pay ? "" : "unknown")),
      cell("c-lang", langs(p)), cell("c-fit", fitPill(p)), cell("c-gju", gjuBadge(p)), cell("c-found", el("span", "gb-when", ago(p.posted))), cell("c-status", status(p)), cell("c-act", infoButton(p)),
    );
    return tr;
  }

  function cardEl(p, i) {
    const card = el("article", "gb-card-item" + (state.selected.has(p.id) ? " picked" : ""));
    card.dataset.id = p.id;
    card.style.setProperty("--i", String(i));
    const top = el("div", "gb-card-top");
    const who = el("div", "who");
    who.append(el("span", "company-name", p.company || "Company not stated"), el("span", "gb-sub", p.city || "Place not stated"));
    top.append(avatar(p.company, p.row), who, pick(p));
    const facts = el("dl", "gb-facts");
    const fact = (iconClass, label, node) => { const d = el("div"); const dt = el("dt"); dt.append(icon(iconClass), document.createTextNode(label)); const dd = el("dd"); dd.append(node); d.append(dt, dd); facts.append(d); };
    fact("fa-hourglass-half", "Duration", stat(null, formatWeeks(p.weeks), weeksTone(p.weeks)));
    fact("fa-euro-sign", "Pay", stat(null, formatPay(p.pay), p.pay ? "" : "unknown"));
    fact("fa-language", "Languages", langs(p));
    fact("fa-bullseye", "Fit", fitPill(p));
    fact("fa-clock", "Posted", el("span", "gb-when", ago(p.posted)));
    const foot = el("div", "gb-card-foot");
    foot.append(gjuBadge(p), status(p), infoButton(p));
    const heading = el("h3");
    heading.append(titleLink(p));
    card.append(top, heading, tags(p, true), facts, foot);
    return card;
  }

  function createContainer() {
    if (state.view === "cards") { const grid = el("div", "gb-cards"); return { root: grid, body: grid }; }
    const card = el("div", "gb-table-card");
    const scroll = el("div", "gb-table-scroll");
    const table = el("table", "gb-table");
    table.setAttribute("aria-label", "Internships");
    const head = el("tr");
    const th = (text, className) => { const h = el("th", className); h.scope = "col"; if (text) h.textContent = text; return h; };
    const first = th("", "c-check");
    first.append(el("span", "gb-sr", "Tick"));
    const last = th("", "c-act");
    last.append(icon("fa-circle-info"), el("span", "gb-sr", "All information"));
    head.append(first, th("Position"), th("Company"), th("City"), th("Duration"), th("Pay / month"), th("Languages"), th("Fit"), th("GJU rules"), th("Posted"), th("Status"), last);
    const thead = el("thead");
    thead.append(head);
    const body = el("tbody");
    table.append(thead, body);
    scroll.append(table);
    card.append(scroll);
    return { root: card, body };
  }

  function emptyState(kind) {
    const box = el("div", "gb-empty");
    box.append(icon(kind === "nodata" ? "fa-seedling" : "fa-magnifying-glass"));
    if (kind === "nodata") box.append(el("h3", null, "No internships yet"), el("p", null, "Search for new postings above, or add a row by hand."));
    else {
      box.append(el("h3", null, "No internships match"), el("p", null, "Try removing a filter, or widening the pay, duration or date range."));
      const clear = el("button", "gb-btn gb-btn-primary");
      clear.type = "button";
      clear.append(icon("fa-filter-circle-xmark"), document.createTextNode("Clear all filters"));
      clear.addEventListener("click", clearAll);
      box.append(clear);
    }
    return box;
  }

  function renderList(more) {
    const host = $("board-list");
    if (!more) {
      state.shown = 0;
      state.body = null;
      host.replaceChildren();
      if (!state.loaded) { const box = el("div", "gb-table-card gb-skeleton-rows"); for (let i = 0; i < 4; i++) box.append(el("div", "gb-skeleton")); host.append(box); }
      else if (!state.filtered.length) host.append(emptyState(state.all.length ? "nomatch" : "nodata"));
    }
    if (state.filtered.length) {
      if (!state.body) { const c = createContainer(); host.replaceChildren(c.root); state.body = c.body; }
      const next = state.filtered.slice(state.shown, state.shown + PAGE);
      next.forEach((p, i) => state.body.append(state.view === "cards" ? cardEl(p, i) : rowEl(p, i)));
      state.shown += next.length;
    }
    $("board-more").hidden = state.shown >= state.filtered.length;
    $("board-more").lastChild.textContent = ` Show more (${state.filtered.length - state.shown} left)`;
    syncPicks();
  }

  // ---------------------------------------------------------- ticking rows

  function setPicked(id, on) {
    if (on) state.selected.add(id); else state.selected.delete(id);
    document.querySelectorAll(`#board-list [data-id="${CSS.escape(id)}"]`).forEach((node) => {
      node.classList.toggle("picked", on);
      const box = node.querySelector("input.gb-check");
      if (box) box.checked = on;
    });
    syncPicks();
  }
  function syncPicks() {
    const inView = state.filtered.filter((p) => state.selected.has(p.id)).length;
    const all = $("board-pick-all");
    all.checked = state.filtered.length > 0 && inView === state.filtered.length;
    all.indeterminate = inView > 0 && inView < state.filtered.length;
    $("board-ticked").hidden = state.selected.size === 0;
    $("board-ticked").textContent = String(state.selected.size);
  }

  // ---------------------------------------------------------- downloads

  async function download(postings, name) {
    if (!postings.length) { await notice("info", "Nothing to download", "There are no internships for that choice yet."); return; }
    let XLSX;
    try { XLSX = await import("./xlsx.mjs"); } catch { await notice("error", "Excel could not be prepared", "The spreadsheet library did not load. Rebuild the site (npm run build) and try again."); return; }
    const sheet = XLSX.utils.json_to_sheet(postings.map((p) => ({
      Position: p.title, Company: p.company, City: p.city, Kind: p.kind, Duration: formatWeeks(p.weeks), "Pay per month": formatPay(p.pay),
      "German level": p.germanLevel, "English level": p.englishLevel, Skills: p.skills.join(", "), "GJU check": p.row.gju_check || "",
      "Fit score (%)": p.score ?? "", "Searched by": p.by, "Why it fits": p.scoreWhy, Status: p.status, "Apply?": p.apply, "Who applies": p.applicant, "Date posted": p.posted, Source: p.row.source_site || "", Link: safeUrl(p.url),
    })));
    sheet["!cols"] = [48, 28, 18, 14, 16, 16, 10, 10, 36, 34, 16, 8, 12, 12, 18, 60].map((wch) => ({ wch }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Internships");
    XLSX.writeFile(book, name);
    toast("success", `Downloaded ${plural(postings.length, "internship", "internships")}`);
  }
  function openDownloadMenu() {
    showMenu($("board-dl"), [
      { icon: "fa-filter", label: "What I see now", small: state.filtered.length, onClick: () => download(state.filtered, "internships-filtered.xlsx") },
      { icon: "fa-square-check", label: "Ticked", small: state.selected.size, disabled: !state.selected.size, onClick: () => download(sortPostings(state.all.filter((p) => state.selected.has(p.id)), "new"), "internships-ticked.xlsx") },
      { icon: "fa-database", label: "Everything", small: state.all.length, onClick: () => download(sortPostings(state.all, "new"), "internships-all.xlsx") },
    ]);
  }

  // ---------------------------------------------------------- views and the hero

  function setView(next, remember) {
    state.view = next;
    $("board-view-table").setAttribute("aria-pressed", String(next === "table"));
    $("board-view-cards").setAttribute("aria-pressed", String(next === "cards"));
    if (remember) { try { localStorage.setItem(VIEW_KEY, next); } catch { /* not remembered in a private window */ } }
    if (isBoard()) renderList(false);
  }

  const format = new Intl.NumberFormat("en");
  function countUp(node, to, ms = 900) {
    const from = Number(node.dataset.v || 0);
    node.dataset.v = String(to);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || from === to) { node.textContent = format.format(to); return; }
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / ms);
      node.textContent = format.format(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function heroStats() {
    const week = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const values = {
      total: state.all.length,
      meets: state.all.filter((p) => p.gju.overall === "meets").length,
      fresh: state.all.filter((p) => p.posted && p.posted >= week).length,
      companies: new Set(state.all.map((p) => norm(p.company).trim()).filter(Boolean)).size,
    };
    document.querySelectorAll(".gb-hero [data-stat]").forEach((node) => countUp(node, values[node.dataset.stat] || 0));
  }

  // ---------------------------------------------------------- one refresh for every change

  /** `reset` says the filters, the sort or the view changed (the spreadsheet goes back to its first page), not the rows. */
  function refresh(reset = true) {
    state.filtered = sortPostings(applyFilters(state.all, state.f), state.sort);
    const board = isBoard();
    for (const id of ["board-list", "board-view-toggle", "board-pick-label"]) $(id).hidden = !board;
    if (board) renderList(false); else $("board-more").hidden = true;
    updateFacets();
    renderChips();
    const n = activeCount(state.f);
    $("board-active-count").hidden = n === 0;
    $("board-active-count").textContent = String(n);
    $("board-result-count").replaceChildren(el("strong", null, String(state.filtered.length)), document.createTextNode(` of ${plural(state.all.length, "internship", "internships")}`));
    onFiltered(state.filtered.map((p) => p.row), reset);
  }

  // ---------------------------------------------------------- start

  let built = false;
  $("board-list").addEventListener("change", (e) => {
    if (e.target.classList.contains("gb-check")) setPicked(e.target.closest("[data-id]").dataset.id, e.target.checked);
  });
  $("board-list").addEventListener("click", (e) => {
    const button = e.target.closest("button[data-action='info']");
    if (button) info(state.byId.get(button.closest("[data-id]").dataset.id).row);
  });
  $("board-more").addEventListener("click", () => renderList(true));
  $("board-pick-all").addEventListener("change", (e) => {
    state.filtered.forEach((p) => (e.target.checked ? state.selected.add(p.id) : state.selected.delete(p.id)));
    document.querySelectorAll("#board-list [data-id]").forEach((node) => {
      const picked = state.selected.has(node.dataset.id);
      node.classList.toggle("picked", picked);
      node.querySelector("input.gb-check").checked = picked;
    });
    syncPicks();
  });
  $("board-dl").addEventListener("click", () => (menu.hidden ? openDownloadMenu() : closeMenu(true)));
  $("board-view-table").addEventListener("click", () => setView("table", true));
  $("board-view-cards").addEventListener("click", () => setView("cards", true));
  document.querySelectorAll("[data-board-help]").forEach((b) => b.addEventListener("click", showHelp));
  view.addEventListener("input", () => { if (built) refresh(); });
  wireFields();
  let stored = null;
  try { stored = localStorage.getItem(VIEW_KEY); } catch { /* no storage */ }
  setView(stored === "cards" || stored === "table" ? stored : window.matchMedia("(max-width: 900px)").matches ? "cards" : "table", false);
  if (window.matchMedia("(max-width: 700px)").matches) $("board-filter-panel").open = false;
  renderList(false);

  return {
    /** New tracker rows (after a load, a save, a search or an edit): rebuilt and shown with the current filters. */
    load(rows, enums) {
      if (!built) { buildCombos(enums); built = true; }
      state.loaded = true;
      state.all = rows.map(toPosting);
      state.byId = new Map(state.all.map((p) => [p.id, p]));
      const ids = new Set(state.byId.keys());
      state.selected.forEach((id) => { if (!ids.has(id)) state.selected.delete(id); });
      rowItems();
      heroStats();
      refresh(false);
    },
    clear: clearAll,
  };
}
