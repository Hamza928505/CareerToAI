/**
 * confirm.js — the blocking half of the feedback pair.
 *
 * `toast.js` handles "that worked". This handles the two moments that genuinely
 * need an answer before anything happens: a replace that would discard work,
 * and an apply whose data has problems the user may or may not care about.
 *
 * This is the SweetAlert2 role, written against the studio's own dialog styles
 * so it inherits the site's type and colour instead of bringing a second design
 * language — and 70KB — along with it.
 */

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.text]
 * @param {string[]} [opts.list]     bullet points, e.g. the offending rows
 * @param {string} [opts.confirm]    confirm button label
 * @param {string} [opts.cancel]     cancel button label; omit for a plain alert
 * @param {string} [opts.alt]        a third way out, resolving to the string 'alt'
 * @param {'ask'|'warn'|'stop'} [opts.tone]
 * @returns {Promise<boolean|'alt'>} true if confirmed, 'alt' for the third button
 */
export function ask(opts) {
  return new Promise((resolve) => {
    const scrim = el('div', 'dlg-scrim ask-scrim');
    const box = el('div', 'ask' + (opts.tone ? ' ask-' + opts.tone : ''));
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');

    const icon = el('div', 'ask-icon');
    icon.textContent = opts.tone === 'stop' ? '!' : opts.tone === 'warn' ? '?' : 'i';
    icon.setAttribute('aria-hidden', 'true');

    const main = el('div', 'ask-main');
    main.appendChild(el('h2', 'ask-title', opts.title));
    if (opts.text) main.appendChild(el('p', 'ask-text', opts.text));
    if (opts.list && opts.list.length) {
      const ul = el('ul', 'ask-list');
      // Six is enough to recognise the pattern; beyond that it is a wall.
      opts.list.slice(0, 6).forEach((line) => ul.appendChild(el('li', null, line)));
      if (opts.list.length > 6) ul.appendChild(el('li', 'ask-more', `…and ${opts.list.length - 6} more`));
      main.appendChild(ul);
    }

    const foot = el('div', 'ask-foot');
    let cancelBtn = null;
    if (opts.cancel) {
      cancelBtn = el('button', 'btn', opts.cancel);
      cancelBtn.type = 'button';
      foot.appendChild(cancelBtn);
    }
    // A third way out, for the case where neither "do it" nor "never mind" is
    // what the reader wants — an upload that fits no chart on this page has a
    // real answer elsewhere, and a dialog that cannot offer it is a dead end.
    let altBtn = null;
    if (opts.alt) {
      altBtn = el('button', 'btn', opts.alt);
      altBtn.type = 'button';
      foot.appendChild(altBtn);
    }
    const okBtn = el('button', 'btn btn-primary' + (opts.tone === 'stop' ? ' btn-danger' : ''), opts.confirm || 'OK');
    okBtn.type = 'button';
    foot.appendChild(okBtn);
    main.appendChild(foot);

    box.append(icon, main);
    scrim.appendChild(box);
    document.body.appendChild(scrim);

    // Restore focus on close: the caller is usually mid-edit in a cell.
    const previous = document.activeElement;
    const done = (value) => {
      document.removeEventListener('keydown', onKey, true);
      scrim.remove();
      if (previous && typeof previous.focus === 'function') previous.focus();
      resolve(value);
    };
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); done(false); }
      else if (e.key === 'Enter') {
        // Enter takes whichever button has focus, rather than always
        // confirming: on a warning the focused button is the safe one, and
        // "press Enter to do the risky thing" is how people lose work.
        e.stopPropagation();
        done(document.activeElement !== cancelBtn);
      } else if (e.key === 'Tab') {
        // Keep Tab inside the dialog, over however many ways out it offers.
        const focusables = [cancelBtn, altBtn, okBtn].filter(Boolean);
        if (focusables.length < 2) { e.preventDefault(); okBtn.focus(); return; }
        e.preventDefault();
        const i = focusables.indexOf(document.activeElement);
        focusables[(i + (e.shiftKey ? focusables.length - 1 : 1)) % focusables.length].focus();
      }
    }

    okBtn.addEventListener('click', () => done(true));
    if (cancelBtn) cancelBtn.addEventListener('click', () => done(false));
    if (altBtn) altBtn.addEventListener('click', () => done('alt'));
    scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) done(false); });
    // `keydown` in the capture phase so the host dialog's own Escape handler
    // does not close everything at once.
    document.addEventListener('keydown', onKey, true);
    // Land on the safe button when there is something to lose.
    (opts.tone === 'stop' && cancelBtn ? cancelBtn : okBtn).focus();
  });
}

/** A one-button notice. */
export function alertBox(title, text, tone = 'stop') {
  return ask({ title, text, tone, confirm: 'Got it' });
}
