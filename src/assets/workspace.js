import Swal from "./sweetalert2.esm.min.js";
import { initWorkspaceFlows } from "./workspace-flows.js";
import { renderCharts, redrawWhenOpened } from "./workspace-charts.js";
import "./workspace-tabs.js";
let flowApp;
const loadTracker = () => flowApp?.reload();
redrawWhenOpened(document.getElementById("insights"));

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
 *   published — the static site on Pages. Nothing can run, and the page says
 *               so plainly.
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
  try {
    const res = await fetch(api("status"), { cache: "no-store" });
    if (!res.ok) throw new Error("no helper");
    await res.json();
    local = true;
  } catch {
    local = false;
    $("#published-notice").hidden = false;
    $$("[data-run]").forEach((b) => {
      b.disabled = true;
      b.title = "Run `npm run editor` locally to enable this";
    });

  }
}

// --------------------------------------------------------------- run a task

const log = $("#log");
const logWrap = $("#log-wrap");

function write(line, cls) {
  if (logWrap) logWrap.hidden = false;
  const span = document.createElement("span");
  if (cls) span.className = cls;
  span.textContent = line.endsWith("\n") ? line : `${line}\n`;
  log.append(span);
  log.scrollTop = log.scrollHeight;
}

async function runTask(name, button) {
  const card = button.closest(".task");
  const label = button.innerHTML;

  card.dataset.busy = "true";
  button.disabled = true;
  button.innerHTML = '<i class="fa-solid fa-spinner fa-spin btn-icon-spacing"></i>Running...';
  logWrap.hidden = false;
  $("#log-title").textContent = `Output: ${name}`;
  log.textContent = "";

  if (name.startsWith("/") || name === "serve" || name === "editor") {
    write(`Requesting ${name}...`);
    // Copy the command to the clipboard
    try { navigator.clipboard.writeText(name); } catch(e) {}

    // Do an async fetch to the server but do not freeze the UI
    fetch(api("run"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: name }),
    }).catch(() => {});

    // Remove the freeze loader quickly
    setTimeout(() => {
      card.dataset.busy = "false";
      button.disabled = false;
      button.innerHTML = '<i class="fa-solid fa-check btn-icon-spacing"></i>Done';
      write("\nCommand triggered or copied. Please run it in your terminal.", "ok");
      Swal.fire({
        ...dialog,
        icon: "info",
        title: "Manual Execution Required",
        text: `AI commands are interactive and must be executed in your agent chat. The command '${name}' has been copied to your clipboard; please paste and run it in your terminal.`
      });
      setTimeout(() => { button.innerHTML = label; }, 2000);
    }, 800);

    return;
  }

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
    if (data.ok) {
      Swal.fire({
        ...dialog,
        icon: "success",
        title: "Task Finished",
        text: `Command '${name}' completed successfully.`
      });
      if (name === "tracker" || name === "profile") loadTracker();
    } else {
      Swal.fire({
        ...dialog,
        icon: "error",
        title: "Task Failed",
        text: `Command '${name}' exited with code ${data.code}. Check the output log.`
      });
    }
  } catch (error) {
    write(`✗ ${error.message}`, "err");
    Swal.fire({
      ...dialog,
      icon: "error",
      title: "Task Failed",
      text: error.message
    });
  } finally {
    card.dataset.busy = "false";
    button.disabled = false;
    button.innerHTML = label;
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
      btn.innerHTML = '<i class="fa-solid fa-check btn-icon-spacing"></i>Copied';
    } catch {
      btn.innerHTML = '<i class="fa-regular fa-keyboard" class="btn-icon-spacing"></i>Ctrl+C';
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

// ---------------------------------------------------------------- tracker

/** Where the student is on the path, and the one thing worth doing next. */
function renderJourney(c) {
  // The strip is also the tab bar: a check mark means that stage is behind you.
  const done = {
    toapply: c.toapply + c.applied + c.interview + c.offer > 0,
    applied: c.applied + c.interview + c.offer > 0,
  };
  $$("#journey-steps li").forEach((li) => { li.dataset.state = done[li.dataset.stage] ? "done" : "todo"; });
  const [title, body] =
    c.offer ? ["You have an offer.", "Check it against the GJU rules before you say yes: a full-time internship of 20 weeks to 6 months, in Germany."]
    : c.interview ? [`${c.interview} interview${c.interview > 1 ? "s" : ""} on the way.`, "Someone wants to meet you. Run /interview to prepare."]
    : c.applied ? [`${c.applied} application${c.applied > 1 ? "s" : ""} sent.`, "That took courage. Follow up after a week, and keep the next one moving."]
    : c.toapply ? [`${c.toapply} on your shortlist.`, "Set Apply? to Yes on the strongest one and send it today."]
    : ["Start with a search.", "On the Shortlist, one search finds new IT internships all over Germany and checks each against the GJU rules for you."];
  const el = $("#journey-next");
  el.replaceChildren(Object.assign(document.createElement("strong"), { textContent: title }), " ", Object.assign(document.createElement("span"), { textContent: body }));
}

function renderStats(rows) {
  const count = (fn) => rows.filter(fn).length;
  const has = (...v) => count((r) => v.includes((r.status || "").trim()));
  renderJourney({
    toapply: has("To apply"),
    applied: has("Applied", "Follow-up sent"),
    interview: has("Interview scheduled"),
    offer: has("Offer"),
  });

  renderCharts(rows, {
    rules: RULES,
    statuses: SCHEMA.statuses.map((x) => x.value),
    profileSkills: (json("profile-skills") || []).map((x) => x.name),
  });
}

await detectMode();
flowApp = await initWorkspaceFlows({ local, api, Swal, dialog, onRows: renderStats });

// ------------------------------------------------------------ Search credits

const creditsBox = document.getElementById("credits");
const creditList = document.getElementById("credit-list");

// Providers with no plan size (a wallet) get a bar against the highest balance this browser has seen.
const peak = (id, value) => {
  try {
    const k = `credit-peak-${id}`;
    const best = Math.max(Number(localStorage.getItem(k)) || 0, value);
    localStorage.setItem(k, String(best));
    return best;
  } catch { return value; }
};

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

// One orb per search service, its animation matched to what the service does.
const CREDIT_ORB = { firecrawl: "weaving", tavily: "searching", tinyfish: "working", apify: "working", exa: "connecting", adzuna: "searching", jooble: "searching", careerjet: "connecting" };
function creditOrb(id, name) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", `${name} is a search service`);
  if (window.ThinkingOrbs) window.ThinkingOrbs.mount(canvas, CREDIT_ORB[id] || "working", 20);
  return canvas;
}

// Each service is a colour-graded card (coloured top, dark gauge, dark footer). The gauge is a half doughnut
// (Chart.js, loaded for the charts below): the share of the plan or wallet that is left.
const CREDIT_KIND = { firecrawl: "Crawler", tavily: "Search API", tinyfish: "Web agent", apify: "Scraping Actors", exa: "Search", adzuna: "Job postings", jooble: "Job postings", careerjet: "Job postings" };
const creditGauges = [];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

// Colour grading: how much is left decides the arc, from the card's own colour down to amber and red.
const GRADES = { mid: ["#fde68a", "#f59e0b"], low: ["#fca5a5", "#ef4444"] };
const lighten = (hex, t) => {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * t);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
};
const levelOf = (pct) => (pct <= 10 ? "low" : pct <= 30 ? "mid" : "ok");

function gaugeFill(chart, level, accent, share) {
  const area = chart.chartArea;
  if (!area) return accent;
  const [from, to] = GRADES[level] || [lighten(accent, 0.5), accent];
  // The grade runs along the filled arc only, so a short arc still shows its whole range.
  const reach = area.left + ((area.right - area.left) * (1 - Math.cos(Math.PI * share))) / 2;
  const gradient = chart.ctx.createLinearGradient(area.left, 0, Math.max(reach, area.left + 1), 0);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  return gradient;
}

function drawGauge(canvas, { left, total, level, accent, label, format }) {
  if (typeof Chart === "undefined") return;
  const filled = total ? Math.max(0, Math.min(left, total)) : 0;
  const chart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["Left", "Used"],
      datasets: [{
        data: total ? [filled, total - filled] : [0, 1],
        backgroundColor: (ctx) => (ctx.dataIndex === 0 ? gaugeFill(ctx.chart, level, accent, total ? filled / total : 0) : "rgba(255,255,255,.09)"),
        borderWidth: 0, circumference: 180, rotation: 270,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "76%", layout: { padding: 6 },
      animation: reducedMotion.matches ? false : { duration: 700, easing: "easeOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: Boolean(total), backgroundColor: "rgba(23,22,20,.94)", borderColor: "rgba(255,255,255,.1)", borderWidth: 1, padding: 10, cornerRadius: 8,
          callbacks: { label: (item) => ` ${item.label}: ${format(item.parsed)}` },
        },
      },
    },
  });
  canvas.setAttribute("aria-label", label);
  creditGauges.push(chart);
}

function clearGauges() {
  while (creditGauges.length) creditGauges.pop().destroy();
}

function creditCard(p, { loading = false } = {}) {
  const li = el("li", loading ? "credit credit--loading" : "credit");
  li.dataset.provider = p.id;
  if (loading) li.setAttribute("aria-busy", "true");
  const accent = { firecrawl: "#ffb741", tavily: "#1890ff", tinyfish: "#01c3a8", apify: "#97d700", exa: "#a78bfa", adzuna: "#34d399", jooble: "#fb923c", careerjet: "#38bdf8" }[p.id] || "#01c3a8";

  // What this card has to say.
  const hasNumber = p.status === "ok" && p.remaining != null;
  const total = hasNumber ? p.total || peak(p.id, p.remaining) : 0;
  const pct = hasNumber && total ? Math.max(0, Math.min(100, Math.round((p.remaining / total) * 100))) : 0;
  const level = levelOf(pct);
  const fmt = (n) => (p.unit === "USD" ? `$${Number(n).toFixed(2)}` : Number(n).toLocaleString());
  const pill = loading ? "Checking" : p.status === "no-key" ? "No key yet"
    : hasNumber ? (level === "low" ? "Running low" : level === "mid" ? "Getting low" : "Plenty left")
      : p.status === "ok" ? "Key saved" : "Unavailable";
  const desc = loading ? `Asking ${p.name} for your balance…`
    : hasNumber ? (p.total ? `of ${fmt(p.total)} ${p.unit === "USD" ? "" : p.unit}`.trim() + (p.resetsAt ? ` · resets ${new Date(`${p.resetsAt}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` : "") : "wallet balance")
      : p.status === "no-key" ? "Add a key to see your balance" : p.status === "ok" ? p.note || "Your balance is on its dashboard" : p.message || "No number came back.";

  // Coloured top: kind, link to the service, name, description.
  const top = el("div", "credit-top");
  const head = el("div", "credit-head");
  head.append(el("span", "credit-kind", CREDIT_KIND[p.id] || "Search service"));
  if (p.getKey) {
    const site = el("a", "credit-site", p.status === "no-key" ? "Get a key ↗" : "Open ↗");
    site.href = p.getKey;
    site.target = "_blank";
    site.rel = "noopener noreferrer";
    site.setAttribute("aria-label", `Open the ${p.name} website`);
    head.append(site);
  }
  top.append(head, el("h3", "credit-name", p.name), el("p", "credit-sub", desc));

  // Dark middle: the gauge with its reading.
  const gauge = el("div", "credit-gauge");
  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  const read = el("div", "credit-read");
  if (loading) {
    gauge.append(el("div", "skeleton skeleton--gauge"));
    read.append(el("strong", "credit-number credit-number--dim", "…"));
  } else {
    gauge.append(canvas);
    read.append(el("strong", hasNumber ? "credit-number" : "credit-number credit-number--dim", hasNumber ? fmt(p.remaining) : "-"));
    read.append(el("span", "credit-pct", hasNumber ? (p.total ? `${pct}% left` : `${pct}% of highest seen`) : p.status === "ok" ? "no balance shared" : ""));
  }
  gauge.append(read);

  // Dark footer: the orb and, locally, the way to the key; a coloured pill with the status.
  const foot = el("div", "credit-foot");
  const people = el("ul", "credit-people");
  const orb = el("li", "credit-orb");
  orb.append(creditOrb(p.id, p.name));
  people.append(orb);
  if (!loading && local && p.envName) {
    const add = el("li");
    const button = el("button", "credit-add");
    button.type = "button";
    const has = p.status !== "no-key";
    button.setAttribute("aria-label", `${has ? "Manage" : "Add"} the ${p.name} key`);
    button.title = has ? "Manage key" : "Add key";
    button.innerHTML = has ? '<i class="fa-solid fa-key" aria-hidden="true"></i>' : '<i class="fa-solid fa-plus" aria-hidden="true"></i>';
    button.addEventListener("click", () => {
      showTab("keys");
      document.getElementById(`setting-${p.envName}`)?.focus();
    });
    add.append(button);
    people.append(add);
  }
  foot.append(people, el("span", `credit-pill credit-pill--${loading ? "wait" : hasNumber ? level : p.status === "ok" ? "ok" : "none"}`, pill));

  li.append(top, gauge, foot);
  if (hasNumber) {
    drawGauge(canvas, { left: p.remaining, total, level, accent, format: fmt, label: `${p.name}: ${fmt(p.remaining)}${p.total ? ` of ${fmt(p.total)}` : ""} left, ${pct}%` });
  } else if (!loading) {
    drawGauge(canvas, { left: 0, total: 0, level: "ok", accent, format: fmt, label: `${p.name}: no balance to show` });
  }
  return li;
}

// The AI provider is the fifth card: no balance to read, so it shows who is active, the model, and a test.
const AI_META = {
  nvidia: { name: "NVIDIA", accent: "#76b900", site: "https://build.nvidia.com", env: "NVIDIA_API_KEY" },
  openrouter: { name: "OpenRouter", accent: "#6467f2", site: "https://openrouter.ai/keys", env: "OPENROUTER_API_KEY" },
  github: { name: "GitHub Models", accent: "#58a6ff", site: "https://github.com/marketplace/models", env: "GITHUB_MODELS_TOKEN" },
  anthropic: { name: "Anthropic", accent: "#d97757", site: "https://console.anthropic.com", env: "ANTHROPIC_API_KEY" },
  ollama: { name: "Ollama", accent: "#cbd5e1", site: "https://ollama.com", env: null },
};

function aiCard(ai) {
  const meta = AI_META[ai.provider];
  const li = el("li", "credit credit--ai");
  li.dataset.provider = ai.provider || "none";
  li.style.setProperty("--accent", meta?.accent || "#94a3b8");
  const name = meta?.name || "No provider";
  const state = !meta ? "none" : ai.configured ? "ok" : "key";

  const top = el("div", "credit-top");
  const head = el("div", "credit-head");
  head.append(el("span", "credit-kind", "AI provider"));
  if (meta) {
    const site = el("a", "credit-site", state === "key" ? "Get a key ↗" : "Open ↗");
    site.href = meta.site;
    site.target = "_blank";
    site.rel = "noopener noreferrer";
    head.append(site);
  }
  const model = ai.model ? ai.model.split("/").pop() : "";
  top.append(head, el("h3", "credit-name", name), el("p", "credit-sub", state === "ok" ? model : state === "key" ? "Add its key to switch it on" : "Pick a provider to suggest, score and tailor"));

  const middle = el("div", "credit-gauge");
  const body = el("div", "credit-ai");
  body.append(el("i", `fa-solid ${state === "ok" ? "fa-circle-check" : "fa-microchip"} credit-ai-icon`), el("strong", "credit-number" + (state === "ok" ? "" : " credit-number--dim"), state === "ok" ? "Active" : state === "key" ? "Needs a key" : "Not set"));
  const result = el("span", "credit-pct", state === "ok" ? "Suggestions, scoring and tailoring run here" : "");
  result.setAttribute("role", "status");
  body.append(result);
  if (local && state === "ok") {
    const test = el("button", "credit-test", "Test connection");
    test.type = "button";
    test.addEventListener("click", async () => {
      // The card gives its middle to the big orb while the provider answers, then goes back to its reading.
      const held = [...body.childNodes];
      const live = el("div", "credit-ai-live");
      live.append(AiStatus.orb("listening", 64), el("span", "credit-pct", "Listening for a reply…"));
      body.replaceChildren(live);
      const started = performance.now();
      let ok = true;
      let message = "";
      try {
        const res = await fetch(api("llm-test"), { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "The test failed.");
        message = `Connected · ${((performance.now() - started) / 1000).toFixed(1)}s`;
      } catch (error) { ok = false; message = error.message; }
      body.replaceChildren(...held);
      AiStatus.show(result, ok, message);
    });
    body.append(test);
  }
  middle.append(body);

  const foot = el("div", "credit-foot");
  const people = el("ul", "credit-people");
  const orb = el("li", "credit-orb");
  orb.append(creditOrb("ai", name));
  people.append(orb);
  if (local) {
    const item = el("li");
    const button = el("button", "credit-add");
    button.type = "button";
    button.setAttribute("aria-label", state === "none" ? "Choose an AI provider" : `Manage the ${name} key and model`);
    button.title = state === "none" ? "Choose a provider" : "Manage key and model";
    button.innerHTML = state === "none" ? '<i class="fa-solid fa-plus" aria-hidden="true"></i>' : '<i class="fa-solid fa-key" aria-hidden="true"></i>';
    button.addEventListener("click", () => {
      showTab("ai");
      document.getElementById(state === "key" && meta?.env ? `setting-${meta.env}` : "setting-LLM_PROVIDER")?.focus();
    });
    item.append(button);
    people.append(item);
  }
  foot.append(people, el("span", `credit-pill credit-pill--${state === "ok" ? "ok" : "none"}`, state === "ok" ? "Active" : state === "key" ? "No key yet" : "Not set"));
  li.append(top, middle, foot);
  return li;
}

const creditItem = (p) => creditCard(p);
const creditSkeleton = (svc) => creditCard(svc, { loading: true });

// What the cards say when nothing can be checked (the published preview): where to get each key.
const SERVICES = [
  { id: "firecrawl", name: "Firecrawl", envName: "FIRECRAWL_API_KEY", getKey: "https://www.firecrawl.dev/app/api-keys" },
  { id: "tavily", name: "Tavily", envName: "TAVILY_API_KEY", getKey: "https://app.tavily.com/home" },
  { id: "tinyfish", name: "TinyFish", envName: "TINYFISH_API_KEY", getKey: "https://agent.tinyfish.ai" },
  { id: "apify", name: "Apify", envName: "APIFY_TOKEN", getKey: "https://console.apify.com/settings/integrations" },
  { id: "exa", name: "Exa", envName: "EXA_API_KEY", getKey: "https://dashboard.exa.ai/api-keys" },
  { id: "adzuna", name: "Adzuna", envName: "ADZUNA_APP_KEY", getKey: "https://developer.adzuna.com/signup" },
  { id: "jooble", name: "Jooble", envName: "JOOBLE_API_KEY_DE", getKey: "https://de.jooble.org/api/about" },
  { id: "careerjet", name: "Careerjet", envName: "CAREERJET_API_KEY", getKey: "https://www.careerjet.com/partners/api/" },
];

function updateOverview(providers) {
  const total = providers.length;
  const saved = providers.filter((p) => p.status !== "no-key").length;
  const answering = providers.filter((p) => p.status === "ok").length;
  const set = (id, text) => { document.getElementById(id).textContent = text; };
  const all = saved === total;
  set("svc-status-title", all ? "All services connected" : `${total - saved} of ${total} services need a key`);
  set("svc-status-desc", answering === saved ? "Every saved key answered." : `${saved - answering} saved key${saved - answering === 1 ? "" : "s"} did not answer.`);
  const badge = document.getElementById("svc-status-badge");
  badge.textContent = `${saved} of ${total} keys`;
  badge.dataset.level = all ? "ok" : "mid";
  set("svc-meter-value", `${saved}/${total}`);
  const pct = total ? Math.round((saved / total) * 100) : 0;
  document.getElementById("svc-meter-fill").style.width = `${pct}%`;
  document.querySelector("#svc-meter [role=meter]").setAttribute("aria-valuenow", String(pct));
  set("svc-stat-ok", `${answering} of ${total}`);
  for (const id of ["svc-status", "svc-meter", "svc-stats"]) document.getElementById(id).hidden = false;
}

async function loadCredits() {
  if (!creditsBox) return;
  if (!local) {
    document.getElementById("credits-note").textContent = "Preview mode: run npm run editor on your computer to see live numbers. Until then, here is where to get each key.";
    clearGauges();
    creditList.replaceChildren(...SERVICES.map((s) => creditItem({ status: "no-key", ...s })));
    document.getElementById("credits-refresh").hidden = true;
    return;
  }
  clearGauges();
  creditList.replaceChildren(...SERVICES.map((svc) => creditSkeleton(svc)));
  try {
    const res = await fetch(api("credits"), { cache: "no-store" });
    const { providers, ai } = await res.json();
    clearGauges();
    creditList.replaceChildren(...providers.map(creditItem), ...(ai ? [aiCard(ai)] : []));
    updateOverview(providers);
  } catch {
    creditList.replaceChildren(Object.assign(document.createElement("li"), { textContent: "Could not reach the local editor.", className: "muted" }));
  }
}
const svcTabs = [...document.querySelectorAll(".svc-tabs [role=tab]")];
function showTab(name) {
  for (const tab of svcTabs) {
    const on = tab.dataset.tab === name;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    document.getElementById(tab.getAttribute("aria-controls")).hidden = !on;
  }
  document.querySelectorAll(".svc-foot [data-for]").forEach((button) => { button.hidden = !button.dataset.for.split(" ").includes(name); });
}
svcTabs.forEach((tab) => {
  tab.addEventListener("click", () => showTab(tab.dataset.tab));
  tab.addEventListener("keydown", (event) => {
    const shown = svcTabs.filter((t) => !t.hidden);
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    const next = shown[(shown.indexOf(tab) + step + shown.length) % shown.length];
    showTab(next.dataset.tab);
    next.focus();
    event.preventDefault();
  });
});
document.getElementById("credits-refresh")?.addEventListener("click", loadCredits);
loadCredits();

// --------------------------------------------------------- API keys & AI provider
// Rows are built from what the server lists, so the field names live in one place (lib/env-settings.mjs).
// A saved secret is never shown: the row shows its last four characters and takes a replacement.

const settingsStatus = document.getElementById("settings-status");
let settingsFields = [];
const removing = new Set();

function settingRow(field) {
  const row = el("div", "settings-row");
  const id = `setting-${field.name}`;
  const label = el("label", null, field.label);
  label.htmlFor = id;
  let input;
  if (field.kind === "choice") {
    input = el("select");
    input.append(new Option("Not set", ""), ...field.choices.map((choice) => new Option(choice, choice)));
    input.value = field.value || "";
  } else {
    input = el("input");
    input.type = field.kind === "secret" ? "password" : "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    if (field.kind === "secret") input.placeholder = field.set ? `${field.hint} saved. Type to replace` : "Paste your key";
    else input.value = field.value || "";
  }
  input.id = id;
  input.name = field.name;
  row.append(label, input);
  if (field.kind === "secret") {
    if (field.set) {
      const remove = el("button", "btn settings-remove", "Remove");
      remove.type = "button";
      remove.addEventListener("click", () => {
        const wasRemoving = removing.delete(field.name);
        if (!wasRemoving) removing.add(field.name);
        input.disabled = !wasRemoving;
        input.value = "";
        remove.textContent = wasRemoving ? "Remove" : "Undo remove";
        row.dataset.removing = wasRemoving ? "" : "true";
      });
      row.append(remove);
    } else row.append(el("span"));
    if (field.getKey) {
      const link = el("a", "settings-get", "Get a key");
      link.href = field.getKey;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      row.append(link);
    }
  }
  if (field.help) row.append(el("small", "settings-help", field.help));
  return row;
}

function renderSettings(fields) {
  settingsFields = fields;
  removing.clear();
  for (const [group, id] of [["ai", "settings-ai"], ["search", "settings-search"], ["jobapis", "settings-jobapis"], ["email", "settings-email"], ["custom", "settings-custom"]]) {
    const rows = fields.filter((f) => f.group === group).map(settingRow);
    const box = document.getElementById(id);
    if (group === "custom" && !rows.length) rows.push(el("p", "settings-empty", "No other keys yet."));
    box.replaceChildren(...rows);
  }
  const chosen = fields.find((f) => f.name === "LLM_PROVIDER")?.value;
  document.getElementById("svc-stat-ai").textContent = AI_META[chosen]?.name || chosen || "Not set";
}

// The one way a key is added, replaced or deleted, from a credit card or from the panel below.
// `changes` maps a .env name to a new value, or null to delete it.
async function postSettings(changes) {
  const res = await fetch(api("settings"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not save.");
  renderSettings(data.fields);
  loadCredits();
  window.dispatchEvent(new Event("settings-saved"));
  return data;
}

async function loadSettings() {
  if (!local) return;
  document.querySelectorAll("[data-local-only]").forEach((node) => { node.hidden = false; });
  try { renderSettings((await (await fetch(api("settings"), { cache: "no-store" })).json()).fields); }
  catch { settingsStatus.textContent = "Could not read your settings. Restart npm run editor."; }
}

document.getElementById("settings-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const changes = {};
  for (const field of settingsFields) {
    const input = document.getElementById(`setting-${field.name}`);
    if (field.kind === "secret") {
      if (removing.has(field.name)) changes[field.name] = null;
      else if (input.value.trim()) changes[field.name] = input.value.trim();
    } else if (input.value.trim() !== (field.value || "")) changes[field.name] = input.value.trim() || null;
  }
  const count = Object.keys(changes).length;
  settingsStatus.dataset.state = "";
  if (!count) { settingsStatus.textContent = "Nothing to save."; return; }
  settingsStatus.textContent = "Saving…";
  try {
    await postSettings(changes);
    settingsStatus.textContent = `Saved ${count} change${count === 1 ? "" : "s"}. They apply now.`;
  } catch (error) {
    settingsStatus.textContent = error.message;
    settingsStatus.dataset.state = "error";
  }
});

document.getElementById("custom-add")?.addEventListener("click", async () => {
  const nameInput = document.getElementById("custom-name");
  const valueInput = document.getElementById("custom-value");
  const name = nameInput.value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  settingsStatus.dataset.state = "error";
  if (!/^[A-Z][A-Z0-9_]{1,56}_(?:API_KEY|KEY|TOKEN|SECRET)$/.test(name)) { settingsStatus.textContent = "Name the key like SERPER_API_KEY: it must end in _API_KEY, _KEY, _TOKEN or _SECRET."; return; }
  if (!valueInput.value.trim()) { settingsStatus.textContent = "Paste the key first."; return; }
  try {
    await postSettings({ [name]: valueInput.value.trim() });
    nameInput.value = valueInput.value = "";
    settingsStatus.dataset.state = "";
    settingsStatus.textContent = `Saved ${name}.`;
  } catch (error) { settingsStatus.textContent = error.message; }
});

document.getElementById("settings-test")?.addEventListener("click", async () => {
  const loader = AiStatus.overlay({ state: "listening", label: "Listening for a reply…" });
  const started = performance.now();
  try {
    const res = await fetch(api("llm-test"), { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "The test failed.");
    AiStatus.show(settingsStatus, true, `Connected · ${((performance.now() - started) / 1000).toFixed(1)}s`);
  } catch (error) {
    AiStatus.show(settingsStatus, false, error.message);
  } finally { loader.close(); }
});
loadSettings();

// ------------------------------------------------------- orbs on AI commands
// One thinking-orb per AI command card, its animation matched to what the command does.
const ORB_STATE = {
  "/scrape": "searching", "/apply": "composing", "/rank": "solving", "/outcome": "breathing",
  "/interview": "listening", "/upskill": "working", "/setup": "shaping", "/add-portal": "connecting",
  "/expand": "weaving", "/html-report": "composing", "/add-template": "shaping",
  "/gmail-sync": "connecting", "/notion-sync": "connecting", "/reset": "breathing",
};
Object.entries(ORB_STATE).forEach(([cmd, state]) => {
  const eyebrow = document.querySelector(`.task[data-task="${cmd}"] .eyebrow`);
  if (!eyebrow || !window.ThinkingOrbs) return;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", `${cmd} is an AI command`);
  canvas.className = "task-orb";
  eyebrow.append(canvas);
  window.ThinkingOrbs.mount(canvas, state, 20);
});
