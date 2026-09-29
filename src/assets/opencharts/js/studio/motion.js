/**
 * motion.js — the interaction motion the stylesheet cannot express on its own.
 *
 * One idea runs through all of it: **motion starts where the user acted.** A
 * ripple opens from the exact pixel that was pressed, a sheen follows the
 * cursor across a card, and a dialog grows out of whatever opened it. The
 * press and hover states live in `css/studio.css`; what is here is only the
 * part that needs to know where the pointer is.
 *
 * Three rules it follows:
 *
 * - **Delegated, never per element.** The gallery is 114 cards and the rail is
 *   114 links. Binding a `pointermove` to each would cost more than everything
 *   else on the page put together, so there is one listener per event type and
 *   it finds its target with `closest`.
 * - **One custom-property write per frame.** Pointer moves fire faster than
 *   the screen refreshes, so the coordinates are stashed and applied in a
 *   `requestAnimationFrame` — writing on every event would lay out the page
 *   several times per frame for a gradient nobody asked to be that precise.
 * - **Reduced motion means none of it.** The stylesheet's global
 *   `prefers-reduced-motion` block neutralises transitions and animations, but
 *   a custom property written from JS is neither, so it cannot reach the sheen.
 *   This file checks the query itself and keeps checking — somebody who turns
 *   the preference on should not have to reload to be believed.
 */

/** Cards take a cursor-tracked sheen. */
const SHEEN = '.card';

/** Controls that open a ripple from the point pressed. */
const RIPPLE = '.btn, .tab, .filter, .seg-btn, .prompt-mode, .dlg-tab, .card-prompt';

const reduceQuery = typeof matchMedia === 'function'
  ? matchMedia('(prefers-reduced-motion: reduce)')
  : null;

let reduced = !!(reduceQuery && reduceQuery.matches);

/**
 * Where the pointer last went down, in viewport coordinates.
 *
 * Kept here rather than passed through every call site: a dialog is opened
 * from a control, a toast is raised by an action, and neither wants a
 * `PointerEvent` threaded through three function signatures to find out where
 * it should come from.
 */
let lastPointer = null;

let pending = null;
let frame = 0;

/** Apply the stashed coordinates once per frame, not once per event. */
function flush() {
  frame = 0;
  if (!pending) return;
  const { el, x, y } = pending;
  pending = null;
  if (!el.isConnected) return;
  el.style.setProperty('--mx', `${x}%`);
  el.style.setProperty('--my', `${y}%`);
}

function onPointerMove(e) {
  if (reduced) return;
  const card = e.target.closest ? e.target.closest(SHEEN) : null;
  if (!card) return;
  const r = card.getBoundingClientRect();
  if (!r.width || !r.height) return;
  pending = {
    el: card,
    x: Math.round(((e.clientX - r.left) / r.width) * 100),
    y: Math.round(((e.clientY - r.top) / r.height) * 100),
  };
  if (!frame) frame = requestAnimationFrame(flush);
}

function onPointerDown(e) {
  // Recorded even under reduced motion: `applyOrigin` uses it to place a
  // dialog, which is position rather than animation.
  lastPointer = { x: e.clientX, y: e.clientY };
  if (reduced) return;

  const el = e.target.closest ? e.target.closest(RIPPLE) : null;
  if (!el || el.disabled) return;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;

  el.style.setProperty('--rx', `${e.clientX - r.left}px`);
  el.style.setProperty('--ry', `${e.clientY - r.top}px`);

  // Restart rather than ignore: pressing the same button twice quickly should
  // ripple twice. Removing the class and reading `offsetWidth` forces the
  // reflow that lets the animation begin again.
  el.classList.remove('rippling');
  void el.offsetWidth;
  el.classList.add('rippling');
}

function onAnimationEnd(e) {
  if (e.animationName !== 'ripple') return;
  const el = e.target;
  if (el.classList) el.classList.remove('rippling');
}

/**
 * Point an element's growth at wherever the pointer last went down.
 *
 * The origin is written as a percentage of the element's own box, so the
 * corner nearest the click is the corner that holds still while the rest
 * scales out of it. A click outside the element — or a dialog opened from the
 * keyboard, where there is no click at all — falls back to the centre, which
 * is the neutral answer rather than a wrong one.
 */
export function applyOrigin(el) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (!lastPointer || !r.width || !r.height) {
    el.style.removeProperty('--from-x');
    el.style.removeProperty('--from-y');
    return;
  }
  const clamp = (v) => Math.max(0, Math.min(100, v));
  el.style.setProperty('--from-x', `${clamp(((lastPointer.x - r.left) / r.width) * 100)}%`);
  el.style.setProperty('--from-y', `${clamp(((lastPointer.y - r.top) / r.height) * 100)}%`);
}

/**
 * Mark a value as having just changed, so it can be seen to change.
 *
 * The class is removed first so a value that changes twice in a row animates
 * twice — the second edit is the one somebody is watching for.
 */
export function markChanged(el, cls = 'changed') {
  if (!el || reduced) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/** Whether motion is currently suppressed. Lets callers skip work entirely. */
export const motionReduced = () => reduced;

let started = false;

/** Start the delegated listeners. Safe to call more than once. */
export function initMotion() {
  if (started || typeof document === 'undefined') return;
  started = true;

  if (reduceQuery) {
    const onChange = () => {
      reduced = reduceQuery.matches;
      if (!reduced) return;
      // Clear anything mid-flight rather than freezing it on screen.
      document.querySelectorAll('.rippling').forEach((el) => el.classList.remove('rippling'));
    };
    // Safari below 14 has only the deprecated listener.
    if (typeof reduceQuery.addEventListener === 'function') reduceQuery.addEventListener('change', onChange);
    else if (typeof reduceQuery.addListener === 'function') reduceQuery.addListener(onChange);
  }

  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerdown', onPointerDown, { passive: true });
  document.addEventListener('animationend', onAnimationEnd);
}
