/**
 * flags.js — the flag icon set behind the country and city pickers.
 *
 * `data/flags.json` is 204 flags as 80px-wide base64 PNG, committed rather
 * than hotlinked. `tools/build-flags.mjs` records why in full; the short
 * version is that emoji flags render as bare letters on Windows, a CDN URL
 * becomes a broken image the moment an exported chart is opened offline, and
 * the same set as SVG is several megabytes because a coat of arms is a coat
 * of arms.
 *
 * Loaded the way `geodata.js` loads its cities: on first use, once, and a
 * failure leaves nothing cached so a retry can still succeed. Nothing on the
 * page waits for it — `flagIcon()` hands back an element immediately and fills
 * in the image when the set arrives, so a picker never blocks on a flag.
 *
 * Because every source is a data URI, an icon placed in a chart is already
 * self-contained and survives serialisation into a standalone export.
 */

const ROOT = new URL('../../', import.meta.url);

/** iso2 → base64 PNG. Empty until `loadFlags()` resolves. */
let flags = null;
let flagsPromise = null;

/** Elements handed out before the set arrived, to be filled in on load. */
const pending = new Set();

/** ISO2, uppercased, or '' for anything that is not a country code. */
function code(iso2) {
  const c = String(iso2 == null ? '' : iso2).trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : '';
}

/**
 * The whole set, fetched once.
 * @returns {Promise<Record<string,string>>} iso2 → base64 PNG
 */
export function loadFlags() {
  if (flags) return Promise.resolve(flags);
  if (!flagsPromise) {
    flagsPromise = fetch(new URL('data/flags.json', ROOT))
      .then((r) => {
        if (!r.ok) throw new Error(`flags.json: ${r.status}`);
        return r.json();
      })
      .then((data) => {
        flags = data || {};
        // Anything handed out before the set landed is still on the page.
        pending.forEach((node) => paint(node));
        pending.clear();
        return flags;
      })
      .catch((err) => {
        // Do not poison the cache: a retry after the dev server comes back
        // should be able to succeed.
        flagsPromise = null;
        pending.clear();
        throw err;
      });
  }
  return flagsPromise;
}

/**
 * The flag for a country, as a data URI, or null.
 *
 * Synchronous and therefore empty until `loadFlags()` has resolved — callers
 * that cannot await should use `flagIcon()`, which fills itself in.
 */
export function flagSrc(iso2) {
  const c = code(iso2);
  if (!c || !flags) return null;
  const b64 = flags[c];
  return b64 ? `data:image/png;base64,${b64}` : null;
}

/** Whether the set has loaded. Lets a caller skip a redundant repaint. */
export function flagsReady() {
  return flags != null;
}

/** Put the right image (or the letter fallback) on an already-built icon. */
function paint(node) {
  const c = node.dataset.iso2 || '';
  const src = flagSrc(c);
  if (src) {
    node.style.backgroundImage = `url("${src}")`;
    node.textContent = '';
    node.classList.remove('flag-blank');
  } else if (flags) {
    // Only once the set is known to be missing this one. A country with no
    // flag reads better as its own two letters than as an empty grey box.
    node.textContent = c;
    node.classList.add('flag-blank');
  }
}

/**
 * A flag element for a country.
 *
 * Returned ready to append even before the set has loaded: the element is
 * registered and painted when `loadFlags()` resolves. The image rides as a
 * CSS background rather than an `<img src>` so a missing flag cannot produce
 * a broken-image glyph, and so the fallback letters can share the same box.
 *
 * @param {string} iso2
 * @param {string} [label] accessible name — the country, if the row's own
 *   text does not already say it
 */
export function flagIcon(iso2, label) {
  const c = code(iso2);
  const node = document.createElement('span');
  node.className = 'flag';
  node.dataset.iso2 = c;
  if (label) {
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', `${label} flag`);
  } else {
    node.setAttribute('aria-hidden', 'true');
  }

  if (!c) { node.classList.add('flag-blank'); return node; }

  if (flags) {
    paint(node);
  } else {
    pending.add(node);
    // Kick the load off, but never let its failure reach the caller — a
    // picker that throws because a decoration is missing is worse than a
    // picker with no decorations.
    loadFlags().catch(() => {});
  }
  return node;
}
