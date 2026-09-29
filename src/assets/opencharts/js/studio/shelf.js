/**
 * shelf.js — somewhere to keep what you made.
 *
 * A share link was the only way a chart survived closing the tab: a spec
 * compressed into a URL that lived in the clipboard until something else was
 * copied over it. Every publishing tool has a shelf of saved work to come
 * back to; this is that shelf, without the account — `localStorage`, on this
 * browser, plus a JSON file to carry it to another one.
 *
 * It is storage and a list, not a format. The Spec view already proves every
 * chart round-trips through `{ chart, spec }`, so a saved chart is exactly
 * that object with a name, a thumbnail and two timestamps beside it, and it
 * opens through the same door a share link uses — merged over `newSpec`, so a
 * chart saved before its definition gained an option still opens.
 *
 * Three rules:
 *
 * - **A corrupt entry is skipped, never fatal.** Storage is written by this
 *   code and read by this code, but between the two a browser extension, a
 *   quota error mid-write or a hand edit in devtools can leave anything there.
 *   One bad row must not take the shelf down.
 * - **The cap evicts the oldest and says so.** Forty charts with thumbnails
 *   is a few megabytes; storage past its quota throws on write, and a throw
 *   on Save reads as the feature being broken. The oldest go first, the toast
 *   names how many, and the thumbnails go before any chart does.
 * - **Nothing here knows what a chart is.** The registry is not imported; a
 *   caller that wants to refuse an import naming a chart that does not exist
 *   passes `isChart`. That keeps the module usable from the gallery, the
 *   studio and the suite without dragging 115 definitions along.
 */

export const SHELF_KEY = 'opencharts.shelf';
export const SHELF_LIMIT = 40;
export const THUMB_WIDTH = 240;
const FILE_KIND = 'opencharts-shelf';
const FILE_VERSION = 1;

const now = () => Date.now();
// Time plus a counter: unique on this browser, which is the only place an id
// has to be, and not a random value — nothing in this library invents one.
let minted = 0;
const newId = () => `${now().toString(36)}-${(++minted).toString(36)}`;

/** One entry, or null when the row is not one. */
function sane(row) {
  if (!row || typeof row !== 'object') return null;
  if (typeof row.chart !== 'string' || !row.chart) return null;
  if (!row.spec || typeof row.spec !== 'object' || Array.isArray(row.spec)) return null;
  return {
    id: typeof row.id === 'string' && row.id ? row.id : newId(),
    name: typeof row.name === 'string' ? row.name : '',
    chart: row.chart,
    spec: row.spec,
    thumb: typeof row.thumb === 'string' && /^data:image\//.test(row.thumb) ? row.thumb : null,
    savedAt: Number.isFinite(row.savedAt) ? row.savedAt : now(),
    updatedAt: Number.isFinite(row.updatedAt) ? row.updatedAt : (Number.isFinite(row.savedAt) ? row.savedAt : now()),
  };
}

function readAll() {
  let raw = null;
  try { raw = localStorage.getItem(SHELF_KEY); } catch { return []; }
  if (!raw) return [];
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return []; }
  const rows = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.charts) ? parsed.charts : []);
  return rows.map(sane).filter(Boolean);
}

/**
 * Write the list, making room when storage refuses.
 *
 * Thumbnails go first — they are a convenience — then the oldest charts,
 * one at a time, until the write lands. Returns how many charts were lost to
 * make room, which the caller says out loud.
 */
function writeAll(list) {
  let rows = [...list];
  let evicted = 0;
  for (let attempt = 0; attempt < list.length + 2; attempt++) {
    try {
      localStorage.setItem(SHELF_KEY, JSON.stringify(rows));
      return { ok: true, evicted, rows };
    } catch (err) {
      if (attempt === 0 && rows.some((r) => r.thumb)) {
        rows = rows.map((r) => ({ ...r, thumb: null }));
        continue;
      }
      if (rows.length <= 1) return { ok: false, evicted, rows, error: err };
      // Oldest by last update: the chart least recently touched. Strictly
      // older wins, so of two saved in the same millisecond the earlier row
      // goes — `<=` here evicted the one just saved.
      const oldest = rows.reduce((a, b) => (b.updatedAt < a.updatedAt ? b : a));
      rows = rows.filter((r) => r !== oldest);
      evicted++;
    }
  }
  return { ok: false, evicted, rows };
}

/** Every saved chart, most recently updated first; ties keep the later row first. */
export function listSaved() {
  return readAll().map((r, i) => [r, i]).sort((a, b) => (b[0].updatedAt - a[0].updatedAt) || (b[1] - a[1])).map(([r]) => r);
}

export function getSaved(id) {
  return readAll().find((r) => r.id === id) || null;
}

/**
 * Save a chart, or update the one it was opened from.
 *
 * @param {{ id?: string, name?: string, chart: string, spec: object, thumb?: string|null }} entry
 * @returns {{ ok: boolean, entry?: object, evicted: number, message: string }}
 */
export function saveChart(entry) {
  const list = readAll();
  const existing = entry.id ? list.find((r) => r.id === entry.id) : null;
  const t = now();
  const row = sane({
    id: existing ? existing.id : (entry.id || newId()),
    name: entry.name || (existing && existing.name) || '',
    chart: entry.chart,
    spec: entry.spec,
    thumb: entry.thumb === undefined ? (existing ? existing.thumb : null) : entry.thumb,
    savedAt: existing ? existing.savedAt : t,
    updatedAt: t,
  });
  if (!row) return { ok: false, evicted: 0, message: 'Nothing to save.' };

  let next = existing ? list.map((r) => (r.id === row.id ? row : r)) : [...list, row];
  // Over the cap, the least recently touched go — never the one just saved.
  let evicted = 0;
  while (next.length > SHELF_LIMIT) {
    const oldest = next.filter((r) => r.id !== row.id)
      .reduce((a, b) => (b.updatedAt < a.updatedAt ? b : a));
    next = next.filter((r) => r !== oldest);
    evicted++;
  }
  const res = writeAll(next);
  if (!res.ok) return { ok: false, evicted: evicted + res.evicted, message: 'This browser refused to store the chart.' };
  const total = evicted + res.evicted;
  return {
    ok: true,
    entry: row,
    evicted: total,
    message: existing ? 'Saved' : 'Saved to My charts' + (total ? ` — the ${total === 1 ? 'oldest chart was' : `${total} oldest were`} dropped to make room` : ''),
  };
}

export function removeSaved(id) {
  const list = readAll();
  const next = list.filter((r) => r.id !== id);
  if (next.length === list.length) return false;
  writeAll(next);
  return true;
}

export function renameSaved(id, name) {
  const list = readAll();
  const row = list.find((r) => r.id === id);
  if (!row) return false;
  row.name = String(name == null ? '' : name).trim();
  row.updatedAt = now();
  writeAll(list);
  return true;
}

export function clearShelf() {
  try { localStorage.removeItem(SHELF_KEY); } catch { /* not fatal */ }
}

/** The whole shelf as a file: what `importShelf` reads back. */
export function exportShelf() {
  return JSON.stringify({
    kind: FILE_KIND,
    version: FILE_VERSION,
    exportedAt: new Date().toISOString(),
    charts: listSaved(),
  }, null, 2);
}

/**
 * Read a shelf file, or a single `{ chart, spec }` from the Spec view, into
 * the shelf. Entries already here (by id) are updated; unknown charts are
 * skipped and counted, because a chart that does not exist here cannot open.
 *
 * @param {string} text
 * @param {{ isChart?: (id: string) => boolean }} [opts]
 * @returns {{ ok: boolean, added: number, updated: number, skipped: number, message: string }}
 */
export function importShelf(text, opts = {}) {
  let parsed;
  try { parsed = JSON.parse(String(text)); } catch (err) {
    return { ok: false, added: 0, updated: 0, skipped: 0, message: `That is not a charts file: ${err.message}` };
  }
  let rows;
  if (parsed && Array.isArray(parsed.charts)) rows = parsed.charts;
  else if (Array.isArray(parsed)) rows = parsed;
  else if (parsed && typeof parsed.chart === 'string') rows = [parsed];
  else return { ok: false, added: 0, updated: 0, skipped: 0, message: 'That file holds no charts.' };

  const isChart = typeof opts.isChart === 'function' ? opts.isChart : () => true;
  const list = readAll();
  let added = 0;
  let updated = 0;
  let skipped = 0;
  rows.forEach((raw) => {
    const row = sane(raw);
    if (!row || !isChart(row.chart)) { skipped++; return; }
    const i = list.findIndex((r) => r.id === row.id);
    if (i >= 0) { list[i] = { ...row, savedAt: list[i].savedAt, updatedAt: now() }; updated++; }
    else { list.push({ ...row, updatedAt: row.updatedAt || now() }); added++; }
  });
  const res = writeAll(list);
  if (!res.ok) return { ok: false, added: 0, updated: 0, skipped, message: 'This browser refused to store the charts.' };
  const parts = [];
  if (added) parts.push(`${added} added`);
  if (updated) parts.push(`${updated} updated`);
  if (skipped) parts.push(`${skipped} skipped — not charts this library has`);
  if (res.evicted) parts.push(`${res.evicted} oldest dropped to make room`);
  return { ok: added + updated > 0, added, updated, skipped, message: parts.join(', ') || 'Nothing to import.' };
}

/**
 * A small PNG of a canvas, for the shelf card. Null for anything that is not
 * a canvas — an SVG chart shows its glyph instead, rather than paying for a
 * rasterising round-trip on every save.
 */
export function thumbnailOf(canvas) {
  try {
    if (!canvas || !canvas.width) return null;
    const scale = THUMB_WIDTH / canvas.width;
    const out = document.createElement('canvas');
    out.width = THUMB_WIDTH;
    out.height = Math.max(1, Math.round(canvas.height * scale));
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** "Just now", "3 h ago", or the date — for a card, not a ledger. */
export function whenSaved(ts) {
  const d = now() - ts;
  if (d < 60e3) return 'just now';
  if (d < 3600e3) return `${Math.round(d / 60e3)} min ago`;
  if (d < 86400e3) return `${Math.round(d / 3600e3)} h ago`;
  if (d < 7 * 86400e3) return `${Math.round(d / 86400e3)} d ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
