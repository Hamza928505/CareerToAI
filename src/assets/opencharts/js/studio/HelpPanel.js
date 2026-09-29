/**
 * HelpPanel.js — "how to read this, and how to change it".
 *
 * A chart type is a visual grammar, and nobody is fluent in all ninety-seven.
 * This says what the marks encode and how this particular chart misleads, then
 * spells out the three-step loop for changing it.
 *
 * Collapsed by default and remembered, so it is there the first time and out
 * of the way afterwards.
 */

import { helpFor } from './chart-help.js';
import { engineOf, ENGINE_LABEL } from './engines.js';

const KEY = 'opencharts.help-open';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

function readOpen() {
  try {
    const v = localStorage.getItem(KEY);
    // Open on a first visit: the help is most useful before you know it exists.
    return v === null ? true : v === '1';
  } catch { return true; }
}

function writeOpen(open) {
  try { localStorage.setItem(KEY, open ? '1' : '0'); } catch { /* private mode */ }
}

/**
 * @param {HTMLElement} container the <section class="help"> element
 * @param {object} def   chart definition
 * @param {object} spec  live spec, for counting what is currently shown
 * @param {Function} onEditData opens the full data editor
 */
export function renderHelp(container, def, spec, onEditData) {
  container.innerHTML = '';
  const help = helpFor(def);
  const open = readOpen();

  container.dataset.open = String(open);

  /* ── header ─────────────────────────────────────────────────────────── */
  const head = el('button', 'help-head');
  head.type = 'button';
  head.setAttribute('aria-expanded', String(open));
  head.innerHTML =
    '<span class="help-caret" aria-hidden="true">'
    + '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 2l3.5 3-3.5 3"/></svg>'
    + '</span>'
    + '<span class="help-title">How to read this chart</span>';
  const hint = el('span', 'help-hint', open ? 'hide' : 'show');
  head.appendChild(hint);

  const body = el('div', 'help-body');
  const inner = el('div', 'help-inner');

  /* ── reading it ─────────────────────────────────────────────────────── */
  if (help) {
    const readBlock = el('div', 'help-block');
    readBlock.appendChild(el('div', 'help-label', 'Reading it'));
    readBlock.appendChild(el('p', 'help-text', help.read));
    inner.appendChild(readBlock);

    const watchBlock = el('div', 'help-block help-watch');
    watchBlock.appendChild(el('div', 'help-label', 'Watch out for'));
    watchBlock.appendChild(el('p', 'help-text', help.watch));
    inner.appendChild(watchBlock);
  }

  /* ── changing it ────────────────────────────────────────────────────── */
  const steps = el('div', 'help-block');
  steps.appendChild(el('div', 'help-label', 'Changing it'));
  const ol = el('ol', 'help-steps');

  const stepData = el('li');
  // Name the way in that suits this chart: a map is far quicker to fill from
  // the place list than by typing coordinates.
  const picker = (def.data || {}).picker;
  stepData.innerHTML = '<strong>Your data</strong> — ' + (
    picker === 'cities'
      ? 'pick cities from the list and type a value for each, or fill the table in yourself. '
      : picker === 'countries'
        ? 'pick countries from the list and type a value for each, or fill the table in yourself. '
        : 'fill in the table, or paste one straight from a spreadsheet. '
  );
  const editLink = el('button', 'help-link', 'Open the editor');
  editLink.type = 'button';
  editLink.addEventListener('click', (e) => { e.stopPropagation(); onEditData(); });
  stepData.appendChild(editLink);
  ol.appendChild(stepData);

  const stepStyle = el('li');
  stepStyle.innerHTML =
    '<strong>The controls below it</strong> — colours, scale and options. '
    + 'Every change redraws the chart and rewrites the code immediately.';
  ol.appendChild(stepStyle);

  const stepCode = el('li');
  stepCode.innerHTML =
    '<strong>Take the code</strong> — <em>HTML</em>, <em>CSS</em> and <em>JS</em> to drop into a page you already have, '
    + 'or <em>Standalone</em> for a single file that runs on its own.';
  ol.appendChild(stepCode);

  // The way round for a reader who would rather not fill the table in at all.
  // It is a fourth step because it replaces the first three, not because it
  // follows them.
  const stepPrompt = el('li');
  stepPrompt.innerHTML =
    '<strong>Or let an AI do it</strong> — hit <em>Prompt</em> above the chart, attach your '
    + 'own spreadsheet, and it comes back as this chart with your numbers in it. '
    + 'The <em>AI Prompt</em> tab below shows what gets copied.';
  ol.appendChild(stepPrompt);

  steps.appendChild(ol);
  inner.appendChild(steps);

  /* ── what this particular chart is showing right now ────────────────── */
  const facts = el('div', 'help-facts');
  const engine = engineOf(def);
  const seriesCount = (spec.series || spec.groups || spec.rows || spec.items || []).length;
  const pointCount = (spec.labels || spec.values || []).length;

  const addFact = (label, value) => {
    if (!value) return;
    const f = el('span', 'help-fact');
    f.appendChild(el('span', 'help-fact-label', label));
    f.appendChild(el('span', 'help-fact-value', String(value)));
    facts.appendChild(f);
  };
  addFact('Drawn with', ENGINE_LABEL[engine]);
  if (seriesCount) addFact(seriesCount === 1 ? 'Series' : 'Series', seriesCount);
  if (pointCount) addFact('Points', pointCount);
  if (facts.children.length) inner.appendChild(facts);

  body.appendChild(inner);
  container.append(head, body);

  head.addEventListener('click', () => {
    const next = container.dataset.open !== 'true';
    container.dataset.open = String(next);
    head.setAttribute('aria-expanded', String(next));
    hint.textContent = next ? 'hide' : 'show';
    writeOpen(next);
  });
}
