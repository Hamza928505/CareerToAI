import Swal from "./sweetalert2.esm.min.js";

const dialog = {
  buttonsStyling: false,
  customClass: {
    popup: "swal-popup",
    title: "swal-title",
    htmlContainer: "swal-html",
    confirmButton: "btn btn-primary",
    cancelButton: "btn",
    denyButton: "btn btn-danger",
  },
};
/**
 * Workspace behaviour.
 *
 * Two modes, decided by one probe:
 *
 *   local     — `npm run editor` is serving the page, so /__editor/* exists.
 *               Tasks run, the tracker loads, rows can be added.
 *   published — the static site on Pages. Nothing can run; the page says so
 *               plainly and the eligibility checker still works, because it is
 *               pure arithmetic in the browser.
 *
 * Every threshold comes from data/gju-rules.json, embedded in the page — this
 * file states no rule of its own.
 */

const json = (id) => {
  const el = document.getElementById(id);
  try {
    return el ? JSON.parse(el.textContent) : null;
  } catch {
    return null;
  }
};

const GJU = json("gju-rules") || { rules: {}, countries: [], score: [] };
const SCHEMA = json("tracker-schema") || { statuses: [], columns: [] };
const RULES = GJU.rules;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/** The editor server lives at the site root, above any path prefix. */
const api = (route) => new URL(`/__editor/${route}`, location.origin).href;

let local = false;

// ---------------------------------------------------------------- mode probe

async function detectMode() {
  const pill = $("#mode-pill");
  try {
    const res = await fetch(api("status"), { cache: "no-store" });
    if (!res.ok) throw new Error("no helper");
    await res.json();
    local = true;
    pill.className = "pill pill--ok";
    pill.textContent = "Local mode — tasks can run";
  } catch {
    local = false;
    pill.className = "pill pill--idle";
    pill.textContent = "Published — read only";
    $("#published-notice").hidden = false;
    $$("[data-run]").forEach((b) => {
      b.disabled = true;
      b.title = "Run `npm run editor` locally to enable this";
    });
    $("#row-submit").disabled = true;
  }
  $("#mode").dataset.state = local ? "local" : "published";
}

// --------------------------------------------------------------- run a task

const log = $("#log");
const logWrap = $("#log-wrap");

function write(line, cls) {
  const span = document.createElement("span");
  if (cls) span.className = cls;
  span.textContent = line.endsWith("\n") ? line : `${line}\n`;
  log.append(span);
  log.scrollTop = log.scrollHeight;
}

async function runTask(name, button) {
  const card = button.closest(".task");
  const label = button.textContent;

  card.dataset.busy = "true";
  button.disabled = true;
  button.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right: 0.3rem;"></i>Running...';
  logWrap.hidden = false;
  $("#log-title").textContent = `Output — ${name}`;
  log.textContent = "";
  write(`$ npm run ${name === "skills" ? "skills:harvest" : name}`);

  try {
    const res = await fetch(api("run"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: name }),
    });
    const data = await res.json();

    if (data.output) write(data.output.trimEnd());
    if (data.error) write(data.error.trimEnd(), "err");
    write(
      data.ok ? "✓ done" : `✗ exited with code ${data.code}`,
      data.ok ? "ok" : "err",
    );
    if (data.ok && (name === "tracker" || name === "profile")) loadTracker();
  } catch (error) {
    write(`✗ ${error.message}`, "err");
  } finally {
    card.dataset.busy = "false";
    button.disabled = false;
    button.textContent = label;
  }
}

$$("[data-run]").forEach((btn) =>
  btn.addEventListener("click", () => runTask(btn.dataset.run, btn)),
);

$("#log-close")?.addEventListener("click", () => {
  logWrap.hidden = true;
});

// -------------------------------------------------------------- copy a line

$$("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const text = btn.dataset.copy;
    const label = btn.innerHTML;
    try {
      await navigator.clipboard.writeText(text);
      btn.innerHTML = '<i class="fa-solid fa-check" style="margin-right: 0.3rem;"></i>Copied';
    } catch {
      btn.innerHTML = '<i class="fa-regular fa-keyboard" style="margin-right: 0.3rem;"></i>Ctrl+C';
      const range = document.createRange();
      range.selectNodeContents(btn.closest(".cmd").querySelector(".cmd-text"));
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    setTimeout(() => {
      btn.innerHTML = label;
    }, 2000);
  });
});

// ------------------------------------------------------- eligibility checker

/**
 * The same five weighted dimensions the workbook's Fit % formula uses, minus
 * the skills term — that one needs the advert text, which this form does not
 * ask for. The maximum is scaled accordingly so a percentage still means
 * something.
 */
function score({ weeks, country, paid, pay, language, german }) {
  const weight = Object.fromEntries(GJU.score.map(([name, points]) => [name, points]));
  const countryRow = GJU.countries.find((c) => c[0] === country);
  const parts = [];
  const flags = [];

  // Duration
  let duration = 0;
  if (weeks >= RULES.minWeeks) duration = weight.Duration;
  else if (weeks >= 15) duration = weight.Duration / 2;
  parts.push({ name: "Duration", got: duration, max: weight.Duration });
  if (weeks && weeks < RULES.minWeeks) {
    flags.push({
      level: "fail",
      text: `Under the ${RULES.minWeeks}-week minimum — GJU will not recognise it as the German Year placement.`,
    });
  }

  // Country
  const countryPoints = countryRow ? countryRow[1] : 0;
  parts.push({ name: "Country", got: countryPoints, max: weight.Country });
  if (countryRow && countryRow[0] !== "Germany") {
    flags.push({
      level: countryPoints === 0 ? "fail" : "warn",
      text: `${countryRow[0]}: ${countryRow[2]}.`,
    });
  }

  // Pay
  let paidPoints = 5;
  if (paid === "Yes") paidPoints = pay >= RULES.minMonthlySalary ? weight.Paid : 10;
  else if (paid === "No") paidPoints = 0;
  parts.push({ name: "Paid", got: paidPoints, max: weight.Paid });
  if (paid === "Yes" && pay && pay < RULES.minMonthlySalary) {
    flags.push({
      level: "warn",
      text: `${pay} EUR/month is below the ${RULES.minMonthlySalary} EUR/month a visa extension asks you to prove.`,
    });
  }
  if (paid === "No") {
    flags.push({ level: "warn", text: "Unpaid — budget 700–1000 EUR/month to live on." });
  }

  // Language
  const goodGerman = ["B2", "C1", "C2"].includes(german);
  let langPoints = 0;
  if (language === "English" || language === "Both") langPoints = weight.Language;
  else if (language === "German") langPoints = goodGerman ? weight.Language : weight.Language / 2;
  parts.push({ name: "Language", got: langPoints, max: weight.Language });
  if (language === "German" && !goodGerman) {
    flags.push({
      level: "warn",
      text: `A German-only workplace at ${german}. Doable, but the Anschreiben and the interview will be the hard part.`,
    });
  }

  const got = parts.reduce((sum, p) => sum + p.got, 0);
  const max = parts.reduce((sum, p) => sum + p.max, 0);
  return { parts, flags, percent: Math.round((got / max) * 100) };
}

function renderVerdict(result, weeks) {
  const box = $("#verdict");
  const hardFail = result.flags.some((f) => f.level === "fail");
  const level = hardFail ? "fail" : result.flags.length ? "warn" : "pass";

  const heading = {
    fail: "Not eligible as it stands",
    warn: "Eligible, with things to check",
    pass: "Eligible on every rule checked",
  }[level];

  const lead = {
    fail: "One of the hard GJU rules fails. Fix it with the employer before you spend an evening on the Anschreiben.",
    warn: "Nothing here disqualifies it, but these need an answer before you apply.",
    pass: `Nothing in the ${RULES.minWeeks}-week, country, pay or language rules stands against it.`,
  }[level];

  box.dataset.verdict = level;
  box.hidden = false;
  box.innerHTML = `
    <div class="verdict-head">
      <h3>${heading}</h3>
      <span class="pill pill--${level === "fail" ? "no" : level === "warn" ? "warn" : "ok"}">
        ${weeks} weeks
      </span>
      <span class="score">${result.percent}%</span>
    </div>
    <p>${lead}</p>
    ${
      result.flags.length
        ? `<ul>${result.flags
            .map((f) => `<li><strong>${f.level === "fail" ? "Blocks it" : "Check"}:</strong> ${f.text}</li>`)
            .join("")}</ul>`
        : ""
    }
    <ul class="breakdown">
      ${result.parts
        .map(
          (p) => `<li>
            <span>${p.name}</span>
            <span class="bar"><span style="width:${(p.got / p.max) * 100}%"></span></span>
            <span class="pts">${p.got} / ${p.max}</span>
          </li>`,
        )
        .join("")}
    </ul>
    <p class="help">
      Skills matching is left out here — it needs the advert text. Run
      <code>/apply</code> for the full score.
    </p>`;
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

$("#checker")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;

  // Validate on submit, and put the message next to the field that failed.
  form.querySelectorAll(".error").forEach((el) => el.remove());
  let firstBad = null;

    let missing = [];
  for (const id of ["f-weeks", "f-country"]) {
    const input = document.getElementById(id);
    input.removeAttribute("aria-invalid");
    if (!input.value) {
      input.setAttribute("aria-invalid", "true");
      missing.push(id === "f-weeks" ? "Duration (weeks)" : "Country");
      firstBad = firstBad || input;
    }
  }
  if (firstBad) {
    Swal.fire({ ...dialog, icon: "warning", title: "Missing fields", html: `Please provide: <strong>${missing.join(", ")}</strong>`, confirmButtonText: "OK" });
    firstBad.focus();
    return;
  }

  const weeks = Number($("#f-weeks").value);
  renderVerdict(
    score({
      weeks,
      country: $("#f-country").value,
      paid: $("#f-paid").value,
      pay: Number($("#f-pay").value) || 0,
      language: $("#f-language").value,
      german: $("#f-german").value,
    }),
    weeks,
  );
});

$("#checker")?.addEventListener("reset", () => {
  $("#verdict").hidden = true;
  $("#checker").querySelectorAll(".error").forEach((el) => el.remove());
});

// ---------------------------------------------------------------- tracker

const OPEN = new Set(SCHEMA.statuses.filter((s) => s.open).map((s) => s.value));

function renderTracker(rows) {
  const wrap = $("#tracker-wrap");
  const empty = $("#tracker-empty");

  if (!rows.length) {
    wrap.hidden = true;
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  wrap.hidden = false;

  const body = $("#tracker-table tbody");
  body.textContent = "";

  for (const row of rows) {
    const weeks = Number(row.weeks);
    const flags = [];
    if (weeks && weeks < RULES.minWeeks) flags.push(`under ${RULES.minWeeks} weeks`);
    if (row.paid === "No") flags.push("unpaid");
    if (row.sent && !row.followed) flags.push("follow up?");

    const status = (row.status || "").trim();
    const tone = !status ? "idle" : OPEN.has(status) ? "ok" : "idle";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(row.company)}</td>
      <td>${esc(row.role)}</td>
      <td>${esc(row.country)}</td>
      <td class="num">${esc(row.weeks)}</td>
      <td><span class="pill pill--${tone}">${esc(status) || "—"}</span></td>
      <td class="date">${esc(row.sent) || "—"}</td>
      <td class="flags">${flags.length ? esc(flags.join(" · ")) : "—"}</td>`;
    body.append(tr);
  }
}

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

function renderStats(rows) {
  const count = (fn) => rows.filter(fn).length;
  $("#stat-total").textContent = rows.length;
  $("#stat-open").textContent = count((r) => OPEN.has((r.status || "").trim()));
  $("#stat-toapply").textContent = count((r) => (r.status || "").trim() === "To apply");
  $("#stat-interview").textContent = count(
    (r) => (r.status || "").trim() === "Interview" || r.interview,
  );

  if (window.renderChart && rows.length > 0) {
    const statusCounts = {};
    rows.forEach(r => {
      const s = (r.status || "Unknown").trim();
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });
    const statusData = Object.keys(statusCounts).map(k => ({ label: k, value: statusCounts[k] }));
    try {
      window.renderChart(document.getElementById("chart-status"), {
        chart: "pie",
        data: statusData
      });
    } catch (e) { console.error("Chart error:", e); }

    const monthCounts = {};
    rows.forEach(r => {
      if (r.sent) {
        const d = new Date(r.sent);
        if (!isNaN(d)) {
          const m = d.toISOString().substring(0, 7);
          monthCounts[m] = (monthCounts[m] || 0) + 1;
        }
      }
    });
    const timelineData = Object.keys(monthCounts).sort().map(k => ({ label: k, value: monthCounts[k] }));
    if (timelineData.length > 0) {
      try {
        window.renderChart(document.getElementById("chart-timeline"), {
          chart: "bar-vertical",
          data: timelineData
        });
      } catch (e) { console.error("Chart error:", e); }
    }
  }
}

async function loadTracker() {
  if (!local) {
    ["#stat-total", "#stat-open", "#stat-toapply", "#stat-interview"].forEach((s) => {
      let el = document.querySelector(s);
      if (el) el.textContent = "�";
    });
    return;
  }
  try {
    const res = await fetch(api("tracker"), { cache: "no-store" });
    const data = await res.json();
    const rows = Array.isArray(data.rows) ? data.rows : [];
    renderStats(rows);
    renderTracker(rows);
  } catch {
    /* The helper went away mid-session; the empty state already says enough. */
  }
}

$("#row-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $("#row-status");
  const company = $("#r-company");

  if (!company.value.trim()) {
    company.setAttribute("aria-invalid", "true");
    Swal.fire({ ...dialog, icon: "error", title: "Missing Company", html: `<p class="swal-note">A row needs a company name - that is how every command finds it again.</p>`, confirmButtonText: "OK" });
    company.focus();
    return;
  }
  company.removeAttribute("aria-invalid");

  const row = Object.fromEntries(new FormData(form).entries());
  const submit = $("#row-submit");
  submit.disabled = true;
  submit.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right: 0.3rem;"></i>Adding...';

  try {
    const res = await fetch(api("tracker"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ row }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "could not write the tracker");

    Swal.fire({ ...dialog, icon: "success", title: "Row Added", html: `Added. ${data.rows} row(s) in data/tracker.csv <br> run "Rebuild the workbook" to recompute Fit %.`, confirmButtonText: "Got it" }); form.reset();
    form.reset();
    loadTracker();
  } catch (error) {
    Swal.fire({ ...dialog, icon: "error", title: "Error", text: error.message, confirmButtonText: "OK" });
  } finally {
    submit.disabled = false;
    submit.innerHTML = '<i class="fa-solid fa-file-csv" style="margin-right: 0.3rem;"></i>Add to tracker';
  }
});

// -------------------------------------------------------------------- start

await detectMode();
await loadTracker();





// ----------------------------------------------------------- Tracker UI
let currentWorkbook = null;
let currentSheetName = null;
let currentData = [];
let currentHeaders = [];

const fileInput = document.getElementById("tracker-upload");
const btnUpload = document.getElementById("btn-upload-tracker");
const btnAddRow = document.getElementById("btn-add-row");
const btnSave = document.getElementById("btn-save-tracker");
const tableWrap = document.getElementById("tracker-table-wrap");
const tbody = document.getElementById("tracker-tbody");
const theadTr = document.getElementById("tracker-thead-tr");

if (btnUpload && fileInput) {
  btnUpload.addEventListener("click", () => fileInput.click());
  
  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    btnUpload.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right: 0.3rem;"></i> Loading...';
    
    try {
      const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs');
      const arrayBuffer = await file.arrayBuffer();
      currentWorkbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
      
      currentSheetName = currentWorkbook.SheetNames.includes("Applications") ? "Applications" : currentWorkbook.SheetNames[0];
      const sheet = currentWorkbook.Sheets[currentSheetName];
      
      const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      if (rawData.length < 1) {
        Swal.fire({ ...dialog, icon: "error", title: "Error", text: "The Excel file is empty.", confirmButtonText: "OK" });
        btnUpload.innerHTML = '<i class="fa-solid fa-file-excel" style="margin-right: 0.3rem;"></i> Upload Excel';
        return;
      }
      
      currentHeaders = rawData[0];
      currentData = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      
      renderTable();
      
      btnUpload.innerHTML = '<i class="fa-solid fa-file-excel" style="margin-right: 0.3rem;"></i> Upload Different File';
      btnAddRow.style.display = "inline-block";
      btnSave.style.display = "inline-block";
      tableWrap.style.display = "block";
      
      Swal.fire({ ...dialog, 
        toast: true,
        position: 'bottom-end',
        icon: 'success',
        title: 'Tracker loaded successfully!',
        showConfirmButton: false,
        timer: 2000
      });
    } catch (err) {
      console.error(err);
      Swal.fire({ ...dialog, icon: "error", title: "Error", text: "Could not parse the Excel file.", confirmButtonText: "OK" });
      btnUpload.innerHTML = '<i class="fa-solid fa-file-excel" style="margin-right: 0.3rem;"></i> Upload Excel';
    }
  });
}

function renderTable() {
  theadTr.innerHTML = "<th style=\"position: sticky; left: 0; z-index: 2; background: var(--surface);\">Actions</th>" + 
    currentHeaders.map(h => `<th>${h || ''}</th>`).join("");
  
  tbody.innerHTML = "";
  currentData.forEach((row, index) => {
    const tr = document.createElement("tr");
    
    // Actions column
    const tdActions = document.createElement("td");
    tdActions.style.whiteSpace = "nowrap";
    tdActions.style.position = "sticky";
    tdActions.style.left = "0";
    tdActions.style.background = "var(--surface)";
    tdActions.style.zIndex = "1";
    tdActions.innerHTML = `
      <button class="btn" style="padding: 0.2rem 0.5rem; font-size: 0.8em; margin-right: 0.3rem;" onclick="window.editTrackerRow(${index})">
        <i class="fa-solid fa-pen"></i>
      </button>
      <button class="btn" style="padding: 0.2rem 0.5rem; font-size: 0.8em; color: var(--text-error);" onclick="window.deleteTrackerRow(${index})">
        <i class="fa-solid fa-trash"></i>
      </button>
    `;
    tr.appendChild(tdActions);
    
    currentHeaders.forEach(header => {
      const td = document.createElement("td");
      let val = row[header];
      if (val instanceof Date) {
        val = val.toLocaleDateString();
      }
      td.textContent = val;
      // Truncate long text
      td.style.maxWidth = "200px";
      td.style.overflow = "hidden";
      td.style.textOverflow = "ellipsis";
      td.style.whiteSpace = "nowrap";
      td.title = val;
      tr.appendChild(td);
    });
    
    tbody.appendChild(tr);
  });
}

window.deleteTrackerRow = function(index) {
  Swal.fire({ ...dialog, 
    title: 'Delete Application?',
    text: "You won't be able to revert this! (Unless you don't save)",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, delete it!'
  }).then((result) => {
    if (result.isConfirmed) {
      currentData.splice(index, 1);
      renderTable();
      Swal.fire({ ...dialog, toast:true, position:'bottom-end', icon:'success', title:'Deleted!', showConfirmButton:false, timer:2000});
    }
  });
};

window.editTrackerRow = function(index) {
  const row = currentData[index];
  
  const htmlForm = `
    <div style="display:flex; flex-direction:column; gap:0.5rem; text-align:left;">
      <label><strong>Company</strong><br/><input id="edit-company" class="swal2-input" style="margin:0; width:100%" value="${row['Company'] || row['Company name'] || ''}" /></label>
      <label><strong>Position</strong><br/><input id="edit-pos" class="swal2-input" style="margin:0; width:100%" value="${row['Position'] || ''}" /></label>
      <label><strong>Status</strong><br/>
        <select id="edit-status" class="swal2-select" style="margin:0; width:100%">
          <option ${row['Status']=='To apply'?'selected':''}>To apply</option>
          <option ${row['Status']=='Applied'?'selected':''}>Applied</option>
          <option ${row['Status']=='Interview scheduled'?'selected':''}>Interview scheduled</option>
          <option ${row['Status']=='Offer'?'selected':''}>Offer</option>
          <option ${row['Status']=='Rejected'?'selected':''}>Rejected</option>
          <option ${row['Status']=='Ghosted'?'selected':''}>Ghosted</option>
        </select>
      </label>
      <label><strong>Notes</strong><br/><input id="edit-notes" class="swal2-input" style="margin:0; width:100%" value="${row['Notes'] || ''}" /></label>
    </div>
  `;
  
  Swal.fire({ ...dialog, 
    title: 'Edit Application',
    html: htmlForm,
    showCancelButton: true,
    confirmButtonText: 'Save',
    preConfirm: () => {
      // Find the correct header names to modify based on the schema uploaded
      const getHeader = (names) => currentHeaders.find(h => names.includes(h));
      
      const c = getHeader(['Company', 'Company name']);
      if(c) row[c] = document.getElementById('edit-company').value;
      
      const p = getHeader(['Position']);
      if(p) row[p] = document.getElementById('edit-pos').value;
      
      const s = getHeader(['Status', 'Application status']);
      if(s) row[s] = document.getElementById('edit-status').value;
      
      const n = getHeader(['Notes']);
      if(n) row[n] = document.getElementById('edit-notes').value;
      
      return true;
    }
  }).then((result) => {
    if (result.isConfirmed) {
      renderTable();
    }
  });
};

if(btnAddRow) {
  btnAddRow.addEventListener("click", () => {
    const row = {};
    currentHeaders.forEach(h => row[h] = "");
    
    const htmlForm = `
      <div style="display:flex; flex-direction:column; gap:0.5rem; text-align:left;">
        <label><strong>Company</strong><br/><input id="add-company" class="swal2-input" style="margin:0; width:100%" /></label>
        <label><strong>Position</strong><br/><input id="add-pos" class="swal2-input" style="margin:0; width:100%" /></label>
        <label><strong>Status</strong><br/>
          <select id="add-status" class="swal2-select" style="margin:0; width:100%">
            <option>To apply</option>
            <option>Applied</option>
            <option>Interview scheduled</option>
            <option>Offer</option>
            <option>Rejected</option>
            <option>Ghosted</option>
          </select>
        </label>
      </div>
    `;
    
    Swal.fire({ ...dialog, 
      title: 'Add Application',
      html: htmlForm,
      showCancelButton: true,
      confirmButtonText: 'Add',
      preConfirm: () => {
        const getHeader = (names) => currentHeaders.find(h => names.includes(h));
        
        const c = getHeader(['Company', 'Company name']);
        if(c) row[c] = document.getElementById('add-company').value;
        
        const p = getHeader(['Position']);
        if(p) row[p] = document.getElementById('add-pos').value;
        
        const s = getHeader(['Status', 'Application status']);
        if(s) row[s] = document.getElementById('add-status').value;
        
        return true;
      }
    }).then((result) => {
      if (result.isConfirmed) {
        currentData.unshift(row); // Add to top
        renderTable();
      }
    });
  });
}

if(btnSave) {
  btnSave.addEventListener("click", async () => {
    try {
      const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs');
      const newWs = XLSX.utils.json_to_sheet(currentData, { header: currentHeaders });
      currentWorkbook.Sheets[currentSheetName] = newWs;
      XLSX.writeFile(currentWorkbook, "job_search_tracker.xlsx");
      
      Swal.fire({ ...dialog, 
        toast:true, 
        position:'bottom-end', 
        icon:'success', 
        title:'Saved and downloaded!', 
        showConfirmButton:false, 
        timer:3000
      });
    } catch (err) {
      console.error(err);
      Swal.fire({ ...dialog, icon: "error", title: "Error", text: "Failed to save the file.", confirmButtonText: "OK" });
    }
  });
}


