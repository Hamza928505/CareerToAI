// Every chart on /workspace/, drawn with OpenCharts from the tracker rows
// (data/applications.csv, or the workbook rendered from it), the profile's skills
// and data/gju-rules.json. Nothing here states a number of its own.
import { render, newSpec, getChart } from "./opencharts/js/opencharts.js";

// Dawn palette, as plain hex because the chart engines paint on a canvas.
const C = {
  hope: "#F59E0B", sky: "#38BDF8", teal: "#14B8A6", green: "#34D399",
  rose: "#F87171", slate: "#94A3B8", violet: "#A78BFA",
};
const STATUS_COLOR = {
  "To apply": C.slate, Applied: C.sky, "Follow-up sent": C.teal,
  "Interview scheduled": C.hope, Offer: C.green, Rejected: C.rose, Ghosted: C.violet,
};

const clean = (v) => String(v ?? "").trim();
const $ = (id) => document.getElementById(id);
const live = new Map();

/** Draw (or redraw) one chart. `opts` merges over the chart's own defaults. */
function draw(id, chart, fields, opts = {}, height) {
  const host = $(id);
  if (!host) return false;
  live.get(host)?.destroy();
  live.delete(host);
  host.style.height = height ? `${height}px` : "";
  const base = newSpec(getChart(chart));
  try {
    live.set(host, render(host, { chart, spec: { ...fields, opts: { ...base.opts, ...opts } }, height }));
    return true;
  } catch (e) {
    console.error(`${chart}:`, e);
    host.textContent = "This chart could not be drawn.";
    return false;
  }
}

const show = (cardId, on) => { const el = $(cardId); if (el) el.hidden = !on; };
const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(clean(v)) ? clean(v) : "");
const day = (s) => Date.parse(`${s}T00:00:00Z`) / 86400000;
const todayDay = () => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000; };
const label = (r) => clean(r.company) || clean(r.position) || "Untitled";

// ponytail: free-text parsing. "20 weeks", "6 months", "900 €/month" work; anything
// stranger is skipped, not guessed. Upgrade path: numeric columns in the schema.
function weeksOf(text) {
  const t = clean(text).toLowerCase();
  const m = t.match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  return /month|monat/.test(t) ? (n * 52) / 12 : n;
}

function monthlyPay(r) {
  const t = clean(r.salary).toLowerCase();
  if (!t) return /^(no|nein|unpaid)/i.test(clean(r.paid)) ? 0 : null;
  if (/hour|stunde|\/h\b|week|woche/.test(t)) return null;
  const m = t.match(/\d[\d.,]*/);
  if (!m) return /unpaid|unbezahlt|none|kein/.test(t) ? 0 : null;
  const n = Number(m[0].replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
  return n >= 100 && n <= 20000 ? n : null;
}

const SENT = new Set(["Applied", "Follow-up sent", "Interview scheduled", "Offer", "Rejected", "Ghosted"]);
const isSent = (r) => !!iso(r.date_applied) || SENT.has(clean(r.status));
const isInterview = (r) => !!iso(r.interview_date) || ["Interview scheduled", "Offer"].includes(clean(r.status));
const isOffer = (r) => clean(r.status) === "Offer";

/** Counts a stage reached, so each stage is a subset of the one before it. */
export function stageCounts(rows) {
  return { tracked: rows.length, applied: rows.filter(isSent).length, interview: rows.filter(isInterview).length, offer: rows.filter(isOffer).length };
}

let last = null;

export function renderCharts(rows, { rules, statuses, profileSkills }) {
  last = { rows, rules, statuses, profileSkills };
  const has = rows.length > 0;
  show("insights-empty", !has);
  $("insights-grid")?.toggleAttribute("hidden", !has);
  if (!has) return;

  const n = stageCounts(rows);

  // 1. Funnel: how far applications got. Replaces the four overlapping counts.
  // A funnel of zeros says nothing (and divides by zero), so it waits for the first
  // application and only runs as far as the furthest stage reached.
  const stages = [
    { label: "Tracked", value: n.tracked, color: C.slate },
    { label: "Applied", value: n.applied, color: C.sky },
    { label: "Interview", value: n.interview, color: C.hope },
    { label: "Offer", value: n.offer, color: C.green },
  ];
  const reached = stages.reduce((last, s, i) => (s.value > 0 ? i : last), 0);
  const funnelHost = $("chart-funnel");
  const waiting = n.applied === 0;
  if (funnelHost) funnelHost.hidden = waiting;
  $("funnel-empty")?.toggleAttribute("hidden", !waiting);
  if (!waiting) draw("chart-funnel", "funnel", { stages: stages.slice(0, Math.max(2, reached + 1)) }, {}, 300);

  // 2. Tally: one mark per thing done. Effort made visible.
  const replies = rows.filter((r) => clean(r.answer)).length;
  show("card-tally", n.applied + replies + n.interview > 0);
  draw("chart-tally", "tally-chart", {
    items: [
      { label: "Applications sent", value: n.applied, color: C.hope },
      { label: "Replies", value: replies, color: C.teal },
      { label: "Interviews", value: n.interview, color: C.green },
    ],
  });

  // 3. Gates: each posting against the GJU minimums, as % above/below the line.
  const gates = [];
  const minWeeks = rules.minWeeks, minPay = rules.minMonthlySalary;
  for (const r of rows) {
    const w = weeksOf(r.duration), p = monthlyPay(r);
    if (w != null && clean(r.opportunity_type) !== "Werkstudent") gates.push([`${label(r).slice(0, 14)} · wk`, Math.round(((w - minWeeks) / minWeeks) * 100)]);
    if (p != null) gates.push([`${label(r).slice(0, 14)} · pay`, Math.round(((p - minPay) / minPay) * 100)]);
  }
  const gateRows = gates.slice(0, 14);
  show("card-gates", gateRows.length > 0);
  if (gateRows.length) {
    draw("chart-gates", "bar-diverging", {
      labels: gateRows.map((g) => g[0]),
      values: gateRows.map((g) => g[1]),
      posColor: C.green, negColor: C.rose, diverging: [C.green, C.rose],
    }, { prefix: "", suffix: "%", showSign: true }, 340);
  }

  // 4. Quadrant: fit against pay, split at the GJU pay threshold.
  const items = rows.map((r) => {
    const fit = Number(clean(r.match_score)), p = monthlyPay(r);
    if (!Number.isFinite(fit) || clean(r.match_score) === "" || p == null) return null;
    return { label: label(r), x: Math.max(0, Math.min(100, fit)), y: Math.max(0, Math.min(100, (p / minPay) * 50)), color: STATUS_COLOR[clean(r.status)] || C.sky, r: 9 };
  }).filter(Boolean);
  show("card-quadrant", items.length > 0);
  if (items.length) {
    draw("chart-quadrant", "quadrant-chart", {
      items,
      quadrants: ["Apply first", "Worth a look", "Skip for now", "Good fit, check pay"],
    }, { xMid: 60, yMid: 50, xTitle: "Match score", yTitle: `Pay (middle line = ${minPay} EUR a month)` }, 340);
  }

  // 5. Skills the postings ask for, against the skills in profile.json.
  const mine = new Set(profileSkills.map((s) => s.toLowerCase()));
  const asked = new Map();
  for (const r of rows) {
    for (const s of clean(r.req_skills).split(/[,;\n•|]+/).map((x) => x.trim()).filter(Boolean)) {
      const k = s.toLowerCase();
      const e = asked.get(k) || { name: s, count: 0 };
      e.count += 1;
      asked.set(k, e);
    }
  }
  const top = [...asked.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0])).slice(0, 10);
  show("card-skills", top.length > 0);
  if (top.length) {
    draw("chart-skills", "bar-horizontal", {
      labels: top.map(([, e]) => e.name),
      values: top.map(([, e]) => e.count),
      colors: top.map(([k]) => (mine.has(k) ? C.green : C.hope)),
    }, { prefix: "", suffix: "", separator: false, label: "Postings asking" }, Math.max(240, top.length * 34 + 50));
  }

  // 6. Status by source: which sources actually get replies.
  const sources = [...new Set(rows.map((r) => clean(r.source) || "Unspecified"))];
  const usedStatuses = statuses.filter((s) => rows.some((r) => clean(r.status) === s));
  show("card-sources", sources.length > 0 && usedStatuses.length > 0);
  const legend = $("legend-sources");
  if (legend) legend.replaceChildren(...usedStatuses.flatMap((s) => {
    const k = document.createElement("span");
    k.className = "key";
    k.style.background = STATUS_COLOR[s] || C.sky;
    return [k, ` ${s}  `];
  }));
  if (usedStatuses.length) {
    draw("chart-sources", "bar-100stacked", {
      labels: sources,
      series: usedStatuses.map((s) => ({
        label: s, color: STATUS_COLOR[s] || C.sky,
        data: sources.map((src) => rows.filter((r) => (clean(r.source) || "Unspecified") === src && clean(r.status) === s).length),
      })),
    }, {}, 320);
  }

  // 7. Coming up: deadlines, follow-ups and interviews inside the follow-up window.
  const window_ = rules.followUpDays;
  const t0 = todayDay();
  const events = [];
  for (const r of rows) {
    if (["Offer", "Rejected", "Ghosted"].includes(clean(r.status))) continue;
    for (const [field, lane, , color] of [["deadline", 0, "deadline", C.rose], ["follow_up", 1, "follow up", C.sky], ["interview_date", 2, "interview", C.green]]) {
      const d = iso(r[field]);
      if (!d) continue;
      const off = day(d) - t0;
      if (off > window_) continue;
      const start = Math.max(0, off);
      events.push({ label: label(r), start, end: start + 2, lane, color });
    }
  }
  events.sort((a, b) => a.start - b.start);
  const upcoming = events.slice(0, 14);
  show("card-dates", upcoming.length > 0);
  if (upcoming.length) {
    draw("chart-dates", "timeline", { events: upcoming, axisLabel: "Day from today" }, { min: 0, max: window_ + 2, tickStep: 1, showLabels: true }, 260);
  }

  // 8. Calendar of days you sent something. The latest year with data.
  const days = {};
  for (const r of rows) { const d = iso(r.date_applied); if (d) days[d] = (days[d] || 0) + 1; }
  const years = Object.keys(days).map((d) => Number(d.slice(0, 4)));
  show("card-calendar", years.length > 0);
  if (years.length) {
    const year = Math.max(...years);
    draw("chart-calendar", "calendar-heatmap", { year, dayValues: days, color: C.hope, calColor: [C.hope] });
  }
}

/** Charts inside a closed <details> measure zero width; draw them when it opens. */
addEventListener("workspace-tab", () => {
  const panel = $("flow-insights");
  if (last && panel && !panel.hidden) renderCharts(last.rows, last);
});

export function redrawWhenOpened(details) {
  details?.addEventListener("toggle", () => { if (details.open && last) renderCharts(last.rows, last); });
}
