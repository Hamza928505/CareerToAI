/* The company directory on the Job Boards page: find companies in Germany, check their websites and careers pages, see
 * the recruitment platform behind each, and search their vacancies. Everything is done by the local editor server
 * (/__editor/companies, lib/company-*.mjs); on the published site this section only explains itself.
 * Company names, addresses and posting titles come from outside, so they are only ever written with textContent. */

const $ = (id) => document.getElementById(id);
const api = (action = "") => new URL(`/__editor/companies${action ? `/${action}` : ""}`, location.origin);
const node = (tag, className, text) => Object.assign(document.createElement(tag), { className: className || "", textContent: text ?? "" });

let companies = [];
let shown = [];
let limit = 50;
let stop = false;
let busy = false;

async function request(action, body) {
  const response = await fetch(api(action), body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The local editor could not do that.");
  return data;
}

const fold = (text) => String(text || "").toLowerCase();
const filters = () => ({ q: fold($("co-q").value).trim(), industry: $("co-industry").value, city: fold($("co-city-filter").value).trim(), size: $("co-size").value, platform: $("co-platform").value, status: $("co-status").value });

function matches(c, f) {
  if (f.q && !fold([c.name, c.industry, c.hq, ...c.locations, c.platform.name].join(" ")).includes(f.q)) return false;
  if (f.industry && c.industry !== f.industry) return false;
  if (f.city && ![c.hq, ...c.locations].some((place) => fold(place).includes(f.city))) return false;
  if (f.size && c.size !== f.size) return false;
  if (f.platform && c.platform.name !== f.platform) return false;
  if (f.status === "careers" && c.careersStatus !== "found") return false;
  if (f.status === "api" && !c.hasApi) return false;
  if (f.status === "todo" && c.websiteStatus !== "unverified" && c.careersStatus !== "unverified") return false;
  if (f.status === "problem" && !["broken", "blocked"].includes(c.websiteStatus) && !["broken", "blocked", "not found"].includes(c.careersStatus)) return false;
  return true;
}

function fillSelect(select, values, all) {
  const current = select.value;
  select.replaceChildren(new Option(all, ""), ...values.map((value) => new Option(value, value)));
  select.value = values.includes(current) ? current : "";
}

const STATE = { ok: ["ok", "Answers"], found: ["ok", "Found"], unverified: ["wait", "Not checked"], broken: ["bad", "Broken"], blocked: ["warn", "May not be read"], "not found": ["warn", "Not found"] };
function chip(status) {
  const [tone, label] = STATE[status] || STATE.unverified;
  const span = node("span", `co-chip co-${tone}`, label);
  return span;
}
function link(url, text) {
  const a = node("a", "", text || new URL(url).hostname.replace(/^www\./, ""));
  Object.assign(a, { href: url, target: "_blank", rel: "noopener noreferrer" });
  return a;
}
const cell = (...children) => { const td = document.createElement("td"); td.append(...children.filter(Boolean)); return td; };

function row(c) {
  const tr = document.createElement("tr");
  tr.dataset.id = c.id;
  const name = node("strong", "", c.name);
  const source = node("small", "", c.source);
  const website = c.website ? [link(c.website), " ", chip(c.websiteStatus)] : [chip("unverified")];
  const careers = c.careersUrl ? [link(c.careersUrl, "Careers page"), " ", chip(c.careersStatus)] : [chip(c.careersStatus)];
  const platform = c.platform.name ? [node("span", "", c.platform.name), c.hasApi ? node("span", "co-chip co-ok", "Searchable") : null] : [node("span", "co-muted", "Unknown")];
  const last = c.attempts.at(-1);
  const checked = node("span", last && !last.ok ? "co-muted co-problem" : "co-muted", c.verifiedAt ? c.verifiedAt.slice(0, 10) : "Never");
  if (last?.note) checked.title = last.note;
  const actions = node("div", "co-actions");
  const button = (label, icon, run, title) => {
    const b = node("button", "btn btn-sm btn-ghost");
    b.type = "button";
    b.title = title;
    b.append(Object.assign(document.createElement("i"), { className: `fa-solid ${icon}` }), ` ${label}`);
    b.addEventListener("click", run);
    return b;
  };
  actions.append(
    button("Check", "fa-rotate", () => verify([c.id]), "Check the website, find the careers page and the platform behind it"),
    button("Vacancies", "fa-magnifying-glass", () => searchJobs([c.id]), "Search this company's vacancies"),
    button("Edit", "fa-pen", () => edit(c), "Correct the name, the website or the careers page"),
  );
  tr.append(cell(name, document.createElement("br"), source), cell(c.industry || node("span", "co-muted", "-")), cell(c.size || node("span", "co-muted", "-")), cell(c.hq || node("span", "co-muted", "-")),
    cell(...website), cell(...careers), cell(...platform), cell(c.applyMethods.join(", ") || node("span", "co-muted", "-")), cell(checked, last && !last.ok ? node("small", "co-note", last.note) : null), cell(actions));
  return tr;
}

function render() {
  const f = filters();
  shown = companies.filter((c) => matches(c, f));
  $("co-body").replaceChildren(...shown.slice(0, limit).map(row));
  $("co-more").hidden = shown.length <= limit;
  $("co-empty").hidden = companies.length > 0;
  $("co-table-wrap").hidden = !companies.length;
  const searchable = shown.filter((c) => c.searchable).length;
  $("co-shown").textContent = companies.length
    ? `${shown.length} of ${companies.length} companies shown. ${shown.filter((c) => c.careersStatus === "found").length} have a careers page, ${shown.filter((c) => c.hasApi).length} can be searched through their platform.`
    : "The directory is empty. Find companies above to start it.";
  $("companies-count").textContent = companies.length ? `${companies.length} companies, ${companies.filter((c) => c.careersStatus === "found").length} with a known careers page.` : "Companies in Germany, their careers pages and the platforms behind them.";
  for (const id of ["co-verify", "co-remove"]) $(id).disabled = busy || !shown.length;
  $("co-jobs").disabled = busy || !searchable;
  $("co-discover").disabled = busy;
}

function refreshFilters() {
  const unique = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  fillSelect($("co-industry"), unique(companies.map((c) => c.industry)), "Any industry");
  fillSelect($("co-platform"), unique(companies.map((c) => c.platform.name)), "Any platform");
}

function merge(changed) {
  const byId = new Map(changed.map((c) => [c.id, c]));
  companies = companies.map((c) => byId.get(c.id) || c);
  refreshFilters();
  render();
}

function progress(done, total, text) {
  $("co-progress").hidden = false;
  $("co-bar-fill").style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
  $("co-progress-text").textContent = text;
}

/** Run a slow step over many companies a few at a time, so progress shows and Stop works between batches. */
async function inBatches(ids, size, label, step) {
  if (busy) return;
  busy = true;
  stop = false;
  render();
  let done = 0;
  try {
    for (let at = 0; at < ids.length && !stop; at += size) {
      progress(done, ids.length, `${label}: ${done} of ${ids.length}…`);
      await step(ids.slice(at, at + size));
      done = Math.min(ids.length, at + size);
    }
    progress(done, ids.length, stop ? `Stopped after ${done} of ${ids.length}.` : `${label}: done, ${done} of ${ids.length}.`);
  } catch (error) {
    progress(done, ids.length, error.message);
  } finally {
    busy = false;
    render();
  }
}

const verify = (ids) => inBatches(ids, 5, "Checking websites and careers pages", async (batch) => merge((await request("verify", { ids: batch })).companies));

// ------------------------------------------------------------ vacancies

let results = [];

function jobRow(job) {
  const item = node("li", "co-job");
  const title = link(job.url, job.title);
  title.className = "co-job-title";
  const meta = node("span", "co-muted", [job.company, job.location, job.date_posted ? `posted ${job.date_posted}` : "date not stated"].filter(Boolean).join(" · "));
  const tag = node("span", `co-chip ${job.date_posted ? "co-ok" : "co-wait"}`, job.date_posted ? "From the company's job board" : "Link on the careers page, not checked");
  const add = node("button", "btn btn-sm", "Add to my shortlist");
  add.type = "button";
  add.addEventListener("click", async () => {
    add.disabled = true;
    try {
      const data = await request("shortlist", { jobs: [job] });
      add.textContent = data.added ? "Added" : "Already in your shortlist";
    } catch (error) { add.disabled = false; add.textContent = error.message; }
  });
  const main = node("div", "co-job-main");
  main.append(title, meta, tag);
  item.append(main, add);
  return item;
}

function renderResults(note) {
  $("co-results").hidden = false;
  $("co-results-list").replaceChildren(...results.map(jobRow));
  $("co-results-note").textContent = note;
}

async function searchJobs(ids) {
  const words = $("co-words").value.split(/[,;]+/).map((word) => word.trim()).filter(Boolean);
  results = [];
  const failed = [];
  await inBatches(ids, 8, "Searching vacancies", async (batch) => {
    const data = await request("jobs", { ids: batch, words, internshipsOnly: $("co-interns").checked, germanyOnly: $("co-germany").checked });
    for (const result of data.results) {
      results.push(...result.jobs, ...result.leads);
      if (result.error) failed.push(`${result.name}: ${result.error}`);
    }
    renderResults(`${results.length} found so far…`);
  });
  renderResults(`${results.length} vacanc${results.length === 1 ? "y" : "ies"} found in ${ids.length} compan${ids.length === 1 ? "y" : "ies"}.${failed.length ? ` Not searched: ${failed.slice(0, 4).join(" ")}${failed.length > 4 ? ` and ${failed.length - 4} more.` : ""}` : ""}`);
  $("co-results").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ------------------------------------------------------------ edit one company

function edit(c) {
  const dialog = $("co-edit");
  const form = dialog.querySelector("form");
  for (const field of ["name", "industry", "hq", "employees", "website", "careersUrl"]) form.elements[field].value = c[field] || "";
  $("co-edit-status").textContent = "";
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (event.submitter?.value === "cancel") return dialog.close();
    try {
      if (event.submitter?.value === "remove") {
        await request("remove", { ids: [c.id] });
        companies = companies.filter((item) => item.id !== c.id);
      } else {
        const data = await request("update", { id: c.id, ...Object.fromEntries(["name", "industry", "hq", "employees", "website", "careersUrl"].map((field) => [field, form.elements[field].value.trim()])) });
        companies = companies.map((item) => (item.id === c.id ? data.company : item));
      }
      dialog.close();
      refreshFilters();
      render();
    } catch (error) { $("co-edit-status").textContent = error.message; }
  };
  dialog.showModal();
}

// ------------------------------------------------------------ start

function sourceFields() {
  const source = $("co-source").value;
  document.querySelectorAll("[data-for-source]").forEach((field) => { field.hidden = field.dataset.forSource !== source; });
}

async function discover() {
  const source = $("co-source").value;
  const status = $("co-discover-status");
  busy = true;
  render();
  status.textContent = source === "wikidata" ? "Asking Wikidata…" : "Looking…";
  try {
    // "Find more" continues after the companies Wikidata already gave for the same question.
    const known = companies.filter((c) => c.source === "Wikidata").length;
    const data = await request("discover", { source, limit: Number($("co-limit").value) || 100, offset: $("co-continue").checked ? known : 0, minEmployees: Number($("co-min").value) || 0, city: $("co-city").value.trim(), name: $("co-name").value.trim(), website: $("co-website").value.trim() });
    companies = data.companies;
    status.textContent = data.found ? `Found ${data.found}: ${data.added} new, ${data.merged} already in the directory.` : "Nothing was found there.";
    refreshFilters();
  } catch (error) { status.textContent = error.message; }
  busy = false;
  render();
}

async function start() {
  const app = $("companies-app");
  if (!app) return;
  let data;
  try { data = await request(""); } catch { $("companies-offline").hidden = false; return; }
  app.hidden = false;
  companies = data.companies;
  $("co-source").replaceChildren(...data.sources.map((source) => new Option(source.label, source.id)));
  fillSelect($("co-size"), data.sizes, "Any size");
  if (!data.lookup) $("co-lookup-note").hidden = false;
  sourceFields();
  refreshFilters();
  render();

  $("co-source").addEventListener("change", sourceFields);
  $("co-discover").addEventListener("click", discover);
  for (const id of ["co-q", "co-city-filter"]) $(id).addEventListener("input", () => { limit = 50; render(); });
  for (const id of ["co-industry", "co-size", "co-platform", "co-status"]) $(id).addEventListener("change", () => { limit = 50; render(); });
  $("co-more").addEventListener("click", () => { limit += 100; render(); });
  $("co-stop").addEventListener("click", () => { stop = true; });
  $("co-verify").addEventListener("click", () => verify(shown.map((c) => c.id)));
  $("co-jobs").addEventListener("click", () => searchJobs(shown.filter((c) => c.searchable).map((c) => c.id)));
  $("co-remove").addEventListener("click", async () => {
    if (!confirm(`Remove the ${shown.length} companies shown from the directory? Their websites and careers pages would have to be found again.`)) return;
    const ids = shown.map((c) => c.id);
    try { await request("remove", { ids }); companies = companies.filter((c) => !ids.includes(c.id)); refreshFilters(); render(); } catch (error) { $("co-shown").textContent = error.message; }
  });
}

start();
