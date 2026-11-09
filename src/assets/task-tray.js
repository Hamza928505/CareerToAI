// A small card in the top-right corner for each long task (a search, an email check), so the page stays usable underneath:
// apply, save and edit while it runs. `poll` returns the card's lines (what the server says the task is doing); the card
// asks it every 1.5 s until done() or fail(). Lines are set with textContent only.

const STYLE = `
.task-tray { position: fixed; top: 76px; right: 16px; z-index: 1050; display: grid; gap: .6rem; width: min(360px, calc(100vw - 32px)); pointer-events: none; }
.task-card { pointer-events: auto; padding: .8rem .9rem; border-radius: 12px; border: 1px solid var(--border-default, rgba(127,127,127,.3));
  background: var(--bg-surface, #14171c); color: var(--text-primary, #fff); box-shadow: 0 12px 32px rgba(0,0,0,.28); animation: task-in .25s ease-out; }
.task-head { display: flex; align-items: center; gap: .55rem; }
.task-head strong { flex: 1; font-size: .92rem; line-height: 1.3; }
.task-icon { display: inline-flex; width: 20px; justify-content: center; }
.task-card[data-state="done"] .task-icon { color: var(--success-text, #4ade80); }
.task-card[data-state="error"] .task-icon { color: var(--error-text, #f87171); }
.task-clock { font-variant-numeric: tabular-nums; font-size: .8rem; color: var(--text-secondary, #9aa3ad); }
.task-close { border: 0; background: none; color: var(--text-secondary, #9aa3ad); font-size: 1.15rem; line-height: 1; cursor: pointer; padding: 0 .2rem; }
.task-lines { margin: .5rem 0 0; padding: 0; list-style: none; display: grid; gap: .2rem; font-size: .84rem; color: var(--text-secondary, #9aa3ad); }
.task-lines li:first-child { color: var(--text-primary, #fff); }
.task-lines:empty { display: none; }
.task-foot:empty { display: none; }
.task-foot { margin-top: .55rem; display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
.task-foot p { margin: 0; flex: 1 1 12rem; font-size: .86rem; line-height: 1.4; }
.task-action { border: 0; border-radius: 8px; padding: .4rem .8rem; font: inherit; font-size: .85rem; font-weight: 600; cursor: pointer;
  background: var(--accent, #4f8cff); color: var(--accent-contrast, #fff); }
@keyframes task-in { from { opacity: 0; transform: translateY(-6px); } }
@media (prefers-reduced-motion: reduce) { .task-card { animation: none; } }
`;

const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};

let tray;
function host() {
  if (tray) return tray;
  const style = el('style'); style.textContent = STYLE; document.head.append(style);
  tray = el('div', undefined, 'task-tray');
  tray.setAttribute('aria-live', 'polite');
  document.body.append(tray);
  return tray;
}

export function startTask({ title, state = 'working', poll }) {
  const card = el('section', undefined, 'task-card');
  const icon = el('span', undefined, 'task-icon');
  if (window.AiStatus) icon.append(window.AiStatus.orb(state, 20));
  const clock = el('span', '0:00', 'task-clock');
  const close = el('button', '×', 'task-close'); close.type = 'button'; close.setAttribute('aria-label', 'Hide this'); close.hidden = true;
  const head = el('div', undefined, 'task-head');
  head.append(icon, el('strong', title), clock, close);
  const lines = el('ul', undefined, 'task-lines'), foot = el('div', undefined, 'task-foot');
  card.append(head, lines, foot);
  host().prepend(card);

  const started = Date.now();
  let finished = false;
  const show = (items = []) => lines.replaceChildren(...items.filter(Boolean).map((text) => el('li', text)));
  const tick = setInterval(() => { const s = Math.floor((Date.now() - started) / 1000); clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 1000);
  const timer = poll && setInterval(async () => {
    try { const items = await poll(); if (!finished) show(items); } catch { /* the next tick tries again */ }
  }, 1500);
  const stop = () => { finished = true; clearInterval(tick); clearInterval(timer); close.hidden = false; };
  const remove = () => { stop(); card.remove(); };
  close.addEventListener('click', remove);

  function finish(ok, message, { action, lines: items } = {}) {
    stop();
    card.dataset.state = ok ? 'done' : 'error';
    icon.replaceChildren(el('i', undefined, `fa-solid ${ok ? 'fa-circle-check' : 'fa-triangle-exclamation'}`));
    if (items) show(items);
    foot.replaceChildren(el('p', message));
    if (action) {
      const button = el('button', action.label, 'task-action'); button.type = 'button';
      button.addEventListener('click', () => action.run());
      foot.append(button);
    }
  }
  return { show, remove, done: (message, options) => finish(true, message, options), fail: (message) => finish(false, message) };
}
