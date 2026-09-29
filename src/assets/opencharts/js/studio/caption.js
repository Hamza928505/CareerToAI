/**
 * caption.js — a title, a subtitle, a source line and a byline on every chart.
 *
 * Datawrapper's signature is that a chart leaves the tool able to explain
 * itself: a headline saying what the picture claims, a line under it saying
 * how to read it, and a source at the bottom saying where the numbers came
 * from. Every export here was a bare plate — the reader had to write all of
 * that around it in whatever page it landed in, and mostly did not.
 *
 * Done the way annotations were done: **DOM around the plate, not ink in the
 * canvas.** One markup function serves the studio's preview and the export,
 * so the two cannot hold different ideas of what the caption says; no renderer
 * was touched, so all 115 charts gained it at once; and the words are real
 * text, so a screen reader gets them — `chartSummary` leads with the title.
 *
 * Emitted only when a field is filled. An untitled export is byte-for-byte
 * what it was, which is the rule `ANNOTATION_CSS` and `FACET_CSS` follow.
 *
 * The one hostile input here is the source link. It goes into an `href` in
 * somebody else's page, so only `http:` and `https:` survive — `javascript:`
 * becomes plain text beside the name, never an attribute.
 */

/** The five fields, in the order the control shows them. */
export const CAPTION_FIELDS = [
  { key: 'title', label: 'Title', placeholder: 'What the chart shows — the claim, not the topic' },
  { key: 'subtitle', label: 'Subtitle', placeholder: 'How to read it, or the unit: "Revenue in $K, 2024"' },
  { key: 'source', label: 'Source', placeholder: 'Where the numbers came from' },
  { key: 'sourceUrl', label: 'Source link', placeholder: 'https://…', type: 'url' },
  { key: 'byline', label: 'Byline', placeholder: 'Chart: your name' },
];

/**
 * The control every chart carries, attached by the registry like the
 * annotation control. It sits under the plate with the other things laid
 * over a finished chart — a title is about the chart, not a knob that shapes
 * it — and first among them, because it is the first thing a publisher writes.
 */
export const CAPTION_CONTROL = {
  group: 'Title & source',
  type: 'caption',
  key: 'caption',
  label: 'Title, subtitle, source',
};

const clean = (v) => String(v == null ? '' : v).trim();

/** What was actually written, blanks dropped; null when nothing was. */
function written(spec) {
  const c = spec && spec.caption;
  if (!c || typeof c !== 'object') return null;
  const out = {};
  CAPTION_FIELDS.forEach(({ key }) => { const v = clean(c[key]); if (v) out[key] = v; });
  return Object.keys(out).length ? out : null;
}

/**
 * The caption as shown: what was written, plus one reading — a link with no
 * name to hang off is shown as the name. Derived here and never written back,
 * or clearing the name would leave the link's copy of it behind.
 */
export function captionOf(spec) {
  const out = written(spec);
  if (!out) return null;
  if (out.sourceUrl && !out.source) return { ...out, source: out.sourceUrl };
  return out;
}

export const hasCaption = (spec) => !!captionOf(spec);

/**
 * Drop the empties from the spec itself, and the whole object when nothing is
 * left — so a caption somebody typed and then deleted leaves no trace in the
 * Spec view, the share link or the export.
 */
export function tidyCaption(spec) {
  if (!spec || !spec.caption) return;
  const kept = written(spec);
  if (kept) spec.caption = kept; else delete spec.caption;
}

/** Only a web address goes into an `href`; anything else is text. */
export function safeUrl(url) {
  const s = clean(url);
  return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : null;
}

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The header above the plate: title and subtitle. Empty string when neither
 * is written, so a caller can concatenate without checking.
 */
export function captionHead(spec) {
  const c = captionOf(spec);
  if (!c || (!c.title && !c.subtitle)) return '';
  return [
    `<header class="oc-caption">`,
    c.title ? `  <h2 class="oc-caption-title">${esc(c.title)}</h2>` : null,
    c.subtitle ? `  <p class="oc-caption-sub">${esc(c.subtitle)}</p>` : null,
    `</header>`,
  ].filter(Boolean).join('\n');
}

/**
 * The line under the plate: source and byline. A `<figcaption>`, because that
 * is what it is; the browser and a screen reader both know the element.
 */
export function captionFoot(spec) {
  const c = captionOf(spec);
  if (!c || (!c.source && !c.byline)) return '';
  const href = safeUrl(c.sourceUrl);
  const source = c.source
    ? (href
      ? `<a class="oc-caption-source" href="${esc(href)}" rel="noopener">Source: ${esc(c.source)}</a>`
      : `<span class="oc-caption-source">Source: ${esc(c.source)}${c.sourceUrl && !href ? ` (${esc(c.sourceUrl)})` : ''}</span>`)
    : null;
  const byline = c.byline ? `<span class="oc-caption-byline">${esc(c.byline)}</span>` : null;
  return [
    `<figcaption class="oc-caption-foot">`,
    source ? `  ${source}` : null,
    byline ? `  ${byline}` : null,
    `</figcaption>`,
  ].filter(Boolean).join('\n');
}

/** What the caption says, as a sentence for the accessible description. */
export function describeCaption(spec) {
  const c = captionOf(spec);
  if (!c) return { lead: '', tail: '' };
  const lead = [c.title, c.subtitle].filter(Boolean).map((s) => s.replace(/\.?$/, '.')).join(' ');
  const tail = [c.source ? `Source: ${c.source}.` : '', c.byline ? c.byline.replace(/\.?$/, '.') : '']
    .filter(Boolean).join(' ');
  return { lead, tail };
}

/**
 * The styles the export carries when a caption is present. Neutral literals
 * rather than the studio's tokens, for the same reason `BASE_CSS` uses them:
 * this lands in somebody else's page and cannot read our theme.
 */
export const CAPTION_CSS = `.oc-caption {
  margin: 0 0 14px;
}

.oc-caption-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.01em;
  color: #0f172a;
  text-wrap: balance;
}

.oc-caption-sub {
  margin: 4px 0 0;
  font-size: 13.5px;
  line-height: 1.4;
  color: #475569;
}

.oc-caption-foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 16px;
  margin: 12px 0 0;
  font-size: 11.5px;
  line-height: 1.4;
  color: #64748b;
}

.oc-caption-foot a {
  color: inherit;
  text-decoration: underline;
  text-decoration-color: #cbd5e1;
  text-underline-offset: 2px;
}

.oc-caption-foot a:hover {
  color: #0f172a;
}`;

/* ── laying the caption into a picture ───────────────────────────────────── */

/**
 * Every rendered line of a caption, with where it sits and how it is set.
 *
 * The PNG and SVG exports have to carry the caption or they lie by omission —
 * a picture of the plate alone is a chart with its source torn off. The text
 * is measured with the element's own computed font against its own box, so
 * the lines break where the browser broke them, or near enough for a picture.
 *
 * @param {Element} root  the element the caption nodes live under
 * @returns {Array<{text:string, x:number, y:number, font:string, color:string, size:number}>}
 *   in page coordinates, `y` at the top of the line box
 */
export function captionLines(root) {
  if (!root) return [];
  const nodes = root.querySelectorAll(
    '.oc-caption-title, .oc-caption-sub, .oc-caption-source, .oc-caption-byline');
  if (!nodes.length) return [];
  const measure = document.createElement('canvas').getContext('2d');
  const out = [];
  nodes.forEach((el) => {
    const text = clean(el.textContent);
    if (!text) return;
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize) || 13;
    const font = `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`;
    const lineHeight = parseFloat(cs.lineHeight) || size * 1.3;
    const rect = el.getBoundingClientRect();
    measure.font = font;
    const width = Math.max(40, rect.width);
    const lines = [];
    let line = '';
    text.split(/\s+/).forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (line && measure.measureText(next).width > width) { lines.push(line); line = word; }
      else line = next;
    });
    if (line) lines.push(line);
    // A right-aligned line — the byline — starts where its box says and runs
    // to the box's right edge; its own width is what a picture has to fit.
    lines.forEach((t, i) => {
      const w = measure.measureText(t).width;
      const x = cs.textAlign === 'right' || (el.classList.contains('oc-caption-byline') && rect.right > rect.left + w + 1)
        ? rect.right - w : rect.left;
      out.push({ text: t, x, y: rect.top + i * lineHeight, width: w, font, color: cs.color, size, lineHeight });
    });
  });
  return out;
}
