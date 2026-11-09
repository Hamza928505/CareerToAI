// The Mail page: the e-mails your checks found something in, read from the local editor server (GET /__editor/mail/log).
// Nothing here is built into the site. Everything that came from an e-mail (company text, subject, sender, the e-mail's own words)
// is put on the page with textContent only, never as HTML.

import Swal from './sweetalert2.esm.min.js';
import { initMailCheck } from './workspace-mail.js';

const KINDS = {
  interview: { label: 'Interview', plural: 'interviews', icon: 'fa-calendar-check' },
  assessment: { label: 'Test', plural: 'tests', icon: 'fa-laptop-code' },
  request: { label: 'Request for files', plural: 'requests for files', icon: 'fa-paperclip' },
  offer: { label: 'Offer', plural: 'offers', icon: 'fa-trophy' },
  rejection: { label: 'Rejection', plural: 'rejections', icon: 'fa-ban' },
  acknowledged: { label: 'Received', plural: 'received', icon: 'fa-circle-check' },
};
const SHOWN = ['all', 'interview', 'assessment', 'request', 'offer', 'rejection', 'acknowledged'];
const DECISION = {
  applied: { label: 'In your tracker', tone: 'ok' },
  skipped: { label: 'You skipped it', tone: 'muted' },
  stale: { label: 'Row had changed', tone: 'warn' },
  kept: { label: 'Not in your tracker', tone: 'muted' },
};

const $ = (sel, root = document) => root.querySelector(sel);
const root = $('.mailbox');
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const icon = (name, style = 'solid') => { const i = el('i'); i.className = `fa-${style} ${name}`; i.setAttribute('aria-hidden', 'true'); return i; };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// --- dates ---------------------------------------------------------------------------------------------------------
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (iso) => Math.round((new Date(`${iso}T00:00:00`) - midnight(new Date())) / 864e5);
const valid = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso || '');
/** "in 6 days", "tomorrow", "today", "3 days overdue" (an interview that has passed is "3 days ago"). */
function when(iso, kind) {
  const n = dayDiff(iso);
  if (n > 1) return `in ${n} days`;
  if (n === 1) return 'tomorrow';
  if (n === 0) return 'today';
  if (n === -1) return kind === 'interview' ? 'yesterday' : '1 day overdue';
  return kind === 'interview' ? `${-n} days ago` : `${-n} days overdue`;
}
function ago(iso) {
  if (!valid(iso)) return '';
  const n = -dayDiff(iso);
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 14) return `${n}d ago`;
  if (n < 60) return `${Math.round(n / 7)}w ago`;
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
/** The short tag on a list row: "in 4 days" for an interview, "due tomorrow" or "2 days overdue" for something to send. */
const dueWord = (iso, kind) => (kind === 'interview' || dayDiff(iso) < 0 ? when(iso, kind) : `due ${when(iso, kind)}`);
const urgency = (iso, kind) => (kind !== 'interview' && dayDiff(iso) < 0 ? 'overdue' : dayDiff(iso) <= 2 ? 'soon' : 'later');
const longDate = (iso) => (valid(iso) ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : 'date not shown');

// --- the data ------------------------------------------------------------------------------------------------------
const state = { entries: [], kind: 'all', q: '', selected: -1 };
const hasKind = (entry, kind) => kind === 'all' || entry.signal === kind || (kind === 'request' && Boolean(entry.ask)); // an interview that also asked for files counts as a request too
const matches = (entry, q) => !q || [entry.company, entry.position, entry.subject, entry.sender, entry.detail, entry.text, entry.ask?.detail, entry.ask?.text].join('\n').toLowerCase().includes(q);
const visible = () => state.entries.filter((entry) => hasKind(entry, state.kind) && matches(entry, state.q.trim().toLowerCase()));
const count = (kind) => state.entries.filter((entry) => hasKind(entry, kind)).length;

const initials = (name) => (String(name).match(/[\p{L}\p{N}]+/gu) || ['?']).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
const hue = (name) => [...String(name)].reduce((sum, char) => (sum * 31 + char.codePointAt(0)) % 360, 7);
const kindOf = (entry) => KINDS[entry.signal] ? entry.signal : 'acknowledged';

function chip(kind) {
  const info = KINDS[kind];
  const node = el('span', undefined, `mb-chip mb-k-${kind}`);
  node.append(icon(info.icon), document.createTextNode(info.label));
  return node;
}
const decisionChip = (entry) => { const info = DECISION[entry.decision]; return info ? el('span', info.label, `mb-decision mb-d-${info.tone}`) : null; };

// --- the hero ------------------------------------------------------------------------------------------------------
function renderHero() {
  for (const node of root.querySelectorAll('[data-count]')) node.textContent = String(count(node.dataset.count));
  const logged = state.entries.map((entry) => entry.logged).filter(valid).sort().at(-1);
  $('#mail-summary').textContent = state.entries.length
    ? `${plural(state.entries.length, 'e-mail')} kept${logged ? `, the last check was ${longDate(logged)}` : ''}. They stay on this computer and are never published.`
    : '';
  for (const tile of root.querySelectorAll('.mb-tile')) tile.setAttribute('aria-pressed', String(state.kind === tile.dataset.kind));
}

// --- what employers are waiting for ---------------------------------------------------------------------------------
/** Requests and tests with a deadline (a missed one up to 30 days back) and interviews still to come, soonest first. */
function renderTodo() {
  const items = [];
  state.entries.forEach((entry, index) => {
    if (entry.decision === 'skipped') return;
    const parts = [{ kind: kindOf(entry), detail: entry.detail, due: entry.due }];
    if (entry.ask) parts.push({ kind: 'request', detail: entry.ask.detail, due: entry.ask.due });
    for (const part of parts) {
      if (!valid(part.due)) continue;
      const n = dayDiff(part.due);
      if (part.kind === 'interview' ? n < 0 : !['request', 'assessment'].includes(part.kind) || n < -30) continue;
      items.push({ ...part, index, n, company: entry.company });
    }
  });
  items.sort((a, b) => a.n - b.n);
  const list = $('#todo-list');
  list.replaceChildren();
  $('#mail-todo').hidden = !items.length;
  for (const item of items.slice(0, 8)) {
    const row = el('li');
    const button = el('button', undefined, `mb-due mb-k-${item.kind}`);
    button.type = 'button';
    button.dataset.urgency = item.n < 0 ? 'overdue' : item.n <= 2 ? 'soon' : 'later';
    const mark = el('span', undefined, 'mb-due-icon'); mark.append(icon(KINDS[item.kind].icon));
    const text = el('span', undefined, 'mb-due-text');
    text.append(el('strong', item.detail || KINDS[item.kind].label), el('span', item.company, 'mb-due-company'), el('span', `${item.kind === 'interview' ? 'On' : 'By'} ${longDate(item.due)} · ${when(item.due, item.kind)}`, 'mb-when'));
    button.append(mark, text);
    button.addEventListener('click', () => { // show everything so the e-mail is in the list, then open it
      state.kind = 'all'; state.q = ''; $('#mail-q').value = ''; state.selected = item.index;
      render();
      toReader();
    });
    row.append(button);
    list.append(row);
  }
  if (items.length > 8) { const more = el('li', `and ${items.length - 8} more`, 'mb-more'); list.append(more); }
}

// --- the list ------------------------------------------------------------------------------------------------------
function renderPills() {
  const box = $('#mail-pills');
  box.replaceChildren();
  for (const kind of SHOWN) {
    const button = el('button', undefined, `mb-pill${kind === 'all' ? '' : ` mb-k-${kind}`}`);
    button.type = 'button'; button.dataset.kind = kind;
    button.setAttribute('aria-pressed', String(state.kind === kind));
    button.append(el('span', kind === 'all' ? 'All' : KINDS[kind].label), el('small', String(kind === 'all' ? state.entries.length : count(kind))));
    button.addEventListener('click', () => setKind(kind));
    box.append(button);
  }
}

function renderList() {
  const list = $('#mail-list');
  const shown = visible();
  list.replaceChildren();
  shown.forEach((entry, i) => {
    const index = state.entries.indexOf(entry);
    const kind = kindOf(entry);
    const item = el('li');
    const row = el('button', undefined, `mb-row mb-k-${kind}${entry.decision === 'skipped' ? ' is-skipped' : ''}`);
    row.type = 'button'; row.dataset.index = String(index);
    row.style.setProperty('--i', String(i));
    row.setAttribute('aria-current', String(index === state.selected));
    const avatar = el('span', initials(entry.company), 'mb-avatar');
    avatar.style.setProperty('--h', String(hue(entry.company)));
    const body = el('span', undefined, 'mb-row-body');
    const top = el('span', undefined, 'mb-row-top');
    top.append(el('strong', entry.company), el('time', ago(entry.date || entry.logged), 'mb-time'));
    const tags = el('span', undefined, 'mb-row-tags');
    tags.append(chip(kind));
    if (entry.ask) tags.append(chip('request'));
    if (valid(entry.due)) { const tag = el('span', dueWord(entry.due, kind), 'mb-tag-due'); tag.dataset.urgency = urgency(entry.due, kind); tags.append(tag); }
    body.append(top, el('span', entry.subject || 'No subject', 'mb-row-sub'), tags);
    row.append(avatar, body);
    row.addEventListener('click', () => select(index, matchMedia('(max-width: 860px)').matches)); // on a phone the reader sits below the list
    item.append(row);
    list.append(item);
  });
  const none = !state.entries.length;
  $('#mail-split').hidden = none;
  $('#mail-empty').hidden = !none;
  $('.mb-bar').hidden = none;
  if (!none && !shown.length) { const miss = el('li', 'No e-mail matches. Clear the search or pick All.', 'mb-nomatch'); list.append(miss); }
}

function setKind(kind) {
  state.kind = state.kind === kind ? 'all' : kind; // pressing the active one again shows everything
  render();
}

const toReader = () => $('#mail-reader').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });

function select(index, scroll) {
  state.selected = index;
  for (const row of root.querySelectorAll('.mb-row')) row.setAttribute('aria-current', String(Number(row.dataset.index) === index));
  renderReader();
  if (scroll) toReader();
}

// --- the reader ----------------------------------------------------------------------------------------------------
/** The e-mail's text, with the sentence the check relied on marked. If the sentence differs in punctuation, it is shown above instead. */
function paper(text, evidence) {
  const box = el('div', undefined, 'mb-paper');
  box.tabIndex = 0; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'The e-mail');
  const words = String(evidence || '').trim().split(/\s+/).filter(Boolean).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const found = words.length ? new RegExp(words.join('\\s+'), 'i').exec(text) : null;
  if (!found) { box.textContent = text; return { box, quoted: false }; }
  box.append(document.createTextNode(text.slice(0, found.index)), el('mark', found[0]), document.createTextNode(text.slice(found.index + found[0].length)));
  return { box, quoted: true };
}

function mailSection(part, entry, { main }) {
  const kind = part.kind;
  const section = el('section', undefined, `mb-mail mb-k-${kind}`);
  const head = el('header', undefined, 'mb-mail-head');
  const tags = el('div', undefined, 'mb-row-tags');
  tags.append(chip(kind));
  if (main) { const d = decisionChip(entry); if (d) tags.append(d); } else tags.append(el('span', 'came with the same reply', 'mb-decision mb-d-muted'));
  head.append(tags, el(main ? 'h3' : 'h4', part.subject || 'No subject'));
  const meta = el('p', undefined, 'mb-meta');
  const add = (name, text) => { const span = el('span'); span.append(icon(name), document.createTextNode(` ${text}`)); meta.append(span); };
  if (part.sender) add('fa-at', part.sender);
  add('fa-calendar-day', longDate(part.date));
  if (main && entry.logged) add('fa-box-archive', `kept ${entry.logged}`);
  head.append(meta);
  section.append(head);

  if (part.detail || valid(part.due)) {
    const ask = el('div', undefined, 'mb-ask');
    ask.append(el('small', kind === 'interview' ? 'The invitation' : kind === 'assessment' ? 'The test' : 'What they asked for'));
    if (part.detail) ask.append(el('strong', part.detail));
    if (valid(part.due)) ask.append(el('span', `${kind === 'interview' ? 'On' : 'By'} ${longDate(part.due)} · ${when(part.due, kind)}`, `mb-when${dayDiff(part.due) < 0 && kind !== 'interview' ? ' is-late' : ''}`));
    section.append(ask);
  }
  if (part.text) {
    const { box, quoted } = paper(part.text, part.evidence);
    if (part.evidence && !quoted) section.append(el('blockquote', part.evidence, 'mb-quote'));
    section.append(box);
  } else {
    section.append(el('p', 'The text of this e-mail was not kept.', 'mb-note'));
  }
  return section;
}

function renderReader() {
  const reader = $('#mail-reader');
  const entry = state.entries[state.selected];
  reader.replaceChildren();
  if (!entry) {
    const empty = el('div', undefined, 'mb-placeholder');
    empty.append(icon('fa-envelope-open', 'regular'), el('p', 'Pick an e-mail to read it here.'));
    reader.append(empty);
    return;
  }
  const kind = kindOf(entry);
  const top = el('div', undefined, 'mb-reader-top');
  const avatar = el('span', initials(entry.company), 'mb-avatar mb-avatar-lg'); avatar.style.setProperty('--h', String(hue(entry.company)));
  const who = el('div');
  who.append(el('strong', entry.company), el('span', `${entry.position || 'Application'} · ${entry.untracked ? 'not in your tracker' : `${entry.decision === 'skipped' ? 'proposed, not applied' : 'tracker row'}: ${entry.from}${entry.to && entry.to !== entry.from ? ` → ${entry.to}` : ''}`}`, 'mb-position'));
  const link = el('a', 'Open the board', 'gb-btn gb-btn-sm'); link.href = `${root.dataset.workspace}#flow-review`;
  link.prepend(icon('fa-table-list'));
  top.append(avatar, who, link);
  reader.append(top);
  reader.append(mailSection({ kind, subject: entry.subject, sender: entry.sender, date: entry.date, detail: entry.detail, due: entry.due, evidence: entry.evidence, text: entry.text }, entry, { main: true }));
  if (entry.ask) reader.append(mailSection({ kind: 'request', subject: entry.ask.subject, sender: '', date: entry.ask.date, detail: entry.ask.detail, due: entry.ask.due, evidence: entry.ask.evidence, text: entry.ask.text }, entry, { main: false }));
}

// --- wiring --------------------------------------------------------------------------------------------------------
function render() {
  renderHero();
  renderPills();
  renderList();
  renderTodo();
  const shown = visible();
  if (!shown.includes(state.entries[state.selected])) state.selected = shown.length ? state.entries.indexOf(shown[0]) : -1;
  for (const row of root.querySelectorAll('.mb-row')) row.setAttribute('aria-current', String(Number(row.dataset.index) === state.selected));
  renderReader();
}

root.querySelectorAll('.mb-tile').forEach((tile) => tile.addEventListener('click', () => setKind(tile.dataset.kind)));
$('#mail-q').addEventListener('input', (event) => { state.q = event.target.value; render(); });
$('#mail-list').addEventListener('keydown', (event) => { // arrow keys walk the list like an inbox
  if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
  const rows = [...root.querySelectorAll('.mb-row')];
  const next = rows[rows.indexOf(document.activeElement) + (event.key === 'ArrowDown' ? 1 : -1)];
  if (!next) return;
  event.preventDefault();
  next.focus();
  select(Number(next.dataset.index), false);
});

// --- Check my email, right here ------------------------------------------------------------------------------------
// The same reader choice, review and approval as on the board (workspace-mail.js). After applying, the inbox reloads.
const dialog = { buttonsStyling: false, customClass: { popup: 'swal-popup', title: 'swal-title', htmlContainer: 'swal-html', confirmButton: 'btn btn-primary', cancelButton: 'btn', denyButton: 'btn btn-danger' } };
async function request(route, payload) {
  const response = await fetch(new URL(`/__editor/${route}`, location.origin), payload === undefined ? { cache: 'no-store' } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('The local editor returned an unreadable response. Restart npm run editor and retry.'); }
  if (!response.ok) throw new Error(data.error || 'The local editor could not complete the request.');
  return data;
}
initMailCheck({ request, save: async () => {}, reload: () => load(), Swal, dialog }); // nothing to save on this page: the tracker is not edited here

async function load() {
  try {
    const res = await fetch(new URL('/__editor/mail/log', location.origin), { cache: 'no-store' });
    if (!res.ok) throw new Error('no editor server');
    const data = await res.json();
    $('#btn-check-mail').disabled = false;
    state.entries = Array.isArray(data.entries) ? data.entries.toSorted((a, b) => String(b.date || b.logged).localeCompare(String(a.date || a.logged))) : []; // by the e-mail's own date, newest first
  } catch {
    $('#mail-offline').hidden = false;
    $('#mail-empty-title').textContent = 'Nothing to show here';
    $('#mail-empty-text').textContent = 'This page reads the e-mails kept on your computer through the editor server, which is not running.';
  }
  render();
  setTimeout(() => $('#mail-list').classList.add('is-still'), 1000); // the rows slide in once (0.45 s + up to 12 x 35 ms); filtering and typing must not replay it
}
load();
