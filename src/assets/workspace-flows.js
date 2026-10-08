// The three local workspace flows share one workbook snapshot and revision.
export async function initWorkspaceFlows({ local, api, Swal, dialog, readStrategy, applyStrategy, onRows }) {
  const $ = (id) => document.getElementById(id);
  let rows = [], columns = [], enums = {}, revision = null;
  let page = 0, dirty = false, loaded = false, busy = false;
  // Whether an AI provider and the student files are ready (set from the local server).
  let aiReady = false;
  const pageSize = 12;
  const status = $('tracker-status');
  const groups = {
    review: ['company', 'position', 'job_id', 'date_posted', 'match_score', 'job_url', 'city', 'deadline', 'date_found', 'opportunity_type', 'priority', 'role_fit', 'apply', 'applicant', 'status', 'assistant_state', 'next_action', 'notes'],
    contact: ['company', 'position', 'website', 'address', 'maps_link', 'commute', 'contact_person', 'contact_email', 'referral', 'phone'],
    requirements: ['company', 'position', 'opportunity_type', 'work_model', 'duration', 'start_date', 'deadline', 'full_part', 'internship_type', 'paid', 'salary', 'req_german', 'req_english', 'req_skills', 'missing_reqs', 'visa_req', 'match_score', 'why_match'],
    application: ['company', 'position', 'apply', 'applicant', 'tailored', 'documents_used', 'app_method', 'app_url', 'date_applied', 'follow_up', 'status', 'answer', 'interview_date', 'next_action', 'notes'],
  };
  const longFields = new Set(['position', 'notes', 'reason', 'req_skills', 'missing_reqs', 'why_match', 'benefits', 'response_summary']);
  const mutationIds = ['btn-add-row', 'btn-save-tracker', 'btn-reload-tracker', 'btn-apply-selected'];
  const filterIds = ['tracker-filter', 'tracker-opportunity-filter', 'tracker-city-filter', 'tracker-score-filter', 'tracker-status-filter', 'tracker-date-field', 'tracker-date-from', 'tracker-date-to', 'tracker-date-status-filter', 'tracker-decision-filter', 'tracker-applicant-filter', 'tracker-work-mode-filter', 'tracker-source-filter', 'tracker-link-filter', 'tracker-field-filter', 'tracker-value-filter'];

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

  function controls() {
    mutationIds.forEach((id) => { if ($(id)) $(id).disabled = !local || busy || (!loaded && id !== 'btn-reload-tracker'); });
    $('btn-start-search').disabled = !local || busy;
    $('btn-suggest-strategy').disabled = !local || busy || !aiReady;
    $('search-use-profile').disabled = !local || busy || !aiReady;
    document.querySelectorAll('.apply-tailor').forEach((button) => { button.disabled = !local || busy || !aiReady; });
    $('btn-save-strategy').disabled = !local || busy;
    document.querySelectorAll('#tracker-table input, #tracker-table select, #tracker-table textarea, #tracker-table button').forEach((input) => { input.disabled = busy; });
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

  function matchingRows() {
    const query = $('tracker-filter').value.trim().toLowerCase();
    const type = $('tracker-opportunity-filter').value;
    const city = $('tracker-city-filter').value;
    const minimum = $('tracker-score-filter').value;
    const dateField = $('tracker-date-field').value;
    const from = $('tracker-date-from').value;
    const to = $('tracker-date-to').value;
    const dateStatus = $('tracker-date-status-filter').value;
    const workMode = $('tracker-work-mode-filter').value;
    const source = $('tracker-source-filter').value;
    const link = $('tracker-link-filter').value;
    const field = $('tracker-field-filter').value;
    const value = $('tracker-value-filter').value.trim().toLowerCase();
    return rows.filter((row) =>
      (!query || Object.values(row).some((value) => String(value || '').toLowerCase().includes(query))) &&
      (!type || (type === '_unspecified' ? !row.opportunity_type : row.opportunity_type === type)) &&
      (!city || row.city === city) &&
      (!minimum || (minimum === '_unknown' ? row.match_score === '' || row.match_score == null : row.match_score !== '' && Number(row.match_score) >= Number(minimum))) &&
      (!from || Boolean(row[dateField]) && row[dateField] >= from) &&
      (!to || Boolean(row[dateField]) && row[dateField] <= to) &&
      (!dateStatus || (dateStatus === 'yes' ? Boolean(row[dateField]) : !row[dateField])) &&
      (!workMode || (workMode === '_unspecified' ? !row.work_model : row.work_model === workMode)) &&
      (!source || row.source === source) &&
      (!link || (link === 'yes' ? Boolean(row.job_url) : !row.job_url)) &&
      (!field || !value || String(row[field] || '').toLowerCase().includes(value)) &&
      (!$('tracker-decision-filter').value || row.apply === $('tracker-decision-filter').value) &&
      (!$('tracker-status-filter').value || row.status === $('tracker-status-filter').value) &&
      (!$('tracker-applicant-filter').value || (row.applicant || 'Me') === $('tracker-applicant-filter').value));
  }

  function render() {
    const choice = $('tracker-column-view').value;
    const visible = choice === 'all' ? columns : (groups[choice] || groups.review).map((key) => columns.find((col) => col.key === key)).filter(Boolean);
    const head = $('tracker-thead-tr'); head.replaceChildren();
    for (const label of [...visible.map((col) => col.header), 'Row actions']) {
      const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; head.append(th);
    }
    const matches = matchingRows();
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
        note.setAttribute('aria-label', `Note on ${column.header}, ${row.company || 'new job'}`); td.append(note); tr.append(td);
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
    $('tracker-table-wrap').hidden = false;
    $('tracker-total-count').textContent = `${matches.length} of ${rows.length} jobs`;
    $('tracker-filter-count').textContent = `${filterIds.filter(id => !['tracker-date-field', 'tracker-field-filter', 'tracker-value-filter'].includes(id) && $(id).value).length + ($('tracker-field-filter').value && $('tracker-value-filter').value ? 1 : 0)} active`;
    $('tracker-page').textContent = `Page ${page + 1} of ${pageCount}`;
    $('tracker-prev').disabled = page === 0; $('tracker-next').disabled = page === pageCount - 1;
    renderQueue(); onRows(rows); controls();
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
    const cityFilter = $('tracker-city-filter');
    const chosenCity = cityFilter.value;
    cityFilter.replaceChildren(new Option('Any city', ''), ...[...new Set(rows.map(row => row.city).filter(Boolean))].sort((a, b) => a.localeCompare(b)).map(city => new Option(city, city)));
    cityFilter.value = chosenCity;
    const fieldFilter = $('tracker-field-filter');
    const chosenField = fieldFilter.value;
    fieldFilter.replaceChildren(new Option('Choose a column', ''), ...columns.map(column => new Option(column.header, column.key)));
    fieldFilter.value = chosenField;
    const selected = $('tracker-status-filter').value;
    $('tracker-status-filter').replaceChildren(new Option('Any status', ''), ...optionsFor({ enum: 'statuses' }).map((value) => new Option(value, value)));
    $('tracker-status-filter').value = selected; render();
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

  for (const id of [...filterIds, 'tracker-column-view']) $(id).addEventListener('input', () => { page = 0; if (loaded) render(); });
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
  $('tracker-clear-filters').addEventListener('click', () => { filterIds.forEach(id => { $(id).value = id === 'tracker-date-field' ? 'date_posted' : ''; }); page = 0; if (loaded) render(); });
  $('tracker-prev').addEventListener('click', () => { page--; render(); });
  $('tracker-next').addEventListener('click', () => { page++; render(); });
  $('btn-add-row').addEventListener('click', () => {
    const row = Object.fromEntries(columns.map((column) => [column.key, '']));
    Object.assign(row, { id: `job-${crypto.randomUUID()}`, applicant: 'Me', status: 'To apply' });
    page = 0;
    filterIds.forEach((id) => { $(id).value = id === 'tracker-date-field' ? 'date_posted' : ''; });
    render(); editRow(row, true);
  });
  $('btn-save-tracker').addEventListener('click', () => run('tracker-status', async () => { status.textContent = 'Saving workbook…'; await save(); }));
  $('btn-reload-tracker').addEventListener('click', () => run('tracker-status', async () => {
    if (dirty) { const result = await Swal.fire({ ...dialog, title: 'Reload the Excel file?', text: 'This replaces your unsaved changes with the current workbook.', showCancelButton: true, confirmButtonText: 'Reload workbook' }); if (!result.isConfirmed) return; }
    await reload();
  }));
  $('btn-download-tracker').addEventListener('click', (event) => {
    event.preventDefault();
    run('tracker-status', async () => { await save(); const link = document.createElement('a'); link.href = api('excel'); link.download = 'job_search_tracker.xlsx'; link.click(); });
  });
  $('btn-start-search').addEventListener('click', () => run('search-run-status', async () => {
    const strategy = readStrategy();
    if (Object.values(strategy).some((values) => !values.length)) throw new Error('Choose at least one role, location, and opportunity type.');
    const loader = AiStatus.overlay({ state: 'searching', label: 'Searching for postings published today and checking each live page. This can take a few minutes…' });
    let result;
    try {
      if (dirty) await save();
      await request('search-strategy', strategy);
      result = await request('search', { useProfile: $('search-use-profile').checked });
      await reload();
    } finally { loader.close(); }
    const warnings = (result.warnings || []).join(' ');
    $('search-run-status').textContent = `${result.found ? `Verified ${result.found} postings published today. Added ${result.added} jobs` : 'No individual postings with a verified publication date of today were found'}. Your existing choices are preserved.${warnings ? ` ${warnings}` : result.unavailableServers?.length ? ' Some search connections were unavailable.' : ''}`;
  }));
  $('btn-suggest-strategy').addEventListener('click', () => run('search-run-status', async () => {
    const loader = AiStatus.overlay({ state: 'shaping', label: 'Reading your files to suggest roles…' });
    let suggestion;
    try { suggestion = await request('search-suggest', {}); } finally { loader.close(); }
    applyStrategy(suggestion);
    const count = suggestion.roles.length;
    $('search-run-status').textContent = count ? `Added ${count} role${count === 1 ? '' : 's'} to "Roles to look for". Review them, then save your strategy.` : 'No suggested role matched the list here. Pick your roles by hand.';
  }));
  $('btn-apply-selected').addEventListener('click', () => run('apply-status', async () => {
    await save();
    const preview = await request('apply-preview');
    if (!preview.count) { $('apply-status').textContent = 'Assign a job to Assistant and choose Yes with status To apply first.'; return; }
    const body = document.createElement('div');
    const intro = document.createElement('p'); intro.textContent = `Review these ${preview.count} applications before starting. The assistant will use your saved candidate details. Jobs assigned to Me stay with you.`; body.append(intro);
    const list = document.createElement('ul');
    (preview.rows || [preview.first]).forEach((row) => { const item = document.createElement('li'); item.textContent = `${row.company || 'Company to review'} — ${row.position} (${row.url || 'application URL missing'})`; list.append(item); }); body.append(list);
    const answer = await Swal.fire({ ...dialog, title: 'Confirm assistant applications', html: body, showCancelButton: true, confirmButtonText: 'Start applications' });
    if (!answer.isConfirmed) return;
    const loader = AiStatus.overlay({ state: 'working', label: 'Processing your assistant queue. Each result will be saved to the workbook…' });
    let result;
    try { result = await request('apply', { confirmation: preview.confirmation }); await reload(); } finally { loader.close(); }
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
    window.addEventListener('settings-saved', refreshAi);
    request('application-capabilities').then((capabilities) => {
      $('apply-tools').textContent = capabilities.browser?.available
        ? `Web forms are connected through ${capabilities.browser.server}. If a required document cannot be uploaded, the row will ask for your input.`
        : 'Browser submission is unavailable. Check your application tool connection; you can still open job links and apply yourself.';
    }).catch(() => { $('apply-tools').textContent = 'The application connection could not be checked. The assistant will stop if the browser tool is unavailable.'; });
    await Promise.allSettled([
      run('tracker-status', reload),
      request('application-settings').then((settings) => {
        $('apply-contact').textContent = settings.candidateEmail ? `Web forms use your saved contact email: ${settings.candidateEmail}. Sending email applications requires a connected email account.` : 'Add your contact email in the profile editor before submitting web forms. Sending email applications also requires a connected email account.';
      }).catch(() => { $('apply-contact').textContent = 'Check your contact email in the profile editor. Email sending is not connected.'; }),
    ]);
  } else {
    status.textContent = 'Run npm run editor to load and edit your local Excel workbook.';
    $('search-run-status').textContent = 'Open the local editor to search from this page.';
    $('apply-status').textContent = 'Open the local editor to prepare and submit applications.';
    $('apply-contact').textContent = 'Your contact details are available in the local editor.';
    $('apply-tools').textContent = 'Application tools connect in the local editor.';
    renderQueue();
  }
  return { reload: () => run('tracker-status', reload) };
}
