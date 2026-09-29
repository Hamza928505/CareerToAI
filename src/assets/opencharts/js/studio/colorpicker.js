/**
 * colorpicker.js — the swatch popover, wherever a colour is edited.
 *
 * It used to live inside `ControlPanel.js` and append itself *into the swatch*
 * as an absolutely-positioned child. That put it at the mercy of whatever it
 * happened to sit inside, and the sidebar is the worst possible host for it:
 * `.controls` is a scroll container (`overflow-y: auto`), so a popover opening
 * near the bottom of the column is clipped by it; the panel is a flex column,
 * so the popover overlaps whatever control comes next — the `+ Add series`
 * button, usually — and it only ever opened downward, with no room check.
 *
 * So it is a **portal**: one element on `document.body`, positioned `fixed`
 * from the swatch's own rect. Three things follow, and each is the reason:
 *
 * - **No ancestor can clip it.** `overflow` on a scroller cannot reach a
 *   sibling of `<body>`'s children.
 * - **Nothing can paint over it.** It is the last child of `body` with a
 *   z-index above the dialog layer, rather than a number that has to win an
 *   argument inside somebody else's stacking context.
 * - **It flips up when there is no room below**, which is the case that made
 *   the old one unreachable rather than merely ugly.
 *
 * Being fixed to a rect means it has to **follow** that rect. The first version
 * dismissed on any scroll, which looked equivalent and was not: clicking a
 * swatch low in the sidebar makes the browser scroll it into view, and that
 * scroll arrives *after* the popover opens — so on any window short enough for
 * the column to scroll, the popover closed within a frame of opening. It
 * repositions instead, and gives up only when its swatch has actually gone.
 */

import { SWATCHES } from './palette.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** Only ever one open, so opening a second closes the first. */
let openPop = null;

export function closeColourPicker() {
  if (!openPop) return;
  openPop.teardown();
  openPop = null;
}

/**
 * Put the popover where it fits, in viewport coordinates.
 *
 * Below the swatch by preference, above it when the bottom of the window is
 * closer than the popover is tall. Clamped horizontally so a swatch near the
 * right edge does not push it off screen.
 */
function place(pop, anchor) {
  const a = anchor.getBoundingClientRect();
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  const gap = 6;
  const room = window.innerHeight - a.bottom;
  const wanted = (room < h + gap && a.top > h + gap) ? a.top - h - gap : a.bottom + gap;
  // Clamped into the window as a last resort. Flipping handles the ordinary
  // case; this handles the ones where neither side has room, so the popover is
  // always wholly reachable rather than half of it hanging off an edge.
  const top = Math.max(8, Math.min(wanted, window.innerHeight - h - 8));
  const left = Math.max(8, Math.min(a.left, window.innerWidth - w - 8));
  pop.style.top = `${Math.round(top)}px`;
  pop.style.left = `${Math.round(left)}px`;
}

/**
 * Make `swatch` open a colour popover.
 *
 * @param {HTMLElement} swatch   the element that shows the current colour
 * @param {() => string} read    the colour now — a function, not a value, so a
 *   repainted row does not reopen on a stale one
 * @param {(hex: string) => void} onPick
 * @param {() => void} [onClear] offered only where there is a default worth
 *   returning to
 */
export function attachColourPicker(swatch, read, onPick, onClear) {
  const current = () => (typeof read === 'function' ? read() : read) || '';

  swatch.addEventListener('click', (e) => {
    e.stopPropagation();
    // A second click on the same swatch closes it, which is what a toggle does.
    if (openPop && openPop.anchor === swatch) { closeColourPicker(); return; }
    closeColourPicker();

    const pop = el('div', 'colour-pop');
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Choose a colour');

    const swatches = el('div', 'colour-pop-grid');
    SWATCHES.forEach((hex) => {
      const dot = el('button', 'palette-dot');
      dot.type = 'button';
      dot.style.background = hex;
      dot.title = hex;
      if (hex.toLowerCase() === current().toLowerCase()) dot.classList.add('active');
      dot.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onPick(hex);
        closeColourPicker();
      });
      swatches.appendChild(dot);
    });

    // A native <input type="color"> gives the OS picker for free; the strip
    // above covers the common case in one click.
    const input = el('input');
    input.type = 'color';
    input.value = /^#[0-9a-f]{6}$/i.test(current()) ? current() : '#666666';
    input.className = 'colour-pop-custom';
    input.title = 'Custom colour';
    input.addEventListener('input', () => onPick(input.value));
    swatches.appendChild(input);

    pop.appendChild(swatches);

    // Somewhere with a default worth returning to needs a way back to it. Only
    // offered where the caller has one — a series colour is always a colour,
    // but an annotation's is "whatever the chart's ink is" until somebody says
    // otherwise.
    if (typeof onClear === 'function') {
      const auto = el('button', 'colour-pop-auto', 'Back to the default colour');
      auto.type = 'button';
      auto.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onClear();
        closeColourPicker();
      });
      pop.appendChild(auto);
    }

    document.body.appendChild(pop);
    place(pop, swatch);

    const onDoc = (ev) => { if (!pop.contains(ev.target) && ev.target !== swatch) closeColourPicker(); };
    const onKey = (ev) => { if (ev.key === 'Escape') closeColourPicker(); };

    /**
     * Keep it against the swatch as things move.
     *
     * Closing on scroll was the obvious rule and the wrong one: clicking a
     * swatch near the bottom of a scrolling column makes the browser scroll it
     * into view, and that scroll lands *after* the popover has opened — so it
     * shut within a frame of opening on any window short enough for the
     * sidebar to scroll. It follows instead, and gives up only when the swatch
     * has left the document or been scrolled out of sight, where a popover
     * would be pointing at nothing. Captured, because the sidebar scrolls, not
     * the window.
     */
    const onMove = () => {
      if (!swatch.isConnected) { closeColourPicker(); return; }
      const a = swatch.getBoundingClientRect();
      const gone = a.bottom < 0 || a.top > window.innerHeight
        || a.right < 0 || a.left > window.innerWidth;
      if (gone) { closeColourPicker(); return; }
      place(pop, swatch);
    };

    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onMove);
    document.addEventListener('scroll', onMove, true);

    openPop = {
      anchor: swatch,
      teardown() {
        document.removeEventListener('mousedown', onDoc, true);
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('resize', onMove);
        document.removeEventListener('scroll', onMove, true);
        pop.remove();
      },
    };

    // `preventScroll` is not a nicety here. The popover is fixed to a rect and
    // dismisses on scroll, and focusing a child scrolls its ancestors to bring
    // it into view — so a plain `focus()` closed the popover on the same frame
    // it opened, whenever the sidebar happened to be scrollable.
    const first = pop.querySelector('.palette-dot');
    if (first) first.focus({ preventScroll: true });
  });
}
