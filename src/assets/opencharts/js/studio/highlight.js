/**
 * highlight.js — a very small syntax highlighter for the code panel.
 *
 * Deliberately not a parser. It walks the source once with a master regex per
 * language and wraps each matched run in a token span, escaping every chunk on
 * the way out so raw source can never inject markup. Anything it does not
 * recognise is emitted as plain escaped text, which is the safe default.
 */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

const JS_KEYWORDS = new Set([
  'const','let','var','function','return','if','else','for','while','of','in',
  'new','class','extends','import','from','export','default','await','async',
  'true','false','null','undefined','this','typeof','instanceof','try','catch',
  'finally','throw','switch','case','break','continue','do','delete','void','yield','static','get','set',
]);

/* Order matters: comments and strings must win before anything else. */
const JS_TOKEN = new RegExp([
  /(?<com>\/\/[^\n]*|\/\*[\s\S]*?\*\/)/,
  /(?<str>'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)/,
  /(?<num>\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b|\b0x[0-9a-f]+\b)/,
  /(?<word>[A-Za-z_$][A-Za-z0-9_$]*)/,
  /(?<punc>[{}()[\];,.:?=+\-*/%<>!&|^~]+)/,
].map((r) => r.source).join('|'), 'gi');

const CSS_TOKEN = new RegExp([
  /(?<com>\/\*[\s\S]*?\*\/)/,
  /(?<str>'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*")/,
  /(?<at>@[\w-]+)/,
  /(?<prop>[-a-z]+(?=\s*:))/,
  /(?<num>#[0-9a-f]{3,8}\b|\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr|ch)?\b)/,
  /(?<punc>[{};:,()])/,
].map((r) => r.source).join('|'), 'gi');

const HTML_TOKEN = new RegExp([
  /(?<com><!--[\s\S]*?-->|<!DOCTYPE[^>]*>)/,
  /(?<tag><\/?[a-z][\w-]*)/,
  /(?<str>"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/,
  /(?<attr>[a-z-]+(?==))/,
  /(?<punc>\/?>)/,
].map((r) => r.source).join('|'), 'gi');

/**
 * Walk `src` with `re`, wrapping named groups in <span class="t-…"> and
 * escaping everything in between.
 */
function run(src, re, classify) {
  let out = '';
  let last = 0;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    // Zero-length match would loop forever.
    if (m.index === re.lastIndex) { re.lastIndex++; continue; }
    if (m.index > last) out += esc(src.slice(last, m.index));
    const groups = m.groups || {};
    const name = Object.keys(groups).find((k) => groups[k] !== undefined);
    const text = m[0];
    const cls = name ? classify(name, text) : null;
    out += cls ? `<span class="${cls}">${esc(text)}</span>` : esc(text);
    last = m.index + text.length;
  }
  out += esc(src.slice(last));
  return out;
}

function highlightJS(src) {
  return run(src, JS_TOKEN, (name, text) => {
    if (name === 'com') return 't-com';
    if (name === 'str') return 't-str';
    if (name === 'num') return 't-num';
    if (name === 'punc') return 't-punc';
    if (name === 'word') return JS_KEYWORDS.has(text) ? 't-key' : null;
    return null;
  });
}

function highlightCSS(src) {
  return run(src, CSS_TOKEN, (name) => {
    if (name === 'com') return 't-com';
    if (name === 'str') return 't-str';
    if (name === 'at') return 't-key';
    if (name === 'prop') return 't-attr';
    if (name === 'num') return 't-num';
    if (name === 'punc') return 't-punc';
    return null;
  });
}

function highlightHTML(src) {
  return run(src, HTML_TOKEN, (name) => {
    if (name === 'com') return 't-com';
    if (name === 'tag') return 't-tag';
    if (name === 'str') return 't-str';
    if (name === 'attr') return 't-attr';
    if (name === 'punc') return 't-punc';
    return null;
  });
}

/**
 * @param {string} src
 * @param {'js'|'css'|'html'} lang
 * @returns {string} HTML markup, already escaped — safe for innerHTML
 */
export function highlight(src, lang) {
  if (lang === 'js') return highlightJS(src);
  if (lang === 'css') return highlightCSS(src);
  if (lang === 'html') return highlightHTML(src);
  return esc(src);
}

export { esc };
