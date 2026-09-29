/**
 * resize.js — the controls column is as wide as the reader wants it.
 *
 * It was a fixed 300px, which is 262px once the padding is off it, and that
 * column now carries the data preview, the series editor, the palette, the
 * facet control and the notes. Everything fits and nothing is comfortable.
 *
 * Fixing it by picking a bigger number would be the wrong shape of answer: the
 * studio's whole layout argument is that chrome is spent *before* the subject
 * of the page gets any, and a wider default spends more of it on every reader
 * whether or not they wanted it. So the width is a choice, made by dragging the
 * column's own edge and remembered per browser — the same bargain the rail's
 * collapsed spine already makes.
 *
 * Three rules:
 *
 * - **The handle is the edge, not a widget beside it.** A 7px strip sitting on
 *   the border, so the thing you grab is the thing that moves.
 * - **It writes one custom property.** `--controls-w` already drove the grid,
 *   so nothing else had to learn about this; the column, the stage and every
 *   breakpoint below follow from it.
 * - **Only where there are two columns to divide.** Below 900px the controls
 *   are stacked rather than beside the chart, so the handle is not offered —
 *   dragging a divider that divides nothing is a control that lies.
 */

const KEY = 'opencharts.controls-w';

/** Narrow enough to be tidy, wide enough to be worth dragging to. */
const MIN = 260;
const MAX = 560;
/** What it opens at, and what a double-click goes back to. */
const DEFAULT = 300;

/** Below this the studio stacks, so there is no divider to drag. */
const TWO_COLUMN = 900;

const clamp = (n) => Math.max(MIN, Math.min(MAX, Math.round(n)));

function stored() {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n >= MIN && n <= MAX ? n : null;
  } catch { return null; }
}

function remember(width) {
  try { localStorage.setItem(KEY, String(width)); } catch { /* private window */ }
}

function apply(width) {
  document.documentElement.style.setProperty('--controls-w', `${width}px`);
}

/**
 * Mount the divider between the controls and the stage.
 *
 * @param {HTMLElement} controls the column being resized
 */
export function mountControlsResize(controls) {
  // The grip is a sibling of the column, never a child of it. `buildControls`
  // empties `.controls` on every chart load and every data edit, so a handle
  // inside it is thrown away the first time anything changes — the same trap
  // the hover readout fell into, for the same reason.
  const host = controls && controls.parentElement;
  if (!host || host.querySelector(':scope > .controls-grip')) return;

  const saved = stored();
  if (saved) apply(saved);

  const grip = document.createElement('div');
  grip.className = 'controls-grip';
  grip.setAttribute('role', 'separator');
  grip.setAttribute('aria-orientation', 'vertical');
  grip.setAttribute('aria-label', 'Resize the controls column');
  grip.tabIndex = 0;
  grip.title = 'Drag to resize · double-click to reset';
  host.appendChild(grip);

  const widthNow = () => controls.getBoundingClientRect().width;

  const set = (px) => {
    const w = clamp(px);
    apply(w);
    remember(w);
    grip.setAttribute('aria-valuenow', String(w));
    return w;
  };

  grip.addEventListener('pointerdown', (e) => {
    if (window.innerWidth < TWO_COLUMN) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = widthNow();
    // Set on the document, not the grip: the pointer outruns a 7px strip, and
    // a drag that stops the moment the cursor leaves it is a drag nobody can
    // finish. Removed by the same function that added them.
    const move = (ev) => set(startW + (ev.clientX - startX));
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.body.classList.remove('is-resizing');
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.body.classList.add('is-resizing');
  });

  // Back to the width it shipped with, for anyone who has dragged themselves
  // somewhere they did not mean to be.
  grip.addEventListener('dblclick', () => set(DEFAULT));

  // The same handle from the keyboard, because a mouse-only control is one
  // some readers do not have.
  grip.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 40 : 12;
    if (e.key === 'ArrowLeft') { e.preventDefault(); set(widthNow() - step); }
    if (e.key === 'ArrowRight') { e.preventDefault(); set(widthNow() + step); }
    if (e.key === 'Home') { e.preventDefault(); set(DEFAULT); }
  });

  grip.setAttribute('aria-valuemin', String(MIN));
  grip.setAttribute('aria-valuemax', String(MAX));
  grip.setAttribute('aria-valuenow', String(saved || DEFAULT));
}
