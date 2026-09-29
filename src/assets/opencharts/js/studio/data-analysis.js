import { groupSummary, correlate } from './profile.js';
import { AGGREGATES, toNumber } from './transform.js';
import { CHARTS, getChart, newSpec } from './registry.js';
import { applyData, toCSV } from './dataio.js';
import { renderChart, destroyInstance } from './engines.js';
import { onThemeChange } from './theme.js';
import { escapeHtml as esc } from './StudioApp.js';
import { recommendAnalysisCharts, buildAnalysisChart } from './analysis-charts.js';
import { handOff } from './DataMatch.js';

function downloadTable(table, filename) {
  const safe = (v) => typeof v === 'string' && /^(?:\s*[=+@\-]|[\t\r])/.test(v) ? `'${v}` : v ?? '';
  const text = toCSV(table.headers.map(safe), table.rows.map((row) => row.map(safe)));
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Plans are cheap; only the current page gets full data tables and renderers. */
function mountRecommendations(host, table, profile) {
  const plans = recommendAnalysisCharts(table, profile);
  const kinds = { count: 'Counts', group: 'Grouped calculations', distribution: 'Distributions', relationship: 'Relationships', trend: 'Time trends' };
  const usedColumns = new Set(plans.flatMap((plan) => plan.columns));
  host.innerHTML = `<h4>Recommended charts for your data</h4>
    <p class="dlg-note">${CHARTS.length} chart types can produce many more views of your data. Explore different columns and calculations, using all eligible rows with missing values explained.</p>
    <p data-charts-count class="analysis-chart-count" role="status"></p>
    <div class="analysis-controls analysis-chart-controls">
      <label>Analysis type<select data-chart-kind><option value="all">All analyses</option>${[...new Set(plans.map((plan) => plan.kind))].map((kind) => `<option value="${esc(kind)}">${esc(kinds[kind] || kind)}</option>`).join('')}</select></label>
      <label>Include column<select data-chart-column><option value="all">All columns</option>${profile.columns.filter((c) => usedColumns.has(c.index)).map((c) => `<option value="${c.index}">${esc(c.name)}</option>`).join('')}</select></label>
    </div>
    <div class="analysis-suggestions"></div>
    <div class="analysis-pager"><button class="btn btn-sm" type="button" data-charts-prev>Previous charts</button>
      <span data-charts-page role="status" aria-live="polite"></span><button class="btn btn-sm" type="button" data-charts-next>Next charts</button></div>`;
  const find = (selector) => host.querySelector(selector);
  const kind = find('[data-chart-kind]');
  const column = find('[data-chart-column]');
  const grid = find('.analysis-suggestions');
  const instances = [];
  const pageSize = 4;
  let page = 0;
  let disposed = false;
  const destroyCharts = () => instances.splice(0).forEach(destroyInstance);
  const render = () => {
    if (disposed) return;
    destroyCharts();
    const matches = plans.filter((plan) => (kind.value === 'all' || plan.kind === kind.value)
      && (column.value === 'all' || plan.columns.includes(Number(column.value))));
    const pages = Math.max(1, Math.ceil(matches.length / pageSize));
    page = Math.min(page, pages - 1);
    find('[data-charts-count]').textContent = `${plans.length} chart views recommended from ${profile.rows} rows · ${matches.length} match the selected options`;
    find('[data-charts-page]').textContent = matches.length
      ? `Charts ${page * pageSize + 1}–${Math.min((page + 1) * pageSize, matches.length)} of ${matches.length} · Page ${page + 1} of ${pages}`
      : 'No matching chart views';
    find('[data-charts-prev]').disabled = page === 0;
    find('[data-charts-next]').disabled = page + 1 >= pages;
    grid.replaceChildren();
    for (const plan of matches.slice(page * pageSize, (page + 1) * pageSize)) {
      const card = document.createElement('article');
      card.className = 'analysis-suggestion';
      card.dataset.plan = plan.key;
      card.innerHTML = `<h5>${esc(plan.title)}</h5><p class="dlg-note">${esc(plan.why)}</p>
        <div class="analysis-preview"></div><p class="dlg-note" data-chart-source></p>
        <div class="analysis-chart-actions"><a class="btn btn-sm" data-open-chart href="studio.html?chart=${encodeURIComponent(plan.id)}">Open in studio</a>
          <button class="btn btn-sm btn-ghost" type="button" data-chart-download>Download chart data</button></div>
        <p class="dlg-note" data-chart-status role="status"></p>`;
      grid.append(card);
      const status = card.querySelector('[data-chart-status]');
      try {
        const built = buildAnalysisChart(table, plan);
        const preview = card.querySelector('.analysis-preview');
        card.querySelector('[data-chart-source]').textContent = built.note;
        instances.push(renderChart(built.def, preview, built.spec, { height: 240, label: `${plan.title}. ${built.note}` }));
        const carry = (event) => {
          if (!handOff(built.table, { chart: plan.id, spec: built.spec })) {
            event.preventDefault();
            status.textContent = 'Your browser could not keep this chart for the studio. Download its data, or allow local storage and try again.';
          }
        };
        ['mousedown', 'click', 'auxclick'].forEach((event) => card.querySelector('[data-open-chart]').addEventListener(event, carry));
        card.querySelector('[data-chart-download]').addEventListener('click', () => downloadTable(built.table, 'opencharts-chart-data.csv'));
      } catch (error) {
        card.querySelector('.analysis-preview').hidden = true;
        card.querySelector('.analysis-chart-actions').hidden = true;
        status.textContent = error.message || 'This view could not be drawn from the selected columns.';
      }
    }
    if (!matches.length) {
      const empty = document.createElement('p'); empty.className = 'dlg-note';
      empty.textContent = plans.length ? 'Choose another column or analysis type to see more views.'
        : 'No automatic chart fits these values yet. Explore the calculations below or choose a chart from the library.';
      grid.append(empty);
    }
  };
  [kind, column].forEach((control) => control.addEventListener('change', () => { page = 0; render(); }));
  find('[data-charts-prev]').addEventListener('click', () => { page--; render(); });
  find('[data-charts-next]').addEventListener('click', () => { page++; render(); });
  const unsubscribe = onThemeChange(render);
  render();
  return () => { disposed = true; unsubscribe(); destroyCharts(); host.replaceChildren(); };
}

const format = (v) => typeof v === 'number'
  ? (Number.isFinite(v) ? v.toLocaleString(undefined, { maximumSignificantDigits: 7 }) : '—')
  : String(v ?? '—');

/** A local calculator, not a simulated AI answer. The source table is read-only. */
export function mountDataAnalysis(host, table, profile) {
  const columns = profile.columns;
  const numeric = columns.filter((c) => c.numericCount > 0 && c.type !== 'date');
  const groups = profile.groups;
  const initialGroup = groups.find((c) => c.type === 'number') || groups[0];
  const initialMeasure = numeric.find((c) => !c.idLike && !groups.includes(c))
    || numeric.find((c) => c.index !== initialGroup?.index) || numeric[0];
  const options = (cols) => cols.map((c) => `<option value="${c.index}">${esc(c.name)}</option>`).join('');
  host.hidden = false;
  host.innerHTML = `<div class="analysis-head"><div><h3>Analyze without AI</h3>
    <p class="dlg-note">All ${profile.rows} rows · Calculated on this device · No API key needed</p></div></div>
    <div class="analysis-facts">
      <span><b>${profile.rows}</b> data rows</span><span><b>${profile.cols}</b> columns</span>
      <span><b>${profile.duplicates.rowCount}</b> duplicate rows after the first</span>
      <span><b>${profile.duplicates.columnCount}</b> duplicate columns after the first</span>
    </div>
    <section class="analysis-recommendations" data-recommendations aria-label="Recommended charts"></section>
    <div class="analysis-calculator-head"><h4>Explore calculations</h4>
      <button class="btn btn-sm" type="button" data-export>Download results CSV</button></div>
    <div class="analysis-controls">
      <label>Analysis<select data-mode>
        <option value="group">Counts &amp; grouped calculations</option>
        <option value="columns">Every column's statistics</option>
        <option value="relationship">Compare two columns</option>
        <option value="duplicates">Repeated rows &amp; columns</option>
      </select></label>
      <label data-group-field>Group by<select data-group><option value="all">All rows</option>${options(columns)}</select></label>
      <label data-agg-field>Calculate<select data-agg>${AGGREGATES.map((a) => `<option value="${a.id}">${a.label}</option>`).join('')}</select></label>
      <label data-x-field hidden>X column<select data-x>${options(numeric)}</select></label>
      <label data-measure-field><span data-measure-label>Measure</span><select data-measure>${options(numeric)}</select></label>
    </div>
    <p class="analysis-result" role="status" aria-live="polite"></p>
    <p class="dlg-note" data-method></p>
    <div class="analysis-chart" hidden></div>
    <p class="dlg-note" data-chart-note hidden></p>
    <div class="analysis-table-wrap" tabindex="0" role="region" aria-label="Analysis results table"></div>
    <div class="analysis-pager analysis-results-pager"><button class="btn btn-sm" type="button" data-prev>Previous</button>
      <span data-page role="status"></span><button class="btn btn-sm" type="button" data-next>Next</button></div>
    <details class="analysis-findings"><summary>Relationships found in this table</summary><div data-findings></div></details>`;
  const find = (s) => host.querySelector(s);
  const mode = find('[data-mode]');
  const by = find('[data-group]');
  const agg = find('[data-agg]');
  const measure = find('[data-measure]');
  const x = find('[data-x]');
  const chartHost = find('.analysis-chart');
  const chartNote = find('[data-chart-note]');
  by.value = initialGroup ? String(initialGroup.index) : 'all';
  measure.value = String(initialMeasure?.index ?? '');
  x.value = String(initialGroup?.numericCount ? initialGroup.index : numeric[0]?.index ?? '');
  agg.value = initialMeasure && !initialMeasure.idLike && initialMeasure.index !== initialGroup?.index ? 'mean' : 'count';
  [...agg.options].forEach((o) => { o.disabled = !numeric.length && o.value !== 'count'; });
  mode.querySelector('[value="relationship"]').disabled = numeric.length < 2;
  let chart = null;
  let result = { headers: [], rows: [] };
  let plot = null;
  let page = 0;
  let sort = null;
  let disposed = false;
  const pageSize = 12;

  const sortedRows = () => {
    const rows = [...result.rows];
    if (sort) rows.sort((a, b) => {
      const av = a[sort.col]; const bv = b[sort.col];
      if (av == null) return bv == null ? 0 : 1;
      if (bv == null) return -1;
      return (typeof av === 'number' && typeof bv === 'number' ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true })) * sort.dir;
    });
    return rows;
  };
  const renderTable = () => {
    const rows = sortedRows();
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    page = Math.min(page, pages - 1);
    find('.analysis-table-wrap').innerHTML = `<table class="report-table"><caption>Calculated results — ${rows.length} rows</caption>
      <thead><tr>${result.headers.map((h, i) => `<th scope="col" aria-sort="${sort?.col === i ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-sort="${i}">${esc(h)}${sort?.col === i ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</button></th>`).join('')}</tr></thead>
      <tbody>${rows.slice(page * pageSize, (page + 1) * pageSize).map((row) => `<tr>${row.map((v) => `<td${typeof v === 'number' ? ' class="tnum"' : ''} title="${esc(String(v ?? 'No value'))}">${esc(format(v))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    find('[data-page]').textContent = `Page ${page + 1} of ${pages} · ${rows.length} result rows`;
    find('[data-prev]').disabled = page === 0;
    find('[data-next]').disabled = page + 1 >= pages;
    find('.analysis-results-pager').hidden = pages === 1;
    find('[data-export]').disabled = !rows.length;
    find('.analysis-table-wrap').querySelectorAll('[data-sort]').forEach((button) => {
      button.addEventListener('click', () => {
        const col = Number(button.dataset.sort);
        sort = { col, dir: sort?.col === col ? -sort.dir : 1 };
        page = 0;
        renderTable();
        find(`[data-sort="${col}"]`).focus();
      });
    });
  };

  const draw = () => {
    destroyInstance(chart);
    chart = null;
    chartHost.replaceChildren();
    chartHost.hidden = !plot;
    if (!plot || disposed) return;
    try {
      const def = getChart(plot.id);
      const spec = newSpec(def);
      const applied = applyData(def, spec, plot.table);
      if (!applied.ok) throw new Error(applied.message);
      for (const key of ['prefix', 'suffix', 'unit', 'xPrefix', 'xSuffix', 'yPrefix', 'ySuffix']) if (typeof spec.opts[key] === 'string') spec.opts[key] = '';
      if (plot.id === 'scatter-basic') {
        spec.opts.xTitle = plot.table.headers[0]; spec.opts.yTitle = plot.table.headers[1];
        spec.label = plot.title;
        for (const axis of ['x', 'y']) {
          const values = spec.points.map((p) => p[axis]);
          const lo = Math.min(...values); const hi = Math.max(...values);
          const pad = (hi - lo || Math.abs(lo) || 1) * 0.05;
          spec.opts[`${axis}Min`] = lo - pad; spec.opts[`${axis}Max`] = hi + pad;
        }
      }
      if (typeof def.onChange === 'function') def.onChange(spec);
      spec.caption = { title: plot.title };
      chartHost.setAttribute('aria-label', `${plot.title}. Exact values are in the results table below.`);
      chart = renderChart(def, chartHost, spec, { height: 300, label: `${plot.title}. Exact values are in the results table below.` });
    } catch {
      chartHost.hidden = true;
      chartNote.hidden = false;
      chartNote.textContent = 'Chart could not be drawn. The calculated results are available in the table and CSV.';
    }
  };

  const update = () => {
    page = 0; sort = null; plot = null;
    const kind = mode.value;
    const grouped = kind === 'group';
    const relationship = kind === 'relationship';
    const counting = agg.value === 'count';
    find('[data-group-field]').hidden = !grouped;
    find('[data-agg-field]').hidden = !grouped;
    find('[data-measure-field]').hidden = !(relationship || (grouped && !counting));
    find('[data-x-field]').hidden = !relationship;
    find('[data-measure-label]').textContent = relationship ? 'Y column' : 'Measure';
    chartNote.hidden = true;
    let message = '';
    let method = '';
    if (grouped) {
      const group = by.value === 'all' ? null : Number(by.value);
      const m = Number(measure.value);
      const calculation = AGGREGATES.find((a) => a.id === agg.value).label;
      const title = `${calculation}${counting ? '' : ` of ${columns[m].name}`} by ${group === null ? 'all rows' : columns[group].name}`;
      const summary = groupSummary(table, group, m, agg.value);
      summary.sort((a, b) => counting ? b.count - a.count : a.key.localeCompare(b.key, undefined, { numeric: true }));
      result = {
        headers: [group === null ? 'Group' : columns[group].name, 'Rows', ...(counting ? ['Share (%)'] : ['Valid numbers', 'Excluded', calculation])],
        rows: summary.map((g) => [g.key || '(blank)', g.count, ...(counting ? [g.count / profile.rows * 100] : [g.valid, g.count - g.valid, g.value])]),
      };
      const excluded = summary.reduce((n, g) => n + g.count - g.valid, 0);
      message = `${summary.length} group${summary.length === 1 ? '' : 's'} across all ${profile.rows} rows.`
        + (counting ? (group === null ? '' : ` ${profile.rows - summary.length} occurrences after the first in each group (including blanks).`)
          : ` ${profile.rows - excluded} valid measurements; ${excluded} excluded.`);
      method = counting ? 'Counts use trimmed, case-sensitive cell text. Blank cells form their own group. Repeated values are not necessarily duplicate records.'
        : 'Calculations use each valid numeric cell once. Blank cells and nonnumbers (such as — or N/A) are excluded, never replaced with zero. Rows and valid counts can differ between groups; unequal group sizes and other variables can affect comparisons.';
      const valid = summary.filter((g) => Number.isFinite(g.value));
      if (valid.length) {
        plot = { id: valid.length > 12 ? 'bar-horizontal' : 'bar-vertical', title, table: { headers: [result.headers[0], counting ? 'Rows' : `${calculation}: ${columns[m].name}`],
          rows: valid.map((g) => [g.key || '(blank)', String(g.value)]) } };
      }
      chartNote.textContent = `${title}. All ${valid.length} valid groups are plotted.`
        + (valid.length > 30 ? ' Labels may be crowded; exact values are in the table and CSV.' : '')
        + (valid.length < summary.length ? ` ${summary.length - valid.length} groups have no numeric values and are omitted from the chart.` : '');
      chartNote.hidden = false;
    } else if (kind === 'columns') {
      result = { headers: ['Column', 'Valid numbers', 'Missing', 'Nonnumeric', 'Distinct filled', 'Repeated filled', 'Average', 'Median', 'Total', 'Minimum', 'Maximum', 'Std dev (population)'],
        rows: columns.map((c) => [c.name, c.numericCount, c.missing, c.invalid, c.distinct, c.repeated, c.mean, c.median, c.sum, c.min, c.max, c.stdev]) };
      message = `Statistics for all ${profile.cols} columns, using all ${profile.rows} rows.`;
      method = 'Average = total ÷ valid numeric cells. Statistics describe stored values, not unrounded measurements. Standard deviation uses the population denominator (valid count). Text-only columns have no numeric average; identifier averages may not be meaningful. Repeated filled = filled cells minus distinct trimmed text values.';
    } else if (relationship) {
      const a = Number(x.value); const b = Number(measure.value);
      const corr = correlate(table.rows.map((r) => r[a]), table.rows.map((r) => r[b]));
      result = { headers: ['Data row', columns[a].name, columns[b].name], rows: table.rows.map((r, i) => [i + 1, toNumber(r[a]), toNumber(r[b])]).filter((r) => Number.isFinite(r[1]) && Number.isFinite(r[2])) };
      message = a === b ? 'Choose two different columns.'
        : `${corr.n} paired numeric rows; ${profile.rows - corr.n} excluded. `
          + (corr.r === null ? 'Pearson r is unavailable: need at least 3 paired values and variation in both columns.' : `Pearson r = ${format(corr.r)} (${corr.r < 0 ? 'negative' : corr.r > 0 ? 'positive' : 'no'} linear association).`);
      method = 'Correlation is not causation and does not establish statistical significance. Outliers, repeated experiments, and other variables can affect it.'
        + (corr.n < 12 ? ' This is a small sample; interpret cautiously.' : '');
      if (a !== b && result.rows.length) plot = { id: 'scatter-basic', title: `${columns[a].name} vs ${columns[b].name}`,
        table: { headers: [columns[a].name, columns[b].name], rows: result.rows.map((r) => r.slice(1).map(String)) } };
    } else {
      const d = profile.duplicates;
      result = { headers: ['Repeated item', 'Occurrences', 'Extra copies', 'Matching positions'], rows: [
        ...d.rows.map((g) => ['Row', g.length, g.length - 1, g.map((i) => `Data row ${i + 1}`).join(', ')]),
        ...d.columns.map((g) => ['Column', g.length, g.length - 1, g.map((i) => `${i + 1}: ${columns[i].name}`).join(' = ')]),
      ] };
      message = `${d.rowCount} extra duplicate rows in ${d.rows.length} groups; ${d.columnCount} extra duplicate columns in ${d.columns.length} groups.`;
      method = 'Rows match across every column, including identifiers. Columns match down every data row; their headers may differ. Comparison uses trimmed, case-sensitive cell text, with blank and absent cells equivalent. Positions start at data row 1 after headers/title rows. Nothing is deleted.';
    }
    find('.analysis-result').textContent = message;
    find('[data-method]').textContent = method;
    renderTable();
    draw();
  };

  const findings = find('[data-findings]');
  const addFinding = (label, choose) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'btn btn-sm'; button.textContent = label;
    button.addEventListener('click', () => { choose(); update(); mode.focus(); });
    findings.appendChild(button);
  };
  groups.slice(0, 6).forEach((c) => addFinding(`${c.name}: ${c.distinct} distinct values across ${c.filled} filled rows`, () => {
    mode.value = 'group'; by.value = String(c.index); agg.value = 'count';
  }));
  profile.correlations.slice(0, 3).forEach((c) => addFinding(`${c.a} ↔ ${c.b}: r = ${format(c.r)}, n = ${c.n}`, () => {
    mode.value = 'relationship'; x.value = String(c.aIndex); measure.value = String(c.bIndex);
  }));
  const caveat = document.createElement('p');
  caveat.className = 'dlg-note';
  caveat.textContent = 'These are exploratory patterns, not causal conclusions. Automatic relationships omit identifiers, constants and duplicate columns; choose any two numeric columns above to inspect them.'
    + (profile.relationshipsLimited ? ' Automatic scanning is limited to the first 40 eligible measures and grouping columns.' : '');
  findings.appendChild(caveat);
  [mode, by, agg, measure, x].forEach((control) => control.addEventListener('change', update));
  find('[data-prev]').addEventListener('click', () => { page--; renderTable(); });
  find('[data-next]').addEventListener('click', () => { page++; renderTable(); });
  find('[data-export]').addEventListener('click', () => {
    downloadTable({ headers: result.headers, rows: sortedRows() }, 'opencharts-analysis.csv');
  });
  const unsubscribe = onThemeChange(draw);
  update();
  const disposeRecommendations = mountRecommendations(find('[data-recommendations]'), table, profile);
  return () => { disposed = true; unsubscribe(); disposeRecommendations(); destroyInstance(chart); host.replaceChildren(); host.hidden = true; };
}
