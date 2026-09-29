/**
 * Combobox.js — a searchable dropdown.
 *
 * A native <select> is unusable at 177 countries and impossible at 12,000
 * cities, so this filters as you type and keeps the keyboard working:
 * arrows move, Enter picks, Escape closes.
 *
 * Only the visible slice is rendered — a country like the US has twelve
 * thousand cities, and building that many DOM nodes on every keystroke would
 * make the field feel broken.
 */

const MAX_VISIBLE = 60;

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/**
 * An item may carry an `icon` and a `sub`. Neither means anything to this
 * widget: `icon` is an opaque token handed straight to the caller's own
 * `renderIcon`, so a country picker can draw a flag without this file
 * learning what a country is, and `sub` is a second, quieter label — the
 * local-language name, where there is one.
 *
 * @param {object} opts
 * @param {Array<{value:string,label:string,note?:string,icon?:string,sub?:string,search?:string}>} opts.items
 * @param {string}   [opts.value]       currently selected value
 * @param {string}   [opts.placeholder]
 * @param {string}   [opts.emptyText]   shown when nothing matches
 * @param {boolean}  [opts.allowEmpty]  offer an explicit 'none' choice
 * @param {string}   [opts.emptyLabel]  what that choice is called
 * @param {Function} [opts.renderIcon]  (item.icon) => Element | null
 * @param {Function} opts.onSelect      (value, item) => void
 * @returns {{ el: HTMLElement, setItems: Function, setValue: Function, focus: Function }}
 */
export function createCombobox(opts) {
  let items = opts.items || [];
  let value = opts.value || '';
  let open = false;
  let active = -1;
  let filtered = items;

  // An explicit way back to 'no selection'. Clearing the text box cannot do
  // this job: an empty box is indistinguishable from a half-typed query.
  const blank = opts.allowEmpty ? { value: '', label: opts.emptyLabel || 'None' } : null;

  const root = el('div', 'cbx');
  const input = el('input', 'cbx-input');
  input.type = 'text';
  input.placeholder = opts.placeholder || 'Search…';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-autocomplete', 'list');

  const caret = el('span', 'cbx-caret');
  caret.innerHTML = '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2.5 4l2.5 2.5L7.5 4"/></svg>';

  const list = el('div', 'cbx-list');
  list.setAttribute('role', 'listbox');

  root.append(input, caret, list);

  const labelFor = (v) => {
    if (blank && !v) return blank.label;
    const hit = items.find((i) => i.value === v);
    return hit ? hit.label : v;
  };

  function paint() {
    list.innerHTML = '';
    if (!filtered.length) {
      list.appendChild(el('div', 'cbx-empty', opts.emptyText || 'No matches'));
      return;
    }
    filtered.slice(0, MAX_VISIBLE).forEach((item, i) => {
      const row = el('div', 'cbx-item' + (i === active ? ' active' : '') + (item.value === value ? ' picked' : ''));
      row.setAttribute('role', 'option');
      if (opts.renderIcon && item.icon) {
        const icon = opts.renderIcon(item.icon);
        if (icon) row.appendChild(icon);
      }
      // A sibling of the label, never a child of it: the label's text is read
      // as the item's name, and burying a second name inside it makes a row
      // called `Munich` answer to `MunichMunchen`.
      row.appendChild(el('span', 'cbx-item-label', item.label));
      if (item.sub) row.appendChild(el('span', 'cbx-item-sub', item.sub));
      if (item.note) row.appendChild(el('span', 'cbx-item-note', item.note));
      // mousedown, not click: the input's blur would close the list first.
      row.addEventListener('mousedown', (e) => { e.preventDefault(); pick(item); });
      list.appendChild(row);
    });
    if (filtered.length > MAX_VISIBLE) {
      list.appendChild(el('div', 'cbx-empty', `…and ${filtered.length - MAX_VISIBLE} more — keep typing to narrow`));
    }
  }

  function filter(q) {
    const needle = String(q || '').trim().toLowerCase();
    if (!needle) { filtered = blank ? [blank, ...items] : items; return; }
    // Prefix matches first: typing "ber" should offer Berlin before Camberwell.
    const starts = [];
    const contains = [];
    for (const item of items) {
      const l = item.label.toLowerCase();
      // `search` widens the haystack without widening what is shown, so
      // typing `Deutschland` finds the row the map labels `Germany`.
      const hay = (item.search || item.label).toLowerCase();
      if (l.startsWith(needle) || hay.startsWith(needle)) starts.push(item);
      else if (hay.includes(needle)) contains.push(item);
    }
    filtered = starts.concat(contains);
    // Keep the escape hatch reachable even mid-search.
    if (blank && blank.label.toLowerCase().includes(needle)) filtered.unshift(blank);
  }

  function show() {
    open = true;
    root.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
    paint();
  }

  function hide() {
    open = false;
    active = -1;
    root.classList.remove('open');
    input.setAttribute('aria-expanded', 'false');
  }

  function pick(item) {
    value = item.value;
    input.value = item.label;
    hide();
    if (opts.onSelect) opts.onSelect(item.value, item);
  }

  input.addEventListener('focus', () => { filter(''); input.select(); show(); });
  input.addEventListener('input', () => { filter(input.value); active = -1; show(); });
  input.addEventListener('blur', () => {
    // Restore the label: a half-typed query is not a selection.
    setTimeout(() => { input.value = labelFor(value); hide(); }, 120);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) show();
      const max = Math.min(filtered.length, MAX_VISIBLE) - 1;
      active = e.key === 'ArrowDown'
        ? Math.min(active + 1, max)
        : Math.max(active - 1, 0);
      paint();
      const node = list.children[active];
      if (node) node.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      if (open && filtered[active]) { e.preventDefault(); pick(filtered[active]); }
      else if (open && filtered.length === 1) { e.preventDefault(); pick(filtered[0]); }
    } else if (e.key === 'Escape') {
      input.value = labelFor(value);
      hide();
    }
  });
  caret.addEventListener('mousedown', (e) => { e.preventDefault(); input.focus(); });

  input.value = labelFor(value);
  filter('');

  return {
    el: root,
    setItems(next) { items = next || []; filter(input.value === labelFor(value) ? '' : input.value); if (open) paint(); },
    setValue(v) { value = v; input.value = labelFor(v); },
    getValue() { return value; },
    focus() { input.focus(); },
  };
}
