/* The job board directory: each board says how the platform can search it, and (on your own computer) when it was
 * last searched and what came back. Boards you add yourself are kept by the local editor server (/__editor/boards).
 * Without this script, and on the published site, the boards are still plain links. */

const key = (text) => String(text || "").toLowerCase().replace(/^www\./, "").replace(/[^a-z0-9]+/g, "");
const node = (tag, className, text) => Object.assign(document.createElement(tag), { className: className || "", textContent: text ?? "" });
const METHODS = { claude: "Claude connector", nim: "NVIDIA NIM search", apis: "Free API" };

let sources = {};
try { sources = JSON.parse(document.getElementById("search-sources")?.textContent || "{}"); } catch { /* plain links then */ }

/** Which search sources cover a board: its name, or its web address, matches a name in src/_data/searchSources.json. */
function methodsFor(title, host) {
  const names = [key(title), key(host.split(".").slice(0, -1).join(""))];
  return Object.entries(METHODS).filter(([group]) => (sources[group] || []).some((site) => { const k = key(site.name); return k.length > 3 && names.some((name) => name && (name.includes(k) || k.includes(name))); }));
}

function describe(card, runs = {}) {
  const who = card.querySelector(".who");
  const title = card.querySelector(".title")?.textContent || "";
  let host = "";
  try { host = new URL(card.href).hostname; } catch { /* a board without a usable address */ }
  who.querySelectorAll(".method, .scan").forEach((old) => old.remove());
  const methods = methodsFor(title, host);
  const row = node("span", "method board-methods");
  for (const [, label] of methods) row.append(node("span", "tag kind", label));
  if (!methods.length) row.append(node("span", "tag", "Search it yourself"));
  who.append(row);
  // The last scan is recorded under the name the search uses for the board.
  const run = Object.entries(runs).find(([name]) => { const k = key(name); return k.length > 3 && (key(title).includes(k) || key(host).includes(k)); })?.[1];
  if (run?.lastScan) who.append(node("span", "scan board-scan", `Last scan ${run.lastScan.slice(0, 10)}: ${run.found} found`));
  else if (run?.lastError) who.append(node("span", "scan board-scan board-scan-bad", `Last try ${String(run.lastTry).slice(0, 10)}: ${run.lastError}`));
  else if (methods.length && Object.keys(runs).length) who.append(node("span", "scan board-scan", "Not searched yet"));
}

const grid = document.querySelector(".board-grid");
const builtIn = [...document.querySelectorAll(".board-link")];
builtIn.forEach((card) => describe(card));

function customCard(board, refresh) {
  const card = node("a", "card-item board-link board-custom");
  Object.assign(card, { href: board.url, target: "_blank", rel: "noopener noreferrer" });
  card.dataset.searchItem = "";
  const who = node("span", "who");
  who.append(node("span", "title", board.name), node("span", "sub", board.url), node("span", "tag", "Added by you"));
  const remove = node("button", "btn btn-sm btn-ghost board-remove", "Remove");
  remove.type = "button";
  remove.addEventListener("click", async (event) => {
    event.preventDefault();
    await fetch(new URL("/__editor/boards", location.origin), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", name: board.name }) });
    refresh();
  });
  const icon = node("span", "chip-icon soft board-logo");
  icon.append(Object.assign(document.createElement("i"), { className: "fa-solid fa-globe" }));
  card.append(icon, who, remove);
  return card;
}

async function refresh() {
  let data;
  try {
    const response = await fetch(new URL("/__editor/boards", location.origin), { cache: "no-store" });
    if (!response.ok) return;
    data = await response.json();
  } catch { return; } // the published site: nothing to add
  document.getElementById("boards-manage").hidden = false;
  grid.querySelectorAll(".board-custom").forEach((card) => card.remove());
  for (const board of data.custom) { const card = customCard(board, refresh); grid.append(card); describe(card, data.runs); }
  builtIn.forEach((card) => describe(card, data.runs));
  const scanned = Object.values(data.runs).filter((run) => run.lastScan).map((run) => run.lastScan).sort().at(-1);
  document.getElementById("boards-scan-note").textContent = scanned ? `Last search: ${scanned.slice(0, 16).replace("T", " ")} UTC.` : "No search has run yet. Start one on the Search page.";
}

document.getElementById("board-add")?.addEventListener("click", async () => {
  const name = document.getElementById("board-name"), url = document.getElementById("board-url"), status = document.getElementById("board-add-status");
  try {
    const response = await fetch(new URL("/__editor/boards", location.origin), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add", name: name.value, url: url.value }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not add the board.");
    name.value = url.value = "";
    status.textContent = "Added.";
    refresh();
  } catch (error) { status.textContent = error.message; }
});

refresh();
