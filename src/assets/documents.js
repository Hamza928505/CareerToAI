/**
 * Client controller for the GJU Pflichtpraktikum CVs & Cover Letters Studio (/documents/)
 */

import "./workspace-tabs.js";
import { startTask } from "./task-tray.js";

/** The page shows one section at a time (workspace-tabs.js): open it, then bring it into view. */
function openPanel(id) {
  if (location.hash !== `#${id}`) location.hash = id;
  setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 60);
}

const state = {
  studio: null,
  postings: [
    {
      company: "",
      position: "",
      location: "",
      kennziffer: "",
      url: "",
      text: "",
    },
  ],
  evaluated: [],
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fileUrl(folder, name, download = false) {
  const params = new URLSearchParams({ folder, name });
  if (download) params.set("download", "1");
  return `/__editor/internships/file?${params.toString()}`;
}

function verdictClass(verdict) {
  if (verdict === "LIKELY APPROVED") return "verdict-pill verdict-approved";
  if (verdict === "NEEDS CLARIFICATION") return "verdict-pill verdict-clarification";
  return "verdict-pill verdict-rejected";
}

function ruleStatusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s.startsWith("pass")) return "rule-pill rule-pass";
  if (s.startsWith("fail")) return "rule-pill rule-fail";
  return "rule-pill rule-unclear";
}

async function apiJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------------------------------------------------------------------------
// Render Studio State
// ---------------------------------------------------------------------------

function renderStudioState() {
  const s = state.studio;
  if (!s) return;

  $("#hero-working-dir").textContent = s.dirs?.root || s.settings?.workingDir || "C:\\Users\\Hamza928\\Desktop\\Internships";
  $("#stat-cvs").textContent = String((s.cvs || []).length);
  $("#stat-cls").textContent = String((s.cls || []).length);
  $("#stat-cities").textContent = String(s.housingCount || (s.housingCities || []).length || 0);
  const manualsList = Array.isArray(s.atsManuals) ? s.atsManuals : [];
  $("#stat-manuals").textContent = String(manualsList.length);

  // Settings form
  if (s.settings) {
    $("#set-doc-lang").value = s.settings.docLang || "de";
    $("#set-earliest-start").value = s.settings.earliestStart || "01.03.2027";
    $("#set-latest-end").value = s.settings.latestEnd || "30.09.2027";
    $("#set-preferred-duration").value = s.settings.preferredDuration || "6 Monate";
    $("#set-rejected-policy").value = s.settings.rejectedPolicy || "negotiable";
    $("#set-match-city").checked = s.settings.matchCityAddress !== false;
  }
  // The AI picker by the Phase 2 button: every AI the app knows, greyed out while its key is missing.
  const picker = $("#set-tailor-model");
  if (picker && Array.isArray(s.tailorChoices)) {
    picker.replaceChildren(...s.tailorChoices.map((choice) => {
      const option = new Option(`${choice.label} — ${choice.how}`, choice.id);
      option.disabled = !choice.ready;
      return option;
    }));
    picker.value = s.settings?.tailorModel || "opus";
    if (!picker.value || picker.selectedOptions[0]?.disabled) picker.value = "opus";
  }

  // Template slots (lib returns array [{ slot: "cv_de", present, size, ... }])
  const slotMap = { cvDe: "cv_de", cvEn: "cv_en", clDe: "cl_de", clEn: "cl_en" };
  const templatesArr = Array.isArray(s.templates) ? s.templates : [];
  for (const [uiSlot, libSlot] of Object.entries(slotMap)) {
    const info = templatesArr.find((t) => t.slot === libSlot) || s.templates?.[uiSlot];
    const badge = $(`[data-slot-status="${uiSlot}"]`);
    if (!badge) continue;
    if (info?.present || info?.exists) {
      const kb = Math.max(1, Math.round((info.size || 0) / 1024));
      badge.textContent = `Ready (${kb} KB)`;
      badge.classList.remove("is-missing");
    } else {
      badge.textContent = "Missing";
      badge.classList.add("is-missing");
    }
  }

  // Official docs
  const docsEl = $("#official-docs-list");
  if (docsEl) {
    const docs = s.officialDocs || [];
    docsEl.innerHTML = docs.length
      ? docs
          .map(
            (d) =>
              `<a class="official-doc-pill" href="${esc(fileUrl(d.folder || "root", d.name))}" target="_blank" rel="noopener">
                <i class="fa-regular fa-file-pdf" aria-hidden="true"></i> ${esc(d.name)}
                ${d.pages ? `<small>(${d.pages}p)</small>` : ""}
              </a>`
          )
          .join("")
      : `<span class="muted">No official PDFs detected in root folder.</span>`;
  }

  renderArchiveLists();
  renderAtsSelectors();
  renderCityLookup($("#city-lookup-input")?.value || "");
}

function renderArchiveLists() {
  const s = state.studio;
  if (!s) return;
  const q = ($("#archive-filter")?.value || "").trim().toLowerCase();

  const filterList = (items) =>
    items.filter((item) => !q || item.stem.toLowerCase().includes(q));

  const cvs = filterList(s.cvs || []);
  const cls = filterList(s.cls || []);

  $("#count-cvs-badge").textContent = String(cvs.length);
  $("#count-cls-badge").textContent = String(cls.length);

  const renderItem = (item, folder) => {
    const dateStr = item.updatedAt ? new Date(item.updatedAt).toLocaleDateString("en-GB") : "";
    const pagesBadge = item.pages
      ? `<span class="rule-pill ${
          (folder === "CVs" && item.pages <= 2) || (folder === "CLs" && item.pages <= 1)
            ? "rule-pass"
            : "rule-fail"
        }">${item.pages} page${item.pages === 1 ? "" : "s"}</span>`
      : "";
    return `
      <div class="archive-item">
        <div class="archive-item-info">
          <div class="archive-item-title">${esc(item.stem)}</div>
          <div class="archive-item-meta">
            ${pagesBadge}
            ${dateStr ? `<span>Updated ${esc(dateStr)}</span>` : ""}
          </div>
        </div>
        <div class="archive-item-actions">
          ${
            item.pdf
              ? `<a class="btn btn--sm" href="${esc(fileUrl(folder, item.pdf))}" target="_blank" rel="noopener" title="Preview PDF"><i class="fa-regular fa-file-pdf" aria-hidden="true"></i> PDF</a>`
              : ""
          }
          ${
            item.docx
              ? `<a class="btn btn--sm" href="${esc(fileUrl(folder, item.docx, true))}" download title="Download Word .docx"><i class="fa-regular fa-file-word" aria-hidden="true"></i> .docx</a>`
              : ""
          }
          ${
            item.pdf
              ? `<button type="button" class="btn btn--sm" data-quick-ats="${esc(folder)}" data-pdf-name="${esc(item.pdf)}"><i class="fa-solid fa-vial-circle-check" aria-hidden="true"></i> ATS Check</button>`
              : ""
          }
        </div>
      </div>
    `;
  };

  $("#archive-cvs-list").innerHTML = cvs.length
    ? cvs.map((item) => renderItem(item, "CVs")).join("")
    : `<p class="muted">No matching CVs in <code>CVs/</code>.</p>`;

  $("#archive-cls-list").innerHTML = cls.length
    ? cls.map((item) => renderItem(item, "CLs")).join("")
    : `<p class="muted">No matching Cover Letters in <code>CLs/</code>.</p>`;
}

function renderAtsSelectors() {
  const s = state.studio;
  if (!s) return;
  const folder = $("#ats-folder-select")?.value || "CVs";
  const pdfSelect = $("#ats-pdf-select");
  if (pdfSelect) {
    let options = [];
    if (folder === "CVs") {
      options = (s.cvs || []).filter((i) => i.pdf).map((i) => i.pdf);
    } else if (folder === "CLs") {
      options = (s.cls || []).filter((i) => i.pdf).map((i) => i.pdf);
    } else {
      options = ["Lebenslauf_Hamza_Salameh_DE.pdf", "CV_Hamza_Salameh_EN.pdf"];
    }
    pdfSelect.innerHTML = options.length
      ? options.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join("")
      : `<option value="">No PDF files in ${esc(folder)}</option>`;
  }

  const manualSelect = $("#ats-manual-select");
  if (manualSelect && !manualSelect.options.length) {
    const manuals = Array.isArray(s.atsManuals) ? s.atsManuals : [];
    const systems = manuals.filter((m) => m.category === "ATS System");
    const companies = manuals.filter((m) => m.category === "Company Guide");
    manualSelect.innerHTML = `
      <option value="README.md">ATS Overview &amp; Quick Rules (README.md)</option>
      <optgroup label="ATS Vendor Systems (${systems.length})">
        ${systems.map((m) => `<option value="${esc(m.path)}">${esc(m.name)}</option>`).join("")}
      </optgroup>
      <optgroup label="German Employers (${companies.length})">
        ${companies.map((m) => `<option value="${esc(m.path)}">${esc(m.name)}</option>`).join("")}
      </optgroup>
    `;
    loadManualContent("README.md");
  }
}

async function loadManualContent(relPath) {
  const viewer = $("#ats-manual-viewer");
  if (!viewer || !relPath) return;
  viewer.textContent = "Loading manual…";
  try {
    const data = await apiJson(`/__editor/internships/ats-manual?path=${encodeURIComponent(relPath)}`);
    viewer.textContent = data.content || "";
  } catch (err) {
    viewer.textContent = `Could not load manual: ${err.message}`;
  }
}

function renderCityLookup(query = "") {
  const s = state.studio;
  const container = $("#city-lookup-results");
  if (!container || !s) return;
  const q = query.trim().toLowerCase();
  const cities = (s.housingCities || []).filter(
    (c) =>
      !q ||
      (c.city || "").toLowerCase().includes(q) ||
      (c.address || "").toLowerCase().includes(q) ||
      (c.name || "").toLowerCase().includes(q)
  );
  container.innerHTML = cities
    .slice(0, 25)
    .map(
      (c) => `
      <div class="city-item">
        <div>
          <strong>${esc(c.city)}</strong> — ${esc(c.name)}<br>
          <span class="muted">${esc(c.address)}</span>
        </div>
        <div>
          <button type="button" class="btn btn--sm" data-copy-text="${esc(c.address)}">
            <i class="fa-regular fa-copy" aria-hidden="true"></i> Copy Address
          </button>
        </div>
      </div>
    `
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Workbench Postings Input UI
// ---------------------------------------------------------------------------

/** An advert is in the box when something substantial was fetched, pasted or typed there. */
const hasAdvert = (p) => String(p.text || "").trim().length >= 200;

/** An http(s) address, or "" (the link to the posting is opened in a new tab). */
const httpHref = (value) => { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } };

/** The chosen applications as one table, above their cards: what Phase 1 and Phase 2 will work on. */
function renderSelectedTable() {
  const el = $("#selected-table");
  if (!el) return;
  if (!state.postings.some((p) => p.company || p.position || p.text)) { el.innerHTML = ""; return; }
  const rows = state.postings.map((p, idx) => `<tr>
      <td>${idx + 1}</td><td>${esc(p.company) || `<span class="muted">—</span>`}</td><td>${esc(p.position) || `<span class="muted">—</span>`}</td><td>${esc(p.location) || `<span class="muted">—</span>`}</td>
      <td>${hasAdvert(p) ? `<span class="rule-pill rule-pass"><i class="fa-solid fa-check" aria-hidden="true"></i> Advert added</span>` : `<button type="button" class="btn btn--sm" data-focus-advert="${idx}"><i class="fa-solid fa-paste" aria-hidden="true"></i> Paste the description</button>`}</td>
      <td>${state.postings.length > 1 ? `<button type="button" class="btn btn--sm btn--danger-ghost" data-remove-posting="${idx}"><i class="fa-solid fa-trash" aria-hidden="true"></i> Remove</button>` : ""}</td>
    </tr>`).join("");
  el.innerHTML = `<div class="doc-card selected-table">
    <h3>Selected applications (${state.postings.length})</h3>
    <div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>#</th><th>Company</th><th>Position</th><th>City</th><th>Advert</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted">Paste each application's description from its own site into its box below (or fetch it from the link), then run Phase 1 and Phase 2.</p>
  </div>`;
}

function postingSummaryHtml(p) {
  const company = (p.company || "").trim();
  const position = (p.position || "").trim();
  const location = (p.location || "").trim();
  if (!company && !position) {
    return `<span class="posting-head-placeholder">Enter company, position title, and advert text below</span>`;
  }
  return `<strong>${esc(company || "Unnamed company")}</strong>${position ? ` <span class="posting-head-role">— ${esc(position)}</span>` : ""}${location ? ` <span class="posting-head-loc"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${esc(location)}</span>` : ""}`;
}

function postingStatusHtml(p) {
  const len = String(p.text || "").trim().length;
  if (len >= 200) {
    return `<span class="rule-pill rule-pass"><i class="fa-solid fa-check" aria-hidden="true"></i> Advert ready (${len.toLocaleString()} chars)</span>`;
  }
  if (len > 0) {
    return `<span class="rule-pill rule-unclear"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${len} / 200+ chars</span>`;
  }
  return `<span class="rule-pill rule-unclear"><i class="fa-solid fa-paste" aria-hidden="true"></i> Needs advert text</span>`;
}

function postingCharCountText(p) {
  const len = String(p.text || "").trim().length;
  if (!len) return "0 characters — paste the full job description (min. 200 chars)";
  if (len < 200) return `${len.toLocaleString()} characters (${200 - len} more needed for full check)`;
  return `${len.toLocaleString()} characters`;
}

function updatePostingCardMeta(idx) {
  const p = state.postings[idx];
  if (!p) return;
  const summaryEl = $(`[data-head-summary="${idx}"]`);
  if (summaryEl) summaryEl.innerHTML = postingSummaryHtml(p);
  const statusEl = $(`[data-advert-badge="${idx}"]`);
  if (statusEl) statusEl.innerHTML = postingStatusHtml(p);
  const countEl = $(`[data-char-count="${idx}"]`);
  if (countEl) countEl.textContent = postingCharCountText(p);
  const clearBtn = $(`[data-clear-advert="${idx}"]`);
  if (clearBtn) clearBtn.hidden = !String(p.text || "").length;
  const openLink = $(`[data-open-url="${idx}"]`);
  if (openLink) {
    const href = httpHref(p.url);
    if (href) {
      openLink.href = href;
      openLink.hidden = false;
    } else {
      openLink.removeAttribute("href");
      openLink.hidden = true;
    }
  }
}

function renderPostingsInputs() {
  const listEl = $("#postings-input-list");
  if (!listEl) return;
  renderSelectedTable();
  listEl.innerHTML = state.postings
    .map(
      (p, idx) => {
        const href = httpHref(p.url);
        return `
      <div class="posting-input-card" data-posting-idx="${idx}"${p.collapsed ? ` data-collapsed="true"` : ""}>
        <div class="posting-input-head">
          <div class="posting-head-main">
            <span class="posting-num-badge">Posting #${idx + 1}</span>
            <div class="posting-head-summary" data-head-summary="${idx}">${postingSummaryHtml(p)}</div>
          </div>
          <div class="posting-head-actions">
            <span data-advert-badge="${idx}">${postingStatusHtml(p)}</span>
            ${
              state.postings.length > 1
                ? `<button type="button" class="btn btn--sm posting-collapse-btn" data-toggle-posting="${idx}" aria-expanded="${p.collapsed ? "false" : "true"}" title="${p.collapsed ? "Expand posting fields" : "Collapse posting fields"}">
                    <i class="fa-solid fa-chevron-${p.collapsed ? "down" : "up"}" aria-hidden="true"></i>
                    <span>${p.collapsed ? "Expand" : "Collapse"}</span>
                  </button>
                  <button type="button" class="btn btn--sm btn--danger-ghost" data-remove-posting="${idx}" title="Remove this posting">
                    <i class="fa-solid fa-trash" aria-hidden="true"></i> Remove
                  </button>`
                : ""
            }
          </div>
        </div>
        <div class="posting-input-body"${p.collapsed ? " hidden" : ""}>
          <div class="posting-meta-grid">
            <label class="doc-field posting-col-company">
              <span>Company</span>
              <input type="text" data-p-field="company" data-idx="${idx}" value="${esc(p.company)}" placeholder="e.g. BMW Group, Siemens, SAP…">
            </label>
            <label class="doc-field posting-col-position">
              <span>Position Title</span>
              <input type="text" data-p-field="position" data-idx="${idx}" value="${esc(p.position)}" placeholder="e.g. Praktikum Machine Learning / AI (m/w/d)">
            </label>
            <label class="doc-field posting-col-location">
              <span>City / Location</span>
              <input type="text" data-p-field="location" data-idx="${idx}" value="${esc(p.location)}" placeholder="e.g. München, Berlin…">
            </label>
            <label class="doc-field posting-col-ref">
              <span>Kennziffer / Ref ID <small class="muted">(optional)</small></span>
              <input type="text" data-p-field="kennziffer" data-idx="${idx}" value="${esc(p.kennziffer)}" placeholder="e.g. DE-12345">
            </label>
            <div class="doc-field posting-col-url">
              <div class="posting-url-head">
                <label for="posting-url-${idx}" class="posting-field-label">Posting URL <small class="muted">(optional)</small></label>
                <small class="muted posting-fetch-note" data-fetch-note="${idx}" role="status">Works for company websites. Job boards that forbid automatic reading are not read: paste their text.</small>
              </div>
              <div class="posting-url-bar">
                <input type="url" id="posting-url-${idx}" data-p-field="url" data-idx="${idx}" value="${esc(p.url)}" placeholder="https://jobs.company.com/…">
                <div class="posting-url-actions">
                  <button type="button" class="btn btn--sm" data-fetch-text="${idx}">
                    <i class="fa-solid fa-cloud-arrow-down" aria-hidden="true"></i> Get the advert text from this link
                  </button>
                  <a class="btn btn--sm" data-open-url="${idx}" ${href ? `href="${esc(href)}"` : "hidden"} target="_blank" rel="noopener noreferrer">
                    <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> Open the posting
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div class="doc-field posting-advert-field">
            <div class="posting-advert-head">
              <label for="posting-text-${idx}" class="posting-field-label">
                Application description from their site <small class="muted">(copy &amp; paste, German or English)</small>
              </label>
              <div class="posting-advert-tools">
                <span class="posting-char-count muted" data-char-count="${idx}">${postingCharCountText(p)}</span>
                <button type="button" class="btn btn--sm" data-paste-advert="${idx}" title="Paste text from clipboard">
                  <i class="fa-regular fa-clipboard" aria-hidden="true"></i> Paste
                </button>
                <button type="button" class="btn btn--sm" data-clear-advert="${idx}" ${String(p.text || "").length ? "" : "hidden"} title="Clear description text">
                  <i class="fa-solid fa-eraser" aria-hidden="true"></i> Clear
                </button>
              </div>
            </div>
            <textarea id="posting-text-${idx}" class="posting-textarea" data-p-field="text" data-idx="${idx}" placeholder="Open the posting, copy the whole description (tasks, requirements, duration, hours, contact person) and paste it here…">${esc(p.text)}</textarea>
          </div>

          ${p.baseText ? `<details class="posting-known"><summary><i class="fa-solid fa-table-list" aria-hidden="true"></i> From your shortlist (sent with the description)</summary><pre>${esc(p.baseText)}</pre></details>` : ""}
        </div>
      </div>
    `;
      }
    )
    .join("");
}

function syncPostingInputsFromDom() {
  $$("[data-p-field]").forEach((el) => {
    const idx = Number(el.dataset.idx);
    const field = el.dataset.pField;
    if (state.postings[idx] && field) {
      state.postings[idx][field] = el.value;
    }
  });
}

// ---------------------------------------------------------------------------
// Phase 1 Evaluation & Phase 2 Document Generation Rendering
// ---------------------------------------------------------------------------

function renderEvaluationResults() {
  const container = $("#evaluation-results");
  const tbody = $("#overview-tbody");
  const reportsContainer = $("#posting-reports-container");
  if (!container || !tbody || !reportsContainer) return;

  if (!state.evaluated.length) {
    container.hidden = true;
    $("#btn-run-phase2-all").disabled = true;
    return;
  }

  container.hidden = false;
  const anyEligible = state.evaluated.some((p) => p.shouldBuildDocs);
  $("#btn-run-phase2-all").disabled = !anyEligible;

  tbody.innerHTML = state.evaluated
    .map(
      (p) => `
      <tr>
        <td><strong>#${p.num}</strong></td>
        <td><strong>${esc(p.company)}</strong></td>
        <td>${esc(p.title)}</td>
        <td>
          ${esc(p.location)}
          ${
            p.cityAddress?.matched
              ? `<br><small class="muted" title="${esc(p.cityAddress.address)}"><i class="fa-solid fa-house-user"></i> ${esc(p.cityAddress.city)} housing matched</small>`
              : ""
          }
        </td>
        <td>${esc(p.startDuration)}</td>
        <td>${esc(p.hoursRemote)}</td>
        <td><span class="${verdictClass(p.verdict)}">${esc(p.verdict)}</span></td>
        <td><strong>${esc(p.fit || "Medium")}</strong></td>
        <td>
          ${
            p.generated?.files
              ? `<span class="rule-pill rule-pass">CV (${p.generated.files.cv.pages || "?"}p) + CL (${p.generated.files.cl.pages || "?"}p) saved</span>`
              : p.shouldBuildDocs
                ? `<span class="rule-pill rule-unclear">Ready to generate</span>`
                : `<span class="muted">Skipped (${esc(p.verdict)})</span>`
          }
        </td>
        <td>${esc(p.nextStep)}</td>
      </tr>
    `
    )
    .join("");

  reportsContainer.innerHTML = state.evaluated
    .map((p, evalIdx) => {
      const rulesRows = (p.rules || [])
        .map(
          (r) => `
          <tr>
            <td><strong>${esc(r.rule)}</strong></td>
            <td><span class="${ruleStatusClass(r.status)}">${esc(r.status)}</span></td>
            <td>${esc(r.evidence || "Not stated")}</td>
            <td>${r.status === "Pass" ? "—" : "Clarify / include in contract"}</td>
          </tr>
        `
        )
        .join("");

      const covered = (p.covered || []).map((c) => `<li>${esc(c)}</li>`).join("");
      const gaps = (p.gaps || []).map((g) => `<li>${esc(g)}</li>`).join("");

      const genFiles = p.generated?.files;
      const atsRep = p.generated?.atsReport;

      const generatedBlock = genFiles
        ? `
          <div class="generated-banner">
            <div>
              <strong><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Saved Tailored Documents in <code>Desktop\\Internships</code></strong>
              <p class="muted" style="margin:0.2rem 0 0;">
                CV: <code>${esc(genFiles.cv.docx)}</code> (${genFiles.cv.pages || "?"} page${genFiles.cv.pages === 1 ? "" : "s"}) |
                CL: <code>${esc(genFiles.cl.docx)}</code> (${genFiles.cl.pages || "?"} page${genFiles.cl.pages === 1 ? "" : "s"})
                ${genFiles.cv.pages > 2 ? `<br><strong class="ats-error">The CV is ${genFiles.cv.pages} pages; the limit is 2. Shorten it with Edit CV text before you send it.</strong>` : ""}
                ${genFiles.cl.pages > 1 ? `<br><strong class="ats-error">The cover letter is ${genFiles.cl.pages} pages; the limit is 1. Shorten it with Edit letter text.</strong>` : ""}
                ${
                  atsRep?.ok
                    ? ` | ATS Check: <strong>${atsRep.fails} FAIL, ${atsRep.warns} WARN${atsRep.mustCoverage ? ` (${atsRep.mustCoverage} keywords)` : ""}</strong>`
                    : ""
                }
              </p>
            </div>
            <div class="generated-links">
              ${
                genFiles.cv.pdf
                  ? `<a class="btn btn--sm btn--primary" href="${esc(fileUrl("CVs", genFiles.cv.pdf))}" target="_blank" rel="noopener"><i class="fa-regular fa-file-pdf" aria-hidden="true"></i> Open CV PDF</a>`
                  : ""
              }
              <a class="btn btn--sm" href="${esc(fileUrl("CVs", genFiles.cv.docx, true))}" download><i class="fa-regular fa-file-word" aria-hidden="true"></i> CV .docx</a>
              ${
                genFiles.cl.pdf
                  ? `<a class="btn btn--sm btn--primary" href="${esc(fileUrl("CLs", genFiles.cl.pdf))}" target="_blank" rel="noopener"><i class="fa-regular fa-file-pdf" aria-hidden="true"></i> Open CL PDF</a>`
                  : ""
              }
              <a class="btn btn--sm" href="${esc(fileUrl("CLs", genFiles.cl.docx, true))}" download><i class="fa-regular fa-file-word" aria-hidden="true"></i> CL .docx</a>
              <button type="button" class="btn btn--sm" data-edit-doc="CVs" data-doc-name="${esc(genFiles.cv.docx)}" data-eval="${evalIdx}"><i class="fa-solid fa-pen" aria-hidden="true"></i> Edit CV text</button>
              <button type="button" class="btn btn--sm" data-edit-doc="CLs" data-doc-name="${esc(genFiles.cl.docx)}" data-eval="${evalIdx}"><i class="fa-solid fa-pen" aria-hidden="true"></i> Edit letter text</button>
            </div>
          </div>
        `
        : "";

      return `
        <article class="posting-report-card" id="report-card-${evalIdx}">
          <div class="posting-report-header">
            <div>
              <span class="doc-step">Posting #${p.num} Report</span>
              <h3 style="margin:0.15rem 0;">${esc(p.company)} — ${esc(p.title)}</h3>
              <p class="muted" style="margin:0.2rem 0 0;">
                <span class="${verdictClass(p.verdict)}">${esc(p.verdict)}</span>
                &nbsp; ${esc(p.verdictReason)}
              </p>
            </div>
            <div class="doc-head-actions">
              <button type="button" class="btn" data-assess="${evalIdx}" title="What the posting asks for against what your profile proves, by the ATS manual for its platform">
                <i class="fa-solid fa-magnifying-glass-chart" aria-hidden="true"></i> ${p.assessment ? "Assess again" : "ATS assessment"}
              </button>
              <button type="button" class="btn btn--primary" data-generate-single="${evalIdx}">
                <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
                ${genFiles ? "Regenerate New Version (_v2+)" : "Generate Tailored CV & CL (.docx + .pdf)"}
              </button>
            </div>
          </div>

          ${generatedBlock}

          ${assessmentBlock(p, evalIdx)}

          <div class="doc-table-wrap">
            <table class="doc-table">
              <thead>
                <tr>
                  <th>GJU Rule (1–10)</th>
                  <th>Status</th>
                  <th>Quote or Fact from Posting</th>
                  <th>Action Needed</th>
                </tr>
              </thead>
              <tbody>${rulesRows}</tbody>
            </table>
          </div>

          <div class="posting-report-grid">
            <div class="copy-box">
              <strong><i class="fa-solid fa-bullseye" aria-hidden="true"></i> Fit (${esc(p.fit || "Medium")}) — Covered vs. Honest Gaps</strong>
              <div>
                <strong>Covered by your profile:</strong>
                <ul style="margin:0.25rem 0 0.5rem; padding-left:1.2rem;">${covered || "<li>General CS/AI background</li>"}</ul>
                <strong>Gaps (never claimed in CV/CL):</strong>
                <ul style="margin:0.25rem 0 0; padding-left:1.2rem;">${gaps || "<li>No critical hard-skill gaps flagged</li>"}</ul>
              </div>
              ${
                p.cityAddress
                  ? `<div style="margin-top:0.4rem; padding-top:0.4rem; border-top:1px solid rgba(148,163,184,0.2);">
                      <strong><i class="fa-solid fa-location-dot" aria-hidden="true"></i> City Student Housing (${esc(p.cityAddress.city)}):</strong><br>
                      <span>${esc(p.cityAddress.name)} — <code>${esc(p.cityAddress.address)}</code></span>
                    </div>`
                  : ""
              }
              ${
                p.ats
                  ? `<div style="margin-top:0.25rem;">
                      <strong><i class="fa-solid fa-robot" aria-hidden="true"></i> Detected ATS / Employer Guide:</strong>
                      <code>${esc(p.ats.name)}</code>
                      ${
                        p.ats.manual
                          ? `<button type="button" class="btn btn--sm" data-open-manual="${esc(p.ats.manual)}">View ATS Guide</button>`
                          : ""
                      }
                    </div>`
                  : ""
              }
            </div>

            <div class="copy-box">
              <div class="doc-card-head">
                <strong><i class="fa-regular fa-envelope" aria-hidden="true"></i> German Clarification Email to HR</strong>
                ${
                  p.email
                    ? `<button type="button" class="btn btn--sm" data-copy-text="${esc(`Betreff: ${p.email.subject}\n\n${p.email.body}`)}">
                        <i class="fa-regular fa-copy" aria-hidden="true"></i> Copy Email
                      </button>`
                    : ""
                }
              </div>
              <pre>${
                p.email
                  ? `<strong>Betreff:</strong> ${esc(p.email.subject)}\n\n${esc(p.email.body)}`
                  : "All hard rules (1–6) and timing are clear in the posting — no clarification email needed before applying."
              }</pre>
            </div>

            <div class="copy-box">
              <div class="doc-card-head">
                <strong><i class="fa-solid fa-file-contract" aria-hidden="true"></i> Exact German Contract Wording (MyGJU)</strong>
                <button type="button" class="btn btn--sm" data-copy-text="${esc(p.contractWording || "")}">
                  <i class="fa-regular fa-copy" aria-hidden="true"></i> Copy Clause
                </button>
              </div>
              <pre>${esc(p.contractWording || "")}</pre>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Event Wiring
// ---------------------------------------------------------------------------

async function loadStudioState() {
  try {
    const data = await apiJson("/__editor/internships/state");
    state.studio = data;
    $("#doc-offline-notice").hidden = true;
    renderStudioState();
  } catch (err) {
    $("#doc-offline-notice").hidden = false;
    console.warn("Studio state unavailable:", err.message);
  }
}

/** The workbench's postings in the shape the server evaluates (Phase 1) and the .txt export reads. */
function checkablePostings() {
  syncPostingInputsFromDom();
  return state.postings
    .filter((p) => p.text.trim() || p.baseText || p.company.trim() || p.position.trim())
    .map((p) => ({
      company: p.company,
      title: p.position,
      position: p.position,
      location: p.location,
      ref: p.kennziffer,
      url: p.url,
      text: [p.baseText, p.text].filter(Boolean).join("\n\n"),
    }));
}

/** Download everything about the applications as one .txt, to give to an AI. Uses what Phase 1 and the assessment produced, if run. */
async function downloadBrief() {
  const postings = state.evaluated.length ? state.evaluated.map((e) => ({ ...e, generated: undefined })) : checkablePostings();
  const status = $("#workbench-status");
  if (!postings.length) { status.textContent = "Add at least one internship posting first."; return; }
  const btn = $("#btn-download-brief");
  btn.disabled = true;
  status.textContent = "Building the .txt…";
  try {
    const { text } = await apiJson("/__editor/internships/brief", { method: "POST", body: JSON.stringify({ postings, settings: getFormSettings() }) });
    const link = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" })),
      download: `application-brief-${new Date().toISOString().slice(0, 10)}.txt`,
    });
    link.click();
    URL.revokeObjectURL(link.href);
    status.textContent = `Downloaded ${postings.length} application${postings.length === 1 ? "" : "s"}${state.evaluated.length ? "" : " (run Phase 1 first to include the GJU check)"}.`;
  } catch (err) {
    status.textContent = `Could not build the .txt: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

async function runPhase1() {
  const valid = checkablePostings();
  if (!valid.length) {
    $("#workbench-status").textContent = "Paste at least one internship posting first.";
    return;
  }
  const btn = $("#btn-run-phase1");
  btn.disabled = true;
  $("#workbench-status").textContent = `Running Part A GJU rules check on ${valid.length} posting(s)…`;
  const task = startTask({ title: `Checking ${valid.length} posting${valid.length === 1 ? "" : "s"} against the GJU rules` });
  try {
    const settings = getFormSettings();
    const res = await apiJson("/__editor/internships/evaluate", {
      method: "POST",
      body: JSON.stringify({ postings: valid, settings }),
    });
    state.evaluated = res.overview || res.evaluated || [];
    renderEvaluationResults();
    $("#workbench-status").textContent = `Evaluated ${state.evaluated.length} posting(s). Review verdicts below or click Generate.`;
    task.done(`Checked ${state.evaluated.length} posting(s). The verdicts are below.`);
  } catch (err) {
    $("#workbench-status").textContent = `Error: ${err.message}`;
    task.fail(`The check failed: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

async function generateForEvaluatedIndex(evalIdx) {
  const target = state.evaluated[evalIdx];
  if (!target) return;
  const btn = $(`[data-generate-single="${evalIdx}"]`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Generating .docx + .pdf…`;
  }
  $("#workbench-status").textContent = `Tailoring Lebenslauf & Anschreiben (.docx + .pdf) for ${target.company}…`;
  try {
    const settings = { ...getFormSettings(), rejectedPolicy: "all" };
    const res = await apiJson("/__editor/internships/generate", {
      method: "POST",
      // With an assessment, the tailoring uses the terms it found your profile to support and leaves the gaps out.
      body: JSON.stringify({ posting: { ...target, assessment: undefined, generated: undefined }, settings, assessment: target.assessment || null }),
    });
    state.evaluated[evalIdx].generated = res;
    if (res.studio) {
      state.studio = res.studio;
      renderStudioState();
    }
    renderEvaluationResults();
    if (res.files) {
      $("#workbench-status").textContent = `Saved ${res.files.cv.docx} and ${res.files.cl.docx} (+ PDFs) in Desktop\\Internships!`;
      if (res.notes?.length) $("#workbench-status").textContent += ` ${res.notes.join(" ")}`;
      // The assessment on the page should be about the CV that now exists.
      if (target.assessment && res.files.cv.pdf) assessPosting(evalIdx);
    } else {
      $("#workbench-status").textContent = res.reason || "Generation skipped.";
    }
  } catch (err) {
    $("#workbench-status").textContent = `Generation failed: ${err.message}`;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Retry Generation`;
    }
  }
}

async function generateAllEligible() {
  const indices = state.evaluated
    .map((p, idx) => (p.shouldBuildDocs ? idx : -1))
    .filter((idx) => idx >= 0);
  if (!indices.length) return;
  const btn = $("#btn-run-phase2-all");
  btn.disabled = true;
  $("#btn-run-phase1").disabled = true; // a new check would replace the list this loop is walking
  const task = startTask({ title: `Tailoring ${indices.length} CV${indices.length === 1 ? "" : "s"} and cover letter${indices.length === 1 ? "" : "s"}`, state: "composing" });
  try {
    for (const [n, idx] of indices.entries()) {
      task.show([`${state.evaluated[idx].company || "This posting"} (${n + 1} of ${indices.length}). Each one can take a minute.`]);
      await generateForEvaluatedIndex(idx);
    }
    const failed = indices.filter((idx) => !state.evaluated[idx].generated?.files).length;
    if (failed) task.fail(`${failed} of ${indices.length} did not get files. See the status line on the page.`);
    else task.done(`Saved ${indices.length} CV${indices.length === 1 ? "" : "s"} and cover letter${indices.length === 1 ? "" : "s"} (.docx + .pdf).`);
  } catch (err) {
    task.fail(err.message);
  } finally {
    $("#btn-run-phase1").disabled = false;
    btn.disabled = false;
  }
}

function getFormSettings() {
  return {
    docLang: $("#set-doc-lang")?.value || "de",
    earliestStart: $("#set-earliest-start")?.value || "01.03.2027",
    latestEnd: $("#set-latest-end")?.value || "30.09.2027",
    preferredDuration: $("#set-preferred-duration")?.value || "6 Monate",
    rejectedPolicy: $("#set-rejected-policy")?.value || "negotiable",
    matchCityAddress: Boolean($("#set-match-city")?.checked),
    tailorModel: $("#set-tailor-model")?.value || "opus",
  };
}

async function runAtsCheck(folder, pdfName, keywordsRaw = "") {
  const statusEl = $("#ats-run-status");
  const outEl = $("#ats-report-output");
  if (!pdfName) {
    if (statusEl) statusEl.textContent = "Select a PDF file first.";
    return;
  }
  if (statusEl) statusEl.textContent = `Running ats_check.py on ${pdfName}…`;
  try {
    const res = await apiJson("/__editor/internships/ats-check", {
      method: "POST",
      body: JSON.stringify({ folder, name: pdfName, keywords: keywordsRaw }),
    });
    const report = res.report || {};
    if (outEl) {
      outEl.hidden = false;
      outEl.innerHTML = `
        <div class="copy-box">
          <strong>
            ATS Report for <code>${esc(pdfName)}</code> —
            <span class="${report.fails === 0 ? "rule-pill rule-pass" : "rule-pill rule-fail"}">
              ${report.fails ?? 0} FAIL, ${report.warns ?? 0} WARN
            </span>
            ${report.mustCoverage ? `&nbsp; Keywords covered: <code>${esc(report.mustCoverage)}</code>` : ""}
          </strong>
          <pre style="margin-top:0.5rem;">${esc(report.reportMd || report.error || "")}</pre>
          ${
            report.extractedText
              ? `<details>
                  <summary style="cursor:pointer; font-weight:600;">Extracted Plain Text (What an ATS Parser Sees)</summary>
                  <pre style="margin-top:0.5rem;">${esc(report.extractedText)}</pre>
                </details>`
              : ""
          }
        </div>
      `;
    }
    if (statusEl) statusEl.textContent = `ATS check complete for ${pdfName}.`;
  } catch (err) {
    if (statusEl) statusEl.textContent = `ATS check failed: ${err.message}`;
  }
}

// ---------------------------------------------------------------------------
// Workspace Tracker Importer
// ---------------------------------------------------------------------------

let board = null;

/** Opens the Search page's board (its filters, list and ticks) on the current shortlist. The board is built on first use. */
async function openTrackerPicker() {
  $("#tracker-picker-card").hidden = false;
  const count = $("#board-result-count");
  count.textContent = "Loading your shortlist…";
  try {
    const rows = (await apiJson("/__editor/applications")).rows || [];
    if (!board) {
      const [{ createBoard }, { default: Swal }, { dialog }] = await Promise.all([import("./workspace-board.js"), import("./sweetalert2.esm.min.js"), import("./swal-dialog.js")]);
      board = createBoard({
        Swal, dialog, rules: JSON.parse($("#gju-rules").textContent).rules || {},
        // Here the board only picks rows: the status is shown, not edited, and a row has no editor to open.
        statusField: (row) => { const select = document.createElement("select"); select.disabled = true; select.append(new Option(row.status || "—")); return select; },
        info: () => {}, onFiltered: () => {},
        onPick: (n) => { $("#picked-count").textContent = String(n); $("#btn-import-selected-rows").disabled = !n; },
      });
    }
    board.load(rows, JSON.parse($("#tracker-schema").textContent));
  } catch (err) {
    count.textContent = `Could not load your shortlist: ${err.message}`;
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// From a shortlisted job to its documents: ?job=<row id>, the advert's text,
// the ATS assessment (lib/ats-assess.mjs) and editing a generated document.
// ---------------------------------------------------------------------------

/** A tracker row as a posting for the workbench, from the columns the tracker really has (data/tracker-schema.json). */
function postingFromRow(r) {
  const posting = {
    rowId: r.id || "", // which shortlist row this came from: the table marks it as added
    company: r.company || "",
    position: r.position || "",
    location: r.city || "",
    kennziffer: r.job_id || "",
    url: r.job_url || r.app_url || "",
    text: "",
    baseText: [
      r.position && `Position: ${r.position}`,
      r.company && `Company: ${r.company}`,
      r.city && `Location: ${r.city}`,
      r.duration && `Duration: ${r.duration}`,
      r.start_date && `Start: ${r.start_date}`,
      r.full_part && `Hours: ${r.full_part}`,
      r.work_model && `Work model: ${r.work_model}`,
      r.req_skills && `Required skills: ${r.req_skills}`,
      r.req_german && `German: ${r.req_german}`,
      r.req_english && `English: ${r.req_english}`,
      r.notes && `Details: ${r.notes}`,
    ].filter(Boolean).join("\n"), // what the shortlist row knows: kept beside the box, sent with what the student pastes
  };
  return posting;
}

/** Opened from the Search page with ?job=<row id>: that posting is put on the workbench, its advert fetched and its rules checked. */
async function loadJobFromLink() {
  const id = new URLSearchParams(location.search).get("job");
  if (!id) return;
  const status = $("#workbench-status");
  try {
    const data = await apiJson("/__editor/applications");
    const row = (data.rows || []).find((item) => item.id === id);
    if (!row) { status.textContent = "That posting is no longer in your shortlist."; return; }
    state.postings = [postingFromRow(row)];
    renderPostingsInputs();
    openPanel("workbench-section");
    status.textContent = `Loaded from your shortlist: ${row.company || "a company"}, ${row.position || "a posting"}.`;
    if (state.postings[0].url) await fetchPostingText(0);
    await runPhase1();
  } catch (err) {
    status.textContent = `Could not load the posting: ${err.message}`;
  }
}

/** The advert's own text from its page, when the site allows a program to read it. Otherwise the reason, and the student pastes it. */
async function fetchPostingText(idx) {
  syncPostingInputsFromDom();
  const posting = state.postings[idx];
  const note = $(`[data-fetch-note="${idx}"]`);
  if (!posting?.url) { if (note) note.textContent = "Add the posting's link first."; return; }
  if (note) note.textContent = "Reading the advert…";
  try {
    const data = await apiJson("/__editor/internships/posting-text", { method: "POST", body: JSON.stringify({ url: posting.url }) });
    if (!data.ok) { if ($(`[data-fetch-note="${idx}"]`)) $(`[data-fetch-note="${idx}"]`).textContent = data.reason; return; }
    posting.text = [posting.text, data.text].filter(Boolean).join("\n\n");
    renderPostingsInputs();
    $(`[data-fetch-note="${idx}"]`).textContent = `Added ${data.text.length.toLocaleString()} characters from the advert's page.`;
  } catch (err) {
    if ($(`[data-fetch-note="${idx}"]`)) $(`[data-fetch-note="${idx}"]`).textContent = err.message;
  }
}

const STATUS_CLASS = { MET: "rule-pill rule-pass", PARTLY: "rule-pill rule-unclear", GAP: "rule-pill rule-fail" };
const PROOF_LABEL = { document: "Backed by a document", profile: "Stated in your profile", "": "" };

/** The ATS assessment of one posting as HTML. Every value from the model or the advert goes through esc(). */
function assessmentBlock(p, evalIdx) {
  const a = p.assessment;
  if (p.assessing) return `<div class="ats-assessment"><p class="muted"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Reading the advert against your profile and the ATS manual…</p></div>`;
  if (p.assessError) return `<div class="ats-assessment"><p class="ats-error">${esc(p.assessError)}</p></div>`;
  if (!a) return "";
  const count = (kind, status) => a.requirements.filter((item) => item.kind === kind && item.status === status).length;
  const parts = a.score.parts || {};
  const pct = (value) => (value == null ? "-" : `${Math.round(value * 100)}%`);
  const rows = a.requirements.map((item) => `
    <tr>
      <td>${esc(item.requirement)}${item.note ? `<br><small class="ats-error">${esc(item.note)}</small>` : ""}</td>
      <td>${item.kind === "must" ? "Must" : "Nice to have"}</td>
      <td><span class="${STATUS_CLASS[item.status]}">${item.status}</span></td>
      <td><code>${esc(item.term)}</code></td>
      <td>${esc(item.evidence) || "<span class=\"muted\">Nothing in your profile</span>"}${item.proof ? `<br><small class="proof proof-${item.proof}">${PROOF_LABEL[item.proof]}</small>` : ""}${item.wording ? `<br><small class="muted">Say it as: ${esc(item.wording)}</small>` : ""}</td>
      <td>${item.inCv == null ? "<span class=\"muted\">No CV checked</span>" : item.status === "GAP" ? "<span class=\"muted\">Leave out</span>" : item.inCv ? "<span class=\"rule-pill rule-pass\">In the CV</span>" : "<span class=\"rule-pill rule-unclear\">Not in the CV yet</span>"}</td>
    </tr>`).join("");
  const list = (items, render) => (items.length ? `<ul>${items.map((item) => `<li>${render(item)}</li>`).join("")}</ul>` : "<p class=\"muted\">None.</p>");
  return `
    <div class="ats-assessment">
      <div class="ats-head">
        <div class="ats-score" data-level="${a.score.total == null ? "none" : a.score.total >= 70 ? "ok" : a.score.total >= 45 ? "mid" : "low"}">
          <strong>${a.score.total == null ? "-" : a.score.total}</strong><span>${a.score.basis === "cv" ? "ATS readiness of this CV" : "Profile match, before writing"}</span>
        </div>
        <div class="ats-summary">
          <p><strong>Platform:</strong> ${esc(a.ats)}
            ${a.manual ? `<button type="button" class="btn btn--sm" data-open-manual="${esc(a.manual)}">Open its manual</button>` : "<span class=\"muted\">(no manual of its own: the shared rules were applied)</span>"}
            ${a.companyNote ? `<button type="button" class="btn btn--sm" data-open-manual="${esc(a.companyNote)}">Employer note</button>` : ""}</p>
          <p>The manual advises documents in <strong>${a.language === "en" ? "English" : "German"}</strong> for this posting.</p>
          <p>Must-haves: <strong>${count("must", "MET")}</strong> met, <strong>${count("must", "PARTLY")}</strong> partly, <strong>${count("must", "GAP")}</strong> gap${count("must", "GAP") === 1 ? "" : "s"}.
             Nice-to-haves: ${count("nice", "MET")} met, ${count("nice", "PARTLY")} partly, ${count("nice", "GAP")} missing.</p>
          <p class="muted">How the number is made: must-haves your profile proves ${pct(parts.profileMust)}, nice-to-haves ${pct(parts.profileNice)}${a.score.basis === "cv" ? `, supported terms a parser found in the CV ${pct(parts.inCv)}, parser-safe format ${pct(parts.format)}` : ""}.
             It is this tool's estimate, not the employer's score: the manuals are clear that no system is passed by wording alone, and a person decides in the end.</p>
          ${a.report?.ok ? `<p><strong>Parser check of ${esc(p.assessedFile || "the CV")}:</strong> ${a.report.fails} FAIL, ${a.report.warns} WARN${a.report.mustCoverage ? `, must-haves found ${esc(a.report.mustCoverage)}` : ""}.</p>` : a.report ? `<p class="ats-error">The CV could not be checked: ${esc(a.report.error)}</p>` : ""}
          <button type="button" class="btn btn--sm" data-assess="${evalIdx}"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Run the assessment again</button>
        </div>
      </div>
      <div class="doc-table-wrap"><table class="doc-table">
        <thead><tr><th>What the posting asks</th><th>Kind</th><th>Your profile</th><th>Term to use</th><th>Evidence</th><th>In the CV</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="ats-grid">
        <div class="copy-box"><strong>Supported keywords missing from the CV</strong>${a.score.basis === "cv" ? list(a.missingKeywords, (term) => `<code>${esc(term)}</code>`) : "<p class=\"muted\">Generate the CV, then run the assessment again to see which terms a parser finds in it.</p>"}
          <strong>Gaps (never added to your documents)</strong>${list(a.gaps, (gap) => `<code>${esc(gap.term)}</code> ${gap.kind === "must" ? "<span class=\"rule-pill rule-fail\">must-have</span>" : ""}`)}</div>
        <div class="copy-box"><strong>Weak areas</strong>${list(a.weakAreas, esc)}
          <strong>What to change, and why</strong>${list(a.recommendations, (r) => `${esc(r.action)}<br><small class="muted">Why: ${esc(r.why)}</small>`)}</div>
        <div class="copy-box"><strong>Questions the form will likely ask</strong>${list(a.knockouts, (k) => `${esc(k.question)}<br><small class="muted">Your true answer: ${esc(k.answer)}</small>`)}
          ${a.report?.ok ? `<details><summary>What the parser saw</summary><pre>${esc(a.report.reportMd)}</pre></details>` : ""}</div>
      </div>
    </div>`;
}

/** Assess a posting against the profile, and against its generated CV when there is one. Safe to run again at any time. */
async function assessPosting(evalIdx) {
  const p = state.evaluated[evalIdx];
  if (!p) return;
  const cvPdf = p.generated?.files?.cv?.pdf || "";
  Object.assign(p, { assessing: true, assessError: "" });
  renderEvaluationResults();
  try {
    const data = await apiJson("/__editor/internships/ats-assess", { method: "POST", body: JSON.stringify({ posting: { company: p.company, title: p.title, url: p.url, text: p.rawText }, tailorModel: getFormSettings().tailorModel, ...(cvPdf ? { folder: "CVs", name: cvPdf } : {}) }) });
    Object.assign(p, { assessment: data.assessment, assessedFile: data.checked });
  } catch (err) {
    p.assessError = err.message;
  }
  p.assessing = false;
  renderEvaluationResults();
}

// ---- edit the text of a generated document --------------------------------------------------------------------------

let editing = null;

async function openDocEditor(folder, name, evalIdx) {
  const dialog = $("#doc-edit");
  $("#doc-edit-title").textContent = name;
  $("#doc-edit-status").textContent = "";
  const list = $("#doc-edit-list");
  list.replaceChildren(Object.assign(document.createElement("p"), { className: "muted", textContent: "Loading the document…" }));
  dialog.showModal();
  try {
    const data = await apiJson(`/__editor/internships/doc-text?${new URLSearchParams({ folder, name })}`);
    editing = { folder, name, evalIdx, original: new Map(data.paragraphs.map((paragraph) => [paragraph.i, paragraph.text])) };
    list.replaceChildren(...data.paragraphs.map((paragraph) => {
      const area = document.createElement("textarea");
      area.value = paragraph.text;
      area.dataset.paragraph = paragraph.i;
      area.rows = Math.min(8, Math.max(1, Math.ceil(paragraph.text.length / 90)));
      return area;
    }));
  } catch (err) {
    list.replaceChildren(Object.assign(document.createElement("p"), { className: "ats-error", textContent: err.message }));
  }
}

async function saveDocEdits() {
  if (!editing) return;
  const edits = {};
  for (const area of $$("#doc-edit-list textarea")) if (area.value !== editing.original.get(Number(area.dataset.paragraph))) edits[area.dataset.paragraph] = area.value;
  const status = $("#doc-edit-status");
  if (!Object.keys(edits).length) { status.textContent = "Nothing was changed."; return; }
  status.textContent = "Saving a new version and making its PDF…";
  const p = state.evaluated[editing.evalIdx];
  try {
    const data = await apiJson("/__editor/internships/doc-text", { method: "POST", body: JSON.stringify({ folder: editing.folder, name: editing.name, edits }) });
    // The new version becomes the posting's current document; the one before it stays in the folder.
    if (p?.generated?.files) {
      const slot = editing.folder === "CVs" ? p.generated.files.cv : p.generated.files.cl;
      Object.assign(slot, { docx: data.files.docx, pdf: data.files.pdf, pages: data.files.pages });
    }
    if (data.studio) { state.studio = data.studio; renderStudioState(); }
    $("#doc-edit").close();
    $("#workbench-status").textContent = `Saved ${data.files.docx} (${data.changed} paragraph${data.changed === 1 ? "" : "s"} changed). The earlier version is still in the folder.`;
    renderEvaluationResults();
    // A changed CV is checked again straight away, so the assessment on the page is about the file that will be sent.
    if (p?.assessment && editing.folder === "CVs") assessPosting(editing.evalIdx);
  } catch (err) {
    status.textContent = err.message;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderPostingsInputs();
  loadStudioState();
  loadJobFromLink();
  $("#doc-edit-save")?.addEventListener("click", saveDocEdits);
  $("#doc-edit-cancel")?.addEventListener("click", () => $("#doc-edit").close());

  $("#btn-refresh-state")?.addEventListener("click", loadStudioState);

  // The AI pick is saved as soon as it changes (it sits by the Phase 2 button, away from Save settings). Every Generate and
  // assessment sends it anyway, so a failed save only loses it for next time.
  $("#set-tailor-model")?.addEventListener("change", (e) => {
    apiJson("/__editor/internships/settings", { method: "POST", body: JSON.stringify({ tailorModel: e.target.value }) })
      .catch((err) => { $("#workbench-status").textContent = `Could not save the AI choice: ${err.message}`; });
  });

  $("#studio-settings-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const statusEl = $("#settings-save-status");
    statusEl.textContent = "Saving…";
    try {
      const data = await apiJson("/__editor/internships/settings", {
        method: "POST",
        body: JSON.stringify(getFormSettings()),
      });
      state.studio = data;
      renderStudioState();
      statusEl.textContent = "Settings saved.";
    } catch (err) {
      statusEl.textContent = `Error: ${err.message}`;
    }
  });

  // Template uploads
  $$("[data-slot-upload]").forEach((input) => {
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      const slot = input.dataset.slotUpload;
      if (!file || !slot) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const data = await apiJson("/__editor/internships/template", {
            method: "POST",
            body: JSON.stringify({ slot, dataUrl: reader.result }),
          });
          state.studio = data;
          renderStudioState();
        } catch (err) {
          alert(`Template upload failed: ${err.message}`);
        }
      };
      reader.readAsDataURL(file);
    });
  });

  // Add / Remove posting cards
  $("#btn-add-posting")?.addEventListener("click", () => {
    syncPostingInputsFromDom();
    state.postings.push({ company: "", position: "", location: "", kennziffer: "", url: "", text: "" });
    renderPostingsInputs();
    const lastCard = $(`#postings-input-list [data-posting-idx="${state.postings.length - 1}"]`);
    lastCard?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    lastCard?.querySelector(`input[data-p-field="company"]`)?.focus({ preventScroll: true });
  });

  const removePosting = (e) => {
    const rmBtn = e.target.closest("[data-remove-posting]");
    if (!rmBtn) return;
    syncPostingInputsFromDom();
    const idx = Number(rmBtn.dataset.removePosting);
    state.postings.splice(idx, 1);
    if (state.postings.length === 1) state.postings[0].collapsed = false;
    renderPostingsInputs();
  };
  $("#postings-input-list")?.addEventListener("click", async (e) => {
    removePosting(e);

    const toggleBtn = e.target.closest("[data-toggle-posting]");
    if (toggleBtn) {
      syncPostingInputsFromDom();
      const idx = Number(toggleBtn.dataset.togglePosting);
      if (state.postings[idx]) {
        state.postings[idx].collapsed = !state.postings[idx].collapsed;
        renderPostingsInputs();
      }
      return;
    }

    const pasteBtn = e.target.closest("[data-paste-advert]");
    if (pasteBtn) {
      const idx = Number(pasteBtn.dataset.pasteAdvert);
      const area = $(`textarea[data-p-field="text"][data-idx="${idx}"]`);
      if (!area) return;
      try {
        const clip = await navigator.clipboard.readText();
        if (clip) {
          area.value = area.value.trim() ? `${area.value.trim()}\n\n${clip.trim()}` : clip.trim();
          syncPostingInputsFromDom();
          updatePostingCardMeta(idx);
          renderSelectedTable();
        }
      } catch {
        area.focus();
      }
      return;
    }

    const clearBtn = e.target.closest("[data-clear-advert]");
    if (clearBtn) {
      const idx = Number(clearBtn.dataset.clearAdvert);
      const area = $(`textarea[data-p-field="text"][data-idx="${idx}"]`);
      if (!area) return;
      area.value = "";
      syncPostingInputsFromDom();
      updatePostingCardMeta(idx);
      renderSelectedTable();
      area.focus();
    }
  });
  $("#selected-table")?.addEventListener("click", removePosting); // the table's own Remove buttons
  $("#selected-table")?.addEventListener("click", (e) => {
    const button = e.target.closest("[data-focus-advert]");
    if (!button) return;
    const idx = Number(button.dataset.focusAdvert);
    if (state.postings[idx]?.collapsed) {
      syncPostingInputsFromDom();
      state.postings[idx].collapsed = false;
      renderPostingsInputs();
    }
    const area = $(`textarea[data-p-field="text"][data-idx="${idx}"]`);
    if (!area) return;
    area.scrollIntoView({ behavior: "smooth", block: "center" });
    area.focus({ preventScroll: true });
  });
  // Pasting or typing updates the card header summary, status pill, and selected table live.
  const onPostingFieldUpdate = (e) => {
    if (!e.target.matches("[data-p-field]")) return;
    const idx = Number(e.target.dataset.idx);
    syncPostingInputsFromDom();
    updatePostingCardMeta(idx);
    renderSelectedTable();
  };
  $("#postings-input-list")?.addEventListener("input", onPostingFieldUpdate);
  $("#postings-input-list")?.addEventListener("change", onPostingFieldUpdate);

  // Tracker picker
  $("#btn-import-tracker")?.addEventListener("click", openTrackerPicker);
  $("#btn-close-tracker-picker")?.addEventListener("click", () => {
    $("#tracker-picker-card").hidden = true;
  });
  $("#btn-import-selected-rows")?.addEventListener("click", () => {
    syncPostingInputsFromDom();
    const have = new Set(state.postings.map((p) => p.rowId).filter(Boolean));
    const ticked = board.ticked();
    const picked = ticked.filter((r) => !have.has(r.id)).map(postingFromRow);
    board.unpick();
    if (!picked.length) { $("#workbench-status").textContent = "Those applications are already on the workbench."; return; }
    const blank = state.postings.length === 1 && !state.postings[0].company && !state.postings[0].position && !state.postings[0].text;
    state.postings = [...(blank ? [] : state.postings), ...picked];
    renderPostingsInputs();
    $("#tracker-picker-card").hidden = true;
    $("#postings-input-list").scrollIntoView({ behavior: "smooth" });
    $("#workbench-status").textContent = `Added ${picked.length} application${picked.length === 1 ? "" : "s"}${ticked.length > picked.length ? " (the rest were already there)" : ""}. Add each advert's text, then run Phase 1.`;
  });

  // Phase 1 & Phase 2 buttons
  $("#btn-run-phase1")?.addEventListener("click", runPhase1);
  $("#btn-run-phase2-all")?.addEventListener("click", generateAllEligible);
  $("#btn-download-brief")?.addEventListener("click", downloadBrief);

  // Delegated clicks inside evaluation results, archive, city lookup
  document.addEventListener("click", async (e) => {
    const assessBtn = e.target.closest("[data-assess]");
    if (assessBtn) {
      await assessPosting(Number(assessBtn.dataset.assess));
      return;
    }
    const fetchBtn = e.target.closest("[data-fetch-text]");
    if (fetchBtn) {
      await fetchPostingText(Number(fetchBtn.dataset.fetchText));
      return;
    }
    const editBtn = e.target.closest("[data-edit-doc]");
    if (editBtn) {
      await openDocEditor(editBtn.dataset.editDoc, editBtn.dataset.docName, Number(editBtn.dataset.eval));
      return;
    }

    const genBtn = e.target.closest("[data-generate-single]");
    if (genBtn) {
      await generateForEvaluatedIndex(Number(genBtn.dataset.generateSingle));
      return;
    }

    const copyBtn = e.target.closest("[data-copy-text]");
    if (copyBtn) {
      const text = copyBtn.dataset.copyText || "";
      await navigator.clipboard.writeText(text).catch(() => {});
      const prev = copyBtn.innerHTML;
      copyBtn.innerHTML = `<i class="fa-solid fa-check" aria-hidden="true"></i> Copied`;
      setTimeout(() => {
        copyBtn.innerHTML = prev;
      }, 1500);
      return;
    }

    const manualBtn = e.target.closest("[data-open-manual]");
    if (manualBtn) {
      const path = manualBtn.dataset.openManual;
      const sel = $("#ats-manual-select");
      if (sel) sel.value = path;
      await loadManualContent(path);
      openPanel("ats-section");
      return;
    }

    const quickAtsBtn = e.target.closest("[data-quick-ats]");
    if (quickAtsBtn) {
      const folder = quickAtsBtn.dataset.quickAts;
      const pdfName = quickAtsBtn.dataset.pdfName;
      $("#ats-folder-select").value = folder;
      renderAtsSelectors();
      $("#ats-pdf-select").value = pdfName;
      openPanel("ats-section");
      await runAtsCheck(folder, pdfName, $("#ats-keywords-input")?.value || "");
    }
  });

  // Archive search
  $("#archive-filter")?.addEventListener("input", renderArchiveLists);

  // ATS controls
  $("#ats-folder-select")?.addEventListener("change", renderAtsSelectors);
  $("#btn-run-ats")?.addEventListener("click", () => {
    runAtsCheck(
      $("#ats-folder-select")?.value || "CVs",
      $("#ats-pdf-select")?.value || "",
      $("#ats-keywords-input")?.value || ""
    );
  });
  $("#ats-manual-select")?.addEventListener("change", (e) => {
    loadManualContent(e.target.value);
  });

  // City housing search
  $("#city-lookup-input")?.addEventListener("input", (e) => {
    renderCityLookup(e.target.value);
  });
});
