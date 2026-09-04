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
  button.textContent = "Running…";
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
    const label = btn.textContent;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Press Ctrl+C";
      const range = document.createRange();
      range.selectNodeContents(btn.closest(".cmd").querySelector(".cmd-text"));
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    setTimeout(() => {
      btn.textContent = label;
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

  for (const id of ["f-weeks", "f-country"]) {
    const input = document.getElementById(id);
    input.removeAttribute("aria-invalid");
    if (!input.value) {
      input.setAttribute("aria-invalid", "true");
      const msg = document.createElement("span");
      msg.className = "error";
      msg.textContent =
        id === "f-weeks" ? "How many weeks is the placement?" : "Pick the country of the placement.";
      input.parentElement.append(msg);
      firstBad = firstBad || input;
    }
  }
  if (firstBad) {
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
}

async function loadTracker() {
  if (!local) {
    ["#stat-total", "#stat-open", "#stat-toapply", "#stat-interview"].forEach((s) => {
      $(s).textContent = "—";
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
    status.dataset.state = "err";
    status.textContent = "A row needs a company name — that is how every command finds it again.";
    company.focus();
    return;
  }
  company.removeAttribute("aria-invalid");

  const row = Object.fromEntries(new FormData(form).entries());
  const submit = $("#row-submit");
  submit.disabled = true;
  submit.textContent = "Adding…";

  try {
    const res = await fetch(api("tracker"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ row }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "could not write the tracker");

    status.dataset.state = "ok";
    status.textContent = `Added. ${data.rows} row(s) in data/tracker.csv — run “Rebuild the workbook” to recompute Fit %.`;
    form.reset();
    loadTracker();
  } catch (error) {
    status.dataset.state = "err";
    status.textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = "Add to tracker";
  }
});

// -------------------------------------------------------------------- start

await detectMode();
await loadTracker();
