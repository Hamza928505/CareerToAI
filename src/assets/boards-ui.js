import Swal from "./sweetalert2.esm.min.js";
if (typeof window !== "undefined" && !window.Swal) window.Swal = Swal;
/* The page's shared pieces: theme, SweetAlert2 windows, the popup menu, animated numbers and scroll reveal.
 * Text that comes from scraped adverts is only ever shown as text (titleText, textContent), never as HTML. */
const L = window.BoardLogic;
const $ = (id) => document.getElementById(id);

export const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};
export const icon = (classes) => { const i = el("i", `fa-solid ${classes}`); i.setAttribute("aria-hidden", "true"); return i; };
export const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const format = new Intl.NumberFormat("en");

// ---------------------------------------------------------------- theme

const THEME_KEY = "gjub-theme";
const listeners = new Set();
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const stored = () => { try { const v = localStorage.getItem(THEME_KEY); return v === "dark" || v === "light" ? v : null; } catch { return null; } };

export const theme = {
  /** What the page is painting right now: the visitor's choice, else the system's. */
  current() { return document.documentElement.dataset.theme === "dark" || document.documentElement.dataset.theme === "light" ? document.documentElement.dataset.theme : dark.matches ? "dark" : "light"; },
  set(value, remember = true) {
    document.documentElement.dataset.theme = value;
    if (remember) { try { localStorage.setItem(THEME_KEY, value); } catch { /* private window: the choice just does not persist */ } }
    this.paint();
    listeners.forEach((fn) => fn(value));
  },
  toggle() { this.set(this.current() === "dark" ? "light" : "dark"); },
  onChange(fn) { listeners.add(fn); },
  /** Button icon, its label and the browser bar colour follow the theme. */
  paint() {
    const now = this.current();
    const button = $("theme-toggle");
    if (button) {
      button.replaceChildren(icon(now === "dark" ? "fa-sun" : "fa-moon"));
      button.setAttribute("aria-label", now === "dark" ? "Switch to light theme" : "Switch to dark theme");
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = now === "dark" ? "#091622" : "#1f6bad";
  },
  init() {
    this.paint();
    $("theme-toggle")?.addEventListener("click", () => this.toggle());
    // with no choice of their own, the page follows the system as it changes
    dark.addEventListener("change", () => { if (!stored()) { this.paint(); listeners.forEach((fn) => fn(this.current())); } });
  },
};

// ---------------------------------------------------------------- SweetAlert2

const hasSwal = () => typeof window.Swal !== "undefined";
const base = () => ({
  theme: theme.current(),
  buttonsStyling: false,
  reverseButtons: true,
  customClass: { popup: "board-swal", confirmButton: "btn btn-primary", cancelButton: "btn", denyButton: "btn" },
});

/** A small message in the corner that goes away by itself. */
export function toast(kind, title) {
  if (!hasSwal()) return Promise.resolve();
  return window.Swal.fire({
    theme: theme.current(), toast: true, position: "bottom-end", icon: kind, titleText: title,
    showConfirmButton: false, timer: 2800, timerProgressBar: true, customClass: { popup: "board-toast" },
  });
}

/** A window for a value that cannot be used. `focus` runs after it closes, to put the visitor back on the field. */
export async function invalid({ title, html, focus }) {
  if (hasSwal()) await window.Swal.fire({ ...base(), icon: "error", titleText: title, html, confirmButtonText: "Fix it", focusConfirm: true });
  if (focus) focus();
}

export function notice(kind, title, text) {
  if (!hasSwal()) return Promise.resolve();
  return window.Swal.fire({ ...base(), icon: kind, titleText: title, text, confirmButtonText: "OK" });
}

/** A yes/no question before something that cannot be undone; resolves true when confirmed. */
export async function ask(title, text, confirmButtonText) {
  if (!hasSwal()) return window.confirm(`${title}\n\n${text}`);
  const result = await window.Swal.fire({ ...base(), icon: "warning", titleText: title, text, showCancelButton: true, confirmButtonText, cancelButtonText: "Cancel" });
  return result.isConfirmed;
}

/** Ask for one of the downloadable days; resolves to the date, or null when cancelled. */
export async function pickDay(days) {
  if (!hasSwal()) return null;
  const inputOptions = Object.fromEntries(days.map((d) => [d.date, `${d.date}  ·  ${d.count} ${d.count === 1 ? "internship" : "internships"}`]));
  const result = await window.Swal.fire({
    ...base(), titleText: "Download one day", text: "The file has the internships posted on that day.",
    input: "select", inputOptions, inputPlaceholder: "Choose a day…", showCancelButton: true, confirmButtonText: "Download", cancelButtonText: "Cancel",
    inputValidator: (value) => (value ? undefined : "Choose a day first."),
  });
  return result.isConfirmed ? result.value : null;
}

const RULE_ICONS = { ok: "fa-circle-check", warn: "fa-triangle-exclamation", bad: "fa-circle-xmark", info: "fa-circle-info" };
const ruleIcons = { weeks: "fa-hourglass-half", pay: "fa-euro-sign", country: "fa-earth-europe", german: "fa-language", english: "fa-language" };

/** The details window of one internship: where it is, and each GJU rule explained. */
export async function showDetails(p, { rules, majorNames, copyLink }) {
  if (!hasSwal()) return;
  const root = el("div", "detail");
  const head = el("div", "detail-head");
  const avatar = el("span", "avatar", L.initials(p.company));
  avatar.style.setProperty("--h", L.hue(p.company));
  const who = el("div");
  who.append(el("strong", null, p.company || "Company not stated"), el("span", null, [p.city, p.country !== "unknown" ? p.country : ""].filter(Boolean).join(", ") || "Place not stated"));
  head.append(avatar, who);
  root.append(head);

  const list = el("ul", "rule-list");
  for (const line of L.ruleLines(p, rules)) {
    const item = el("li", `rule ${line.state}`);
    const badge = el("i");
    badge.className = `fa-solid ${line.state === "info" ? ruleIcons[line.key] || RULE_ICONS.info : RULE_ICONS[line.state]}`;
    badge.setAttribute("aria-hidden", "true");
    const text = el("div");
    text.append(el("b", null, line.title), el("span", null, line.text));
    item.append(badge, text);
    list.append(item);
  }
  root.append(list);

  const tags = (heading, values, className) => {
    if (!values.length) return;
    const box = el("div");
    box.append(el("h4", null, heading));
    const row = el("div", "tags");
    values.forEach((v) => row.append(el("span", `tag ${className}`, v)));
    box.append(row);
    root.append(box);
  };
  tags("Majors", (p.majors || []).map((id) => majorNames[id] || id), "kind");
  tags("Skills in the advert", p.skills || [], "skill");
  root.append(el("p", "sub", `Posted ${L.ago(p.firstSeen)} (${p.firstSeen})${p.source ? ` · via ${p.source}` : ""}`));

  const href = L.safeUrl(p.url);
  const result = await window.Swal.fire({
    ...base(), titleText: p.title, html: root, width: 580, showCloseButton: true,
    showConfirmButton: Boolean(href), showDenyButton: Boolean(href),
    confirmButtonText: "Open advert", denyButtonText: "Copy link", closeButtonAriaLabel: "Close",
  });
  if (result.isConfirmed && href) window.open(href, "_blank", "noopener,noreferrer");
  if (result.isDenied && href) copyLink(href);
}

/** The explanation of the GJU check, from the published rule numbers. */
export function showHelp(rules) {
  if (!hasSwal()) return Promise.resolve();
  const list = el("ul", "help-list");
  const add = (iconClass, title, text) => {
    const li = el("li");
    const i = icon(iconClass);
    const body = el("div");
    body.append(el("b", null, title), el("span", null, text));
    li.append(i, body);
    list.append(li);
  };
  add("fa-hourglass-half", `At least ${rules.minWeeks} weeks`, "The internship must last the minimum number of weeks the German Year requires.");
  add("fa-euro-sign", `At least ${rules.minMonthlySalary} EUR per month`, "The pay threshold from the German Year documents. If it is lower or unpaid, ask your department what that means for your visa papers.");
  add("fa-earth-europe", "An approved country", `${(rules.approvedCountries || []).join(", ")}. Other countries need approval from your dean or the president.`);
  add("fa-circle-check", "Meets the rules", "All three are stated in the advert and satisfied.");
  add("fa-triangle-exclamation", "Needs checking", "Something is not stated, or a range straddles a limit. Open the advert and confirm it.");
  add("fa-circle-xmark", "Below a limit", "A stated value is under a limit. The details window says which one.");
  const note = el("p", "sub", "The values are read from the advert text by fixed rules and are never guessed. Always confirm with your department before relying on a posting.");
  const root = el("div");
  root.append(list, note);
  return window.Swal.fire({ ...base(), titleText: "How the GJU check works", html: root, width: 600, confirmButtonText: "Got it", showCloseButton: true });
}

// ---------------------------------------------------------------- the popup menu (row actions, downloads)

let menuAnchor = null;

export function closeMenu(returnFocus = false) {
  const menu = $("menu");
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  if (menuAnchor) { menuAnchor.setAttribute("aria-expanded", "false"); if (returnFocus) menuAnchor.focus(); }
  menuAnchor = null;
}

/** items: { icon, label, small?, href?, disabled?, onClick? } or "sep". */
export function showMenu(anchor, items) {
  const menu = $("menu");
  closeMenu(false);
  menu.replaceChildren();
  for (const item of items) {
    if (item === "sep") { menu.append(el("div", "sep")); continue; }
    const node = item.href ? el("a") : el("button");
    node.setAttribute("role", "menuitem");
    if (item.href) Object.assign(node, { href: item.href, target: "_blank", rel: "noopener noreferrer" }); else node.type = "button";
    node.append(icon(item.icon), document.createTextNode(item.label));
    if (item.small != null) node.append(el("small", null, String(item.small)));
    if (item.disabled) node.disabled = true;
    node.addEventListener("click", () => { closeMenu(false); if (item.onClick) item.onClick(); });
    menu.append(node);
  }
  menu.hidden = false;
  menuAnchor = anchor;
  anchor.setAttribute("aria-expanded", "true");
  const r = anchor.getBoundingClientRect();
  menu.style.top = `${Math.max(8, Math.min(r.bottom + 6, window.innerHeight - menu.offsetHeight - 8))}px`;
  menu.style.left = `${Math.max(8, Math.min(r.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8))}px`;
  (menu.querySelector("button:not(:disabled), a") || menu).focus();
}

document.addEventListener("pointerdown", (e) => { if (menuAnchor && !e.target.closest("#menu") && !menuAnchor.contains(e.target)) closeMenu(false); });
document.addEventListener("keydown", (e) => {
  const menu = $("menu");
  if (!menu || menu.hidden) return;
  if (e.key === "Escape") { e.preventDefault(); closeMenu(true); }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const items = [...menu.querySelectorAll("button:not(:disabled), a")];
    const at = items.indexOf(document.activeElement);
    items[(at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  }
});
window.addEventListener("resize", () => closeMenu(false));
document.addEventListener("scroll", (e) => { if (!e.target.closest?.("#menu")) closeMenu(false); }, true);

// ---------------------------------------------------------------- the page menu on phones

const navToggle = $("nav-toggle");
const setNav = (open) => { $("topbar").classList.toggle("nav-open", open); navToggle.setAttribute("aria-expanded", String(open)); };
const navOpen = () => navToggle?.getAttribute("aria-expanded") === "true";
navToggle?.addEventListener("click", () => setNav(!navOpen()));
$("nav")?.addEventListener("click", (e) => { if (e.target.closest("a")) setNav(false); });
document.addEventListener("pointerdown", (e) => { if (navOpen() && !e.target.closest("#topbar")) setNav(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && navOpen()) { setNav(false); navToggle.focus(); } });

// ---------------------------------------------------------------- copy, counters, scroll reveal

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** Count a number up to its value (straight to it with reduced motion). */
export function countUp(node, to, ms = 900) {
  const from = Number(node.dataset.v || 0);
  node.dataset.v = String(to);
  if (reducedMotion() || from === to) { node.textContent = format.format(to); return; }
  const start = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - start) / ms);
    node.textContent = format.format(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Sections fade up the first time they scroll into view. */
export function revealOnScroll() {
  const nodes = document.querySelectorAll(".reveal");
  if (reducedMotion() || !("IntersectionObserver" in window)) { nodes.forEach((n) => n.classList.add("is-in")); return; }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("is-in"); observer.unobserve(entry.target); } });
  }, { threshold: 0.1, rootMargin: "0px 0px -30px 0px" });
  nodes.forEach((n) => observer.observe(n));
}
