import { profileTable, groupSummary, correlate } from './profile.js';
import { toNumber } from './transform.js';
import { getChart, newSpec } from './registry.js';
import { applyData } from './dataio.js';
import { parseDateLabel, dateOrder, dateOrderIsGuess } from './timeaxis.js';

/** Lightweight descriptions, not a copy of the dataset per recommendation. */
export function recommendAnalysisCharts(table, profile = profileTable(table)) {
  if (!table.rows.length) return [];
  const copies = new Set(profile.duplicates.columns.flatMap((group) => group.slice(1)));
  const columns = profile.columns.filter((c) => !c.idLike && !copies.has(c.index));
  const measures = columns.filter((c) => c.type !== 'date' && c.numericCount >= 2
    && c.numericShare >= 0.5 && c.min !== c.max);
  const groups = columns.filter((c) => c.type !== 'date' && c.distinct >= 2 && c.distinct < c.filled);
  const buckets = [[], [], [], [], []];
  const add = (bucket, plan) => buckets[bucket].push({ ...plan,
    key: [plan.kind, plan.agg || '', ...plan.columns].join(':') });
  for (const group of groups) {
    add(0, { id: 'bar-horizontal', kind: 'count', group: group.index, columns: [group.index],
      title: `Counts by ${group.name}`, why: `${group.distinct} distinct filled values; count every occurrence, including a separate blank group.` });
    for (const measure of measures) {
      if (group.index === measure.index) continue;
      for (const [agg, label] of [['mean', 'Average'], ['median', 'Median'], ['sum', 'Total']]) {
        add(1, { id: 'bar-vertical', kind: 'group', agg, group: group.index, measure: measure.index,
          columns: [group.index, measure.index], title: `${label} ${measure.name} by ${group.name}`,
          why: `${label} of valid ${measure.name} values in each ${group.name} group.${agg === 'sum' ? ' Totals depend on group size and are useful when values are additive.' : ' Groups may contain different numbers of observations.'}` });
      }
    }
  }
  for (const measure of measures) {
    add(2, { id: 'histogram', kind: 'distribution', measure: measure.index, columns: [measure.index],
      title: `Distribution of ${measure.name}`, why: `See the spread of all ${measure.numericCount} valid values, including extremes.` });
  }
  // ponytail: O(columns²) lightweight plans; build only the visible page's data.
  // For thousands of measures, replace the list with a paginated plan iterator.
  for (let i = 0; i < measures.length; i++) {
    for (let j = i + 1; j < measures.length; j++) {
      const [x, y] = [measures[i], measures[j]];
      if ((x.numericCount < table.rows.length || y.numericCount < table.rows.length)
        && !table.rows.some((row) => Number.isFinite(toNumber(row[x.index])) && Number.isFinite(toNumber(row[y.index])))) continue;
      add(3, { id: 'scatter-basic', kind: 'relationship', columns: [x.index, y.index],
        x: x.index, y: y.index, title: `${x.name} vs ${y.name}`,
        why: 'Compare paired observations to explore a relationship. A pattern does not establish causation.' });
    }
  }
  for (const date of columns.filter((c) => c.type === 'date')) {
    const values = table.rows.map((row) => row[date.index]);
    const { dayFirst } = dateOrder(values);
    const moments = values.map((v) => parseDateLabel(v, dayFirst));
    if (new Set(moments.filter(Number.isFinite)).size < 2) continue;
    for (const measure of measures) {
      const pairedDates = new Set();
      for (let i = 0; i < table.rows.length && pairedDates.size < 2; i++) {
        if (Number.isFinite(moments[i]) && Number.isFinite(toNumber(table.rows[i][measure.index]))) pairedDates.add(moments[i]);
      }
      if (pairedDates.size < 2) continue;
      add(4, { id: 'line-basic', kind: 'trend', group: date.index, measure: measure.index,
        columns: [date.index, measure.index], title: `Average ${measure.name} over ${date.name}`,
        why: 'Order observations by date; repeated dates show the average of their valid measurements.' });
    }
  }
  // Interleave analyses so the first page is useful before any filtering.
  const plans = [];
  const longest = Math.max(...buckets.map((bucket) => bucket.length));
  for (let i = 0; i < longest; i++) for (const bucket of buckets) if (bucket[i]) plans.push(bucket[i]);
  return plans;
}

/** Build one view from all rows. Missing numbers are excluded, never zero-filled. */
export function buildAnalysisChart(source, plan) {
  if (!Array.isArray(plan.columns) || !plan.columns.length || plan.columns.some((i) => !Number.isInteger(i) || i < 0 || i >= source.headers.length)) {
    throw new Error('Choose columns from the imported table.');
  }
  let table;
  let usedRows = 0;
  let detail = '';
  if (plan.kind === 'count' || plan.kind === 'group') {
    const count = plan.kind === 'count';
    const summary = groupSummary(source, plan.group, plan.measure, count ? 'count' : plan.agg);
    usedRows = summary.reduce((sum, group) => sum + (count ? group.count : group.valid), 0);
    const valid = summary.filter((group) => Number.isFinite(group.value));
    valid.sort((a, b) => count ? b.count - a.count : a.key.localeCompare(b.key, undefined, { numeric: true }));
    table = { headers: [source.headers[plan.group], count ? 'Rows' : plan.title],
      rows: valid.map((group) => [group.key || '(blank)', String(group.value)]) };
    detail = `${valid.length} groups plotted${valid.length < summary.length ? `; ${summary.length - valid.length} groups have no valid measurements` : ''}.`;
  } else if (plan.kind === 'distribution') {
    const values = source.rows.map((row) => toNumber(row[plan.measure])).filter(Number.isFinite);
    usedRows = values.length;
    table = { headers: [source.headers[plan.measure]], rows: values.map((value) => [String(value)]) };
    detail = 'Bins cover the complete numeric range.';
  } else if (plan.kind === 'relationship') {
    const pairs = source.rows.map((row) => [toNumber(row[plan.x]), toNumber(row[plan.y])])
      .filter((pair) => pair.every(Number.isFinite));
    usedRows = pairs.length;
    table = { headers: [source.headers[plan.x], source.headers[plan.y]], rows: pairs.map((pair) => pair.map(String)) };
    const corr = correlate(pairs.map((pair) => pair[0]), pairs.map((pair) => pair[1]));
    detail = corr.r === null ? 'Not enough paired variation for Pearson correlation.' : `Pearson r = ${corr.r}; association is not causation.`;
  } else if (plan.kind === 'trend') {
    const labels = source.rows.map((row) => row[plan.group]);
    const { dayFirst } = dateOrder(labels);
    const rows = source.rows.map((row) => [parseDateLabel(row[plan.group], dayFirst), toNumber(row[plan.measure])])
      .filter((row) => row.every(Number.isFinite));
    usedRows = rows.length;
    const summary = groupSummary({ headers: ['Date', 'Value'], rows }, 0, 1, 'mean').sort((a, b) => Number(a.key) - Number(b.key));
    table = { headers: [source.headers[plan.group], `Average ${source.headers[plan.measure]}`],
      rows: summary.map((group) => [new Date(Number(group.key)).toISOString(), String(group.value)]) };
    detail = `${summary.length} dates, ordered in time. Repeated dates use the mean.`
      + (dateOrderIsGuess(labels) ? ' Ambiguous dates are read month first.' : '');
  } else {
    throw new Error('This analysis type is not supported.');
  }
  if (!table.rows.length) throw new Error(`No valid observations for this view in ${source.rows.length} rows. Missing values are not drawn as zero.`);
  const def = getChart(plan.id);
  if (!def) throw new Error('This chart type is not available.');
  const spec = newSpec(def);
  const applied = applyData(def, spec, table);
  if (!applied.ok) throw new Error(applied.message);
  for (const key of ['prefix', 'suffix', 'unit', 'xPrefix', 'xSuffix', 'yPrefix', 'ySuffix']) if (typeof spec.opts?.[key] === 'string') spec.opts[key] = '';
  if (plan.kind === 'relationship') {
    spec.label = plan.title;
    spec.opts.xTitle = table.headers[0]; spec.opts.yTitle = table.headers[1];
    for (const axis of ['x', 'y']) {
      let lo = Infinity; let hi = -Infinity;
      for (const point of spec.points) { lo = Math.min(lo, point[axis]); hi = Math.max(hi, point[axis]); }
      const pad = (hi - lo || Math.abs(lo) || 1) * 0.05;
      spec.opts[`${axis}Min`] = lo - pad; spec.opts[`${axis}Max`] = hi + pad;
    }
  }
  if (plan.kind === 'trend') { spec.opts.curve = 'straight'; spec.opts.tension = 0; }
  if (typeof def.onChange === 'function') def.onChange(spec);
  const sourceRows = source.rows.length;
  const excludedRows = sourceRows - usedRows;
  const note = `All ${sourceRows} source rows analyzed · ${usedRows} used · ${excludedRows} excluded${excludedRows ? ' (missing or invalid values)' : ''}. ${detail}`;
  spec.caption = { title: plan.title, subtitle: note };
  return { def, spec, table, note, sourceRows, usedRows, excludedRows };
}
