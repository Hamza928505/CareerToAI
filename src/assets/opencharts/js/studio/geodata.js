/**
 * geodata.js — the country and city lists behind the map pickers.
 *
 * Both files are generated once (see `.cache/build-cities.mjs`) and committed,
 * so the site keeps its no-build-step promise and has no runtime dependency on
 * a gazetteer API.
 *
 * Cities are split per country for a reason: the full list is 4.4MB, but the
 * country somebody actually picks is between 4KB and 363KB. Nothing is fetched
 * until a country is chosen, and each country is fetched at most once.
 *
 * There is a second country file, `data/country-meta.json`, and it is
 * deliberately not merged into the first. `countries.json` is the **atlas** —
 * Natural Earth's names, the polygons a map can draw, the gazetteer's city
 * counts — and decides what a map can focus on. `country-meta.json` is the
 * **presentation layer** — flag, local-language name, ISO3, region — and
 * decides how a country is shown once it has been picked. Neither list is a
 * superset of the other: the atlas carries ten territories the curated list
 * omits (Greenland, Taiwan, Kosovo, Israel) and the curated list carries
 * twenty-nine microstates too small to be a polygon at 110m (San Marino,
 * Monaco, Tuvalu). Keyed by ISO2 and merged here, both keep their coverage.
 *
 * The metadata is decoration, so its absence is never fatal: a failed fetch
 * leaves every country its atlas name and the pickers work unchanged.
 */

const ROOT = new URL('../../', import.meta.url);

let countriesPromise = null;
const cityCache = new Map();
const cityPromises = new Map();

/** iso2 → { name, iso3, region, local?, lang?, cities? }. Null until loaded. */
let meta = null;
let metaPromise = null;
/** iso2 → Map(englishCityName → localCityName), built on first ask. */
const localCityCache = new Map();

/**
 * Every country on the world map, whether or not it has a city list.
 * @returns {Promise<Array<{name:string, iso2:string, cities:number}>>}
 */
export function loadCountries() {
  if (!countriesPromise) {
    const atlas = fetch(new URL('data/countries.json', ROOT))
      .then((r) => {
        if (!r.ok) throw new Error(`countries.json: ${r.status}`);
        return r.json();
      });

    countriesPromise = Promise.all([atlas, loadCountryMeta().catch(() => ({}))])
      .then(([rows, extra]) => rows.map(([name, iso2, cities]) => {
        const m = (iso2 && extra[iso2]) || null;
        return {
          name,
          iso2,
          cities,
          // The atlas name wins. It is what the map labels itself with and
          // what `countryKey` resolves against; swapping in the curated
          // spelling here would leave the picker naming a country the map
          // does not answer to.
          iso3: m ? m.iso3 : '',
          region: m ? m.region : '',
          local: (m && m.local) || '',
        };
      }))
      .catch((err) => {
        // A failed fetch must not poison the cache — a retry should be able to
        // succeed after, say, the dev server is restarted.
        countriesPromise = null;
        throw err;
      });
  }
  return countriesPromise;
}

/**
 * The curated country metadata, fetched once.
 *
 * Callers that only want decoration should swallow the rejection: everything
 * this file returns works without it.
 *
 * @returns {Promise<Record<string,{name:string,iso3:string,region:string,local?:string,lang?:string,cities?:Array}>>}
 */
export function loadCountryMeta() {
  if (meta) return Promise.resolve(meta);
  if (!metaPromise) {
    metaPromise = fetch(new URL('data/country-meta.json', ROOT))
      .then((r) => {
        if (!r.ok) throw new Error(`country-meta.json: ${r.status}`);
        return r.json();
      })
      .then((data) => { meta = data || {}; return meta; })
      .catch((err) => { metaPromise = null; throw err; });
  }
  return metaPromise;
}

/** One country's metadata, or null. Empty until `loadCountryMeta()` resolves. */
export function countryMeta(iso2) {
  const c = String(iso2 || '').toUpperCase();
  return (meta && meta[c]) || null;
}

/**
 * The local-language spelling of a city, or ''.
 *
 * The curated list holds about five cities per country, so this answers for
 * the capital and the largest few and stays quiet about the other 156,000 —
 * which is the honest outcome. Inventing a transliteration for every
 * gazetteer entry would put spellings on the map that no source stands
 * behind, the same rule that keeps charts from generating their own data.
 */
export function localCityName(iso2, name) {
  const c = String(iso2 || '').toUpperCase();
  if (!c || !name || !meta) return '';
  let lookup = localCityCache.get(c);
  if (!lookup) {
    lookup = new Map();
    for (const row of (meta[c] && meta[c].cities) || []) {
      if (row.length > 1 && row[1]) lookup.set(cityKey(row[0]), row[1]);
    }
    localCityCache.set(c, lookup);
  }
  return lookup.get(cityKey(name)) || '';
}

/** Loose enough that `Mazar-i-Sharif` and `Mazar i Sharif` are one city. */
function cityKey(name) {
  return String(name == null ? '' : name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The cities of one country, alphabetically.
 * @param {string} iso2
 * @returns {Promise<Array<{name:string, lat:number, lon:number}>>}
 */
export function loadCities(iso2) {
  const code = String(iso2 || '').toUpperCase();
  if (!code) return Promise.resolve([]);
  if (cityCache.has(code)) return Promise.resolve(cityCache.get(code));
  if (cityPromises.has(code)) return cityPromises.get(code);

  const p = fetch(new URL(`data/cities/${code}.json`, ROOT))
    .then((r) => (r.ok ? r.json() : []))
    .then((rows) => {
      const list = rows.map(([name, lat, lon]) => ({ name, lat, lon }));
      cityCache.set(code, list);
      cityPromises.delete(code);
      return list;
    })
    .catch(() => {
      cityPromises.delete(code);
      return [];
    });

  cityPromises.set(code, p);
  return p;
}

/** Cities already loaded for this country, or null. Lets callers avoid an await. */
export function citiesIfLoaded(iso2) {
  return cityCache.get(String(iso2 || '').toUpperCase()) || null;
}

/**
 * One canonical key for a country, whoever is spelling it.
 *
 * Three places needed to answer "are these the same country?" and each had its
 * own answer: the picker's search, the map's focus, and the choropleth's value
 * lookup — which had no aliases at all, so a table saying "Bosnia and
 * Herzegovina" left the country grey while the atlas called it "Bosnia and
 * Herz." and nothing said why.
 *
 * Accents are folded before anything else, so `Cote d'Ivoire` typed on a
 * keyboard without them matches `Cote d\u2019Ivoire` from the atlas.
 *
 * Serialised into exported maps, so it must reference nothing outside itself.
 */
export function countryKey(name) {
  const k = String(name == null ? '' : name)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z]/g, '');
  const SAME = {
    // Natural Earth abbreviates to fit a label on a map. Nobody writes these.
    bosniaandherz: 'bosniaandherzegovina',
    centralafricanrep: 'centralafricanrepublic',
    demrepcongo: 'democraticrepublicofthecongo',
    dominicanrep: 'dominicanrepublic',
    eqguinea: 'equatorialguinea',
    falklandis: 'falklandislands',
    frsantarcticlands: 'frenchsouthernandantarcticlands',
    ncyprus: 'northerncyprus',
    ssudan: 'southsudan',
    solomonis: 'solomonislands',
    wsahara: 'westernsahara',
    // What people type instead of the long form.
    usa: 'unitedstatesofamerica', us: 'unitedstatesofamerica',
    unitedstates: 'unitedstatesofamerica', america: 'unitedstatesofamerica',
    uk: 'unitedkingdom', britain: 'unitedkingdom', greatbritain: 'unitedkingdom',
    england: 'unitedkingdom', uae: 'unitedarabemirates', emirates: 'unitedarabemirates',
    drc: 'democraticrepublicofthecongo', drcongo: 'democraticrepublicofthecongo',
    congokinshasa: 'democraticrepublicofthecongo', congobrazzaville: 'congo',
    republicofthecongo: 'congo',
    ivorycoast: 'cotedivoire', holland: 'netherlands', burma: 'myanmar',
    swaziland: 'eswatini', czechrepublic: 'czechia', macedonia: 'northmacedonia',
    southkorea: 'southkorea', korea: 'southkorea', northkorea: 'northkorea',
    vatican: 'vaticancity', eastimor: 'timorleste',
  };
  return SAME[k] || k;
}

/**
 * Match a country the way a person would type it.
 *
 * Exact key first, then a prefix, then a substring — so `Bos` finds Bosnia
 * while `United States` is never beaten to the answer by `United Arab
 * Emirates` on a substring.
 */
export function findCountryEntry(list, query) {
  const target = countryKey(query);
  if (!target) return null;
  return list.find((c) => countryKey(c.name) === target)
    || list.find((c) => countryKey(c.name).startsWith(target))
    || list.find((c) => countryKey(c.name).includes(target))
    || null;
}

/**
 * Items for a country Combobox, countries with cities listed first-class.
 *
 * `icon` is the ISO2 code rather than an image: the widget asks `flags.js`
 * for the picture, so a picker that never opens never costs a flag, and this
 * module keeps no opinion about how an icon is drawn.
 *
 * `search` carries the local-language name alongside the atlas one, so
 * someone typing `Deutschland` or `مصر` finds the country the map calls
 * `Germany` and `Egypt`. The label still shows the atlas spelling — it is
 * what the map answers to.
 */
export function countryItems(list, { onlyWithCities = false } = {}) {
  return list
    .filter((c) => (onlyWithCities ? c.cities > 0 : true))
    .map((c) => ({
      value: c.name,
      label: c.name,
      note: c.cities ? `${c.cities.toLocaleString()} cities` : '',
      iso2: c.iso2,
      icon: c.iso2 || '',
      sub: c.local || '',
      search: c.local ? `${c.name} ${c.local}` : c.name,
    }));
}
