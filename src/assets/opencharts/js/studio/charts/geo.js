/**
 * Geo charts: choropleth, proportional symbol, dot density, flow map,
 * tile grid map and non-contiguous cartogram.
 *
 * Boundary data is fetched from a CDN at runtime rather than vendored — a
 * world topology is ~110KB and does not belong in a chart library's repo. Each
 * chart declares `libraries: ['topojson', 'worldAtlas']`, which is what puts
 * both entries in the Sources panel and in the exported code's header.
 *
 * The tile map is the exception: it needs no boundary data at all, because its
 * whole premise is that every country becomes an identically sized square.
 */

import { C } from '../palette.js';
import { REGION_VALUES } from './_data.js';
import { countryKey } from '../geodata.js';

function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function next() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Fetch and memoise a topology on `window`, so switching charts in the studio
 * does not refetch it — and so the exported page works unchanged.
 */
function loadTopology(url) {
  if (!window.__ocTopoCache) window.__ocTopoCache = {};
  if (!window.__ocTopoCache[url]) {
    window.__ocTopoCache[url] = fetch(url).then((r) => {
      if (!r.ok) throw new Error('Could not load boundaries: HTTP ' + r.status);
      return r.json();
    });
  }
  return window.__ocTopoCache[url];
}

/**
 * The value for one region, or null if the data does not cover it.
 *
 * Matching is case- and punctuation-insensitive because nobody should have to
 * guess whether Natural Earth writes "United States" or "United States of
 * America".
 *
 * There is deliberately no fallback. This used to hash the country's name into
 * a number when no value was supplied, which filled every map on the site with
 * figures that looked authoritative and meant nothing. A country with no entry
 * is now drawn in the no-data colour, which is the truth.
 */
function valueFor(name, lookup) {
  const key = countryKey(name);
  for (const k in lookup) {
    if (countryKey(k) === key) return lookup[k];
  }
  return null;
}

/**
 * The country features a map is focused on.
 *
 * Takes an array, a single name, or a comma-separated string — the last two so
 * that a share link written before this took a list still resolves.
 *
 * Matching ignores case, punctuation and spacing, and accepts the common short
 * names: Natural Earth writes "United States of America", but nobody types it.
 * Returns an empty array for the world view, which every caller reads as
 * "no focus" without needing a null check.
 */
function findCountries(features, want) {
  const names = Array.isArray(want) ? want : String(want || '').split(',');
  const out = [];
  names.forEach((name) => {
    const trimmed = String(name).trim();
    if (!trimmed || trimmed === 'World') return;
    const wanted = countryKey(trimmed);
    if (!wanted) return;
    const hit = features.find((f) => countryKey(f.properties.name) === wanted)
      || features.find((f) => countryKey(f.properties.name).startsWith(wanted));
    if (hit && out.indexOf(hit) < 0) out.push(hit);
  });
  return out;
}

/**
 * Wrap the focused features so a projection can be fitted to all of them at
 * once. Two countries on opposite sides of the world will fit to a very wide
 * frame, which is the honest result rather than a bug.
 */
function focusedOn(o) {
  return [].concat(o.countries || o.country || []).filter(Boolean);
}

function focusExtent(list) {
  return list.length ? { type: 'FeatureCollection', features: list } : null;
}

/**
 * Fit the projection to one country rather than the whole world, leaving a
 * margin so coastlines are not flush against the frame.
 */
function fitToCountry(projection, feature, W, H, margin) {
  const m = margin == null ? 18 : margin;
  projection.fitExtent([[m, m], [W - m, H - m]], feature);
  return projection;
}

/** Show a message in place of the map when the fetch fails. */
function geoMessage(host, text) {
  const p = document.createElement('div');
  p.style.cssText = 'display:grid;place-items:center;min-height:200px;padding:1.5rem;'
    + 'text-align:center;font-size:13px;color:#8b8880;line-height:1.5';
  p.textContent = text;
  host.appendChild(p);
}

const WORLD_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';

/**
 * Focus the map on one country.
 *
 * A searchable list rather than free text, because the atlas spells countries
 * its own way ("Bosnia and Herz.", "Dem. Rep. Congo") and a reasonable guess
 * used to match nothing at all, leaving the map silently on the world. Typing
 * still works; it now filters the list instead of hoping for a hit.
 */
const countryControl = {
  group: 'Area', type: 'countries', key: 'opts.countries',
  label: 'Focus on countries',
  placeholder: 'Add a country…',
  emptyLabel: 'Whole world',
};

const projectionControl = {
  group: 'Projection', type: 'seg', key: 'opts.projection', label: 'Projection',
  options: [
    { value: 'naturalEarth', label: 'Flat' },
    { value: 'equalEarth', label: 'Equal area' },
    { value: 'mercator', label: 'Mercator' },
    { value: 'globe', label: '3D globe' },
  ],
};

/*
 * Orthographic is what a sphere actually looks like from far away, so it reads
 * as three-dimensional without any of the distortion an extruded 3D map
 * introduces — no occlusion, and area comparisons stay honest. The projection
 * table itself lives inside makeProjection so it survives serialisation.
 */

/**
 * Is a lon/lat on the near side of the globe?
 *
 * Orthographic projects the far hemisphere onto the same disc as the near one,
 * so without this test Sydney would be drawn on top of the Atlantic. Any
 * projection that is not a globe shows everything.
 */
function isVisible(projection, lonLat, name) {
  if (name !== 'globe') return true;
  const r = projection.rotate();
  // The centre of the visible hemisphere is the inverse of the rotation.
  const centre = [-r[0], -r[1]];
  return d3.geoDistance(lonLat, centre) < Math.PI / 2;
}

/**
 * Build the projection a spec asks for, fitted to the frame.
 *
 * The lookup is built inside the function rather than referencing a
 * module-level const: this helper is serialised verbatim into the exported
 * code, and anything it closes over would arrive undefined there.
 */
function makeProjection(name, geo, W, H, rotate, focus) {
  const factories = {
    naturalEarth: () => d3.geoNaturalEarth1(),
    equalEarth: () => d3.geoEqualEarth(),
    mercator: () => d3.geoMercator(),
    globe: () => d3.geoOrthographic().clipAngle(90),
  };
  const projection = (factories[name] || factories.naturalEarth)();

  // Focused on one or more countries: Mercator is the sensible default at
  // national scale, and the globe turns to face the middle of them rather than
  // being fitted flat. `focus` here is the combined extent, or null for the
  // world — never an array, so a plain truthiness test is right.
  if (focus) {
    if (name === 'globe') {
      const c = d3.geoCentroid(focus);
      projection.rotate([-c[0], -c[1], 0]).fitExtent([[18, 18], [W - 18, H - 18]], { type: 'Sphere' });
    } else {
      projection.fitExtent([[18, 18], [W - 18, H - 18]], focus);
    }
    return projection;
  }

  if (name === 'globe') {
    if (rotate) projection.rotate(rotate);
    // fitSize on a clipped globe leaves it lopsided; fit the sphere instead.
    projection.fitSize([W, H], { type: 'Sphere' });
  } else {
    projection.fitSize([W, H], geo);
  }
  return projection;
}

/**
 * Give a globe drag-to-rotate. Returns nothing; the caller re-renders.
 * Kept separate so it can be serialised into the exported code intact.
 *
 * Every map that offers the globe projection calls this, not just the Globe
 * chart — a sphere you cannot turn is worse than a flat map, because half the
 * data is behind it with no way to reach it.
 */
function attachGlobeDrag(svg, spec, redraw) {
  if (!svg || typeof redraw !== 'function') return;
  svg.style.cursor = 'grab';
  // Without this a touch drag scrolls the page instead of turning the globe.
  svg.style.touchAction = 'none';

  svg.addEventListener('pointerdown', (e) => {
    let last = [e.clientX, e.clientY];
    svg.style.cursor = 'grabbing';
    e.preventDefault();

    // Move and release are watched on the window rather than the SVG for two
    // reasons: a redraw may replace the SVG mid-drag, and the pointer often
    // leaves the element while turning. They are added per drag and removed on
    // release, so they cannot accumulate — the previous version added a pair
    // on every redraw and never removed any.
    const onMove = (ev) => {
      const dx = ev.clientX - last[0];
      const dy = ev.clientY - last[1];
      last = [ev.clientX, ev.clientY];
      const r = spec.opts.rotate || [0, -15, 0];
      // Vertical drag is clamped so the globe cannot tumble past the poles.
      spec.opts.rotate = [r[0] + dx * 0.4, Math.max(-90, Math.min(90, r[1] - dy * 0.4)), r[2]];
      redraw();
    };
    const onUp = () => {
      svg.style.cursor = 'grab';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });
}

export const geoCharts = [
  {
    id: 'choropleth',
    title: 'Choropleth Map',
    category: 'Geo',
    blurb: 'Regions shaded by value. Only ever for rates and ratios — shade a raw count and you have drawn a population map.',
    tags: ['choropleth', 'map', 'geo', 'spatial', 'countries', 'rate', 'd3'],
    spec: {
      regionValues: { ...REGION_VALUES },
      lowColor: '#EDE9FB',
      highColor: C.green,
      opts: { countries: [], clipToCountry: true, neighbourColor: '#EDEBE4', rotate: [0, -15, 0], projection: 'naturalEarth', steps: 6, strokeWidth: 0.4, showGraticule: false, showLegend: true, noDataColor: '#E6E3DA', suffix: '%' },
    },
    controls: [
      countryControl,
      projectionControl,
      { group: 'Colour', type: 'colors', key: 'scaleColors', label: 'Low / high', names: () => ['Low', 'High'] },
      { group: 'Colour', type: 'slider', key: 'opts.steps', label: 'Colour steps', min: 3, max: 9, step: 1 },
      { group: 'Style',  type: 'slider', key: 'opts.strokeWidth', label: 'Border width', min: 0, max: 2, step: 0.1, format: (v) => v.toFixed(1) + 'px' },
      { group: 'Style',  type: 'toggle', key: 'opts.showGraticule', label: 'Show graticule' },
      { group: 'Style',  type: 'toggle', key: 'opts.showLegend', label: 'Show colour key' },
    ],
    onInit(spec) { spec.scaleColors = [spec.lowColor, spec.highColor]; },
    onChange(spec) { [spec.lowColor, spec.highColor] = spec.scaleColors; },
    d3: {
      height: 440,
      libraries: ['topojson', 'worldAtlas'],
      helpers: [countryKey, loadTopology, valueFor, geoMessage, makeProjection, findCountries, focusExtent, focusedOn, attachGlobeDrag],
      mount(host, spec, W, H, env) {
        const o = spec.opts;
        const url = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';
        const svg = d3.select(host).append('svg').attr('width', W).attr('height', H);
        // A globe you cannot turn hides half its data behind itself. Not when
        // it is focused on a country, though: the projection is then locked to
        // that country's centroid, so a drag would move nothing.
        if (o.projection === 'globe' && !focusedOn(o).length) attachGlobeDrag(svg.node(), spec, env && env.redraw);

        loadTopology(url).then((topo) => {
          const geo = topojson.feature(topo, topo.objects.countries);
          const focus = findCountries(geo.features, o.countries || o.country);
          const inFocus = (d) => focus.indexOf(d) >= 0;
          const extent = focusExtent(focus);
          const projection = makeProjection(o.projection, geo, W, H - (o.showLegend ? 30 : 0), o.rotate, extent);
          const path = d3.geoPath(projection);

          // Quantise a continuous scale so the key reads as discrete bands.
          const domain = spec.regionValues && Object.keys(spec.regionValues).length
            ? d3.extent(Object.values(spec.regionValues))
            : [0, 100];
          const colour = d3.scaleQuantize()
            .domain(domain[0] === domain[1] ? [domain[0], domain[0] + 1] : domain)
            .range(d3.quantize(d3.interpolateRgb(spec.lowColor, spec.highColor), o.steps));

          if (o.showGraticule) {
            svg.append('path')
              .datum(d3.geoGraticule10())
              .attr('d', path)
              .attr('fill', 'none')
              .attr('stroke', 'currentColor')
              .attr('stroke-opacity', 0.12);
          }

          svg.append('g').selectAll('path').data(geo.features).join('path')
            .attr('d', path)
            .attr('fill', (d) => {
              if (focus.length && !inFocus(d)) return o.neighbourColor;
              const v = valueFor(d.properties.name || String(d.id), spec.regionValues);
              return v == null ? o.noDataColor : colour(v);
            })
            .attr('stroke', '#ffffff')
            .attr('stroke-width', o.strokeWidth)
            .attr('data-tip', (d) => {
              const v = valueFor(d.properties.name || String(d.id), spec.regionValues);
              return d.properties.name + ': ' + (v == null ? 'no data' : v.toFixed(1) + o.suffix);
            });

          if (o.showLegend) {
            const swatch = 26;
            const key = svg.append('g').attr('transform', `translate(14,${H - 22})`);
            colour.range().forEach((c, i) => {
              key.append('rect')
                .attr('x', i * swatch).attr('width', swatch).attr('height', 9)
                .attr('fill', c);
              key.append('text')
                .attr('x', i * swatch).attr('y', 21)
                .attr('font-size', 9)
                .attr('font-family', '"DM Sans", system-ui, sans-serif')
                .attr('fill', 'currentColor')
                .text(Math.round(domain[0] + ((domain[1] - domain[0]) / o.steps) * i));
            });
          }
        }).catch((err) => geoMessage(host, err.message));
      },
    },
    legend: () => null,
  },

  {
    id: 'globe',
    title: 'Globe',
    category: 'Geo',
    blurb: 'The world as a sphere, shaded by value. Drag to spin it. Honest 3D — no extrusion, no occlusion, no distorted areas.',
    tags: ['globe', '3d', 'orthographic', 'sphere', 'world', 'rotate', 'earth', 'map'],
    spec: {
      regionValues: { ...REGION_VALUES },
      lowColor: '#E7F1EC',
      highColor: '#16916A',
      opts: {
        countries: [],
        neighbourColor: '#E6E3DA',
        projection: 'globe',
        rotate: [-10, -12, 0],
        steps: 6,
        strokeWidth: 0.4,
        showGraticule: true,
        showOcean: true,
        oceanColor: '#DCE9F2',
        showHalo: true,
        noDataColor: '#E6E3DA',
        suffix: '%',
      },
    },
    controls: [
      { group: 'Area', type: 'countries', key: 'opts.countries', label: 'Turn to countries', placeholder: 'Add a country…', emptyLabel: 'Whole world' },
      { group: 'Rotation', type: 'slider', key: 'opts.rotate.0', label: 'Spin (longitude)', min: -180, max: 180, step: 5, format: (v) => v + '°' },
      { group: 'Rotation', type: 'slider', key: 'opts.rotate.1', label: 'Tilt (latitude)', min: -90, max: 90, step: 5, format: (v) => v + '°' },
      { group: 'Colour', type: 'colors', key: 'scaleColors', label: 'Low / high', names: () => ['Low', 'High'] },
      { group: 'Colour', type: 'slider', key: 'opts.steps', label: 'Colour steps', min: 3, max: 9, step: 1 },
      { group: 'Style',  type: 'toggle', key: 'opts.showOcean', label: 'Fill the ocean' },
      { group: 'Style',  type: 'toggle', key: 'opts.showGraticule', label: 'Show graticule' },
      { group: 'Style',  type: 'toggle', key: 'opts.showHalo', label: 'Atmospheric halo' },
      { group: 'Style',  type: 'slider', key: 'opts.strokeWidth', label: 'Border width', min: 0, max: 2, step: 0.1, format: (v) => v.toFixed(1) + 'px' },
    ],
    onInit(spec) { spec.scaleColors = [spec.lowColor, spec.highColor]; },
    onChange(spec) { [spec.lowColor, spec.highColor] = spec.scaleColors; },
    d3: {
      height: 460,
      libraries: ['topojson', 'worldAtlas'],
      helpers: [countryKey, loadTopology, valueFor, geoMessage, makeProjection, findCountries, focusExtent, focusedOn, attachGlobeDrag],
      mount(host, spec, W, H) {
        const o = spec.opts;
        const url = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';
        const svg = d3.select(host).append('svg').attr('width', W).attr('height', H);

        loadTopology(url).then((topo) => {
          const geo = topojson.feature(topo, topo.objects.countries);

          const draw = () => {
            svg.selectAll('*').remove();
            const focus = findCountries(geo.features, o.countries || o.country);
            const inFocus = (d) => focus.indexOf(d) >= 0;
            const extent = focusExtent(focus);
            const projection = makeProjection('globe', geo, W, H, o.rotate, extent);
            const path = d3.geoPath(projection);

            const domain = spec.regionValues && Object.keys(spec.regionValues).length
              ? d3.extent(Object.values(spec.regionValues))
              : [0, 100];
            const colour = d3.scaleQuantize()
              .domain(domain[0] === domain[1] ? [domain[0], domain[0] + 1] : domain)
              .range(d3.quantize(d3.interpolateRgb(spec.lowColor, spec.highColor), o.steps));

            if (o.showHalo) {
              // A soft rim outside the sphere reads as atmosphere.
              const id = 'globe-halo';
              const grad = svg.append('defs').append('radialGradient').attr('id', id);
              grad.append('stop').attr('offset', '82%').attr('stop-color', o.oceanColor).attr('stop-opacity', 0);
              grad.append('stop').attr('offset', '100%').attr('stop-color', o.oceanColor).attr('stop-opacity', 0.75);
              svg.append('circle')
                .attr('cx', W / 2).attr('cy', H / 2)
                .attr('r', Math.min(W, H) / 2)
                .attr('fill', 'url(#' + id + ')');
            }

            if (o.showOcean) {
              svg.append('path')
                .datum({ type: 'Sphere' })
                .attr('d', path)
                .attr('fill', o.oceanColor);
            }

            if (o.showGraticule) {
              svg.append('path')
                .datum(d3.geoGraticule10())
                .attr('d', path)
                .attr('fill', 'none')
                .attr('stroke', 'currentColor')
                .attr('stroke-opacity', 0.16);
            }

            svg.append('g').selectAll('path').data(geo.features).join('path')
              .attr('d', path)
              .attr('fill', (d) => {
                const v = valueFor(d.properties.name || String(d.id), spec.regionValues);
                return v == null ? o.noDataColor : colour(v);
              })
              .attr('stroke', '#ffffff')
              .attr('stroke-width', o.strokeWidth)
              .attr('data-tip', (d) => {
                const v = valueFor(d.properties.name || String(d.id), spec.regionValues);
                return d.properties.name + ': ' + (v == null ? 'no data' : v.toFixed(1) + o.suffix);
              });

            // The sphere outline sits on top so the edge stays crisp.
            svg.append('path')
              .datum({ type: 'Sphere' })
              .attr('d', path)
              .attr('fill', 'none')
              .attr('stroke', 'currentColor')
              .attr('stroke-opacity', 0.25);
          };

          draw();
          if (!focusedOn(o).length) attachGlobeDrag(svg.node(), spec, draw);
        }).catch((err) => geoMessage(host, err.message));
      },
    },
    legend: (spec) => [
      { label: 'Low', color: spec.lowColor, toggleable: false },
      { label: 'High', color: spec.highColor, toggleable: false },
    ],
  },

  {
    id: 'city-map',
    title: 'City Map',
    category: 'Geo',
    blurb: 'One country, with a value at each city. The common case when the statistic you have is local, not national.',
    tags: ['city', 'country', 'map', 'geo', 'local', 'regional', 'points', 'd3'],
    spec: {
      countries: ['Jordan'],
      places: [
        { name: 'Amman',    lon: 35.93, lat: 31.95, value: 4300 },
        { name: 'Zarqa',    lon: 36.09, lat: 32.07, value: 1450 },
        { name: 'Irbid',    lon: 35.85, lat: 32.55, value: 1180 },
        { name: 'Russeifa', lon: 36.05, lat: 32.02, value: 570 },
        { name: 'Aqaba',    lon: 35.00, lat: 29.53, value: 190 },
        { name: 'Madaba',   lon: 35.79, lat: 31.72, value: 110 },
        { name: 'Karak',    lon: 35.70, lat: 31.18, value: 70 },
        { name: 'Maan',     lon: 35.73, lat: 30.19, value: 50 },
      ],
      color: C.green,
      opts: {
        countries: ['Jordan'],
        clipToCountry: false,
        projection: 'mercator',
        rotate: [0, -15, 0],
        maxRadius: 30,
        alpha: 0.62,
        landColor: '#F0EEE7',
        neighbourColor: '#E6E3DA',
        showLabels: true,
        labelMin: 8,
        strokeWidth: 1.3,
        suffix: 'k',
      },
    },
    controls: [
      { group: 'Area',    type: 'countries', key: 'opts.countries', label: 'Countries', placeholder: 'Add a country…', onlyWithCities: true },
      { group: 'Area',    type: 'cities', key: 'places', from: 'opts.countries', label: 'Cities on the map' },
      { group: 'Area',    type: 'toggle', key: 'opts.clipToCountry', label: 'Hide cities outside it' },
      { group: 'Symbols', type: 'colors', key: 'symbolColor', label: 'Symbol colour' },
      { group: 'Symbols', type: 'slider', key: 'opts.maxRadius', label: 'Largest city', min: 8, max: 70, step: 2, format: (v) => v + 'px' },
      { group: 'Symbols', type: 'slider', key: 'opts.alpha', label: 'Fill opacity', min: 0.15, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Labels',  type: 'toggle', key: 'opts.showLabels', label: 'Show city names' },
      { group: 'Labels',  type: 'slider', key: 'opts.labelMin', label: 'Label threshold', min: 0, max: 100, step: 5, format: (v) => (v ? v + '%+' : 'all') },
      { group: 'Labels',  type: 'text',   key: 'opts.suffix', label: 'Value suffix' },
    ],
    onInit(spec) { spec.symbolColor = [spec.color]; },
    onChange(spec) {
      spec.color = spec.symbolColor[0];
      // opts.countries is what the helpers read, so it is the authority. The
      // top-level copy is mirrored from it for a legible saved config —
      // mirroring the other way made the control unable to change anything,
      // because the stale copy overwrote every new choice.
      spec.country = (spec.opts.countries || [])[0] || '';
    },
    d3: {
      height: 460,
      libraries: ['topojson', 'worldAtlas'],
      helpers: [countryKey, loadTopology, geoMessage, makeProjection, findCountries, focusExtent, focusedOn],
      mount(host, spec, W, H) {
        const o = spec.opts;
        const url = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';
        const svg = d3.select(host).append('svg').attr('width', W).attr('height', H);

        loadTopology(url).then((topo) => {
          const geo = topojson.feature(topo, topo.objects.countries);
          const focus = findCountries(geo.features, o.countries || o.country);
          const inFocus = (d) => focus.indexOf(d) >= 0;
          const extent = focusExtent(focus);
          const asked = [].concat(o.countries || o.country || []).filter(Boolean);
          if (asked.length && !focus.length) {
            geoMessage(host, `No country matched ${asked.map((c) => '"' + c + '"').join(' or ')}. Try the English name, for example "Jordan" or "Germany".`);
            return;
          }
          const projection = makeProjection(o.projection, geo, W, H, o.rotate, extent);
          const path = d3.geoPath(projection);

          svg.append('g').selectAll('path').data(geo.features).join('path')
            .attr('d', path)
            .attr('fill', (d) => (focus.length && !inFocus(d) ? o.neighbourColor : o.landColor))
            .attr('stroke', '#ffffff')
            .attr('stroke-width', (d) => (inFocus(d) ? 1.2 : 0.4));

          const maxV = Math.max(...spec.places.map((p) => p.value), 1);
          const r = (v) => o.maxRadius * Math.sqrt(v / maxV);
          const alphaHex = Math.round(o.alpha * 255).toString(16).padStart(2, '0');

          const pts = spec.places
            .map((p) => ({ ...p, xy: projection([p.lon, p.lat]) }))
            .filter((p) => p.xy && (!focus.length || !o.clipToCountry || focus.some((f) => d3.geoContains(f, [p.lon, p.lat]))))
            .sort((a, b) => b.value - a.value);

          if (!pts.length) {
            geoMessage(host, focus
              ? `None of these places fall inside ${focus.map((f) => f.properties.name).join(' or ')}. Check that longitude comes before latitude.`
              : 'No places could be placed. Check the longitude and latitude columns.');
            return;
          }

          const g = svg.append('g').selectAll('g').data(pts).join('g')
            .attr('transform', (d) => `translate(${d.xy[0]},${d.xy[1]})`);

          g.append('circle')
            .attr('r', (d) => r(d.value))
            .attr('fill', spec.color + alphaHex)
            .attr('stroke', spec.color)
            .attr('stroke-width', o.strokeWidth)
            .attr('data-tip', (d) => `${d.name}: ${d.value}${o.suffix}`);

          if (o.showLabels) {
            // Below the threshold the labels are noise on a crowded map.
            g.filter((d) => (d.value / maxV) * 100 >= o.labelMin)
              .append('text')
              .attr('text-anchor', 'middle')
              .attr('dy', (d) => -r(d.value) - 5)
              .attr('font-size', 11)
              .attr('font-family', '"DM Sans", system-ui, sans-serif')
              .attr('fill', 'currentColor')
              .attr('pointer-events', 'none')
              .text((d) => d.name);
          }
        }).catch((err) => geoMessage(host, err.message));
      },
    },
    legend: () => null,
  },

  {
    id: 'proportional-symbol-map',
    title: 'Proportional Symbol Map',
    category: 'Geo',
    blurb: 'Circles sized by value at each location. The right chart for counts, where a choropleth would mislead.',
    tags: ['proportional symbol', 'bubble map', 'map', 'geo', 'counts', 'cities', 'd3'],
    spec: {
      places: [
        { name: 'Tokyo',        lon: 139.7, lat: 35.7, value: 37 },
        { name: 'Delhi',        lon: 77.2,  lat: 28.6, value: 33 },
        { name: 'Shanghai',     lon: 121.5, lat: 31.2, value: 29 },
        { name: 'São Paulo',    lon: -46.6, lat: -23.6, value: 22 },
        { name: 'Mexico City',  lon: -99.1, lat: 19.4, value: 22 },
        { name: 'Cairo',        lon: 31.2,  lat: 30.0, value: 22 },
        { name: 'New York',     lon: -74.0, lat: 40.7, value: 19 },
        { name: 'Lagos',        lon: 3.4,   lat: 6.5,  value: 16 },
        { name: 'London',       lon: -0.1,  lat: 51.5, value: 9 },
        { name: 'Paris',        lon: 2.4,   lat: 48.9, value: 11 },
        { name: 'Moscow',       lon: 37.6,  lat: 55.8, value: 13 },
        { name: 'Sydney',       lon: 151.2, lat: -33.9, value: 5 },
      ],
      color: C.amber,
      opts: { countries: [], clipToCountry: true, neighbourColor: '#EDEBE4', rotate: [0, -15, 0], projection: 'naturalEarth', maxRadius: 26, alpha: 0.62, landColor: '#E8E5DC', showLabels: false, strokeWidth: 1.2, suffix: 'M' },
    },
    controls: [
      countryControl,
      { group: 'Area', type: 'cities', key: 'places', from: 'opts.countries', label: 'Cities on the map' },
      { group: 'Area', type: 'toggle', key: 'opts.clipToCountry', label: 'Only points inside it' },
      projectionControl,
      { group: 'Symbols', type: 'colors', key: 'symbolColor', label: 'Symbol colour' },
      { group: 'Symbols', type: 'slider', key: 'opts.maxRadius', label: 'Largest radius', min: 8, max: 60, step: 2, format: (v) => v + 'px' },
      { group: 'Symbols', type: 'slider', key: 'opts.alpha', label: 'Fill opacity', min: 0.15, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Symbols', type: 'toggle', key: 'opts.showLabels', label: 'Show city names' },
    ],
    onInit(spec) { spec.symbolColor = [spec.color]; },
    onChange(spec) { spec.color = spec.symbolColor[0]; },
    d3: {
      height: 440,
      libraries: ['topojson', 'worldAtlas'],
      helpers: [countryKey, loadTopology, geoMessage, makeProjection, findCountries, focusExtent, focusedOn, isVisible, attachGlobeDrag],
      mount(host, spec, W, H, env) {
        const o = spec.opts;
        const url = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';
        const svg = d3.select(host).append('svg').attr('width', W).attr('height', H);
        // A globe you cannot turn hides half its data behind itself. Not when
        // it is focused on a country, though: the projection is then locked to
        // that country's centroid, so a drag would move nothing.
        if (o.projection === 'globe' && !focusedOn(o).length) attachGlobeDrag(svg.node(), spec, env && env.redraw);

        loadTopology(url).then((topo) => {
          const geo = topojson.feature(topo, topo.objects.countries);
          const focus = findCountries(geo.features, o.countries || o.country);
          const inFocus = (d) => focus.indexOf(d) >= 0;
          const extent = focusExtent(focus);
          const projection = makeProjection(o.projection, geo, W, H, o.rotate, extent);
          const path = d3.geoPath(projection);

          // Focused: neighbours recede so the country of interest reads first.
          svg.append('g').selectAll('path').data(geo.features).join('path')
            .attr('d', path)
            .attr('fill', (d) => (focus.length && !inFocus(d) ? o.neighbourColor : o.landColor))
            .attr('stroke', '#ffffff')
            .attr('stroke-width', (d) => (inFocus(d) ? 1.1 : 0.4));

          // Radius scales with the square root of the value, so area encodes it.
          const maxV = Math.max(...spec.places.map((p) => p.value), 1);
          const r = (v) => o.maxRadius * Math.sqrt(v / maxV);
          const alphaHex = Math.round(o.alpha * 255).toString(16).padStart(2, '0');

          // A focused map should show that country's cities, not the world's.
          const onMap = spec.places
            .map((p) => ({ ...p, xy: projection([p.lon, p.lat]) }))
            .filter((p) => p.xy && isVisible(projection, [p.lon, p.lat], o.projection));
          const inside = onMap.filter((p) => !focus.length || !o.clipToCountry
            || focus.some((f) => d3.geoContains(f, [p.lon, p.lat])));
          // Clipping everything away leaves a blank map with no explanation,
          // which is worse than showing the points that do exist.
          const pts = (inside.length ? inside : onMap).sort((a, b) => b.value - a.value);

          const g = svg.append('g').selectAll('g').data(pts).join('g')
            .attr('transform', (d) => `translate(${d.xy[0]},${d.xy[1]})`);

          g.append('circle')
            .attr('r', (d) => r(d.value))
            .attr('fill', spec.color + alphaHex)
            .attr('stroke', spec.color)
            .attr('stroke-width', o.strokeWidth)
            .attr('data-tip', (d) => `${d.name}: ${d.value}${o.suffix}`);

          if (o.showLabels) {
            g.append('text')
              .attr('text-anchor', 'middle')
              .attr('dy', (d) => -r(d.value) - 4)
              .attr('font-size', 10)
              .attr('font-family', '"DM Sans", system-ui, sans-serif')
              .attr('fill', 'currentColor')
              .text((d) => d.name);
          }
        }).catch((err) => geoMessage(host, err.message));
      },
    },
    legend: () => null,
  },

  {
    id: 'dot-density-map',
    title: 'Dot Density Map',
    category: 'Geo',
    blurb: 'One dot per n units, scattered inside each region. Shows where things are without shading whole areas.',
    tags: ['dot density', 'map', 'geo', 'scatter', 'population', 'distribution', 'd3'],
    spec: {
      // Dot placement is randomised but seeded, so an export redraws the map
      // it was copied from rather than reshuffling every load.
      seed: 17,
      regionValues: { ...REGION_VALUES },
      color: C.blue,
      opts: { countries: [], clipToCountry: true, neighbourColor: '#EDEBE4', rotate: [0, -15, 0], projection: 'naturalEarth', dotsPerRegion: 26, radius: 1.5, alpha: 0.62, landColor: '#EFEDE5', maxAttempts: 220 },
    },
    controls: [
      countryControl,
      projectionControl,
      { group: 'Dots',  type: 'slider', key: 'opts.dotsPerRegion', label: 'Dots per region', min: 4, max: 80, step: 2 },
      { group: 'Dots',  type: 'slider', key: 'opts.radius', label: 'Dot size', min: 0.6, max: 5, step: 0.2, format: (v) => v.toFixed(1) + 'px' },
      { group: 'Dots',  type: 'slider', key: 'opts.alpha', label: 'Dot opacity', min: 0.15, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Dots',  type: 'colors', key: 'dotColor', label: 'Dot colour' },
    ],
    onInit(spec) { spec.dotColor = [spec.color]; },
    onChange(spec) { spec.color = spec.dotColor[0]; },
    d3: {
      height: 440,
      libraries: ['topojson', 'worldAtlas'],
      helpers: [countryKey, makeRng, loadTopology, valueFor, geoMessage, makeProjection, findCountries, focusExtent, focusedOn, isVisible, attachGlobeDrag],
      mount(host, spec, W, H, env) {
        const o = spec.opts;
        const url = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';
        const svg = d3.select(host).append('svg').attr('width', W).attr('height', H);
        // A globe you cannot turn hides half its data behind itself. Not when
        // it is focused on a country, though: the projection is then locked to
        // that country's centroid, so a drag would move nothing.
        if (o.projection === 'globe' && !focusedOn(o).length) attachGlobeDrag(svg.node(), spec, env && env.redraw);

        loadTopology(url).then((topo) => {
          const geo = topojson.feature(topo, topo.objects.countries);
          const focus = findCountries(geo.features, o.countries || o.country);
          const inFocus = (d) => focus.indexOf(d) >= 0;
          const extent = focusExtent(focus);
          const projection = makeProjection(o.projection, geo, W, H, o.rotate, extent);
          const path = d3.geoPath(projection);

          svg.append('g').selectAll('path').data(geo.features).join('path')
            .attr('d', path)
            .attr('fill', (d) => (focus.length && !inFocus(d) ? o.neighbourColor : o.landColor))
            .attr('stroke', '#ffffff')
            .attr('stroke-width', (d) => (inFocus(d) ? 1.1 : 0.4));

          // Rejection sampling: throw points at each country's bounding box and
          // keep the ones that land inside it.
          const rnd = makeRng(spec.seed * 7919);
          const dots = [];
          const scatterIn = focus.length ? focus : geo.features;
          scatterIn.forEach((f) => {
            const name = f.properties.name || String(f.id);
            const raw = valueFor(name, spec.regionValues);
            const share = Math.max(0, (raw == null ? 0 : raw)) / 100;
            const want = Math.round(o.dotsPerRegion * share);
            if (want < 1) return;
            const b = d3.geoBounds(f);
            let placed = 0;
            for (let i = 0; i < o.maxAttempts && placed < want; i++) {
              const lon = b[0][0] + rnd() * (b[1][0] - b[0][0]);
              const lat = b[0][1] + rnd() * (b[1][1] - b[0][1]);
              if (!d3.geoContains(f, [lon, lat])) continue;
              const xy = projection([lon, lat]);
              if (!xy || !isVisible(projection, [lon, lat], o.projection)) continue;
              // Carry the country through, so a dot can say what it counts.
              dots.push({ xy: xy, name: name, value: raw });
              placed++;
            }
          });

          const alphaHex = Math.round(o.alpha * 255).toString(16).padStart(2, '0');
          svg.append('g').selectAll('circle').data(dots).join('circle')
            .attr('cx', (d) => d.xy[0])
            .attr('cy', (d) => d.xy[1])
            .attr('r', o.radius)
            .attr('fill', spec.color + alphaHex)
            .attr('data-tip', (d) => d.name + ': ' + (d.value == null ? 'no data' : d.value));
        }).catch((err) => geoMessage(host, err.message));
      },
    },
    legend: () => null,
  },

  {
    id: 'flow-map',
    title: 'Flow Map',
    category: 'Geo',
    blurb: 'Movement between places, drawn as arcs whose width is the volume. Origin, destination and size in one mark.',
    tags: ['flow map', 'connection map', 'migration', 'routes', 'geo', 'arcs', 'd3'],
    spec: {
      hub: { name: 'London', lon: -0.1, lat: 51.5 },
      routes: [
        { name: 'New York',  lon: -74.0, lat: 40.7, value: 92 },
        { name: 'Dubai',     lon: 55.3,  lat: 25.3, value: 76 },
        { name: 'Singapore', lon: 103.8, lat: 1.35, value: 54 },
        { name: 'Hong Kong', lon: 114.2, lat: 22.3, value: 48 },
        { name: 'Johannesburg', lon: 28.0, lat: -26.2, value: 31 },
        { name: 'São Paulo', lon: -46.6, lat: -23.6, value: 27 },
        { name: 'Sydney',    lon: 151.2, lat: -33.9, value: 22 },
        { name: 'Tokyo',     lon: 139.7, lat: 35.7, value: 40 },
        { name: 'Lagos',     lon: 3.4,   lat: 6.5,  value: 25 },
      ],
      color: C.green,
      hubColor: C.amber,
      opts: { countries: [], clipToCountry: true, neighbourColor: '#EDEBE4', rotate: [0, -15, 0], projection: 'naturalEarth', maxWidth: 6, alpha: 0.6, curve: 0.28, landColor: '#EFEDE5', showLabels: true, dotRadius: 3.5 },
    },
    controls: [
      countryControl,
      { group: 'Area', type: 'cities', key: 'routes', from: 'opts.countries', label: 'Destinations' },
      projectionControl,
      { group: 'Flows', type: 'colors', key: 'flowColors', label: 'Route / hub', names: () => ['Routes', 'Hub'] },
      { group: 'Flows', type: 'slider', key: 'opts.maxWidth', label: 'Widest route', min: 1, max: 16, step: 0.5, format: (v) => v + 'px' },
      { group: 'Flows', type: 'slider', key: 'opts.curve', label: 'Arc curvature', min: 0, max: 0.8, step: 0.02, format: (v) => v.toFixed(2) },
      { group: 'Flows', type: 'slider', key: 'opts.alpha', label: 'Route opacity', min: 0.1, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'toggle', key: 'opts.showLabels', label: 'Show destination names' },
    ],
    onInit(spec) { spec.flowColors = [spec.color, spec.hubColor]; },
    onChange(spec) { [spec.color, spec.hubColor] = spec.flowColors; },
    d3: {
      height: 440,
      libraries: ['topojson', 'worldAtlas'],
      helpers: [countryKey, loadTopology, geoMessage, makeProjection, findCountries, focusExtent, focusedOn, isVisible, attachGlobeDrag],
      mount(host, spec, W, H, env) {
        const o = spec.opts;
        const url = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';
        const svg = d3.select(host).append('svg').attr('width', W).attr('height', H);
        // A globe you cannot turn hides half its data behind itself. Not when
        // it is focused on a country, though: the projection is then locked to
        // that country's centroid, so a drag would move nothing.
        if (o.projection === 'globe' && !focusedOn(o).length) attachGlobeDrag(svg.node(), spec, env && env.redraw);

        loadTopology(url).then((topo) => {
          const geo = topojson.feature(topo, topo.objects.countries);
          const focus = findCountries(geo.features, o.countries || o.country);
          const inFocus = (d) => focus.indexOf(d) >= 0;
          const extent = focusExtent(focus);
          const projection = makeProjection(o.projection, geo, W, H, o.rotate, extent);
          const path = d3.geoPath(projection);

          svg.append('g').selectAll('path').data(geo.features).join('path')
            .attr('d', path)
            .attr('fill', (d) => (focus.length && !inFocus(d) ? o.neighbourColor : o.landColor))
            .attr('stroke', '#ffffff')
            .attr('stroke-width', (d) => (inFocus(d) ? 1.1 : 0.4));

          const hub = projection([spec.hub.lon, spec.hub.lat]);
          if (!hub) { geoMessage(host, 'Hub falls outside this projection.'); return; }
          const maxV = Math.max(...spec.routes.map((r) => r.value), 1);
          const alphaHex = Math.round(o.alpha * 255).toString(16).padStart(2, '0');

          const hubVisible = isVisible(projection, [spec.hub.lon, spec.hub.lat], o.projection);
          const targets = spec.routes
            .map((r) => ({ ...r, xy: projection([r.lon, r.lat]) }))
            .filter((r) => r.xy && isVisible(projection, [r.lon, r.lat], o.projection))
            .sort((a, b) => b.value - a.value);

          // A quadratic arc bowed perpendicular to the great-circle chord.
          svg.append('g').selectAll('path').data(targets).join('path')
            .attr('d', (d) => {
              const [x1, y1] = hub;
              const [x2, y2] = d.xy;
              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2;
              const dx = x2 - x1;
              const dy = y2 - y1;
              const cx = mx - dy * o.curve;
              const cy = my + dx * o.curve;
              return `M${x1},${y1}Q${cx},${cy} ${x2},${y2}`;
            })
            .attr('fill', 'none')
            .attr('stroke', spec.color + alphaHex)
            .attr('stroke-width', (d) => Math.max(0.6, (d.value / maxV) * o.maxWidth))
            .attr('stroke-linecap', 'round')
            .attr('data-tip', (d) => `${spec.hub.name} → ${d.name}: ${d.value}`);

          const g = svg.append('g').selectAll('g').data(targets).join('g')
            .attr('transform', (d) => `translate(${d.xy[0]},${d.xy[1]})`);
          g.append('circle').attr('r', o.dotRadius).attr('fill', spec.color);
          if (o.showLabels) {
            g.append('text')
              .attr('x', o.dotRadius + 4).attr('dy', '0.35em')
              .attr('font-size', 10)
              .attr('font-family', '"DM Sans", system-ui, sans-serif')
              .attr('fill', 'currentColor')
              .text((d) => d.name);
          }

          if (hubVisible) {
            svg.append('circle')
              .attr('cx', hub[0]).attr('cy', hub[1]).attr('r', o.dotRadius + 2.5)
              .attr('fill', spec.hubColor)
              .attr('stroke', '#ffffff').attr('stroke-width', 1.5);
          }
        }).catch((err) => geoMessage(host, err.message));
      },
    },
    legend: (spec) => [
      { label: spec.hub.name + ' (hub)', color: spec.hubColor, toggleable: false },
      { label: 'Routes', color: spec.color, toggleable: false },
    ],
  },

  {
    id: 'tile-map',
    title: 'Tile Grid Map',
    category: 'Geo',
    blurb: 'Every region an equal square in roughly the right place. Gives Luxembourg the same room as France — deliberately.',
    tags: ['tile map', 'grid map', 'cartogram', 'equal area', 'geo', 'squares'],
    spec: {
      // row/col positions are a hand-built approximation of Europe's layout.
      cells: [
        { code: 'ISL', name: 'Iceland',     row: 0, col: 0, value: 34 },
        { code: 'NOR', name: 'Norway',      row: 0, col: 4, value: 71 },
        { code: 'SWE', name: 'Sweden',      row: 0, col: 5, value: 78 },
        { code: 'FIN', name: 'Finland',     row: 0, col: 6, value: 66 },
        { code: 'IRL', name: 'Ireland',     row: 1, col: 1, value: 58 },
        { code: 'GBR', name: 'UK',          row: 1, col: 2, value: 74 },
        { code: 'DNK', name: 'Denmark',     row: 1, col: 4, value: 81 },
        { code: 'EST', name: 'Estonia',     row: 1, col: 6, value: 62 },
        { code: 'NLD', name: 'Netherlands', row: 2, col: 3, value: 85 },
        { code: 'DEU', name: 'Germany',     row: 2, col: 4, value: 69 },
        { code: 'POL', name: 'Poland',      row: 2, col: 5, value: 47 },
        { code: 'LVA', name: 'Latvia',      row: 2, col: 6, value: 55 },
        { code: 'BEL', name: 'Belgium',     row: 3, col: 3, value: 72 },
        { code: 'CZE', name: 'Czechia',     row: 3, col: 5, value: 52 },
        { code: 'LTU', name: 'Lithuania',   row: 3, col: 6, value: 49 },
        { code: 'FRA', name: 'France',      row: 4, col: 2, value: 64 },
        { code: 'CHE', name: 'Switzerland', row: 4, col: 3, value: 88 },
        { code: 'AUT', name: 'Austria',     row: 4, col: 4, value: 70 },
        { code: 'SVK', name: 'Slovakia',    row: 4, col: 5, value: 44 },
        { code: 'UKR', name: 'Ukraine',     row: 4, col: 6, value: 29 },
        { code: 'ESP', name: 'Spain',       row: 5, col: 1, value: 51 },
        { code: 'ITA', name: 'Italy',       row: 5, col: 3, value: 56 },
        { code: 'SVN', name: 'Slovenia',    row: 5, col: 4, value: 61 },
        { code: 'HUN', name: 'Hungary',     row: 5, col: 5, value: 41 },
        { code: 'ROU', name: 'Romania',     row: 5, col: 6, value: 33 },
        { code: 'PRT', name: 'Portugal',    row: 6, col: 1, value: 48 },
        { code: 'HRV', name: 'Croatia',     row: 6, col: 4, value: 46 },
        { code: 'SRB', name: 'Serbia',      row: 6, col: 5, value: 31 },
        { code: 'BGR', name: 'Bulgaria',    row: 6, col: 6, value: 27 },
        { code: 'GRC', name: 'Greece',      row: 7, col: 5, value: 38 },
      ],
      lowColor: '#EAF3F0',
      highColor: C.blue,
      opts: { gap: 5, radius: 5, steps: 5, showCodes: true, showValues: false, fontSize: 11, suffix: '%' },
    },
    controls: [
      { group: 'Colour', type: 'colors', key: 'tileColors', label: 'Low / high', names: () => ['Low', 'High'] },
      { group: 'Colour', type: 'slider', key: 'opts.steps', label: 'Colour steps', min: 3, max: 9, step: 1 },
      { group: 'Style',  type: 'slider', key: 'opts.gap', label: 'Tile gap', min: 0, max: 16, step: 1, format: (v) => v + 'px' },
      { group: 'Style',  type: 'slider', key: 'opts.radius', label: 'Corner radius', min: 0, max: 16, step: 1, format: (v) => v + 'px' },
      { group: 'Labels', type: 'toggle', key: 'opts.showCodes', label: 'Show country codes' },
      { group: 'Labels', type: 'toggle', key: 'opts.showValues', label: 'Show values' },
      { group: 'Labels', type: 'slider', key: 'opts.fontSize', label: 'Label size', min: 7, max: 16, step: 1, format: (v) => v + 'px' },
    ],
    onInit(spec) { spec.tileColors = [spec.lowColor, spec.highColor]; },
    onChange(spec) { [spec.lowColor, spec.highColor] = spec.tileColors; },
    canvas: {
      height: 440,
      draw(ctx, spec, W, H, env) {
        const tip = (env && env.tip) || function () {};
        const o = spec.opts;
        const cells = spec.cells;
        if (!cells.length) return;

        const cols = Math.max(...cells.map((c) => c.col)) + 1;
        const rows = Math.max(...cells.map((c) => c.row)) + 1;
        const size = Math.min((W - 24) / cols, (H - 24) / rows);
        const offX = (W - size * cols) / 2;
        const offY = (H - size * rows) / 2;

        const values = cells.map((c) => c.value);
        const lo = Math.min(...values);
        const hi = Math.max(...values);

        // Quantise into steps, then interpolate between the two end colours.
        const hex = (c) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
        const a = hex(spec.lowColor);
        const b = hex(spec.highColor);
        const colourAt = (v) => {
          const t = hi === lo ? 0.5 : (v - lo) / (hi - lo);
          const stepped = Math.round(t * (o.steps - 1)) / Math.max(1, o.steps - 1);
          const ch = a.map((x, k) => Math.round(x + (b[k] - x) * stepped));
          return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
        };
        // Pick readable ink for each tile from its own luminance.
        const inkFor = (v) => {
          const t = hi === lo ? 0.5 : (v - lo) / (hi - lo);
          const stepped = Math.round(t * (o.steps - 1)) / Math.max(1, o.steps - 1);
          const ch = a.map((x, k) => x + (b[k] - x) * stepped);
          const lum = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
          return lum > 150 ? 'rgba(23,22,20,.85)' : '#ffffff';
        };

        // Labels must scale with the tile or they collide at preview size.
        const fs = Math.max(6, Math.min(o.fontSize, size * 0.34));
        cells.forEach((c) => {
          const x = offX + c.col * size;
          const y = offY + c.row * size;
          tip(x, y, size, size, (c.name || c.code) + ': ' + c.value + o.suffix);
          ctx.beginPath();
          ctx.roundRect(x + o.gap / 2, y + o.gap / 2, size - o.gap, size - o.gap, o.radius);
          ctx.fillStyle = colourAt(c.value);
          ctx.fill();

          ctx.fillStyle = inkFor(c.value);
          ctx.textAlign = 'center';
          if (o.showCodes) {
            ctx.font = '600 ' + fs + 'px "DM Sans", system-ui, sans-serif';
            ctx.fillText(c.code, x + size / 2, y + size / 2 + (o.showValues ? -2 : fs * 0.36));
          }
          if (o.showValues) {
            ctx.font = Math.max(5, fs - 1) + 'px "DM Sans", system-ui, sans-serif';
            ctx.fillText(c.value + o.suffix, x + size / 2, y + size / 2 + (o.showCodes ? fs + 2 : fs * 0.36));
          }
        });
      },
    },
    legend: (spec) => [
      { label: 'Low', color: spec.lowColor, toggleable: false },
      { label: 'High', color: spec.highColor, toggleable: false },
    ],
  },

  {
    id: 'cartogram',
    title: 'Cartogram (Non-contiguous)',
    category: 'Geo',
    blurb: 'Each country shrunk about its own centre in proportion to its value. Keeps the shapes; abandons the adjacency.',
    tags: ['cartogram', 'map', 'geo', 'distortion', 'value by area', 'non-contiguous', 'd3'],
    spec: {
      regionValues: { ...REGION_VALUES },
      color: C.green,
      opts: { countries: [], clipToCountry: true, neighbourColor: '#EDEBE4', rotate: [0, -15, 0], projection: 'naturalEarth', minScale: 0.15, ghost: true, ghostColor: '#E6E3DA', alpha: 0.85, strokeWidth: 0.5 },
    },
    controls: [
      countryControl,
      projectionControl,
      { group: 'Scale', type: 'slider', key: 'opts.minScale', label: 'Smallest scale', min: 0.02, max: 0.6, step: 0.02, format: (v) => Math.round(v * 100) + '%' },
      { group: 'Style', type: 'colors', key: 'cartoColor', label: 'Fill colour' },
      { group: 'Style', type: 'toggle', key: 'opts.ghost', label: 'Show true outlines behind' },
      { group: 'Style', type: 'slider', key: 'opts.alpha', label: 'Fill opacity', min: 0.3, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
    ],
    onInit(spec) { spec.cartoColor = [spec.color]; },
    onChange(spec) { spec.color = spec.cartoColor[0]; },
    d3: {
      height: 440,
      libraries: ['topojson', 'worldAtlas'],
      helpers: [countryKey, loadTopology, valueFor, geoMessage, makeProjection, findCountries, focusExtent, focusedOn, attachGlobeDrag],
      mount(host, spec, W, H, env) {
        const o = spec.opts;
        const url = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';
        const svg = d3.select(host).append('svg').attr('width', W).attr('height', H);
        // A globe you cannot turn hides half its data behind itself. Not when
        // it is focused on a country, though: the projection is then locked to
        // that country's centroid, so a drag would move nothing.
        if (o.projection === 'globe' && !focusedOn(o).length) attachGlobeDrag(svg.node(), spec, env && env.redraw);

        loadTopology(url).then((topo) => {
          const geo = topojson.feature(topo, topo.objects.countries);
          const focus = findCountries(geo.features, o.countries || o.country);
          const inFocus = (d) => focus.indexOf(d) >= 0;
          const extent = focusExtent(focus);
          const projection = makeProjection(o.projection, geo, W, H, o.rotate, extent);
          const path = d3.geoPath(projection);

          if (o.ghost) {
            svg.append('g').selectAll('path').data(geo.features).join('path')
              .attr('d', path)
              .attr('fill', 'none')
              .attr('stroke', o.ghostColor)
              .attr('stroke-width', 0.8);
          }

          // Scale each projected shape about its own centroid — the defining
          // move of a non-contiguous cartogram.
          const alphaHex = Math.round(o.alpha * 255).toString(16).padStart(2, '0');
          svg.append('g').selectAll('path').data(geo.features).join('path')
            .attr('d', path)
            .attr('transform', (d) => {
              const c = path.centroid(d);
              if (!c || Number.isNaN(c[0])) return null;
              const raw = valueFor(d.properties.name || String(d.id), spec.regionValues);
              const v = Math.max(0, (raw == null ? 0 : raw)) / 100;
              const k = o.minScale + Math.sqrt(v) * (1 - o.minScale);
              return `translate(${c[0]},${c[1]}) scale(${k.toFixed(3)}) translate(${-c[0]},${-c[1]})`;
            })
            .attr('fill', spec.color + alphaHex)
            .attr('stroke', '#ffffff')
            .attr('stroke-width', o.strokeWidth)
            .attr('data-tip', (d) => {
              const v = valueFor(d.properties.name || String(d.id), spec.regionValues);
              return d.properties.name + ': ' + (v == null ? 'no data' : v.toFixed(1));
            });
        }).catch((err) => geoMessage(host, err.message));
      },
    },
    legend: () => null,
  },
];
