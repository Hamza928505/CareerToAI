/*
 * The way every AI task on this site shows that it is working: a thinking orb
 * and a short label, then a one-line result. Needs thinking-orbs.js loaded
 * first; without it the label simply shows alone.
 *
 *   const task = AiStatus.start(element, { state: "composing", label: "Tailoring…" });
 *   task.done("Saved");   // check mark and text
 *   task.fail(message);   // warning mark and text, in the error colour
 *
 * A caller that just sets element.textContent afterwards also clears the orb.
 */
(function () {
  const style = document.createElement("style");
  style.textContent = [
    ".ai-busy, .ai-done { display: inline-flex; align-items: center; gap: .55rem; vertical-align: middle; }",
    ".ai-busy canvas { flex: none; }",
    ".ai-overlay { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 1.5rem; background: rgba(8, 10, 14, .62); backdrop-filter: blur(3px); }",
    ".ai-overlay-card { display: grid; justify-items: center; gap: 1.1rem; max-width: 26rem; padding: 2rem 2.25rem; text-align: center; border-radius: 12px; background: var(--bg-surface, #14171c); color: var(--text-primary, #fff); box-shadow: 0 20px 60px rgba(0,0,0,.45); }",
    ".ai-overlay-card canvas { width: 96px !important; height: 96px !important; }",
    ".ai-overlay-card p { margin: 0; font-size: .95rem; line-height: 1.5; }",
    ".ai-done i { color: var(--success-text, #4ade80); }",
    '[data-state="error"] .ai-done i { color: var(--error-text, #f87171); }',
  ].join("\n");
  document.head.append(style);

  function orb(state, size) {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    if (window.ThinkingOrbs) window.ThinkingOrbs.mount(canvas, state, size || 20);
    return canvas;
  }

  function start(target, { state = "working", label = "Working…", size = 20 } = {}) {
    const text = document.createElement("span");
    text.textContent = label;
    const busy = document.createElement("span");
    busy.className = "ai-busy";
    busy.append(orb(state, size), text);
    target.replaceChildren(busy);
    target.dataset.state = "";
    const started = performance.now();

    return {
      label: (next) => { text.textContent = next; },
      seconds: () => ((performance.now() - started) / 1000).toFixed(1),
      done: (message) => show(target, true, message),
      fail: (message) => show(target, false, message),
    };
  }

  // The orb engine only has presets for 20px and 64px; the overlay draws the 64px one and shows it larger.
  // A full-page loader for a long task: centred orb and label, the page behind it inert until close().
  function overlay({ state = "working", label = "Working…", size = 64 } = {}) {
    const root = document.createElement("div");
    root.className = "ai-overlay";
    root.setAttribute("role", "alertdialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-live", "polite");
    root.setAttribute("aria-label", label);
    const card = document.createElement("div");
    card.className = "ai-overlay-card";
    const text = document.createElement("p");
    text.textContent = label;
    card.append(orb(state, size), text);
    root.append(card);
    const behind = [...document.body.children].filter((el) => !el.matches("script, style, link"));
    behind.forEach((el) => { el.inert = true; });
    document.body.append(root);
    return {
      label: (next) => { text.textContent = next; root.setAttribute("aria-label", next); },
      close: () => { behind.forEach((el) => { el.inert = false; }); root.remove(); },
    };
  }

  // The one-line result: a check or a warning mark, then the words.
  function show(target, ok, message) {
    const done = document.createElement("span");
    done.className = "ai-done";
    const mark = document.createElement("i");
    mark.className = `fa-solid ${ok ? "fa-circle-check" : "fa-circle-exclamation"}`;
    mark.setAttribute("aria-hidden", "true");
    const words = document.createElement("span");
    words.textContent = message;
    done.append(mark, words);
    target.replaceChildren(done);
    target.dataset.state = ok ? "" : "error";
  }

  window.AiStatus = { start, show, orb, overlay };
})();
