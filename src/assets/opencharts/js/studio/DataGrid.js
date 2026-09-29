/**
 * DataGrid.js — a small spreadsheet for entering chart data.
 *
 * Typing CSV into a textarea is a poor way to enter numbers: there is no
 * structure, no validation until you commit, and one missing comma silently
 * shifts a whole row. This gives the same data a real grid — click a cell,
 * type, Tab to the next — with validation as you go.
 *
 * Pasting still works, and works well: paste a block from a spreadsheet into
 * any cell and it fills the grid from that point.
 */

import { looksNumeric, columnRules, countOf, transposeTable } from './dataio.js';
import { attachColourPicker } from './colorpicker.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/**
 * @param {object} opts
 * @param {string[]} opts.headers
 * @param {string[][]} opts.rows
 * @param {string} [opts.shape] the data shape, which decides how many leading
 *   columns hold words and what "+ Column" adds. See `columnRules` in dataio.
 * @param {Function} [opts.onChange] called with { headers, rows } after any edit
 * @param {object} [opts.colours] lets the table edit the chart's colours:
 *   `{ modeFor(headers, rows), at(i), set(i, hex) }`. A series is a column and
 *   an item is a row, so the swatch goes wherever that chart's colours actually
 *   live. `modeFor` is asked on every render rather than once, so adding a
 *   series column adds its swatch instead of waiting for the editor to be
 *   reopened.
 * @returns {{ el, getData, setData, addRow, validate }}
 */
export function createDataGrid(opts) {
  let headers = [...(opts.headers || ['Label', 'Value'])];
  let rows = (opts.rows || []).map((r) => [...r]);
  const minRows = opts.minRows || 1;

  // How many columns hold words depends on the shape, and for a flow or a
  // hierarchy it depends on how wide the table currently is — so it is asked
  // for on every render rather than fixed when the grid is built.
  const rules = columnRules(opts.shape);
  const labelCount = () => Math.max(0, Math.min(headers.length, countOf(rules.text, headers)));

  /* One column may not be the chart's data at all.
   *
   * A table split into small multiples carries a column that names the panel,
   * and that column is dropped before the chart ever reads the table. Without
   * this the grid flags every cell of it as a bad number — which is the exact
   * complaint `columnRules` exists to avoid making about `Berlin`, one column
   * over. Every other column is counted as if the facet were not there, so a
   * shape's own rules go on applying to the table it will actually be given.
   */
  /* Colours, when the caller has told us where they belong. */
  const colours = opts.colours || null;
  const colourMode = () => (colours ? colours.modeFor(headers, rows) : null);
  /** A swatch button for palette slot `i`, or null. */
  function swatchFor(i) {
    if (!colours || i < 0) return null;
    const hex = colours.at(i);
    if (!hex) return null;
    const b = el('button', 'dgrid-swatch');
    b.type = 'button';
    b.style.background = hex;
    b.title = 'Change this colour';
    b.setAttribute('aria-label', `Colour ${i + 1}`);
    attachColourPicker(b, () => colours.at(i), (next) => {
      colours.set(i, next);
      b.style.background = next;
      notify();
    });
    return b;
  }

  const skipAt = () => {
    const i = opts.skipColumn ? opts.skipColumn(headers) : -1;
    return (Number.isInteger(i) && i >= 0 && i < headers.length) ? i : -1;
  };
  const dataCol = (c) => { const s = skipAt(); return (s >= 0 && c > s) ? c - 1 : c; };
  const isValueCol = (c) => c !== skipAt() && dataCol(c) >= labelCount();
  const requiredCount = () => Math.min(labelCount(), countOf(rules.filled, headers));
  const addSpec = rules.add;

  /* ── history ───────────────────────────────────────────────────────────
   *
   * A grid that can add and delete rows and columns with no way back makes an
   * editor unsafe to explore in, which is the one thing this one is for.
   *
   * Snapshots rather than inverse operations: the whole state is two arrays of
   * strings, so a copy costs nothing next to the DOM render that follows it,
   * and there is no way for an undo to drift from the edit it reverses.
   */
  const HISTORY_LIMIT = 60;
  let past = [];
  let future = [];
  /* Taken when a cell gains focus, banked on that cell's first keystroke.
   * Typing coalesces into one undo step per cell this way — a snapshot per
   * `input` event would make undo walk back a character at a time. */
  let pendingEdit = null;

  const snapshot = () => ({ headers: [...headers], rows: rows.map((r) => [...r]) });

  function remember(state) {
    past.push(state || snapshot());
    if (past.length > HISTORY_LIMIT) past.shift();
    // A new edit is a new branch: whatever was undone is no longer reachable.
    future = [];
    pendingEdit = null;
    paintHistory();
  }

  function restore(state) {
    headers = [...state.headers];
    rows = state.rows.map((r) => [...r]);
    // The snapshot taken when a cell was focused describes a table that no
    // longer exists; banking it later would undo to a state never edited.
    pendingEdit = null;
    render();
    notify();
    paintHistory();
  }

  function undo() {
    if (!past.length) return;
    future.push(snapshot());
    restore(past.pop());
  }

  function redo() {
    if (!future.length) return;
    past.push(snapshot());
    restore(future.pop());
  }

  const root = el('div', 'dgrid-wrap');
  const scroll = el('div', 'dgrid-scroll');
  const table = el('table', 'dgrid');
  scroll.appendChild(table);

  const foot = el('div', 'dgrid-foot');
  const addRowBtn = el('button', 'btn btn-sm', '+ Row');
  addRowBtn.type = 'button';
  const addColBtn = el('button', 'btn btn-sm', (addSpec && addSpec.label) || '+ Column');
  addColBtn.type = 'button';
  const swapBtn = el('button', 'btn btn-sm dgrid-swap', 'Swap rows ↔ columns');
  swapBtn.type = 'button';
  swapBtn.title = 'Turn the table: each row becomes a column';
  const undoBtn = el('button', 'btn btn-sm dgrid-undo', 'Undo');
  undoBtn.type = 'button';
  undoBtn.title = 'Undo (Ctrl+Z)';
  const redoBtn = el('button', 'btn btn-sm dgrid-undo', 'Redo');
  redoBtn.type = 'button';
  redoBtn.title = 'Redo (Ctrl+Shift+Z)';
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);

  const summary = el('span', 'dgrid-summary');
  foot.append(addRowBtn, addColBtn, swapBtn, undoBtn, redoBtn, summary);

  function paintHistory() {
    undoBtn.disabled = !past.length;
    redoBtn.disabled = !future.length;
  }
  // On a shape that reads a fixed set of columns, another one would be
  // dropped in silence. Offering the button anyway is the kind of promise the
  // rest of this studio is built not to make.
  if (!addSpec) addColBtn.remove();
  // And a swap only where the table is a grid of labels against series, so
  // that turned round it is still one. A path, a place or an OHLC bar reads
  // each column for what it is, and turned ninety degrees is nothing.
  if (!rules.swap) swapBtn.remove();

  root.append(scroll, foot);

  const notify = () => {
    updateSummary();
    if (opts.onChange) opts.onChange(getData());
  };

  function getData() {
    return {
      headers: [...headers],
      // Drop rows the user has emptied rather than exporting blanks.
      rows: rows.filter((r) => r.some((c) => String(c ?? '').trim() !== '')).map((r) => [...r]),
    };
  }

  function updateSummary() {
    const live = rows.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
    const bad = countInvalid();
    summary.textContent = bad
      ? `${live.length} rows · ${bad} cell${bad === 1 ? '' : 's'} to fix`
      : `${live.length} row${live.length === 1 ? '' : 's'} · ${headers.length} columns`;
    summary.className = 'dgrid-summary' + (bad ? ' bad' : '');
  }

  function countInvalid() {
    let n = 0;
    rows.forEach((r) => {
      // A wholly empty row is a placeholder, not an error.
      if (!r.some((c) => String(c ?? '').trim() !== '')) return;
      for (let c = 0; c < headers.length; c++) {
        if (!isValueCol(c)) continue;
        const v = String(r[c] ?? '').trim();
        if (v !== '' && !looksNumeric(v)) n++;
      }
    });
    return n;
  }

  /** Fill the grid from a pasted block, starting at the given cell. */
  function pasteBlock(text, atRow, atCol) {
    remember();
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n').filter((l) => l.length);
    const grid = lines.map((l) => (l.includes('\t') ? l.split('\t') : l.split(',')).map((s) => s.trim()));
    grid.forEach((line, r) => {
      const target = atRow + r;
      while (rows.length <= target) rows.push(new Array(headers.length).fill(''));
      line.forEach((cell, c) => {
        const col = atCol + c;
        // Grow the table to fit what was pasted rather than truncating it.
        while (headers.length <= col) {
          headers.push(addSpec ? addSpec.name(headers.length + 1) : `Series ${headers.length}`);
          rows.forEach((rr) => rr.push(''));
        }
        rows[target][col] = cell;
      });
    });
    render();
    notify();
  }

  function render() {
    table.innerHTML = '';
    while (rows.length < minRows) rows.push(new Array(headers.length).fill(''));
    rows.forEach((r) => { while (r.length < headers.length) r.push(''); });
    const labelCols = labelCount();

    /* header row — names are editable, since they become series labels */
    const thead = el('thead');
    const hr = el('tr');
    hr.appendChild(el('th', 'dgrid-gutter', '#'));
    headers.forEach((h, c) => {
      const th = el('th');
      const inp = el('input', 'dgrid-head-input');
      inp.value = h;
      inp.spellcheck = false;
      inp.setAttribute('aria-label', `Name of column ${c + 1}`);
      inp.addEventListener('input', () => { headers[c] = inp.value; notify(); });
      th.appendChild(inp);
      // A text column may go while there are more of them than the shape
      // needs — that is what lets a fourth Sankey stage be taken back out. A
      // value column may go while more than the minimum remain, except on a
      // shape whose last column *is* the amount: removing it there silently
      // promotes a stage to the value and turns its names into bad numbers.
      const isAmount = addSpec && addSpec.stage && c === headers.length - 1;
      const removable = headers.length > rules.minCols && !isAmount
        && (c >= labelCols || labelCols > rules.minText);
      if (removable) {
        const del = el('button', 'dgrid-del', '✕');
        del.type = 'button';
        del.title = 'Remove this column';
        del.addEventListener('click', () => {
          remember();
          headers.splice(c, 1);
          rows.forEach((rr) => rr.splice(c, 1));
          render(); notify();
        });
        th.appendChild(del);
      }
      hr.appendChild(th);
    });
    hr.appendChild(el('th', 'dgrid-gutter', ''));
    thead.appendChild(hr);

    /* A row for the colours.
     *
     * A series *is* a column here, so its colour reads as another thing said
     * about that column — like its name — and belongs under the name, in line
     * with it. Hanging the swatch off the heading text put it in the same cell
     * as the input and made it look like part of the name.
     *
     * It sits in the `thead`, with the header row it describes: it is not data,
     * it is never validated, and `getData` never sees it. Charts that colour by
     * row rather than by column keep their swatch in the row gutter, which is
     * the same idea turned ninety degrees.
     */
    if (colourMode() === 'column') {
      const cr = el('tr', 'dgrid-colour-row');
      const lead = el('th', 'dgrid-gutter dgrid-colour-lead', 'Colour');
      lead.scope = 'row';
      lead.title = 'The colour each series is drawn in';
      cr.appendChild(lead);
      headers.forEach((_, c) => {
        const td = el('td', 'dgrid-colour-cell');
        const swatch = swatchFor(dataCol(c) - labelCount());
        // A label column names things; it has no colour of its own to set.
        if (swatch) td.appendChild(swatch);
        else td.classList.add('is-blank');
        cr.appendChild(td);
      });
      cr.appendChild(el('td', 'dgrid-gutter', ''));
      thead.appendChild(cr);
    }
    table.appendChild(thead);

    /* body */
    const tbody = el('tbody');
    rows.forEach((row, r) => {
      const tr = el('tr');
      const gutter = el('td', 'dgrid-gutter', String(r + 1));
      // An item is a row, so its colour belongs against its number.
      if (colourMode() === 'row') {
        const rowSwatch = swatchFor(r);
        if (rowSwatch) gutter.appendChild(rowSwatch);
      }
      tr.appendChild(gutter);

      headers.forEach((_, c) => {
        const td = el('td');
        const inp = el('input', 'dgrid-cell');
        inp.value = row[c] ?? '';
        inp.spellcheck = false;
        inp.dataset.row = r;
        inp.dataset.col = c;
        // Numeric columns get a numeric keypad on phones.
        if (isValueCol(c)) inp.setAttribute('inputmode', 'decimal');
        inp.setAttribute('aria-label', `${headers[c]}, row ${r + 1}`);

        const mark = () => {
          const v = String(inp.value).trim();
          const bad = isValueCol(c) && v !== '' && !looksNumeric(v);
          inp.classList.toggle('bad', bad);
          inp.title = bad ? 'This is not a number — it will be read as 0' : '';
        };

        inp.addEventListener('focus', () => { pendingEdit = snapshot(); });
        inp.addEventListener('blur', () => { pendingEdit = null; });
        inp.addEventListener('input', () => {
          // The first keystroke in this cell banks the state it started from.
          if (pendingEdit) { const was = pendingEdit; pendingEdit = null; remember(was); }
          rows[r][c] = inp.value;
          mark();
          notify();
        });
        inp.addEventListener('paste', (e) => {
          const text = (e.clipboardData || window.clipboardData).getData('text');
          if (!text || (!text.includes('\n') && !text.includes('\t'))) return;   // single value: let it through
          e.preventDefault();
          pasteBlock(text, r, c);
        });
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const next = table.querySelector(`.dgrid-cell[data-row="${r + 1}"][data-col="${c}"]`);
            if (next) next.focus();
            else { addRow(); setTimeout(() => {
              const n2 = table.querySelector(`.dgrid-cell[data-row="${r + 1}"][data-col="${c}"]`);
              if (n2) n2.focus();
            }, 0); }
          }
        });
        mark();
        td.appendChild(inp);
        tr.appendChild(td);
      });

      const last = el('td', 'dgrid-gutter');
      if (rows.length > minRows) {
        const del = el('button', 'dgrid-del', '✕');
        del.type = 'button';
        del.title = 'Remove this row';
        del.addEventListener('click', () => { remember(); rows.splice(r, 1); render(); notify(); });
        last.appendChild(del);
      }
      tr.appendChild(last);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    updateSummary();
  }

  function addRow() {
    remember();
    rows.push(new Array(headers.length).fill(''));
    render();
    const inp = table.querySelector(`.dgrid-cell[data-row="${rows.length - 1}"][data-col="0"]`);
    if (inp) inp.focus();
    notify();
  }

  // Scoped to the grid, not the document: Ctrl+Z anywhere else on the page is
  // not this component's to take. Inside a data grid it is expected to mean
  // the table rather than the one cell, which is what every spreadsheet does.
  root.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redo(); }
  });

  addRowBtn.addEventListener('click', addRow);
  // A file arrives laid out however its author thought of it, and a chart
  // reads a series from a column whichever way that was. This is the other
  // way round — undoable, because it is the edit a reader most wants back
  // when it turns out the file was the right way up after all.
  swapBtn.addEventListener('click', () => {
    if (!rules.swap) return;
    remember();
    const turned = transposeTable({ headers, rows });
    headers = turned.headers;
    rows = turned.rows;
    render(); notify();
  });
  addColBtn.addEventListener('click', () => {
    if (!addSpec) return;
    remember();
    // A stage goes in front of the value column: a path is A → B → C and then
    // the amount, never the amount and then another stage.
    const at = addSpec.stage ? Math.max(labelCount(), headers.length - 1) : headers.length;
    headers.splice(at, 0, addSpec.name(at + 1));
    rows.forEach((r) => r.splice(at, 0, ''));
    render(); notify();
    const inp = table.querySelector(`.dgrid-cell[data-row="0"][data-col="${at}"]`);
    if (inp) inp.focus();
  });

  render();
  paintHistory();

  return {
    el: root,
    getData,
    /** Redraw from the state already held — for when what the cells *mean*
     *  has changed without the table changing. Not undoable: nothing moved. */
    refresh() { render(); updateSummary(); },
    setData(next, opts = {}) {
      // Undoable by default: this is how the place pickers and the paste tab
      // write into the grid, and a bulk add is exactly what a reader wants
      // back. `reset: true` is for loading a fresh table, where there is no
      // earlier state worth returning to.
      if (opts.reset) { past = []; future = []; } else { remember(); }
      headers = [...(next.headers || headers)];
      rows = (next.rows || []).map((r) => [...r]);
      pendingEdit = null;
      render(); updateSummary(); paintHistory();
    },
    undo,
    redo,
    /** For the suite: how many steps are on each stack. */
    history() { return { past: past.length, future: future.length }; },
    addRow,
    /** @returns {{ ok: boolean, message: string }} */
    validate() {
      const live = rows.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
      if (!live.length) return { ok: false, message: 'Add at least one row of data.' };
      const bad = countInvalid();
      if (bad) {
        return { ok: false, message: `${bad} cell${bad === 1 ? '' : 's'} ${bad === 1 ? 'is' : 'are'} not a number. Fix the highlighted cells, or clear them.` };
      }
      // Every column the shape needs filled, not just the first: a flow with
      // no `to` is not a flow, and dropping it silently is how a Sankey ends
      // up missing a ribbon nobody can account for.
      const need = requiredCount();
      const blanks = live.filter((r) => {
        for (let c = 0; c < need; c++) if (!String(r[c] ?? '').trim()) return true;
        return false;
      }).length;
      if (blanks) {
        const rowWord = `${blanks} row${blanks === 1 ? '' : 's'}`;
        return {
          ok: false,
          message: need > 1
            ? `${rowWord} ${blanks === 1 ? 'leaves' : 'leave'} one of the first ${need} columns blank.`
            : `${rowWord} ${blanks === 1 ? 'has' : 'have'} no label in the first column.`,
        };
      }
      return { ok: true, message: `${live.length} row${live.length === 1 ? '' : 's'} ready.` };
    },
  };
}
