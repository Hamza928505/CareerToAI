/**
 * GalleryApp.js — the chart index.
 *
 * Every tile shows the real chart, not a screenshot, rendered from the same
 * definition the studio uses. They are built lazily through an
 * IntersectionObserver and torn down when they scroll well out of view, so the
 * page stays responsive with fifty live charts in the document.
 */

import { CHARTS, CATEGORIES, CATEGORY_ORDER, CHART_COUNT, searchCharts, newSpec, engineTally } from './registry.js';
import { renderChart, destroyInstance, generateCode } from './engines.js';
import { prefetchLibraries } from './loader.js';
import { ALL_LIBRARIES, ALL_ASSETS } from './cdn.js';
import { mountThemeToggle, onThemeChange } from './theme.js';
import { escapeHtml } from './StudioApp.js';
import { parseTable, applyData, toCSV, transposeTable } from './dataio.js';
import { isDateLabels, dateOrderIsGuess } from './timeaxis.js';
import { chooseDataFile, readDataFile, readDataUrl } from './fileimport.js';
import {
  rankCharts, expectedColumnsFor, handOff, clearHandOff, takeHandOff, takeMatchRequest,
} from './DataMatch.js';
import { profileTable } from './profile.js';
import { mountDataAnalysis } from './data-analysis.js';
import { recommendCharts } from './recommend.js';
import { buildPrompt, readPromptMode } from './prompt.js';
import { toast } from './toast.js';
import { ask } from './confirm.js';
import { openAiConfigDialog } from './ai-config.js';
import { mountMatchChat } from './match-chat.js';
import { listSaved, removeSaved, renameSaved, exportShelf, importShelf, whenSaved } from './shelf.js';

/**
 * How long one frame may spend building charts before yielding.
 *
 * Half of a 60fps frame. The rest is left for the browser to lay out, paint
 * and — the point of the exercise — answer the scroll that asked for them.
 */
const FRAME_BUDGET_MS = 8;

const PREVIEW_HEIGHT = 132;

/**
 * A column name on one line.
 *
 * A spreadsheet wraps a heading rather than widening the column, and that
 * line break is really in the cell — `Corr H\n(H_real)`. It belongs in the
 * table, which is the reader's own name for the column; it does not belong
 * in a chip that is styled to be one line tall.
 */
const oneLine = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

export class GalleryApp {
  constructor() {
    this.grid = document.querySelector('#grid');
    this.countEl = document.querySelector('#result-count');
    this.searchEl = document.querySelector('#search');
    this.filtersEl = document.querySelector('#filters');
    this.category = 'All';
    this.query = '';
    this.live = new Map();
    /** The table a reader brought, once they bring one. */
    this.table = null;
    /**
     * chart id → the columns of `table` that chart can read, for the charts
     * that cannot read all of them. Absent means it reads the table whole.
     */
    this.projected = new Map();
    this.fit = null;
    // Whether the grid is narrowed to `fit`. Distinct from having a table at
    // all: "show me every chart" and "forget my table" are two intentions, and
    // one button used to do both.
    this.onlyFit = true;

    this._buildFilters();
    this._buildStats();
    this._buildMatcher();
    this._buildShelf();
    /** id → host, waiting to be built. */
    this._pending = new Map();
    this._pumping = false;

    this._observer = new IntersectionObserver((entries) => this._onIntersect(entries), {
      // Generous vertical margin so the first tiles mount on load even with the
      // upload panel open above the grid, and the next screenful is ready
      // before it is scrolled to.
      root: null,
      rootMargin: '600px 0px',
      threshold: 0,
    });

    mountThemeToggle(document.querySelector('#theme-mount'));
    onThemeChange(() => this._refreshLive());

    this.searchEl.addEventListener('input', () => {
      this.query = this.searchEl.value;
      this.render();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        this.searchEl.focus();
      }
    });

    this.render();

    // The tiles above the fold are already being built; everything else can be
    // fetched while the thread is free, so the first scroll onto a Chart.js
    // plugin or a map does not pay for it.
    prefetchLibraries();
  }

  _buildStats() {
    const host = document.querySelector('#hero-stats');
    if (!host) return;
    const tally = engineTally();
    const stats = [
      { n: CHART_COUNT, l: 'chart types' },
      { n: CATEGORIES.length, l: 'categories' },
      { n: (tally.canvas || 0) + (tally.native || 0) + (tally.dom || 0), l: 'library-free' },
      { n: '5', l: 'ways to export' },
    ];
    host.innerHTML = stats.map((s) =>
      `<div class="hero-stat"><div class="n tnum">${s.n}</div><div class="l">${s.l}</div></div>`).join('');
  }

  /**
   * "I have this table — what can I draw?"
   *
   * Every chart already declares the columns it reads, and `checkTableShape`
   * already answers this for one chart. The panel asks it for all 98 and
   * narrows the gallery to the ones that say yes, which is the question a
   * reader holding a spreadsheet actually has.
   */
  _buildMatcher() {
    const bar = document.querySelector('#matchbar');
    if (!bar) return;

    const text = bar.querySelector('#match-text');
    const status = bar.querySelector('#match-status');
    const read = bar.querySelector('#match-read');
    const headerBox = bar.querySelector('#match-header');
    const swapBox = bar.querySelector('#match-swap');
    const drop = bar.querySelector('#match-drop');
    const urlInput = bar.querySelector('#match-url');
    const urlGo = bar.querySelector('#match-url-go');
    bar.querySelector('#match-ai-settings')?.addEventListener('click', () => openAiConfigDialog());
    this.matchStatus = status;
    const chat = mountMatchChat(bar, () => this.table);

    // `region,2023,2024` over `North,520,680` cannot be settled by looking at
    // it — the header row is numeric, because the columns are years. So the
    // detection sets the box and the reader gets the final word.
    let headerAnswered = false;

    const setStatus = (msg, tone) => {
      status.textContent = msg;
      status.className = 'match-status' + (tone ? ' ' + tone : '');
    };

    // The panel is always open now, so "reveal" only brings it into view and
    // puts the cursor where the reader can start typing.
    const reveal = () => {
      bar.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      text.focus();
    };

    /** A block of CSV from a file or a URL, dropped into the textarea. */
    const ingest = (res, label) => {
      if (!res) { setStatus('Nothing to read there.'); return; }
      if (!res.ok) { setStatus(res.message, 'bad'); return; }
      text.value = res.text;
      headerAnswered = false;
      // A new file is a new table, laid out its own way; a swap asked for on
      // the last one is not an answer about this one.
      swapBox.checked = false;
      if (label) setStatus(`Read ${label}.`);
      run();
    };

    /**
     * The table the other way round, when the reader asked for it.
     *
     * Every chart reads a series from a column, and the file most people have
     * was written with the series down the side — one row per product, the
     * months across. Read as it is, that is a bar per product; what they
     * wanted was a bar per month. Turning it here, before anything ranks it,
     * means the tiles, the hand-off and the prompt all carry the turned table
     * and never have to know there was another way up. The text box keeps the
     * file as it was, so the header question is still asked about the file.
     */
    const oriented = (table) => {
      if (!swapBox.checked || !table.rows.length) return table;
      const turned = transposeTable(table.hadHeader ? table : { headers: [], rows: table.rows });
      return { ...turned, hadHeader: true, skipped: table.skipped, swapped: true };
    };

    let timer = null;
    const run = () => {
      chat.reset();
      this._disposeAnalysis?.();
      this._disposeAnalysis = null;
      const raw = text.value.trim();
      if (!raw) {
        this.table = null;
        this.projected = new Map();
        this.fit = null;
        bar.querySelector('#match-read-summary').textContent = 'No table yet';
        read.innerHTML = '<p class="dlg-note">Paste something on the left and the gallery '
          + 'below narrows to the charts that can draw it.</p>';
        setStatus('Commas, tabs and semicolons all work.');
        this.render();
        return;
      }

      const parsed = parseTable(raw, headerAnswered ? headerBox.checked : undefined);
      if (!headerAnswered) headerBox.checked = parsed.hadHeader;
      const table = oriented(parsed);
      if (!table.rows.length) {
        this.table = null;
        setStatus('Nothing readable in that yet.', 'bad');
        return;
      }

      const ranked = rankCharts(table);
      this.table = table;
      bar.querySelector('#match-read-summary').textContent = `${table.rows.length} rows · ${table.headers.length} columns`;
      // A chart that cannot read all forty-five of somebody's columns can very
      // often read four of them, and which four is worth keeping: it is what
      // the tile says, what the studio opens on, and what the prompt quotes.
      this.projected = new Map(ranked.partial.map((e) => [e.def.id, e.table]));
      this.fit = new Set([...ranked.fits, ...ranked.partial].map((f) => f.def.id));
      // A new table is a new question, so it is asked narrowed again.
      this.onlyFit = true;
      const profile = profileTable(table);
      this._renderReading(read, table, ranked, profile);
      this._disposeAnalysis = mountDataAnalysis(bar.querySelector('#match-analysis'), table, profile);
      const total = this.fit.size;
      setStatus(`${total} of ${CHART_COUNT} charts can read this.`, total ? 'ok' : 'bad');
      this.render();
    };

    text.addEventListener('input', () => {
      clearTimeout(timer);
      // A new table is a new question, so the detection gets to answer again.
      headerAnswered = false;
      timer = setTimeout(run, 220);
    });

    headerBox.addEventListener('change', () => { headerAnswered = true; run(); });
    swapBox.addEventListener('change', run);

    bar.querySelector('#match-file').addEventListener('click', async () => {
      setStatus('Reading…');
      const res = await chooseDataFile();
      if (!res) { setStatus('No file chosen.'); return; }
      ingest(res, res.name);
    });

    // The drop zone: click or keyboard opens the file picker, a drag drops one.
    const pickFile = async () => {
      setStatus('Reading…');
      ingest(await chooseDataFile());
    };
    drop.addEventListener('click', pickFile);
    drop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickFile(); }
    });
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('is-over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', async (e) => {
      e.preventDefault();
      drop.classList.remove('is-over');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) { setStatus('That was not a file.', 'bad'); return; }
      setStatus(`Reading ${file.name}…`);
      ingest(await readDataFile(file), file.name);
    });

    // Fetch a published CSV or spreadsheet by URL. One request, no credentials —
    // readDataUrl enforces the rest.
    const fetchUrl = async () => {
      const href = urlInput.value.trim();
      if (!href) { setStatus('Paste a link first.', 'bad'); return; }
      setStatus('Fetching…');
      ingest(await readDataUrl(href), 'the linked file');
    };
    urlGo.addEventListener('click', fetchUrl);
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); fetchUrl(); }
    });

    bar.querySelector('#match-clear').addEventListener('click', () => {
      text.value = '';
      headerAnswered = false;
      swapBox.checked = false;
      // The table outlives this tab now, so clearing it here has to end it
      // everywhere rather than leaving it to reappear on the next chart opened.
      clearHandOff();
      run();
      text.focus();
    });

    // Arriving from the studio's "See which charts read this". The table came
    // through the same door a click on a tile uses; this only says to open the
    // panel on it, and is taken once so a later visit is not hijacked by it.
    if (takeMatchRequest()) {
      const brought = takeHandOff();
      if (brought && brought.rows.length) {
        text.value = toCSV(brought.headers, brought.rows);
        headerAnswered = true;
        headerBox.checked = true;
        reveal();
        run();
      }
    }
  }

  /**
   * My charts: what this reader kept, on this browser.
   *
   * A strip above the grid, one card per saved chart, opening the studio on
   * the saved spec. Always present, one line tall when empty, because a
   * feature nobody can see is a feature nobody uses — and the Import button
   * has to be reachable before anything has been saved here, or a shelf
   * carried from another browser has nowhere to land.
   *
   * Rename edits in place; Remove asks first, because the chart is not
   * anywhere else. Export writes the whole shelf as one JSON file, Import
   * reads one back and says what it did, chart by chart.
   */
  _buildShelf() {
    const host = document.querySelector('#shelf');
    if (!host) return;
    this.shelfEl = host;
    this._renderShelf();
  }

  _renderShelf() {
    const host = this.shelfEl;
    // An entry naming a chart this library does not have cannot open here;
    // it stays in storage — and in an export — but gets no card.
    const saved = listSaved().filter((s) => CHARTS.some((c) => c.id === s.chart));
    const esc = escapeHtml;
    host.classList.toggle('is-empty', !saved.length);

    host.innerHTML =
      `<div class="shelf-head">`
      + `<h2 class="shelf-title">My charts <span class="shelf-count">${saved.length}</span></h2>`
      + (saved.length
        ? '<p class="shelf-sub">Kept on this browser. Export them to carry them to another.</p>'
        : '<p class="shelf-sub">Nothing kept yet — press <b>Save</b> in the studio, or import a charts file.</p>')
      + `<div class="shelf-tools">`
      + (saved.length ? `<button class="btn btn-sm" id="shelf-export" type="button">Export all</button>` : '')
      + `<button class="btn btn-sm btn-ghost" id="shelf-import" type="button">Import…</button>`
      + `<input id="shelf-file" type="file" accept="application/json,.json" hidden>`
      + `</div></div>`
      + (saved.length ? `<div class="shelf-grid">${saved.map((s) => this._shelfCard(s)).join('')}</div>` : '');

    host.querySelector('#shelf-export')?.addEventListener('click', () => {
      const blob = new Blob([exportShelf()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `opencharts-my-charts-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast(`Exported ${saved.length} chart${saved.length === 1 ? '' : 's'}`, 'ok');
    });

    const file = host.querySelector('#shelf-file');
    host.querySelector('#shelf-import')?.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      file.value = '';
      if (!f) return;
      const res = importShelf(await f.text(), { isChart: (id) => CHARTS.some((c) => c.id === id) });
      toast(res.message, res.ok ? 'ok' : 'bad', 4200);
      this._renderShelf();
    });

    host.querySelectorAll('.shelf-remove').forEach((b) => b.addEventListener('click', async (e) => {
      e.preventDefault();
      const id = b.dataset.id;
      const entry = saved.find((s) => s.id === id);
      const yes = await ask({
        title: `Remove "${entry ? (entry.name || 'this chart') : 'this chart'}" from My charts?`,
        text: 'It is kept on this browser only, so there is no other copy.',
        tone: 'warn',
        confirm: 'Remove it',
        cancel: 'Keep it',
      });
      if (!yes) return;
      removeSaved(id);
      this._renderShelf();
    }));

    // Rename in place: the name becomes a box, Enter or leaving it commits.
    host.querySelectorAll('.shelf-rename').forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault();
      const card = b.closest('.shelf-card');
      const nameEl = card.querySelector('.shelf-name');
      const input = document.createElement('input');
      input.className = 'shelf-name-input';
      input.value = nameEl.textContent;
      input.setAttribute('aria-label', 'Chart name');
      nameEl.replaceWith(input);
      input.focus();
      input.select();
      let done = false;
      const commit = () => {
        if (done) return;
        done = true;
        renameSaved(b.dataset.id, input.value);
        this._renderShelf();
      };
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
        if (ev.key === 'Escape') { done = true; this._renderShelf(); }
      });
      input.addEventListener('blur', commit);
      // The card is a link; typing in it must not follow it.
      input.addEventListener('click', (ev) => ev.preventDefault());
    }));
  }

  _shelfCard(s) {
    const esc = escapeHtml;
    const def = CHARTS.find((c) => c.id === s.chart);
    const href = `studio.html?chart=${encodeURIComponent(s.chart)}&saved=${encodeURIComponent(s.id)}`;
    const thumb = s.thumb
      ? `<img class="shelf-thumb" src="${s.thumb}" alt="">`
      : `<div class="shelf-thumb shelf-thumb-blank" aria-hidden="true">${def ? esc(def.title) : ''}</div>`;
    return `<a class="shelf-card" href="${href}">`
      + thumb
      + `<div class="shelf-meta">`
      + `<span class="shelf-name">${esc(s.name || (def ? def.title : s.chart))}</span>`
      + `<span class="shelf-kind">${def ? esc(def.title) : esc(s.chart)} · ${esc(whenSaved(s.updatedAt))}</span>`
      + `</div>`
      + `<span class="shelf-actions">`
      + `<button class="shelf-rename" type="button" data-id="${esc(s.id)}" title="Rename" aria-label="Rename">✎</button>`
      + `<button class="shelf-remove" type="button" data-id="${esc(s.id)}" title="Remove" aria-label="Remove">✕</button>`
      + `</span>`
      + `</a>`;
  }

  /** What the parser saw, and what it means — shown before any chart list. */
  /**
   * The report: what is in the table, what is wrong with it, and what to draw.
   *
   * `rankCharts` answers what is *possible* and that list is 98 charts long,
   * ordered by category — true, and almost useless to somebody who came here
   * holding a spreadsheet and wanting to know which one to open. This is the
   * opinion, and every part of it names its evidence: a suggestion states the
   * reader's own columns back, a warning counts the offending cells, and each
   * suggestion carries the caution `chart-help.js` already holds about how
   * that chart type misleads.
   *
   * It cannot narrow the grid, and nothing here hides a chart.
   */
  _reportMarkup(table, ranked, profile) {
    let picked;
    try {
      picked = recommendCharts(profile, this.fit || new Set());
    } catch {
      return '';                      // a report is a bonus, never the point
    }

    const esc = escapeHtml;
    const parts = [];

    if (picked.suggestions.length) {
      parts.push('<div class="report-block"><h4>What to draw</h4>'
        + picked.suggestions.map((s) => `<a class="report-pick" href="studio.html?chart=${
          encodeURIComponent(s.id)}"><span class="report-pick-name">${esc(s.def.title)}</span>`
          + `<span class="report-why">${esc(s.why)}</span>`
          + (s.caution ? `<span class="report-caution">Watch out — ${esc(s.caution)}</span>` : '')
          + '</a>').join('')
        + '</div>');
    } else {
      // Silence would read as "no opinion"; this is "no rule fired", which is
      // a different and more useful thing to be told.
      parts.push('<div class="report-block"><h4>What to draw</h4>'
        + '<p class="dlg-note">Nothing in this table suggests one chart over another — '
        + 'no dates to order it, no column naming groups, no pair of measures that move '
        + 'together. Any of the charts below will read it.</p></div>');
    }

    if (profile.quality.length) {
      parts.push('<div class="report-block"><h4>Before you draw it</h4><ul class="report-list">'
        + profile.quality.slice(0, 6).map((q) =>
          `<li class="q-${q.level}">${esc(q.text)}</li>`).join('')
        + (profile.quality.length > 6
          ? `<li class="q-info">…and ${profile.quality.length - 6} more.</li>` : '')
        + '</ul></div>');
    }

    const rel = [
      ...profile.correlations.map((c) =>
        `"${c.a}" and "${c.b}" have a linear association (r = ${c.r}, ${c.n} paired rows; not causation).`),
      ...profile.separators.map((s) =>
        `"${s.by}" separates "${s.measure}" across ${s.groups} groups.`),
    ];
    if (rel.length) {
      parts.push('<div class="report-block"><h4>Worth plotting against each other</h4>'
        + `<ul class="report-list">${rel.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>`);
    }

    parts.push('<details class="report-block"><summary>Every column</summary>'
      + '<table class="report-table"><thead><tr><th>Column</th><th>Holds</th>'
      + '<th>Distinct</th><th>Missing</th><th>Range</th></tr></thead><tbody>'
      + profile.columns.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.type)}</td>`
        + `<td class="tnum">${c.distinct}</td><td class="tnum">${c.missing || ''}</td>`
        + `<td class="tnum">${c.type === 'number' ? `${c.min} – ${c.max}` : ''}</td></tr>`).join('')
      + '</tbody></table></details>');

    return `<div class="report">${parts.join('')}</div>`;
  }

  _renderReading(host, table, ranked, profile) {
    const firstColumn = table.rows.map((r) => r[0]);
    const firstIsDates = isDateLabels(firstColumn);
    const chips = table.headers.map((h, i) => {
      const role = ranked.shape.roles[i] || 'numbers';
      return `<span class="match-col-chip ${role}"><b>${escapeHtml(oneLine(h))}</b>`
        + `<span>${role}</span></span>`;
    }).join('');

    // The grid below stays grouped by category, so name the categories rather
    // than a "top three" in an order the reader is not about to see.
    const all = [...ranked.fits, ...ranked.partial];
    const groups = [...new Set(all.map((f) => f.def.category))];
    const named = groups.slice(0, 4).join(', ')
      + (groups.length > 4 ? ` and ${groups.length - 4} more` : '');

    // A wide export matches nothing whole and most things in part, so the
    // count that leads is the one answering "what can I draw with this?".
    const verdict = `<p class="match-verdict"><b>${all.length}</b> charts can read this`
      + (groups.length ? ` — ${escapeHtml(named)}.` : '.') + '</p>';

    let advice;
    if (!all.length) {
      advice = 'Nothing here reads a table this shape. Check the delimiter, or whether the '
        + 'first row is a header.';
    } else if (!ranked.partial.length) {
      advice = 'Open any of them below and your table is already in it.';
    } else if (!ranked.fits.length) {
      advice = `No chart reads all ${table.headers.length} of your columns — none reads that `
        + 'many. Each tile below names the ones it takes, and opens on those.';
    } else {
      advice = `<b>${ranked.fits.length}</b> read the table whole; the other `
        + `<b>${ranked.partial.length}</b> read some of its columns, named on each tile.`;
    }

    host.innerHTML =
      `<p class="match-shape">${escapeHtml(ranked.shape.summary)}</p>`
      + `<div class="match-cols">${chips}</div>`
      + verdict
      + `<p class="dlg-note" style="margin-top:.4rem">${advice}</p>`
      + this._reportMarkup(table, ranked, profile)
      // A first column of dates is placed on a time axis by the line and area
      // charts — said here, because a gap where a month is missing is the
      // first thing a reader notices and should not be a surprise. And where
      // `03/04/2024` could be read either way and nothing in the column
      // settles it, the guess is named so it can be corrected.
      + (firstIsDates
        ? '<p class="dlg-note" style="margin-top:.4rem">The first column reads as <b>dates</b>, so '
          + 'line and area charts place the rows on a time axis: a missing period shows as a gap, '
          + 'and the ticks thin themselves by month or year.'
          + (dateOrderIsGuess(firstColumn)
            ? ' Day and month are ambiguous here (<b>' + escapeHtml(oneLine(firstColumn.find((v) => /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(String(v).trim())) || ''))
              + '</b>) and are being read <b>month first</b>. Write the year first — 2024-04-03 — to be sure.'
            : '')
          + '</p>'
        : '')
      // The reader asked for this, but the report is what they check it
      // against, so it says which way up the table now is.
      + (table.swapped
        ? '<p class="dlg-note" style="margin-top:.4rem">Rows and columns are swapped: the '
          + `file's first column is now the header row (<b>${escapeHtml(table.headers.slice(1, 5)
            .map(oneLine).join(', '))}${table.headers.length > 5 ? ', …' : ''}</b>), and each `
          + 'row of the file is now a column.</p>'
        : '')
      // Dropping rows in silence would be worse than not dropping them: a
      // reader who cannot find their first row should be told where it went.
      + (table.skipped
        ? `<p class="dlg-note" style="margin-top:.4rem">Skipped <b>${table.skipped}</b> `
          + `row${table.skipped === 1 ? '' : 's'} of title above the table.</p>`
        : '')
      // Years make a header row indistinguishable from data, so when the guess
      // came out "no header" the way to correct it is named rather than left
      // for the reader to find.
      + (table.hadHeader ? '' :
        '<p class="dlg-note" style="margin-top:.4rem">No header row was detected, so the '
        + 'columns above were named for you. Tick <b>First row is a header</b> if it is one.</p>');
  }

  /**
   * The table this chart gets — the whole thing, or the columns it can read.
   *
   * One answer for the three surfaces that hand data to a chart: the tile's
   * caption, the handoff to the studio, and the AI prompt. Left to themselves
   * they would be free to disagree about which columns the reader was shown.
   */
  _tableFor(def) {
    return this.projected.get(def.id) || this.table;
  }

  _buildFilters() {
    const all = ['All', ...CATEGORY_ORDER.filter((c) => CHARTS.some((x) => x.category === c))];
    this.filtersEl.innerHTML = '';
    all.forEach((name) => {
      const b = document.createElement('button');
      b.className = 'filter' + (name === 'All' ? ' active' : '');
      b.type = 'button';
      b.textContent = name;
      b.addEventListener('click', () => {
        this.category = name;
        this.filtersEl.querySelectorAll('.filter').forEach((x) => x.classList.toggle('active', x === b));
        this.render();
      });
      this.filtersEl.appendChild(b);
    });
  }

  render() {
    // Drop every live preview before the DOM under it disappears.
    this.live.forEach((inst) => destroyInstance(inst));
    this.live.clear();
    this._observer.disconnect();
    this.grid.innerHTML = '';

    let matches = searchCharts(this.query, this.category);
    if (this.fit && this.onlyFit) matches = matches.filter((c) => this.fit.has(c.id));
    this.countEl.textContent = `${matches.length} of ${CHART_COUNT}`;

    if (!matches.length) {
      this.grid.innerHTML = (this.fit && this.onlyFit)
        ? '<div class="empty"><div class="display">Nothing in this category</div>'
          + '<p>No chart here reads a table that shape. Try All, or clear the table.</p></div>'
        : '<div class="empty"><div class="display">Nothing here</div>'
          + '<p>No chart matches that search. Try a shape — "stacked", "radial", "flow".</p></div>';
      return;
    }

    if (this.fit) this.grid.appendChild(this._matchNote(matches.length));

    // Group under category rules unless the user is actively searching, where a
    // flat relevance-free list reads better than eight one-item sections.
    const grouped = !this.query.trim();
    if (grouped) {
      CATEGORIES.forEach((group) => {
        const inGroup = matches.filter((c) => c.category === group.name);
        if (!inGroup.length) return;
        this.grid.appendChild(sectionRule(group.name, inGroup.length));
        inGroup.forEach((c) => this.grid.appendChild(this._card(c)));
      });
    } else {
      matches.forEach((c) => this.grid.appendChild(this._card(c)));
    }
  }

  /**
   * Says whether the grid is narrowed, and how to change that — a filter with
   * no way out is a trap.
   *
   * It toggles the *filter* and nothing else. It used to also null `this.table`
   * and empty the paste box, so "show me every chart" silently threw the
   * reader's table away: every tile reverted to its own example and clicking
   * one handed the studio nothing. Forgetting the table is what Clear is for,
   * beside the box the table was typed into.
   *
   * Widened, the charts that can read the table still preview it and still
   * carry it into the studio; the ones that cannot show their own example,
   * which is all they have to show.
   */
  _matchNote(count) {
    const note = document.createElement('div');
    note.className = 'match-note';
    const label = document.createElement('span');
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm';
    btn.type = 'button';

    if (this.onlyFit) {
      label.innerHTML = `Showing the <b>${count}</b> charts that can read your table.`;
      btn.textContent = 'Show all charts';
    } else {
      label.innerHTML = `Showing every chart. <b>${this.fit.size}</b> can read your table; `
        + 'the rest show their own example.';
      btn.textContent = 'Show only the matches';
    }

    btn.addEventListener('click', () => {
      this.onlyFit = !this.onlyFit;
      this.render();
    });
    note.append(label, btn);
    return note;
  }

  _card(def) {
    // The tile is a link, and a link may not contain a button — so the button
    // is the link's sibling inside a shell, not a child of it. That also keeps
    // it clear of the anchor's own mousedown/click handoff handlers below.
    const shell = document.createElement('div');
    shell.className = 'card-shell';

    const card = document.createElement('a');
    card.className = 'card';
    card.href = `studio.html?chart=${encodeURIComponent(def.id)}`;

    // A table is too big for a URL, so it travels in session storage and the
    // studio takes it on arrival. Set on mousedown as well as click so a
    // middle-click or a new tab carries it too.
    if (this.table) {
      const carry = () => handOff(this._tableFor(def));
      card.addEventListener('mousedown', carry);
      card.addEventListener('click', carry);
    }

    const canvas = document.createElement('div');
    canvas.className = 'card-canvas';
    canvas.dataset.id = def.id;
    const skeleton = document.createElement('div');
    skeleton.className = 'card-skeleton';
    canvas.appendChild(skeleton);

    const body = document.createElement('div');
    body.className = 'card-body';
    body.innerHTML =
      `<div class="card-title">${escapeHtml(def.title)}</div>`
      + `<p class="card-blurb">${escapeHtml(def.blurb)}</p>`
      + `<div class="card-foot">`
      + `<span class="pill chip-engine ${def.engineChip}">${escapeHtml(def.engineLabel)}</span>`
      + `<span class="card-open">Open<span aria-hidden="true">→</span></span>`
      + `</div>`;

    // When a table is loaded, say what this chart will make of its columns —
    // the reader's own column names wherever only some of them are read, since
    // naming the example's instead would promise a table they have not got.
    if (this.table) {
      const slice = this.projected.get(def.id);
      const cols = (slice ? slice.headers : expectedColumnsFor(def)).map(oneLine);
      if (cols.length) {
        const fit = document.createElement('div');
        fit.className = 'card-fit' + (slice ? ' part' : '');
        fit.textContent = 'reads ' + cols.join(', ');
        fit.title = cols.join(', ');
        body.appendChild(fit);
      }
    }

    card.append(canvas, body);

    const prompt = document.createElement('button');
    prompt.className = 'card-prompt';
    prompt.type = 'button';
    prompt.title = 'Copy a prompt for this chart — paste it into any AI along with your own spreadsheet';
    prompt.setAttribute('aria-label', `Copy an AI prompt for ${def.title}`);
    prompt.innerHTML = '<span aria-hidden="true">⧉</span> Prompt';
    prompt.addEventListener('click', () => this._copyPrompt(def, prompt));

    shell.append(card, prompt);
    this._observer.observe(canvas);
    return shell;
  }

  /**
   * Copy this chart's AI brief without opening it.
   *
   * Built on the click rather than with the tile: a prompt carries the whole
   * standalone export, and generating ninety-eight of them to fill a grid
   * nobody has clicked yet would cost more than the entire page does.
   */
  async _copyPrompt(def, btn) {
    const label = btn.innerHTML;
    try {
      const spec = newSpec(def);
      // A reader who pasted a table meant that data — the same thing opening
      // the tile does with it. A table this chart cannot read leaves the
      // example in place rather than half-applying it.
      if (this.table) {
        const res = applyData(def, spec, this._tableFor(def));
        if (res.ok && typeof def.onChange === 'function') def.onChange(spec);
      }
      // Whichever kind the reader last asked for in the studio. One choice
      // answers for both surfaces, and the toast says which arrived.
      const mode = readPromptMode();
      const text = buildPrompt(def, spec, generateCode(def, spec), mode);
      await navigator.clipboard.writeText(text);

      btn.innerHTML = '<span aria-hidden="true">✓</span> Copied';
      btn.classList.add('ok');
      setTimeout(() => { btn.innerHTML = label; btn.classList.remove('ok'); }, 1800);
      const what = mode === 'data' ? 'data-only prompt' : 'prompt';
      toast(this.table
        ? `${def.title} ${what} copied — it carries your table`
        : `${def.title} ${what} copied — paste it into any AI with your data`, 'ok');
    } catch {
      // Clipboard access needs a secure context, and there is no text node to
      // fall back on selecting here the way the code panel has.
      toast('Could not copy the prompt — open the chart and use the AI Prompt tab', 'bad');
    }
  }

  _onIntersect(entries) {
    entries.forEach((entry) => {
      const host = entry.target;
      const id = host.dataset.id;
      if (entry.isIntersecting) {
        if (this.live.has(id)) return;
        this._queue(host, id);
      } else {
        // Scrolled away. Drop it from the queue as well as tearing it down:
        // a fast scroll used to leave a backlog of charts nobody would see
        // being built anyway.
        this._pending.delete(id);
        if (this.live.has(id)) {
          destroyInstance(this.live.get(id));
          this.live.delete(id);
          host.innerHTML = '<div class="card-skeleton"></div>';
        }
      }
    });
  }

  /**
   * Ask for a chart, and let the pump decide when.
   *
   * The observer reports a whole screen of tiles in one callback, and mounting
   * them there built eight charts inside a single frame — measured at 207ms of
   * blocked main thread on load, the worst task 71ms. Every one of those is a
   * frame the page cannot answer a scroll or a click in.
   *
   * A Map rather than an array so a tile that is asked for twice is only
   * built once, and so a tile that leaves the screen can be forgotten by id.
   */
  _queue(host, id) {
    this._pending.set(id, host);
    this._pump();
  }

  /** How many charts are still waiting. For the suite, and for debugging. */
  pendingCount() { return this._pending.size; }

  /**
   * Build queued charts a frame at a time, stopping when the frame is spent.
   *
   * A time budget rather than a fixed count: charts are wildly uneven — a
   * sparkline is a few hundred microseconds and a choropleth is tens of
   * milliseconds — so "two per frame" would either stall on the heavy ones or
   * dawdle on the light ones. The budget only gates *starting* another chart,
   * so one slow chart can still overrun; it cannot be interrupted, and
   * pretending otherwise would mean rewriting every renderer.
   */
  _pump() {
    if (this._pumping || !this._pending.size) return;
    this._pumping = true;
    requestAnimationFrame(() => {
      this._pumping = false;
      const started = performance.now();
      for (const [id, host] of this._pending) {
        this._pending.delete(id);
        if (!host.isConnected || this.live.has(id)) continue;
        this._render(host, id);
        if (performance.now() - started > FRAME_BUDGET_MS) break;
      }
      // Anything left waits for the next frame, so the page can answer input
      // in between.
      if (this._pending.size) this._pump();
    });
  }

  /**
   * The spec a tile draws: the reader's own data where they brought some, the
   * chart's example otherwise.
   *
   * A grid that says "these ninety charts can read your table" and then draws
   * ninety charts of somebody else's numbers is answering a question nobody
   * asked. The columns are the ones the tile names, so what is previewed, what
   * opens in the studio and what the prompt quotes are one table.
   *
   * Two things it has to get right:
   *
   *   - **A fresh clone per tile.** `applyData` writes into the spec it is
   *     given and `onChange` normalises it in place, so a shared one would let
   *     one chart's idea of the data reach the next.
   *   - **A chart that cannot take the table keeps its example.** A spec that
   *     was half written before the read failed draws worse than the example
   *     it replaced, and a blank tile in a grid of ninety says nothing about
   *     which chart went wrong.
   */
  _specFor(def) {
    const table = this.table && this._tableFor(def);
    if (!table) return newSpec(def);
    const spec = newSpec(def);
    try {
      const res = applyData(def, spec, table);
      if (!res.ok) return newSpec(def);
      if (typeof def.onChange === 'function') def.onChange(spec);
      return spec;
    } catch {
      return newSpec(def);
    }
  }

  /** Build one chart, now. Only the pump calls this. */
  _render(host, id) {
    const def = CHARTS.find((c) => c.id === id);
    if (!def) return;
    try {
      const inst = renderChart(def, host, this._specFor(def),
        { height: PREVIEW_HEIGHT, compact: true });
      this.live.set(id, inst);
    } catch (err) {
      host.innerHTML = `<div style="font-size:11px;color:var(--ink-faint);text-align:center;padding:1rem">${escapeHtml(err.message)}</div>`;
    }
  }

  _refreshLive() {
    const ids = [...this.live.keys()];
    ids.forEach((id) => {
      const host = this.grid.querySelector(`.card-canvas[data-id="${CSS.escape(id)}"]`);
      destroyInstance(this.live.get(id));
      this.live.delete(id);
      if (host) this._queue(host, id);
    });
  }
}

/**
 * The credits footer: every third-party library the project ships, generated
 * from the same table the studio and the exports read, so the list can never
 * quietly fall out of date.
 *
 * Vendored assets are credited in the same list but counted separately. A
 * flag set is owed attribution and is not a library, and the row names the
 * path it lives at here rather than a URL — there isn't one, which is the
 * point of vendoring it.
 */
export function renderCredits(libsHost, tallyHost) {
  if (libsHost) {
    libsHost.innerHTML = '';
    [...ALL_LIBRARIES, ...ALL_ASSETS].forEach((lib) => {
      const row = document.createElement('div');
      row.className = 'foot-lib';
      const where = lib.url || lib.local || '';
      row.innerHTML =
        `<div class="foot-lib-head">`
        + `<a href="${escapeHtml(lib.homepage)}" target="_blank" rel="noopener noreferrer">${escapeHtml(lib.name)}</a>`
        + `<span class="pill">${escapeHtml(lib.version)}</span>`
        + `<span class="pill">${escapeHtml(lib.license)}</span>`
        + `</div>`
        + `<p class="foot-lib-role">${escapeHtml(lib.role)}</p>`
        + `<code class="foot-lib-url" title="${escapeHtml(where)}">${escapeHtml(where)}</code>`;
      libsHost.appendChild(row);
    });
  }

  if (tallyHost) {
    const t = engineTally();
    const free = (t.canvas || 0) + (t.native || 0) + (t.dom || 0);
    tallyHost.textContent =
      `${CHART_COUNT} charts · ${ALL_LIBRARIES.length} libraries · ${free} need no library at all`;
  }
}

function sectionRule(name, count) {
  const el = document.createElement('div');
  el.className = 'section-rule';
  el.innerHTML =
    `<h2>${escapeHtml(name)}</h2><span class="line"></span><span class="n">${count}</span>`;
  return el;
}
