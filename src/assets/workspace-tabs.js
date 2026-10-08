// One workspace panel at a time. Without this script every panel is visible and the
// page reads top to bottom; the hash (#flow-review) still selects a panel and the
// old in-page links keep working.
const panels = [...document.querySelectorAll(".workspace-panel")];
const links = [...document.querySelectorAll('.journey-steps a[href^="#flow-"]')];

function show() {
  if (!panels.length) return;
  const wanted = decodeURIComponent(location.hash.slice(1));
  const id = panels.some((p) => p.id === wanted) ? wanted : panels[0].id;
  panels.forEach((p) => { p.hidden = p.id !== id; });
  links.forEach((a) => {
    if (a.getAttribute("href") === `#${id}`) a.setAttribute("aria-current", "true");
    else a.removeAttribute("aria-current");
  });
  window.dispatchEvent(new Event("workspace-tab"));
}

addEventListener("hashchange", show);
show();
