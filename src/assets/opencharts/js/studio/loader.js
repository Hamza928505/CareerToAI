/**
 * loader.js — fetch a third-party library the first time something needs it.
 *
 * Every library used to be a `<script>` tag in the head of both pages, which
 * was fine while there were four of them and stops being fine immediately: a
 * reader opening a bar chart paid for the map projections, the flow controller
 * and the analytics engine before the first pixel. The heavy end of what this
 * project is growing into — WASM query engines, WebGL renderers — cannot be
 * paid for by everybody on the chance one person opens one chart.
 *
 * Three rules:
 *
 * - **`cdn.js` stays the single source of truth.** Nothing here holds a URL or
 *   a version; a key is looked up there, so the Sources panel, the export's
 *   script tags, the credits and this loader cannot disagree about what a
 *   chart depends on.
 * - **The vendored copy wins.** An entry with a `local` path is loaded from
 *   `lib/`, so the offline promise survives lazy loading for everything the
 *   repository actually ships.
 * - **One request per library, ever.** The promise is memoised by key, so
 *   ninety gallery tiles wanting D3 at once produce one script tag. A failed
 *   load is *not* memoised — a reader who lost their connection for a moment
 *   should get another go rather than a permanently broken page.
 *
 * This only concerns the *studio and gallery*. Exported code carries its own
 * `<script>` tags from `scriptsOnly()` and knows nothing about this file.
 */

import { LIBRARIES } from './cdn.js';

/** key → in-flight or settled promise. Cleared for a key whose load failed. */
const inFlight = new Map();

/** Resolve a base for `local` paths that works from any page in the site. */
const localUrl = (path) => new URL('../../' + path, import.meta.url).href;

/**
 * Is this library already usable?
 *
 * A library with a declared `global` can be recognised however it arrived —
 * a vendored tag in the page head, another bundle, a previous call — so a
 * page that still loads Chart.js eagerly is never asked to load it twice.
 * One with no global (a Chart.js plugin registers itself and exposes nothing)
 * can only be known by whether this module fetched it.
 */
export function isLoaded(key) {
  const lib = LIBRARIES[key];
  if (!lib) return false;
  if (lib.kind !== 'script') return true;           // data and assets are not scripts
  if (lib.global) return typeof window[lib.global] !== 'undefined';
  return inFlight.has(key);
}

/**
 * Load one library, and whatever it requires, once.
 *
 * @param {string} key a key in `LIBRARIES`
 * @returns {Promise<void>} resolves when the script has run
 */
export function loadLibrary(key) {
  const lib = LIBRARIES[key];
  if (!lib) return Promise.reject(new Error(`Unknown library "${key}"`));
  if (lib.kind !== 'script') return Promise.resolve();
  if (lib.global && typeof window[lib.global] !== 'undefined') return Promise.resolve();
  if (inFlight.has(key)) return inFlight.get(key);

  // A plugin is useless before the library it plugs into, and script tags
  // added together do not run in order.
  const first = lib.requires ? loadLibrary(lib.requires) : Promise.resolve();

  const p = first.then(() => new Promise((resolve, reject) => {
    const src = lib.local ? localUrl(lib.local) : lib.url;
    const tag = document.createElement('script');
    tag.src = src;
    tag.async = false;
    tag.dataset.ocLib = key;
    tag.addEventListener('load', () => resolve());
    tag.addEventListener('error', () => {
      tag.remove();
      reject(new Error(`${lib.name} could not be loaded from ${src}`));
    });
    document.head.appendChild(tag);
  })).catch((err) => {
    // Not memoised: a connection that dropped once should not brick the page.
    inFlight.delete(key);
    throw err;
  });

  inFlight.set(key, p);
  return p;
}

/**
 * Every library key a chart definition needs before it can be rendered.
 *
 * Read off the same renderer blocks `dependenciesFor` reads, rather than a
 * second list — a chart that declares a Chart.js plugin or a geo dataset has
 * said so once, and both the credit and the fetch follow from that.
 */
export function librariesFor(def) {
  if (!def) return [];
  if (def.chartjs) return ['chart', ...(def.chartjs.plugins || [])];
  if (def.echarts) return ['echarts', ...(def.echarts.plugins || [])];
  if (def.d3) return ['d3', ...(def.d3.libraries || [])];
  return [];
}

/** Load everything a chart needs. Resolves even if the chart needs nothing. */
export function ensureLibraries(def) {
  const keys = librariesFor(def).filter((k) => LIBRARIES[k] && LIBRARIES[k].kind === 'script');
  if (!keys.length) return Promise.resolve();
  return Promise.all(keys.map(loadLibrary)).then(() => undefined);
}

/** Whether everything a chart needs is already in the page. */
export function ready(def) {
  return librariesFor(def).every(isLoaded);
}

/**
 * Fetch the rest of the libraries once the page has stopped being busy.
 *
 * Lazy loading moves the cost of parsing a library off page load, and the
 * place it lands by default is the worst one available: the scroll frame that
 * first reveals a chart needing it. Measured, that took the gallery from 0ms
 * blocked while scrolling to 77ms — trading a cost nobody noticed at load for
 * a stutter under the reader's finger.
 *
 * Executing a script blocks the main thread whenever it happens, so the answer
 * is not to make it cheaper but to do it when nothing else wants the thread.
 * `requestIdleCallback` is exactly that promise. One library per callback, so
 * a long queue never holds the thread through a frame the reader needed.
 *
 * This is a *prefetch*, not a dependency: anything that actually needs a
 * library still asks for it and gets the same memoised promise.
 */
export function prefetchLibraries(keys) {
  const idle = window.requestIdleCallback
    || ((fn) => setTimeout(() => fn({ timeRemaining: () => 0 }), 200));
  const queue = (keys && keys.length ? keys : Object.keys(LIBRARIES))
    .filter((k) => LIBRARIES[k] && LIBRARIES[k].kind === 'script' && !isLoaded(k));

  const step = () => {
    const key = queue.shift();
    if (!key) return;
    loadLibrary(key).catch(() => { /* it will be asked for again if wanted */ })
      .then(() => idle(step));
  };
  idle(step);
}
