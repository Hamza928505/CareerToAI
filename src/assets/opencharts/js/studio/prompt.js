/**
 * prompt.js — the copy-and-paste brief that turns somebody's spreadsheet into
 * this exact chart.
 *
 * The studio already answers "how do I build this chart?" for a reader willing
 * to edit code. This answers it for a reader who would rather hand the job,
 * and their own file, to an assistant. It is the same three facts the studio
 * is built on, written out as prose an AI can follow:
 *
 *   what the chart is        title, blurb, and how it misleads
 *   what table it reads      the columns, their roles, and a worked example
 *   what code draws it       the Standalone export, already working
 *
 * Every part is derived, never hand-maintained. The column list comes from the
 * schema's own `example`, the roles from that example's first row of data, and
 * the template from the same `generateCode` the code tabs show — so a prompt
 * cannot describe a format the chart does not read, or ship code the studio
 * would not have produced.
 *
 * It asks for two outputs on purpose. The CSV is the way back into the studio
 * — paste it into the data editor and keep editing; the page is the way out of
 * it. Offering only the code would make the platform a dead end.
 *
 * Two modes, because there are two questions:
 *
 *   full   format + working code. The assistant returns a page that runs.
 *   data   format only. The assistant returns a table to paste into the editor.
 *
 * `data` exists because the template is roughly 70% of the message, and when
 * all somebody wants is their spreadsheet reshaped, every byte of it is
 * overhead. It is not the default: without the code an assistant writes the
 * chart from its own memory of Chart.js or D3, which renders *a* chart rather
 * than this one — the options, the palette and the helpers all drift.
 *
 * Dropping the code would not shorten the message by dropping *data*, either.
 * The template is mostly drawing code: a flow map is 13.5KB of JavaScript
 * carrying 0.8KB of data, and the rest is the projection and geo helpers no
 * assistant reconstructs from memory. That is the part worth sending.
 */

import { expectedFormat, columnRules, countOf, looksNumeric, toCSV } from './dataio.js';
import { helpFor } from './chart-help.js';
import { engineOf, ENGINE_LABEL } from './engines.js';
import { CHARTS, CATEGORIES } from './registry.js';
import { isFaceted, panelCount, facetSource, scaleSharing } from './facet.js';

/**
 * Where the source lives.
 *
 * The *site* links are derived from `location` so they are right wherever the
 * project is served from. This one cannot be, and is the only hard-coded URL
 * in the file — keep it in step with `package.json`'s `repository`.
 *
 * The repository was renamed from `Charts`, and GitHub redirects the old name,
 * so a stale `git remote` keeps working and proves nothing about the current
 * one. Check the repository field, not the remote.
 */
const REPO_URL = 'https://github.com/Hamza928505/OpenCharts';

/**
 * Where the data sits in the generated code, per renderer.
 *
 * The template is not uniform: `build()` runs before serialisation for the
 * Chart.js charts, so those carry a finished `config` and no spec at all,
 * while the hand-drawn ones carry the spec their `draw`/`mount` reads. Telling
 * an assistant to "edit the spec" would be wrong for forty of the ninety-eight.
 */
const WHERE_DATA_LIVES = {
  chartjs: 'The data is inside the `config` object — the labels and the datasets. '
    + 'Edit those and leave the options, scales and callbacks alone.',
  canvas: 'The data is the `spec` object at the top. The `draw` function below it reads '
    + 'the spec and must not be edited — it is the chart.',
  d3: 'The data is the `spec` object at the top. The `mount` function below it reads the '
    + 'spec and must not be edited — it is the chart.',
  dom: 'The data is the `spec` object at the top. The `mount` function below it reads the '
    + 'spec and must not be edited — it is the chart.',
  native: 'The data is the `data` object; `config` beside it holds the options. Edit `data` '
    + 'and leave `config` alone.',
};

/**
 * How one row of each shape is read, in a sentence.
 *
 * The column names alone are not enough for the shapes that read a row as a
 * structure rather than a record: `Ad, Visit, Checkout, 320` is a path, not
 * three fields, and an assistant told only "four columns" will write it as one
 * hop and lose the middle stage.
 */
export const SHAPE_GUIDE = {
  labelSeries: 'One row per category. The first column is the category name; every column after it is a separate series, named by its heading.',
  rowSeries: 'One row per series — the transpose of the usual spreadsheet. The first column names the series and every column after it is one of its points, in order. Do not transpose this into columns.',
  labelValue: 'One row per category: a name and a single number.',
  items: 'One row per item: a name, its value, and any further named fields the heading row declares.',
  pairs: 'One row per item, carrying two comparable numbers — the two ends of the same measurement.',
  observations: 'One row per observation, not per category. A group measured forty times has forty rows. Repeated group names are expected: they are what gives the chart its distribution.',
  links: 'One row is a whole path, not a single hop. `A, B, C, 240` means 240 flowed A to B and the same 240 on from B to C. A hop appearing in two paths is summed into one ribbon, so never write the same hop twice to make the totals add up.',
  dimensions: 'One row per record, one column per dimension, and the count last. The dimensions are named by the heading row, so those headings are part of the data — keep my own names for them.',
  edges: 'One row per connection: two node names and nothing else. The nodes are whatever names appear.',
  tree: 'One row per leaf. A level may be its own column, or a `Parent > Child > Leaf` path in a single cell, or both in the same table. The value comes last.',
  xyGroups: 'One row per point: a group name, an x and a y — or just x and y if there is only one group.',
  places: 'One row per place: a name, a longitude, a latitude and a value, in that order. Longitude is first — it is the east-west one, and swapping the pair puts every mark in the sea.',
  regions: 'One row per country: the country name and its value. Spell countries out in full.',
  ohlc: 'One row per period: open, high, low and close, in that order. A leading date column is ignored, so it is safe to keep one.',
  matrix: 'One row per matrix row: a row label, then one number per cell. The heading row names the columns.',
};

/** Which columns hold words, according to the rule the data grid validates by. */
function columnRoles(expected, shape) {
  const { columns } = expected;
  if (!columns.length) return [];
  const textCount = countOf(columnRules(shape).text, columns, 1);
  return columns.map((name, i) => ({ name, role: i < textCount ? 'text' : 'number' }));
}

/**
 * Refine those roles against the example's own first data row, which cannot be
 * wrong about itself.
 *
 * The rule is a good default but is stated per shape, not per chart: `ohlc`
 * inherits "one leading text column" and would announce `open` as text.
 */
function rolesFromExample(expected, shape, example) {
  const roles = columnRoles(expected, shape);
  const firstRow = String(example || '').split('\n')[1];
  if (!roles.length || !firstRow) return roles;

  const cells = firstRow.split(/[,\t;]/).map((c) => c.trim());
  // Only correct where the example has a cell to speak for: a chart whose
  // example runs out mid-row keeps the rule's answer for the rest.
  return roles.map((col, i) => (
    i < cells.length && cells[i] !== ''
      ? { ...col, role: looksNumeric(cells[i]) ? 'number' : 'text' }
      : col
  ));
}

/**
 * How to caption the column list, given that the list is the example's columns
 * and the constraint is the shape's.
 *
 * Those two numbers differ more often than not — `places` accepts three
 * columns but its example carries four — and printing only the constraint
 * captions a list of four with the words "3 columns".
 */
function columnCount(expected, shown) {
  const n = (k) => `${k} column${k === 1 ? '' : 's'}`;
  if (expected.exact) return `exactly ${n(expected.exact)}`;
  if (expected.min < shown) return `at least ${n(expected.min)}; the example below uses ${shown}`;
  if (expected.reads === Infinity) return `at least ${n(shown)}`;
  return n(shown);
}

/**
 * The current table, trimmed to as much as demonstrates the layout.
 *
 * This block exists to show where a column ends up in the code, and twelve
 * rows of a box plot's 150 observations show that exactly as well as all of
 * them. The full data is in the template below either way, so nothing is lost
 * — but it is said out loud rather than quietly cut.
 */
function previewTable(csv, keep, hasTemplate) {
  const lines = csv.split('\n');
  if (lines.length <= keep + 2) return csv;
  const dropped = lines.length - 1 - keep;
  return [
    ...lines.slice(0, keep + 1),
    `… and ${dropped} more rows`
      + (hasTemplate ? ' — the full data is in the template below.' : '.'),
  ].join('\n');
}

/* Which kind of prompt the reader last asked for, shared by the studio panel
   and the gallery tiles so one choice answers for both. */
const MODE_KEY = 'opencharts.prompt-mode';

export const PROMPT_MODES = [
  { id: 'full', label: 'Full', note: 'Carries the working code, so what comes back is a page that runs.' },
  { id: 'data', label: 'Data only', note: 'Format only, no code — for reshaping a spreadsheet to paste back in here.' },
];

export function readPromptMode() {
  try {
    return localStorage.getItem(MODE_KEY) === 'data' ? 'data' : 'full';
  } catch { return 'full'; }
}

export function writePromptMode(mode) {
  try { localStorage.setItem(MODE_KEY, mode === 'data' ? 'data' : 'full'); } catch { /* private mode */ }
}

/**
 * The other charts that read this exact table.
 *
 * The single most useful thing to say when the answer is "this is the wrong
 * chart": a sibling on the same shape takes the reader's CSV unchanged, so
 * switching costs nothing. Derived from the schema table, so it cannot name a
 * chart that would not in fact read the same columns.
 */
function siblings(def, limit = 10) {
  const shape = (def.data || {}).shape;
  if (!shape) return { names: [], more: 0 };
  const all = CHARTS.filter((c) => c !== def && c.data && c.data.shape === shape);
  return {
    names: all.slice(0, limit).map((c) => c.title),
    more: Math.max(0, all.length - limit),
  };
}

/**
 * Hard-wrap prose to the 80 columns the rest of this file is written to, so a
 * line assembled from data reads like the lines authored around it.
 *
 * `indent` applies to continuation lines only — the caller owns the first
 * line, bullet marker and all, which is what keeps a wrapped list item a list
 * item.
 */
function wrap(text, indent = '', width = 78) {
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const pad = out.length ? indent : '';
    if (line && (pad + line + ' ' + word).length > width) { out.push(pad + line); line = word; }
    else line = line ? line + ' ' + word : word;
  }
  if (line) out.push((out.length ? indent : '') + line);
  return out;
}

/** An absolute link back, so the prompt still works pasted somewhere else. */
function pageUrl(file) {
  try {
    return new URL(file, location.href).toString();
  } catch {
    return file;
  }
}

/**
 * The brief for one chart, as its current spec draws it.
 *
 * @param {object} def   chart definition
 * @param {object} spec  the live spec — so the prompt carries what is on
 *                       screen, not the library default
 * @param {object} code  the output of `generateCode(def, spec)`
 * @param {'full'|'data'} [mode] 'data' drops the template and asks only for the
 *                       reshaped table. See the note at the top of this file.
 * @returns {string} plain text, ready for the clipboard
 */
export function buildPrompt(def, spec, code, mode = 'full') {
  const withCode = mode !== 'data';
  const help = helpFor(def);
  const desc = def.data || {};
  const expected = desc.shape ? expectedFormat(def) : null;
  const roles = expected ? rolesFromExample(expected, desc.shape, desc.example) : [];
  const guide = SHAPE_GUIDE[desc.shape];
  const studio = pageUrl(`studio.html?chart=${encodeURIComponent(def.id)}`);

  // What the template is drawing right now. Showing the table and the code it
  // produces side by side demonstrates the substitution rather than describing
  // it, which is the part an assistant most often gets wrong.
  let current = '';
  try {
    // A chart split by a column holds the split in the facet, not in the spec,
    // so `toText` writes the table with that column already spent. The brief
    // has to show the file the reader actually has — the one with the column
    // that decides which panel a row lands in.
    const source = facetSource(spec);
    if (source) {
      current = toCSV(source.headers, source.rows).trim();
    } else if (typeof def.toText === 'function') {
      current = String(def.toText(spec) || '').trim();
    }
  } catch { /* a spec the writer cannot serialise still gets the rest of the brief */ }

  const named = /chart|map|plot|diagram|graph/i.test(def.title);
  const L = [];

  const kind = `${def.title}${named ? '' : ' chart'}`;

  if (withCode) {
    L.push(`# Draw my data as a ${kind}`);
    L.push('');
    L.push('I have attached my own data — a spreadsheet or CSV. Rebuild the chart at the');
    L.push('bottom of this message with my numbers in place of the example ones.');
    L.push('');
    L.push('That template is a complete, working page from OpenCharts, an open-source chart');
    L.push('library. It already renders correctly. Your job is to swap in my data and change');
    L.push('nothing else.');
  } else {
    L.push(`# Reshape my data for a ${kind}`);
    L.push('');
    L.push('I have attached my own data — a spreadsheet or CSV. I am going to draw it as');
    L.push('the chart described below, in an editor that already knows how to build it, so');
    L.push('I do not need any code from you. I need the table.');
    L.push('');
    L.push('Convert my file into the exact format set out below and give it back as CSV.');
  }
  L.push('');

  /* ── 1. the chart ──────────────────────────────────────────────────────── */
  L.push('## 1. The chart');
  L.push('');
  L.push(...wrap(`**${def.title}** (${def.category}) — ${def.blurb}`));
  L.push('');
  L.push(`Drawn with ${ENGINE_LABEL[engineOf(def)]}.`);
  if (isFaceted(spec)) {
    const n = panelCount(def, spec);
    const by = spec.facet.kind === 'series' ? 'series' : spec.facet.by;
    const share = scaleSharing(def);
    L.push('');
    L.push(...wrap(`Shown as **small multiples**: ${n} copies of this chart side by side, `
      + `one per ${by}. `
      + (share.can && spec.facet.scales !== 'free'
        ? 'They are drawn to one shared axis, so panel heights can be compared directly.'
        : 'Each panel is scaled to its own data, so their shapes compare and their heights do not.')));
  }
  if (help) {
    L.push('');
    L.push(...wrap(`- **How it is read:** ${help.read}`, '  '));
    L.push(...wrap(`- **How it misleads:** ${help.watch}`, '  '));
  }
  L.push('');

  /* ── 2. the table ──────────────────────────────────────────────────────── */
  if (expected) {
    L.push('## 2. The table this chart reads');
    L.push('');
    if (guide) { L.push(...wrap(guide)); L.push(''); }
    if (roles.length) {
      L.push(`Columns (${columnCount(expected, roles.length)}):`);
      L.push('');
      roles.forEach((c, i) => L.push(`${i + 1}. \`${c.name}\` — ${c.role === 'text' ? 'text' : 'a number'}`));
      L.push('');
    }
    // The example below is one panel's worth of columns, and a split table has
    // one more than that. Saying so here is the difference between a brief an
    // assistant can follow and one whose column count contradicts its own
    // sample table further down.
    if (isFaceted(spec) && spec.facet.kind === 'value') {
      L.push(...wrap(`Plus one more column, \`${spec.facet.by}\`, which is not drawn: it says `
        + `which panel each row belongs to. The example below shows one panel's columns; `
        + `your table carries \`${spec.facet.by}\` alongside them.`));
      L.push('');
    }
    // `expected.grows` is deliberately not printed: it restates the shape guide
    // above in a clause built to follow different words, and on the map shapes
    // it lands as a sentence fragment.
    if (expected.hint) { L.push(...wrap(expected.hint)); L.push(''); }
    L.push('A header row naming the columns is expected. The shape looks like this:');
    L.push('');
    L.push('```csv');
    L.push(String(desc.example || '').trim());
    L.push('```');
    L.push('');
    if (current) {
      if (withCode) {
        L.push('The template below currently draws this exact table, so you can see where');
        L.push('each column ends up in the code:');
      } else {
        L.push('For reference, this is the table the chart is holding right now — yours');
        L.push('should look like this, with your own column names and values:');
      }
      L.push('');
      L.push('```csv');
      L.push(previewTable(current, 12, withCode));
      L.push('```');
      L.push('');
    }
  }

  /* ── 3. the job ────────────────────────────────────────────────────────── */
  L.push(`## ${expected ? 3 : 2}. What to do`);
  L.push('');
  L.push('1. Read my attached file and work out which of its columns hold the labels and');
  L.push('   which hold the numbers. If that is genuinely ambiguous, take the most likely');
  L.push('   reading, say in one line which you took, and carry on.');
  if (expected) {
    L.push('2. Reshape it into the format above. Keep my values exactly as they are — do');
    L.push('   not round them, fill in gaps, invent rows, reorder them or convert units');
    L.push('   unless I ask. Leave a genuinely missing number blank.');
  } else {
    L.push('2. Keep my values exactly as they are — do not round them, fill in gaps,');
    L.push('   invent rows, reorder them or convert units unless I ask.');
  }
  if (withCode) {
    L.push('3. Then give me both of the following.');
    L.push('');

    L.push('**Output A — the table.** The reshaped CSV, in a code block on its own. I');
    L.push('can paste that straight into the chart editor — open the data editor, then the');
    L.push('Paste tab — if I want to keep working on it there:');
    L.push(`<${studio}>`);
    L.push('');

    L.push('**Output B — the page.** The whole template below, reproduced in full, with only');
    L.push('the data changed. Specifically:');
    L.push('');
    L.push('- Change only the values, the labels and the series names. Leave the layout,');
    L.push('  the options, the helper functions and the drawing code exactly as they are.');
    L.push('- Keep every `<script>` tag and its version exactly as written. Do not switch to');
    L.push('  a different charting library, a different version, or a build step.');
    L.push('- Take the series names from my column headings and the category labels from my');
    L.push('  rows. Do not leave any of the example\'s wording in place.');
    L.push('- If my data has more or fewer series than the example, extend or trim the');
    L.push('  arrays to match, and give each new one its own colour in the style of the');
    L.push('  colours already there.');
    L.push('- Update any title, axis label, unit or currency prefix that would otherwise');
    L.push('  still be describing the example data.');
    L.push('- Return one complete file I can save as `.html` and open in a browser. Do not');
    L.push('  abbreviate it with comments like "rest unchanged".');
    L.push('');
    L.push(...wrap(WHERE_DATA_LIVES[engineOf(def)] || WHERE_DATA_LIVES.canvas));
    L.push('');
    // `WHERE_DATA_LIVES` names the one identifier a single chart's data sits
    // in. A faceted template has that identifier per panel inside `panels`,
    // so an instruction to edit "the spec" would send the assistant looking
    // for something the file does not contain.
    if (isFaceted(spec)) {
      L.push(...wrap(`This template draws a grid: \`panels\` holds one entry per panel, and `
        + `each entry is a complete, independent chart with its own copy of that data. `
        + `Give every entry its own slice of my file, and add or remove entries so there `
        + `is exactly one panel per ${spec.facet.kind === 'series' ? 'series' : `value of ${spec.facet.by}`}. `
        + `Keep the panel names in step with the data you put in them.`));
      L.push('');
    }
    L.push('Every value the chart draws is written into the file as a literal — nothing is');
    L.push('fetched, generated or randomised at runtime, so there is no data source to');
    L.push('repoint. If my file is a different size from the example, change how many');
    L.push('entries the arrays hold rather than making my data fit the old count, and keep');
    L.push('any parallel array — colours especially — the same length as the one it');
    L.push('describes.');
  } else {
    L.push('3. Give me the finished table as CSV, in a code block on its own, with the');
    L.push('   header row included and nothing else inside the block — any commentary');
    L.push('   belongs outside it. I am pasting it straight into the editor at:');
    L.push(`   <${studio}>`);
    L.push('');
    L.push('- Use my own words for the column headings and row labels. They become the');
    L.push('  names on the chart, so they should read the way I wrote them.');
    L.push('- Do not write any HTML, JavaScript or charting code. The editor draws it.');
    L.push('- If my file has more columns than this chart reads, say which ones you left');
    L.push('  out and why, rather than dropping them silently.');
  }
  /* ── if this is the wrong chart ─────────────────────────────────────────── */
  // A brief that only knows one chart is a dead end the moment the data does
  // not suit it. The sibling list is the way out that costs the reader nothing,
  // because those charts read the table they already have.
  L.push('');
  L.push(`## ${expected ? 4 : 3}. If this is the wrong chart for my data`);
  L.push('');
  L.push(`This is one of ${CHARTS.length} charts in OpenCharts, across ${CATEGORIES.length} categories. Do not force my`);
  L.push('data into it. If the shape is wrong — the wrong number of columns, the wrong');
  L.push('kind of values, or far more rows than it can show — say so plainly and tell me');
  L.push('what would suit it better. Two things that help:');
  L.push('');

  const kin = siblings(def);
  if (kin.names.length) {
    L.push('- **These read exactly the same table**, so switching costs me nothing, and');
    L.push('  you should name one of them first if it fits better than this one:');
    const list = `${kin.names.join(', ')}${kin.more ? `, and ${kin.more} more` : ''}.`;
    // Every line of this one is a continuation of the bullet above it, so the
    // first gets the indent too — `wrap` only owns the ones after it.
    L.push(...wrap(list, '  ').map((l, i) => (i ? l : '  ' + l)));
  }
  L.push('- **Paste my table into the library** and it narrows itself to every chart');
  L.push('  that can read it, so I can pick from what actually fits. Tell me to do that');
  L.push('  if you are unsure which to recommend:');
  L.push(`  <${pageUrl('index.html')}>`);
  L.push('');
  L.push('Every chart there is editable in the browser and copies out as plain HTML, CSS');
  L.push('and JavaScript with no build step, so whatever you suggest, I can get the code');
  L.push('for it the same way I got this. The library is open source:');
  L.push(`<${REPO_URL}>`);

  /* ── the template ──────────────────────────────────────────────────────── */
  if (withCode) {
    L.push('');
    L.push(`## ${expected ? 5 : 4}. The template`);
    L.push('');
    L.push('```html');
    L.push(String((code && code.standalone) || '').trim());
    L.push('```');
  }

  return L.join('\n');
}
