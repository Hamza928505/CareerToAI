/**
 * chart-help.js — how to read each chart, and what it hides.
 *
 * `blurb` says what a chart is for; this says how to actually read one, which
 * is a different and more useful thing. Each entry has:
 *
 *   read   what the marks encode — position, length, angle, area, colour
 *   watch  the misreading this chart invites, stated plainly
 *
 * Every chart type has a characteristic way of misleading people. Saying so
 * is more honest than pretending the choice is neutral, and it is the part
 * most chart libraries leave out.
 *
 * A category-level fallback covers anything without its own entry, so this
 * table can grow without leaving gaps.
 */

export const CHART_HELP = {
  'radial-line': {
    read: 'Distance from the centre is the value; going clockwise walks one full cycle. The line closes because the cycle does.',
    watch: 'The same value covers more area further out, so the outer rings look bigger than they are. Only use it where the wrap-around actually means something.',
  },
  'radial-column': {
    read: 'Each column grows outward from the inner circle. Longer is more.',
    watch: 'The columns fan out, so an outer bar is drawn wider than an inner one of the same value. Comparing two columns on opposite sides is guesswork.',
  },
  'nested-area': {
    read: 'Area is the value and the figures sit one inside another, so a part is literally contained by its whole.',
    watch: 'People read the width, not the area, and so overestimate the small ones. Nesting also implies containment — do not nest categories that are not actually subsets.',
  },
  'dendrogram-radial': {
    read: 'The root is at the centre and depth runs outward; every leaf sits on the rim. Follow a branch out to see what is under it.',
    watch: 'Angle carries no meaning, so two leaves near each other on the rim may be nowhere near each other in the tree. Only the connecting lines say what belongs together.',
  },
  'alluvial': {
    read: 'Block height is how many are in that state; ribbon thickness is how many moved between two states. Follow one ribbon left to right to trace a group.',
    watch: 'The vertical order of blocks is chosen to reduce crossings, not to rank them. Reading it as an ordering is the usual mistake.',
  },
  'chord-nonribbon': {
    read: 'Each curve is one connection between two nodes on the rim. Node size is how many connections it has.',
    watch: 'The curves have no thickness, so this says who is connected and nothing about how much. Bundling makes the middle dense on purpose — count at the rim, not the centre.',
  },
  'cycle-plot': {
    read: 'Each little line is one season\u2019s trend across the years; the flat line through it is that season\u2019s mean. Compare the means across seasons, and the slopes within them.',
    watch: 'It answers two questions at once and they can disagree — a season can be the highest and the only one falling. Read the level and the slope separately.',
  },
  'dot-plot': {
    read: 'Every row shares one horizontal axis; each dot is one series. The spread within a row is the gap between series.',
    watch: 'The axis rarely starts at zero here, which is fine for comparing positions and wrong for reading ratios off it.',
  },
  'time-table': {
    read: 'Rows are things, columns are slots, a block means something is scheduled. Block size is the value where that is switched on.',
    watch: 'The empty cells carry as much of the message as the full ones. A grid that looks sparse because the data is missing reads identically to one that is genuinely free.',
  },
  'hexbin': {
    read: 'Each hexagon covers a patch of the plane; its shade is how many points landed inside. Dark means crowded.',
    watch: 'The hexagon size decides the picture. Make them large enough and every cloud looks like one smooth blob.',
  },
  'splom': {
    read: 'Read one row at a time: the variable named on the left is the vertical axis in every panel across it. Look for panels with a slope.',
    watch: 'With six variables this is thirty panels, and some will look correlated by chance alone. Treat it as a place to find a question, not an answer.',
  },
  'density-contour': {
    read: 'Bands are lines of equal density, like contours on a map. Tightly packed bands are a steep climb into a peak.',
    watch: 'The bandwidth is a choice, not a measurement. Too high invents one hill where there were two; too low turns every point into its own island.',
  },
  'word-cloud': {
    read: 'Bigger words occur more often. Read the largest few and stop — that is all this chart reliably says.',
    watch: 'Area, not length, encodes the count, and people judge area badly. Position and colour mean nothing at all here, and a long word looks larger than a short one of the same count.',
  },
  'dot-matrix': {
    read: 'Count the dots. Each one is the same number of units, so a block twice as long is twice as much.',
    watch: 'Past a few hundred dots nobody counts them and it becomes a bar chart with extra steps. Raise the units-per-dot instead.',
  },
  'tally-chart': {
    read: 'Marks come in gates of five, the fifth struck across the other four. Count the gates, then the leftovers.',
    watch: 'This is for counts you can still see — twenty, not two hundred. Beyond that the gates blur and a bar is more honest.',
  },
  'stem-leaf': {
    read: 'The stem is the leading digits, each leaf one observation sharing it. The length of a row is a bar; the digits in it are the actual values.',
    watch: 'It only works while the leaves fit on one line. A large batch runs off the edge, and the stem size has the same effect a bin width does on a histogram.',
  },
  /* ── Line & Area ──────────────────────────────────────────────────────── */
  'line-basic': {
    read: 'Follow the line left to right. Height is the value; the slope between two points is the rate of change.',
    watch: 'If the vertical axis does not start at zero, a small change can look dramatic. Check the axis before trusting the shape.',
  },
  'line-multi': {
    read: 'Compare the shapes of the lines, not their exact heights. Crossings mark where one series overtook another.',
    watch: 'Beyond four or five lines they become a tangle. Colour alone stops distinguishing them.',
  },
  'line-stepped': {
    read: 'Flat runs are periods where the value held; the vertical jumps are the moments it changed.',
    watch: 'The step implies the value was constant between readings. That is true for prices and tiers, false for anything sampled.',
  },
  'line-stepped-multi': {
    read: 'Each line holds its value until it steps. Compare where the steps fall, not how steep they are.',
    watch: 'Overlapping flat runs can hide one line completely behind another.',
  },
  'area-basic': {
    read: 'The line is the value; the filled area beneath implies a total accumulated up to that point.',
    watch: 'Fill suggests a quantity that adds up. Use it for volumes, not for rates, ratios or temperatures.',
  },
  'area-stacked': {
    read: 'Each band is one series; the top edge is the total. Band thickness at any point is that series’ contribution.',
    watch: 'Only the bottom band sits on a flat baseline. The ones above ride on the bands below, so their shapes are hard to judge.',
  },
  'area-100stacked': {
    read: 'Every column fills the full height, so you are reading share, not amount.',
    watch: 'A band can grow here while the underlying number shrinks — the total is invisible by design.',
  },
  'step-area': {
    read: 'Discrete states that hold and then change, with the space beneath filled to emphasise level.',
    watch: 'Same caution as any stepped line: it asserts the value was constant between changes.',
  },
  'area-band': {
    read: 'The central line is the estimate; the shaded band is the range around it. A wider band means less certainty.',
    watch: 'The band is a range, not a guarantee. Values outside it are possible, just less likely.',
  },
  'fan-chart': {
    read: 'Solid line is what happened; the dashed line and widening bands are projection. Wider means further ahead and less certain.',
    watch: 'The centre of the fan is not a promise. Read the width as honesty about what is unknown.',
  },
  'horizon-chart': {
    read: 'Each row is one series, folded into colour bands so it fits in a quarter of the height. Darker means further from the baseline.',
    watch: 'Deliberately trades precision for density. Good for spotting when something happened across many series, poor for reading a value.',
  },
  'spiral-plot': {
    read: 'Time coils outward — each full turn is one cycle. Compare the same angular position across turns to see the same point in successive cycles.',
    watch: 'Distance from the centre confounds time and value. Only use it when the cycle itself is the point.',
  },
  'sparkline': {
    read: 'Shape only — no axes, no gridlines. Read the direction and the shape of the trend, and take the number at the right as the current value.',
    watch: 'By design you cannot read a value off it. If the exact number matters, this is the wrong chart.',
  },

  /* ── Bar ──────────────────────────────────────────────────────────────── */
  'bar-vertical': {
    read: 'Compare bar heights. Because they share a baseline, ratios between them are read reliably.',
    watch: 'The baseline must be zero. Truncate it and a 3% difference can look like 50%.',
  },
  'bar-stacked': {
    read: 'Total height is the whole; each segment is one part. The bottom segment and the total are the two things you can read accurately.',
    watch: 'Middle segments float on shifting baselines, so comparing them across columns is unreliable.',
  },
  'bar-horizontal': {
    read: 'Compare bar lengths. Rotating frees up room for long category names and makes ranking read top-down.',
    watch: 'Sort deliberately. Alphabetical order hides the ranking that the chart exists to show.',
  },
  'bar-100stacked': {
    read: 'Every bar is the same length, so you are comparing composition between groups, not size.',
    watch: 'Group totals are invisible. A group of 10 and a group of 10,000 look identical.',
  },
  'bar-diverging': {
    read: 'Bars grow either side of a zero line. Direction is the sign, length is the magnitude.',
    watch: 'Check where zero sits. An off-centre baseline makes one direction look systematically larger.',
  },
  'bar-floating': {
    read: 'Each bar spans from its start to its end, so position matters as much as length. Length is duration.',
    watch: 'Bars that do not touch the axis are easy to misread as small values rather than late starts.',
  },
  'bar-waterfall': {
    read: 'Read left to right as a running total. Grey bars are totals; coloured ones are the changes between them.',
    watch: 'Floating bars encode a change, not a value. Their height is the size of the movement.',
  },
  'bar-butterfly': {
    read: 'Two groups mirrored across a shared category axis. Compare the two sides at each row, and the profile top to bottom.',
    watch: 'The left side is plotted as negative numbers. Read the axis labels as absolute values.',
  },
  'bar-lollipop': {
    read: 'The dot is the value; the stem only leads the eye to it. Read dot position exactly as you would a bar end.',
    watch: 'Less visual weight than a bar, so small differences are easier to miss.',
  },

  /* ── Deviation ────────────────────────────────────────────────────────── */
  'surplus-deficit-line': {
    read: 'The line against a baseline, filled in two colours. Colour tells you the sign; the area shows how long and how far it stayed there.',
    watch: 'A large area is a sustained deviation, not necessarily a large one. Read depth and duration separately.',
  },
  'bar-diverging-stacked': {
    read: 'Responses stack outward from a neutral centre. Length to the right is agreement, to the left disagreement.',
    watch: 'The neutral band is split across the centre, so the midpoint is a convention rather than a measurement.',
  },
  'spine-chart': {
    read: 'Two contrasting groups either side of a central spine, with categories down the middle.',
    watch: 'The two sides use separate scales from the centre outward. Compare within a side, cautiously across.',
  },

  /* ── Part to Whole ────────────────────────────────────────────────────── */
  pie: {
    read: 'Each slice is a share of one total. Angle carries the value.',
    watch: 'People judge angles poorly. Past about five slices, or when two are close, a bar chart tells the truth better.',
  },
  doughnut: {
    read: 'Same as a pie — angle is the value. The hole is free space for a headline number.',
    watch: 'Removing the centre makes the angle harder to judge, not easier. The hole is decoration, not information.',
  },
  'doughnut-gauge': {
    read: 'One value against its maximum. The filled sweep is the proportion reached.',
    watch: 'A gauge spends a lot of space on a single number. A bullet chart shows the same thing with context.',
  },
  'polar-area': {
    read: 'Every segment has the same angle; the radius carries the value.',
    watch: 'Area grows with the square of radius, so a value twice as large looks four times as big unless the scale corrects for it.',
  },
  'nightingale-rose': {
    read: 'Radius is scaled by square root so that segment *area* is proportional to the value — that is the correction the polar area chart lacks.',
    watch: 'Still radial, so comparing non-adjacent segments is hard. Best for cyclical data where position means something.',
  },
  waffle: {
    read: 'Each square is one unit, usually one percent. Count the squares of a colour to read its share.',
    watch: 'Counting is accurate but slow. Good for a handful of categories, poor for many.',
  },
  pictogram: {
    read: 'Each icon is a fixed number of units. Count icons; a part-icon is a fraction of one.',
    watch: 'Isotype’s rule: repeat the symbol, never scale it. A doubled-in-size icon reads as four times the value.',
  },
  'proportional-area': {
    read: 'Area, not width, carries the value — the shapes are scaled by square root so this holds.',
    watch: 'Area comparisons are approximate at best. Use it for orders of magnitude, not for precise ratios.',
  },

  /* ── Radar ────────────────────────────────────────────────────────────── */
  'radar-single': {
    read: 'Each spoke is a dimension, distance from centre is the score. Read the overall silhouette.',
    watch: 'The enclosed area depends on the arbitrary order of the axes. Reorder the spokes and the shape changes with no change in data.',
  },
  'radar-multi': {
    read: 'Overlaid profiles. Look for spokes where the shapes separate — those are the real differences.',
    watch: 'Three profiles is the practical limit before the overlaps become unreadable.',
  },
  'radar-filled': {
    read: 'A single strongly filled profile, when the silhouette is the whole message.',
    watch: 'Fill makes the arbitrary-axis-order problem more visually convincing, not less.',
  },

  /* ── Scatter ──────────────────────────────────────────────────────────── */
  'scatter-basic': {
    read: 'Each dot is one item, placed by two measures. Read the cloud — its slope, spread and any outliers.',
    watch: 'A visible pattern is correlation, not cause. Overlapping dots also hide density; watch for overplotting.',
  },
  'scatter-clusters': {
    read: 'Same as a scatter, with colour marking group membership. Look for whether the groups actually separate.',
    watch: 'Colour makes groups look more distinct than the numbers may justify.',
  },
  bubble: {
    read: 'Position gives two measures, bubble area gives a third.',
    watch: 'Area is judged poorly and large bubbles hide small ones behind them. Keep the third measure secondary.',
  },
  'connected-scatter': {
    read: 'A scatter whose points are joined in time order. Follow the path to see how the two measures moved together.',
    watch: 'Loops and crossings are common and easy to misread. Mark the start and end clearly.',
  },
  'quadrant-chart': {
    read: 'A scatter cut into four named zones by two thresholds. The label of a zone is the recommendation.',
    watch: 'The thresholds are a judgement, not a measurement. Move them and items change category without any change in data.',
  },

  /* ── Distribution ─────────────────────────────────────────────────────── */
  histogram: {
    read: 'Bar height is how many observations fell in that range. The overall shape is the distribution.',
    watch: 'Bin width is an editorial choice, not a fact. Change it and the same data can look bimodal or smooth.',
  },
  'box-plot': {
    read: 'The box spans the middle half of the data, the line inside is the median, whiskers reach most of the rest, and dots are outliers.',
    watch: 'Hides shape completely. Two very different distributions can produce identical boxes — a violin or beeswarm would show the difference.',
  },
  violin: {
    read: 'Width at any height is how many observations sit at that value. Bulges are common values.',
    watch: 'The smoothing bandwidth is a choice. Too smooth hides real structure; too rough invents it.',
  },
  'density-plot': {
    read: 'A smoothed histogram — curve height is relative frequency. Compare where each group’s mass sits.',
    watch: 'No bin-width argument, but bandwidth does exactly the same job. Area under each curve is one, so tall does not mean more data.',
  },
  ridgeline: {
    read: 'One density curve per row, overlapping. Read the horizontal shift between rows as the change.',
    watch: 'Overlap is chosen for looks. Too much and rows hide each other; the ordering also drives the impression.',
  },
  ecdf: {
    read: 'Every point answers "what share of the data is at or below this value?" The median is where the curve crosses 50%.',
    watch: 'Less intuitive than a histogram, but it involves no binning choice, so nothing is hidden by it.',
  },
  beeswarm: {
    read: 'Every observation is one dot, nudged sideways so none hide. Density is visible, and so is the sample size.',
    watch: 'The sideways offset carries no meaning — only position along the value axis does.',
  },
  'barcode-plot': {
    read: 'One thin tick per observation on a shared scale. Clusters and gaps are the point.',
    watch: 'Ticks overlap in dense regions, so it understates how crowded the busiest areas are.',
  },
  heatmap: {
    read: 'Colour intensity is the value at the intersection of a row and a column.',
    watch: 'Colour is read poorly for exact values. Good for spotting patterns and hot spots, poor for reading numbers.',
  },
  'radial-histogram': {
    read: 'Bins wrapped around a circle — the right choice when the variable itself is angular, like direction or time of day.',
    watch: 'Segment area grows with radius, exaggerating the outer values unless scaled for it.',
  },

  /* ── Hierarchy ────────────────────────────────────────────────────────── */
  treemap: {
    read: 'Rectangle area is the value; nesting and colour show the grouping.',
    watch: 'Long thin rectangles are hard to compare against square ones of the same area. Ranking is reliable, ratios less so.',
  },
  sunburst: {
    read: 'Rings are levels of the hierarchy, moving outward. Angle is share of the parent.',
    watch: 'Outer rings have more room at the same angle, which makes deep levels look more significant.',
  },
  icicle: {
    read: 'The same partition as a sunburst, unrolled. Depth runs one way, share the other.',
    watch: 'Easier to label than a sunburst but takes more space for the same information.',
  },
  dendrogram: {
    read: 'Structure and depth of a tree, not the size of its parts. Branch position shows what groups with what.',
    watch: 'Says nothing about magnitude — a leaf worth 1 and a leaf worth 1,000 look the same.',
  },
  'bubble-pack': {
    read: 'Circle area is the value; colour marks the group. Packing is decorative, not meaningful.',
    watch: 'Position carries no information at all here, which is easy to forget when clusters appear.',
  },
  voronoi: {
    read: 'Every cell is the territory closest to its seed point. Cell size shows how isolated a point is.',
    watch: 'Cells are about distance, not about any value at the point. Big cell means remote, not important.',
  },

  /* ── Network ──────────────────────────────────────────────────────────── */
  network: {
    read: 'Nodes and the links between them. Clusters and highly-connected hubs are what to look for.',
    watch: 'Position is decided by a layout algorithm, not by the data. Two nodes drawn close together may have nothing in common.',
  },
  'arc-diagram': {
    read: 'Nodes sit on one line; arcs join the connected ones. Arc span shows how far apart connected nodes are in the ordering.',
    watch: 'The node ordering drives the whole impression — reorder and the picture changes completely.',
  },
  'adjacency-matrix': {
    read: 'A filled cell means a link between that row and column. Blocks along the diagonal are clusters.',
    watch: 'Excellent for dense networks, useless for tracing a path through them.',
  },
  'parallel-sets': {
    read: 'Ribbon thickness is how many items share that combination of categories across the dimensions.',
    watch: 'Ribbon crossings are a layout artefact and carry no meaning.',
  },
  venn: {
    read: 'Overlapping regions are items belonging to more than one set. Numbers give each region’s size.',
    watch: 'Region areas are rarely proportional to their counts. Read the labels, not the geometry.',
  },

  /* ── Flow ─────────────────────────────────────────────────────────────── */
  sankey: {
    read: 'Ribbon width is the quantity flowing. Follow a ribbon left to right to trace where volume goes.',
    watch: 'Node vertical order is chosen to reduce crossings, so height carries no meaning.',
  },
  chord: {
    read: 'Arc length around the circle is a group’s total; ribbon thickness is the volume shared between two groups.',
    watch: 'Beautiful and dense, but reading any single value precisely is difficult.',
  },
  funnel: {
    read: 'Each stage is narrower than the last. The taper is drop-off; the side column gives the honest percentage.',
    watch: 'The shape exaggerates. A gentle narrowing can be a severe loss — read the numbers, not the slope.',
  },
  marimekko: {
    read: 'Column width is one measure and segment height another, so rectangle area is the product of the two.',
    watch: 'Two varying dimensions at once is a lot to ask of a reader. Comparing non-adjacent rectangles is unreliable.',
  },
  'stream-graph': {
    read: 'A stacked area freed from its baseline. Band thickness is the value; total thickness is the total.',
    watch: 'No flat baseline anywhere, so individual values are hard to read. It shows rhythm and composition, not amounts.',
  },

  /* ── Comparison ───────────────────────────────────────────────────────── */
  'slope-chart': {
    read: 'Two points per item joined by a line. Slope direction is the change; crossings are overtakes.',
    watch: 'Only shows the endpoints. Anything that happened in between is invisible.',
  },
  candlestick: {
    read: 'The body spans open to close, the wick shows the high and low. Colour tells you which way it moved.',
    watch: 'Colour convention varies by region — check which way round it is before reading.',
  },
  'parallel-coords': {
    read: 'One line per item crossing several axes. Lines that cross between two axes indicate a trade-off between them.',
    watch: 'Axis order determines which trade-offs are visible. Each axis has its own scale.',
  },
  'bump-chart': {
    read: 'Rank over time on a reversed axis, so first place is at the top. Crossings are overtakes.',
    watch: 'Shows rank, not value. A team can hold first place while collapsing in absolute terms.',
  },
  'mixed-bar-line': {
    read: 'Bars use the left axis, the line uses the right. They are different units deliberately.',
    watch: 'Two axes can be scaled to imply any relationship you like. Treat apparent correlation with suspicion.',
  },
  'mixed-stacked-line': {
    read: 'The stack shows composition, the line shows the total that the stack makes hard to read.',
    watch: 'The line and the stack top are the same quantity — check they actually agree.',
  },
  dumbbell: {
    read: 'Two dots joined by a rule. The gap between them is the point; dot position gives each value.',
    watch: 'Sorting by gap or by endpoint tells quite different stories. Note which is in use.',
  },
  pareto: {
    read: 'Bars sorted descending with a cumulative curve. Where the curve crosses your threshold marks the vital few.',
    watch: 'The 80/20 split is a rule of thumb, not a law. The threshold line is a convention.',
  },
  'span-chart': {
    read: 'Only the minimum and maximum, with the middle removed. Emphasises spread rather than size.',
    watch: 'Says nothing about what happens between the ends — the distribution could be anything.',
  },
  'error-bars': {
    read: 'Bar height is the mean; the whisker is the uncertainty around it. Overlapping whiskers suggest the difference may not be real.',
    watch: 'Always check what the whisker represents — standard deviation, standard error and a confidence interval are very different.',
  },
  timeline: {
    read: 'Each bar spans a period, stacked into lanes. Overlapping lanes show what ran concurrently.',
    watch: 'Lane assignment is usually for packing, not meaning. Vertical position rarely signifies anything.',
  },
  'calendar-heatmap': {
    read: 'A year as a grid of weeks, one square per day, coloured by that day’s value.',
    watch: 'Colour steps compress the scale, so a very busy day and a moderately busy one can look identical.',
  },
  'echarts-heatmap': {
    read: 'One cell per row-and-column pair; colour is the value, read against the scale below the grid.',
    watch: 'Colour is judged poorly in absolute terms, so neighbouring cells read as equal well before they are. Sort the rows and columns or the pattern hides in the noise.',
  },

  /* ── Finance ──────────────────────────────────────────────────────────── */
  ohlc: {
    read: 'A vertical range with a tick left for the open and right for the close. Colour shows direction.',
    watch: 'Thinner than a candlestick and harder to read at a glance, but it uses less ink for the same information.',
  },
  renko: {
    read: 'A brick is drawn only when price moves a fixed amount. The horizontal axis is not time.',
    watch: 'Filtering out small moves also removes when they happened. Never read the x axis as a clock.',
  },
  'point-figure': {
    read: 'Columns of X for rising and O for falling. A new column starts only after a reversal of several boxes.',
    watch: 'Time is entirely absent. A single column can represent one day or one year.',
  },
  kagi: {
    read: 'The line thickens after a break to a new high and thins after a break to a new low. Thickness is the trend signal.',
    watch: 'Like the other three, this is price-driven rather than time-driven. Horizontal distance means nothing.',
  },

  /* ── Geo ──────────────────────────────────────────────────────────────── */
  choropleth: {
    read: 'Regions shaded by value, with the key giving the bands.',
    watch: 'Only ever for rates and ratios. Shade a raw count and you have mostly drawn a population map — big regions dominate regardless.',
  },
  globe: {
    read: 'The same shading on a sphere. Drag to rotate. Countries facing you are the ones being shown.',
    watch: 'Half the world is hidden at any moment, and regions near the edge are foreshortened.',
  },
  'city-map': {
    read: 'One country, with a circle at each city sized by its value. Area carries the number, position is the real location.',
    watch: 'Cities cluster, so circles overlap and hide each other. Longitude comes before latitude in the data — swapping them puts everything in the wrong hemisphere.',
  },
  'proportional-symbol-map': {
    read: 'Circle area at each location is the value. The right choice for counts, where a choropleth would mislead.',
    watch: 'Symbols overlap in dense areas, hiding smaller ones behind larger.',
  },
  'dot-density-map': {
    read: 'Each dot is a fixed number of units, scattered within its region. Dot density is the value.',
    watch: 'Dot positions within a region are random. A dot does not mark an actual location.',
  },
  'flow-map': {
    read: 'Arcs connect origin to destination, with width showing volume.',
    watch: 'Arc curvature is decorative — it is not a route. Crossings mean nothing.',
  },
  'tile-map': {
    read: 'Every region gets an identical square, positioned roughly geographically.',
    watch: 'Deliberately abandons real geography so small regions stay visible. Do not read distance or size from it.',
  },
  cartogram: {
    read: 'Each country is scaled about its own centre in proportion to its value, keeping its recognisable shape.',
    watch: 'Adjacency is destroyed — the gaps between shapes are an artefact, not water.',
  },

  /* ── KPI & Micro ──────────────────────────────────────────────────────── */
  'bullet-chart': {
    read: 'The bar is the actual value, the vertical marker is the target, and the background bands are qualitative ranges.',
    watch: 'Designed as a replacement for the dashboard gauge — it carries far more information in far less space.',
  },
  'radial-bar': {
    read: 'Each ring is one item; the filled arc is its share of the maximum.',
    watch: 'Outer rings are physically longer, so equal values look larger further out. Popular, but a plain bar chart is more honest.',
  },

  /* ── Custom Engine ────────────────────────────────────────────────────── */
  'engine-line': {
    read: 'Reads exactly like any line chart. The difference is under the hood — no Chart.js, just the bundled engine.',
    watch: 'Same caution as any line chart: check whether the value axis starts at zero.',
  },
  'engine-area': {
    read: 'A line chart with the fill switched on. There is no separate area class in the engine.',
    watch: 'Fill implies accumulation. Appropriate for volumes, misleading for rates.',
  },
  'engine-bar': {
    read: 'Grouped, stacked or horizontal from one setting. Compare bar lengths against the shared baseline.',
    watch: 'As with any bar chart, the baseline must be zero for the comparison to hold.',
  },
  'engine-pie': {
    read: 'Angle is the share. The doughnut hole can carry a headline figure.',
    watch: 'Angles are judged poorly; keep the slice count low.',
  },
  'engine-scatter': {
    read: 'Two measures per point, with an optional least-squares trend line the engine computes itself.',
    watch: 'A trend line will be drawn through any cloud, including one with no real relationship.',
  },
};

/** Used when a chart has no entry of its own, so nothing is ever blank. */
export const CATEGORY_HELP = {
  'Line & Area': {
    read: 'Follow the line left to right; height is the value and slope is the rate of change.',
    watch: 'Check whether the value axis starts at zero before trusting the shape.',
  },
  Bar: {
    read: 'Compare lengths against the shared baseline.',
    watch: 'The baseline must be zero, or the comparison misleads.',
  },
  Deviation: {
    read: 'Marks grow away from a reference point; direction is the sign and length the magnitude.',
    watch: 'Check where the reference line sits — it drives the whole impression.',
  },
  'Part to Whole': {
    read: 'Each mark is a share of one total.',
    watch: 'Angles and areas are judged poorly. Keep the number of parts small.',
  },
  Radar: {
    read: 'Each spoke is a dimension; distance from the centre is the score.',
    watch: 'The enclosed shape depends on the arbitrary order of the axes.',
  },
  Scatter: {
    read: 'Each point is one item placed by two measures. Read the cloud, not the individual dots.',
    watch: 'Pattern is correlation, not cause.',
  },
  Distribution: {
    read: 'Shows how values are spread, not just their average.',
    watch: 'Smoothing and binning choices change the picture without changing the data.',
  },
  Hierarchy: {
    read: 'Nesting shows containment; size shows value.',
    watch: 'Deeply nested levels are hard to compare against each other.',
  },
  Network: {
    read: 'Nodes are things, links are relationships. Look for clusters and hubs.',
    watch: 'Layout position is chosen by an algorithm and carries no meaning.',
  },
  Flow: {
    read: 'Width is quantity moving between states.',
    watch: 'Vertical ordering and crossings are layout artefacts.',
  },
  Comparison: {
    read: 'Built to set two or more things side by side.',
    watch: 'Check that both sides share a scale before comparing them.',
  },
  Finance: {
    read: 'Price movement over a session or a threshold.',
    watch: 'Several of these are price-driven rather than time-driven — the x axis may not be a clock.',
  },
  Geo: {
    read: 'Position is real geography; colour or size carries the value.',
    watch: 'Large regions dominate visually regardless of what the data says.',
  },
  'KPI & Micro': {
    read: 'Compact marks meant to be read at a glance rather than studied.',
    watch: 'Precision is traded away for density by design.',
  },
  'Custom Engine': {
    read: 'Reads like its Chart.js equivalent; the difference is that it needs no charting library.',
    watch: 'Same reading cautions as the standard chart of this type.',
  },
};

/** Help for a chart, falling back to its category. */
export function helpFor(def) {
  return CHART_HELP[def.id] || CATEGORY_HELP[def.category] || null;
}
