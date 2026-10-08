// The guide is long, so each section folds under its heading. Without this
// script every section is open and the page reads straight through; crawlers
// and text-only readers lose nothing either way.
const sections = [...document.querySelectorAll(".guide-body > section")];

for (const section of sections) {
  const heading = section.querySelector(":scope > h2");
  if (!heading) continue;
  const details = document.createElement("details");
  details.className = "guide-fold";
  const summary = document.createElement("summary");
  summary.append(...heading.childNodes);
  summary.id = heading.id;
  const rest = [...section.childNodes].filter((n) => n !== heading);
  details.append(summary, ...rest);
  section.replaceChildren(details);
}

const folds = () => [...document.querySelectorAll(".guide-fold")];

function openFor(hash) {
  if (!hash) return;
  const target = document.getElementById(decodeURIComponent(hash.slice(1)));
  const fold = target?.closest(".guide-fold") || target?.querySelector(".guide-fold");
  if (fold) { fold.open = true; target.scrollIntoView(); }
}

// The first section starts open so the page is not a wall of closed headings.
if (folds()[0]) folds()[0].open = true;
openFor(location.hash);
addEventListener("hashchange", () => openFor(location.hash));
document.querySelectorAll('.toc a[href^="#"]').forEach((a) =>
  a.addEventListener("click", () => openFor(a.getAttribute("href"))));

const bar = document.createElement("p");
bar.className = "guide-fold-bar";
bar.innerHTML = '<button type="button" class="btn" data-fold="open">Open all</button> <button type="button" class="btn" data-fold="close">Close all</button>';
bar.addEventListener("click", (e) => {
  const mode = e.target.closest("[data-fold]")?.dataset.fold;
  if (mode) folds().forEach((f) => { f.open = mode === "open"; });
});
document.querySelector(".guide-body")?.prepend(bar);
