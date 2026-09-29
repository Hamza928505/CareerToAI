/**
 * StudioApp.js — wires the studio page together.
 *
 * Owns the live spec for the chart currently being edited, rebuilds the
 * preview and the code panel whenever it changes, and keeps the URL in step so
 * a chart in progress can be linked to.
 */

import { CHARTS, CATEGORIES, getChart, chartIndex, newSpec } from './registry.js';
import { renderChart, destroyInstance, resizeInstance, renderLegend, generateCode } from './engines.js';
import { buildControls, buildStageTools } from './ControlPanel.js';
import { CodePanel } from './CodePanel.js';
import { renderSources } from './SourcesPanel.js';
import { renderHelp } from './HelpPanel.js';
import { buildPrompt } from './prompt.js';
import { openDataDialog } from './DataDialog.js';
import { prefetchLibraries } from './loader.js';
import { mountThemeToggle, onThemeChange, isDark, setTheme, storedTheme } from './theme.js';
import { toast } from './toast.js';
import { decodeSpec, buildShareUrl, URL_COMFORTABLE } from './share.js';
import { takeHandOff } from './DataMatch.js';
import { applyData } from './dataio.js';
import { initMotion, markChanged } from './motion.js';
import { mountControlsResize } from './resize.js';
import { tableMarkup } from './a11y.js';
import { attachAnnotationDrags } from './annotate.js';
import { captionHead, captionFoot, captionLines } from './caption.js';
import { saveChart, getSaved, thumbnailOf } from './shelf.js';
import { openAiConfigDialog } from './ai-config.js';

const $ = (sel, root = document) => root.querySelector(sel);

/** Which rail categories the visitor has collapsed. */
const RAIL_KEY = 'opencharts.rail';

/**
 * Whether the rail is collapsed to its spine.
 *
 * A separate key from `RAIL_KEY` on purpose: that one holds a JSON map of
 * which categories are open, and writing 'mini' over it would throw away
 * every group the reader had arranged.
 */
const RAIL_MODE_KEY = 'opencharts.rail-mode';

/** How many steps of studio history to keep, matching the data grid's. */
const HISTORY_LIMIT = 60;

/**
 * Edits closer together than this fold into one undo step.
 *
 * A slider drag fires an edit per pixel, and an undo that walked back one
 * pixel at a time is not what anybody means by undo.
 */
const COALESCE_MS = 400;

/** CSS.escape is not in every browser this may be opened in. */
const cssEscape = (value) => {
  const s = String(value == null ? '' : value);
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
  // Chart ids are [a-z0-9-] by convention, so this fallback only has to be safe.
  return s.replace(/[^a-zA-Z0-9_-]/g, '');
};

export class StudioApp {
  constructor() {
    this.def = null;
    this.spec = null;
    this.inst = null;
    this.codePanel = new CodePanel($('#codepanel'));
    this.codePanel.onApplySpec = (parsed) => this._applySpec(parsed);
    this.codePanel.onUndo = () => this.undo();
    this.codePanel.onRedo = () => this.redo();
    this._bindHistoryKeys();
    this.sourcesEl = $('#sources');
    this.helpEl = $('#help');

    this._cacheDom();
    this._buildRail();
    this._bindChrome();
    initMotion();
    // The controls column carries a lot now; how wide it needs to be is the
    // reader's call, not a number picked here.
    mountControlsResize(this.controlsEl);

    // Re-render on width change; charts that draw to raw canvas need it, and
    // Chart.js handles its own resize but a rebuild keeps everything in step.
    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(this.host);

    onThemeChange(() => this.rebuild());
    window.addEventListener('popstate', () => this._boot());

    this._boot();
  }

  /**
   * Open whatever the URL asks for. A shared spec has to be decoded before the
   * first render, so this is separate from the constructor.
   */
  async _boot() {
    const params = new URLSearchParams(location.search);
    const token = params.get('s');
    const shared = token ? await decodeSpec(token) : null;
    if (token && !shared) toast('That shared link could not be read — showing the default', 'bad');

    // A saved chart opens through the same door a shared link does: its spec
    // merged over the chart's defaults. The shelf entry names the chart, so
    // `?saved=` alone is enough to reopen it; `?chart=` is there for the URL
    // to read well and for a link whose entry has since been removed.
    const savedId = params.get('saved');
    const saved = savedId ? getSaved(savedId) : null;
    if (savedId && !saved) toast('That saved chart is no longer on this browser — showing the default', 'bad');
    // A chart saved by a newer library than this one names a chart this one
    // does not have; say so rather than open a blank studio.
    if (saved && !getChart(saved.chart)) toast(`That saved chart is a "${saved.chart}", which this library does not have`, 'bad', 4200);
    if (saved && getChart(saved.chart)) {
      this.load(saved.chart, { push: false, shared: saved.spec, savedId: saved.id });
      return;
    }
    this.load(this._idFromUrl(), { push: false, shared });

    // Switching chart is the second most common thing anyone does here, and
    // the rail reaches all 115 — so the libraries the next one might want are
    // fetched while the thread is idle rather than when it is clicked.
    prefetchLibraries();
  }

  _cacheDom() {
    this.host       = $('#chart-host');
    this.stageBody  = $('#stage-body');
    this.captionHeadEl = $('#chart-caption-head');
    this.captionFootEl = $('#chart-caption-foot');
    this.legendEl   = $('#legend');
    this.metricsEl  = $('#metrics');
    this.controlsEl = $('#controls');
    this.stageToolsEl = $('#stage-tools');
    this.railList   = $('#rail-list');
    this.titleEl    = $('#chart-title');
    this.blurbEl    = $('#chart-blurb');
    this.crumbEl    = $('#chart-crumb');
    this.stageTitle = $('#stage-title');
    this.idxEl      = $('#chart-idx');
    this.searchEl   = $('#rail-search');
    this.dataEl     = $('#chart-data');
  }

  _idFromUrl() {
    const id = new URLSearchParams(location.search).get('chart');
    return getChart(id) ? id : CHARTS[0].id;
  }

  /* ── Rail ──────────────────────────────────────────────────────────────── */

  /**
   * The rail is a set of collapsible category groups.
   *
   * Which groups are open is remembered per browser, except while a filter is
   * active — then every group with a match opens, because a closed group would
   * hide the very thing the search just found.
   */
  _buildRail(filter = '') {
    const q = filter.trim().toLowerCase();
    const searching = q.length > 0;
    this.railList.innerHTML = '';

    CATEGORIES.forEach((group) => {
      const matches = group.charts.filter((c) => !q || c.searchText.includes(q));
      if (!matches.length) return;

      const holdsActive = matches.some((c) => c.id === (this.def && this.def.id));
      const open = searching || holdsActive || this._isGroupOpen(group.name);

      const wrap = document.createElement('div');
      wrap.className = 'rail-group';
      wrap.dataset.open = String(open);
      wrap.dataset.group = group.name;

      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'rail-group-head';
      head.setAttribute('aria-expanded', String(open));
      head.innerHTML =
        `<span class="caret" aria-hidden="true">`
        + `<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 2l3.5 3-3.5 3"/></svg>`
        + `</span>`
        + `<span class="rail-group-ico" aria-hidden="true">${GLYPHS[group.name] || ''}</span>`
        + `<span>${escapeHtml(group.name)}</span>`
        + `<span class="n">${matches.length}</span>`;

      const body = document.createElement('div');
      body.className = 'rail-group-body';
      const inner = document.createElement('div');

      matches.forEach((c) => {
        const a = document.createElement('a');
        a.className = 'rail-link';
        a.href = `studio.html?chart=${encodeURIComponent(c.id)}`;
        a.dataset.id = c.id;
        a.innerHTML = `<span class="ico" aria-hidden="true">${glyph(c)}</span><span>${escapeHtml(c.title)}</span>`;
        a.addEventListener('click', (e) => {
          e.preventDefault();
          this.load(c.id);
          this._closeRailDrawer();
        });
        inner.appendChild(a);
      });

      body.appendChild(inner);

      head.addEventListener('click', () => {
        // Collapsed, the head is a glyph and its body is not on screen, so
        // toggling it would look like nothing happened. It opens the rail and
        // its own group instead — one click back to a list you can read.
        if (document.body.dataset.rail === 'mini') {
          this._setRailMini(false);
          wrap.dataset.open = 'true';
          head.setAttribute('aria-expanded', 'true');
          this._setGroupOpen(group.name, true);
          this._markActive();
          return;
        }
        const next = wrap.dataset.open !== 'true';
        wrap.dataset.open = String(next);
        head.setAttribute('aria-expanded', String(next));
        this._setGroupOpen(group.name, next);
        this._markActive();
      });

      wrap.append(head, body);
      this.railList.appendChild(wrap);
    });

    if (!this.railList.children.length) {
      const empty = document.createElement('div');
      empty.className = 'rail-label';
      empty.textContent = 'No charts match';
      this.railList.appendChild(empty);
    }

    this._markActive();
  }

  /* Open/closed state, persisted. Storage can throw in private windows. */
  _openGroups() {
    try {
      const raw = localStorage.getItem(RAIL_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  _isGroupOpen(name) {
    const state = this._openGroups();
    // No stored preference yet: start with everything open so the rail reads
    // as a full contents page rather than ten closed drawers.
    return state ? state[name] !== false : true;
  }

  _setGroupOpen(name, open) {
    try {
      const state = this._openGroups() || {};
      state[name] = open;
      localStorage.setItem(RAIL_KEY, JSON.stringify(state));
    } catch { /* not persisted — the session still works */ }
  }

  _markActive() {
    const activeId = this.def && this.def.id;
    this.railList.querySelectorAll('.rail-link').forEach((a) => {
      const on = a.dataset.id === activeId;
      a.classList.toggle('active', on);
      if (on && a.offsetParent !== null) a.scrollIntoView({ block: 'nearest' });
    });

    // Mark a collapsed group that contains the current chart, so it is still
    // findable when closed.
    this.railList.querySelectorAll('.rail-group').forEach((wrap) => {
      const holds = !!wrap.querySelector(`.rail-link[data-id="${cssEscape(activeId)}"]`);
      const closed = wrap.dataset.open !== 'true';
      const head = wrap.querySelector('.rail-group-head');
      let dot = head.querySelector('.here');
      if (holds && closed) {
        if (!dot) {
          dot = document.createElement('span');
          dot.className = 'here';
          dot.title = 'The chart you are editing is in here';
          head.appendChild(dot);
        }
      } else if (dot) {
        dot.remove();
      }
    });
  }

  /**
   * Collapse the rail to its spine, or open it again.
   *
   * The width change does not fire a window resize, so the hand-drawn
   * renderers have to be told — and told *after* the transition, or they
   * measure a host that is still moving.
   */
  _setRailMini(on) {
    document.body.dataset.rail = on ? 'mini' : '';
    const btn = $('#rail-collapse');
    if (btn) {
      btn.setAttribute('aria-expanded', String(!on));
      btn.setAttribute('aria-label', on ? 'Expand the chart list' : 'Collapse the chart list');
      btn.title = on ? 'Expand the chart list' : 'Collapse the chart list';
    }
    // A private window throws on write; the mode still works, it just will not
    // be remembered — the same bargain `theme.js` makes.
    try { localStorage.setItem(RAIL_MODE_KEY, on ? 'mini' : 'full'); } catch { /* not fatal */ }
    this._afterLayoutChange();
  }

  /** Everything but the plate. */
  _setFocus(on) {
    document.body.dataset.focus = on ? '1' : '';
    const btn = $('#btn-focus');
    if (btn) btn.setAttribute('aria-pressed', String(on));
    this._afterLayoutChange();
  }

  /** Re-measure once the chrome has finished moving. */
  _afterLayoutChange() {
    clearTimeout(this._layoutTimer);
    this._layoutTimer = setTimeout(() => this._onResize(), 240);
  }

  _closeRailDrawer() {
    $('#rail')?.classList.remove('open');
    $('#rail-scrim')?.classList.remove('open');
    document.body.classList.remove('rail-open');
  }

  /* ── Chrome ────────────────────────────────────────────────────────────── */

  _bindChrome() {
    mountThemeToggle($('#theme-mount'));

    this.searchEl?.addEventListener('input', () => this._buildRail(this.searchEl.value));

    $('#btn-prev')?.addEventListener('click', () => this._step(-1));
    $('#btn-next')?.addEventListener('click', () => this._step(1));
    $('#btn-reset')?.addEventListener('click', () => {
      this.spec = newSpec(this.def);
      this._buildPanels();
      this.rebuild();
      toast('Reset to defaults', 'ok');
    });
    $('#btn-png')?.addEventListener('click', () => this._exportPNG());
    $('#btn-print')?.addEventListener('click', () => this._print());
    $('#btn-share')?.addEventListener('click', () => this._share());
    $('#btn-save')?.addEventListener('click', () => this._save());
    $('#btn-embed')?.addEventListener('click', () => this._embed());
    $('#btn-prompt')?.addEventListener('click', () => this._copyPrompt());
    // Pair this tab with the user's local MCP agent bridge.
    $('#btn-ai-config')?.addEventListener('click', () => openAiConfigDialog());

    // Restore the rail the way it was left. Read once, here, rather than at
    // module load: a private window can throw on read too.
    let savedRail = null;
    try { savedRail = localStorage.getItem(RAIL_MODE_KEY); } catch { /* not fatal */ }
    if (savedRail === 'mini') this._setRailMini(true);

    $('#rail-collapse')?.addEventListener('click', () => {
      this._setRailMini(document.body.dataset.rail !== 'mini');
    });
    $('#btn-focus')?.addEventListener('click', () => {
      this._setFocus(document.body.dataset.focus !== '1');
    });

    const railToggle = $('#rail-toggle');
    const rail = $('#rail');
    const scrim = $('#rail-scrim');
    railToggle?.addEventListener('click', () => {
      rail.classList.toggle('open');
      scrim.classList.toggle('open');
    });
    scrim?.addEventListener('click', () => this._closeRailDrawer());
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      this._closeRailDrawer();
      // Escape is the way out of a mode you may have entered by accident.
      if (document.body.dataset.focus === '1') this._setFocus(false);
    });

    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+F works while typing; it is a view command, not a text one.
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        this._setFocus(document.body.dataset.focus !== '1');
        return;
      }
      // `e.target` is not always an Element — a key event dispatched at the
      // document has the document as its target, and `document.matches` does
      // not exist. Reaching for it there throws and kills the handler, taking
      // the bracket shortcuts with it.
      const t = e.target;
      if (t && typeof t.matches === 'function' && t.matches('input, textarea, select')) return;
      if (e.key === '[') this._step(-1);
      if (e.key === ']') this._step(1);
      // A bare key, so it stays out of the way of the browser's own.
      if (e.key === '\\') this._setRailMini(document.body.dataset.rail !== 'mini');
    });
  }

  _step(delta) {
    const i = chartIndex(this.def.id);
    const next = CHARTS[(i + delta + CHARTS.length) % CHARTS.length];
    this.load(next.id);
  }

  /* ── Load & render ─────────────────────────────────────────────────────── */

  load(id, { push = true, shared = null, savedId = null } = {}) {
    const def = getChart(id);
    if (!def) return;

    destroyInstance(this.inst);
    this.inst = null;
    this.def = def;
    // Which shelf entry Save updates. Opening any other chart is a new thing,
    // not an edit of the saved one, so it starts unsaved.
    this.savedId = savedId;
    this._paintSaveState();
    // A shared link carries a whole spec. Merge it over the defaults rather
    // than replacing them, so a link made before a chart gained a new option
    // still opens.
    this.spec = shared ? { ...newSpec(def), ...shared } : newSpec(def);
    this.isShared = !!shared;

    // A reader who matched a table in the gallery and clicked through meant to
    // draw *that*, not the example. It travels in session storage because a
    // table does not fit in a URL.
    //
    // Taken from storage exactly once — a later *reload* of the studio is a
    // fresh start, not a repeat of somebody's paste — but kept in memory for
    // as long as this page lives, because `load` also runs on every rail click
    // and every ←/→, and walking the charts that matched your table is the
    // whole point of having matched it. Consuming it on the first chart left
    // every chart after that drawing the example.
    //
    // Held across an in-studio data edit too: switching chart rebuilds the
    // spec from `newSpec` regardless, so carrying the table somebody arrived
    // with loses nothing that was not already going.
    if (!shared) {
      if (!this.tookHandOff) {
        this.tookHandOff = true;
        this.brought = takeHandOff();
      }
      if (this.brought) {
        // Calculated recommendations carry their exact spec (title, axes and
        // full data) through the existing local handoff, without a giant URL.
        const prepared = this.brought.prepared;
        let res;
        if (prepared?.chart === id) {
          this.spec = { ...this.spec, ...prepared.spec };
          res = { ok: true, message: 'calculated chart from your full table' };
        } else {
          res = applyData(def, this.spec, this.brought);
        }
        if (res.ok) {
          if (typeof def.onChange === 'function') def.onChange(this.spec);
          // Said once, on arrival. A toast on every chart switch is noise.
          if (!this.announcedBrought) {
            this.announcedBrought = true;
            this.broughtData = res.message;
          }
        }
      }
    }

    if (push) {
      history.pushState({ id }, '', `studio.html?chart=${encodeURIComponent(id)}`);
    }
    document.title = `${def.title} — OpenCharts Studio`;

    this.titleEl.innerHTML = `${escapeHtml(def.title)} <em>Studio</em>`;
    this.blurbEl.textContent = def.blurb;
    this.crumbEl.innerHTML =
      `<a href="index.html">Library</a><span class="sep">/</span>`
      + `<span>${escapeHtml(def.category)}</span><span class="sep">/</span>`
      + `<span>${escapeHtml(def.title)}</span>`;
    this.stageTitle.textContent = def.title;
    this.idxEl.textContent = `${chartIndex(id) + 1} / ${CHARTS.length}`;

    this._buildPanels(def);
    this._markActive();
    this.rebuild();
    // Opening a chart is not an edit of the last one: the history starts here.
    this._resetHistory();

    if (this.broughtData) {
      toast('Your table — ' + this.broughtData, 'ok');
      this.broughtData = null;
    }
  }

  /* ── history ───────────────────────────────────────────────────────────
   *
   * Snapshots of the whole spec, not inverse operations — the same bargain
   * `DataGrid` makes and for the same reason: a spec is JSON by construction
   * (the share link and the Spec tab both prove it round-trips), so a copy is
   * cheap beside the render that follows it, and an undo cannot drift from the
   * edit it reverses.
   *
   * The grid's undo covers the table. This covers everything else the studio
   * can change — colours, sliders, toggles, the facet, the notes — which until
   * now were all one-way doors.
   */
  _snapshot() { return JSON.stringify(this.spec); }

  /** Start a fresh history, on load or on opening another chart. */
  _resetHistory() {
    this.past = [];
    this.future = [];
    this.lastCommitted = this._snapshot();
    this.lastCommitAt = 0;
    this._paintHistory();
  }

  /**
   * Bank the state as it was before the edit that just happened.
   *
   * Edits inside `COALESCE_MS` of each other fold into one step. A slider drag
   * fires an edit per pixel, and an undo that walked back one pixel at a time
   * is not what anybody means by undo — the grid solves the same problem by
   * banking once per cell on the first keystroke. Time is the honest proxy
   * here, because `_onEdit` is told that *something* changed and not what.
   *
   * `step: true` refuses to fold. A table applied from the dialog or a spec
   * pasted into the code panel is a deliberate act with a boundary either
   * side of it, however fast it followed the last one.
   */
  _commit({ step = false } = {}) {
    const now = this._snapshot();
    if (now === this.lastCommitted) return;
    const at = Date.now();
    const fold = !step && this.past.length > 0 && (at - this.lastCommitAt) < COALESCE_MS;
    if (!fold) {
      this.past.push(this.lastCommitted);
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
    }
    // Any new edit is a new branch: what was undone is no longer ahead.
    this.future.length = 0;
    this.lastCommitted = now;
    this.lastCommitAt = at;
    this._paintHistory();
  }

  undo() {
    if (!this.past.length) return false;
    this.future.push(this.lastCommitted);
    this._restore(this.past.pop());
    return true;
  }

  redo() {
    if (!this.future.length) return false;
    this.past.push(this.lastCommitted);
    this._restore(this.future.pop());
    return true;
  }

  /** Put a banked spec back on screen without recording it as a new edit. */
  _restore(json) {
    this.spec = JSON.parse(json);
    if (typeof this.def.onChange === 'function') this.def.onChange(this.spec);
    // The controls are rebuilt, not just repainted: an undo can change how
    // many series exist, and a stale row would edit an index that has gone.
    this._buildPanels();
    this.rebuild();
    this.lastCommitted = json;
    // Deliberately not `Date.now()`: an edit made straight after an undo is a
    // new step, never a fold into the one that was just undone.
    this.lastCommitAt = 0;
    this._paintHistory();
  }

  _paintHistory() {
    if (this.codePanel && this.codePanel.setHistory) {
      this.codePanel.setHistory({
        canUndo: this.past.length > 0,
        canRedo: this.future.length > 0,
      });
    }
  }

  /**
   * Ctrl+Z / Ctrl+Shift+Z, bound at the document.
   *
   * Stood down while the data editor is open — that grid binds its own Ctrl+Z
   * on its own root and means the table by it, which is what every spreadsheet
   * does — and while somebody is typing, where the browser's own undo is the
   * one they want.
   */
  _bindHistoryKeys() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+S is what every editor means by "keep this"; the browser's own
      // Save Page is not what anyone in a chart studio wants from it.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
        if (document.querySelector('.dlg-scrim')) return;
        e.preventDefault();
        this._save();
        return;
      }
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      if (document.querySelector('.dlg-scrim')) return;
      const t = e.target;
      if (t && t.closest && t.closest('input, textarea, [contenteditable]')) return;
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
    });
  }

  /**
   * Rebuild both control surfaces: the sidebar, and the stage-side small
   * multiples / notes. They read one spec and one change callback, so a caller
   * that rebuilds one always rebuilds the other.
   */
  _buildPanels(def = this.def) {
    buildControls(this.controlsEl, def, this.spec, () => this._onEdit());
    buildStageTools(this.stageToolsEl, def, this.spec, () => this._onEdit());
  }

  _onEdit() {
    if (typeof this.def.onChange === 'function') this.def.onChange(this.spec);
    // The URL still carries the spec this session opened with; once it is
    // edited that token is stale, so drop it rather than let Back or a copied
    // address bar restore the wrong chart.
    if (this.isShared) {
      this.isShared = false;
      const url = new URL(location.href);
      url.searchParams.delete('s');
      history.replaceState({ id: this.def.id }, '', url.toString());
    }
    this.rebuild();
    this._commit();
  }

  /** Open the full-size data editor. */
  editData() {
    openDataDialog(this.def, this.spec, () => {
      if (typeof this.def.onChange === 'function') this.def.onChange(this.spec);
      // Rebuild the controls too: new data can mean a different number of series.
      this._buildPanels();
      this.rebuild();
      // A table is one deliberate act however quickly it followed the last.
      this._commit({ step: true });
    });
  }

  /**
   * Keep the chart on this browser's shelf.
   *
   * The name is the caption's title where there is one — the reader already
   * said what the chart is about — and the chart's own title otherwise. A
   * second save updates the entry the chart was opened from rather than
   * adding a twin; opening a different chart starts a new one.
   */
  _save() {
    if (!this.def) return;
    const caption = this.spec && this.spec.caption;
    const name = (caption && caption.title) || this.def.title;
    const canvas = this.host.querySelector('canvas');
    const res = saveChart({
      id: this.savedId,
      name,
      chart: this.def.id,
      spec: this.spec,
      thumb: thumbnailOf(canvas),
    });
    if (!res.ok) { toast(res.message, 'bad'); return; }
    this.savedId = res.entry.id;
    this._paintSaveState();
    // The address now names the saved chart, so a reload or a bookmark
    // reopens what was kept rather than the example.
    const url = new URL(location.href);
    url.searchParams.set('saved', this.savedId);
    history.replaceState({ id: this.def.id }, '', url.toString());
    toast(res.message, 'ok', res.evicted ? 4200 : undefined);
  }

  /** The Save button says whether this chart is already on the shelf. */
  _paintSaveState() {
    const b = $('#btn-save');
    if (!b) return;
    b.classList.toggle('is-saved', !!this.savedId);
    b.title = this.savedId
      ? 'Update this chart in My charts (Ctrl+S)'
      : 'Keep this chart in My charts on this browser (Ctrl+S)';
  }

  /** Copy a link that reproduces exactly what is on screen. */
  async _share() {
    try {
      const url = await buildShareUrl(this.def.id, this.spec);
      await navigator.clipboard.writeText(url);
      if (url.length > URL_COMFORTABLE) {
        toast('Link copied — it is long, so some chat apps may truncate it', 'ok', 4200);
      } else {
        toast('Shareable link copied', 'ok');
      }
    } catch {
      toast('Could not copy the link', 'bad');
    }
  }

  /**
   * Copy the AI brief for the chart as it stands.
   *
   * The prompt already exists as a tab, but that is three actions down the
   * page — switch tab, find Copy, click. This is the same action the gallery
   * tiles offer, in the one place a reader is already looking. It deliberately
   * does not switch the code panel: someone reading the JS did not ask to
   * lose their place.
   */
  async _copyPrompt() {
    const btn = $('#btn-prompt');
    const label = btn ? btn.innerHTML : '';
    try {
      const text = this.codePanel.promptText();
      if (!text) { toast('This chart has no prompt yet', 'bad'); return; }
      await navigator.clipboard.writeText(text);
      if (btn) {
        btn.innerHTML = '<span aria-hidden="true">✓</span> Copied';
        setTimeout(() => { btn.innerHTML = label; }, 1800);
      }
      toast(this.codePanel.promptMode === 'data'
        ? 'Data-only prompt copied — attach your spreadsheet to any AI'
        : 'Prompt copied — attach your spreadsheet to any AI', 'ok');
    } catch {
      toast('Could not copy the prompt', 'bad');
    }
  }

  /**
   * Print the chart — which is also how it becomes a PDF.
   *
   * No PDF exporter ships here and none needs to: every browser has one behind
   * Save as PDF, and it writes vector text where a rasterised canvas would
   * write pixels. What that needs is a page that prints, and `@media print` in
   * `studio.css` is the whole of it — the chrome goes, the plate, its caption
   * and its data table stay.
   *
   * Two things CSS cannot do, and this does:
   *
   * **The ink.** A canvas chart resolves its label colour from the page's
   * tokens at *render* time, so a studio in dark mode has already painted pale
   * grey into the bitmap and no print rule can reach inside it. A dark studio
   * is switched to light first, which re-renders every chart through
   * `onThemeChange`, and switched back when the dialog closes. What goes back
   * is the stored *preference*, not the colour it resolved to: a reader who
   * had chosen nothing must keep following their OS.
   *
   * **The table.** It is a `<details>`, and no stylesheet can open one. It is
   * opened for the sheet and left as it was found — and opened *after* the
   * theme switch, because `rebuild` replaces that markup wholesale and would
   * throw an earlier one away along with the chart it re-rendered.
   */
  _print() {
    const before = storedTheme();
    const wasDark = isDark();
    if (wasDark) setTheme('light');

    let details = null;
    let wasOpen = false;
    const restore = () => {
      window.removeEventListener('afterprint', restore);
      if (details) details.open = wasOpen;
      if (wasDark) setTheme(before);
    };
    window.addEventListener('afterprint', restore);

    // A beat, so the re-render the theme switch just asked for is on screen
    // before the dialog freezes the page. Printing a chart caught mid-redraw
    // is the one failure this button could not explain to anybody.
    setTimeout(() => {
      details = this.dataEl ? this.dataEl.querySelector('details') : null;
      wasOpen = !!(details && details.open);
      if (details) details.open = true;
      try { window.print(); } catch { toast('This browser would not open the print dialog', 'bad'); }
      // Chrome and Firefox fire `afterprint`; a browser that does not would
      // leave the studio light for good, so the restore is not left to it
      // alone. Running twice is harmless — it puts back the same two values.
      setTimeout(restore, 0);
    }, wasDark ? 260 : 0);
  }

  /** The same link, as an <iframe> somebody can paste into a page. */
  async _embed() {
    try {
      const url = new URL(await buildShareUrl(this.def.id, this.spec));
      url.searchParams.set('embed', '1');
      const height = (this.def.canvas || this.def.d3 || this.def.dom || {}).height || 420;
      const tag = `<iframe src="${url.toString()}" width="100%" height="${height + 40}"`
        + ` style="border:1px solid #e5e5e5;border-radius:10px"`
        + ` title="${escapeHtml(this.def.title)}" loading="lazy"></iframe>`;
      await navigator.clipboard.writeText(tag);
      toast('Embed code copied', 'ok');
    } catch {
      toast('Could not copy the embed code', 'bad');
    }
  }

  rebuild() {
    if (!this.def) return;
    destroyInstance(this.inst);
    if (this._stopAnnotDrag) this._stopAnnotDrag();
    this.inst = renderChart(this.def, this.host, this.spec);

    // The caption is markup around the plate, not part of the render: the
    // host is emptied by every renderer and the plate's own box has to stay
    // the plate's, or a note laid over it would move when a title was typed.
    // Same two functions the export uses, so preview and export agree.
    if (this.captionHeadEl) this.captionHeadEl.innerHTML = captionHead(this.spec);
    if (this.captionFootEl) this.captionFootEl.innerHTML = captionFoot(this.spec);

    // An axis that could not do what it was asked says so — once per reason,
    // not on every rebuild. `valueAxis` leaves the note when a log scale meets
    // a zero; a refused request that is silently downgraded reads as a bug.
    const axisNote = this.spec._axisNote || '';
    if (axisNote && axisNote !== this._saidAxisNote) toast(axisNote, 'bad', 4200);
    this._saidAxisNote = axisNote;

    // A note is placed by dragging it, not by typing two numbers, so the
    // binding is re-made whenever the plate under it is. Torn down first:
    // four of the five renderers draw into the host itself, which outlives
    // the rebuild and would otherwise collect a listener per edit.
    //
    // Plural, because a faceted chart paints an overlay per scope and each one
    // has to be measured against its own box.
    this._stopAnnotDrag = attachAnnotationDrags(
      this.host, this.spec.annotations || [], () => this._onEdit(),
    );

    const items = this.def.legend ? this.def.legend(this.spec) : null;
    renderLegend(this.legendEl, items, this.inst);
    this._renderMetrics();

    const code = generateCode(this.def, this.spec);
    // The chart as data. Self-describing, so a spec pasted into a different
    // chart's studio can open the chart it actually belongs to rather than
    // being merged into one that will ignore half of it.
    code.spec = JSON.stringify({ chart: this.def.id, spec: this.spec }, null, 2);
    // Built here rather than inside generateCode: the prompt quotes the
    // Standalone export, so it has to come after it, and it is a brief about
    // the chart rather than one of its four code views.
    // Both forms, because the panel switches between them without a rebuild.
    // The short one costs nothing next to the code generation above it.
    code.prompt = buildPrompt(this.def, this.spec, code, 'full');
    code.promptShort = buildPrompt(this.def, this.spec, code, 'data');
    // The code tabs need only strings; the Colours tab edits the live spec, so
    // it is handed the chart itself.
    this.codePanel.setChart(this.def, this.spec, () => this._onEdit());
    this.codePanel.setCode(code, this.def.id);
    if (this.dataEl) this.dataEl.innerHTML = tableMarkup(this.def, this.spec);
    if (this.sourcesEl) renderSources(this.sourcesEl, code.deps || []);
    if (this.helpEl) renderHelp(this.helpEl, this.def, this.spec, () => this.editData());
  }

  /**
   * Take a pasted spec.
   *
   * Merged over the chart's defaults rather than replacing them — the same
   * rule a share link follows, so a spec written before the chart gained an
   * option still opens instead of rendering with holes in it.
   *
   * @returns {{ ok: boolean, message: string }}
   */
  _applySpec(parsed) {
    // The panel writes `{ chart, spec }`; a bare spec object from somewhere
    // else is accepted too rather than refused on a technicality.
    const inner = parsed.spec && typeof parsed.spec === 'object' && !Array.isArray(parsed.spec)
      ? parsed.spec
      : parsed;
    const wantId = typeof parsed.chart === 'string' ? parsed.chart : '';

    if (wantId && wantId !== this.def.id) {
      const def = getChart(wantId);
      if (!def) return { ok: false, message: `No chart called "${wantId}" — check the id.` };
      this.load(wantId, { shared: inner });
      return { ok: true, message: `Opened ${def.title} from the pasted spec` };
    }

    this.spec = { ...newSpec(this.def), ...inner };
    if (typeof this.def.onChange === 'function') this.def.onChange(this.spec);
    this._buildPanels();
    this.rebuild();
    this._commit({ step: true });
    return { ok: true, message: 'Spec applied' };
  }

  _renderMetrics() {
    const metrics = this.def.metrics ? this.def.metrics(this.spec) : null;
    if (!metrics || !metrics.length) {
      this.metricsEl.style.display = 'none';
      this.metricsEl.innerHTML = '';
      return;
    }
    // What each figure read before this rebuild, so only the ones that moved
    // are marked. Flashing the whole row on every keystroke would make the
    // signal meaningless — the point is to say *which* number changed.
    const previous = [...this.metricsEl.querySelectorAll('.metric-value')].map((n) => n.textContent);

    this.metricsEl.style.display = 'grid';
    this.metricsEl.innerHTML = metrics.map((m) =>
      `<div class="metric"><div class="metric-label">${escapeHtml(m.label)}</div>`
      + `<div class="metric-value">${escapeHtml(m.value)}</div></div>`).join('');

    // Only when the row kept its shape; a different set of metrics is a new
    // chart, not a changed value.
    if (previous.length === metrics.length) {
      this.metricsEl.querySelectorAll('.metric-value').forEach((node, i) => {
        if (previous[i] !== undefined && previous[i] !== node.textContent) markChanged(node);
      });
    }
  }

  _onResize() {
    // Chart.js and the engine handle their own resize; the hand-drawn
    // renderers need to be told.
    if (this.inst && this.inst.redraw) resizeInstance(this.inst);
  }

  /**
   * A faceted chart exports as the grid, not as its first panel.
   *
   * `querySelector('canvas')` would find panel one and hand over a picture of
   * a twelfth of what is on screen, with nothing saying so — the quietest
   * possible way for an export to lie. Both branches lay the panels out from
   * the boxes the browser has already computed, so the file is what the
   * reader is looking at rather than a second guess at the layout.
   */
  _exportGrid(grid) {
    const facets = [...grid.querySelectorAll('.oc-facet')];
    const box = this._frame(grid.getBoundingClientRect());
    const pad = 14;
    const style = getComputedStyle(document.body);
    const paper = style.getPropertyValue('--surface').trim() || '#ffffff';
    const ink = style.getPropertyValue('--ink-soft').trim() || '#475569';
    const at = (r) => ({ x: r.left - box.left + pad, y: r.top - box.top + pad });
    const W = box.width + pad * 2;
    const H = box.height + pad * 2;
    const nameOf = (f) => {
      const n = f.querySelector('.oc-facet-name');
      return n ? n.textContent : '';
    };

    const canvases = facets.map((f) => f.querySelector('canvas'));
    if (canvases.length && canvases.every(Boolean)) {
      const dpr = window.devicePixelRatio || 1;
      const out = document.createElement('canvas');
      out.width = Math.round(W * dpr);
      out.height = Math.round(H * dpr);
      const ctx = out.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, W, H);
      this._paintCaption(ctx, at);
      facets.forEach((f, i) => {
        const label = f.querySelector('.oc-facet-name');
        if (label) {
          const p = at(label.getBoundingClientRect());
          ctx.fillStyle = ink;
          ctx.font = '600 11.5px system-ui, sans-serif';
          ctx.textBaseline = 'top';
          ctx.fillText(nameOf(f), p.x, p.y);
        }
        const c = canvases[i];
        const r = c.getBoundingClientRect();
        const p = at(r);
        ctx.drawImage(c, p.x, p.y, r.width, r.height);
      });
      downloadDataUrl(out.toDataURL('image/png'), `${this.def.id}-panels.png`);
      toast(`PNG exported — ${facets.length} panels`, 'ok');
      return true;
    }

    const svgs = facets.map((f) => f.querySelector('svg'));
    if (svgs.length && svgs.every(Boolean)) {
      const NS = 'http://www.w3.org/2000/svg';
      const out = document.createElementNS(NS, 'svg');
      out.setAttribute('xmlns', NS);
      out.setAttribute('width', String(Math.round(W)));
      out.setAttribute('height', String(Math.round(H)));
      const bg = document.createElementNS(NS, 'rect');
      bg.setAttribute('width', '100%');
      bg.setAttribute('height', '100%');
      bg.setAttribute('fill', paper);
      out.appendChild(bg);
      this._captionSvg(out, at);
      facets.forEach((f, i) => {
        const label = f.querySelector('.oc-facet-name');
        if (label) {
          const p = at(label.getBoundingClientRect());
          const t = document.createElementNS(NS, 'text');
          t.setAttribute('x', String(Math.round(p.x)));
          t.setAttribute('y', String(Math.round(p.y + 10)));
          t.setAttribute('fill', ink);
          t.setAttribute('font-size', '11.5');
          t.setAttribute('font-weight', '600');
          t.setAttribute('font-family', 'system-ui, sans-serif');
          t.textContent = nameOf(f);
          out.appendChild(t);
        }
        // A nested <svg> keeps each panel's own coordinate system, so no path
        // has to be transformed to sit in the grid.
        const r = svgs[i].getBoundingClientRect();
        const p = at(r);
        const clone = svgs[i].cloneNode(true);
        clone.setAttribute('x', String(Math.round(p.x)));
        clone.setAttribute('y', String(Math.round(p.y)));
        clone.setAttribute('width', String(Math.round(r.width)));
        clone.setAttribute('height', String(Math.round(r.height)));
        out.appendChild(clone);
      });
      const blob = new Blob([new XMLSerializer().serializeToString(out)], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      downloadDataUrl(url, `${this.def.id}-panels.svg`);
      URL.revokeObjectURL(url);
      toast(`SVG exported — ${facets.length} panels`, 'ok');
      return true;
    }

    return false;
  }

  /**
   * The box a picture of the chart has to cover: the plate, plus whatever
   * caption sits above and below it. Without a caption it is the plate.
   */
  _frame(plate) {
    const lines = captionLines(this.stageBody);
    if (!lines.length) return plate;
    let top = plate.top;
    let bottom = plate.bottom;
    let left = plate.left;
    let right = plate.right;
    lines.forEach((l) => {
      top = Math.min(top, l.y);
      bottom = Math.max(bottom, l.y + l.lineHeight);
      left = Math.min(left, l.x);
      right = Math.max(right, l.x + l.width + 2);
    });
    const gap = 6;
    top -= gap; bottom += gap;
    return { top, bottom, left, right, width: right - left, height: bottom - top };
  }

  /** The caption's lines, painted where they sit on screen. */
  _paintCaption(ctx, at) {
    captionLines(this.stageBody).forEach((l) => {
      const p = at({ left: l.x, top: l.y });
      ctx.font = l.font;
      ctx.fillStyle = l.color;
      ctx.textBaseline = 'top';
      // The line box is taller than the glyphs; centre the text in it.
      ctx.fillText(l.text, p.x, p.y + (l.lineHeight - l.size) / 2);
    });
  }

  /** The same lines as <text>, for the SVG exports. */
  _captionSvg(out, at) {
    const NS = 'http://www.w3.org/2000/svg';
    captionLines(this.stageBody).forEach((l) => {
      const p = at({ left: l.x, top: l.y });
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', String(Math.round(p.x)));
      t.setAttribute('y', String(Math.round(p.y + (l.lineHeight - l.size) / 2 + l.size * 0.8)));
      t.setAttribute('fill', l.color);
      t.setAttribute('style', `font: ${l.font}`);
      t.textContent = l.text;
      out.appendChild(t);
    });
  }

  _exportPNG() {
    const grid = this.host.querySelector('.oc-facets');
    if (grid) {
      // Never fall through to the single-chart path from here: it would find
      // panel one and export a twelfth of the picture without saying so.
      if (!this._exportGrid(grid)) {
        toast('These panels cannot be exported as an image — copy the Standalone code', 'bad');
      }
      return;
    }

    const paper = getComputedStyle(document.body).getPropertyValue('--surface').trim() || '#ffffff';

    const canvas = this.host.querySelector('canvas');
    if (canvas) {
      // Repaint onto an opaque background so the PNG is not transparent, at
      // the canvas's own pixel density, inside a frame that also holds the
      // caption — a picture of the plate alone is a chart with its source
      // torn off.
      const r = canvas.getBoundingClientRect();
      const box = this._frame(r);
      const scale = r.width ? canvas.width / r.width : 1;
      const at = (rect) => ({ x: rect.left - box.left, y: rect.top - box.top });
      const out = document.createElement('canvas');
      out.width = Math.round(box.width * scale);
      out.height = Math.round(box.height * scale);
      const ctx = out.getContext('2d');
      ctx.scale(scale, scale);
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, box.width, box.height);
      this._paintCaption(ctx, at);
      const p = at(r);
      ctx.drawImage(canvas, p.x, p.y, r.width, r.height);
      downloadDataUrl(out.toDataURL('image/png'), `${this.def.id}.png`);
      toast('PNG exported', 'ok');
      return;
    }

    const svg = this.host.querySelector('svg');
    if (svg) {
      // SVG charts export as .svg — rasterising them here would need a
      // round-trip through an Image and would silently drop CSS-inherited ink.
      // With a caption the chart is nested in an outer frame that carries the
      // text; without one the file is the chart's own <svg>, as it always was.
      const inner = svg.cloneNode(true);
      inner.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      let clone = inner;
      if (captionLines(this.stageBody).length) {
        const NS = 'http://www.w3.org/2000/svg';
        const r = svg.getBoundingClientRect();
        const box = this._frame(r);
        const at = (rect) => ({ x: rect.left - box.left, y: rect.top - box.top });
        clone = document.createElementNS(NS, 'svg');
        clone.setAttribute('xmlns', NS);
        clone.setAttribute('width', String(Math.round(box.width)));
        clone.setAttribute('height', String(Math.round(box.height)));
        const bg = document.createElementNS(NS, 'rect');
        bg.setAttribute('width', '100%');
        bg.setAttribute('height', '100%');
        bg.setAttribute('fill', paper);
        clone.appendChild(bg);
        this._captionSvg(clone, at);
        const p = at(r);
        inner.setAttribute('x', String(Math.round(p.x)));
        inner.setAttribute('y', String(Math.round(p.y)));
        inner.setAttribute('width', String(Math.round(r.width)));
        inner.setAttribute('height', String(Math.round(r.height)));
        clone.appendChild(inner);
      }
      const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      downloadDataUrl(url, `${this.def.id}.svg`);
      URL.revokeObjectURL(url);
      toast('SVG exported', 'ok');
      return;
    }

    toast('This chart has no canvas to export', 'bad');
  }
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function downloadDataUrl(href, filename) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** A tiny inline SVG per category — cheaper and sharper than an icon font. */
const GLYPHS = {
  'Line & Area':   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M1 12l4-5 3 3 7-8"/></svg>',
  'Bar':           '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="8" width="3" height="7" rx="1"/><rect x="6.5" y="4" width="3" height="11" rx="1"/><rect x="12" y="1" width="3" height="14" rx="1"/></svg>',
  'Part to Whole': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="6.4"/><path d="M8 1.6V8l4.6 4.4"/></svg>',
  'Radar':         '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1l6.1 4.4-2.3 7.2H4.2L1.9 5.4z"/><path d="M8 4.6l3.1 2.2-1.2 3.6H6.1L4.9 6.8z"/></svg>',
  'Scatter':       '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="11.5" r="1.8"/><circle cx="8" cy="6.5" r="1.8"/><circle cx="12.5" cy="9.5" r="1.8"/><circle cx="11" cy="3.5" r="1.4"/></svg>',
  'Distribution':  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M1 13c2.5 0 2.5-9 5-9s2.5 9 5 9 2.5-4.5 4-4.5"/></svg>',
  'Hierarchy':     '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.2" y="1.2" width="13.6" height="13.6" rx="1.6"/><path d="M7 1.2v13.6M7 8h7.8"/></svg>',
  'Flow':          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M1 4h5c3 0 3 8 6 8h3"/><path d="M1 11h4"/></svg>',
  'Comparison':    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 12L14 4"/><circle cx="2" cy="12" r="1.6" fill="currentColor"/><circle cx="14" cy="4" r="1.6" fill="currentColor"/></svg>',
  'Custom Engine': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1.4l5.7 3.3v6.6L8 14.6 2.3 11.3V4.7z"/><circle cx="8" cy="8" r="2.1"/></svg>',
  // The five that used to fall through to the bar glyph. Harmless in the
  // expanded rail, where the category is spelled out beside it — but the
  // collapsed spine is nothing *but* the glyph, so five categories sharing
  // one mark would make five of the fifteen unreachable by sight.
  'Deviation':     '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M1 8h14"/><rect x="3" y="3" width="3" height="5" rx=".8" fill="currentColor" stroke="none"/><rect x="10" y="8" width="3" height="5" rx=".8" fill="currentColor" stroke="none"/></svg>',
  'Network':       '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 4l8 3M4 4l2 8M12 7l-6 5"/><circle cx="4" cy="4" r="1.9" fill="currentColor" stroke="none"/><circle cx="12.2" cy="7" r="1.7" fill="currentColor" stroke="none"/><circle cx="6" cy="12.4" r="1.7" fill="currentColor" stroke="none"/></svg>',
  'Finance':       '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 2.5v11M11.5 2.5v11"/><rect x="2" y="5" width="4" height="5" rx=".7" fill="currentColor" stroke="none"/><rect x="9.5" y="7" width="4" height="5" rx=".7" fill="currentColor" stroke="none"/></svg>',
  'Geo':           '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="6.4"/><path d="M1.7 8h12.6M8 1.6c1.9 2 2.9 4 2.9 6.4S9.9 12.4 8 14.4c-1.9-2-2.9-4-2.9-6.4S6.1 3.6 8 1.6z"/></svg>',
  'KPI & Micro':   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M1.5 11.5l3-3 2.5 2 3.5-5"/><path d="M11 5.5h3.5V9"/></svg>',
};

function glyph(def) {
  return GLYPHS[def.category] || GLYPHS['Bar'];
}

export { glyph, escapeHtml };
