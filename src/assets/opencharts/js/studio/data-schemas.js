/**
 * data-schemas.js — how each chart reads pasted data, and how it writes its
 * current data back out.
 *
 * These live in one table rather than inside the 14 chart-definition files so
 * the mapping between "what a user pastes" and "what a spec holds" can be
 * reviewed in one place. `registry.js` attaches them at load.
 *
 * Each entry is:
 *   shape        which SHAPES adapter in dataio.js to use
 *   example      correctly-shaped text for the "Example" button
 *   hint         one line under the box explaining the columns
 *   picker       'cities' or 'countries' to offer a place picker in the editor
 *   toText       serialise the live spec back to CSV
 */

const csv = (rows) => rows.map((r) => r.join(',')).join('\n');

/* ── writers ─────────────────────────────────────────────────────────────── */

const writeLabelSeries = (spec, labelsKey = 'labels') => {
  const series = spec.series || [];
  if (!series.length) return '';
  const head = ['label', ...series.map((s) => s.label)];
  const rows = (spec[labelsKey] || []).map((l, i) => [l, ...series.map((s) => (s.data || [])[i] ?? '')]);
  return csv([head, ...rows]);
};

const writeLabelValue = (spec, valuesKey = 'values') => {
  const values = spec[valuesKey] || [];
  return csv([['label', 'value'], ...(spec.labels || []).map((l, i) => [l, values[i] ?? ''])]);
};

const writeItems = (spec, key = 'items', valueField = 'value', extra = []) =>
  csv([
    ['label', valueField, ...extra],
    ...(spec[key] || []).map((it) => [it.label, it[valueField] ?? '', ...extra.map((f) => it[f] ?? '')]),
  ]);

const writePairs = (spec, key, a, b, headerLabels) =>
  csv([
    ['label', headerLabels ? spec[headerLabels[0]] : a, headerLabels ? spec[headerLabels[1]] : b],
    ...(spec[key] || []).map((r) => [r.label, r[a] ?? '', r[b] ?? '']),
  ]);

const writeObservations = (spec, key = 'groups') => {
  const groups = spec[key] || [];
  if (!groups.length) return '';
  // Long form is the friendlier round-trip: it survives ragged group sizes.
  const rows = [['group', 'value']];
  groups.forEach((g) => {
    (g.values || []).forEach((v) => rows.push([g.label, v]));
  });
  return rows.length > 1 ? csv(rows) : '';
};

const writeLinks = (spec, key = 'flows', from = 'from', to = 'to', value = 'flow') =>
  csv([['from', 'to', 'value'], ...(spec[key] || []).map((l) => [l[from], l[to], l[value] ?? ''])]);

const writeEdges = (spec) =>
  csv([['source', 'target'], ...(spec.links || []).map((l) => [
    typeof l.source === 'object' ? l.source.id : l.source,
    typeof l.target === 'object' ? l.target.id : l.target,
  ])]);

const writeTree = (spec, key = 'tree') => {
  const root = spec[key];
  if (!root) return '';
  const out = [['path', 'value']];
  const walk = (node, trail) => {
    const path = node === root ? [] : [...trail, node.name];
    if (node.children && node.children.length) {
      node.children.forEach((c) => walk(c, path));
    } else if (path.length) {
      out.push([path.join(' > '), node.value ?? 0]);
    }
  };
  walk(root, []);
  return csv(out);
};

const writePlaces = (spec, key = 'places') =>
  csv([['name', 'lon', 'lat', 'value'], ...(spec[key] || []).map((p) => [p.name, p.lon, p.lat, p.value ?? ''])]);

/* ── examples ────────────────────────────────────────────────────────────── */

const EX = {
  labelSeries: 'region,2023,2024\nNorth,520,680\nSouth,440,575\nEast,610,720\nWest,380,495',
  labelValue: 'category,value\nWomen,48\nMen,31\nLiving,13\nAccessories,8',
  observations: 'group,value\nControl,52\nControl,48\nControl,61\nTreatment,64\nTreatment,71\nTreatment,58',
  links: 'from,to,value\nOrganic,Visit,4200\nPaid,Visit,2800\nVisit,Checkout,3800\nVisit,Bounce,6500',
  edges: 'source,target\nWeb,Gateway\nMobile,Gateway\nGateway,API\nAPI,Postgres',
  tree: 'path,value\nWomen > Dresses > Silk,180\nWomen > Tops > Tees,75\nMen > Shirts > Oxford,95',
  places: 'name,lon,lat,value\nTokyo,139.7,35.7,37\nDelhi,77.2,28.6,33\nLondon,-0.1,51.5,9',
  regions: 'country,value\nFrance,64\nGermany,71\nSpain,52\nItaly,58',
  ohlc: 'open,high,low,close\n148.2,151.0,147.1,150.4\n150.4,152.8,149.9,151.2\n151.2,151.9,148.0,148.6',
  pairs: 'label,2015,2025\nGermany,62,78\nFrance,58,69\nItaly,44,61',
};

/* ── the table ───────────────────────────────────────────────────────────── */

export const DATA_SCHEMAS = {
  /* Line, area and other label + series charts ------------------------------ */
  ...Object.fromEntries([
    'line-basic', 'line-multi', 'line-stepped', 'line-stepped-multi',
    'area-basic', 'area-stacked', 'area-100stacked', 'step-area',
    'bar-vertical', 'bar-stacked', 'bar-100stacked',
    'bump-chart', 'mixed-stacked-line',
    'engine-line', 'engine-area', 'engine-bar',
  ].map((id) => [id, {
    shape: 'labelSeries',
    example: EX.labelSeries,
    hint: 'First column is the category label; each further column becomes a series.',
    toText: writeLabelSeries,
  }])),

  /* Single-value charts ----------------------------------------------------- */
  ...Object.fromEntries([
    'pie', 'doughnut', 'polar-area', 'nightingale-rose', 'bar-horizontal', 'bar-diverging',
  ].map((id) => [id, {
    shape: 'labelValue',
    example: EX.labelValue,
    hint: 'Two columns: a label and its value. Negative values are allowed where the chart supports them.',
    toText: (spec) => writeLabelValue(spec),
  }])),

  'stream-graph': {
    shape: 'labelSeries', labelsKey: 'periods',
    example: EX.labelSeries,
    hint: 'First column is the period label; each further column becomes a band.',
    toText: (s) => writeLabelSeries(s, 'periods'),
  },

  'radar-single':  { shape: 'labelSeries', example: 'axis,Score\nQuality,82\nSpeed,74\nValue,68', hint: 'First column names each axis; further columns are series.', toText: writeLabelSeries },
  'radar-multi':   { shape: 'labelSeries', example: 'axis,Us,Them\nQuality,82,70\nSpeed,74,80', hint: 'First column names each axis; further columns are series.', toText: writeLabelSeries },
  'radar-filled':  { shape: 'labelSeries', example: 'axis,Team\nFrontend,85\nBackend,78', hint: 'First column names each axis; further columns are series.', toText: writeLabelSeries },

  /* Item lists -------------------------------------------------------------- */
  'bar-lollipop':      { shape: 'items', key: 'items', example: EX.labelValue, hint: 'A label and a value per row.', toText: (s) => writeItems(s, 'items') },
  'funnel':            { shape: 'items', key: 'stages', example: 'stage,count\nVisited,24800\nViewed,14200\nCart,5800\nPurchased,1950', hint: 'One row per stage, largest first.', toText: (s) => writeItems(s, 'stages') },
  'waffle':            { shape: 'items', key: 'segments', example: 'browser,share\nChrome,65\nSafari,19\nFirefox,8', hint: 'Values are unit counts — they usually sum to 100.', toText: (s) => writeItems(s, 'segments') },
  'pictogram':         { shape: 'items', key: 'rows', example: 'mode,percent\nCycle,34\nTransit,28\nDrive,24', hint: 'One row per category; values are counted in icons.', toText: (s) => writeItems(s, 'rows') },
  'proportional-area': { shape: 'items', key: 'items', example: 'scope,value\nGlobal,8100\nEurope,4400\nUK,1250', hint: 'Values are compared by area, so ratios matter more than units.', toText: (s) => writeItems(s, 'items') },
  'radial-bar':        { shape: 'items', key: 'items', example: 'device,value\nMobile,82\nDesktop,68\nTablet,45', hint: 'One ring per row.', toText: (s) => writeItems(s, 'items') },
  'marimekko':         { shape: 'items', key: 'columns', valueField: 'share', example: 'segment,share\nWomen,0.42\nMen,0.33\nLiving,0.25', hint: 'Share sets each column’s width; shares are normalised for you.', toText: (s) => writeItems(s, 'columns', 'share') },
  'venn':              { shape: 'items', key: 'sets', valueField: 'size', example: 'set,size\nTrial,620\nActive,480\nPaying,300', hint: 'Two or three sets. Overlaps stay as configured below.', toText: (s) => writeItems(s, 'sets', 'size') },

  /* Items with a second numeric field --------------------------------------- */
  'bullet-chart': {
    shape: 'items', key: 'rows', valueField: 'value', fields: ['target', 'max'],
    example: 'measure,actual,target,max\nRevenue,268,250,320\nSignups,1180,1400,1800',
    hint: 'Four columns: label, actual, target, and the scale maximum.',
    toText: (s) => writeItems(s, 'rows', 'value', ['target', 'max']),
  },
  'error-bars': {
    shape: 'items', key: 'groups', valueField: 'mean', fields: ['error'],
    example: 'group,mean,error\nControl,42,5\nDose A,51,7\nDose B,63,6',
    hint: 'Three columns: label, mean, and the ± error.',
    toText: (s) => writeItems(s, 'groups', 'mean', ['error']),
  },
  'timeline': {
    shape: 'items', key: 'events', valueField: 'start', fields: ['end', 'lane'],
    example: 'event,start,end,lane\nDiscovery,0,3,0\nDesign,2,7,1\nBuild,5,14,0',
    hint: 'Four columns: label, start, end, and which lane to draw it on.',
    toText: (s) => writeItems(s, 'events', 'start', ['end', 'lane']),
  },
  'bar-waterfall': {
    shape: 'items', key: 'steps', valueField: 'delta',
    example: 'step,change\nFY2023,0\nNew sales,2.1\nChurn,-0.5\nFY2024,0',
    hint: 'Each row is a change. Use 0 for the opening and closing totals.',
    toText: (s) => writeItems(s, 'steps', 'delta'),
    onData(spec) {
      // First and last rows are totals; everything between is a movement.
      const steps = spec.steps || [];
      steps.forEach((st, i) => {
        st.kind = (i === 0 || i === steps.length - 1) ? 'base' : (st.delta >= 0 ? 'up' : 'down');
      });
    },
  },

  /* Paired values ------------------------------------------------------------ */
  'dumbbell': {
    shape: 'pairs', key: 'rows', fields: ['start', 'end'], headerLabels: ['startLabel', 'endLabel'],
    example: EX.pairs, hint: 'Three columns: label, first value, second value. The two headers name the periods.',
    toText: (s) => writePairs(s, 'rows', 'start', 'end', ['startLabel', 'endLabel']),
  },
  'slope-chart': {
    shape: 'pairs', key: 'items', fields: ['from', 'to'], headerLabels: ['startLabel', 'endLabel'],
    example: EX.pairs, hint: 'Three columns: label, first value, second value.',
    toText: (s) => writePairs(s, 'items', 'from', 'to', ['startLabel', 'endLabel']),
  },
  'span-chart': {
    shape: 'pairs', key: 'rows', fields: ['min', 'max'],
    example: 'city,min,max\nReykjavik,-3,14\nLondon,3,24\nCairo,12,38',
    hint: 'Three columns: label, minimum, maximum.',
    toText: (s) => writePairs(s, 'rows', 'min', 'max'),
  },
  'spine-chart': {
    shape: 'pairs', key: 'rows', fields: ['left', 'right'], headerLabels: ['leftLabel', 'rightLabel'],
    example: 'band,Desktop,Mobile\nUnder 25,34,66\n25-34,48,52',
    hint: 'Three columns: label, left value, right value.',
    toText: (s) => writePairs(s, 'rows', 'left', 'right', ['leftLabel', 'rightLabel']),
  },
  'bar-floating': {
    shape: 'pairs', key: 'rows', fields: ['from', 'to'],
    example: 'task,start,end\nDiscovery,1,3\nDesign,2,5\nBuild,4,10',
    hint: 'Three columns: label, start, end.',
    toText: (s) => csv([['task', 'start', 'end'], ...(s.labels || []).map((l, i) => [l, (s.ranges[i] || [])[0], (s.ranges[i] || [])[1]])]),
    onData(spec) {
      // This chart stores ranges separately from labels.
      spec.labels = (spec.rows || []).map((r) => r.label);
      spec.ranges = (spec.rows || []).map((r) => [r.from, r.to]);
      delete spec.rows;
    },
  },

  /* Distributions — raw observations ---------------------------------------- */
  ...Object.fromEntries([
    ['histogram', 'groups'], ['box-plot', 'groups'], ['violin', 'groups'],
    ['density-plot', 'groups'], ['ridgeline', 'rows'], ['ecdf', 'groups'],
    ['beeswarm', 'groups'], ['barcode-plot', 'rows'],
  ].map(([id, key]) => [id, {
    shape: 'observations', key,
    example: EX.observations,
    hint: 'Either one column per group, or two columns of group and value.',
    toText: (s) => writeObservations(s, key),
    ...(id === 'histogram' ? {
      onData(spec) {
        const values = spec.groups[0]?.values || [];
        if (!values.length) return;
        const low = values.reduce((a, b) => Math.min(a, b), Infinity);
        const high = values.reduce((a, b) => Math.max(a, b), -Infinity);
        const padding = low === high ? Math.max(Math.abs(low) * .05, 1) : 0;
        spec.min = low - padding;
        spec.max = high + padding;
      },
    } : {}),
  }])),

  /* Flows and networks ------------------------------------------------------- */
  'sankey': {
    shape: 'links', key: 'flows', nodesKey: 'nodes', example: EX.links,
    hint: 'From, to, and the amount flowing. Add a column for a longer path — '
      + 'Ad, Visit, Checkout, 320 is 320 flowing Ad → Visit → Checkout.',
    toText: (s) => writeLinks(s, 'flows'),
  },
  // Not `links`: this chart reads `record[dimensionName]`, so the column
  // headers are the data. Writing {from, to, flow} into it — which the links
  // shape did — left every category undefined.
  'parallel-sets': {
    shape: 'dimensions', key: 'records', dimensionsKey: 'dimensions', colorByKey: 'colorBy',
    example: 'Channel,Device,Outcome,value\nOrganic,Desktop,Purchase,320\n'
      + 'Organic,Mobile,Bounce,480\nPaid,Mobile,Purchase,180\nEmail,Desktop,Purchase,160',
    hint: 'One column per dimension, then the count. Add a column for another '
      + 'dimension — its heading becomes the name on the chart.',
    toText: (s) => {
      const dims = s.dimensions || [];
      return csv([[...dims, 'value'], ...(s.records || []).map((r) => [...dims.map((d) => r[d]), r.value])]);
    },
  },
  'network':        { shape: 'edges', example: EX.edges, hint: 'Two columns: source and target. Nodes are derived from the edges.', toText: writeEdges },
  'arc-diagram':    { shape: 'edges', example: EX.edges, hint: 'Two columns: source and target.', toText: writeEdges },
  'adjacency-matrix': { shape: 'edges', example: EX.edges, hint: 'Two columns: source and target.', toText: writeEdges },
  'chord': {
    shape: 'links', key: 'chordLinks', example: 'from,to,value\nWomen,Men,1200\nWomen,Living,800', hint: 'The two groups and the volume between them. A longer row is a chain — '
      + 'A, B, C, 40 links A to B and B to C.',
    toText: (s) => {
      const out = [['from', 'to', 'value']];
      (s.matrix || []).forEach((row, i) => row.forEach((v, j) => { if (j > i && v) out.push([s.names[i], s.names[j], v]); }));
      return csv(out);
    },
    onData(spec) {
      // Rebuild the symmetric matrix the chord layout needs.
      const names = [];
      spec.chordLinks.forEach((l) => [l.from, l.to].forEach((n) => { if (!names.includes(n)) names.push(n); }));
      const size = names.length;
      const m = Array.from({ length: size }, () => new Array(size).fill(0));
      spec.chordLinks.forEach((l) => {
        const a = names.indexOf(l.from);
        const b = names.indexOf(l.to);
        if (a < 0 || b < 0) return;
        m[a][b] += l.flow;
        m[b][a] += l.flow;
      });
      spec.names = names;
      spec.matrix = m;
      delete spec.chordLinks;
    },
  },

  /* Hierarchies -------------------------------------------------------------- */
  'treemap': {
    shape: 'tree', key: 'treeInput', example: EX.tree,
    hint: 'One row per leaf: a “Parent > Child > Leaf” path and its value — '
      + 'or one column per level, with the value last.',
    toText: (s) => csv([['path', 'value'], ...(s.items || []).map((it) => [`${it.g} > ${it.label}`, it.value])]),
    onData(spec) {
      // The Chart.js treemap wants a flat list with a group column.
      const items = [];
      const groups = [];
      ((spec.treeInput && spec.treeInput.children) || []).forEach((g) => {
        if (!groups.includes(g.name)) groups.push(g.name);
        const walk = (n) => {
          if (n.children && n.children.length) n.children.forEach(walk);
          else items.push({ g: g.name, label: n.name, value: n.value || 0 });
        };
        walk(g);
      });
      spec.items = items;
      spec.groups = groups;
      delete spec.treeInput;
    },
  },
  ...Object.fromEntries([['sunburst', 'tree'], ['icicle', 'tree'], ['dendrogram', 'tree']].map(([id, key]) => [id, {
    shape: 'tree', key, groupsKey: 'groups',
    example: EX.tree,
    hint: 'One row per leaf: a “Parent > Child > Leaf” path and its value — '
      + 'or one column per level, with the value last.',
    toText: (s) => writeTree(s, key),
  }])),
  'bubble-pack': {
    shape: 'items', key: 'items', valueField: 'v', fields: [],
    example: 'name,value\nEmail Q4,420\nInstagram,380\nGoogle Ads,540',
    hint: 'A name and a value per row.',
    toText: (s) => csv([['name', 'value'], ...(s.items || []).map((i) => [i.name, i.v])]),
    onData(spec) {
      // This chart keys off `name`/`v` and groups by channel.
      const groups = spec.groups && spec.groups.length ? spec.groups : ['Group 1'];
      spec.items = (spec.items || []).map((i, k) => ({
        name: i.label != null ? i.label : i.name,
        v: i.value != null ? i.value : i.v,
        channel: groups[k % groups.length],
      }));
    },
  },

  /* Scatter families --------------------------------------------------------- */
  'scatter-basic': {
    shape: 'labelValue', labelsKey: '_xs', valuesKey: '_ys',
    example: 'x,y\n120,3.4\n210,4.1\n64,2.8',
    hint: 'Two numeric columns: x and y.',
    toText: (s) => csv([['x', 'y'], ...(s.points || []).map((p) => [p.x, p.y])]),
    onData(spec) {
      spec.points = (spec._xs || []).map((x, i) => ({
        x: Number(x) || 0, y: (spec._ys || [])[i] || 0,
      }));
      delete spec._xs; delete spec._ys;
    },
  },
  ...Object.fromEntries([
    ['scatter-clusters', 'groups', 'points', false],
    ['bubble', 'groups', 'points', false],
    ['connected-scatter', 'series', 'points', true],
    ['engine-scatter', 'series', 'points', true],
  ].map(([id, key, pointField, asPairs]) => [id, {
    shape: 'xyGroups', key, pointField, asPairs,
    example: 'group,x,y\nHigh value,75,82\nHigh value,80,78\nRegular,45,48\nRegular,50,42',
    hint: 'Three columns: group name, x, y.',
    toText: (s) => {
      const out = [['group', 'x', 'y']];
      (s[key] || []).forEach((g) => {
        const pts = g.points || g.data || [];
        pts.forEach((p) => out.push([g.label, Array.isArray(p) ? p[0] : p.x, Array.isArray(p) ? p[1] : p.y]));
      });
      return csv(out);
    },
  }])),
  'quadrant-chart': {
    shape: 'items', key: 'items', valueField: 'x', fields: ['y'],
    example: 'item,x,y\nOnboarding,82,78\nSearch,74,34\nBilling,31,71',
    hint: 'Three columns: label, x (horizontal), y (vertical).',
    toText: (s) => writeItems(s, 'items', 'x', ['y']),
    onData(spec) { (spec.items || []).forEach((i) => { if (typeof i.r !== 'number') i.r = 8; }); },
  },

  /* Finance ------------------------------------------------------------------ */
  ...Object.fromEntries(['ohlc', 'candlestick', 'renko', 'point-figure', 'kagi'].map((id) => [id, {
    shape: 'ohlc',
    example: EX.ohlc,
    hint: 'Four numeric columns: open, high, low, close. A leading date column is ignored.',
    toText: (s) => csv([
      ['open', 'high', 'low', 'close'], ...(s.bars || []).map((b) => [b.o, b.h, b.l, b.c]),
    ]),
  }])),

  /* Deviation ---------------------------------------------------------------- */
  'surplus-deficit-line': { shape: 'labelValue', example: 'month,value\nJan,-2.1\nFeb,1.4\nMar,2.8', hint: 'Two columns: label and a signed value.', toText: (s) => writeLabelValue(s) },
  'bar-diverging-stacked': {
    shape: 'rowSeries', key: 'questions', labelsKey: false,
    example: 'question,Strongly disagree,Disagree,Neutral,Agree,Strongly agree\nDocs are clear,4,9,12,45,30\nSetup was easy,8,15,14,38,25',
    hint: 'First column is the question; one column per point on the scale, in order.',
    toText: (s) => csv([['question', ...(s.scale || [])], ...(s.questions || []).map((q) => [q.label, ...q.values])]),
    onData(spec, table) {
      // Column headers name the scale; each row's numbers are its responses.
      spec.scale = table.headers.slice(1);
      spec.questions = spec.questions.map((q) => ({ label: q.label, values: q.data }));
      // Keep one colour per scale point, not per question.
      const base = ['#B0453F', '#D98A66', '#9A968C', '#5E9CD6', '#2F6FB0'];
      spec.colors = spec.scale.map((_, i) => base[i % base.length]);
    },
  },

  /* Mixed / comparison -------------------------------------------------------- */
  'mixed-bar-line': {
    shape: 'labelSeries',
    example: 'quarter,Revenue,Growth\nQ1,520,12\nQ2,680,31\nQ3,740,9\nQ4,910,23',
    hint: 'First column is the label, second becomes the bars, third the line.',
    toText: (s) => csv([['label', s.bars.label, s.line.label], ...(s.labels || []).map((l, i) => [l, s.bars.data[i] ?? '', s.line.data[i] ?? ''])]),
    onData(spec) {
      const [bars, line] = spec.series || [];
      if (bars) spec.bars = { ...spec.bars, label: bars.label, data: bars.data };
      if (line) spec.line = { ...spec.line, label: line.label, data: line.data };
      delete spec.series;
    },
  },
  'pareto': {
    shape: 'items', key: 'items',
    example: 'cause,count\nShipping delay,142\nWrong item,98\nDamaged,76',
    hint: 'A cause and its count. Rows are sorted for you.',
    toText: (s) => writeItems(s, 'items'),
  },
  'doughnut-gauge': {
    shape: 'labelValue',
    example: 'label,value\nHealth score,72',
    hint: 'A single row: a caption and the value.',
    toText: (s) => csv([['label', 'value'], [s.label, s.score]]),
    onData(spec) {
      spec.label = (spec.labels || [])[0] || spec.label;
      const v = (spec.values || [])[0];
      spec.score = Math.max(0, Math.min(100, v == null ? spec.score : v));
      delete spec.labels; delete spec.values;
    },
  },
  'sparkline': {
    shape: 'rowSeries', key: 'rows', labelsKey: false,
    example: 'metric,Jan,Feb,Mar,Apr,May\nRevenue,12,14,13,17,19\nChurn,5.2,5,5.4,4.8,4.6',
    hint: 'One row per metric; each further column is a point in time.',
    toText: (s) => csv([['metric', ...((s.rows[0] && s.rows[0].data) || []).map((_, i) => 'P' + (i + 1))],
      ...(s.rows || []).map((r) => [r.label, ...(r.data || [])])]),
    onData(spec) {
      spec.rows.forEach((r) => { if (typeof r.unit !== 'string') r.unit = ''; });
    },
  },

  /* Time-series oddities ------------------------------------------------------ */
  'fan-chart': {
    shape: 'labelValue',
    example: 'year,value\n2019,2.1\n2020,1.4\n2021,2.8\n2022,3.4',
    hint: 'Two columns: period and observed value. Projected values stay as configured.',
    toText: (s) => csv([['period', 'value'], ...(s.history || []).map((v, i) => [s.labels[i], v])]),
    onData(spec) { spec.history = spec.values || spec.history; },
  },
  'horizon-chart': {
    shape: 'rowSeries', key: 'series', labelsKey: false,
    example: 'metric,t1,t2,t3,t4,t5\nCPU,0.2,0.5,-0.3,0.8,0.1\nMemory,0.4,0.2,0.6,-0.1,0.3',
    hint: 'One row per band; each further column is a point in time.',
    toText: (s) => csv([['metric'], ...(s.series || []).map((r) => [r.label, ...(r.data || r.values || [])])]),
    onData(spec) {
      // The renderer reads `values`; keep both so the round-trip survives.
      spec.series.forEach((r) => { r.values = r.data; });
    },
  },
  'spiral-plot': {
    shape: 'labelValue',
    example: 'period,value\nW1,0.4\nW2,0.6\nW3,0.9',
    hint: 'Two columns: a period label and its value.',
    toText: (s) => csv([['period', 'value'], ...(s.values || []).map((v, i) => ['P' + (i + 1), v])]),
  },
  'calendar-heatmap': {
    shape: 'labelValue',
    example: 'date,count\n2025-01-04,3\n2025-01-05,7\n2025-01-06,2',
    hint: 'Two columns: an ISO date and a count.',
    toText: (s) => csv([
      ['date', 'count'], ...Object.entries(s.dayValues || {}).map(([d, v]) => [d, v]),
    ]),
    onData(spec) {
      const map = {};
      (spec.labels || []).forEach((d, i) => { map[d] = (spec.values || [])[i] || 0; });
      spec.dayValues = map;
      delete spec.labels; delete spec.values;
    },
  },
  'radial-histogram': {
    shape: 'labelValue',
    example: 'direction,count\nN,120\nNE,86\nE,45',
    hint: 'Two columns: a direction label and its count.',
    toText: (s) => csv([
      ['direction', 'count'],
      ...(s.binCounts || []).map((v, i) => [(s.labels || [])[i] || 'B' + (i + 1), v]),
    ]),
    onData(spec) {
      spec.binCounts = spec.values || [];
      // The shape already wrote spec.labels; keep them as the ring's names.
    },
  },
  'heatmap': {
    shape: 'matrix',
    example: 'day,0,1,2,3\nMon,4,8,12,6\nTue,3,9,14,7',
    hint: 'First column is the row label; each further column is a cell.',
    toText: (s) => {
      const rows = s.rows || [];
      const cols = s.cols || [];
      const at = new Map((s.cells || []).map((c) => [c.y + ':' + c.x, c.v]));
      return csv([
        ['day', ...cols],
        ...rows.map((label, y) => [label, ...cols.map((_, x) => at.get(y + ':' + x) ?? '')]),
      ]);
    },
  },
  'echarts-heatmap': {
    shape: 'matrix',
    example: 'day,12a,1a,2a,3a\nSaturday,5,1,0,0\nFriday,3,2,0,0',
    hint: 'First column is the row label; each further column is a cell.',
    toText: (s) => {
      const rows = s.rows || [];
      const cols = s.cols || [];
      const at = new Map((s.cells || []).map((c) => [c.y + ':' + c.x, c.v]));
      return csv([
        ['day', ...cols],
        ...rows.map((label, y) => [label, ...cols.map((_, x) => at.get(y + ':' + x) ?? '')]),
      ]);
    },
  },
  'voronoi': {
    shape: 'places', key: 'seeds',
    example: 'name,x,y\nDepot N,22,18\nDepot E,78,26\nDepot S,62,82',
    hint: 'Three columns: a name and its x,y position from 0 to 100.',
    toText: (s) => csv([['name', 'x', 'y'], ...(s.seeds || []).map((p) => [p.label, p.x, p.y])]),
    onData(spec) {
      spec.seeds = (spec.seeds || []).map((p, i) => ({
        label: p.name, x: p.lon, y: p.lat, group: i % 4,
      }));
    },
  },
  'parallel-coords': {
    shape: 'rowSeries', key: 'rowItems', labelsKey: false,
    example: 'item,Price,Rating,Reviews\nA,120,4.2,300\nB,64,3.8,120',
    hint: 'First column names each item; every further column becomes an axis.',
    toText: (s) => csv([
      ['item', ...s.dims],
      ...(s.records || []).map((r, i) => [r.name || 'Item ' + (i + 1), ...s.dims.map((d) => r[d])]),
    ]),
    onData(spec, table) {
      spec.dims = table.headers.slice(1);
      const groupCount = Math.max(1, (spec.groups || []).length);
      spec.records = spec.rowItems.map((row, i) => {
        const rec = { name: row.label, group: i % groupCount };
        spec.dims.forEach((d, k) => { rec[d] = row.data[k]; });
        return rec;
      });
      delete spec.rowItems;
    },
  },

  /* Geo ----------------------------------------------------------------------- */
  ...Object.fromEntries(['choropleth', 'cartogram', 'dot-density-map'].map((id) => [id, {
    shape: 'regions', picker: 'countries',
    example: EX.regions,
    hint: 'Two columns: a country name and its value. Names must match Natural Earth spellings.',
    toText: (s) => csv([
      ['country', 'value'], ...Object.entries(s.regionValues || {}).map(([k, v]) => [k, v]),
    ]),
  }])),
  globe: {
    shape: 'regions', picker: 'countries',
    example: EX.regions,
    hint: 'Two columns: a country name and its value. Matching ignores case and punctuation.',
    toText: (s) => csv([
      ['country', 'value'], ...Object.entries(s.regionValues || {}).map(([k, v]) => [k, v]),
    ]),
  },

  'city-map': {
    shape: 'places', key: 'places', picker: 'cities',
    example: 'city,lon,lat,value\nAmman,35.93,31.95,4300\nZarqa,36.09,32.07,1450\nIrbid,35.85,32.55,1180\nAqaba,35.00,29.53,190',
    hint: 'Four columns: city name, longitude, latitude, value. Longitude comes before latitude.',
    toText: (s) => writePlaces(s, 'places'),
  },

  'proportional-symbol-map': { shape: 'places', key: 'places', picker: 'cities', example: EX.places, hint: 'Four columns: name, longitude, latitude, value.', toText: (s) => writePlaces(s, 'places') },
  'flow-map': {
    shape: 'places', key: 'routes', picker: 'cities',
    example: EX.places, hint: 'Four columns: destination, longitude, latitude, volume. The hub stays as configured.',
    toText: (s) => writePlaces(s, 'routes'),
  },
  'tile-map': {
    shape: 'items', key: 'cells', valueField: 'value', fields: ['row', 'col'],
    example: 'code,value,row,col\nGBR,74,1,2\nFRA,64,4,2\nDEU,69,2,4',
    hint: 'Four columns: code, value, and its row and column on the grid.',
    toText: (s) => csv([['code', 'value', 'row', 'col'], ...(s.cells || []).map((c) => [c.code, c.value, c.row, c.col])]),
    onData(spec) {
      spec.cells = (spec.cells || []).map((c) => ({
        code: c.label, name: c.label, value: c.value, row: c.row || 0, col: c.col || 0,
      }));
    },
  },

  'area-band': {
    shape: 'labelValue',
    example: 'day,mean\nDay 1,18\nDay 2,19\nDay 3,21\nDay 4,22',
    hint: 'Two columns: a label and the central value. The band width stays as configured.',
    toText: (s) => csv([['label', 'mean'], ...(s.labels || []).map((l, i) => [l, (s.mean || [])[i] ?? ''])]),
    onData(spec) {
      spec.mean = spec.values || spec.mean;
      delete spec.values;
    },
  },

  'bar-butterfly': {
    shape: 'pairs', key: 'rows', fields: ['left', 'right'],
    example: 'band,Male,Female\n18-24,8.2,9.1\n25-34,14.5,15.8\n35-44,13.8,14.2',
    hint: 'Three columns: label, left value, right value. The headers name the two sides.',
    toText: (s) => csv([
      ['band', s.left.label, s.right.label],
      ...(s.labels || []).map((l, i) => [l, (s.left.data || [])[i] ?? '', (s.right.data || [])[i] ?? '']),
    ]),
    onData(spec, table) {
      // This chart keeps two named sides rather than a list of rows.
      spec.labels = spec.rows.map((r) => r.label);
      spec.left = { ...spec.left, data: spec.rows.map((r) => r.left) };
      spec.right = { ...spec.right, data: spec.rows.map((r) => r.right) };
      if (table.headers[1]) spec.left.label = table.headers[1];
      if (table.headers[2]) spec.right.label = table.headers[2];
      spec.sides = [spec.left.color, spec.right.color];
      delete spec.rows;
    },
  },

  /* Counting charts — one mark per unit -------------------------------------- */
  'word-cloud': {
    shape: 'items', key: 'words', valueField: 'weight',
    example: 'term,count\nrefund,184\nshipping,152\npassword,141\ninvoice,128',
    hint: 'Two columns: the word and how many times it occurs.',
    toText: (s) => writeItems(s, 'words', 'weight'),
  },
  'dot-matrix': {
    shape: 'items', key: 'items', valueField: 'value',
    example: EX.labelValue,
    hint: 'Two columns: a category and its count. One dot is drawn per unit.',
    toText: (s) => writeItems(s, 'items', 'value'),
  },
  'tally-chart': {
    shape: 'items', key: 'items', valueField: 'value',
    example: EX.labelValue,
    hint: 'Two columns: a category and its count. Counts are drawn as five-bar gates.',
    toText: (s) => writeItems(s, 'items', 'value'),
  },
  'stem-leaf': {
    shape: 'observations', key: 'groups',
    example: EX.observations,
    hint: 'Either one column per batch, or two columns of batch and value.',
    toText: (s) => writeObservations(s, 'groups'),
  },

  /* Dense scatters ----------------------------------------------------------- */
  'splom': {
    shape: 'labelSeries',
    example: 'item,Price,Rating,Reviews\nAster,1636,3.9,288\nBirch,940,4.4,512\nCedar,1280,3.1,96',
    hint: 'A name, then one numeric column per variable. Every pair gets a panel.',
    toText: (s) => writeLabelSeries(s),
  },
  ...Object.fromEntries(['hexbin', 'density-contour'].map((id) => [id, {
    shape: 'labelValue', labelsKey: '_xs', valuesKey: '_ys',
    example: 'x,y\n120,3.4\n210,4.1\n64,2.8',
    hint: 'Two numeric columns: x and y.',
    toText: (s) => csv([['x', 'y'], ...(s.points || []).map((p) => [p.x, p.y])]),
    onData(spec) {
      spec.points = (spec._xs || []).map((x, i) => ({
        x: Number(x) || 0, y: (spec._ys || [])[i] || 0,
      }));
      delete spec._xs; delete spec._ys;
    },
  }])),

  /* Wrapped axes and grids --------------------------------------------------- */
  'radial-line': {
    shape: 'labelSeries',
    example: 'month,2024,2025\nJan,3.6,4.2\nFeb,3.9,4.6\nMar,5.0,5.8',
    hint: 'A period name, then one column per series. The last row joins back to the first.',
    toText: (s) => writeLabelSeries(s),
  },
  'cycle-plot': {
    shape: 'labelSeries',
    example: 'month,2023,2024,2025\nJan,44,46,48\nFeb,41,43,44\nMar,36,37,38',
    hint: 'A season name, then one column per cycle — the trend inside each season is drawn across those columns.',
    toText: (s) => writeLabelSeries(s),
  },
  'dot-plot': {
    shape: 'labelSeries',
    example: 'role,Berlin,London\nSupport,42,46\nDesign,58,64\nData,66,74',
    hint: 'A category, then one column per series. Each gets a dot on the row.',
    toText: (s) => writeLabelSeries(s),
  },
  'radial-column': {
    shape: 'labelValue',
    example: 'direction,speed\nN,18\nNE,11\nE,8\nSE,13\nS,22\nW,36',
    hint: 'Two columns: a category and its value.',
    toText: (s) => writeLabelValue(s),
  },
  'nested-area': {
    shape: 'items', key: 'items', valueField: 'value',
    example: 'source,value\nAll sources,604\nFossil,494\nOil,190\nCoal,161',
    hint: 'Two columns: a label and its size. Largest is drawn outermost.',
    toText: (s) => writeItems(s, 'items', 'value'),
  },
  'time-table': {
    shape: 'matrix', rowsKey: 'rows', colsKey: 'cols',
    example: 'room,09,10,11,12\nStudio A,12,12,,\nStudio B,,,6,6\nLab,4,,,14',
    hint: 'A row label, then one column per slot. Leave a cell blank for nothing scheduled.',
    toText: (s) => {
      const head = ['row', ...(s.cols || [])];
      const grid = (s.rows || []).map((r, y) => {
        const line = [r];
        (s.cols || []).forEach((_, x) => {
          const cell = (s.cells || []).find((c) => Number(c.x) === x && Number(c.y) === y);
          line.push(cell ? cell.v : '');
        });
        return line;
      });
      return csv([head, ...grid]);
    },
  },
  'alluvial': {
    shape: 'links', key: 'flows', nodesKey: 'nodes',
    example: 'from,to,value\nFree trial,Activated,4200\nFree trial,Lapsed,2600\nActivated,Paid,2400',
    hint: 'From, to, and how many moved. Add a column for a longer path — '
      + 'Trial, Active, Paid, 320 is 320 going Trial → Active → Paid.',
    toText: (s) => writeLinks(s, 'flows'),
  },
  'chord-nonribbon': {
    shape: 'edges',
    example: EX.edges,
    hint: 'Two columns: source and target. Nodes are derived from the edges.',
    toText: writeEdges,
  },
  'dendrogram-radial': {
    shape: 'tree', key: 'tree',
    example: EX.tree,
    hint: 'One level per column, or a Parent > Child path in one cell, with the value last.',
    toText: (s) => writeTree(s, 'tree'),
  },

  /* Engine pie ---------------------------------------------------------------- */
  'engine-pie': {
    shape: 'items', key: 'series', valueField: 'value',
    example: EX.labelValue,
    hint: 'Two columns: a label and its value.',
    toText: (s) => csv([['label', 'value'], ...(s.series || []).map((x) => [x.label, (x.data || [])[0] ?? ''])]),
    onData(spec) {
      spec.series = (spec.series || []).map((x) => ({
        label: x.label, color: x.color, data: [x.value],
      }));
    },
  },
};

/** Charts whose data control should be inserted at the very top. */
export const DATA_CONTROL = {
  group: 'Data',
  type: 'data',
  label: 'Your data',
};
