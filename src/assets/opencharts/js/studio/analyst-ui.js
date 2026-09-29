/**
 * analyst-ui.js — the panel the AI Analyst answers into.
 *
 * `analyst.js` holds the brief, the call and the parse, and knows nothing about
 * the page; this is the panel, the way `palette-ui.js` is `cvd.js`'s. It is a
 * code-panel view rather than a sidebar control because what it produces is a
 * *spec*, which is what the two tabs either side of it print — and because the
 * answer lands through `_applySpec`, the same door a pasted spec uses.
 *
 * The half-written request lives in a `WeakMap` keyed by the spec object, for
 * the reason `colourby.js` records: the code panel is re-mounted on every
 * rebuild — a colour picked, a value typed anywhere — and a sentence that
 * vanished on each keystroke would be unusable. It goes with the spec when a
 * chart is switched or an undo replaces it, which is the right lifetime: a
 * request about one table is not a request about another.
 */

import { askAnalyst, diffSummary } from './analyst.js';
import { openAiConfigDialog, getAiSettings } from './ai-config.js';
import { highlight } from './highlight.js';
import { toast } from './toast.js';

const pending = new WeakMap();

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

function stateFor(spec) {
  let s = pending.get(spec);
  if (!s) {
    s = { request: '', status: '', tone: '', answer: null, raw: '', busy: false, node: null, controller: null };
    pending.set(spec, s);
  }
  return s;
}

/**
 * @param {object} def
 * @param {object} spec
 * @param {{ onApply: (parsed: object) => { ok: boolean, message: string } }} opts
 * @returns {HTMLElement}
 */
export function analystPanel(def, spec, { onApply } = {}) {
  const state = stateFor(spec);
  const root = el('div', 'analyst');
  // Which node is on screen right now. A handler bound to *this* panel outlives
  // the panel — the Ask button repaints once to say "Asking…", so by the time
  // the answer lands the node it closed over has already been replaced, and a
  // repaint against that node would paint into nothing. The state knows what is
  // mounted; the closure cannot.
  state.node = root;

  const repaint = () => {
    const current = state.node;
    if (!current || !current.parentNode) return;
    current.replaceWith(analystPanel(def, spec, { onApply }));
  };

  root.appendChild(el('p', 'analyst-lead',
    'Say what you want this chart to show, then ask your signed-in agent to process the pending '
    + 'OpenCharts request. Your table and message go through the local MCP bridge; its answer appears here for review.'));

  const box = el('textarea', 'analyst-input');
  box.placeholder = 'revenue by region, and highlight the North';
  box.setAttribute('aria-label', 'What you want the chart to show');
  box.spellcheck = false;
  box.value = state.request;
  box.addEventListener('input', () => { state.request = box.value; });
  root.appendChild(box);

  const row = el('div', 'analyst-row');
  const ask = el('button', 'btn btn-sm btn-primary', state.busy ? 'Asking…' : 'Ask');
  ask.type = 'button';
  ask.disabled = state.busy;
  const settings = el('button', 'btn btn-sm', 'Connect agent');
  settings.type = 'button';
  settings.addEventListener('click', async () => { await openAiConfigDialog(); repaint(); });
  row.append(ask, settings);
  if (state.busy) {
    const stop = el('button', 'btn btn-sm', 'Stop');
    stop.type = 'button';
    stop.addEventListener('click', () => state.controller?.abort());
    row.appendChild(stop);
  }
  root.appendChild(row);

  const status = el('p', 'analyst-status' + (state.tone ? ' is-' + state.tone : ''), state.status);
  if (!state.status) status.hidden = true;
  root.appendChild(status);

  // A reply that was not a spec keeps the chart and shows what came back, so
  // it can be read rather than guessed at.
  if (state.raw && !state.answer) {
    const raw = el('pre', 'analyst-raw', state.raw);
    root.appendChild(raw);
  }

  if (state.answer) {
    const summary = el('p', 'analyst-diff', `Applying this ${diffSummary(def, spec, state.answer)}.`);
    root.appendChild(summary);

    const source = JSON.stringify(state.answer, null, 2);
    const pre = el('pre', 'analyst-preview');
    pre.innerHTML = highlight(source, 'js');
    root.appendChild(pre);

    const foot = el('div', 'analyst-row');
    const apply = el('button', 'btn btn-sm btn-primary', 'Apply');
    apply.type = 'button';
    apply.addEventListener('click', () => {
      // The one door in. `_applySpec` merges over `newSpec`, opens another
      // chart when the id differs, and banks an undo step — so nothing here
      // reaches past it into the studio's state.
      const res = onApply ? onApply(state.answer) : { ok: false, message: 'Nothing to apply to.' };
      if (!res || !res.ok) { toast((res && res.message) || 'That spec could not be applied.', 'bad'); return; }
      state.answer = null;
      state.raw = '';
      state.status = res.message || 'Applied';
      state.tone = 'ok';
      toast(res.message || 'Applied', 'ok');
      repaint();
    });
    const discard = el('button', 'btn btn-sm btn-ghost', 'Discard');
    discard.type = 'button';
    discard.addEventListener('click', () => {
      state.answer = null;
      state.raw = '';
      state.status = 'Discarded — the chart is as it was.';
      state.tone = '';
      repaint();
    });
    foot.append(apply, discard);
    root.appendChild(foot);
  }

  ask.addEventListener('click', async () => {
    state.request = box.value;
    if (!state.request.trim()) {
      state.status = 'Say what you want the chart to show.';
      state.tone = 'bad';
      repaint();
      return;
    }
    state.busy = true;
    state.answer = null;
    state.raw = '';
    state.status = 'Sending to your local agent connection…';
    state.controller = new AbortController();
    state.tone = '';
    repaint();

    let res;
    try {
      res = await askAnalyst({ def, spec, request: state.request, signal: state.controller.signal,
        onStatus: (message) => { state.status = message; repaint(); },
      });
    } catch (error) {
      res = { ok: false, error: state.controller.signal.aborted ? 'Request stopped. Your message is kept; send it again when ready.' : error.message };
    }
    state.controller = null;
    state.busy = false;
    if (res.ok) {
      state.answer = res.answer;
      state.raw = '';
      state.status = 'An answer came back. Read it, then Apply or Discard.';
      state.tone = 'ok';
    } else {
      state.answer = null;
      state.raw = res.raw || '';
      state.status = res.error;
      state.tone = 'bad';
    }
    repaint();
  });

  // Give setup guidance before the reader starts an analysis request.
  getAiSettings().then((settings) => {
    if (settings || state.status || !root.isConnected || state.node !== root) return;
    const note = el('p', 'analyst-status is-bad',
      'No agent is paired with this tab. Use Connect agent to link Codex, Claude Code or another MCP client signed in on your device.');
    root.insertBefore(note, row.nextSibling);
    status.hidden = true;
  }).catch(() => { /* storage refused; the Ask button says so instead */ });

  return root;
}
