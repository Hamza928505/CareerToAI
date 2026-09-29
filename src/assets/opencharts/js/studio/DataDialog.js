/**
 * DataDialog.js — where data actually gets entered.
 *
 * Three ways in, one source of truth. The grid holds `{ headers, rows }`; the
 * pickers append to it; the paste tab parses into it. "Use this data" then
 * serialises that back to CSV and hands it to the same `applyData` the sidebar
 * uses, so there is exactly one parsing path to reason about.
 *
 * The grid leads because typing a table into a textarea is the worst part of
 * the old flow: no structure, no feedback until you commit, and one missing
 * comma silently shifts a whole row.
 */

import {
  parseTable, applyData, toCSV, looksNumeric, expectedFormat, columnRules, countOf,
} from './dataio.js';
import { createDataGrid } from './DataGrid.js';
import { createCombobox } from './Combobox.js';
import { createCheckList } from './CheckList.js';
import {
  loadCountries, loadCities, countryItems, findCountryEntry, localCityName,
} from './geodata.js';
import { flagIcon } from './flags.js';
import { applyOrigin } from './motion.js';
import { ask } from './confirm.js';
import { readDataFile, readDataUrl, ACCEPTED } from './fileimport.js';
import { loadLibrary } from './loader.js';
import {
  OPS, TESTS, AGGREGATES, runSteps, defaultStep, defaultValueCols, numericColumns, describeStep,
} from './transform.js';
import { toast } from './toast.js';
import { facetableColumns, facetByColumn, facetSource, isFaceted } from './facet.js';
import { paletteOf } from './cvd.js';
import { paletteAt } from './palette.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};


/**
 * Open the editor.
 *
 * @param {object} def   chart definition
 * @param {object} spec  live spec — only mutated if the user applies a change
 * @param {Function} onApply called after a successful apply
 * @param {string|{headers: string[], rows: string[][]}} [seed] open on this
 *   table instead of the chart's current one — how a file that did not match
 *   its chart gets handed over for fixing. Text is parsed, and its header row
 *   guessed at; a table is taken as it stands, for a caller that already knows
 *   which row is the header — the guess fails on exactly the table a swap
 *   produces, whose header row is the file's label column and may be years.
 */
export function openDataDialog(def, spec, onApply, seed) {
  const seedTable = seed && typeof seed === 'object' && Array.isArray(seed.rows) ? seed : null;
  const seedText = seedTable ? toCSV(seedTable.headers, seedTable.rows) : seed;
  const desc = def.data || {};
  const picker = desc.picker || null;   // 'cities' | 'countries' | null

  // The chart's own column names, so a table that holds no numbers at all —
  // an edge list — still has its header row recognised as one.
  const expectedCols = expectedFormat(def).columns;
  // How many leading columns hold words rather than numbers. Flagging
  // "Berlin" as a bad number would be worse than not validating at all, and
  // on a flow this grows with the table: every column but the last is a stage.
  const labelColumnsFor = (headers) => countOf(columnRules(desc.shape).text, headers);

  /* ── shell ──────────────────────────────────────────────────────────── */

  const scrim = el('div', 'dlg-scrim');
  const dlg = el('div', 'dlg');
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-label', 'Edit chart data');

  const head = el('div', 'dlg-head');
  const titles = el('div');
  titles.appendChild(el('h2', 'dlg-title', 'Your data'));
  titles.appendChild(el('p', 'dlg-sub', `${def.title} — ${desc.hint || 'Fill in the table below.'}`));
  const close = el('button', 'dlg-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  head.append(titles, close);

  const tabs = el('div', 'dlg-tabs');
  tabs.setAttribute('role', 'tablist');
  const panels = el('div', 'dlg-panels');

  const foot = el('div', 'dlg-foot');
  const status = el('span', 'dlg-status');
  const resetBtn = el('button', 'btn', 'Load example');
  resetBtn.type = 'button';
  const cancel = el('button', 'btn', 'Cancel');
  cancel.type = 'button';
  const apply = el('button', 'btn btn-primary', 'Use this data');
  apply.type = 'button';
  foot.append(status, resetBtn, cancel, apply);

  dlg.append(head, tabs, panels, foot);
  scrim.appendChild(dlg);
  document.body.appendChild(scrim);
  // After it is in the document, because the origin is a share of the
  // dialog's own box and an unmounted element has no box to measure.
  applyOrigin(dlg);

  /* ── initial table ──────────────────────────────────────────────────── */

  // A faceted chart's spec no longer holds the column it was split by — the
  // panels each got a table with that column already spent. The editor has to
  // open on the whole thing, or the reader cannot see, let alone change, the
  // column their grid is built on.
  const facetTable = facetSource(spec);
  const currentText = facetTable
    ? toCSV(facetTable.headers, facetTable.rows)
    : (typeof def.toText === 'function' ? def.toText(spec) : '');
  const fromChart = !(seedText && seedText.trim()) && !!(currentText && currentText.trim());
  const startText = seedText && seedText.trim()
    ? seedText
    : (currentText && currentText.trim() ? currentText : (desc.example || ''));
  // A table this chart wrote itself has a header by construction. A table
  // handed over from a file does not, so that one still has to be worked out.
  const start = seedTable
    ? { headers: [...seedTable.headers], rows: seedTable.rows.map((r) => [...r]) }
    : parseTable(startText, fromChart ? true : expectedCols);

  /* ── colours in the table ────────────────────────────────────────────
   *
   * Colours are not part of the table — they live on the spec, and the table
   * holds words and numbers. But the reader thinks of a series as a column and
   * an item as a row, and that is where they look to recolour one, so the
   * swatch goes there.
   *
   * Which of the two it is, is not declared per chart: it follows from whether
   * the palette has one entry per value column or one per row. Where it lines
   * up with neither, no swatch is offered — a swatch on the wrong thing is
   * worse than none.
   *
   * Edits are held here until Apply. The spec's arrays are rebuilt by
   * `applyData`, so writing a colour into the old one would be writing into
   * something about to be replaced.
   */
  const startPalette = paletteOf(def, spec);
  const pendingColours = [...startPalette.colors];
  // Only what somebody actually picked is written back. A swatch showing the
  // colour a column *will* be drawn in has not been chosen by anyone, and
  // writing it would turn a default into a decision.
  const chosenColours = new Set();

  /**
   * Where this chart's colours belong — under the columns, or beside the rows.
   *
   * Settled once, from the table the editor opens on. Recomputing it per render
   * would move the swatches from the head to the gutter halfway through an
   * edit, which is worse than leaving them where they were. *How many* there
   * are is not settled here: the grid renders one per column and asks again on
   * every render, so adding a series brings its swatch with it.
   */
  const startValueCols = start.headers.length - labelColumnsFor(start.headers);
  const colourLayout = (() => {
    const n = startPalette.colors.length;
    if (!startPalette.from) return null;
    // A single-series chart still has a colour, and it belongs to its column.
    if (n <= 1) return startValueCols >= 1 ? 'column' : null;
    if (n === startValueCols) return 'column';
    if (n === start.rows.length) return 'row';
    return null;
  })();

  const gridColours = colourLayout ? {
    modeFor: () => colourLayout,
    // A column with no colour of its own shows the one it will be given, so
    // the row is never half empty — `applyData` assigns from the same list.
    at: (i) => pendingColours[i] || paletteAt(i),
    set: (i, hex) => {
      if (i < 0) return;
      pendingColours[i] = hex;
      chosenColours.add(i);
    },
  } : null;

  // Declared before the grid because the grid asks for it while it renders:
  // a column being split on is not the chart's data, so it is not validated as
  // a number.
  let facetBy = facetTable ? String(spec.facet.by || '') : null;

  const grid = createDataGrid({
    headers: start.headers.length ? start.headers : ['Label', 'Value'],
    rows: start.rows,
    shape: desc.shape,
    minRows: 1,
    skipColumn: (headers) => (facetBy ? headers.indexOf(facetBy) : -1),
    colours: gridColours,
    onChange: () => {
      status.textContent = '';
      status.className = 'dlg-status';
      // Adding or renaming a column changes what can be split on.
      refreshFacet();
    },
  });

  /* ── tabs ───────────────────────────────────────────────────────────── */

  const panelFor = {};
  const tabFor = {};
  let activeTab = 'grid';

  const onEnter = {};

  function addTab(id, label, node, enter) {
    const b = el('button', 'dlg-tab', label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => select(id));
    tabs.appendChild(b);
    const panel = el('div', 'dlg-panel');
    panel.appendChild(node);
    panels.appendChild(panel);
    tabFor[id] = b;
    panelFor[id] = panel;
    if (enter) onEnter[id] = enter;
  }

  function select(id) {
    // Leaving the paste tab commits whatever is in it, so a user who pastes
    // and then clicks "Table" does not silently lose the paste.
    if (activeTab === 'paste' && id !== 'paste') commitPaste();
    activeTab = id;
    Object.entries(tabFor).forEach(([k, b]) => {
      const on = k === id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
      panelFor[k].classList.toggle('active', on);
    });
    if (id === 'paste') {
      const data = grid.getData();
      pasteArea.value = toCSV(data.headers, data.rows);
      pasteEdited = false;
      refreshPastePreview();
    }
    if (onEnter[id]) onEnter[id]();
    // `grid.setData` does not fire `onChange`, and it is how the paste tab,
    // the pickers and the Shape tab all write — so the split strip is rebuilt
    // on every route back to the table rather than trusting an edit event
    // that three of the four ways in never send.
    refreshFacet();
  }

  /* Tab 1 — the grid */
  const gridPanel = el('div', 'dlg-gridwrap');
  gridPanel.appendChild(grid.el);
  const gridNote = el('p', 'dlg-note');
  gridNote.innerHTML =
    'Click a cell and type. <kbd>Tab</kbd> moves across, <kbd>Enter</kbd> moves down. '
    + 'You can paste a block straight from Excel or Sheets into any cell — it fills from there.'
    // Only said where the button exists: the sentence names a control, and a
    // sentence about a control that is not there is a scavenger hunt.
    + (columnRules(desc.shape).swap
      ? ' If your series run down the table rather than across it, <b>Swap rows ↔ columns</b> turns it.'
      : '');
  gridPanel.appendChild(gridNote);

  /* Splitting one table into a grid of charts.
   *
   * It lives under the table rather than in a tab of its own, because unlike
   * a transform it is not a step that runs — the table is unchanged and the
   * split is a property of the chart. The strip is only there when a column
   * could actually carry it; offering "split by" over a table with no
   * repeating column would be a control that never works.
   *
   * The choice is remembered by column *name*, not index: adding a column in
   * the grid moves every index to its right, and a split that silently
   * changed which column it was on would be worse than one that forgot. */
  const facetStrip = el('div', 'dlg-facet');

  function refreshFacet() {
    const data = grid.getData();
    const options = facetableColumns(data);
    const names = options.map((o) => o.name);
    if (facetBy && !names.includes(facetBy)) facetBy = null;

    facetStrip.innerHTML = '';
    facetStrip.hidden = !options.length;
    if (!options.length) return;

    facetStrip.appendChild(el('span', 'dlg-facet-label', 'Split into one chart per'));
    const buttons = [];
    const paint = () => buttons.forEach((b) => b.classList.toggle('on', b._by === facetBy));
    [{ name: null, label: 'Nothing' },
      ...options.map((o) => ({ name: o.name, label: `${o.name} · ${o.values}` }))]
      .forEach((opt) => {
        const b = el('button', 'facet-chip', opt.label);
        b.type = 'button';
        b._by = opt.name;
        b.addEventListener('click', () => {
          facetBy = opt.name;
          paint();
          // The cells in that column stop being numbers the moment it becomes
          // a facet, so the validation marks have to catch up.
          grid.refresh();
        });
        buttons.push(b);
        facetStrip.appendChild(b);
      });
    paint();
  }

  gridPanel.appendChild(facetStrip);
  addTab('grid', 'Table', gridPanel);

  /* Tab 2 — the place pickers */
  let refreshPickList = null;
  if (picker) {
    addTab('pick', picker === 'cities' ? 'Pick cities' : 'Pick countries',
      buildPicker(), () => refreshPickList && refreshPickList());
  }

  /* Tab 3 — paste */
  const pastePanel = el('div', 'dlg-body');
  const leftCol = el('div', 'dlg-col');
  leftCol.appendChild(el('label', 'dlg-label', 'Paste a table'));
  const pasteArea = el('textarea', 'dlg-paste');
  pasteArea.spellcheck = false;
  pasteArea.setAttribute('aria-label', 'Chart data as text');
  const pasteTools = el('div', 'dlg-tools');
  const useBtn = el('button', 'btn btn-sm', 'Read into the table');
  useBtn.type = 'button';
  const rowCount = el('span', 'dlg-rowcount');
  pasteTools.append(useBtn, rowCount);
  leftCol.append(pasteArea, pasteTools);

  const rightCol = el('div', 'dlg-col');
  rightCol.appendChild(el('label', 'dlg-label', 'What OpenCharts reads'));
  const preview = el('div', 'dlg-preview');
  rightCol.appendChild(preview);
  const formatNote = el('p', 'dlg-note');
  formatNote.innerHTML =
    'Commas, tabs and semicolons all work. A header row is detected automatically, '
    + 'and <code>1,234</code>, <code>$99</code> and <code>42%</code> are all read as numbers.';
  rightCol.appendChild(formatNote);
  pastePanel.append(leftCol, rightCol);
  addTab('paste', 'Paste text', pastePanel);

  /* Tab 4 — a file straight off disk */
  addTab('file', 'Open a file', buildFileTab());
  addTab('link', 'From a link', buildLinkTab());
  // Last, because it works on what the other tabs brought in rather than
  // being another way in. `refresh` re-runs it on entry: the grid may have
  // changed since it was last looked at.
  const shape = buildShapeTab();
  addTab('shape', 'Shape', shape.node, shape.refresh);

  /* ── the paste tab ──────────────────────────────────────────────────── */

  // The paste tab opens on the grid's own CSV. Until somebody edits it, its
  // header row is still the grid's and does not need detecting; after that it
  // is a paste like any other.
  let pasteEdited = false;

  function commitPaste() {
    const t = parseTable(pasteArea.value, pasteEdited ? expectedCols : true);
    if (!t.rows.length) return;
    grid.setData({ headers: t.headers, rows: t.rows });
  }

  function refreshPastePreview() {
    const table = parseTable(pasteArea.value, pasteEdited ? expectedCols : true);
    rowCount.textContent = table.rows.length
      ? `${table.rows.length} row${table.rows.length === 1 ? '' : 's'} · ${table.headers.length} column${table.headers.length === 1 ? '' : 's'}`
      : 'nothing to read yet';

    preview.innerHTML = '';
    if (!table.rows.length) {
      preview.appendChild(el('p', 'dlg-note', 'Paste something on the left and it will appear here.'));
      return;
    }

    const t = el('table', 'dlg-table');
    const thead = el('thead');
    const hr = el('tr');
    const labelCols = labelColumnsFor(table.headers);
    table.headers.forEach((h, i) => {
      const th = el('th', null, h);
      th.appendChild(el('span', 'dlg-role', i < labelCols ? 'labels' : 'values'));
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    t.appendChild(thead);

    const tbody = el('tbody');
    // Twelve rows is enough to see the shape without making the dialog scroll.
    table.rows.slice(0, 12).forEach((row) => {
      const tr = el('tr');
      table.headers.forEach((_, i) => {
        const cell = row[i] ?? '';
        // Flag anything in a value column that will not parse — "n/a", a stray
        // note, a merged cell — before it is applied rather than after.
        const unreadable = i >= labelCols && cell !== '' && !looksNumeric(cell);
        const td = el('td', unreadable ? 'bad' : null, cell);
        if (unreadable) td.title = 'This will be read as 0';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    t.appendChild(tbody);
    preview.appendChild(t);

    if (table.rows.length > 12) {
      preview.appendChild(el('p', 'dlg-note', `…and ${table.rows.length - 12} more rows.`));
    }
    if (!table.hadHeader) {
      preview.appendChild(el('p', 'dlg-note',
        'No header row was detected, so the columns were named for you.'));
    }
  }

  pasteArea.addEventListener('input', () => { pasteEdited = true; refreshPastePreview(); });
  useBtn.addEventListener('click', () => { commitPaste(); select('grid'); toast('Read into the table', 'ok'); });

  /* ── opening a file ─────────────────────────────────────────────────── */

  /**
   * Fetch a published CSV once, into the grid.
   *
   * A separate tab from "Open a file" on purpose. That one promises nothing is
   * uploaded and no request is made, and it keeps that promise; this one makes
   * exactly one request, and the reader has to type an address and press a
   * button to cause it. Putting them in one panel would have made the first
   * promise quietly untrue.
   *
   * What arrives becomes literal values in the grid, like a paste. The chart
   * does not keep the address, so an export cannot break later because
   * somebody else's server moved.
   */
  /**
   * Reshape the table before it becomes a chart.
   *
   * The panel is a pipeline: each step sees the table the one above it made,
   * which is why the column pickers are rebuilt on every change — grouping
   * renames and drops columns, so a sort added after it must be choosing from
   * the headings that exist by then, not the ones the file arrived with.
   *
   * Nothing here touches the chart until "Use this shape" is pressed. What it
   * writes is literal values in the grid, the same thing a paste produces, so
   * the numbers on the chart are numbers the reader looked at first.
   */
  function buildShapeTab() {
    const wrap = el('div', 'pick shape');
    let steps = [];

    // Arquero runs the pipeline where it is present and the built-in runners
    // answer identically where it is not, so this is fetched for speed rather
    // than for correctness — which is why nothing waits on it. Asked for when
    // the tab is built rather than on the first step, so the first run of a
    // long table already has it.
    loadLibrary('arquero').catch(() => { /* the native runners are the truth */ });

    wrap.appendChild(el('p', 'dlg-note',
      'Group, filter, sort or bucket the rows before they reach the chart — or swap '
      + 'rows and columns, when the series run down the file instead of across it. '
      + 'Useful when the file is five hundred transactions and the chart is seven bars.'));

    const stepList = el('div', 'shape-steps');
    wrap.appendChild(stepList);

    const addRow = el('div', 'shape-add');
    const addSel = el('select', 'shape-select');
    addSel.setAttribute('aria-label', 'Kind of step to add');
    addSel.appendChild(new Option('Add a step…', ''));
    OPS.forEach((o) => addSel.appendChild(new Option(o.label, o.id)));
    addRow.appendChild(addSel);
    wrap.appendChild(addRow);

    const result = el('div', 'shape-result');
    wrap.appendChild(result);

    const actions = el('div', 'pick-actions');
    const useBtn = el('button', 'btn btn-primary', 'Use this shape');
    useBtn.type = 'button';
    const clearBtn = el('button', 'btn', 'Clear steps');
    clearBtn.type = 'button';
    actions.append(useBtn, clearBtn);
    wrap.appendChild(actions);

    const source = () => grid.getData();

    /** A <select> of the columns a step can see at its point in the pipeline. */
    const colSelect = (headers, value, onChange, label) => {
      const s = el('select', 'shape-select');
      s.setAttribute('aria-label', label || 'Column');
      headers.forEach((h, i) => {
        const o = new Option(h || `Column ${i + 1}`, String(i));
        s.appendChild(o);
      });
      s.value = String(Math.min(value | 0, Math.max(0, headers.length - 1)));
      s.addEventListener('change', () => onChange(Number(s.value)));
      return s;
    };

    const pickSelect = (options, value, onChange, label) => {
      const s = el('select', 'shape-select');
      s.setAttribute('aria-label', label || 'Option');
      options.forEach((o) => s.appendChild(new Option(o.label, o.id)));
      s.value = value;
      s.addEventListener('change', () => onChange(s.value));
      return s;
    };

    const numberBox = (value, onChange, label) => {
      const i = el('input', 'shape-number');
      i.type = 'number';
      i.min = '1';
      i.value = String(value);
      i.setAttribute('aria-label', label || 'Number');
      i.addEventListener('input', () => onChange(Number(i.value)));
      return i;
    };

    const textBox = (value, onChange, label) => {
      const i = el('input', 'shape-text');
      i.type = 'text';
      i.value = value == null ? '' : String(value);
      i.setAttribute('aria-label', label || 'Value');
      i.addEventListener('input', () => onChange(i.value));
      return i;
    };

    /* ── one step's controls ──────────────────────────────────────────── */

    function stepControls(step, at, headers) {
      const row = el('div', 'shape-step');
      row.appendChild(el('span', 'shape-n', String(at + 1)));

      const body = el('div', 'shape-body');
      const change = () => paint();

      if (step.op === 'filter') {
        body.appendChild(el('span', 'shape-word', 'Keep rows where'));
        body.appendChild(colSelect(headers, step.col, (v) => { step.col = v; change(); }, 'Column to test'));
        body.appendChild(pickSelect(TESTS, step.test, (v) => { step.test = v; change(); }, 'Comparison'));
        const test = TESTS.find((t) => t.id === step.test) || TESTS[0];
        if (test.needs >= 1) body.appendChild(textBox(step.a, (v) => { step.a = v; change(); }, 'Value'));
        if (test.needs === 2) {
          body.appendChild(el('span', 'shape-word', 'and'));
          body.appendChild(textBox(step.b, (v) => { step.b = v; change(); }, 'Second value'));
        }
      } else if (step.op === 'group') {
        body.appendChild(el('span', 'shape-word', 'Group by'));
        body.appendChild(colSelect(headers, step.col, (v) => {
          step.col = v;
          // The key column changing can invalidate the chosen value columns,
          // so they are recomputed rather than left pointing at the key.
          step.vals = defaultValueCols({ headers, rows: [] }, v);
          change();
        }, 'Column to group by'));
        body.appendChild(pickSelect(AGGREGATES, step.agg, (v) => { step.agg = v; change(); }, 'How to combine'));

        if (step.agg !== 'count') {
          const stage = { headers, rows: stagesFor(at).rows };
          const numeric = numericColumns(stage).filter((c) => c !== step.col);
          if (numeric.length) {
            body.appendChild(el('span', 'shape-word', 'of'));
            const box = el('div', 'shape-cols');
            const chosen = Array.isArray(step.vals) ? step.vals : defaultValueCols(stage, step.col);
            numeric.forEach((c) => {
              const lab = el('label', 'shape-col');
              const cb = el('input');
              cb.type = 'checkbox';
              cb.checked = chosen.includes(c);
              cb.addEventListener('change', () => {
                const set = new Set(Array.isArray(step.vals) ? step.vals : chosen);
                if (cb.checked) set.add(c); else set.delete(c);
                step.vals = [...set].sort((x, y) => x - y);
                change();
              });
              lab.append(cb, el('span', null, headers[c] || `Column ${c + 1}`));
              box.appendChild(lab);
            });
            body.appendChild(box);
          }
        }
      } else if (step.op === 'bin') {
        body.appendChild(el('span', 'shape-word', 'Bucket'));
        body.appendChild(colSelect(headers, step.col, (v) => { step.col = v; change(); }, 'Column to bucket'));
        body.appendChild(el('span', 'shape-word', 'into'));
        body.appendChild(numberBox(step.bins || 10, (v) => { step.bins = v; change(); }, 'Number of buckets'));
        body.appendChild(el('span', 'shape-word', 'ranges'));
      } else if (step.op === 'sort') {
        body.appendChild(el('span', 'shape-word', 'Sort by'));
        body.appendChild(colSelect(headers, step.col, (v) => { step.col = v; change(); }, 'Column to sort by'));
        body.appendChild(pickSelect(
          [{ id: 'desc', label: 'largest first' }, { id: 'asc', label: 'smallest first' }],
          step.dir, (v) => { step.dir = v; change(); }, 'Direction'));
      } else if (step.op === 'limit') {
        body.appendChild(el('span', 'shape-word', 'Keep the first'));
        body.appendChild(numberBox(step.n || 10, (v) => { step.n = v; change(); }, 'How many rows'));
        body.appendChild(el('span', 'shape-word', 'rows'));
      } else if (step.op === 'transpose') {
        // Nothing to choose: the whole table turns. The sentence is the
        // control, so a reader can see what the step will do to it.
        body.appendChild(el('span', 'shape-word', describeStep(step, headers)));
      }

      row.appendChild(body);

      const tools = el('div', 'shape-tools');
      const up = el('button', 'shape-move', '↑');
      up.type = 'button';
      up.title = 'Move this step earlier';
      up.disabled = at === 0;
      up.addEventListener('click', () => {
        [steps[at - 1], steps[at]] = [steps[at], steps[at - 1]];
        paint();
      });
      const down = el('button', 'shape-move', '↓');
      down.type = 'button';
      down.title = 'Move this step later';
      down.disabled = at === steps.length - 1;
      down.addEventListener('click', () => {
        [steps[at + 1], steps[at]] = [steps[at], steps[at + 1]];
        paint();
      });
      const del = el('button', 'shape-move shape-del', '✕');
      del.type = 'button';
      del.title = 'Remove this step';
      del.addEventListener('click', () => { steps.splice(at, 1); paint(); });
      tools.append(up, down, del);
      row.appendChild(tools);

      return row;
    }

    /* ── painting ─────────────────────────────────────────────────────── */

    let lastRun = null;
    const stagesFor = (at) => (lastRun && lastRun.stages[at]) || source();

    function paint() {
      const src = source();
      lastRun = runSteps(src, steps);

      stepList.innerHTML = '';
      steps.forEach((step, i) => {
        // The headings this step actually sees: the table the previous one made.
        const headers = (lastRun.stages[i] || src).headers;
        stepList.appendChild(stepControls(step, i, headers));
      });

      if (!steps.length) {
        stepList.appendChild(el('p', 'shape-empty',
          'No steps yet. The table goes to the chart exactly as it is.'));
      }

      const out = lastRun.table;
      result.innerHTML = '';

      const summary = el('p', 'shape-summary');
      summary.textContent =
        `${src.rows.length} row${src.rows.length === 1 ? '' : 's'} × ${src.headers.length} columns`
        + `  →  ${out.rows.length} row${out.rows.length === 1 ? '' : 's'} × ${out.headers.length} columns`;
      result.appendChild(summary);

      lastRun.errors.forEach((e) => {
        const p = el('p', 'shape-error', e);
        result.appendChild(p);
      });

      if (steps.length) {
        // The first handful is enough to see whether the shape is right, and
        // rendering five hundred rows into a preview nobody scrolls is waste.
        const preview = el('div', 'shape-preview');
        const table = el('table');
        const thead = el('thead');
        const hr = el('tr');
        out.headers.forEach((h) => hr.appendChild(el('th', null, h)));
        thead.appendChild(hr);
        const tbody = el('tbody');
        out.rows.slice(0, 8).forEach((r) => {
          const tr = el('tr');
          r.forEach((c) => tr.appendChild(el('td', null, c)));
          tbody.appendChild(tr);
        });
        table.append(thead, tbody);
        preview.appendChild(table);
        result.appendChild(preview);
        if (out.rows.length > 8) {
          result.appendChild(el('p', 'shape-more', `…and ${out.rows.length - 8} more rows`));
        }
      }

      useBtn.disabled = !steps.length || !out.rows.length;
      clearBtn.disabled = !steps.length;
    }

    addSel.addEventListener('change', () => {
      const op = addSel.value;
      addSel.value = '';
      if (!op) return;
      // Built against the table as it stands after the steps already there, so
      // a new step's defaults point at columns that will exist when it runs.
      const base = lastRun ? lastRun.table : source();
      steps.push(defaultStep(op, base));
      paint();
    });

    clearBtn.addEventListener('click', () => { steps = []; paint(); });

    useBtn.addEventListener('click', () => {
      const out = lastRun ? lastRun.table : null;
      if (!out || !out.rows.length) return;
      // Undoable, because `setData` banks a history entry — reshaping five
      // hundred rows into seven is exactly the edit somebody wants back.
      grid.setData({ headers: out.headers, rows: out.rows });
      const done = steps.length;
      steps = [];
      paint();
      toast(`Reshaped to ${out.rows.length} rows in ${done} step${done === 1 ? '' : 's'}`, 'ok');
      select('grid');
    });

    return { node: wrap, refresh: paint };
  }

  function buildLinkTab() {
    const wrap = el('div', 'pick');

    wrap.appendChild(el('p', 'dlg-note',
      'Read a published CSV or spreadsheet from a web address. This is the one '
      + 'place the studio fetches your data — it happens when you press Fetch, '
      + 'and the numbers are copied into the table below, not linked to.'));

    const row = el('div', 'link-row');
    const field = el('input', 'link-input');
    field.type = 'url';
    field.placeholder = 'https://example.com/data.csv';
    field.setAttribute('aria-label', 'Address of a CSV or spreadsheet');
    field.spellcheck = false;
    const go = el('button', 'btn btn-primary', 'Fetch');
    go.type = 'button';
    row.append(field, go);
    wrap.appendChild(row);

    const status = el('p', 'dlg-note file-status');
    wrap.appendChild(status);

    const note = el('p', 'dlg-note');
    note.innerHTML =
      'The address must allow other sites to read it, which most published '
      + 'CSV links do and most ordinary web pages do not. For a Google Sheet use '
      + '<b>File → Share → Publish to web</b> and choose CSV. Cookies are never '
      + 'sent, so a private page will not open here even if you are signed in.';
    wrap.appendChild(note);

    const fetchIt = async () => {
      const url = field.value.trim();
      if (!url) { field.focus(); return; }
      go.disabled = true;
      status.className = 'dlg-note file-status';
      status.textContent = 'Fetching…';

      const res = await readDataUrl(url);
      go.disabled = false;

      if (!res.ok) {
        status.textContent = '';
        await ask({ title: 'That link could not be read', text: res.message, tone: 'stop', confirm: 'OK' });
        return;
      }

      const table = parseTable(res.text, expectedCols);
      if (!table.rows.length) {
        status.textContent = '';
        await ask({
          title: 'Nothing to read at that link',
          text: 'It answered, but no rows came out of it.',
          tone: 'stop', confirm: 'OK',
        });
        return;
      }

      // Into the grid, where it can be checked and corrected before it reaches
      // the chart — the same place a paste and a file both land.
      grid.setData({ headers: table.headers, rows: table.rows });
      status.className = 'dlg-note file-status ok';
      status.textContent = `Read ${table.rows.length} row${table.rows.length === 1 ? '' : 's'} `
        + `and ${table.headers.length} column${table.headers.length === 1 ? '' : 's'}. `
        + 'Check it in the Table tab.';
      toast('Fetched ' + table.rows.length + ' rows', 'ok');
      select('grid');
    };

    go.addEventListener('click', fetchIt);
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); fetchIt(); }
    });

    return wrap;
  }

  function buildFileTab() {
    const wrap = el('div', 'pick');

    wrap.appendChild(el('p', 'dlg-note',
      'Open a spreadsheet or a text table. Nothing is uploaded — the file is '
      + 'read in this browser and never sent anywhere.'));

    const zone = el('div', 'drop');
    zone.setAttribute('role', 'button');
    zone.tabIndex = 0;
    const zoneMain = el('p', 'drop-main', 'Drop a file here, or click to choose one');
    const zoneSub = el('p', 'drop-sub', '.xlsx · .csv · .tsv · .txt — up to 10MB');
    zone.append(zoneMain, zoneSub);

    const input = el('input');
    input.type = 'file';
    input.accept = ACCEPTED;
    input.style.display = 'none';

    const status = el('p', 'dlg-note file-status');

    const take = async (file) => {
      if (!file) return;
      zone.classList.remove('over');
      status.className = 'dlg-note file-status';
      status.textContent = 'Reading ' + file.name + '…';

      const res = await readDataFile(file);
      if (!res.ok) {
        status.textContent = '';
        await ask({ title: 'That file could not be read', text: res.message, tone: 'stop', confirm: 'OK' });
        return;
      }

      const table = parseTable(res.text, expectedCols);
      if (!table.rows.length) {
        status.textContent = '';
        await ask({
          title: 'Nothing to read in that file',
          text: 'It opened, but no rows came out of it.',
          tone: 'stop', confirm: 'OK',
        });
        return;
      }

      // Straight into the grid, where it can be checked and corrected before
      // it reaches the chart — the same place a paste lands.
      grid.setData({ headers: table.headers, rows: table.rows });
      status.className = 'dlg-note file-status ok';
      status.textContent = `Read ${table.rows.length} row${table.rows.length === 1 ? '' : 's'} `
        + `and ${table.headers.length} column${table.headers.length === 1 ? '' : 's'} from `
        + `${file.name} (${res.kind}). Check it in the Table tab.`;
      toast('Opened ' + file.name, 'ok');
      select('grid');
    };

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', () => {
      take(input.files && input.files[0]);
      // Clear it, or choosing the same file twice in a row does nothing.
      input.value = '';
    });

    ['dragenter', 'dragover'].forEach((evt) => zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.add('over');
    }));
    ['dragleave', 'dragend'].forEach((evt) => zone.addEventListener(evt, () => zone.classList.remove('over')));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      take(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
    });

    wrap.append(zone, input, status);

    const note = el('p', 'dlg-note');
    note.innerHTML =
      'The first sheet of a workbook is read, using each cell\'s stored value — '
      + 'formulas are never run. Old <code>.xls</code> files are not supported; '
      + 'save them as <code>.xlsx</code> or <code>.csv</code> first.';
    wrap.appendChild(note);

    return wrap;
  }

  /**
   * The place picker.
   *
   * Cities mode is two steps: choose a country, then tick as many of its
   * cities as you want. The list appears as soon as a country is chosen —
   * which is the point, since nobody knows the spelling of every city in a
   * country they are charting.
   *
   * Countries mode is one step: the same list, of countries.
   */
  function buildPicker() {
    const wrap = el('div', 'pick');
    const isCities = picker === 'cities';

    wrap.appendChild(el('p', 'dlg-note', isCities
      ? 'Choose a country and its cities are listed below. Tick as many as you '
        + 'want, add them in one go, then type the values in the table.'
      : 'Tick as many countries as you want. The spellings the map expects are '
        + 'filled in for you.'));

    /* ── country ──────────────────────────────────────────────────────── */

    let countryBox = null;
    let countries = [];
    let cities = [];
    let chosenIso = '';

    const setPlaceholder = (box, text) => {
      const input = box.el.querySelector('.cbx-input');
      if (input) input.placeholder = text;
    };

    if (isCities) {
      const row = el('div', 'pick-row');
      const field = el('div', 'pick-field pick-country');
      field.appendChild(el('label', 'dlg-label', 'Country'));
      countryBox = createCombobox({
        items: [],
        placeholder: 'Loading countries…',
        emptyText: 'No country by that name',
        renderIcon: (iso2) => flagIcon(iso2),
        onSelect: (name, item) => chooseCountry(item),
      });
      field.appendChild(countryBox.el);
      row.appendChild(field);
      wrap.appendChild(row);
    }

    /* ── the list ─────────────────────────────────────────────────────── */

    const listLabel = el('label', 'dlg-label pick-list-label',
      isCities ? 'Cities' : 'Countries');
    wrap.appendChild(listLabel);

    const list = createCheckList({
      placeholder: isCities ? 'Search cities…' : 'Search countries…',
      emptyText: isCities ? 'Choose a country first.' : 'Loading…',
      // Only the country list sets an `icon`; the city rows leave it empty,
      // since one country's flag repeated down every row says nothing.
      renderIcon: (iso2) => flagIcon(iso2),
      onChange: () => { addBtn.disabled = !list.count(); refreshAddLabel(); },
    });
    wrap.appendChild(list.el);

    /* ── add ──────────────────────────────────────────────────────────── */

    const actions = el('div', 'pick-actions');
    const addBtn = el('button', 'btn btn-primary', 'Add selected');
    addBtn.type = 'button';
    addBtn.disabled = true;
    actions.appendChild(addBtn);

    const pickStatus = el('span', 'dlg-note pick-status');
    actions.appendChild(pickStatus);
    wrap.appendChild(actions);

    const refreshAddLabel = () => {
      const n = list.count();
      addBtn.textContent = n ? `Add ${n} selected` : 'Add selected';
    };

    /* What is already in the table, so adding forty cities still feels like
     * forty additions rather than forty keystrokes into a void. */
    const listBox = el('div', 'pick-list');
    wrap.appendChild(listBox);

    // Places carry three columns before the value; regions carry one.
    const valueColumn = (headers) => Math.min(isCities ? 3 : 1, headers.length - 1);

    refreshPickList = function renderPickList() {
      const data = grid.getData();
      listBox.innerHTML = '';
      if (!data.rows.length) {
        listBox.appendChild(el('p', 'dlg-note', isCities
          ? 'No cities yet. Tick some above and they will appear here.'
          : 'No countries yet. Tick some above and they will appear here.'));
        return;
      }
      listBox.appendChild(el('p', 'dlg-label', `In the table — ${data.rows.length}`));
      const chips = el('div', 'pick-chips');
      const vc = valueColumn(data.headers);
      data.rows.forEach((r, i) => {
        const chip = el('div', 'pick-chip');
        chip.appendChild(el('span', 'pick-chip-name', String(r[0] || '—')));
        const v = String(r[vc] ?? '').trim();
        // `blank`, not `empty`: `.empty` is the gallery's no-results state and
        // carries 4rem of padding, which turned every valueless chip into an
        // ellipse. A component modifier must not be a bare site-wide word.
        chip.appendChild(el('span', 'pick-chip-val' + (v ? '' : ' blank'), v || 'no value'));
        const x = el('button', 'pick-chip-x', '✕');
        x.type = 'button';
        x.title = `Remove ${r[0]}`;
        x.addEventListener('click', () => {
          const d = grid.getData();
          grid.setData({ headers: d.headers, rows: d.rows.filter((_, k) => k !== i) });
          renderPickList();
          pickStatus.textContent = `Removed ${r[0]}.`;
          pickStatus.className = 'dlg-note pick-status';
        });
        chip.appendChild(x);
        chips.appendChild(chip);
      });
      listBox.appendChild(chips);
    };
    refreshPickList();

    /* ── loading ──────────────────────────────────────────────────────── */

    loadCountries().then((all) => {
      countries = all;
      const items = countryItems(all, { onlyWithCities: isCities });

      if (isCities) {
        countryBox.setItems(items);
        setPlaceholder(countryBox, `Search ${items.length} countries…`);
        // Start on whatever the chart is already focused on. This is the
        // "if the chosen country is in the chart, list its cities" case: the
        // reader should not have to tell us twice.
        const opts = spec.opts || {};
        const already = (opts.countries && opts.countries[0]) || opts.country || spec.country;
        const hit = already ? findCountryEntry(all, already) : null;
        if (hit) {
          countryBox.setValue(hit.name);
          chooseCountry({ value: hit.name, iso2: hit.iso2 });
        }
      } else {
        // The note is dropped — a city count is the combobox's business, not
        // this list's — but the flag and the local name are kept.
        list.setItems(items.map((c) => ({
          value: c.value, label: c.label, icon: c.icon, sub: c.sub, search: c.search,
        })));
        // Countries already in the table start ticked, so the list reads as
        // the state of the chart rather than a blank form.
        const have = new Set(grid.getData().rows.map((r) => String(r[0]).trim()));
        list.setSelected(items.filter((c) => have.has(c.value)).map((c) => c.value));
        refreshAddLabel();
        addBtn.disabled = !list.count();
      }
    }).catch(() => {
      pickStatus.textContent = 'The place list could not be loaded. The Table and Paste tabs still work.';
      pickStatus.className = 'dlg-note pick-status bad';
    });

    function chooseCountry(item) {
      chosenIso = item.iso2 || (countries.find((c) => c.name === item.value) || {}).iso2 || '';
      list.setItems([]);
      listLabel.textContent = `Cities in ${item.value}`;
      loadCities(chosenIso).then((all) => {
        cities = all;
        list.setItems(all.map((c) => {
          const local = localCityName(chosenIso, c.name);
          return {
            value: c.name,
            label: c.name,
            sub: local,
            search: local ? `${c.name} ${local}` : c.name,
          };
        }));
        // Cities already in the table start ticked, for the same reason.
        const have = new Set(grid.getData().rows.map((r) => String(r[0]).trim()));
        list.setSelected(all.filter((c) => have.has(c.name)).map((c) => c.name));
        refreshAddLabel();
        addBtn.disabled = !list.count();
        list.focus();
      });
    }

    /* ── adding ───────────────────────────────────────────────────────── */

    addBtn.addEventListener('click', async () => {
      const picked = list.getSelected();
      if (!picked.length) return;

      const data = grid.getData();
      let headers = data.headers;
      // Only impose the place columns when the table is narrower than a place
      // needs; a pasted table may already have its own shape.
      if (isCities && headers.length < 4) headers = ['city', 'lon', 'lat', 'value'];
      if (!isCities && headers.length < 2) headers = ['country', 'value'];

      const have = new Map(data.rows.map((r, i) => [String(r[0]).trim(), i]));
      const rows = data.rows.map((r) => [...r]);
      let added = 0;
      let kept = 0;

      picked.forEach((name) => {
        if (have.has(name)) { kept++; return; }      // already there, value intact
        const row = isCities
          ? (() => {
            const city = cities.find((c) => c.name === name);
            return city ? [city.name, String(city.lon), String(city.lat), ''] : null;
          })()
          : [name, ''];
        if (!row) return;
        while (row.length < headers.length) row.push('');
        rows.push(row.slice(0, headers.length));
        added++;
      });

      // Unticking is a removal: the list is the state of the table, not a
      // one-way inbox, or there would be no way to take a city back out.
      const pickedSet = new Set(picked);
      const universe = new Set((isCities ? cities.map((c) => c.name) : countries.map((c) => c.name)));
      const trimmed = rows.filter((r) => {
        const name = String(r[0]).trim();
        return !universe.has(name) || pickedSet.has(name);
      });
      const removed = rows.length - trimmed.length;

      grid.setData({ headers, rows: trimmed });
      refreshPickList();

      const parts = [];
      if (added) parts.push(`added ${added}`);
      if (kept) parts.push(`${kept} already there`);
      if (removed) parts.push(`removed ${removed}`);
      pickStatus.textContent = parts.length
        ? parts.join(', ') + '. Type the values in the Table tab.'
        : 'Nothing changed.';
      pickStatus.className = 'dlg-note pick-status ok';
      if (added) toast(`${added} added`, 'ok');
    });

    return wrap;
  }

  /* ── behaviour ──────────────────────────────────────────────────────── */

  const dismiss = () => {
    document.removeEventListener('keydown', onKey);
    scrim.remove();
  };

  function onKey(e) {
    if (e.key === 'Escape') dismiss();
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') doApply();
  }

  async function doApply() {
    if (activeTab === 'paste') commitPaste();
    // Apply can be pressed from any tab, so make sure the chosen split column
    // still exists in the table being applied.
    refreshFacet();

    const check = grid.validate();
    if (!check.ok) {
      const proceed = await ask({
        title: 'This table has problems',
        text: check.message,
        tone: 'stop',
        confirm: 'Use it anyway',
        cancel: 'Let me fix it',
      });
      if (!proceed) { select('grid'); return; }
    }

    const data = grid.getData();
    const col = facetBy ? (data.headers || []).indexOf(facetBy) : -1;
    // A split reads the whole table and a plain apply reads the whole table;
    // the difference is only what happens to one column, so they are one
    // decision here rather than two code paths the reader has to choose
    // between.
    const res = col >= 0
      ? facetByColumn(def, spec, data, col)
      : applyData(def, spec, data);
    if (!res.ok) {
      status.textContent = res.message;
      status.className = 'dlg-status bad';
      return;
    }
    // Turning the split off is an explicit act, not a side effect of applying
    // data — but a facet by a column that is no longer chosen has to go, or
    // the chart would keep drawing panels from a table nobody asked it to.
    if (col < 0 && isFaceted(spec) && spec.facet.kind === 'value') delete spec.facet;

    // Colours go on after the data, because `applyData` rebuilds the arrays
    // they live in. Resolved again rather than reused: the spec it wrote is
    // not the spec this dialog opened on.
    if (colourLayout && chosenColours.size) {
      const after = paletteOf(def, spec);
      chosenColours.forEach((i) => after.set(i, pendingColours[i]));
    }
    toast(res.message, 'ok');
    onApply(res.message);
    dismiss();
  }

  resetBtn.addEventListener('click', async () => {
    const yes = await ask({
      title: 'Replace the table with the example?',
      text: 'Everything currently in the table will be discarded.',
      tone: 'warn',
      confirm: 'Replace it',
      cancel: 'Keep my data',
    });
    if (!yes) return;
    const ex = parseTable(desc.example || '', true);
    grid.setData({ headers: ex.headers, rows: ex.rows });
    select('grid');
  });

  apply.addEventListener('click', doApply);
  cancel.addEventListener('click', dismiss);
  close.addEventListener('click', dismiss);
  scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) dismiss(); });
  document.addEventListener('keydown', onKey);

  pasteArea.value = startText;
  refreshFacet();
  select('grid');
}
