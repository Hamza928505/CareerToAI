import Swal from "./sweetalert2.esm.min.js";
import { dialog } from "./swal-dialog.js";
import { initWorkspaceFlows } from "./workspace-flows.js";
import { renderCharts, redrawWhenOpened } from "./workspace-charts.js";
import "./workspace-tabs.js";
let flowApp;
redrawWhenOpened(document.getElementById("insights"));

/**
 * Workspace behaviour.
 *
 * Two modes, decided by one probe:
 *
 *   local     — `npm run editor` is serving the page, so /__editor/* exists.
 *               The tracker loads, searches run, rows can be added.
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
  }
}

// ---------------------------------------------------------------- tracker

/** Where the student is on the path, and the one thing worth doing next. */
function renderJourney(c) {
  // The tab bar marks a stage that is behind you.
  const done = {
    toapply: c.toapply + c.applied + c.interview + c.offer > 0,
    applied: c.applied + c.interview + c.offer > 0,
  };
  $$("#journey-steps a[data-stage]").forEach((tab) => { tab.dataset.state = done[tab.dataset.stage] ? "done" : "todo"; });
  const [title, body] =
    c.offer ? ["You have an offer.", "Check it against the GJU rules before you say yes: a full-time internship of 20 weeks to 6 months, in Germany."]
    : c.interview ? [`${c.interview} interview${c.interview > 1 ? "s" : ""} on the way.`, "Someone wants to meet you. Run /interview to prepare."]
    : c.applied ? [`${c.applied} application${c.applied > 1 ? "s" : ""} sent.`, "That took courage. Follow up after a week, and keep the next one moving."]
    : c.toapply ? [`${c.toapply} on your shortlist.`, "Set Apply? to Yes on the strongest one and send it today."]
    : ["Start with a search.", "On the Shortlist, one search finds new internships for your major all over Germany, or in every field, and checks each against the GJU rules for you."];
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
