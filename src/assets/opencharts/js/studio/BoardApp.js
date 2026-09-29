/**
 * BoardApp.js — the board page.
 *
 * `board.js` holds what a board *is* and what it exports; this is the page that
 * lets somebody build one. The charts come from the shelf, because the shelf is
 * already the answer to "what have I made" — a board names entries by their
 * shelf id rather than copying their specs, so editing a chart in the studio
 * and coming back shows the edit. The cost is that removing a chart from My
 * charts takes it off the board too, which is the right way round: a card whose
 * chart no longer exists says so instead of drawing a stale copy.
 *
 * Three things borrowed wholesale rather than re-invented:
 *
 * - **The frame budget.** `_queue` / `_pump` are the gallery's, for the same
 *   reason: mounting twelve charts in one frame is twelve charts' worth of
 *   blocked main thread, and a board opens with all of them in view.
 * - **The caption.** `captionHead` / `captionFoot` put each chart's own title
 *   and source on its card, so a board reads as a page rather than as a grid of
 *   unlabelled plates.
 * - **The share link.** `encodeSpec` compresses any JSON, and a board is small
 *   JSON — ids, a title and a column count — so a board fits in a URL far more
 *   comfortably than a single chart's spec does. What it does *not* carry is
 *   the charts: a link opened on another browser names entries that browser
 *   does not have, and each missing card says so.
 */

import { getChart, newSpec } from './registry.js';
import { renderChart, destroyInstance, resizeInstance, renderLegend } from './engines.js';
import { listSaved, getSaved, whenSaved } from './shelf.js';
import { captionHead, captionFoot } from './caption.js';
import { mountThemeToggle, onThemeChange } from './theme.js';
import { escapeHtml } from './StudioApp.js';
import { prefetchLibraries } from './loader.js';
import { initMotion } from './motion.js';
import { toast } from './toast.js';
import { ask } from './confirm.js';
import { encodeSpec, decodeSpec } from './share.js';
import {
  readBoard, writeBoard, emptyBoard, normaliseBoard,
  boardStandalone, MAX_COLS, BOARD_LIMIT,
} from './board.js';

const $ = (sel, root = document) => root.querySelector(sel);

/** The gallery's budget, for the gallery's reason. */
const FRAME_BUDGET_MS = 8;

export class BoardApp {
  constructor() {
    this.state = emptyBoard();
    this.live = new Map();       // card index → chart instance
    this._pending = new Map();   // card index → host element
    this._pumping = false;

    this.headEl = $('#board-head');
    this.gridEl = $('#board-grid');

    mountThemeToggle($('#theme-mount'));
    initMotion();
    onThemeChange(() => this._renderCards());
    window.addEventListener('resize', () => this._onResize());

    this._boot();
  }

  /* ── state ─────────────────────────────────────────────────────────────── */

  async _boot() {
    const token = new URLSearchParams(location.search).get('b');
    const shared = token ? await decodeSpec(token) : null;
    if (token && !shared) toast('That board link could not be read', 'bad');
    this.state = shared ? normaliseBoard(shared) : readBoard();
    // A board arriving by link is this browser's board now, so it is kept —
    // otherwise a reload would drop back to whatever was here before it.
    if (shared) writeBoard(this.state);
    this.render();
    prefetchLibraries();
  }

  _save() { writeBoard(this.state); }

  /** Every saved chart this library can still draw, newest first. */
  _shelf() {
    return listSaved().filter((s) => !!getChart(s.chart));
  }

  add(shelfId) {
    if (!shelfId) return;
    if (this.state.items.length >= BOARD_LIMIT) {
      toast(`A board holds ${BOARD_LIMIT} charts — remove one first`, 'bad');
      return;
    }
    this.state.items.push({ shelfId });
    this._save();
    this.render();
  }

  remove(index) {
    if (index < 0 || index >= this.state.items.length) return;
    this.state.items.splice(index, 1);
    this._save();
    this.render();
  }

  move(index, delta) {
    const to = index + delta;
    if (index < 0 || index >= this.state.items.length) return;
    if (to < 0 || to >= this.state.items.length) return;
    const [row] = this.state.items.splice(index, 1);
    this.state.items.splice(to, 0, row);
    this._save();
    this.render();
  }

  setCols(n) {
    this.state.cols = Math.min(MAX_COLS, Math.max(1, Math.round(Number(n)) || 2));
    this._save();
    this.render();
  }

  /* ── render ────────────────────────────────────────────────────────────── */

  render() {
    this._renderHead();
    this._renderCards();
  }

  _renderHead() {
    const saved = this._shelf();
    const s = this.state;
    this.headEl.innerHTML =
      `<div class="board-titles">`
      + `<input id="board-title" class="board-title-input" type="text" placeholder="Untitled board"`
      + ` aria-label="Board title" value="${escapeHtml(s.title)}">`
      + `<input id="board-byline" class="board-byline-input" type="text" placeholder="Who made it, and when"`
      + ` aria-label="Board byline" value="${escapeHtml(s.byline)}">`
      + `</div>`
      + `<div class="board-tools">`
      + `<label class="board-pick-wrap">`
      + `<span class="board-pick-label">Add</span>`
      + `<select id="board-pick" class="board-pick" aria-label="A saved chart to add">`
      + (saved.length
        ? saved.map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.name || getChart(e.chart).title)}</option>`).join('')
        : `<option value="">No saved charts yet</option>`)
      + `</select>`
      + `</label>`
      + `<button class="btn btn-sm btn-primary" id="board-add" type="button"${saved.length ? '' : ' disabled'}>Add to board</button>`
      + `<label class="board-cols">Columns`
      + `<select id="board-cols" aria-label="Columns across">`
      + [1, 2, 3, 4].map((n) => `<option value="${n}"${n === s.cols ? ' selected' : ''}>${n}</option>`).join('')
      + `</select></label>`
      + `<button class="btn btn-sm" id="board-share" type="button" title="Copy a link that rebuilds this board">Share</button>`
      + `<button class="btn btn-sm" id="board-html" type="button" title="One HTML page holding every chart on this board">Download .html</button>`
      + `<button class="btn btn-sm" id="board-png" type="button">Export image</button>`
      + `<button class="btn btn-sm btn-ghost" id="board-clear" type="button">Clear</button>`
      + `</div>`;

    const title = $('#board-title', this.headEl);
    const byline = $('#board-byline', this.headEl);
    title.addEventListener('input', () => { this.state.title = title.value; this._save(); });
    byline.addEventListener('input', () => { this.state.byline = byline.value; this._save(); });

    const pick = $('#board-pick', this.headEl);
    $('#board-add', this.headEl)?.addEventListener('click', () => this.add(pick.value));
    $('#board-cols', this.headEl)?.addEventListener('change', (e) => this.setCols(e.target.value));
    $('#board-share', this.headEl)?.addEventListener('click', () => this._share());
    $('#board-html', this.headEl)?.addEventListener('click', () => this._downloadHtml());
    $('#board-png', this.headEl)?.addEventListener('click', () => this._exportImage());
    $('#board-clear', this.headEl)?.addEventListener('click', () => this._clear());
  }

  /**
   * The cards.
   *
   * Every instance is destroyed first: a re-render replaces every host, and a
   * chart still holding a node that has gone is the leak a grid of twelve
   * risks twelve times over — the rule `destroyInstance` recursing into facet
   * panels already records.
   */
  _renderCards() {
    this.live.forEach((inst) => destroyInstance(inst));
    this.live.clear();
    this._pending.clear();

    this.gridEl.style.setProperty('--oc-board-cols', String(this.state.cols));
    this.gridEl.classList.toggle('is-empty', !this.state.items.length);

    if (!this.state.items.length) {
      this.gridEl.innerHTML =
        `<div class="board-empty">`
        + `<p class="board-empty-lead">Nothing on this board yet.</p>`
        + `<p class="board-empty-help">Open a chart in the <a href="studio.html">studio</a>, press`
        + ` <b>Save</b> to keep it in <b>My charts</b>, then come back and add it above.`
        + ` Cards are independent: each one draws its own saved chart, and nothing here`
        + ` filters anything else.</p>`
        + `</div>`;
      return;
    }

    this.gridEl.innerHTML = this.state.items.map((item, i) => this._cardMarkup(item, i)).join('');

    this.gridEl.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.index);
        if (btn.dataset.act === 'up') this.move(i, -1);
        if (btn.dataset.act === 'down') this.move(i, 1);
        if (btn.dataset.act === 'remove') this.remove(i);
      });
    });

    this.state.items.forEach((item, i) => {
      const host = this.gridEl.querySelector(`#board-host-${i}`);
      if (host) this._queue(i, host);
    });
  }

  _cardMarkup(item, i) {
    const entry = getSaved(item.shelfId);
    const def = entry ? getChart(entry.chart) : null;
    const last = this.state.items.length - 1;
    const tools =
      `<span class="board-card-tools">`
      + `<button class="board-card-btn" type="button" data-act="up" data-index="${i}"`
      + `${i === 0 ? ' disabled' : ''} title="Move earlier" aria-label="Move earlier">↑</button>`
      + `<button class="board-card-btn" type="button" data-act="down" data-index="${i}"`
      + `${i === last ? ' disabled' : ''} title="Move later" aria-label="Move later">↓</button>`
      + `<button class="board-card-btn" type="button" data-act="remove" data-index="${i}"`
      + ` title="Take it off the board" aria-label="Remove from board">✕</button>`
      + `</span>`;

    // A card whose chart is no longer on this browser says so. Drawing an
    // example under somebody's own heading would be the quiet kind of wrong.
    if (!entry || !def) {
      return `<article class="board-card is-missing">`
        + `<header class="board-card-head"><span class="board-card-name">Missing chart</span>${tools}</header>`
        + `<p class="board-card-gone">This card names a saved chart that is not on this browser.`
        + ` A board travels as a list of names, not as the charts themselves.</p>`
        + `</article>`;
    }

    const name = entry.name || def.title;
    return `<article class="board-card">`
      + `<header class="board-card-head">`
      + `<span class="board-card-name">${escapeHtml(name)}</span>`
      + `<a class="board-card-open" href="studio.html?chart=${encodeURIComponent(entry.chart)}&saved=${encodeURIComponent(entry.id)}"`
      + ` title="Open this chart in the studio">Edit</a>`
      + tools
      + `</header>`
      + `<div class="board-card-body">`
      + `<div class="chart-caption" id="board-caphead-${i}"></div>`
      + `<div class="chart-host" id="board-host-${i}"></div>`
      + `<div class="chart-caption" id="board-capfoot-${i}"></div>`
      + `</div>`
      + `<div class="legend" id="board-legend-${i}"></div>`
      + `<p class="board-card-meta">${escapeHtml(def.title)} · ${escapeHtml(whenSaved(entry.updatedAt))}</p>`
      + `</article>`;
  }

  /* ── mounting, a frame at a time ───────────────────────────────────────── */

  _queue(index, host) {
    this._pending.set(index, host);
    this._pump();
  }

  /** How many cards are still waiting. For the suite, and for debugging. */
  pendingCount() { return this._pending.size; }

  _pump() {
    if (this._pumping || !this._pending.size) return;
    this._pumping = true;
    requestAnimationFrame(() => {
      this._pumping = false;
      const started = performance.now();
      for (const [index, host] of this._pending) {
        this._pending.delete(index);
        if (!host.isConnected || this.live.has(index)) continue;
        this._mount(index, host);
        if (performance.now() - started > FRAME_BUDGET_MS) break;
      }
      if (this._pending.size) this._pump();
    });
  }

  /** The chart a card holds: the saved spec over the chart's own defaults. */
  chartFor(index) {
    const item = this.state.items[index];
    const entry = item ? getSaved(item.shelfId) : null;
    const def = entry ? getChart(entry.chart) : null;
    if (!def) return null;
    // Merged over `newSpec` rather than replacing it — the rule a share link
    // and the shelf both follow, so a chart saved before its definition gained
    // an option still draws.
    const spec = { ...newSpec(def), ...entry.spec };
    if (typeof def.onChange === 'function') def.onChange(spec);
    return { def, spec, entry };
  }

  _mount(index, host) {
    const card = this.chartFor(index);
    if (!card) return;
    const inst = renderChart(card.def, host, card.spec);
    this.live.set(index, inst);

    const head = this.gridEl.querySelector(`#board-caphead-${index}`);
    const foot = this.gridEl.querySelector(`#board-capfoot-${index}`);
    if (head) head.innerHTML = captionHead(card.spec);
    if (foot) foot.innerHTML = captionFoot(card.spec);

    const legendEl = this.gridEl.querySelector(`#board-legend-${index}`);
    const items = card.def.legend ? card.def.legend(card.spec) : null;
    if (legendEl) renderLegend(legendEl, items, inst);
  }

  _onResize() {
    this.live.forEach((inst) => { if (inst && inst.redraw) resizeInstance(inst); });
  }

  /* ── out ───────────────────────────────────────────────────────────────── */

  /** Every card that can actually be drawn, in order. */
  cards() {
    return this.state.items
      .map((_, i) => this.chartFor(i))
      .filter(Boolean)
      .map((c) => ({ def: c.def, spec: c.spec, name: c.entry.name || c.def.title }));
  }

  standalone() {
    return boardStandalone(this.cards(), {
      title: this.state.title,
      byline: this.state.byline,
      cols: this.state.cols,
    });
  }

  async _share() {
    try {
      const token = await encodeSpec(this.state);
      const url = new URL(location.href);
      url.search = '';
      url.searchParams.set('b', token);
      await navigator.clipboard.writeText(url.toString());
      toast('Board link copied — it names your saved charts, so open it on this browser', 'ok', 4200);
    } catch {
      toast('Could not copy the link', 'bad');
    }
  }

  _downloadHtml() {
    const out = this.standalone();
    if (!out.charts) { toast('Nothing on the board to export', 'bad'); return; }
    download(new Blob([out.html], { type: 'text/html' }), 'opencharts-board.html');
    toast(out.skipped.length
      ? `Board exported — ${out.charts} charts, ${out.skipped.length} could not be generated`
      : `Board exported — ${out.charts} charts, ${out.libraries.length} librar${out.libraries.length === 1 ? 'y' : 'ies'}`,
    'ok', 4200);
  }

  async _clear() {
    if (!this.state.items.length) return;
    const yes = await ask({
      title: 'Clear this board?',
      text: 'The charts stay in My charts — only the board is emptied.',
      tone: 'warn',
      confirm: 'Clear it',
      cancel: 'Keep it',
    });
    if (!yes) return;
    this.state = { ...this.state, items: [] };
    this._save();
    this.render();
  }

  _exportImage() {
    const out = this.composite();
    if (!out) return;
    if (out.kind === 'png') {
      download(dataUrlToBlob(out.canvas.toDataURL('image/png')), 'opencharts-board.png');
      toast(`PNG exported — ${out.cards} charts`, 'ok');
      return;
    }
    download(new Blob([new XMLSerializer().serializeToString(out.svg)], { type: 'image/svg+xml' }),
      'opencharts-board.svg');
    toast(`SVG exported — ${out.cards} charts`, 'ok');
  }

  /**
   * A picture of the whole board, laid out from the boxes on screen.
   *
   * The same rule `StudioApp._exportGrid` follows: `querySelector('canvas')`
   * would find card one and hand over a picture of a twelfth of the page with
   * nothing saying so. A board of canvases becomes a PNG, a board of SVGs an
   * SVG, and a mixture says so rather than silently losing half of itself.
   *
   * Separate from the download so the suite can measure what was composited
   * rather than a file it cannot open.
   */
  composite() {
    const cards = [...this.gridEl.querySelectorAll('.board-card')];
    if (!cards.length) { toast('Nothing on the board yet', 'bad'); return null; }

    const box = this.gridEl.getBoundingClientRect();
    const pad = 18;
    const style = getComputedStyle(document.body);
    const paper = style.getPropertyValue('--surface').trim() || '#ffffff';
    const ink = style.getPropertyValue('--ink').trim() || '#0f172a';
    const W = box.width + pad * 2;
    const H = box.height + pad * 2;
    const at = (r) => ({ x: r.left - box.left + pad, y: r.top - box.top + pad });
    const nameOf = (c) => {
      const n = c.querySelector('.board-card-name');
      return n ? n.textContent : '';
    };

    const canvases = cards.map((c) => c.querySelector('canvas'));
    if (canvases.every(Boolean)) {
      const dpr = window.devicePixelRatio || 1;
      const out = document.createElement('canvas');
      out.width = Math.round(W * dpr);
      out.height = Math.round(H * dpr);
      const ctx = out.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, W, H);
      cards.forEach((card, i) => {
        const label = card.querySelector('.board-card-name');
        if (label) {
          const p = at(label.getBoundingClientRect());
          ctx.fillStyle = ink;
          ctx.font = '600 12.5px system-ui, sans-serif';
          ctx.textBaseline = 'top';
          ctx.fillText(nameOf(card), p.x, p.y);
        }
        const c = canvases[i];
        const r = c.getBoundingClientRect();
        const p = at(r);
        ctx.drawImage(c, p.x, p.y, r.width, r.height);
      });
      return { kind: 'png', canvas: out, cards: cards.length, width: W, height: H };
    }

    const svgs = cards.map((c) => c.querySelector('svg'));
    if (svgs.every(Boolean)) {
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
      cards.forEach((card, i) => {
        const r = svgs[i].getBoundingClientRect();
        const p = at(r);
        const clone = svgs[i].cloneNode(true);
        clone.setAttribute('x', String(Math.round(p.x)));
        clone.setAttribute('y', String(Math.round(p.y)));
        clone.setAttribute('width', String(Math.round(r.width)));
        clone.setAttribute('height', String(Math.round(r.height)));
        out.appendChild(clone);
      });
      return { kind: 'svg', svg: out, cards: cards.length, width: W, height: H };
    }

    toast('This board mixes canvas and SVG charts — download the .html instead', 'bad', 4200);
    return null;
  }
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function dataUrlToBlob(url) {
  const [head, body] = url.split(',');
  const bytes = atob(body);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i);
  return new Blob([out], { type: (head.match(/:(.*?);/) || [])[1] || 'application/octet-stream' });
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
