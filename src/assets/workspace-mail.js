// The "Check my email" button of the board's hero.
//
// Choose who reads (Claude through the Gmail connector, Gemini through the agy terminal command, or Gemini through its API), the server reads the mail and proposes status changes, and
// nothing reaches the workbook until the student ticks and applies them here. Everything that came from an e-mail (company text,
// subject, sender, quoted sentence) is put on the page with textContent only, never as HTML. The reading runs in the background:
// its progress is a card in the top-right corner (task-tray.js), and the page stays usable until the student opens the review.

import { startTask } from './task-tray.js';

const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const NAMES = { acknowledged: ['application received', 'applications received'], interview: ['interview', 'interviews'], assessment: ['test', 'tests'], request: ['request for files or information', 'requests for files or information'], offer: ['offer', 'offers'], rejection: ['rejection', 'rejections'] };
// "2 interviews, 1 rejection": only the kinds that occurred, in the order a search usually runs.
const countLine = (counts = {}) => Object.entries(NAMES).filter(([signal]) => counts[signal]).map(([signal, [one, many]]) => `${counts[signal]} ${counts[signal] === 1 ? one : many}`).join(', ');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// The e-mail's own words, folded away until asked for. They come from outside, so textContent only. Kept outside the tick's <label>: a click on the summary must not untick it.
const mailText = (label, text) => {
  if (!text) return null;
  const box = el('details', undefined, 'mail-text');
  box.append(el('summary', label), el('pre', text));
  return box;
};
const taskLine = (item) => (item.detail || item.due ? el('span', `${item.detail || ''}${item.due ? `${item.detail ? ' · ' : ''}${item.signal === 'interview' ? 'on' : 'by'} ${item.due}` : ''}`, 'mail-detail') : null);
const remember = (value) => { try { localStorage.setItem('mail-reader', value); } catch { /* private window: no memory, still works */ } };
const remembered = () => { try { return localStorage.getItem('mail-reader') || ''; } catch { return ''; } };

export function initMailCheck({ request, save, reload, Swal, dialog }) {
  const button = document.getElementById('btn-check-mail');
  if (!button) return;

  // Step 1: who reads. Resolves to { reader, confirmed } or null. "confirmed" is the notice that goes with the reader (Gemini only).
  async function chooseReader(info) {
    const mailToken = 'run  node scripts/gmail-auth.mjs --read  in a terminal and allow the read-only permission';
    const options = [
      { value: 'claude', name: 'Claude', problems: [], notice: '',
        about: 'Reads through the Gmail connector of your Claude account (claude.ai, Settings, Connectors). Needs Claude Code signed in with that account. Nothing to set up here.' },
      { value: 'agy', name: 'Gemini · Pro subscription (agy)', notice: '',
        about: 'Runs Gemini through your Google AI Pro subscription with the agy command in a terminal. No API key. Reads your mail with a read-only Gmail permission of its own.',
        problems: [!info.agy.found && 'install agy (the Antigravity CLI)', info.agy.found && !info.agy.signedIn && 'sign in by running agy in a terminal', !info.agy.gmail && mailToken] },
      { value: 'gemini', name: 'Gemini · API key', notice: 'My Gemini key is on a paid plan. On the free tier Google may read what it receives, and this sends the text of your e-mails.',
        about: 'Asks Gemini through its API with a key of yours, and reads your mail with a read-only Gmail permission of its own.',
        problems: [!info.gemini.key && 'add GEMINI_API_KEY under API keys & AI provider', !info.gemini.gmail && mailToken] },
    ].map((option) => ({ ...option, problems: option.problems.filter(Boolean) }));
    const byValue = Object.fromEntries(options.map((option) => [option.value, option]));

    const body = el('div', undefined, 'mail-choose');
    body.append(el('p', 'Choose who reads your Gmail. It only reads: nothing is sent, labelled or deleted, and nothing is changed in your tracker until you approve it on the next screen.'));
    const last = remembered();
    for (const option of options) {
      const label = el('label', undefined, 'mail-option');
      const radio = el('input'); radio.type = 'radio'; radio.name = 'mail-reader'; radio.value = option.value; radio.checked = option.value === (byValue[last] ? last : 'claude');
      const text = el('span', undefined, 'mail-option-text');
      text.append(el('strong', option.name), el('span', option.about));
      if (option.problems.length) text.append(el('span', `Not ready yet: ${option.problems.join(', and ')}.`, 'mail-problem'));
      label.append(radio, text);
      body.append(label);
    }
    const noticeLabel = el('label', undefined, 'mail-paid');
    const notice = el('input'); notice.type = 'checkbox';
    const noticeText = el('span');
    noticeLabel.append(notice, noticeText);
    body.append(noticeLabel);
    const chosen = () => byValue[body.querySelector('input[name="mail-reader"]:checked')?.value];
    const sync = () => { const text = chosen()?.notice || ''; noticeLabel.hidden = !text; noticeText.textContent = text; };
    body.addEventListener('change', sync); sync();

    const answer = await Swal.fire({
      ...dialog, title: 'Check my email', html: body, showCancelButton: true, confirmButtonText: 'Check now',
      preConfirm: () => {
        const option = chosen();
        if (!option) { Swal.showValidationMessage('Choose who reads your email.'); return false; }
        if (option.problems.length) { Swal.showValidationMessage(`${option.name} is not ready: ${option.problems.join(', and ')}.`); return false; }
        if (option.notice && !notice.checked) { Swal.showValidationMessage('Tick the notice to go on, or choose Claude.'); return false; }
        return { reader: option.value, confirmed: notice.checked };
      },
    });
    if (!answer.isConfirmed) return null;
    remember(answer.value.reader);
    return answer.value;
  }

  // Step 2: the proposals, each with the e-mail it comes from. Resolves to the ticked row ids, or null.
  function resultsBody(data) {
    const body = el('div', undefined, 'mail-results');
    const ticks = new Map();
    const found = countLine(data.counts);
    body.append(el('p', `${data.read ? `${plural(data.read, 'e-mail')} read. ` : ''}${plural(data.proposals.length, 'application')} with news${found ? `: ${found}` : ''}. Tick what is right; unticked ones are skipped and will not be proposed again. Each e-mail can be read below its entry, and is kept on the Mail page.`));
    body.append(el('p', 'On approval the status changes where an e-mail moves it, and every e-mail is written into that row’s Notes. An interview day goes into Interview date, and what you must send or do goes into Next action with its deadline, only where those cells are empty.', 'mail-note'));
    for (const proposal of data.proposals) {
      const label = el('label', undefined, 'mail-item');
      const tick = el('input'); tick.type = 'checkbox'; tick.checked = true; ticks.set(proposal.rowId, tick);
      const text = el('span', undefined, 'mail-item-text');
      text.append(
        el('strong', `${proposal.company}${proposal.position ? ` — ${proposal.position}` : ''}`),
        el('span', proposal.untracked ? `${proposal.label} · not in your tracker, kept on the Mail page only` : proposal.to === proposal.from ? `${proposal.label} (status stays ${proposal.from})` : `${proposal.label}: ${proposal.from} → ${proposal.to}`, 'mail-move'),
        ...[taskLine(proposal)].filter(Boolean),
        el('span', `“${proposal.evidence}”`, 'mail-evidence'),
        ...(proposal.ask ? [el('span', `Also asked${proposal.ask.detail ? `: ${proposal.ask.detail}` : ''}${proposal.ask.due ? ` (by ${proposal.ask.due})` : ''}`, 'mail-detail')] : []),
        el('span', `${proposal.subject || 'No subject'} · ${proposal.sender || 'sender not shown'} · ${proposal.date || 'date not shown'}`, 'mail-source'),
      );
      label.append(tick, text);
      const entry = el('div', undefined, 'mail-entry');
      entry.append(label, ...[mailText('Read the e-mail', proposal.text), proposal.ask && mailText('Read the e-mail that also asks for something', proposal.ask.text)].filter(Boolean));
      body.append(entry);
    }
    if (data.review.length) {
      body.append(el('p', 'Needs your decision (not proposed, change these yourself):', 'mail-heading'));
      const list = el('ul');
      for (const item of data.review) list.append(el('li', `${item.company}${item.position ? ` — ${item.position}` : ''}: ${item.reason}`));
      body.append(list);
    }
    const notes = [...data.warnings, data.dropped ? `${data.dropped} suggestion${data.dropped === 1 ? ' was' : 's were'} dropped because the e-mail did not back them up.` : ''].filter(Boolean);
    if (notes.length) body.append(el('p', notes.join(' '), 'mail-note'));
    return { body, picked: () => [...ticks].filter(([, tick]) => tick.checked).map(([id]) => id) };
  }

  const note = document.getElementById('mail-status');
  const say = (text, error = false) => { note.textContent = text; note.dataset.state = error ? 'error' : ''; };

  // Step 3, opened from the tray's Review button whenever the student is ready (the server keeps the proposals for an hour).
  async function review(data, task) {
    const { body, picked } = resultsBody(data);
    if (!data.proposals.length) { await Swal.fire({ ...dialog, title: 'Check my email', html: body, confirmButtonText: 'Close' }); task.remove(); return; }
    const answer = await Swal.fire({ ...dialog, title: 'Review these changes', html: body, showCancelButton: true, confirmButtonText: 'Apply ticked changes', cancelButtonText: 'Not now' });
    if (!answer.isConfirmed) { say('Nothing was changed yet. The Review button stays in the top-right corner for an hour.'); return; }
    try {
      const done = await request('mail/apply', { confirmation: data.confirmation, accept: picked() });
      await reload();
      task.remove();
      const parts = [(done.applied || !done.kept) && `${done.applied} change${done.applied === 1 ? '' : 's'} applied to your tracker`, done.kept && `${plural(done.kept, 'e-mail')} about other applications kept on the Mail page`].filter(Boolean);
      say(`${parts.join(', ')}${countLine(done.counts) ? ` (${countLine(done.counts)})` : ''}${done.skipped ? `, ${done.skipped} skipped` : ''}${done.stale ? `, ${done.stale} left alone because the row changed meanwhile` : ''}.`);
    } catch (error) { say(error.message, true); }
  }

  // What the server says the reader is doing. "Spotted" is the reader's own count before the check against each e-mail.
  const progressLines = (p) => (p ? [
    p.stage,
    p.listed ? `${p.read} of ${plural(p.listed, 'e-mail')} read` : '',
    p.batches > 1 ? `Batch ${p.batch} of ${p.batches}` : '',
    countLine(p.spotted) && `Spotted so far: ${countLine(p.spotted)}`,
  ] : []);

  let checking = false;
  const busy = (on) => { checking = on; button.disabled = on; button.setAttribute('aria-busy', String(on)); };
  // The answer goes to this page: leaving it mid-check loses the proposals (the next check finds the same e-mails again).
  window.addEventListener('beforeunload', (event) => { if (checking) { event.preventDefault(); event.returnValue = ''; } });

  button.addEventListener('click', async () => {
    if (checking) return;
    let task;
    try {
      const choice = await chooseReader(await request('mail'));
      if (!choice) return;
      busy(true);
      await save(); // the check compares against the saved workbook, so unsaved edits go first
      const name = { claude: 'Claude', agy: 'Gemini', gemini: 'Gemini' }[choice.reader];
      task = startTask({ title: `${name} is reading your email`, poll: async () => progressLines((await request('progress')).mail) });
      say('Reading your email. Follow it in the top-right corner; you can keep working meanwhile.');
      const data = await request('mail/scan', choice);
      const read = data.read ? plural(data.read, 'e-mail') : 'your email';
      if (!data.proposals.length && !data.review.length) {
        if (data.confirmation) await request('mail/apply', { confirmation: data.confirmation, accept: [] }); // nothing to decide: remember the mails as seen
        say(`No replies about your applications found in ${read}. ${data.warnings.join(' ')}`);
        task.done(`No replies about your applications in ${read}.`, { lines: [] });
        return;
      }
      const found = countLine(data.counts);
      const summary = `${read} read: ${plural(data.proposals.length, 'application')} with news${found ? ` (${found})` : ''}${data.review.length ? `, ${data.review.length} to decide yourself` : ''}.`;
      say(`${summary} Review them from the top-right corner.`);
      task.done(summary, { lines: [], action: { label: 'Review', run: () => review(data, task) } });
    } catch (error) {
      say(error.message, true);
      task?.fail(error.message);
    } finally { busy(false); }
  });
}
