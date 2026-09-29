/**
 * theme.js — light / dark switching shared by the gallery and the studio.
 *
 * Three states, matching the CSS: an explicit choice stamps data-theme on
 * <html>; "system" removes the attribute and lets prefers-color-scheme decide.
 * The choice persists in localStorage, which can throw in private windows, so
 * every access is guarded.
 */

const KEY = 'opencharts.theme';
const LEGACY_KEY = 'chartadmin.theme';   // pre-rename; migrated once, then dropped
const listeners = new Set();

function read() {
  try {
    const current = localStorage.getItem(KEY);
    if (current) return current;
    // Carry a preference over from before the project was renamed, so an
    // existing visitor does not get flipped back to their OS theme.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      localStorage.setItem(KEY, legacy);
      localStorage.removeItem(LEGACY_KEY);
      return legacy;
    }
    return null;
  } catch { return null; }
}

function write(value) {
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch { /* storage unavailable — the session still works, it just won't persist */ }
}

/** True when the page is currently painting dark, whatever the reason. */
export function isDark() {
  const stored = read();
  if (stored === 'dark') return true;
  if (stored === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * The explicit choice on record, or null while the OS is deciding.
 *
 * `isDark()` answers what the page is painting, which is not the same thing:
 * a caller that borrows the theme for a moment — printing switches to light,
 * because a canvas has already painted its ink by then — has to put back the
 * *preference*, not the colour it happened to resolve to. Writing 'light' over
 * a reader who had chosen nothing would make their studio stop following the
 * OS, which is a setting they never touched.
 */
export function storedTheme() { return read(); }

/** Apply the stored preference. Call before first paint. */
export function applyTheme() {
  const stored = read();
  if (stored === 'dark' || stored === 'light') {
    document.documentElement.setAttribute('data-theme', stored);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export function setTheme(value) {
  write(value === 'dark' || value === 'light' ? value : null);
  applyTheme();
  listeners.forEach((fn) => fn(isDark()));
}

/** Subscribe to theme changes — charts re-render so their ink follows. */
export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Mount the sun/moon button into `host`. */
export function mountThemeToggle(host) {
  if (!host) return;
  const btn = document.createElement('button');
  btn.className = 'theme-toggle';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Toggle light and dark mode');

  const sync = () => {
    const dark = isDark();
    btn.innerHTML = dark
      ? '<span aria-hidden="true">☀</span> Light'
      : '<span aria-hidden="true">☾</span> Dark';
    btn.setAttribute('aria-pressed', String(dark));
  };

  btn.addEventListener('click', () => { setTheme(isDark() ? 'light' : 'dark'); sync(); });
  sync();
  host.appendChild(btn);

  // Follow the OS while the user has not made an explicit choice.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!read()) { sync(); listeners.forEach((fn) => fn(isDark())); }
  });
}

/**
 * Read a themed colour from CSS custom properties so canvas drawing code can
 * match the page instead of hard-coding ink.
 */
export function themeInk() {
  const cs = getComputedStyle(document.documentElement);
  const pick = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback;
  return {
    ink:   pick('--ink', '#0f172a'),
    soft:  pick('--ink-soft', '#475569'),
    faint: pick('--ink-faint', '#5c6b80'),
    rule:  isDark() ? 'rgba(255,255,255,.12)' : 'rgba(23,22,20,.12)',
    grid:  isDark() ? 'rgba(255,255,255,.08)' : 'rgba(23,22,20,.08)',
    surface: pick('--surface', '#ffffff'),
  };
}

applyTheme();
