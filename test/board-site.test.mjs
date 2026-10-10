import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import ExcelJS from "exceljs";

const boardDir = path.resolve(new URL("../../GJUBoard/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const present = fs.existsSync(path.join(boardDir, "index.html")) && fs.existsSync(path.join(boardDir, "js", "main.js"));
const skip = !present && "GJUBoard repo not found next to CareerToAI";

// ------------------------------------------------------------------ fixtures

const GJU = { meets: { weeks: "yes", pay: "yes", country: "approved", overall: "meets" }, check: { weeks: "unknown", pay: "unknown", country: "approved", overall: "check" }, fails: { weeks: "no", pay: "yes", country: "approved", overall: "fails" } };
const make = (o) => ({
  id: "x", title: "Praktikum Softwareentwicklung", company: "Firma", city: "Berlin", country: "Germany", url: "https://firma.de/job/1", source: "firma.de",
  kind: "Praktikum", datePosted: "2026-10-09", firstSeen: "2026-10-09", lastSeen: "2026-10-10", majors: ["computer-science"], skills: ["Python", "SQL"],
  weeks: { min: 26, max: 26 }, pay: { min: 1000, max: 1000, basis: "monthly" }, germanLevel: "B2", englishLevel: "unknown", gju: GJU.meets, ...o,
});
const postings = [
  make({ id: "a", firstSeen: "2026-10-10" }),
  make({ id: "b", title: "Pflichtpraktikum Logistik", company: "Spedition AG", kind: "Pflichtpraktikum", majors: ["logistic-sciences"], skills: ["SAP ERP"], germanLevel: "C1", weeks: null, pay: null, gju: GJU.check, firstSeen: "2026-10-09", url: "https://spedition.de/b" }),
  make({ id: "c", title: "Praktikum Data Analyst", company: "Daten GmbH", majors: ["business-intelligence-data-analytics", "computer-science"], skills: ["SQL", "Power BI"], germanLevel: "none", weeks: { min: 12, max: 12 }, gju: GJU.fails, firstSeen: "2026-10-08", url: "https://daten.de/c" }),
  make({ id: "d", title: "Internship Mechatronics", company: "Robot GmbH", kind: "Internship", country: "Austria", city: "Wien", majors: ["mechatronics-engineering"], skills: ["MATLAB"], germanLevel: "unknown", englishLevel: "B2", pay: { min: 0, max: 0, basis: "unpaid" }, gju: { ...GJU.fails, weeks: "yes", pay: "no" }, firstSeen: "2026-10-08", url: "https://robot.at/d" }),
  make({ id: "e", title: "Praktikum Zürich Marketing", company: "Züri AG", city: "Zürich", country: "Switzerland", majors: ["digital-marketing"], skills: [], weeks: { min: 13, max: 26 }, pay: { min: 700, max: 1000, basis: "monthly" }, germanLevel: "A2", gju: GJU.check, firstSeen: "2026-10-07", url: "https://zuri.ch/e" }),
  make({ id: "f", title: "<img src=x onerror=window.pwned=1> Praktikum", company: "Evil Corp", majors: [], skills: [], url: "javascript:window.pwned=1", gju: GJU.check, firstSeen: "2026-10-07" }),
];
const RULES = { minWeeks: 20, minMonthlySalary: 861, approvedCountries: ["Germany", "Austria", "Switzerland", "Luxembourg"] };
const SKILLS = { groups: [{ group: "Software engineering", skills: ["Python"] }, { group: "Databases and data", skills: ["SQL", "Power BI"] }, { group: "Industrial engineering and logistics", skills: ["SAP ERP"] }] };

function buildSite(list) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "board-site-"));
  fs.cpSync(boardDir, root, { recursive: true, filter: (src) => !/[\\/]\.git([\\/]|$)/.test(src) && !/[\\/]data([\\/]|$)/.test(src) });
  fs.mkdirSync(path.join(root, "data", "days"), { recursive: true });
  const write = (file, value) => fs.writeFileSync(path.join(root, file), JSON.stringify(value));
  const byDay = new Map();
  list.forEach((p) => byDay.set(p.firstSeen, [...(byDay.get(p.firstSeen) || []), p]));
  for (const [date, items] of byDay) write(`data/days/${date}.json`, items);
  write("data/postings.json", list);
  write("data/skills.json", SKILLS);
  write("data/rules.json", RULES);
  write("data/index.json", { generatedAt: "2026-10-10", total: list.length, days: [...byDay].map(([date, items]) => ({ date, count: items.length })).sort((a, b) => b.date.localeCompare(a.date)), lastRun: { areas: ["Computing and data"], complete: true } });
  return root;
}

async function serve(root) {
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2" };
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.join(root, name === "/" ? "/index.html" : name);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end(); }
    res.setHeader("content-type", types[path.extname(file)] || "application/octet-stream");
    res.end(fs.readFileSync(file));
  }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
}

// ------------------------------------------------------------------ one browser, one small site, a fresh page for each test

let browser, site, server;
test.before(async () => {
  if (!present) return;
  const { chromium } = await import("playwright");
  try { browser = await chromium.launch(); } catch { browser = null; return; }
  site = buildSite(postings);
  server = await serve(site);
});
test.after(async () => {
  await browser?.close();
  server?.close();
  if (site) fs.rmSync(site, { recursive: true, force: true });
});

/** A fresh page on the fixture site; resolves once the list is drawn (and, by default, the charts). */
async function open({ width = 1280, height = 900, scheme = "light", reduce = false, mobile = false, charts = true, base = server } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, reducedMotion: reduce ? "reduce" : "no-preference", acceptDownloads: true, hasTouch: mobile, isMobile: mobile });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(base.url).origin }).catch(() => {});
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("request", (r) => requests.push(r.url()));
  await page.goto(base.url);
  await page.waitForSelector("#list tr[data-id], #list .card-item, #list .empty");
  if (charts) await page.waitForFunction(() => document.getElementById("insights").dataset.drawn);
  return { page, context, errors, requests };
}
const count = (page) => page.textContent("#result-count strong");
const waitSwal = (page) => page.waitForSelector(".swal2-popup.board-swal", { state: "visible" });
const sheetRows = async (file) => {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(file);
  return book.getWorksheet("Internships");
};

// ------------------------------------------------------------------ tests

test("the page shows its data, counts the numbers up, draws six charts and asks nobody else for anything", { skip }, async (t) => {
  if (!browser) return t.skip("Chromium is not installed");
  const { page, context, errors, requests } = await open();
  await page.waitForFunction(() => document.querySelector("[data-stat=total]").textContent === "6");
  const stats = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-stat]")].map((n) => [n.dataset.stat, n.textContent])));
  assert.deepEqual(stats, { total: "6", meets: "1", fresh: "6", companies: "6" });
  assert.equal(await page.locator("#insights canvas").count(), 6);
  assert.equal(await count(page), "6");
  assert.deepEqual(errors, []);
  assert.deepEqual(requests.filter((u) => !u.startsWith(server.url) && !u.startsWith("data:")), []); // no CDN, no font host, no tracker
  await context.close();
});

test("a dropdown searches, picks with the keyboard, shows counts that follow the other filters, and chips remove choices", { skip }, async (t) => {
  if (!browser) return t.skip("Chromium is not installed");
  const { page, context } = await open({ reduce: true });
  await page.click("#c-major");
  assert.equal(await page.getAttribute("#c-major", "aria-expanded"), "true");
  assert.equal(await page.evaluate(() => document.activeElement.className.includes("combo-input")), true);
  assert.ok((await page.locator("#c-major-list .combo-group").count()) >= 3); // grouped by area
  await page.keyboard.type("computer sc");
  assert.equal(await page.locator("#c-major-list [role=option]").count(), 1);
  assert.ok((await page.locator("#c-major-list mark").count()) >= 1);
  await page.keyboard.press("Enter");
  assert.equal(await page.isVisible("#c-major-panel"), true); // several can be picked: it stays open
  await page.keyboard.press("Escape");
  assert.equal(await page.isHidden("#c-major-panel"), true);
  assert.equal(await count(page), "2"); // a and c
  assert.match(await page.textContent("#active-row"), /Computer Science/);
  assert.equal(await page.textContent("#active-count"), "1");

  // the country list now counts only what the major leaves: Austria and Switzerland have none, but stay listed (dimmed)
  await page.click("#c-country");
  assert.equal(await page.locator("#c-country-list .combo-opt.is-zero").count(), 2);
  assert.equal(await page.locator("#c-country-list .combo-opt").first().textContent(), "Germany2");
  await page.keyboard.press("Escape");

  // a chip removes its filter
  await page.click("#active-row .chip button");
  assert.equal(await count(page), "6");
  assert.match(await page.textContent("#active-row"), /No filters yet/);
  await context.close();
});

test("the skills dropdown groups the library's skills, hides skills nothing has, and matches all or any", { skip }, async (t) => {
  if (!browser) return t.skip("Chromium is not installed");
  const { page, context } = await open({ reduce: true });
  await page.click("#c-skills");
  const groups = await page.locator("#c-skills-list .combo-group").allTextContents();
  assert.deepEqual(groups, ["Software engineering", "Databases and data", "Industrial engineering and logistics", "Other"]); // MATLAB is in no library group
  assert.equal(await page.locator("#c-skills-list [role=option]").count(), 5); // Python, SQL, Power BI, SAP ERP, MATLAB
  await page.keyboard.type("pyth");
  await page.keyboard.press("Enter");
  await page.keyboard.type("sql");
  await page.keyboard.press("Enter");
  assert.equal(await count(page), "1"); // all of them: only a has both
  await page.click("#f-skills .seg button[data-mode=any]");
  assert.equal(await count(page), "2"); // any of them: a and c
  assert.match(await page.textContent("#active-row"), /Any of the skills/);
  await page.keyboard.press("Escape");
  assert.match(await page.textContent("#f-skills .combo-value"), /Python, SQL/);
  await context.close();
});

test("SweetAlert2 explains bad values: a pay range the wrong way round, a duration out of range, dates the wrong way round", { skip }, async (t) => {
  if (!browser) return t.skip("Chromium is not installed");
  const { page, context } = await open({ reduce: true });
  await page.fill("#max-pay", "1000");
  assert.equal(await count(page), "5"); // pay stated and reaching up to 1000: not b
  await page.fill("#min-pay", "2000");
  assert.equal(await page.getAttribute("#min-pay", "aria-invalid"), "true"); // marked while typing, no window yet
  assert.equal(await page.getAttribute("#max-pay", "aria-invalid"), "true");
  assert.equal(await count(page), "5"); // the bad range is not applied: the last good one stays
  await page.press("#min-pay", "Tab");
  await waitSwal(page);
  assert.equal(await page.textContent(".swal2-title"), "Check the pay range");
  assert.match(await page.textContent(".swal2-html-container"), /minimum \(2000 €\) is higher than the maximum \(1000 €\)/);
  await page.click(".swal2-confirm");
  await page.waitForSelector(".swal2-popup", { state: "detached" });
  assert.equal(await page.evaluate(() => document.activeElement.id), "min-pay"); // back on the field to fix
  await page.fill("#min-pay", "500");
  assert.equal(await page.getAttribute("#min-pay", "aria-invalid"), null);
  assert.equal(await page.getAttribute("#max-pay", "aria-invalid"), null);
  assert.equal(await count(page), "4"); // 500-1000: a, c, e, f
  await page.fill("#max-pay", "3000");
  await page.fill("#min-pay", "2000");
  assert.equal(await count(page), "0");
  assert.equal(await page.isVisible("#list .empty"), true);
  await page.click("#list .empty .btn-primary"); // Clear all filters
  assert.equal(await count(page), "6");
  assert.equal(await page.inputValue("#min-pay"), "");

  await page.fill("#min-weeks", "200");
  await page.press("#min-weeks", "Tab");
  await waitSwal(page);
  assert.equal(await page.textContent(".swal2-title"), "Check the duration");
  await page.click(".swal2-confirm");
  await page.waitForSelector(".swal2-popup", { state: "detached" });
  await page.fill("#min-weeks", "20");
  assert.equal(await count(page), "4"); // a, d and f (26 weeks) and e (13-26 reaches 20)

  await page.fill("#from", "2026-10-09");
  await page.fill("#to", "2026-10-01");
  await page.press("#to", "Tab");
  await waitSwal(page);
  assert.equal(await page.textContent(".swal2-title"), "Check the dates");
  await context.close();
});

test("the theme button flips light and dark, remembers the choice, and SweetAlert2 follows it", { skip }, async (t) => {
  if (!browser) return t.skip("Chromium is not installed");
  const { page, context } = await open({ reduce: true, scheme: "light" });
  assert.equal(await page.getAttribute("#theme-toggle", "aria-label"), "Switch to dark theme");
  await page.click("#theme-toggle");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  assert.equal(await page.getAttribute("#theme-toggle", "aria-label"), "Switch to light theme");
  assert.equal(await page.evaluate(() => localStorage.getItem("gjub-theme")), "dark");
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(10, 13, 26)");
  await page.click("#open-help");
  await waitSwal(page);
  assert.equal(await page.getAttribute(".swal2-container", "data-swal2-theme"), "dark");
  assert.match(await page.textContent(".swal2-html-container"), /At least 20 weeks/);
  assert.match(await page.textContent(".swal2-html-container"), /At least 861 EUR per month/);
  await page.click(".swal2-confirm");
  await page.reload();
  await page.waitForSelector("#list tr[data-id]");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark"); // remembered, with no flash of light
  await context.close();
});

test("table and card views both work, and the choice is remembered", { skip }, async (t) => {
  if (!browser) return t.skip("Chromium is not installed");
  const { page, context } = await open({ reduce: true, charts: false });
  assert.equal(await page.locator("#list table").count(), 1);
  assert.equal(await page.locator("#list tr[data-id]").count(), 6);
  await page.click("#view-cards");
  assert.equal(await page.getAttribute("#view-cards", "aria-pressed"), "true");
  assert.equal(await page.locator("#list .card-item").count(), 6);
  assert.equal(await page.locator("#list table").count(), 0);
  await page.reload();
  await page.waitForSelector("#list .card-item");
  assert.equal(await page.getAttribute("#view-cards", "aria-pressed"), "true");
  await context.close();
});

test("ticking rows, the download menu and the Excel files it builds, including one day through a SweetAlert2 picker", { skip }, async (t) => {
  if (!browser) return t.skip("Chromium is not installed");
  const { page, context } = await open({ reduce: true, charts: false });
  await page.check("#list tr[data-id]:nth-child(1) input.check");
  await page.check("#list tr[data-id]:nth-child(3) input.check");
  assert.equal(await page.textContent("#ticked"), "2");
  assert.equal(await page.evaluate(() => document.getElementById("pick-all").indeterminate), true);

  await page.click("#dl-btn");
  assert.equal(await page.isVisible("#menu"), true);
  assert.deepEqual(await page.locator("#menu [role=menuitem]").evaluateAll((items) => items.map((i) => i.textContent.replace(/\d+$/, "").trim())), ["What I see now", "Ticked", "Everything", "One day…"]);
  const [ticked] = await Promise.all([page.waitForEvent("download"), page.click("#menu >> text=Ticked")]);
  assert.equal(ticked.suggestedFilename(), "gju-internships-ticked.xlsx");
  const sheet = await sheetRows(await ticked.path());
  assert.equal(sheet.rowCount - 1, 2);
  const header = sheet.getRow(1).values.slice(1);
  assert.ok(["Position", "Company", "Kind", "Duration", "Pay per month", "GJU check", "Link"].every((h) => header.includes(h)));
  assert.ok(!header.includes("Type"));
  await page.waitForSelector(".swal2-popup.board-toast");
  assert.match(await page.textContent(".swal2-popup.board-toast .swal2-title"), /Downloaded 2 internships/);

  await page.click("#dl-btn");
  const [all] = await Promise.all([page.waitForEvent("download"), page.click("#menu >> text=Everything")]);
  const everything = await sheetRows(await all.path());
  assert.equal(everything.rowCount - 1, 6);
  const links = everything.getColumn(header.indexOf("Link") + 1).values.slice(2).map(String);
  assert.ok(!links.some((l) => l.startsWith("javascript")));

  // one day: the picker complains until a day is chosen
  await page.click("#dl-btn");
  await page.click("#menu >> text=One day");
  await waitSwal(page);
  await page.click(".swal2-confirm");
  assert.equal(await page.textContent(".swal2-validation-message"), "Choose a day first.");
  await page.selectOption(".swal2-select", "2026-10-08");
  const [day] = await Promise.all([page.waitForEvent("download"), page.click(".swal2-confirm")]);
  assert.equal(day.suggestedFilename(), "gju-internships-2026-10-08.xlsx");
  assert.equal((await sheetRows(await day.path())).rowCount - 1, 2); // c and d
  await context.close();
});

test("the details window explains each GJU rule, and copies the link", { skip }, async (t) => {
  if (!browser) return t.skip("Chromium is not installed");
  const { page, context } = await open({ reduce: true, charts: false });
  await page.click("#list tr[data-id=c] .badge"); // the posting that is 12 weeks long
  await waitSwal(page);
  assert.equal(await page.textContent(".swal2-title"), "Praktikum Data Analyst");
  assert.equal(await page.locator(".swal2-popup .rule").count(), 5);
  assert.match(await page.textContent(".swal2-popup .rule.bad"), /12 weeks is below the 20-week minimum/);
  assert.match(await page.textContent(".swal2-popup .detail"), /Daten GmbH/);
  await page.click(".swal2-deny"); // Copy link
  await page.waitForSelector(".swal2-popup.board-toast");
  assert.match(await page.textContent(".swal2-popup.board-toast .swal2-title"), /Link copied/);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "https://daten.de/c");
  await context.close();
});

test("the row menu opens the advert and copies the link; an unsafe link gets neither, and advert text never runs as code", { skip }, async (t) => {
  if (!browser) return t.skip("Chromium is not installed");
  // Any scroll closes an open menu, so nothing may scroll after the click: wait for the charts (they make the page
  // about 100 px taller when drawn), scroll the button into view first and let that scroll event land (two frames).
  const { page, context, errors } = await open({ reduce: true });
  await page.locator("#list tr[data-id=a] .row-menu").scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.click("#list tr[data-id=a] .row-menu");
  assert.equal(await page.isVisible("#menu"), true);
  assert.equal(await page.getAttribute("#menu a", "href"), "https://firma.de/job/1");
  await page.keyboard.press("Escape");
  assert.equal(await page.isHidden("#menu"), true);

  // the HTML in this title is text, and its javascript: link is not a link
  assert.ok((await page.textContent("#list tr[data-id=f]")).includes("<img src=x onerror=window.pwned=1>"));
  assert.equal(await page.locator("#list a[href^='javascript']").count(), 0);
  await page.click("#list tr[data-id=f] .row-menu");
  assert.deepEqual(await page.locator("#menu [role=menuitem]").allTextContents(), ["Details", "Tick for download"]);
  await page.keyboard.press("Escape");
  await page.click("#list tr[data-id=f] .badge");
  await waitSwal(page);
  assert.ok((await page.textContent(".swal2-title")).includes("<img src=x"));
  assert.equal(await page.locator('.swal2-popup img[src="x"]').count(), 0); // (SweetAlert2 keeps its own hidden image element)
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  assert.deepEqual(errors, []);
  await context.close();
});

test("clicking a bar or a slice filters by it", { skip }, async (t) => {
  if (!browser) return t.skip("Chromium is not installed");
  const { page, context } = await open({ reduce: true });
  const centreOf = (host, index) => page.evaluate(([sel, i]) => {
    const canvas = document.querySelector(`${sel} canvas`);
    canvas.scrollIntoView({ block: "center" }); // a click only lands on what is inside the window
    const point = window.Chart.getChart(canvas).getDatasetMeta(0).data[i].getCenterPoint();
    const box = canvas.getBoundingClientRect();
    return { x: box.left + point.x, y: box.top + point.y };
  }, [host, index]);
  const bar = await centreOf("#ch-majors", 0);
  await page.mouse.click(bar.x, bar.y);
  assert.match(await page.textContent("#active-row"), /Computer Science/);
  assert.equal(await count(page), "2");

  await page.click("#active-row .btn-ghost"); // Clear all
  assert.equal(await count(page), "6");
  await page.click("#gju-legend button >> nth=0");
  assert.match(await page.textContent("#active-row"), /Meets the rules/);
  assert.equal(await count(page), "1");
  await page.waitForFunction(() => document.querySelector("#gju-legend button").getAttribute("aria-pressed") === "true");
  await page.click("#gju-legend button >> nth=0"); // the same slice again takes the filter off
  assert.equal(await count(page), "6");
  await context.close();
});

test("on a phone: cards by default, the filters fold away, a dropdown is a sheet at the top, nothing scrolls sideways", { skip }, async (t) => {
  if (!browser) return t.skip("Chromium is not installed");
  const { page, context } = await open({ width: 390, height: 844, mobile: true, reduce: true });
  assert.equal(await page.getAttribute("#view-cards", "aria-pressed"), "true");
  assert.ok((await page.locator("#list .card-item").count()) > 0);
  assert.equal(await page.evaluate(() => document.getElementById("filter-panel").open), false);
  await page.click("#filter-panel > summary");
  await page.click("#c-major");
  const box = await page.locator("#c-major-panel").boundingBox();
  assert.ok(box.y < 30 && box.width > 340, JSON.stringify(box)); // a sheet at the top, nearly the full width
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("c-major-panel")).position), "fixed");
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("has-sheet")), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("has-sheet")), false);
  for (const width of [390, 820, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `sideways scroll at ${width}px`);
  }
  await context.close();
});

test("reduced motion switches animation off and shows everything at once", { skip }, async (t) => {
  if (!browser) return t.skip("Chromium is not installed");
  const { page, context } = await open({ reduce: true, charts: false });
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".reveal")).opacity), "1");
  assert.equal(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".hero")).animationDuration) < 0.01), true);
  await context.close();
});

test("every control has a name a screen reader can say", { skip }, async (t) => {
  if (!browser) return t.skip("Chromium is not installed");
  const { page, context } = await open({ reduce: true });
  const unnamed = await page.evaluate(() => [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select")].filter((el) => el.offsetParent !== null || el.getClientRects().length).filter((el) => {
    const label = el.getAttribute("aria-label") || (el.labels && el.labels.length && el.labels[0].textContent) || el.textContent.trim() || el.title;
    const by = el.getAttribute("aria-labelledby") && el.getAttribute("aria-labelledby").split(" ").map((id) => document.getElementById(id)?.textContent || "").join("").trim();
    return !(label && label.trim()) && !by;
  }).map((el) => el.outerHTML.slice(0, 90)));
  assert.deepEqual(unnamed, []);
  await context.close();
});

test("3,000 internships still filter quickly", { skip }, async (t) => {
  if (!browser) return t.skip("Chromium is not installed");
  const many = Array.from({ length: 3000 }, (_, i) => make({ id: `p${i}`, title: `Praktikum ${i % 7 === 0 ? "Python" : "Logistik"} ${i}`, company: `Firma ${i % 120}`, city: ["Berlin", "München", "Hamburg", "Köln"][i % 4], skills: i % 3 ? ["SQL"] : ["Python", "SQL"], firstSeen: `2026-10-${String(1 + (i % 10)).padStart(2, "0")}`, url: `https://firma.de/job/${i}` }));
  const bigRoot = buildSite(many);
  const bigServer = await serve(bigRoot);
  try {
    const started = Date.now();
    const { page, context } = await open({ reduce: true, base: bigServer });
    const loaded = Date.now() - started;
    assert.ok(loaded < 8000, `loaded in ${loaded} ms`);
    assert.equal(await page.locator("#list tr[data-id]").count(), 60); // one page of rows, not three thousand
    const t0 = Date.now();
    await page.fill("#q", "python");
    await page.waitForFunction(() => document.querySelector("#result-count strong").textContent !== "3000");
    const filtered = Date.now() - t0;
    assert.ok(filtered < 2500, `filtered in ${filtered} ms`);
    await context.close();
  } finally { bigServer.close(); fs.rmSync(bigRoot, { recursive: true, force: true }); }
});

test("with motion on, sections fade in as they scroll into view", { skip }, async (t) => {
  if (!browser) return t.skip("Chromium is not installed");
  const { page, context } = await open({ reduce: false, charts: false });
  assert.ok((await page.locator(".reveal:not(.is-in)").count()) > 0); // the lower sections wait until they are seen
  for (let y = 0; y <= 4000; y += 500) { await page.evaluate((top) => window.scrollTo(0, top), y); await page.waitForTimeout(120); }
  await page.waitForFunction(() => document.querySelectorAll(".reveal:not(.is-in)").length === 0, null, { timeout: 5000 });
  await context.close();
});

test("before any data is published the page says so, with no errors, whether the files are empty or missing", { skip }, async (t) => {
  if (!browser) return t.skip("Chromium is not installed");
  const empty = buildSite([]);
  const missing = buildSite([]);
  fs.rmSync(path.join(missing, "data"), { recursive: true, force: true });
  for (const root of [empty, missing]) {
    const empties = await serve(root);
    try {
      const { page, context, errors } = await open({ reduce: true, base: empties, charts: false });
      assert.equal(await page.textContent("#list .empty h3"), "No internships yet");
      assert.equal(await count(page), "0");
      assert.equal(await page.textContent("[data-stat=total]"), "0");
      assert.deepEqual(errors.filter((e) => !/404/.test(e)), []); // a missing file is the expected 404, nothing else
      await context.close();
    } finally { empties.close(); fs.rmSync(root, { recursive: true, force: true }); }
  }
});
