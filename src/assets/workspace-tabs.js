// One workspace panel at a time (the Search page and the CVs & CLs page). Without this script every
// panel is visible and the page reads top to bottom; the hash (#flow-review) still selects a panel and the
// old in-page links keep working. A panel marked data-default opens when the hash names none.
const panels = [...document.querySelectorAll(".workspace-panel")];
const links = [...document.querySelectorAll('.ws-tabs a[href^="#"]')];

function show() {
  if (!panels.length) return;
  const wanted = decodeURIComponent(location.hash.slice(1));
  const id = panels.some((p) => p.id === wanted) ? wanted : (panels.find((p) => p.hasAttribute("data-default")) || panels[0]).id;
  panels.forEach((p) => { p.hidden = p.id !== id; });
  links.forEach((a) => {
    if (a.getAttribute("href") === `#${id}`) a.setAttribute("aria-current", "true");
    else a.removeAttribute("aria-current");
  });
  window.dispatchEvent(new Event("workspace-tab"));
}

addEventListener("hashchange", show);
show();
