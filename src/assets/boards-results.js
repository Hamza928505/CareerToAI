/* "Your Indeed results" on the job boards page: the student loads the .json file their scheduled Claude task saved,
 * then filters, sorts and expands the internships, marks what they did with each one and copies or exports them.
 * The results and the statuses stay in this browser (localStorage); nothing is uploaded. */
import { el, icon, toast, notice, ask, copyText, showMenu } from "./boards-ui.js";
import { Combo } from "./boards-combo.js";
import * as R from "./results-data.js";

const L = window.BoardLogic;
const $ = (id) => document.getElementById(id);
const DATA_KEY = "gjub-results:v1";
const STATUS_KEY = "gjub-results-status:v1";
const RULE_ICONS = { ok: "fa-circle-check", warn: "fa-triangle-exclamation", bad: "fa-circle-xmark" };
const VERDICT_ICONS = { meets: "fa-circle-check", check: "fa-triangle-exclamation", fails: "fa-circle-xmark" };
const COLUMNS = [["title", "Internship"], ["company", "Company"], ["city", "City"], ["posted", "Posted"], ["verdict", "GJU verdict"], [null, "Status"]];

const read = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
const forget = (key) => { try { localStorage.removeItem(key); } catch { /* nothing was saved */ } };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const saved = read(DATA_KEY);
const status = read(STATUS_KEY);
const state = {
  saved: saved && Array.isArray(saved.rows) ? saved : null,
  status: Object.fromEntries(Object.entries(status && typeof status === "object" ? status : {}).filter(([, s]) => R.STATUSES.includes(s))),
  f: R.defaultFilters(), sort: { key: "verdict", dir: 1 }, open: new Set(), view: [],
};
const combos = {};
const cityNames = new Map(); // normalised city -> how the advert wrote it

// ---------------------------------------------------------------- loading a file

async function load(file) {
  if (!file) return;
  if (file.size > 5e6) { await notice("error", "That file is too large", "A results file is a few hundred kilobytes at most. Choose the gju-internships-….json file your task saved."); return; }
  let parsed;
  try { parsed = R.parseResults(await file.text()); }
  catch (e) { await notice("error", "That file could not be loaded", e.message); return; }
  const older = state.saved && parsed.runAt < state.saved.runAt;
  state.saved = R.mergeResults(state.saved, parsed);
  const stored = write(DATA_KEY, state.saved);
  render();
  const fresh = state.saved.rows.filter((r) => R.isNew(r, state.saved)).length;
  if (!stored) toast("warning", "Loaded, but this browser could not save it. Load the file again after a reload.");
  else toast("success", `Loaded ${plural(parsed.internships.length, "internship", "internships")}${older ? " from an older run" : fresh ? ` · ${fresh} new` : ""}`);
}

async function removeAll() {
  if (!(await ask("Remove your results?", "This removes the loaded internships and your statuses from this browser. Your file stays where you saved it.", "Remove"))) return;
  forget(DATA_KEY);
  forget(STATUS_KEY);
  Object.assign(state, { saved: null, status: {}, open: new Set() });
  resetFilters();
  render();
  $("results-choose").focus();
}

// ---------------------------------------------------------------- filters

function buildCombos() {
  const set = (key) => (value) => { state.f[key] = value; refresh(); };
  combos.verdicts = new Combo($("f-verdict"), { id: "c-verdict", label: "GJU verdict", icon: "fa-scale-balanced", multiple: true, placeholder: "Any verdict",
    items: R.VERDICTS.map((v) => ({ value: v, label: R.VERDICT_LABELS[v] })), onChange: set("verdicts") });
  combos.cities = new Combo($("f-city"), { id: "c-city", label: "City", icon: "fa-location-dot", multiple: true, placeholder: "Any city", items: [], onChange: set("cities") });
  combos.posted = new Combo($("f-posted"), { id: "c-posted", label: "Posted", icon: "fa-clock", items: [
    { value: "", label: "Any time", icon: "fa-infinity" }, { value: "7", label: "In the last 7 days", icon: "fa-calendar-week" }, { value: "30", label: "In the last 30 days", icon: "fa-calendar-days" },
  ], onChange: set("posted") });
  combos.statuses = new Combo($("f-status"), { id: "c-status", label: "Status", icon: "fa-bookmark", multiple: true, placeholder: "All but hidden",
    items: ["none", ...R.STATUSES].map((s) => ({ value: s, label: R.STATUS_LABELS[s] })), onChange: set("statuses") });
}

/** Each dropdown counts what its choices would leave, given the other filters, so no choice leads to an empty table. */
function syncCounts(rows) {
  const tally = (dim, valueOf) => {
    const m = new Map();
    R.filterRows(rows, state.f, state.status, dim).forEach((r) => { const v = valueOf(r); if (v) m.set(v, (m.get(v) || 0) + 1); });
    return m;
  };
  combos.verdicts.setCounts(tally("verdicts", (r) => r.verdict));
  combos.cities.setCounts(tally("cities", (r) => r.city && L.norm(r.city)));
  combos.statuses.setCounts(tally("statuses", (r) => state.status[r.id] || "none"));
  const anyTime = R.filterRows(rows, state.f, state.status, "posted");
  const within = (days) => R.filterRows(anyTime, { ...R.defaultFilters(), posted: days }, state.status, "statuses").length;
  combos.posted.setCounts(new Map([["", anyTime.length], ["7", within("7")], ["30", within("30")]]));
}

function chips() {
  const f = state.f, out = [];
  const add = (iconClass, label, remove) => out.push({ iconClass, label, remove });
  const change = (key, value) => { f[key] = value; combos[key].setValue(value, { silent: true }); refresh(); };
  if (f.q.trim()) add("fa-magnifying-glass", `“${f.q.trim()}”`, () => { f.q = ""; $("results-q").value = ""; refresh(); });
  f.verdicts.forEach((v) => add(VERDICT_ICONS[v], R.VERDICT_LABELS[v], () => change("verdicts", f.verdicts.filter((x) => x !== v))));
  f.cities.forEach((c) => add("fa-location-dot", cityNames.get(c) || c, () => change("cities", f.cities.filter((x) => x !== c))));
  if (f.posted) add("fa-clock", `Posted in the last ${f.posted} days`, () => change("posted", ""));
  f.statuses.forEach((s) => add("fa-bookmark", R.STATUS_LABELS[s], () => change("statuses", f.statuses.filter((x) => x !== s))));
  return out;
}

function renderChips() {
  const row = $("results-chips");
  const list = chips();
  row.replaceChildren();
  if (!list.length) { row.append(el("span", "none", "No filters yet, so every internship you have not hidden is shown.")); return; }
  for (const c of list) {
    const chip = el("span", "chip");
    const lead = icon(c.iconClass);
    lead.classList.add("lead-i");
    const remove = el("button");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove filter: ${c.label}`);
    remove.append(icon("fa-xmark"));
    remove.addEventListener("click", c.remove);
    chip.append(lead, document.createTextNode(c.label), remove);
    row.append(chip);
  }
  const clear = el("button", "btn btn-ghost btn-sm");
  clear.type = "button";
  clear.append(icon("fa-filter-circle-xmark"), document.createTextNode("Clear all"));
  clear.addEventListener("click", clearAll);
  row.append(clear);
}

function resetFilters() {
  state.f = R.defaultFilters();
  $("results-q").value = "";
  for (const [key, combo] of Object.entries(combos)) combo.setValue(state.f[key], { silent: true });
}

function clearAll() { resetFilters(); refresh(); }

// ---------------------------------------------------------------- the table

function titleLink(r) {
  if (!r.url) return el("span", "title", r.title);
  const a = el("a", "title", r.title);
  Object.assign(a, { href: r.url, target: "_blank", rel: "noopener noreferrer" });
  a.append(icon("fa-arrow-up-right-from-square"));
  return a;
}

function head() {
  const tr = el("tr");
  for (const [key, label] of COLUMNS) {
    const th = el("th");
    th.setAttribute("scope", "col");
    if (!key) { th.textContent = label; tr.append(th); continue; }
    const on = state.sort.key === key;
    const ascending = (state.sort.dir === 1) !== (key === "posted"); // dates start with the newest
    if (on) th.setAttribute("aria-sort", ascending ? "ascending" : "descending");
    const b = el("button", "sort", label);
    b.type = "button";
    b.dataset.sort = key;
    b.append(icon(on ? (ascending ? "fa-arrow-up" : "fa-arrow-down") : "fa-sort"));
    th.append(b);
    tr.append(th);
  }
  const last = el("th", "c-act");
  last.setAttribute("scope", "col");
  last.append(el("span", "sr", "Actions"));
  tr.append(last);
  const thead = el("thead");
  thead.append(tr);
  return thead;
}

function rowEl(r, i) {
  const s = state.saved;
  const tr = el("tr", R.inLatest(r, s) ? "" : "not-latest");
  tr.dataset.id = r.id;
  tr.style.setProperty("--i", String(i));
  const td = (label, className, ...children) => { const c = el("td", className); if (label) c.dataset.label = label; c.append(...children); return c; };

  const main = [titleLink(r)];
  if (R.isNew(r, s)) main.push(el("span", "tag is-new", "New"));
  if (!R.inLatest(r, s)) main.push(el("span", "sub", "Not in the latest run: it may be filled"));

  const verdict = el("button", `badge ${r.verdict}`);
  verdict.type = "button";
  verdict.dataset.action = "details";
  verdict.setAttribute("aria-expanded", String(state.open.has(r.id)));
  verdict.setAttribute("aria-controls", `rd-${i}`);
  verdict.setAttribute("aria-label", `${R.VERDICT_LABELS[r.verdict]}. Show the rule checks for ${r.title}`);
  verdict.append(icon(VERDICT_ICONS[r.verdict]), document.createTextNode(R.VERDICT_LABELS[r.verdict]), icon("fa-chevron-down caret"));

  const select = el("select", "control status-select");
  select.dataset.id = r.id;
  select.setAttribute("aria-label", `Status of ${r.title}`);
  for (const value of ["none", ...R.STATUSES]) {
    const o = el("option", null, value === "none" ? "—" : R.STATUS_LABELS[value]);
    o.value = value;
    o.selected = (state.status[r.id] || "none") === value;
    select.append(o);
  }

  const menu = el("button", "row-menu");
  menu.type = "button";
  menu.dataset.action = "menu";
  menu.setAttribute("aria-label", `Actions for ${r.title}`);
  menu.setAttribute("aria-haspopup", "menu");
  menu.setAttribute("aria-expanded", "false");
  menu.append(icon("fa-ellipsis-vertical"));

  tr.append(
    td(null, "c-main", ...main), td("Company", "c-company", el("span", "name", r.company || "Not stated")),
    td("City", "c-city", document.createTextNode(r.city || "Not stated")),
    td("Posted", "c-found", el("span", "when", r.posted ? L.ago(r.posted) : "Not stated")),
    td("GJU verdict", "c-gju", verdict), td("Status", "c-status", select), td(null, "c-act", menu),
  );
  return tr;
}

/** The rule checks of one internship, quoted from the advert: the details on demand under its row. */
function detailEl(r, i) {
  const tr = el("tr", "detail-row");
  tr.id = `rd-${i}`;
  const cellEl = el("td");
  cellEl.colSpan = COLUMNS.length + 1;
  const box = el("div", "detail");
  if (r.why) box.append(el("p", "why", r.why));
  const list = el("ul", "rule-list");
  const line = (state, iconClass, title, text) => {
    const li = el("li", `rule ${state}`);
    const body = el("div");
    body.append(el("b", null, title), el("span", null, text));
    li.append(icon(iconClass), body);
    list.append(li);
  };
  const quoted = (q) => (q && !/^not stated$/i.test(q) ? `“${q}”` : "Not stated in the advert");
  r.checks.forEach((c) => line(c.state, RULE_ICONS[c.state], c.rule, quoted(c.quote)));
  r.notes.forEach((n) => line("info", "fa-circle-info", n.label, n.text || "Not stated"));
  if (list.children.length) box.append(list);
  const actions = el("div", "detail-actions");
  if (r.url) {
    const open = el("a", "btn btn-primary btn-sm");
    Object.assign(open, { href: r.url, target: "_blank", rel: "noopener noreferrer" });
    open.append(icon("fa-arrow-up-right-from-square"), document.createTextNode("Open the advert"));
    actions.append(open);
  }
  const copy = el("button", "btn btn-sm");
  copy.type = "button";
  copy.dataset.action = "copy";
  copy.dataset.id = r.id;
  copy.append(icon("fa-copy"), document.createTextNode("Copy for Claude"));
  actions.append(copy);
  box.append(actions, el("p", "fine", "This reads the advert only and is not GJU's approval. Before you accept, send the company details and the contract to your Exchange Coordinator at GJU, cc the Office for Industrial Links, and check on the advert that it is still open."));
  cellEl.append(box);
  tr.append(cellEl);
  return tr;
}

function emptyState() {
  const box = el("div", "empty");
  box.append(icon("fa-magnifying-glass"), el("h3", null, "No internships match"), el("p", null, "Remove a filter, or choose Status → Hidden to see the ones you hid."));
  const clear = el("button", "btn btn-primary");
  clear.type = "button";
  clear.append(icon("fa-filter-circle-xmark"), document.createTextNode("Clear all filters"));
  clear.addEventListener("click", clearAll);
  box.append(clear);
  return box;
}

function renderTable() {
  const host = $("results-list");
  if (!state.view.length) { host.replaceChildren(emptyState()); return; }
  const card = el("div", "table-card");
  const scroll = el("div", "table-scroll");
  const table = el("table", "results-table");
  table.setAttribute("aria-label", "Your internships from Indeed");
  const body = el("tbody");
  state.view.forEach((r, i) => { body.append(rowEl(r, i)); if (state.open.has(r.id)) body.append(detailEl(r, i)); });
  table.append(head(), body);
  scroll.append(table);
  card.append(scroll);
  host.replaceChildren(card);
}

// ---------------------------------------------------------------- drawing the section

function refresh() {
  const rows = state.saved.rows;
  state.view = R.sortRows(R.filterRows(rows, state.f, state.status), state.sort.key, state.sort.dir);
  syncCounts(rows);
  renderChips();
  renderTable();
  const hidden = rows.filter((r) => state.status[r.id] === "hidden").length;
  $("results-count").textContent = `${state.view.length} of ${plural(rows.length, "internship", "internships")} shown${hidden ? ` · ${hidden} hidden` : ""}`;
}

function render() {
  const s = state.saved;
  $("results-empty").hidden = Boolean(s);
  $("results-view").hidden = !s;
  $("results-actions").hidden = !s;
  if (!s) { $("results-meta").textContent = "Load the file your scheduled Claude search saved."; return; }
  $("results-meta").textContent = [`Last run ${when.format(new Date(s.runAt))}`, s.query.major, s.query.location].filter(Boolean).join(" · ");
  cityNames.clear();
  s.rows.forEach((r) => { if (r.city && !cityNames.has(L.norm(r.city))) cityNames.set(L.norm(r.city), r.city); });
  combos.cities.setItems([...cityNames].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label })));
  state.f.cities = combos.cities.value; // a city that is no longer in the results drops out of the filter
  refresh();
}

// ---------------------------------------------------------------- row actions

const rowOf = (id) => state.saved.rows.find((r) => r.id === id);

function setStatus(id, value) {
  if (value === "none") delete state.status[id]; else state.status[id] = value;
  if (!write(STATUS_KEY, state.status)) toast("warning", "This browser could not save the status.");
  refresh();
}

async function copyForClaude(r) {
  const ok = await copyText(R.claudeText(r));
  toast(ok ? "success" : "error", ok ? "Copied. Paste it into Claude with your CV." : "Could not copy. Open the rule checks and copy the text from there.");
}

function rowMenu(anchor, r) {
  const hidden = state.status[r.id] === "hidden";
  showMenu(anchor, [
    ...(r.url ? [{ icon: "fa-arrow-up-right-from-square", label: "Open the advert", href: r.url }] : []),
    { icon: "fa-copy", label: "Copy for Claude", onClick: () => copyForClaude(r) },
    "sep",
    hidden
      ? { icon: "fa-eye", label: "Show again", onClick: () => { setStatus(r.id, "none"); toast("success", "Shown again"); } }
      : { icon: "fa-eye-slash", label: "Hide", onClick: () => { setStatus(r.id, "hidden"); toast("success", "Hidden. Choose Status → Hidden to see it again."); } },
  ]);
}

function toggleDetails(button) {
  const tr = button.closest("tr");
  const id = tr.dataset.id;
  const i = [...tr.parentNode.children].filter((n) => !n.classList.contains("detail-row")).indexOf(tr);
  if (state.open.delete(id)) tr.nextElementSibling?.classList.contains("detail-row") && tr.nextElementSibling.remove();
  else { state.open.add(id); tr.after(detailEl(rowOf(id), i)); }
  button.setAttribute("aria-expanded", String(state.open.has(id)));
}

function exportCsv() {
  if (!state.view.length) { notice("info", "Nothing to export", "No internships match the filters."); return; }
  const url = URL.createObjectURL(new Blob([R.toCsv(state.view, state.status)], { type: "text/csv;charset=utf-8" }));
  const a = el("a");
  Object.assign(a, { href: url, download: `gju-internships-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("success", `Exported ${plural(state.view.length, "internship", "internships")}`);
}

// ---------------------------------------------------------------- wiring

const section = $("results");
const picker = $("results-file");
buildCombos();

$("results-choose").addEventListener("click", () => picker.click());
$("results-load").addEventListener("click", () => picker.click());
picker.addEventListener("change", () => { load(picker.files[0]); picker.value = ""; });
$("results-csv").addEventListener("click", exportCsv);
$("results-clear").addEventListener("click", removeAll);
$("results-q").addEventListener("input", (e) => { state.f.q = e.target.value; refresh(); });
$("results-copy-prompt").addEventListener("click", async () => {
  const ok = await copyText($("results-prompt").textContent.trim());
  toast(ok ? "success" : "error", ok ? "Prompt copied. Paste it into Cowork after /schedule." : "Could not copy. Select the text and copy it.");
});

// a file dropped anywhere on the section is loaded
const isFile = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
section.addEventListener("dragover", (e) => { if (!isFile(e)) return; e.preventDefault(); section.classList.add("is-drag"); });
section.addEventListener("dragleave", (e) => { if (!section.contains(e.relatedTarget)) section.classList.remove("is-drag"); });
section.addEventListener("drop", (e) => { if (!isFile(e)) return; e.preventDefault(); section.classList.remove("is-drag"); load(e.dataTransfer.files[0]); });

const list = $("results-list");
list.addEventListener("click", (e) => {
  const sort = e.target.closest("button[data-sort]");
  if (sort) {
    const key = sort.dataset.sort;
    state.sort = { key, dir: state.sort.key === key ? -state.sort.dir : 1 };
    refresh();
    list.querySelector(`button[data-sort="${key}"]`)?.focus();
    return;
  }
  const button = e.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id || button.closest("tr[data-id]")?.dataset.id;
  const r = id && rowOf(id);
  if (!r) return;
  if (button.dataset.action === "details") toggleDetails(button);
  else if (button.dataset.action === "menu") rowMenu(button, r);
  else if (button.dataset.action === "copy") copyForClaude(r);
});
list.addEventListener("change", (e) => {
  const select = e.target.closest("select.status-select");
  if (!select) return;
  const id = select.dataset.id;
  setStatus(id, select.value);
  list.querySelector(`select[data-id="${CSS.escape(id)}"]`)?.focus(); // keep the place for keyboard users
});

render();
