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

const STORAGE_KEY = "careertoai:v1";
const DB_NAME = "careertoai";
const DB_VERSION = 1;
const IMAGE_STORE = "images";

const root = document.querySelector("[data-editor]");
if (root) init();

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
      startDate: "", endDate: "", description: "", skills: [], imageKey: "", attachmentImage: "",
    }),
    fields: [
      { name: "title", label: "Job title", type: "text", full: true },
      { name: "organization", label: "Company or organization", type: "text" },
      { name: "employmentType", label: "Employment type", type: "text", placeholder: "Full-time" },
      { name: "location", label: "Location", type: "text", placeholder: "Remote" },
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

function fieldControl(listName, item, field) {
  const path = `${listName}.${item._key}.${field.name}`;
  const shared = {
    value: item[field.name] ?? "",
    placeholder: field.placeholder || "",
  };
  const control =
    field.type === "textarea"
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

/** Chips + a text box. Enter or comma commits; the × on a chip removes it. */
function renderSkills(container, skills, owner) {
  container.replaceChildren();
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
            renderSkills(container, skills, owner);
            scheduleSave();
          },
        }),
      ])
    );
  });

  const input = el("input", { type: "text", placeholder: "Type a skill, press Enter" });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    const value = input.value.trim().replace(/,$/, "");
    if (!value) return;
    if (!skills.some((s) => s.toLowerCase() === value.toLowerCase())) skills.push(value);
    renderSkills(container, skills, owner);
    scheduleSave();
    container.querySelector("input")?.focus();
  });
  input.addEventListener("blur", () => {
    const value = input.value.trim();
    if (!value) return;
    if (!skills.some((s) => s.toLowerCase() === value.toLowerCase())) skills.push(value);
    input.value = "";
    renderSkills(container, skills, owner);
    scheduleSave();
  });

  container.append(chips, input);
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
  showMessage("Preparing download…");
  const payload = await buildPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = el("a", { href: url, download: "careertoai-data.json" });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showMessage("Downloaded careertoai-data.json. Run: npm run import-data -- careertoai-data.json", "ok");
}

async function importJson(file) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return showMessage("That file is not valid JSON.", "error");
  }
  if (!payload || typeof payload !== "object" || !payload.profile) {
    return showMessage("That JSON does not look like a CareerToAI export.", "error");
  }

  adoptState(payload);

  for (const [key, image] of Object.entries(payload.images || {})) {
    try {
      const blob = await (await fetch(image.dataUrl)).blob();
      await putImage(key, { name: image.name, type: image.type, blob });
    } catch (error) {
      console.error(`[editor] could not restore image ${key}:`, error);
    }
  }

  renderAll();
  save();
  showMessage("Loaded. Everything on this page now comes from that file.", "ok");
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
  button.disabled = true;
  showMessage("Writing files…");
  try {
    const payload = await buildPayload();
    const response = await fetch(`${apiBase()}__editor/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    showMessage(
      `Saved. ${result.written.join(", ")}${result.images ? ` and ${result.images} image(s)` : ""}. Commit and push to publish.`,
      "ok"
    );
  } catch (error) {
    showMessage(`Could not save: ${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
}

async function extractWithAI(button, item, record) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Reading…";
  showMessage("Sending the image to Claude. This takes a few seconds.");
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
    for (const [field, value] of Object.entries(result.fields)) {
      if (field === "skills") {
        if (!item.skills?.length) item.skills = value;
      } else if (!item[field]) {
        item[field] = value;
      }
    }
    renderList("certificates");
    save();
    showMessage("Filled in the blank fields. Check every one before publishing.", "ok");
  } catch (error) {
    showMessage(`Extraction failed: ${error.message}`, "error");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

// ---------------------------------------------------------------------------
// Messages and wiring
// ---------------------------------------------------------------------------

let messageTimer = null;

function showMessage(text, tone = "") {
  const box = root.querySelector("[data-message]");
  box.textContent = text;
  box.dataset.tone = tone;
  box.hidden = false;
  clearTimeout(messageTimer);
  if (tone === "ok") messageTimer = setTimeout(() => (box.hidden = true), 12000);
}

function init() {
  const form = root.querySelector("[data-form]");
  form.addEventListener("input", onInput);
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

  // Two-step confirm rather than a modal: clearing is unrecoverable.
  const resetButton = root.querySelector("[data-action='reset']");
  let armed = false;
  let armedTimer = null;
  resetButton.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      resetButton.textContent = "Click again to erase";
      armedTimer = setTimeout(() => {
        armed = false;
        resetButton.textContent = "Clear all";
      }, 5000);
      return;
    }
    clearTimeout(armedTimer);
    armed = false;
    resetButton.textContent = "Clear all";

    for (const entry of [...state.experience, ...state.certificates]) {
      if (entry.imageKey) await deleteImage(entry.imageKey).catch(() => {});
    }
    state = blankState();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* nothing stored to remove */ }
    renderAll();
    showMessage("Cleared. Nothing is left in this browser.", "ok");
    setStatus("Empty");
  });

  const restored = load();
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
