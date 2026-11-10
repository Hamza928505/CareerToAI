/**
 * Client controller for the GJU Pflichtpraktikum CVs & Cover Letters Studio (/documents/)
 */

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
  trackerRows: [],
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

function renderPostingsInputs() {
  const listEl = $("#postings-input-list");
  if (!listEl) return;
  listEl.innerHTML = state.postings
    .map(
      (p, idx) => `
      <div class="posting-input-card" data-posting-idx="${idx}">
        <div class="posting-input-head">
          <span class="posting-num-badge">Posting #${idx + 1}</span>
          ${
            state.postings.length > 1
              ? `<button type="button" class="btn btn--sm" data-remove-posting="${idx}"><i class="fa-solid fa-trash" aria-hidden="true"></i> Remove</button>`
              : ""
          }
        </div>
        <div class="posting-meta-grid">
          <label class="doc-field">
            <span>Company</span>
            <input type="text" data-p-field="company" data-idx="${idx}" value="${esc(p.company)}" placeholder="e.g. BMW Group, Siemens, SAP…">
          </label>
          <label class="doc-field">
            <span>Position Title</span>
            <input type="text" data-p-field="position" data-idx="${idx}" value="${esc(p.position)}" placeholder="e.g. Praktikum Machine Learning / AI (m/w/d)">
          </label>
          <label class="doc-field">
            <span>City / Location</span>
            <input type="text" data-p-field="location" data-idx="${idx}" value="${esc(p.location)}" placeholder="e.g. München, Berlin, Stuttgart…">
          </label>
          <label class="doc-field">
            <span>Kennziffer / Ref ID (optional)</span>
            <input type="text" data-p-field="kennziffer" data-idx="${idx}" value="${esc(p.kennziffer)}" placeholder="e.g. DE-12345">
          </label>
          <label class="doc-field">
            <span>Posting URL (optional)</span>
            <input type="url" data-p-field="url" data-idx="${idx}" value="${esc(p.url)}" placeholder="https://…">
          </label>
        </div>
        <label class="doc-field">
          <span>Full Posting Text (paste German or English job advertisement text here)</span>
          <textarea class="posting-textarea" data-p-field="text" data-idx="${idx}" placeholder="Paste the full job description, requirements, duration, hours, and contact person…">${esc(p.text)}</textarea>
        </label>
      </div>
    `
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
              <button type="button" class="btn btn--primary" data-generate-single="${evalIdx}">
                <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
                ${genFiles ? "Regenerate New Version (_v2+)" : "Generate Tailored CV & CL (.docx + .pdf)"}
              </button>
            </div>
          </div>

          ${generatedBlock}

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
                <strong>Covered from <code>gju-profile.json</code>:</strong>
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

async function runPhase1() {
  syncPostingInputsFromDom();
  const valid = state.postings
    .filter((p) => p.text.trim() || p.company.trim() || p.position.trim())
    .map((p) => ({
      company: p.company,
      title: p.position,
      position: p.position,
      location: p.location,
      ref: p.kennziffer,
      url: p.url,
      text: p.text,
    }));
  if (!valid.length) {
    $("#workbench-status").textContent = "Paste at least one internship posting first.";
    return;
  }
  const btn = $("#btn-run-phase1");
  btn.disabled = true;
  $("#workbench-status").textContent = `Running Part A GJU rules check on ${valid.length} posting(s)…`;
  try {
    const settings = getFormSettings();
    const res = await apiJson("/__editor/internships/evaluate", {
      method: "POST",
      body: JSON.stringify({ postings: valid, settings }),
    });
    state.evaluated = res.overview || res.evaluated || [];
    renderEvaluationResults();
    $("#workbench-status").textContent = `Evaluated ${state.evaluated.length} posting(s). Review verdicts below or click Generate.`;
  } catch (err) {
    $("#workbench-status").textContent = `Error: ${err.message}`;
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
      body: JSON.stringify({ posting: target, settings }),
    });
    state.evaluated[evalIdx].generated = res;
    if (res.studio) {
      state.studio = res.studio;
      renderStudioState();
    }
    renderEvaluationResults();
    if (res.files) {
      $("#workbench-status").textContent = `Saved ${res.files.cv.docx} and ${res.files.cl.docx} (+ PDFs) in Desktop\\Internships!`;
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
  for (const idx of indices) {
    await generateForEvaluatedIndex(idx);
  }
  btn.disabled = false;
}

function getFormSettings() {
  return {
    docLang: $("#set-doc-lang")?.value || "de",
    earliestStart: $("#set-earliest-start")?.value || "01.03.2027",
    latestEnd: $("#set-latest-end")?.value || "30.09.2027",
    preferredDuration: $("#set-preferred-duration")?.value || "6 Monate",
    rejectedPolicy: $("#set-rejected-policy")?.value || "negotiable",
    matchCityAddress: Boolean($("#set-match-city")?.checked),
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

async function openTrackerPicker() {
  const card = $("#tracker-picker-card");
  const listEl = $("#tracker-picker-list");
  if (!card || !listEl) return;
  card.hidden = false;
  listEl.innerHTML = `<span class="muted">Loading Workspace tracker rows…</span>`;
  try {
    const data = await apiJson("/__editor/applications");
    state.trackerRows = data.rows || [];
    renderTrackerPickerList("");
  } catch (err) {
    listEl.innerHTML = `<span class="muted">Could not load tracker rows: ${esc(err.message)}</span>`;
  }
}

function renderTrackerPickerList(query = "") {
  const listEl = $("#tracker-picker-list");
  if (!listEl) return;
  const q = query.trim().toLowerCase();
  const rows = state.trackerRows.filter(
    (r) =>
      !q ||
      String(r.company || "").toLowerCase().includes(q) ||
      String(r.position || "").toLowerCase().includes(q) ||
      String(r.location || "").toLowerCase().includes(q)
  );
  if (!rows.length) {
    listEl.innerHTML = `<span class="muted">No matching rows in tracker.</span>`;
    return;
  }
  listEl.innerHTML = rows
    .slice(0, 60)
    .map(
      (r, idx) => `
      <label class="tracker-picker-item">
        <input type="checkbox" data-tracker-pick="${idx}" value="${esc(r.id || idx)}">
        <span>
          <strong>${esc(r.company || "Unknown")}</strong> — ${esc(r.position || "Internship")}
          <small class="muted">(${esc(r.location || "Germany")} · GJU: ${esc(r.gju_check || "Check")})</small>
        </span>
      </label>
    `
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  renderPostingsInputs();
  loadStudioState();

  $("#btn-refresh-state")?.addEventListener("click", loadStudioState);

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
  });

  $("#postings-input-list")?.addEventListener("click", (e) => {
    const rmBtn = e.target.closest("[data-remove-posting]");
    if (!rmBtn) return;
    syncPostingInputsFromDom();
    const idx = Number(rmBtn.dataset.removePosting);
    state.postings.splice(idx, 1);
    renderPostingsInputs();
  });

  // Tracker picker
  $("#btn-import-tracker")?.addEventListener("click", openTrackerPicker);
  $("#btn-close-tracker-picker")?.addEventListener("click", () => {
    $("#tracker-picker-card").hidden = true;
  });
  $("#tracker-picker-search")?.addEventListener("input", (e) => {
    renderTrackerPickerList(e.target.value);
  });
  $("#btn-import-selected-rows")?.addEventListener("click", () => {
    syncPostingInputsFromDom();
    const checked = $$("[data-tracker-pick]:checked");
    if (!checked.length) return;
    const picked = checked
      .map((cb) => state.trackerRows.find((r, i) => String(r.id || i) === cb.value))
      .filter(Boolean)
      .map((r) => ({
        company: r.company || "",
        position: r.position || "",
        location: r.location || "",
        kennziffer: r.ref_id || "",
        url: r.job_url || r.app_url || "",
        text: [
          r.position && `Position: ${r.position}`,
          r.company && `Company: ${r.company}`,
          r.location && `Location: ${r.location}`,
          r.duration && `Duration: ${r.duration}`,
          r.hours && `Hours: ${r.hours}`,
          r.remote && `Work mode: ${r.remote}`,
          r.skills && `Required skills: ${r.skills}`,
          r.notes && `Details: ${r.notes}`,
          r.description && r.description,
        ]
          .filter(Boolean)
          .join("\n"),
      }));

    if (
      state.postings.length === 1 &&
      !state.postings[0].company &&
      !state.postings[0].position &&
      !state.postings[0].text
    ) {
      state.postings = picked;
    } else {
      state.postings.push(...picked);
    }
    renderPostingsInputs();
    $("#tracker-picker-card").hidden = true;
  });

  // Phase 1 & Phase 2 buttons
  $("#btn-run-phase1")?.addEventListener("click", runPhase1);
  $("#btn-run-phase2-all")?.addEventListener("click", generateAllEligible);

  // Delegated clicks inside evaluation results, archive, city lookup
  document.addEventListener("click", async (e) => {
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
      $("#ats-section")?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    const quickAtsBtn = e.target.closest("[data-quick-ats]");
    if (quickAtsBtn) {
      const folder = quickAtsBtn.dataset.quickAts;
      const pdfName = quickAtsBtn.dataset.pdfName;
      $("#ats-folder-select").value = folder;
      renderAtsSelectors();
      $("#ats-pdf-select").value = pdfName;
      $("#ats-section")?.scrollIntoView({ behavior: "smooth" });
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
