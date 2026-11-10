/* Filtering, sorting, facet counts, chart numbers and export rows for the board. Plain functions, no DOM,
   so they run in the page and in Node tests. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BoardLogic = factory();
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var LEVELS = ["none", "A1", "A2", "B1", "B2", "C1", "C2"];
  var LEVEL_NAMES = { A1: "Beginner", A2: "Elementary", B1: "Intermediate", B2: "Upper-intermediate", C1: "Advanced", C2: "Proficient" };
  var KINDS = ["Praktikum", "Pflichtpraktikum", "Internship"];
  var GJU_LABELS = { meets: "Meets the rules", check: "Needs checking", fails: "Below a limit" };

  /** Lower case with accents removed, for searching: "Zürich" is found by "zurich". */
  function norm(text) {
    return String(text == null ? "" : text).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }
  var rank = function (level) { return LEVELS.indexOf(level); };

  /** A level filter lets through postings whose requirement the student meets, plus those that state none. */
  function levelOk(required, mine) {
    if (!mine) return true;
    if (!required || required === "unknown" || required === "none") return true;
    return rank(required) <= rank(mine);
  }

  function formatWeeks(w) {
    if (!w) return "not stated";
    if (w.min != null && w.max != null) return w.min === w.max ? w.min + " weeks" : w.min + "–" + w.max + " weeks";
    if (w.min != null) return w.min + "+ weeks";
    return "up to " + w.max + " weeks";
  }

  function formatPay(p) {
    if (!p) return "not stated";
    if (p.max === 0) return "unpaid";
    return (p.min === p.max ? p.min : p.min + "–" + p.max) + " EUR";
  }

  /** Only http(s) links are ever used as a link target; anything else in scraped data is dropped. */
  function safeUrl(url) {
    try { var u = new URL(url); return u.protocol === "https:" || u.protocol === "http:" ? u.href : ""; } catch (e) { return ""; }
  }

  // ------------------------------------------------------------------ filters

  function defaultFilters() {
    return {
      q: "", majors: [], skills: [], skillMode: "all", countries: [], cities: [], kinds: [],
      german: "", english: "", gju: "", minPay: "", maxPay: "", minWeeks: "", from: "", to: "",
    };
  }

  /** How many separate filters are switched on (a pay range, or a pair of dates, is one each). */
  function activeCount(f) {
    var n = 0;
    if ((f.q || "").trim()) n++;
    ["majors", "skills", "countries", "cities", "kinds"].forEach(function (k) { if (f[k] && f[k].length) n++; });
    ["german", "english", "gju", "minWeeks"].forEach(function (k) { if (f[k] !== "" && f[k] != null) n++; });
    if (f.minPay !== "" || f.maxPay !== "") n++;
    if (f.from || f.to) n++;
    return n;
  }

  var num = function (v) { return v === "" || v == null || !isFinite(Number(v)) ? null : Number(v); };

  /**
   * The postings that pass every filter. `skip` names one dimension to leave out ("majors", "skills", "countries",
   * "cities", "kinds", "gju"): that is how a dropdown or a chart counts what each of its own choices would give.
   */
  function applyFilters(postings, f, skip) {
    var tokens = norm(f.q).trim().split(/\s+/).filter(Boolean);
    var set = function (list, map) { return list && list.length ? new Set(map ? list.map(map) : list) : null; };
    var majors = set(f.majors), countries = set(f.countries), cities = set(f.cities, norm), kinds = set(f.kinds);
    var skills = (f.skills || []).map(function (s) { return s.toLowerCase(); });
    var anySkill = f.skillMode === "any";
    var minPay = num(f.minPay), maxPay = num(f.maxPay), minWeeks = num(f.minWeeks);
    return postings.filter(function (p) {
      if (tokens.length) {
        var hay = norm(p.title + " " + p.company + " " + p.city + " " + (p.skills || []).join(" "));
        if (!tokens.every(function (t) { return hay.indexOf(t) >= 0; })) return false;
      }
      if (skip !== "majors" && majors && !(p.majors || []).some(function (m) { return majors.has(m); })) return false;
      if (skip !== "countries" && countries && !countries.has(p.country)) return false;
      if (skip !== "cities" && cities && !cities.has(norm(p.city))) return false;
      if (skip !== "kinds" && kinds && !kinds.has(p.kind)) return false;
      if (skip !== "skills" && skills.length) {
        var have = (p.skills || []).map(function (s) { return s.toLowerCase(); });
        var test = function (s) { return have.indexOf(s) >= 0; };
        if (!(anySkill ? skills.some(test) : skills.every(test))) return false;
      }
      if (!levelOk(p.germanLevel, f.german) || !levelOk(p.englishLevel, f.english)) return false;
      // A pay range or a minimum duration only keeps postings that state them.
      if (minPay != null || maxPay != null) {
        if (!p.pay) return false;
        if (minPay != null && p.pay.max < minPay) return false;
        if (maxPay != null && p.pay.min > maxPay) return false;
      }
      if (minWeeks != null) {
        var top = p.weeks ? (p.weeks.max != null ? p.weeks.max : p.weeks.min) : null;
        if (top == null || top < minWeeks) return false;
      }
      if (skip !== "gju" && f.gju) {
        var overall = (p.gju && p.gju.overall) || "check";
        if (f.gju === "hide-fails" ? overall === "fails" : overall !== f.gju) return false;
      }
      if (f.from && p.firstSeen < f.from) return false;
      if (f.to && p.firstSeen > f.to) return false;
      return true;
    });
  }

  function sortPostings(list, key) {
    var weeks = function (p) { return p.weeks ? (p.weeks.max != null ? p.weeks.max : p.weeks.min) : -1; };
    var pay = function (p) { return p.pay ? p.pay.max : -1; };
    var by = {
      new: function (a, b) { return b.firstSeen.localeCompare(a.firstSeen) || (b.datePosted || "").localeCompare(a.datePosted || ""); },
      company: function (a, b) { return (a.company || "~").localeCompare(b.company || "~"); },
      weeks: function (a, b) { return weeks(b) - weeks(a); },
      pay: function (a, b) { return pay(b) - pay(a); },
    };
    return list.slice().sort(by[key] || by.new);
  }

  // ------------------------------------------------------------------ counts for dropdowns and charts

  var valuesOf = {
    majors: function (p) { return p.majors || []; },
    skills: function (p) { return p.skills || []; },
    countries: function (p) { return p.country ? [p.country] : []; },
    cities: function (p) { return p.city ? [norm(p.city)] : []; },
    kinds: function (p) { return p.kind ? [p.kind] : []; },
    gju: function (p) { return [(p.gju && p.gju.overall) || "check"]; },
  };

  function tally(list, values) {
    var map = new Map();
    list.forEach(function (p) { values(p).forEach(function (v) { map.set(v, (map.get(v) || 0) + 1); }); });
    return map;
  }

  /** value -> number of postings that choosing it would leave, given every other filter. */
  function facetCounts(postings, f, dim) { return tally(applyFilters(postings, f, dim), valuesOf[dim]); }

  var top = function (map, n) {
    return Array.from(map.entries()).map(function (e) { return { key: e[0], count: e[1] }; })
      .sort(function (a, b) { return b.count - a.count || String(a.key).localeCompare(String(b.key)); }).slice(0, n);
  };

  /** Postings per area of study: one that fits majors of two areas counts once in each. `areaOf` maps a major id to its area. */
  function areaCounts(list, areaOf) {
    var counts = new Map();
    list.forEach(function (p) {
      var areas = new Set();
      (p.majors || []).forEach(function (m) { if (areaOf[m]) areas.add(areaOf[m]); });
      areas.forEach(function (a) { counts.set(a, (counts.get(a) || 0) + 1); });
    });
    return counts;
  }

  function levelCounts(list, field) {
    var order = ["none", "A1", "A2", "B1", "B2", "C1", "C2", "unknown"];
    var counts = tally(list, function (p) { return [p[field] || "unknown"]; });
    return order.map(function (k) { return { key: k, count: counts.get(k) || 0 }; });
  }

  /** The last n days ending at `end` (an ISO date), zero days included, by first-seen date. */
  function perDay(list, n, end) {
    var counts = tally(list, function (p) { return [p.firstSeen]; });
    var last = end || list.reduce(function (m, p) { return p.firstSeen > m ? p.firstSeen : m; }, "") || new Date().toISOString().slice(0, 10);
    var out = [];
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(Date.parse(last + "T00:00:00Z") - i * 86400000).toISOString().slice(0, 10);
      out.push({ date: d, count: counts.get(d) || 0 });
    }
    return out;
  }

  /**
   * The numbers behind the charts. Each chart that can be clicked to filter ignores its own filter,
   * so the bars of a chosen major still show the other majors. `o.areaOf` maps a major id to its area.
   */
  function chartData(all, f, o) {
    o = o || {};
    var current = applyFilters(all, f);
    var gju = { meets: 0, check: 0, fails: 0 };
    applyFilters(all, f, "gju").forEach(function (p) { gju[(p.gju && p.gju.overall) || "check"]++; });
    return {
      total: current.length,
      majors: top(facetCounts(all, f, "majors"), o.majors || 8),
      areas: top(areaCounts(applyFilters(all, f, "majors"), o.areaOf || {}), 99),
      skills: top(facetCounts(all, f, "skills"), o.skills || 8),
      gju: gju,
      days: perDay(current, o.days || 14, o.end),
      german: levelCounts(current, "germanLevel"),
    };
  }

  // ------------------------------------------------------------------ what a posting means under the GJU rules

  /** Each GJU rule for one posting as {key, state: ok|warn|bad|info, title, text}, for the details window. */
  function ruleLines(p, rules) {
    var minWeeks = rules.minWeeks, minPay = rules.minMonthlySalary, approved = rules.approvedCountries || [];
    var lines = [];
    var w = p.weeks;
    if (!w) lines.push({ key: "weeks", state: "warn", title: "Duration", text: "Not stated. Check the advert for the length." });
    else if (w.min != null && w.min >= minWeeks) lines.push({ key: "weeks", state: "ok", title: "Duration", text: formatWeeks(w) + " reaches the " + minWeeks + "-week minimum." });
    else if (w.max != null && w.max < minWeeks) lines.push({ key: "weeks", state: "bad", title: "Duration", text: formatWeeks(w) + " is below the " + minWeeks + "-week minimum." });
    else lines.push({ key: "weeks", state: "warn", title: "Duration", text: formatWeeks(w) + ". Confirm it is at least " + minWeeks + " weeks." });
    var pay = p.pay;
    if (!pay) lines.push({ key: "pay", state: "warn", title: "Pay", text: "Not stated. Check the advert for the monthly pay." });
    else if (pay.min >= minPay) lines.push({ key: "pay", state: "ok", title: "Pay", text: formatPay(pay) + " per month reaches the " + minPay + " EUR threshold." });
    else if (pay.max < minPay) lines.push({ key: "pay", state: "bad", title: "Pay", text: (pay.max === 0 ? "Unpaid" : formatPay(pay) + " per month") + " is below the " + minPay + " EUR threshold. Ask your department what that means for your visa documents." });
    else lines.push({ key: "pay", state: "warn", title: "Pay", text: formatPay(pay) + " per month. Confirm it reaches " + minPay + " EUR." });
    if (approved.indexOf(p.country) >= 0) lines.push({ key: "country", state: "ok", title: "Country", text: p.country + " is an approved country." });
    else if (p.country && p.country !== "unknown") lines.push({ key: "country", state: "warn", title: "Country", text: p.country + " needs approval from your dean or the president." });
    else lines.push({ key: "country", state: "warn", title: "Country", text: "Not stated. Check where the internship takes place." });
    var level = function (v) { return v === "none" ? "none required" : v && v !== "unknown" ? v : "not stated"; };
    lines.push({ key: "german", state: "info", title: "German", text: "Level " + level(p.germanLevel) + "." });
    lines.push({ key: "english", state: "info", title: "English", text: "Level " + level(p.englishLevel) + "." });
    return lines;
  }

  // ------------------------------------------------------------------ small display helpers

  /** "Today", "3 days ago", "2 weeks ago", then the date. `now` is for tests. */
  function ago(dateStr, now) {
    var d = Date.parse(dateStr + "T00:00:00Z");
    if (isNaN(d)) return dateStr || "";
    var n = now || new Date();
    var days = Math.floor((Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) - d) / 86400000);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 14) return days + " days ago";
    if (days < 60) return Math.round(days / 7) + " weeks ago";
    return dateStr;
  }

  var LEGAL = /\b(gmbh|mbh|ag|se|kg|kgaa|ug|ohg|gbr|e\.v\.|co\.?|inc\.?|ltd\.?)(?=\s|$|,)/gi;

  /** Two letters for a company's avatar: "Beispiel Software GmbH" -> "BS". */
  function initials(name) {
    var words = String(name || "").replace(LEGAL, " ").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (!words.length) return "?";
    return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
  }

  /** A stable hue (0-359) for a company, so its avatar keeps its colour. */
  function hue(name) {
    var h = 0, s = String(name || "");
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return h;
  }

  // ------------------------------------------------------------------ Excel rows

  var RULE_TEXT = { yes: "yes", no: "no", unknown: "not stated", approved: "approved", "approval-needed": "needs approval" };

  /** One spreadsheet row per posting. */
  function toRows(postings, majorNames) {
    return postings.map(function (p) {
      var g = p.gju || {};
      return {
        "Position": p.title, "Company": p.company, "City": p.city, "Country": p.country, "Kind": p.kind,
        "Majors": (p.majors || []).map(function (id) { return (majorNames && majorNames[id]) || id; }).join("; "),
        "Duration": formatWeeks(p.weeks), "Pay per month": formatPay(p.pay),
        "German level": p.germanLevel, "English level": p.englishLevel, "Skills": (p.skills || []).join(", "),
        "GJU check": GJU_LABELS[g.overall || "check"], "Duration check": RULE_TEXT[g.weeks] || "", "Pay check": RULE_TEXT[g.pay] || "", "Country check": RULE_TEXT[g.country] || "",
        "Date posted": p.datePosted, "First seen": p.firstSeen, "Source": p.source, "Link": safeUrl(p.url),
      };
    });
  }

  return {
    LEVELS: LEVELS, LEVEL_NAMES: LEVEL_NAMES, KINDS: KINDS, GJU_LABELS: GJU_LABELS,
    norm: norm, rank: rank, levelOk: levelOk, formatWeeks: formatWeeks, formatPay: formatPay, safeUrl: safeUrl,
    defaultFilters: defaultFilters, activeCount: activeCount, applyFilters: applyFilters, sortPostings: sortPostings,
    facetCounts: facetCounts, chartData: chartData, areaCounts: areaCounts, perDay: perDay, ruleLines: ruleLines,
    ago: ago, initials: initials, hue: hue, toRows: toRows,
  };
});
