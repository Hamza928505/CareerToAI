/**
 * CheckList.js — a searchable list you tick things off in.
 *
 * The place pickers used to be "search, pick one, press Add", repeated. That is
 * fine for three cities and miserable for thirty, which is what a real map
 * needs. This shows the whole list for a country and lets a reader take as many
 * as they want in one pass.
 *
 * Only the visible slice is built. The US has twelve thousand cities, and
 * putting that many rows in the DOM on every keystroke would make the field
 * feel broken — the same reason `Combobox.js` caps its dropdown.
 */

const MAX_VISIBLE = 300;

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/**
 * An item may carry an `icon` and a `sub`, on the same terms as `Combobox.js`:
 * `icon` is an opaque token passed to the caller's `renderIcon`, and `sub` is
 * a quieter second label — a city's local-language spelling, where the
 * curated list has one.
 *
 * @param {object} opts
 * @param {Array<{value:string,label:string,note?:string,icon?:string,sub?:string,search?:string}>} [opts.items]
 * @param {string[]} [opts.selected]  values ticked to begin with
 * @param {string} [opts.placeholder]
 * @param {string} [opts.emptyText]   shown when the list has nothing in it
 * @param {Function} [opts.renderIcon] (item.icon) => Element | null
 * @param {Function} [opts.onChange]  (selectedValues) => void
 * @returns {{el, setItems, getSelected, setSelected, clear, focus, count}}
 */
export function createCheckList(opts = {}) {
  let items = opts.items || [];
  let filtered = items;
  const chosen = new Set(opts.selected || []);

  const root = el('div', 'clist');

  const bar = el('div', 'clist-bar');
  const search = el('input', 'clist-search');
  search.type = 'search';
  search.placeholder = opts.placeholder || 'Search…';
  search.autocomplete = 'off';
  search.spellcheck = false;
  bar.appendChild(search);

  const allBtn = el('button', 'btn btn-sm', 'Select all');
  allBtn.type = 'button';
  const noneBtn = el('button', 'btn btn-sm', 'Clear');
  noneBtn.type = 'button';
  bar.append(allBtn, noneBtn);

  const box = el('div', 'clist-box');
  box.setAttribute('role', 'group');

  const foot = el('div', 'clist-foot');
  const count = el('span', 'clist-count');
  foot.appendChild(count);

  root.append(bar, box, foot);

  const notify = () => {
    updateCount();
    if (opts.onChange) opts.onChange([...chosen]);
  };

  function updateCount() {
    const n = chosen.size;
    const shown = filtered.length;
    count.textContent = n
      ? `${n} selected of ${shown.toLocaleString()} shown`
      : `${shown.toLocaleString()} shown — tick the ones you want`;
    count.classList.toggle('some', n > 0);
    // "Select all" means all *shown*, which is the only sensible reading once
    // a search has narrowed the list — and the label should say so.
    allBtn.textContent = shown && shown < items.length ? 'Select all shown' : 'Select all';
    allBtn.disabled = !shown;
  }

  function paint() {
    box.innerHTML = '';
    if (!items.length) {
      box.appendChild(el('p', 'clist-empty', opts.emptyText || 'Nothing to show yet.'));
      updateCount();
      return;
    }
    if (!filtered.length) {
      box.appendChild(el('p', 'clist-empty', 'No matches. Try fewer letters.'));
      updateCount();
      return;
    }

    const slice = filtered.slice(0, MAX_VISIBLE);
    slice.forEach((item) => {
      const row = el('label', 'clist-row');
      const cb = el('input', 'clist-check');
      cb.type = 'checkbox';
      cb.checked = chosen.has(item.value);
      cb.addEventListener('change', () => {
        if (cb.checked) chosen.add(item.value); else chosen.delete(item.value);
        row.classList.toggle('on', cb.checked);
        notify();
      });
      row.classList.toggle('on', cb.checked);
      row.appendChild(cb);
      if (opts.renderIcon && item.icon) {
        const icon = opts.renderIcon(item.icon);
        if (icon) row.appendChild(icon);
      }
      // A sibling, not a child — see the same note in `Combobox.js`.
      row.appendChild(el('span', 'clist-label', item.label));
      if (item.sub) row.appendChild(el('span', 'clist-sub', item.sub));
      if (item.note) row.appendChild(el('span', 'clist-note', item.note));
      box.appendChild(row);
    });

    if (filtered.length > MAX_VISIBLE) {
      box.appendChild(el('p', 'clist-empty',
        `…and ${(filtered.length - MAX_VISIBLE).toLocaleString()} more — search to narrow the list.`));
    }
    updateCount();
  }

  function filter(q) {
    const needle = String(q || '').trim().toLowerCase();
    if (!needle) { filtered = items; return; }
    // Prefix matches first: typing "ber" should offer Berlin before Camberwell.
    const starts = [];
    const contains = [];
    for (const item of items) {
      const l = item.label.toLowerCase();
      // Searching the local spelling too, so a reader can find a city by the
      // name it carries at home rather than the one the gazetteer chose.
      const hay = (item.search || item.label).toLowerCase();
      if (l.startsWith(needle) || hay.startsWith(needle)) starts.push(item);
      else if (hay.includes(needle)) contains.push(item);
    }
    filtered = starts.concat(contains);
  }

  search.addEventListener('input', () => { filter(search.value); paint(); });

  allBtn.addEventListener('click', () => {
    // Only what is on screen, so a stray search cannot silently select 12,000.
    filtered.slice(0, MAX_VISIBLE).forEach((i) => chosen.add(i.value));
    paint();
    notify();
  });
  noneBtn.addEventListener('click', () => { chosen.clear(); paint(); notify(); });

  paint();

  return {
    el: root,
    setItems(next, keepSelection) {
      items = next || [];
      if (!keepSelection) chosen.clear();
      filter(search.value);
      paint();
      updateCount();
    },
    getSelected() {
      // In list order, not click order: reading back a map's cities in the
      // order they were ticked would be arbitrary.
      return items.filter((i) => chosen.has(i.value)).map((i) => i.value);
    },
    setSelected(values) { chosen.clear(); (values || []).forEach((v) => chosen.add(v)); paint(); },
    clear() { chosen.clear(); paint(); updateCount(); },
    focus() { search.focus(); },
    count() { return chosen.size; },
  };
}
