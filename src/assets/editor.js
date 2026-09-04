/**
 * Profile editor.
 *
 * This is the ONLY JavaScript on the site, and it runs on one page that is
 * marked noindex. The profile pages themselves are static HTML rendered at
 * build time — nothing here affects what a crawler or an AI assistant reads.
 *
 * Storage: text in localStorage, image blobs in IndexedDB (localStorage's ~5MB
 * quota cannot hold base64 certificate scans). Both are private to this browser
 * on this device; the page uploads nothing on its own.
 *
 * Two modes, detected at load:
 *   published — export a .json you feed to `npm run import-data`
 *   local     — `npm run editor` is running, so "Save to data/" writes files
 *               directly and AI extraction is available (the key stays server-side)
 */

// Self-hosted rather than loaded from a CDN, so the site makes no third-party
// requests and the local editor still works with no network. The esm.all build
// carries its own styles.
import Swal from "./sweetalert2.esm.min.js";
import { SKILL_LIBRARY, ALL_LIBRARY_SKILLS, TAXONOMY_URL } from "./skill-library.js";

const STORAGE_KEY = "careertoai:v1";
const DB_NAME = "careertoai";
const DB_VERSION = 1;
const IMAGE_STORE = "images";

const root = document.querySelector("[data-editor]");

// ---------------------------------------------------------------------------
// IndexedDB — image blobs, keyed by a uuid the entry stores as `imageKey`
// ---------------------------------------------------------------------------

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(IMAGE_STORE)) {
        request.result.createObjectStore(IMAGE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function dbRun(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE, mode);
    const request = fn(tx.objectStore(IMAGE_STORE));
    tx.onerror = () => reject(tx.error);
    if (request) {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } else {
      tx.oncomplete = () => resolve();
    }
  });
}

const putImage = (key, record) => dbRun("readwrite", (store) => store.put(record, key));
const getImage = (key) => dbRun("readonly", (store) => store.get(key));
const deleteImage = (key) => dbRun("readwrite", (store) => store.delete(key));

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const uid = () =>
  (crypto.randomUUID?.() ?? `k${Date.now()}${Math.random().toString(36).slice(2)}`).slice(0, 18);

function blankState() {
  return {
    profile: {
      firstName: "",
      lastName: "",
      headline: "",
      pronouns: "",
      location: "",
      email: "",
      bio: "",
      education: [],
      links: [],
      skills: [],
    },
    experience: [],
    certificates: [],
  };
}

let state = blankState();

/** Every repeatable row carries a _key so the DOM can track it across renders. */
function withKeys(list) {
  return (Array.isArray(list) ? list : []).map((item) => ({ ...item, _key: item._key || uid() }));
}

// ---------------------------------------------------------------------------
// List definitions — the whole form is generated from these
// ---------------------------------------------------------------------------

/** LinkedIn's employment types, in the order the profile owner asked for. */
const EMPLOYMENT_TYPES = [
  "Seasonal", "Apprenticeship", "Internship", "Contract",
  "Self-employed", "Part-time", "Full-time",
];

/** Where the work happens — distinct from *where the company is*. */
const LOCATION_TYPES = ["On-site", "Hybrid", "Remote"];

const LISTS = {
  education: {
    target: () => state.profile.education,
    label: "education entry",
    heading: (e) => e.school || "New education entry",
    blank: () => ({
      _key: uid(), school: "", industry: "", degree: "", fieldOfStudy: "",
      startDate: "", endDate: "", description: "",
    }),
    fields: [
      { name: "school", label: "University / school", type: "text", full: true },
      { name: "industry", label: "Industry or field", type: "text", placeholder: "Software Engineering" },
      { name: "degree", label: "Degree", type: "text", placeholder: "BSc" },
      { name: "fieldOfStudy", label: "Field of study", type: "text", placeholder: "Computer Science" },
      { name: "startDate", label: "Start", type: "month" },
      { name: "endDate", label: "End", type: "month", hint: "Leave blank if ongoing" },
      { name: "description", label: "Description", type: "textarea", rows: 3, full: true },
    ],
  },

  experience: {
    target: () => state.experience,
    label: "position",
    heading: (e) => [e.title, e.organization].filter(Boolean).join(" — ") || "New position",
    blank: () => ({
      _key: uid(), id: "", title: "", organization: "", employmentType: "", location: "",
      locationType: "", startDate: "", endDate: "", description: "", skills: [], imageKey: "",
      attachmentImage: "",
    }),
    fields: [
      { name: "title", label: "Job title", type: "text", full: true },
      { name: "organization", label: "Company or organization", type: "text" },
      { name: "employmentType", label: "Employment type", type: "select", options: EMPLOYMENT_TYPES },
      { name: "location", label: "Location", type: "text", placeholder: "Berlin, Germany",
        hint: "Where the company is." },
      { name: "locationType", label: "Location type", type: "select", options: LOCATION_TYPES,
        hint: "Where you actually work from." },
      { name: "startDate", label: "Start", type: "month" },
      { name: "endDate", label: "End", type: "month", hint: "Leave blank if this is your current role" },
      { name: "description", label: "Description", type: "textarea", rows: 5, full: true },
    ],
    skills: true,
    image: { label: "Attachment", hint: "Optional image shown with this position." },
  },

  certificates: {
    target: () => state.certificates,
    label: "certification",
    heading: (e) => e.title || "New certification",
    blank: () => ({
      _key: uid(), id: "", title: "", issuer: "", dateIssued: "", dateExpires: "",
      credentialId: "", credentialUrl: "", description: "", skills: [],
      extractedText: "", imageKey: "", certificateImage: "",
    }),
    fields: [
      { name: "title", label: "Name", type: "text", full: true },
      { name: "issuer", label: "Issuing organization", type: "text", full: true },
      { name: "dateIssued", label: "Issue date", type: "date" },
      { name: "dateExpires", label: "Expiry date", type: "date", hint: "Blank if it does not expire" },
      { name: "credentialId", label: "Credential ID", type: "text" },
      { name: "credentialUrl", label: "Verification URL", type: "url" },
      { name: "description", label: "Description", type: "textarea", rows: 7, full: true,
        hint: "What the credential covers and what competence it evidences." },
      { name: "extractedText", label: "Text on the certificate", type: "textarea", rows: 5, full: true,
        hint: "Shown on the certificate page so the summary can be checked against the source." },
    ],
    skills: true,
    image: { label: "Certificate image", hint: "Published at 1200px wide with metadata stripped. Crop anything private first.", extract: true },
  },

  links: {
    target: () => state.profile.links,
    label: "link",
    heading: (e) => e.label || "New link",
    blank: () => ({ _key: uid(), label: "", url: "" }),
    fields: [
      { name: "label", label: "Label", type: "text", placeholder: "GitHub" },
      { name: "url", label: "URL", type: "url", placeholder: "https://github.com/you" },
    ],
  },
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const statusEl = root?.querySelector("[data-save-status]");
let saveTimer = null;

function setStatus(text, tone = "") {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.dataset.tone = tone;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setStatus(`Saved ${now}`, "ok");
  } catch (error) {
    // Quota, private browsing, or site data blocked. Say so rather than
    // silently losing the next hour of typing.
    setStatus("Could not save to this browser — export your .json now", "error");
    console.error("[editor] localStorage write failed:", error);
  }
}

function scheduleSave() {
  setStatus("Saving…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}

function load() {
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.error("[editor] localStorage read failed:", error);
  }
  if (!stored) return false;
  try {
    adoptState(JSON.parse(stored));
    return true;
  } catch (error) {
    console.error("[editor] stored data was not valid JSON:", error);
    return false;
  }
}

/** Merge a loaded/imported payload over the blank shape so missing keys are safe. */
function adoptState(incoming) {
  const base = blankState();
  state = {
    profile: {
      ...base.profile,
      ...(incoming.profile || {}),
      education: withKeys(incoming.profile?.education),
      links: withKeys(incoming.profile?.links),
      skills: Array.isArray(incoming.profile?.skills) ? incoming.profile.skills : [],
    },
    experience: withKeys(incoming.experience),
    certificates: withKeys(incoming.certificates),
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of [].concat(children)) {
    if (child) node.append(child);
  }
  return node;
};

/**
 * A <select> whose value survives data the list does not know about: an older
 * entry, or one imported from a .json written before an option was added, keeps
 * its value as an extra option instead of being silently blanked on render.
 */
function selectControl(field, value) {
  const options = field.options.includes(value) || !value ? field.options : [value, ...field.options];
  const control = el(
    "select",
    {},
    [
      el("option", { value: "", textContent: field.blankLabel || "Not specified" }),
      ...options.map((option) => el("option", { value: option, textContent: option })),
    ]
  );
  // After the options exist — assigning .value first would find nothing to match.
  control.value = value;
  return control;
}

function fieldControl(listName, item, field) {
  const path = `${listName}.${item._key}.${field.name}`;
  const value = item[field.name] ?? "";
  const shared = { value, placeholder: field.placeholder || "" };
  const control =
    field.type === "select"
      ? selectControl(field, value)
      : field.type === "textarea"
        ? el("textarea", { ...shared, rows: field.rows || 4 })
        : el("input", { ...shared, type: field.type || "text" });
  control.dataset.path = path;
  if (field.type === "month") control.placeholder = field.placeholder || "YYYY-MM";

  return el("label", { className: field.full ? "full" : "" }, [
    field.label,
    control,
    field.hint ? el("small", { textContent: field.hint }) : null,
  ]);
}

function skillsWidget(listName, item) {
  const wrap = el("div", { className: "skills-editor" });
  wrap.dataset.skillsFor = `${listName}.${item._key}`;
  renderSkills(wrap, item.skills || [], `${listName}.${item._key}`);
  return el("label", { className: "full" }, ["Skills", wrap]);
}

// ---------------------------------------------------------------------------
// Skills
//
// There are far more skills in the world than any bundled list can hold, so the
// editor does not try. Suggestions come from four sources, best first:
//
//   1. yours       — every skill already on a role, a certificate or the profile
//   2. seen        — skills harvested from job adverts you have pasted, kept in
//                    this browser only; the list grows into your own field
//   3. library     — the curated seed in skill-library.js, one group per field
//   4. taxonomy    — ESCO's ~14,000 skills, English and German, only if you ran
//                    `npm run skills:import`. Search-only and lazily fetched.
//
// Free text always wins: anything you type is accepted whether or not any of
// the four has heard of it.
// ---------------------------------------------------------------------------

/** "a, b" and a pasted multi-line list both mean the same thing: several skills. */
const parseSkills = (text) =>
  String(text)
    .split(/[\n\r,;]+/)
    .map((s) => s.trim().replace(/^[-*•]\s*/, ""))
    .filter(Boolean);

/** Append the ones that are new, comparing case-insensitively. Returns the count. */
function addSkills(skills, values) {
  let added = 0;
  for (const value of values) {
    if (skills.some((s) => s.toLowerCase() === value.toLowerCase())) continue;
    skills.push(value);
    added += 1;
  }
  return added;
}

/** Same normalisation as the tracker's Fit % formula, so both agree on a match. */
const forMatch = (text) =>
  ` ${String(text)
    .toLowerCase()
    .replace(/[,;:./\-()[\]*?~\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;

const mentions = (haystack, skill) => skill.length > 1 && haystack.includes(forMatch(skill));

// ---- source 1: your own skills, across every entry -------------------------

function ownSkills() {
  const seen = new Map();
  const add = (list) => {
    for (const skill of list || []) {
      const key = String(skill).toLowerCase();
      if (key && !seen.has(key)) seen.set(key, skill);
    }
  };
  add(state.profile.skills);
  for (const role of state.experience) add(role.skills);
  for (const cert of state.certificates) add(cert.skills);
  return [...seen.values()];
}

// ---- source 2: skills seen in adverts, remembered locally ------------------

const POOL_KEY = "careertoai:skillpool:v1";
const POOL_MAX = 600;
let pool = null;

function seenSkills() {
  if (pool) return pool;
  try {
    const raw = JSON.parse(localStorage.getItem(POOL_KEY));
    pool = Array.isArray(raw) ? raw.filter((s) => typeof s === "string") : [];
  } catch {
    pool = [];
  }
  return pool;
}

/** Remember what an advert asked for, whether or not you claimed it. */
function rememberSkills(values) {
  const current = seenSkills();
  const known = new Set(current.map((s) => s.toLowerCase()));
  for (const value of values) {
    const key = String(value).toLowerCase();
    if (!key || known.has(key)) continue;
    known.add(key);
    current.unshift(value);
  }
  pool = current.slice(0, POOL_MAX);
  try {
    localStorage.setItem(POOL_KEY, JSON.stringify(pool));
  } catch {
    /* a full quota is not worth failing an edit over */
  }
}

// ---- source 4: the optional ESCO taxonomy ---------------------------------

let taxonomyPromise = null;

/** Skills harvested from the tracker by `npm run skills:harvest`, if it has run. */
let poolFilePromise = null;

function loadPoolFile() {
  if (poolFilePromise) return poolFilePromise;
  poolFilePromise = fetch(`${apiBase()}data/skill-pool.json`, { cache: "no-cache" })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      const skills = data?.skills || [];
      if (skills.length) rememberSkills([...skills].reverse());
      return skills;
    })
    .catch(() => []);
  return poolFilePromise;
}

/** Resolves to a flat [{ label, de, group }] array, or [] if it was never imported. */
function loadTaxonomy() {
  if (taxonomyPromise) return taxonomyPromise;
  taxonomyPromise = fetch(`${apiBase()}${TAXONOMY_URL}`, { cache: "force-cache" })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) =>
      (data?.groups || []).flatMap((group) =>
        group.skills.map((skill) => ({ label: skill.en, de: skill.de || "", group: group.group }))
      )
    )
    .catch(() => []);
  return taxonomyPromise;
}

// ---- ranked suggestions for the type-ahead --------------------------------

const DATALIST_MAX = 300;

function suggestionsFor(skills) {
  const taken = new Set(skills.map((s) => s.toLowerCase()));
  const out = [];
  for (const source of [ownSkills(), seenSkills(), ALL_LIBRARY_SKILLS]) {
    for (const skill of source) {
      const key = skill.toLowerCase();
      if (taken.has(key)) continue;
      taken.add(key);
      out.push(skill);
      if (out.length >= DATALIST_MAX) return out;
    }
  }
  return out;
}

// ---- the library picker ---------------------------------------------------

const RESULT_MAX = 240;

/**
 * Browse the curated library by field, or search everything at once — including
 * the ESCO taxonomy, which is why the search box matches German labels too.
 */
async function pickFromLibrary(skills) {
  const owned = new Set(skills.map((s) => s.toLowerCase()));
  const taxonomy = await loadTaxonomy();

  const row = (label, note, isOwned) =>
    `<li><label><input type="checkbox" value="${escapeHtml(label)}"${
      isOwned ? " checked disabled" : ""
    }> <span>${escapeHtml(label)}</span>${
      note ? `<em>${escapeHtml(note)}</em>` : ""
    }</label></li>`;

  const section = (title, items) =>
    items.length ? `<section><h4>${escapeHtml(title)}</h4><ul>${items.join("")}</ul></section>` : "";

  const browse = SKILL_LIBRARY.map((group) =>
    section(
      group.group,
      group.skills.map((name) => row(name, "", owned.has(name.toLowerCase())))
    )
  ).join("");

  const search = (term) => {
    const q = term.toLowerCase();
    const hits = [];
    const already = new Set();
    for (const group of SKILL_LIBRARY) {
      for (const name of group.skills) {
        const key = name.toLowerCase();
        if (already.has(key) || !key.includes(q)) continue;
        already.add(key);
        hits.push(row(name, group.group, owned.has(key)));
      }
    }
    const fromLibrary = section(`Library — ${hits.length} match${hits.length === 1 ? "" : "es"}`, hits);

    const wide = [];
    for (const entry of taxonomy) {
      if (wide.length >= RESULT_MAX) break;
      const key = entry.label.toLowerCase();
      if (already.has(key)) continue;
      if (!key.includes(q) && !entry.de.toLowerCase().includes(q)) continue;
      already.add(key);
      wide.push(row(entry.label, entry.de || entry.group, owned.has(key)));
    }
    const more = section(
      wide.length >= RESULT_MAX ? `ESCO — first ${RESULT_MAX}, keep typing` : `ESCO — ${wide.length}`,
      wide
    );

    return fromLibrary + more || `<p class="swal-note">Nothing matches “${escapeHtml(term)}”. Type it into the box instead — free text is always accepted.</p>`;
  };

  const scope = taxonomy.length
    ? `Search covers the library and ${taxonomy.length.toLocaleString()} ESCO skills, German labels included.`
    : `Searching the curated library. For ~14,000 more, in English and German, run <code>npm run skills:import</code>.`;

  const result = await Swal.fire({
    ...dialog,
    title: "Add skills",
    width: "46rem",
    html:
      `<input type="search" class="swal-filter" placeholder="Search skills…" aria-label="Search skills">` +
      `<div class="swal-library" data-results>${browse}</div>` +
      `<p class="swal-note">${scope}</p>`,
    showCancelButton: true,
    confirmButtonText: "Add selected",
    cancelButtonText: "Cancel",
    didOpen: () => {
      const popup = Swal.getPopup();
      const results = popup.querySelector("[data-results]");
      const filter = popup.querySelector(".swal-filter");
      let timer = null;
      filter.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const term = filter.value.trim();
          results.innerHTML = term.length ? search(term) : browse;
          results.scrollTop = 0;
        }, 120);
      });
      filter.focus();
    },
    preConfirm: () =>
      [...Swal.getPopup().querySelectorAll(".swal-library input:checked:not(:disabled)")].map(
        (box) => box.value
      ),
  });

  return result.isConfirmed ? result.value || [] : null;
}

// ---- reading an advert ----------------------------------------------------

/** Everything we could recognise, for matching an advert without the model. */
async function knownSkills() {
  const taxonomy = await loadTaxonomy();
  return [
    ...ownSkills(),
    ...seenSkills(),
    ...ALL_LIBRARY_SKILLS,
    ...taxonomy.flatMap((entry) => (entry.de ? [entry.label, entry.de] : [entry.label])),
  ];
}

/**
 * Paste an advert, get its skills. Locally, Claude reads it and can name skills
 * nothing in the catalogue has heard of; otherwise the text is matched against
 * everything we know, using the same whole-word rule as the tracker.
 */
async function pickFromAdvert(skills) {
  const canUseAi = localMode.available && localMode.hasApiKey;

  const paste = await Swal.fire({
    ...dialog,
    title: "Skills from a job advert",
    width: "42rem",
    html:
      `<p class="swal-note">Paste the advert — the requirements section is enough. German is fine.</p>` +
      `<textarea class="swal-textarea" rows="10" placeholder="Wir suchen eine/n Praktikant/in…"></textarea>` +
      (canUseAi
        ? `<label class="swal-check"><input type="checkbox" data-ai checked> Let Claude read it — finds skills no list contains. Runs on your machine.</label>`
        : `<p class="swal-note">Matching against the catalogue. Run <code>npm run editor</code> to have Claude read the advert instead.</p>`),
    showCancelButton: true,
    confirmButtonText: "Find skills",
    cancelButtonText: "Cancel",
    didOpen: () => Swal.getPopup().querySelector("textarea").focus(),
    preConfirm: () => {
      const popup = Swal.getPopup();
      const text = popup.querySelector("textarea").value.trim();
      if (!text) {
        Swal.showValidationMessage("Paste the advert text first.");
        return false;
      }
      return { text, ai: Boolean(popup.querySelector("[data-ai]")?.checked) };
    },
  });

  if (!paste.isConfirmed || !paste.value) return null;
  const { text, ai } = paste.value;

  let found = [];
  let via = "the catalogue";

  if (ai) {
    busy("Reading the advert…");
    try {
      const response = await fetch(`${apiBase()}__editor/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The helper server refused the request.");
      found = data.skills || [];
      via = data.language ? `Claude, reading a ${data.language} advert` : "Claude";
      Swal.close();
    } catch (error) {
      Swal.close();
      await alertError("Could not read the advert", error.message);
      return null;
    }
  }

  if (!found.length) {
    const haystack = forMatch(text);
    const seen = new Set();
    for (const skill of await knownSkills()) {
      const key = skill.toLowerCase();
      if (seen.has(key) || !mentions(haystack, skill)) continue;
      seen.add(key);
      found.push(skill);
    }
  }

  // Worth keeping even if you claim none of them: next time they are suggestions.
  rememberSkills(found);

  if (!found.length) {
    await Swal.fire({
      ...dialog,
      icon: "info",
      title: "No skills recognised",
      html: `<p class="swal-note">Nothing in the text matched. Type the skills in by hand — and consider <code>npm run skills:import</code> for a much wider catalogue.</p>`,
      confirmButtonText: "OK",
    });
    return null;
  }

  const owned = new Set(skills.map((s) => s.toLowerCase()));
  const items = found
    .map(
      (name) =>
        `<li><label><input type="checkbox" value="${escapeHtml(name)}"${
          owned.has(name.toLowerCase()) ? " checked disabled" : " checked"
        }> <span>${escapeHtml(name)}</span></label></li>`
    )
    .join("");

  const chosen = await Swal.fire({
    ...dialog,
    title: `${found.length} skill${found.length === 1 ? "" : "s"} in this advert`,
    width: "42rem",
    html:
      `<p class="swal-note">Untick anything you cannot honestly claim — this goes on your profile. Read by ${escapeHtml(via)}.</p>` +
      `<div class="swal-library"><section><ul>${items}</ul></section></div>`,
    showCancelButton: true,
    confirmButtonText: "Add ticked",
    cancelButtonText: "Cancel",
    preConfirm: () =>
      [...Swal.getPopup().querySelectorAll(".swal-library input:checked:not(:disabled)")].map(
        (box) => box.value
      ),
  });

  return chosen.isConfirmed ? chosen.value || [] : null;
}

/** Chips + a text box. Enter or comma commits; the × on a chip removes it. */
function renderSkills(container, skills, owner) {
  container.replaceChildren();
  const redraw = () => {
    renderSkills(container, skills, owner);
    scheduleSave();
  };

  const chips = el("ul", { className: "chips" });
  skills.forEach((skill, index) => {
    chips.append(
      el("li", {}, [
        skill,
        el("button", {
          type: "button",
          className: "chip-remove",
          title: `Remove ${skill}`,
          textContent: "×",
          onclick: () => {
            skills.splice(index, 1);
            redraw();
          },
        }),
      ])
    );
  });

  const commit = (text) => {
    const values = parseSkills(text);
    if (!values.length) return;
    addSkills(skills, values);
    input.value = "";
    redraw();
    container.querySelector("input[type='text']")?.focus();
  };

  // A datalist gives type-ahead for free and never blocks a skill nothing has
  // heard of. It is capped, because your own skills matter more than breadth.
  const listId = `skill-options-${owner.replace(/[^a-z0-9]+/gi, "-")}`;
  const options = el(
    "datalist",
    { id: listId },
    suggestionsFor(skills).map((name) => el("option", { value: name }))
  );

  const input = el("input", {
    type: "text",
    placeholder: "Type a skill, or paste a whole list",
  });
  input.setAttribute("list", listId);
  input.setAttribute("autocomplete", "off");

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    commit(input.value.replace(/,$/, ""));
  });
  // One skill pastes normally; a list pastes as one chip per line or comma.
  input.addEventListener("paste", (event) => {
    const text = event.clipboardData?.getData("text") ?? "";
    if (!/[\n\r,;]/.test(text)) return;
    event.preventDefault();
    commit(text);
  });
  input.addEventListener("blur", () => commit(input.value));

  const pickerButton = (label, run) =>
    el("button", {
      type: "button",
      className: "btn btn-small",
      textContent: label,
      onclick: async () => {
        const chosen = await run(skills);
        if (!chosen) return;
        const added = addSkills(skills, chosen);
        redraw();
        toast(added ? "success" : "info", added ? `Added ${added} skill${added === 1 ? "" : "s"}` : "Nothing new to add");
      },
    });

  container.append(
    chips,
    el("div", { className: "skills-entry" }, [
      input,
      pickerButton("+ Add skills", pickFromLibrary),
      pickerButton("From a job ad", pickFromAdvert),
    ]),
    options
  );
}

function imageWidget(listName, item, config) {
  const wrap = el("div", { className: "image-editor" });
  wrap.dataset.imageFor = `${listName}.${item._key}`;
  renderImage(wrap, listName, item, config);
  return el("label", { className: "full" }, [config.label, wrap]);
}

async function renderImage(container, listName, item, config) {
  container.replaceChildren();

  const input = el("input", { type: "file", accept: "image/*,application/pdf" });
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (item.imageKey) await deleteImage(item.imageKey).catch(() => {});
    const key = uid();
    await putImage(key, { name: file.name, type: file.type, blob: file });
    item.imageKey = key;
    scheduleSave();
    renderImage(container, listName, item, config);
  });

  if (!item.imageKey) {
    container.append(input, el("small", { textContent: config.hint || "" }));
    return;
  }

  const record = await getImage(item.imageKey).catch(() => null);
  if (!record) {
    // The entry references an image this browser no longer has — most likely
    // the JSON was edited elsewhere, or site data was cleared.
    item.imageKey = "";
    container.append(input, el("small", { textContent: "Previously attached image is no longer in this browser." }));
    return;
  }

  const isPdf = record.type === "application/pdf";
  const preview = isPdf
    ? el("p", { className: "muted", textContent: `PDF attached: ${record.name}` })
    : el("img", { src: URL.createObjectURL(record.blob), alt: "", loading: "lazy" });

  const remove = el("button", {
    type: "button",
    className: "btn btn-small",
    textContent: "Remove image",
    onclick: async () => {
      await deleteImage(item.imageKey).catch(() => {});
      item.imageKey = "";
      item.certificateImage = "";
      item.attachmentImage = "";
      scheduleSave();
      renderImage(container, listName, item, config);
    },
  });

  const actions = el("div", { className: "image-actions" }, [remove]);

  if (config.extract && localMode.available) {
    actions.append(
      el("button", {
        type: "button",
        className: "btn btn-small",
        textContent: "Extract with AI",
        onclick: (event) => extractWithAI(event.currentTarget, item, record),
      })
    );
  }

  container.append(el("div", { className: "image-preview" }, [preview]), actions, input);
}

function renderList(listName) {
  const config = LISTS[listName];
  const container = root.querySelector(`[data-list="${listName}"]`);
  if (!container) return;

  const items = config.target();
  container.replaceChildren();

  if (!items.length) {
    container.append(el("p", { className: "muted empty", textContent: `No ${config.label} added yet.` }));
    return;
  }

  items.forEach((item, index) => {
    const heading = el("h3", { textContent: config.heading(item) });
    const remove = el("button", {
      type: "button",
      className: "btn btn-small btn-danger",
      textContent: "Remove",
      onclick: async () => {
        if (item.imageKey) await deleteImage(item.imageKey).catch(() => {});
        items.splice(index, 1);
        renderList(listName);
        scheduleSave();
      },
    });

    const fields = el("div", { className: "field-grid" },
      config.fields.map((field) => fieldControl(listName, item, field)));

    if (config.skills) fields.append(skillsWidget(listName, item));
    if (config.image) fields.append(imageWidget(listName, item, config.image));

    container.append(
      el("article", { className: "entry-editor" }, [
        el("div", { className: "entry-editor-head" }, [heading, remove]),
        fields,
      ])
    );
  });
}

function renderProfileFields() {
  for (const control of root.querySelectorAll("[data-path^='profile.']")) {
    const key = control.dataset.path.split(".")[1];
    if (key in state.profile && typeof state.profile[key] === "string") {
      control.value = state.profile[key];
    }
  }
  const skillsHost = root.querySelector("[data-skills='profile.skills']");
  if (skillsHost) renderSkills(skillsHost, state.profile.skills, "profile.skills");
}

function renderAll() {
  renderProfileFields();
  for (const name of Object.keys(LISTS)) renderList(name);
}

// ---------------------------------------------------------------------------
// Input handling
// ---------------------------------------------------------------------------

/** Write `value` at a dotted path. Lists are addressed by row _key, not index. */
function setByPath(path, value) {
  const [head, ...rest] = path.split(".");

  if (head === "profile") {
    state.profile[rest[0]] = value;
    return;
  }

  const config = LISTS[head];
  if (!config) return;
  const [key, field] = rest;
  const item = config.target().find((entry) => entry._key === key);
  if (item) item[field] = value;
}

function onInput(event) {
  const control = event.target.closest("[data-path]");
  if (!control) return;
  setByPath(control.dataset.path, control.value);

  // Keep the collapsed-row heading in step with the field that names it.
  const [listName, key] = control.dataset.path.split(".");
  const config = LISTS[listName];
  if (config) {
    const item = config.target().find((entry) => entry._key === key);
    const heading = control.closest(".entry-editor")?.querySelector("h3");
    if (item && heading) heading.textContent = config.heading(item);
  }

  scheduleSave();
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );

/** buttonsStyling:false so dialogs reuse the editor's own .btn classes. */
const dialog = {
  buttonsStyling: false,
  customClass: {
    popup: "editor-swal",
    confirmButton: "btn btn-primary",
    cancelButton: "btn",
    denyButton: "btn btn-danger",
  },
};

const toast = (icon, title) =>
  Swal.fire({
    ...dialog,
    toast: true,
    position: "top-end",
    icon,
    title,
    showConfirmButton: false,
    timer: 3500,
    timerProgressBar: true,
  });

const alertError = (title, text) =>
  Swal.fire({ ...dialog, icon: "error", title, text, confirmButtonText: "OK" });

const bullets = (items) =>
  `<ul class="swal-list">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;

const busy = (title) =>
  Swal.fire({
    ...dialog,
    title,
    allowOutsideClick: false,
    allowEscapeKey: false,
    didOpen: () => Swal.showLoading(),
  });

// ---------------------------------------------------------------------------
// Validation
//
// Three severities. An *error* is something the site would render wrongly or a
// value the build cannot parse, so it blocks outright. A *missing* required
// field is one the published profile has no fallback for; it blocks too, but
// with a way past, because the export doubles as a backup. A *warning* is an
// incomplete entry that lib/apply-data.mjs silently drops — which is exactly
// the kind of thing you want told to your face before you publish, but not a
// reason to refuse the save.
// ---------------------------------------------------------------------------

const PARTIAL_DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const trimmed = (v) => String(v ?? "").trim();
const isDate = (v) => PARTIAL_DATE.test(v);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const isUrl = (v) => {
  try {
    const parsed = new URL(v);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

/** Pad a partial date so "2024" and "2024-03-15" compare correctly. */
const comparable = (v) => {
  const [y, m = "01", d = "01"] = v.split("-");
  return `${y}-${m}-${d}`;
};

function checkDates(entry, label, errors, opts = {}) {
  const {
    startField = "startDate",
    endField = "endDate",
    startName = "start",
    endName = "end",
  } = opts;
  const start = trimmed(entry[startField]);
  const end = trimmed(entry[endField]);
  const shape = "YYYY, YYYY-MM or YYYY-MM-DD";

  if (start && !isDate(start)) errors.push(`${label}: ${startName} date "${start}" is not ${shape}.`);
  if (end && !isDate(end)) errors.push(`${label}: ${endName} date "${end}" is not ${shape}.`);
  if (start && end && isDate(start) && isDate(end) && comparable(end) < comparable(start)) {
    errors.push(`${label}: ${endName} date is before the ${startName} date.`);
  }
}

/**
 * The fields the published profile has no sensible fallback for. Anything not
 * on this list is genuinely optional, and the form says so on the field itself
 * — the two must not contradict each other.
 */
const REQUIRED = [
  { field: "firstName", label: "First name" },
  { field: "lastName", label: "Last name" },
  { field: "headline", label: "Headline" },
  { field: "bio", label: "About me" },
];

/** Required fields left empty, in form order, so the message can name them. */
function missingRequired() {
  const missing = REQUIRED.filter(({ field }) => !trimmed(state.profile[field]));

  // A profile with a name and nothing else is not worth publishing.
  const hasEntries =
    state.profile.education.some((e) => trimmed(e.school)) ||
    state.experience.some((r) => trimmed(r.title) || trimmed(r.organization)) ||
    state.certificates.some((c) => trimmed(c.title));
  if (!hasEntries) {
    missing.push({ field: null, label: "At least one education entry, position or certification" });
  }

  return missing;
}

function validate() {
  const errors = [];
  const warnings = [];
  const missing = missingRequired();
  const p = state.profile;

  if (trimmed(p.email) && !isEmail(trimmed(p.email))) {
    errors.push(`"${trimmed(p.email)}" is not a valid email address.`);
  }

  p.links.forEach((link, i) => {
    const url = trimmed(link.url);
    if (!url) return warnings.push(`Link ${i + 1} has no URL and will not be published.`);
    if (!isUrl(url)) errors.push(`Link ${i + 1}: "${url}" is not a valid http(s) URL.`);
    else if (!trimmed(link.label)) warnings.push(`Link ${i + 1} has no label, so the URL itself will be shown.`);
  });

  p.education.forEach((entry, i) => {
    const label = trimmed(entry.school) || `Education ${i + 1}`;
    if (!trimmed(entry.school)) {
      warnings.push(`Education ${i + 1} has no university or school name and will not be published.`);
    }
    checkDates(entry, label, errors);
  });

  state.experience.forEach((role, i) => {
    const label =
      [trimmed(role.title), trimmed(role.organization)].filter(Boolean).join(" — ") ||
      `Position ${i + 1}`;
    if (!trimmed(role.title) && !trimmed(role.organization)) {
      warnings.push(`Position ${i + 1} has neither a job title nor a company and will not be published.`);
    }
    checkDates(role, label, errors);
  });

  state.certificates.forEach((cert, i) => {
    const label = trimmed(cert.title) || `Certification ${i + 1}`;
    if (!trimmed(cert.title)) {
      warnings.push(`Certification ${i + 1} has no name and will not be published.`);
    } else if (!trimmed(cert.issuer)) {
      warnings.push(`${label} has no issuing organization.`);
    }
    const url = trimmed(cert.credentialUrl);
    if (url && !isUrl(url)) {
      errors.push(`${label}: verification URL "${url}" is not a valid http(s) URL.`);
    }
    checkDates(cert, label, errors, {
      startField: "dateIssued",
      endField: "dateExpires",
      startName: "issue",
      endName: "expiry",
    });
  });

  return { errors, warnings, missing };
}

/** Scroll to a profile field and put the cursor in it. */
function focusField(field) {
  const control = root?.querySelector(`[data-path="profile.${field}"]`);
  if (!control) return;
  control.scrollIntoView?.({ block: "center", behavior: "smooth" });
  control.focus({ preventScroll: true });
}

/** Gate before anything that publishes. Resolves false if the user backs out. */
async function passesValidation(verb) {
  const { errors, warnings, missing } = validate();

  if (errors.length) {
    await Swal.fire({
      ...dialog,
      icon: "error",
      title: errors.length === 1 ? "One thing to fix" : `${errors.length} things to fix`,
      html: bullets(errors),
      confirmButtonText: "Back to the form",
    });
    return false;
  }

  if (missing.length) {
    const result = await Swal.fire({
      ...dialog,
      icon: "warning",
      title: missing.length === 1 ? "One required field is empty" : `${missing.length} required fields are empty`,
      html:
        `<p class="swal-note">The published profile has no fallback for these, so fill them in before you publish:</p>` +
        bullets(missing.map((m) => m.label)) +
        `<p class="swal-note">Your work is already saved in this browser — going back loses nothing. Continue anyway only if you want an incomplete backup.</p>`,
      showCancelButton: true,
      confirmButtonText: "Back to the form",
      cancelButtonText: `Continue anyway`,
      reverseButtons: true,
    });
    // Confirm is the safe path here, so the meanings are the other way round.
    if (result.isConfirmed) {
      focusField(missing.find((m) => m.field)?.field);
      return false;
    }
    if (!result.isDismissed || result.dismiss !== Swal.DismissReason.cancel) return false;
  }

  if (warnings.length) {
    const result = await Swal.fire({
      ...dialog,
      icon: "warning",
      title: warnings.length === 1 ? "One entry will be skipped" : `${warnings.length} entries will be skipped`,
      html:
        bullets(warnings) +
        `<p class="swal-note">Incomplete entries are left out of the published profile. Everything else is ${escapeHtml(verb)} as normal.</p>`,
      showCancelButton: true,
      confirmButtonText: "Continue",
      cancelButtonText: "Go back and fix",
      focusCancel: true,
    });
    return result.isConfirmed;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/** One self-contained payload: text plus every referenced image inline. */
async function buildPayload() {
  const images = {};
  const withImages = [...state.experience, ...state.certificates].filter((entry) => entry.imageKey);

  for (const entry of withImages) {
    const record = await getImage(entry.imageKey).catch(() => null);
    if (!record) continue;
    images[entry.imageKey] = {
      name: record.name,
      type: record.type,
      dataUrl: await blobToDataUrl(record.blob),
    };
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: state.profile,
    experience: state.experience,
    certificates: state.certificates,
    images,
  };
}

async function exportJson() {
  if (!(await passesValidation("exported"))) return;

  busy("Preparing download…");
  const payload = await buildPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = el("a", { href: url, download: "careertoai-data.json" });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  await Swal.fire({
    ...dialog,
    icon: "success",
    title: "Downloaded careertoai-data.json",
    html:
      "<p class=\"swal-note\">Images are inside the file, so it is the whole profile. To publish it, run this in the repository:</p>" +
      "<pre class=\"swal-code\">npm run import-data -- careertoai-data.json</pre>" +
      "<p class=\"swal-note\">Then commit and push.</p>",
    confirmButtonText: "Got it",
  });
}

async function importJson(file) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return alertError("That file is not valid JSON", `${file.name} could not be parsed.`);
  }
  if (!payload || typeof payload !== "object" || !payload.profile) {
    return alertError(
      "That does not look like a CareerToAI export",
      "The file parsed as JSON but has no profile object in it."
    );
  }

  const confirmed = await Swal.fire({
    ...dialog,
    icon: "warning",
    title: "Replace everything on this page?",
    text: "Loading a file discards whatever is currently in the editor.",
    showCancelButton: true,
    confirmButtonText: "Load it",
    cancelButtonText: "Cancel",
    focusCancel: true,
  });
  if (!confirmed.isConfirmed) return;

  busy("Loading…");
  adoptState(payload);

  let failedImages = 0;
  for (const [key, image] of Object.entries(payload.images || {})) {
    try {
      const blob = await (await fetch(image.dataUrl)).blob();
      await putImage(key, { name: image.name, type: image.type, blob });
    } catch (error) {
      failedImages++;
      console.error(`[editor] could not restore image ${key}:`, error);
    }
  }

  renderAll();
  save();
  Swal.close();

  if (failedImages) {
    alertError(
      "Loaded, but some images did not restore",
      `${failedImages} image(s) in that file could not be read. Everything else is in place.`
    );
  } else {
    toast("success", "Loaded from file");
  }
}

// ---------------------------------------------------------------------------
// Local helper server
// ---------------------------------------------------------------------------

const localMode = { available: false, hasApiKey: false };

/** The site may be served under a path prefix, so derive the API base from this page's URL. */
const apiBase = () => location.pathname.replace(/editor\/?$/, "");

async function detectLocalMode() {
  const note = root.querySelector("[data-mode-note]");
  try {
    const response = await fetch(`${apiBase()}__editor/status`, { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    const status = await response.json();
    localMode.available = true;
    localMode.hasApiKey = Boolean(status.hasApiKey);
  } catch {
    localMode.available = false;
  }

  root.querySelector("[data-action='save-server']").hidden = !localMode.available;
  root.querySelector("[data-local-help]").hidden = !localMode.available;

  if (note) {
    note.textContent = localMode.available
      ? localMode.hasApiKey
        ? "Running locally. You can save straight into the repository, and extract certificate details with AI."
        : "Running locally. You can save straight into the repository. Add ANTHROPIC_API_KEY to .env to enable AI extraction."
      : "Running from the published site. Your edits stay in this browser until you download the .json and import it.";
  }
}

async function saveToServer(button) {
  if (!(await passesValidation("saved"))) return;

  button.disabled = true;
  busy("Writing files and rebuilding…");
  try {
    const payload = await buildPayload();
    const response = await fetch(`${apiBase()}__editor/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

    await Swal.fire({
      ...dialog,
      icon: "success",
      title: "Saved to the repository",
      html:
        bullets([
          ...result.written,
          ...(result.images ? [`${result.images} image(s) into src/certs/ and src/media/`] : []),
        ]) +
        "<p class=\"swal-note\">Nothing is live yet — commit and push to publish.</p>",
      confirmButtonText: "OK",
    });
  } catch (error) {
    alertError("Could not save", error.message);
  } finally {
    button.disabled = false;
  }
}

async function extractWithAI(button, item, record) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Reading…";
  busy("Reading the certificate with Claude…");
  try {
    const response = await fetch(`${apiBase()}__editor/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: record.name,
        type: record.type,
        dataUrl: await blobToDataUrl(record.blob),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

    // Only fill blanks — never overwrite something already typed.
    const filled = [];
    for (const [field, value] of Object.entries(result.fields)) {
      if (field === "skills") {
        if (!item.skills?.length && value.length) {
          item.skills = value;
          filled.push("skills");
        }
      } else if (!item[field] && value) {
        item[field] = value;
        filled.push(field);
      }
    }
    renderList("certificates");
    save();

    await Swal.fire({
      ...dialog,
      icon: filled.length ? "success" : "info",
      title: filled.length ? "Filled in the blank fields" : "Nothing left to fill in",
      html: filled.length
        ? bullets(filled) +
          "<p class=\"swal-note\">Fields you had already typed were left alone. Check every one of these before publishing — the model can misread a certificate.</p>"
        : "<p class=\"swal-note\">Every field the model returned already had a value, so nothing was changed.</p>",
      confirmButtonText: "OK",
    });
  } catch (error) {
    alertError("Extraction failed", error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function init() {
  const form = root.querySelector("[data-form]");
  form.addEventListener("input", onInput);
  // <select> fires "input" in modern browsers, but "change" is the reliable
  // one; onInput ignores anything without a data-path, so file inputs are safe.
  form.addEventListener("change", onInput);
  form.addEventListener("submit", (event) => event.preventDefault());

  for (const button of root.querySelectorAll("[data-add]")) {
    button.addEventListener("click", () => {
      const name = button.dataset.add;
      LISTS[name].target().push(LISTS[name].blank());
      renderList(name);
      scheduleSave();
      const rows = root.querySelectorAll(`[data-list="${name}"] .entry-editor`);
      rows[rows.length - 1]?.querySelector("input, textarea")?.focus();
    });
  }

  root.querySelector("[data-action='export']").addEventListener("click", exportJson);

  const importInput = root.querySelector("[data-import-input]");
  root.querySelector("[data-action='import']").addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", () => {
    if (importInput.files?.[0]) importJson(importInput.files[0]);
    importInput.value = "";
  });

  root.querySelector("[data-action='save-server']").addEventListener("click", (event) =>
    saveToServer(event.currentTarget)
  );

  // Clearing is unrecoverable, so make the user type the word rather than
  // click twice — a stray double-click should never be able to erase the lot.
  root.querySelector("[data-action='reset']").addEventListener("click", async () => {
    const { value } = await Swal.fire({
      ...dialog,
      icon: "warning",
      title: "Erase everything?",
      html:
        "<p class=\"swal-note\">This deletes every field and every uploaded image from this browser. It cannot be undone, and any export you have not downloaded is gone.</p>" +
        "<p class=\"swal-note\">Type <strong>ERASE</strong> to confirm.</p>",
      input: "text",
      inputPlaceholder: "ERASE",
      inputAttributes: { autocapitalize: "characters", autocorrect: "off" },
      showCancelButton: true,
      confirmButtonText: "Erase everything",
      cancelButtonText: "Keep my data",
      focusCancel: true,
      customClass: { ...dialog.customClass, confirmButton: "btn btn-danger" },
      inputValidator: (v) => (v.trim().toUpperCase() === "ERASE" ? undefined : "Type ERASE to confirm."),
    });
    if (!value) return;

    for (const entry of [...state.experience, ...state.certificates]) {
      if (entry.imageKey) await deleteImage(entry.imageKey).catch(() => {});
    }
    state = blankState();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* nothing stored to remove */ }
    renderAll();
    setStatus("Empty");
    toast("success", "Cleared — nothing is left in this browser");
  });

  const restored = load();
  // Fire and forget: the tracker's harvested skills join the suggestions as
  // soon as they arrive, and their absence is not an error.
  loadPoolFile().then((skills) => { if (skills.length) renderAll(); });
  renderAll();
  setStatus(restored ? "Loaded from this browser" : "Empty — start typing");
  detectLocalMode();

  // A pending debounce would otherwise be lost on a fast tab close.
  window.addEventListener("beforeunload", () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      save();
    }
  });
}

// Everything above is declaration; this is the only statement that runs on load.
// It must stay last: init() reads state, LISTS, statusEl and dialog, and those
// are let/const bindings that are in the temporal dead zone until their line runs.
if (root) init();
