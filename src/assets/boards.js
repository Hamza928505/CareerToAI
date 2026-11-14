/* The job boards page: the theme button, the clear top bar over the hero, the sections that fade in, the filter
 * for the links and the student's Indeed results (results.js). The boards and feeds are plain links in the page,
 * so without this script they all still work. */
import { theme, revealOnScroll } from "./boards-ui.js";
import "./boards-results.js";
import "./boards-directory.js";
import "./companies.js";

theme.init();
revealOnScroll();

const topbar = document.getElementById("topbar");
const scrolled = () => topbar?.classList.toggle("is-scrolled", window.scrollY > 8);
window.addEventListener("scroll", scrolled, { passive: true });
scrolled();

const input = document.getElementById("boards-q");
const count = document.getElementById("boards-count");
input.addEventListener("input", () => {
  // Read on every keystroke: boards you add yourself join the grid after the page has loaded.
  const items = [...document.querySelectorAll("[data-search-item]")];
  const query = input.value.trim().toLocaleLowerCase();
  let shown = 0;
  for (const item of items) {
    item.hidden = !item.textContent.toLocaleLowerCase().includes(query);
    if (!item.hidden) shown++;
  }
  count.textContent = `${shown} of ${items.length} shown`;
});
