/**
 * recommend.js — which of these charts is a *good* idea, and why.
 *
 * **This deliberately reverses a rule stated elsewhere in this codebase.**
 * `DataMatch.js` says, and still says of itself:
 *
 *   > Nothing here decides whether a chart is a good way to show the data. It
 *   > decides whether the chart can read it, which is a question with an
 *   > answer. Ranking beyond that would be an opinion dressed as a result.
 *
 * That rule is right about `DataMatch` and wrong as a rule for the product. A
 * reader holding a spreadsheet is told "98 of 115 charts can read this", which
 * is true and almost useless: it is a list of everything, ordered by category.
 * The question they came with is which *one* to draw.
 *
 * So an opinion is offered — but never dressed as a result:
 *
 * - **Every suggestion states its reason**, in terms of the reader's own
 *   columns. "4 categories and one measure — a bar compares them directly."
 *   A score with no sentence is exactly the thing the old rule was protecting
 *   against, and none is shown.
 * - **The caution comes from `chart-help.js`**, which already names how each
 *   chart type misleads. A recommendation that cannot say what is wrong with
 *   its own suggestion is advertising.
 * - **It is advisory and cannot narrow anything.** `rankCharts` still decides
 *   what is *possible*; this only orders and explains. Nothing is hidden.
 * - **Nothing is invented.** A rule fires only when the profile actually
 *   supports it, and where no rule fires the reader is told that rather than
 *   handed a confident guess.
 */

import { CHARTS } from './registry.js';
import { CHART_HELP, helpFor } from './chart-help.js';

/**
 * The rules.
 *
 * Each looks at the profile and either returns nothing or names charts with a
 * reason written in the reader's own column names. Ordered strongest first;
 * the weight decides ranking when several fire on the same chart.
 *
 * They are deliberately few and legible. A hundred subtle rules would be
 * harder to defend than a dozen that each state a claim somebody can argue
 * with.
 */
const RULES = [
  {
    id: 'time-series',
    when: (p) => p.dates.length >= 1 && p.numbers.length >= 1,
    charts: (p) => (p.numbers.length > 1
      ? ['line-multi', 'area-stacked', 'line-basic']
      : ['line-basic', 'area-basic', 'bar-vertical']),
    weight: 100,
    why: (p) => `"${p.dates[0].name}" orders the rows in time and `
      + (p.numbers.length > 1
        ? `${p.numbers.length} columns measure something`
        : `"${p.numbers[0].name}" measures something`),
    encodes: (p) => (p.numbers.length > 1
      ? 'a line per measure shows how each moved.'
      : 'a line shows how it moved.'),
  },
  {
    id: 'few-categories',
    when: (p) => p.categories.length >= 1 && p.numbers.length >= 1
      && p.categories[0].distinct <= 12,
    charts: (p) => (p.numbers.length > 1
      ? ['bar-vertical', 'bar-stacked', 'radar-multi']
      : ['bar-vertical', 'bar-horizontal', 'bar-lollipop']),
    weight: 90,
    why: (p) => `${p.categories[0].distinct} values in "${p.categories[0].name}" and `
      + `${p.numbers.length === 1 ? 'one measure' : `${p.numbers.length} measures`}`,
    encodes: () => 'bars put them on a common baseline, which is what makes lengths comparable.',
  },
  {
    id: 'many-categories',
    when: (p) => p.categories.length >= 1 && p.numbers.length >= 1
      && p.categories[0].distinct > 12 && p.categories[0].distinct <= 60,
    charts: () => ['bar-horizontal', 'treemap', 'bar-lollipop'],
    weight: 80,
    why: (p) => `${p.categories[0].distinct} values in "${p.categories[0].name}" is too many `
      + 'for vertical bars to label',
    encodes: () => 'horizontal bars give each one a readable row.',
  },
  {
    id: 'correlation',
    when: (p) => p.correlations.length > 0,
    charts: () => ['scatter-basic', 'bubble', 'scatter-clusters'],
    weight: 85,
    why: (p) => {
      const c = p.correlations[0];
      const strength = Math.abs(c.r) >= 0.8 ? 'strongly' : 'noticeably';
      return `"${c.a}" and "${c.b}" move together ${strength} (r = ${c.r})`;
    },
    encodes: () => 'a scatter shows whether that holds across every row or comes from a few.',
  },
  {
    id: 'separation',
    when: (p) => p.separators.length > 0 && p.numbers.length >= 1,
    charts: () => ['box-plot', 'violin', 'bar-vertical'],
    weight: 75,
    why: (p) => {
      const s = p.separators[0];
      return `"${s.by}" splits "${s.measure}" into ${s.groups} groups whose averages `
        + 'differ markedly';
    },
    encodes: () => 'a box plot shows whether the spreads differ too, or only the middles.',
  },
  {
    id: 'distribution',
    when: (p) => p.numbers.length >= 1 && p.rows >= 30 && !p.categories.length,
    charts: () => ['histogram', 'box-plot', 'density-plot'],
    weight: 70,
    why: (p) => `${p.rows} rows and no column naming them, so the interesting question `
      + `about "${p.numbers[0].name}" is its shape`,
    encodes: () => 'a histogram shows that shape rather than any single value.',
  },
  {
    id: 'part-to-whole',
    when: (p) => p.categories.length >= 1 && p.numbers.length === 1
      && p.categories[0].distinct >= 2 && p.categories[0].distinct <= 5,
    charts: () => ['pie', 'doughnut', 'bar-vertical'],
    weight: 60,
    why: (p) => `Only ${p.categories[0].distinct} values in "${p.categories[0].name}"`,
    encodes: () => 'few enough that a pie stays readable, if these really are parts of one whole.',
  },
  {
    id: 'flow',
    when: (p) => p.categories.length >= 2 && p.numbers.length >= 1,
    charts: () => ['sankey', 'chord', 'parallel-sets'],
    weight: 65,
    why: (p) => `"${p.categories[0].name}" and "${p.categories[1].name}" both name things, `
      + 'with a measure beside them',
    encodes: () => 'that is a flow from one to the other.',
  },
  {
    id: 'two-way-table',
    when: (p) => p.categories.length >= 2 && p.numbers.length >= 1
      && p.categories[0].distinct * p.categories[1].distinct <= 400,
    charts: () => ['heatmap', 'echarts-heatmap'],
    weight: 55,
    why: (p) => `${p.categories[0].distinct} × ${p.categories[1].distinct} combinations of `
      + `"${p.categories[0].name}" and "${p.categories[1].name}"`,
    encodes: () => 'a grid shows the whole cross-section at once.',
  },
  {
    id: 'many-measures',
    when: (p) => p.numbers.length >= 4,
    charts: () => ['parallel-coords', 'radar-multi', 'heatmap'],
    weight: 50,
    why: (p) => `${p.numbers.length} measures per row, starting with "${p.numbers[0].name}"`,
    encodes: () => 'parallel axes compare their shapes without pretending they share a scale.',
  },
];

/**
 * Every chart id any rule can name.
 *
 * A rule naming a chart that does not exist is a rule that silently does
 * nothing — six of these were wrong on the first pass (`bar-grouped`,
 * `radar-basic`, `lollipop`, `scatter-groups`, `density`, `donut`), and the
 * only visible symptom was a suggestion list quietly one shorter than it
 * should have been. The suite checks this list against the registry.
 */
export function namedCharts() {
  const out = new Set();
  const measures = [{ name: 'n', distinct: 9 }, { name: 'n2', distinct: 9 }];
  // Two stubs, because several rules branch on how many measures there are and
  // one stub would leave the other branch unchecked — which is the same class
  // of silence this function exists to end.
  [1, 2].forEach((howMany) => {
    const stub = {
      rows: 100, cols: 4,
      numbers: measures.slice(0, howMany),
      categories: [{ name: 'c', distinct: 4 }, { name: 'c2', distinct: 4 }],
      dates: [{ name: 'd' }],
      correlations: [{ a: 'n', b: 'n2', r: 0.9 }],
      separators: [{ by: 'c', measure: 'n', groups: 4, spread: 0.5 }],
    };
    RULES.forEach((r) => r.charts(stub).forEach((id) => out.add(id)));
  });
  return [...out];
}

/**
 * Rank the charts that can read this table, best first, each with a reason.
 *
 * @param {object} profile from `profileTable`
 * @param {Set<string>|string[]} readable ids `rankCharts` says can read the table
 * @param {number} [limit]
 * @returns {{ suggestions: Array, reasons: string[] }}
 */
export function recommendCharts(profile, readable, limit = 6) {
  const canRead = readable instanceof Set ? readable : new Set(readable || []);
  const byId = new Map(CHARTS.map((d) => [d.id, d]));

  /** chart id → the best rule that named it. */
  const picked = new Map();
  const reasons = [];

  for (const rule of RULES) {
    let fires = false;
    try { fires = !!rule.when(profile); } catch { fires = false; }
    if (!fires) continue;

    let evidence;
    let encodes = '';
    try { evidence = rule.why(profile); } catch { continue; }
    try { encodes = rule.encodes(profile); } catch { encodes = ''; }
    reasons.push(encodes ? `${evidence} — ${encodes}` : evidence);

    const ids = rule.charts(profile);
    ids.forEach((id, i) => {
      // A chart nobody can draw from this table is not a suggestion, however
      // well the rule fits. `rankCharts` remains the authority on possible.
      if (!canRead.has(id) || !byId.has(id)) return;
      // Later charts in a rule are the alternatives, not the pick.
      const score = rule.weight - i * 4;
      const held = picked.get(id);
      if (!held || held.score < score) {
        picked.set(id, { id, score, evidence, encodes, rule: rule.id, lead: i === 0 });
      }
    });
  }

  const suggestions = [...picked.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => {
      const def = byId.get(s.id);
      const help = typeof helpFor === 'function' ? helpFor(def) : (CHART_HELP[s.id] || {});
      // **The evidence is the rule's; the encoding is the chart's.**
      //
      // A rule names three charts and used to hand all three the same
      // sentence — which was written about the first. So a radar was told
      // "bars put them on a common baseline", a treemap that horizontal bars
      // give it a readable row, and a bar chart that a pie stays readable.
      // The evidence half is about the reader's columns and is true of every
      // chart the rule named; only the encoding half belongs to one of them.
      // Alternatives take their own from `chart-help`, which is the table that
      // already describes how each chart encodes — the same place the caution
      // below comes from.
      const encoding = s.lead ? s.encodes : ((help && help.read) || s.encodes);
      return {
        def,
        id: s.id,
        why: encoding ? `${s.evidence} — ${encoding}` : s.evidence,
        // What is wrong with this suggestion, from the table that already
        // names how each chart type misleads.
        caution: (help && help.watch) || null,
      };
    });

  return { suggestions, reasons };
}

/**
 * One sentence about the table as a whole, for the top of the report.
 *
 * Says what was found rather than what it means — the meaning is the
 * suggestions' job, and doubling it here would be two things to keep true.
 */
export function summarise(profile) {
  const bits = [];
  bits.push(`${profile.rows} row${profile.rows === 1 ? '' : 's'}`);
  bits.push(`${profile.cols} column${profile.cols === 1 ? '' : 's'}`);
  const kinds = [];
  if (profile.dates.length) kinds.push(`${profile.dates.length} of dates`);
  if (profile.categories.length) kinds.push(`${profile.categories.length} naming things`);
  if (profile.numbers.length) kinds.push(`${profile.numbers.length} measuring things`);
  return bits.join(' · ') + (kinds.length ? ` — ${kinds.join(', ')}` : '');
}
