import { createBoard } from './workspace-board.js';

// The three local workspace flows share one workbook snapshot and revision.
export async function initWorkspaceFlows({ local, api, Swal, dialog, onRows }) {
  const $ = (id) => document.getElementById(id);
  let rows = [], columns = [], enums = {}, revision = null;
  let page = 0, dirty = false, loaded = false, busy = false;
  // Whether an AI provider and the student files are ready (set from the local server).
  let aiReady = false;
  const pageSize = 12;
  const status = $('tracker-status');
  const groups = {
    review: ['company', 'position', 'job_id', 'date_posted', 'match_score', 'gju_check', 'job_url', 'city', 'deadline', 'date_found', 'opportunity_type', 'priority', 'role_fit', 'apply', 'applicant', 'status', 'assistant_state', 'next_action', 'notes'],
    contact: ['company', 'position', 'website', 'address', 'maps_link', 'commute', 'contact_person', 'contact_email', 'referral', 'phone'],
    requirements: ['company', 'position', 'opportunity_type', 'work_model', 'duration', 'start_date', 'deadline', 'full_part', 'internship_type', 'paid', 'salary', 'req_german', 'req_english', 'req_skills', 'missing_reqs', 'visa_req', 'match_score', 'why_match', 'gju_check'],
    application: ['company', 'position', 'apply', 'applicant', 'tailored', 'documents_used', 'app_method', 'app_url', 'date_applied', 'follow_up', 'status', 'answer', 'interview_date', 'next_action', 'notes'],
  };
  const longFields = new Set(['position', 'notes', 'reason', 'req_skills', 'missing_reqs', 'why_match', 'benefits', 'response_summary']);
  const mutationIds = ['btn-clear-tracker', 'btn-add-row','btn-save-tracker', 'btn-reload-tracker', 'btn-apply-selected', 'btn-assign-applicant'];
  // The rows the board's filters let through, in its order: the spreadsheet views and "Who applies" use the same ones.
  let shown = [];

  function postingId(value) {
    try {
      const url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol)) return '';
      for (const [key, id] of url.searchParams) if (/^(?:id|jk|vjk|job_?id|jobadid|reference|refnr|stellenangebotsid)$/i.test(key) && id.trim()) return id.trim();
      const last = decodeURIComponent(url.pathname.replace(/\/+$/, '').split('/').at(-1) || '');
      return last.match(/(?:^|[-_])j(\d{4,})(?:\.[a-z]+)?$/i)?.[1]
        || last.match(/(\d{4,}(?:-\d{4,})*(?:-[A-Z])?)(?:\.[a-z]+)?$/i)?.[1] || '';
    } catch { return ''; }
  }

  async function request(route, payload) {
    const response = await fetch(api(route), payload === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    let data;
    try { data = await response.json(); } catch { throw new Error('The local editor returned an unreadable response. Restart npm run editor and retry.'); }
    if (!response.ok) throw new Error(data.error || 'The local editor could not complete the request.');
    return data;
  }

  // What the next search will do: the major (or every field) it looks for, and the sources that can run.
  let searchOk = false;
  let planLabel = '';
  const sourceOff = new Set();
  const SOURCE_NAMES = { claude: 'Claude', nim: 'NVIDIA NIM', apis: 'Free job sources' };
  const searchMode = () => document.querySelector('input[name="search-mode"]:checked').value;
  const searchSources = () => Object.fromEntries([...document.querySelectorAll('input[name="search-source"]')].map((input) => [input.value, input.checked && !sourceOff.has(input.value)]));
  function syncSearch() {
    const anySource = Object.values(searchSources()).some(Boolean);
    searchOk = Boolean(planLabel) && anySource;
    if (planLabel && !anySource) { $('search-plan').textContent = 'Choose at least one source to search with.'; $('search-plan').dataset.state = 'error'; }
    controls();
  }
  async function refreshPlan() {
    const mode = searchMode();
    try {
      const data = await request(`search-plan?mode=${mode}`);
      sourceOff.clear();
      for (const [name, ready] of Object.entries(data.available || {})) {
        const box = document.querySelector(`input[name="search-source"][value="${name}"]`);
        const hint = document.querySelector(`[data-source-hint="${name}"]`);
        if (!ready) { sourceOff.add(name); box.checked = false; if (name === 'nim') hint.textContent = 'Add NVIDIA_API_KEY under API keys & AI provider to use it.'; if (name === 'apis') hint.textContent = 'The JobSearchEngine is not set up (see the README).'; }
      }
      $('search-field').textContent = data.field ? data.field : 'No field of study in your profile: import your profile or use the global search';
      planLabel = data.plan?.label || '';
      $('search-plan').dataset.state = data.plan ? '' : 'error';
      $('search-plan').textContent = data.plan
        ? `${data.plan.label}. Free sources ask for: ${data.plan.keywords.join(', ')}. Claude and NVIDIA NIM start from ${data.plan.searches.length} searches such as ${data.plan.searches.slice(0, 3).join(', ')}${data.plan.matched || mode === 'global' ? '' : '. Your AI provider adds more title words when you search'}.`
        : 'Your profile has no field of study, so there is nothing to search for yet.';
    } catch (error) { planLabel = ''; $('search-plan').dataset.state = 'error'; $('search-plan').textContent = error.message; }
    syncSearch();
  }

  function controls() {
    mutationIds.forEach((id) => { if ($(id)) $(id).disabled = !local || busy || (!loaded && id !== 'btn-reload-tracker'); });
    $('btn-start-search').disabled = !local || busy || !searchOk;
    $('search-use-profile').disabled = !local || busy || !aiReady;
    document.querySelectorAll('input[name="search-mode"]').forEach((input) => { input.disabled = !local || busy; });
    document.querySelectorAll('input[name="search-source"]').forEach((input) => { input.disabled = !local || busy || sourceOff.has(input.value); });
    document.querySelectorAll('.apply-tailor').forEach((button) => { button.disabled = !local || busy || !aiReady; });
    document.querySelectorAll('#tracker-table input, #tracker-table select, #tracker-table textarea, #tracker-table button, #board-list select, #board-list button').forEach((input) => { input.disabled = busy; });
    $('tracker-table-wrap').setAttribute('aria-busy', String(busy));
    $('btn-download-tracker').setAttribute('aria-disabled', String(!local || busy));
  }

  function markDirty() {
    dirty = true;
    const counts = new Map();
    rows.forEach((row) => { const key = `${(row.company || '').trim().toLowerCase()}\0${(row.position || '').trim().toLowerCase()}`; if (row.company && row.position) counts.set(key, (counts.get(key) || 0) + 1); });
    rows.forEach((row) => {
      row.job_id = postingId(row.job_url);
      row.maps_link = row.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${row.company || ''} ${row.address}`.trim()).replace(/%20/g, '+')}` : '';
      const sent = /^\d{4}-\d{2}-\d{2}$/.test(row.date_applied || '') ? new Date(`${row.date_applied}T00:00:00Z`) : null;
      row.follow_up = sent && !Number.isNaN(sent.valueOf()) ? new Date(sent.valueOf() + 7 * 86400000).toISOString().slice(0, 10) : '';
      const key = `${(row.company || '').trim().toLowerCase()}\0${(row.position || '').trim().toLowerCase()}`;
      row.duplicate_check = counts.get(key) > 1 ? 'DUPLICATE' : '';
    });
    document.querySelectorAll('#tracker-table input[data-column], #tracker-table select[data-column]').forEach((input) => {
      if (!['maps_link', 'follow_up', 'duplicate_check', 'job_id'].includes(input.dataset.column)) return;
      const row = rows.find(item => item.id === input.closest('tr')?.dataset.rowId);
      if (row) input.value = row[input.dataset.column] || '';
    });
    status.textContent = 'Unsaved changes. Save workbook to update the Excel file.';
    onRows(rows);
    renderQueue();
  }

  function optionsFor(column) {
    return (enums[column.enum] || []).map((item) => typeof item === 'string' ? item : item.value);
  }

  function field(column, row, change) {
    const values = optionsFor(column);
    let input;
    if (values.length) {
      input = document.createElement('select');
      const choices = [...new Set(['', ...values, row[column.key] || ''])];
      choices.forEach((value) => input.add(new Option(value || 'Choose…', value)));
    } else if (longFields.has(column.key)) {
      input = document.createElement('textarea'); input.rows = column.key === 'notes' ? 3 : 2;
    } else {
      input = document.createElement('input'); input.type = 'text';
      if (column.format === 'date' && (!row[column.key] || /^\d{4}-\d{2}-\d{2}$/.test(row[column.key]))) input.type = 'date';
      if (column.key === 'match_score') { input.type = 'number'; input.min = '0'; input.max = '100'; input.step = '1'; }
    }
    input.value = row[column.key] || '';
    if (column.key === 'match_score' && row.why_match) input.title = row.why_match;
    if (column.computed || column.key === 'job_id') input.readOnly = true;
    input.dataset.column = column.key;
    input.setAttribute('aria-label', `${column.header}, ${row.company || 'new job'}`);
    input.addEventListener('input', () => change(input.value));
    return input;
  }

  function button(text, action, className = 'btn btn-small') {
    const element = document.createElement('button'); element.type = 'button'; element.className = className;
    element.textContent = text; element.addEventListener('click', action); return element;
  }

  async function editNote(row, column, noteButton) {
    const result = await Swal.fire({ ...dialog, title: `Note on ${column.header}`, input: 'textarea', inputValue: row._cellNotes?.[column.key] || '',
      inputLabel: `Cell note for ${row.company || 'this job'}`, showCancelButton: true, confirmButtonText: 'Keep note', inputPlaceholder: 'Add context for this cell' });
    if (!result.isConfirmed) return;
    row._cellNotes = { ...row._cellNotes, [column.key]: result.value || '' };
    noteButton.textContent = result.value ? 'Edit note' : '+ Note'; markDirty();
  }

  function editRow(row, isNew = false) {
    const draft = structuredClone(row);
    const modal = document.createElement('dialog'); modal.className = 'tracker-dialog';
    const form = document.createElement('form'); form.method = 'dialog';
    const header = document.createElement('div'); header.className = 'tracker-dialog-header';
    const heading = document.createElement('h3'); heading.id = 'job-detail-heading'; heading.textContent = row.company || 'New job';
    modal.setAttribute('aria-labelledby', heading.id);
    header.append(heading, button('Close', () => modal.close()));
    const grid = document.createElement('div'); grid.className = 'tracker-detail-grid';
    columns.forEach((column) => {
      const label = document.createElement('label'); label.className = 'tracker-detail-field';
      const caption = document.createElement('span'); caption.textContent = column.header;
      label.append(caption, field(column, draft, (value) => { draft[column.key] = value; if (column.key === 'match_score') draft.why_match = 'Manually adjusted in tracker.'; })); grid.append(label);
    });
    const actions = document.createElement('div'); actions.className = 'tracker-row-actions';
    actions.append(button('Keep changes', () => { Object.assign(row, draft); if (isNew) rows.unshift(row); markDirty(); render(); modal.close(); }, 'btn btn--primary'), button('Cancel', () => modal.close()));
    form.append(header, grid, actions); modal.append(form); document.body.append(modal);
    form.addEventListener('submit', (event) => { event.preventDefault(); });
    modal.addEventListener('close', () => modal.remove()); modal.showModal();
  }

  function render() {
    board.load(rows, enums);
    renderQueue(); onRows(rows); controls();
  }

  /** The spreadsheet views: the board's rows as editable cells, a page at a time. The Board view is drawn by workspace-board.js. */
  function renderGrid(matches, reset) {
    shown = matches;
    if (reset) page = 0;
    const choice = $('tracker-column-view').value;
    $('tracker-table-wrap').hidden = choice === 'results';
    if (choice === 'results') return;
    const visible = choice === 'all' ? columns : (groups[choice] || groups.review).map((key) => columns.find((col) => col.key === key)).filter(Boolean);
    const head = $('tracker-thead-tr'); head.replaceChildren();
    for (const label of [...visible.map((col) => col.header), 'Row actions']) {
      const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; head.append(th);
    }
    const pageCount = Math.max(1, Math.ceil(matches.length / pageSize)); page = Math.max(0, Math.min(page, pageCount - 1));
    const body = $('tracker-tbody'); body.replaceChildren();
    matches.slice(page * pageSize, (page + 1) * pageSize).forEach((row) => {
      const tr = document.createElement('tr'); tr.dataset.rowId = row.id;
      visible.forEach((column) => {
        const td = document.createElement('td'); td.dataset.column = column.key;
        const supplement = document.createElement('div'); supplement.className = 'tracker-cell-supplement';
        const updateSupplement = () => {
          supplement.replaceChildren();
          if (['date_posted', 'date_found', 'deadline'].includes(column.key)) {
            const date = row[column.key];
            if (/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
              const label = document.createElement('time'); label.className = 'tracker-date-iso'; label.dateTime = date; label.textContent = date; supplement.append(label);
            } else if (['deadline', 'date_posted'].includes(column.key) && !date) {
              const missing = document.createElement('span'); missing.className = 'tracker-link-missing'; missing.textContent = column.key === 'deadline' ? 'No deadline listed' : 'Publication date unverified'; supplement.append(missing);
            }
          }
          if (column.key === 'match_score' && row.why_match) {
            const explanation = document.createElement('span');
            explanation.className = 'tracker-link-missing';
            explanation.textContent = row.why_match.startsWith('Provisional') ? 'Title only' : row.why_match.includes('Limited skill evidence') ? 'Limited evidence' : row.why_match.startsWith('Manually') ? 'Your score' : 'Profile estimate';
            explanation.title = row.why_match;
            supplement.append(explanation);
          }
          if (['job_url', 'website', 'maps_link', 'portfolio_link'].includes(column.key)) {
            try {
              const url = new URL(row[column.key]);
              if (['https:', 'http:'].includes(url.protocol)) {
                const link = document.createElement('a'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
                link.textContent = column.key === 'job_url' ? 'Open posting' : column.key === 'maps_link' ? 'Open map' : 'Open link'; supplement.append(link);
              }
            } catch {}
            if (column.key === 'job_url' && !row.job_url) {
              const missing = document.createElement('span'); missing.className = 'tracker-link-missing'; missing.textContent = 'Posting link missing'; supplement.append(missing);
            }
          }
        };
        td.append(field(column, row, (value) => { row[column.key] = value; if (column.key === 'match_score') row.why_match = 'Manually adjusted in tracker.'; updateSupplement(); markDirty(); }), supplement);
        updateSupplement();
        const note = button(row._cellNotes?.[column.key] ? 'Edit note' : '+ Note', () => editNote(row, column, note), 'tracker-cell-note');
        note.setAttribute('aria-label', `Note on ${column.header}, ${row.company || 'new job'}`); td.append(note);
        tr.append(td);
      });
      const actions = document.createElement('td'); actions.className = 'tracker-row-actions';
      actions.append(button('All fields', () => editRow(row)), button('Duplicate', () => {
        const copy = structuredClone(row); copy.id = `job-${crypto.randomUUID()}`; copy.apply = ''; copy.applicant = 'Me'; copy.status = 'To apply'; copy.assistant_state = '';
        copy.date_applied = ''; copy.follow_up = ''; rows.splice(rows.indexOf(row) + 1, 0, copy); markDirty(); render();
      }), button('Delete', async () => {
        const answer = await Swal.fire({ ...dialog, title: 'Remove this row?', text: `${row.company || 'New job'} — ${row.position || 'Untitled role'}. The workbook changes when you save.`, showCancelButton: true, confirmButtonText: 'Remove row' });
        if (answer.isConfirmed) { rows.splice(rows.indexOf(row), 1); markDirty(); render(); }
      }));
      tr.append(actions); body.append(tr);
    });
    if (!matches.length) {
      const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = visible.length + 1;
      td.textContent = rows.length ? 'No jobs match these filters.' : 'Your workbook is empty. Search for jobs or add a row to begin.'; tr.append(td); body.append(tr);
    }
    $('tracker-page').textContent = `Page ${page + 1} of ${pageCount}`;
    $('tracker-prev').disabled = page === 0; $('tracker-next').disabled = page === pageCount - 1;
    controls();
  }

  function renderQueue() {
    const selected = rows.filter((row) => row.apply === 'Yes' && row.status === 'To apply');
    const assistant = selected.filter((row) => row.applicant === 'Assistant' && !row.assistant_state);
    const manual = selected.filter((row) => row.applicant !== 'Assistant');
    const paused = selected.filter((row) => row.applicant === 'Assistant' && row.assistant_state);
    $('apply-summary').textContent = `${assistant.length} assigned to Assistant · ${manual.length} for you to apply${paused.length ? ` · ${paused.length} need review` : ''}`;
    const container = $('apply-queue'); container.replaceChildren();
    if (!selected.length) { const p = document.createElement('p'); p.textContent = 'In Review, choose Yes and set who applies. Your selected jobs will appear here.'; container.append(p); return; }
    const list = document.createElement('ul'); list.className = 'apply-queue-list';
    selected.forEach((row) => {
      const item = document.createElement('li'); item.className = 'apply-queue-item';
      const title = document.createElement('strong'); title.textContent = `${row.company || 'Company to review'} — ${row.position || 'Untitled role'}`;
      const owner = document.createElement('span'); owner.textContent = row.applicant === 'Assistant' ? row.assistant_state ? `Assistant: ${row.assistant_state}` : 'Assistant will apply' : 'You will apply';
      item.append(title, owner);
      for (const [label, file] of [['CV', row.cv_file], ['Letter', row.cl_file]]) {
        if (!/^assets\/Student-data\/tailored\/[\w.-]+\.docx$/.test(file || '')) continue;
        const link = document.createElement('a'); link.href = new URL(`../${file}`, location.href).href; link.textContent = `${label} (tailored)`; item.append(link);
      }
      const tailor = document.createElement('button'); tailor.type = 'button'; tailor.className = 'btn apply-tailor'; tailor.textContent = row.cv_file ? 'Tailor again' : 'Tailor CV & letter';
      tailor.title = aiReady ? 'Rewrite your base CV and cover letter for this job' : 'Needs an AI provider in .env and your uploaded student files';
      tailor.disabled = !local || busy || !aiReady;
      tailor.addEventListener('click', () => run('apply-status', async () => {
        if (dirty) await save();
        const loader = AiStatus.overlay({ state: 'composing', label: `Tailoring your CV and cover letter for ${row.company || 'this job'}. This can take a minute…` });
        let result;
        try { result = await request('tailor', { id: row.id }); await reload(); } finally { loader.close(); }
        const changed = result.stats.cv.changed + result.stats.cl.changed;
        $('apply-status').textContent = `Saved a tailored CV and letter (${changed} paragraphs rewritten).${result.unfilled.length ? ` Still to fill by hand: ${result.unfilled.join(', ')}.` : ''}`;
      }));
      item.append(tailor);
      try { const url = new URL(row.app_url || row.job_url); if (['https:', 'http:'].includes(url.protocol)) { const link = document.createElement('a'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Open application'; item.append(link); } } catch {}
      if (local) item.append(applyByHand(row));
      list.append(item);
    }); container.append(list);
  }


  // "Apply yourself": the details a web form asks for, to copy, and a way to remember that CV and letter may be asked for later.
  let packFields;
  function applyByHand(row) {
    const panel = document.createElement('details'); panel.className = 'apply-hand';
    const summary = document.createElement('summary');
    summary.textContent = row.assistant_state ? `Apply yourself (the assistant stopped: ${row.assistant_state})` : 'Apply yourself';
    const body = document.createElement('div'); panel.append(summary, body);
    const note = String(row.notes || '').split(/\r?\n/).filter((line) => line.startsWith('Assistant:')).at(-1);
    if (row.assistant_state && note) { const p = document.createElement('p'); p.textContent = note; body.append(p); }
    panel.addEventListener('toggle', async () => {
      if (!panel.open || body.dataset.ready) return;
      body.dataset.ready = '1';
      try { packFields ||= (await request('apply-pack')).fields; } catch (error) { body.append(error.message); return; }
      const list = document.createElement('dl'); list.className = 'apply-pack';
      for (const { label, value } of packFields) {
        const dt = document.createElement('dt'); dt.textContent = label;
        const dd = document.createElement('dd');
        if (value) {
          const text = document.createElement('span'); text.textContent = value;
          const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'btn'; copy.textContent = 'Copy';
          copy.addEventListener('click', () => navigator.clipboard.writeText(value).then(() => { copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy'; }, 1200); }));
          dd.append(text, copy);
        } else dd.textContent = 'Not in your profile yet';
        list.append(dt, dd);
      }
      body.append(list);
    });
    const done = document.createElement('button'); done.type = 'button'; done.className = 'btn';
    done.textContent = 'Applied — CV/letter may be requested later';
    done.addEventListener('click', () => run('apply-status', async () => {
      const day = (offset) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
      Object.assign(row, { applicant: 'Me', assistant_state: '', status: 'Applied', date_applied: day(0), next_action: 'Send CV + cover letter if requested', next_action_date: day(7) });
      markDirty(); await save(); await reload();
      $('apply-status').textContent = `Marked ${row.company || 'the job'} as applied. Follow-up set for ${row.next_action_date}; tailor the CV and letter then if they ask.`;
    }));
    body.append(done);
    return panel;
  }

  function accept(data) {
    rows = data.rows; columns = data.columns; enums = data.enums || {};
    enums.statuses ||= data.statuses; enums.applyDecisions ||= data.decisions;
    revision = data.revision; loaded = true; dirty = false;
    render();
  }

  async function reload() {
    if (!local) return;
    accept(await request('applications'));
    status.textContent = `Loaded ${rows.length} rows from job_search_tracker.xlsx. Edits stay here until you save.`;
  }

  async function save() {
    if (!loaded) throw new Error('Load the workbook before saving changes.');
    if (!dirty) { status.textContent = 'No unsaved changes. Your workbook is up to date.'; return; }
    const data = await request('applications', { rows, revision });
    accept(data); status.textContent = `Saved ${rows.length} rows to job_search_tracker.xlsx.`;
  }

  async function run(id, action) {
    if (!local || busy) return;
    busy = true; $(id).dataset.state = ''; controls();
    try { await action(); }
    catch (error) { $(id).textContent = error.message; $(id).dataset.state = 'error'; }
    finally { busy = false; controls(); }
  }

  const board = createBoard({
    Swal, dialog, rules: JSON.parse($('gju-rules').textContent).rules || {}, info: (row) => editRow(row), onFiltered: renderGrid,
    statusField: (row) => field(columns.find((column) => column.key === 'status'), row, (value) => { row.status = value; markDirty(); }),
  });
  // Full-window editing: the same table, filters and Save button, laid out compactly so every column fits.
  const expandButton = $('tracker-expand'), reviewSection = $('flow-review');
  function setExpanded(on) {
    reviewSection.classList.toggle('tracker-fullscreen', on);
    document.documentElement.classList.toggle('tracker-fullscreen-open', on);
    expandButton.setAttribute('aria-pressed', String(on));
    expandButton.querySelector('span').textContent = on ? 'Close window' : 'Open as window';
    expandButton.querySelector('i').className = `fa-solid ${on ? 'fa-compress' : 'fa-expand'}`;
    if (on) { $('tracker-column-view').value = 'all'; $('tracker-column-view').dispatchEvent(new Event('input', { bubbles: true })); $('tracker-column-view').dispatchEvent(new Event('change', { bubbles: true })); }
  }
  expandButton.addEventListener('click', () => setExpanded(!reviewSection.classList.contains('tracker-fullscreen')));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && reviewSection.classList.contains('tracker-fullscreen') && !document.querySelector('dialog[open], .swal2-container')) setExpanded(false); });
  $('tracker-prev').addEventListener('click', () => { page--; renderGrid(shown); });
  $('tracker-next').addEventListener('click', () => { page++; renderGrid(shown); });
  $('btn-add-row').addEventListener('click', () => {
    const row = Object.fromEntries(columns.map((column) => [column.key, '']));
    Object.assign(row, { id: `job-${crypto.randomUUID()}`, applicant: 'Me', status: 'To apply' });
    board.clear(); editRow(row, true);
  });
  $('btn-save-tracker').addEventListener('click', () => run('tracker-status', async () => { status.textContent = 'Saving workbook…'; await save(); }));
  $('btn-clear-tracker').addEventListener('click', () => run('tracker-status', async () => {
    const answer = await Swal.fire({ ...dialog, icon: 'warning', title: 'Delete all applications?', input: 'text', showCancelButton: true, confirmButtonText: 'Delete everything',
      text: `This removes all ${rows.length} rows, including unsaved edits. The previous files are kept in .cache/tracker-backups. Type DELETE to confirm.`,
      inputValidator: (value) => (value.trim() === 'DELETE' ? null : 'Type DELETE in capitals to confirm.') });
    if (!answer.isConfirmed) return;
    accept(await request('applications', { rows: [], revision }));
    status.textContent = 'All applications deleted. The next search starts from an empty workbook.';
  }));
  $('btn-reload-tracker').addEventListener('click', () => run('tracker-status', async () => {
    if (dirty) { const result = await Swal.fire({ ...dialog, title: 'Reload the Excel file?', text: 'This replaces your unsaved changes with the current workbook.', showCancelButton: true, confirmButtonText: 'Reload workbook' }); if (!result.isConfirmed) return; }
    await reload();
  }));
  $('btn-download-tracker').addEventListener('click', (event) => {
    event.preventDefault();
    run('tracker-status', async () => { await save(); const link = document.createElement('a'); link.href = api('excel'); link.download = 'job_search_tracker.xlsx'; link.click(); });
  });
  $('btn-start-search').addEventListener('click', () => run('search-run-status', async () => {
    const sources = searchSources();
    const using = Object.keys(sources).filter((name) => sources[name]).map((name) => SOURCE_NAMES[name]).join(', ');
    const loader = AiStatus.overlay({ state: 'searching', label: `Searching for ${planLabel.toLowerCase() || 'internships'} with ${using}. This can take a few minutes…` });
    let result;
    try {
      if (dirty) await save();
      result = await request('search', { useProfile: $('search-use-profile').checked, mode: searchMode(), sources });
      await reload();
    } finally { loader.close(); }
    const warnings = (result.warnings || []).join(' ');
    const leads = result.unverified || 0;
    const counts = Object.entries(result.bySource || {}).map(([name, count]) => `${SOURCE_NAMES[name]} ${count}`).join(', ');
    $('search-run-status').textContent = `${result.found ? `Found ${result.found} postings${counts ? ` (${counts})` : ''}. Added ${result.added} new internship${result.added === 1 ? '' : 's'}${leads ? `, ${leads} of them search-engine leads to open and check` : ''}` : 'No postings were found for this search'}. Your existing choices are preserved.${warnings ? ` ${warnings}` : ''}`;
  }));
  $('btn-assign-applicant').addEventListener('click', () => run('apply-status', async () => {
    await save();
    // Only what the tracker is showing right now, and only the student's own picks: the server checks this again.
    const ids = shown.filter((row) => (row.applicant || 'Me') === 'Me' && row.apply === 'Yes' && row.status === 'To apply').map((row) => row.id);
    if (!ids.length) { $('apply-status').textContent = 'Filter the tracker to jobs with Applicant = Me, Apply? = Yes and status To apply first.'; return; }
    const loader = AiStatus.overlay({ state: 'working', label: `Reading ${ids.length} application${ids.length === 1 ? '' : 's'}…` });
    let result;
    try { result = await request('assign-applicant', { ids }); await reload(); } finally { loader.close(); }
    $('apply-status').textContent = `${result.assigned.length} job${result.assigned.length === 1 ? '' : 's'} given to the Assistant, ${result.kept.length} kept with you. Nothing was sent.`;
    const body = document.createElement('div');
    for (const [heading, items] of [['Given to the Assistant', result.assigned], ['Kept with you', result.kept]]) {
      if (!items.length) continue;
      const title = document.createElement('p'); title.textContent = heading; title.style.fontWeight = '600'; body.append(title);
      const list = document.createElement('ul');
      items.forEach((item) => { const li = document.createElement('li'); li.textContent = `${item.company || 'Company'} — ${item.position}: ${item.reason}`; list.append(li); });
      body.append(list);
    }
    await Swal.fire({ ...dialog, title: 'Who applies', html: body, confirmButtonText: 'Close' });
  }));
  $('btn-apply-selected').addEventListener('click', () => run('apply-status', async () => {
    await save();
    const preview = await request('apply-preview');
    if (!preview.count) { $('apply-status').textContent = 'Assign a job to Assistant and choose Yes with status To apply first.'; return; }
    const body = document.createElement('div');
    const intro = document.createElement('p'); intro.textContent = `Review these ${preview.count} applications before starting. The assistant will use your saved candidate details. Jobs assigned to Me stay with you.`; body.append(intro);
    const fillLabel = document.createElement('label'); fillLabel.style.display = 'block'; fillLabel.style.margin = '8px 0';
    const fillOnly = document.createElement('input'); fillOnly.type = 'checkbox'; fillOnly.id = 'apply-fill-only'; fillOnly.checked = true;
    fillLabel.append(fillOnly, ' Fill and upload only: open each web form in a browser window with your details and documents filled in, but do not submit, and do not send emails. You review and click Submit yourself.');
    body.append(fillLabel);
    const list = document.createElement('ul');
    const emailEdits = new Map();
    const ROUTES = { email: 'sent by email', upload: 'filled in a browser here, documents uploaded', remote: 'filled by the remote browser (documents cannot be uploaded)', missing: 'no application link' };
    (preview.rows || [preview.first]).forEach((row) => {
      const item = document.createElement('li');
      item.textContent = `${row.company || 'Company to review'} — ${row.position} (${row.url || 'application URL missing'}) · ${ROUTES[row.route] || row.route}${row.attachments?.length ? ` · attaches ${row.attachments.join(', ')}` : ''}`;
      if (row.email) {
        const to = document.createElement('p'); to.textContent = `To: ${row.email.to || 'no address — add the employer e-mail to the row'} · ${row.email.ai ? 'AI-written draft, check the facts before sending' : 'standard template'}`;
        const subject = document.createElement('input'); subject.type = 'text'; subject.value = row.email.subject; subject.setAttribute('aria-label', `Subject for ${row.company || 'this job'}`); subject.style.width = '100%';
        const text = document.createElement('textarea'); text.value = row.email.body; text.rows = 7; text.setAttribute('aria-label', `Email text for ${row.company || 'this job'}`); text.style.width = '100%';
        emailEdits.set(row.id, { subject, text });
        item.append(to, subject, text);
      }
      list.append(item);
    });
    body.append(list);
    const answer = await Swal.fire({ ...dialog, title: 'Confirm assistant applications', html: body, showCancelButton: true, confirmButtonText: 'Start applications' });
    if (!answer.isConfirmed) return;
    const loader = AiStatus.overlay({ state: 'working', label: 'Processing your assistant queue. Each result will be saved to the workbook…' });
    let result;
    try {
      const edits = Object.fromEntries([...emailEdits].map(([id, f]) => [id, { subject: f.subject.value, body: f.text.value }]));
      result = await request('apply', { confirmation: preview.confirmation, edits, fillOnly: fillOnly.checked }); await reload();
    } finally { loader.close(); }
    if (fillOnly.checked) {
      $('apply-status').textContent = `${result.filled} form${result.filled === 1 ? '' : 's'} filled in an open browser window, nothing submitted. Review each one and click Submit yourself, then set the row to Applied.${result.notRun ? ` ${result.notRun} email or remote-browser job${result.notRun === 1 ? ' was' : 's were'} not run.` : ''}${result.blocked || result.needsInput > result.filled ? ' Some jobs stopped before filling; read their row notes.' : ''}`;
      return;
    }
    $('apply-status').textContent = `Submitted: ${result.submitted}. Needs input: ${result.needsInput}. Blocked: ${result.blocked}.${result.skipped ? ` ${result.skipped} changed after confirmation and need a fresh review.` : ''} Review row notes for the next steps.`;
  }));
  window.addEventListener('beforeunload', (event) => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
  controls();
  if (local) {
    const refreshAi = () => request('status').then((state) => {
      aiReady = Boolean(state.llm?.configured && state.studentFiles);
      $('search-ai-hint').textContent = aiReady ? `Uses ${state.llm.provider} (${state.llm.model}).` : 'Needs an AI provider (see API keys & AI provider above) and your uploaded student files.';
      controls(); renderQueue();
    }).catch(() => {});
    refreshAi();
    refreshPlan();
    document.querySelectorAll('input[name="search-mode"]').forEach((input) => input.addEventListener('change', refreshPlan));
    document.querySelectorAll('input[name="search-source"]').forEach((input) => input.addEventListener('change', syncSearch));
    window.addEventListener('settings-saved', () => { refreshAi(); refreshPlan(); });
    request('application-capabilities').then((capabilities) => {
      const how = [
        'Tailored jobs are filled in a browser on this computer and your CV and cover letter are uploaded.',
        capabilities.email?.available ? 'Jobs with an employer e-mail are sent with both documents attached.' : 'Jobs with an employer e-mail need email sending set up (npm run gmail:auth, or SMTP under API keys & email).',
        capabilities.browser?.available ? `Jobs without tailored documents go through ${capabilities.browser.server}; a required upload will ask for your input.` : '',
      ].filter(Boolean);
      $('apply-tools').textContent = how.join(' ');
    }).catch(() => { $('apply-tools').textContent = 'The application connection could not be checked. The assistant will stop if the browser tool is unavailable.'; });
    await Promise.allSettled([
      run('tracker-status', reload),
      request('application-settings').then((settings) => {
        $('apply-contact').textContent = settings.candidateEmail ? `Web forms use your saved contact email: ${settings.candidateEmail}. Email applications are sent from your connected mail account.` : 'Add your contact email in the profile editor before applying.';
      }).catch(() => { $('apply-contact').textContent = 'Check your contact email in the profile editor.'; }),
    ]);
  } else {
    board.load([], JSON.parse($('tracker-schema').textContent));
    status.textContent = 'Run npm run editor to load and edit your local Excel workbook.';
    $('search-run-status').textContent = 'Open the local editor to search from this page.';
    $('search-field').textContent = 'Needs the local editor to read your profile';
    $('search-plan').textContent = '';
    $('apply-status').textContent = 'Open the local editor to prepare and submit applications.';
    $('apply-contact').textContent = 'Your contact details are available in the local editor.';
    $('apply-tools').textContent = 'Application tools connect in the local editor.';
    renderQueue();
  }
  return { reload: () => run('tracker-status', reload) };
}
