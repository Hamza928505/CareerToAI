/**
 * serialize.js — turn a live JS value back into readable source text.
 *
 * The studio uses one `build(spec)` function per chart to drive BOTH the live
 * preview and the exported code. That only works if we can print the very
 * object we just handed to the renderer — including its callbacks — as source
 * a person would be happy to paste. `JSON.stringify` drops functions and
 * formats arrays of numbers one-per-line, so we do it ourselves.
 */

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const INLINE_WIDTH = 74;

/** Escape a string for single-quoted JS source. */
function quote(str) {
  const body = String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return `'${body}'`;
}

/**
 * Strip the common leading indentation from a multi-line function body so a
 * method pulled out of a deeply nested object literal does not export with
 * eight leading spaces on every line.
 */
export function dedent(src) {
  const lines = String(src).split('\n');
  if (lines.length < 2) return src;
  const indents = lines
    .slice(1)
    .filter((l) => l.trim())
    .map((l) => l.match(/^[ \t]*/)[0].length);
  if (!indents.length) return src;
  const cut = Math.min(...indents);
  if (!cut) return src;
  return [lines[0], ...lines.slice(1).map((l) => l.slice(cut))].join('\n');
}

/**
 * Normalise a function's source into something that is valid on the right-hand
 * side of an assignment.
 *
 * Definitions declare renderers as object shorthand — `draw(ctx, spec) { … }`.
 * That stringifies as `draw(ctx, spec) { … }`, which parses as a call, not a
 * function, the moment it is emitted as `const draw = …`. Arrow functions,
 * `function` expressions and getters are already fine and pass through.
 */
export function toFunctionSource(fn) {
  const src = dedent(fn.toString()).trim();
  if (/^(async\s+)?function\b/.test(src)) return src;
  if (/^(async\s+)?\(/.test(src)) return src;           // arrow with parens
  if (/^(async\s+)?[A-Za-z_$][\w$]*\s*=>/.test(src)) return src;  // single-arg arrow
  if (/^class\b/.test(src)) return src;
  // Shorthand method: `name(args) {` or `async name(args) {` → make it a function.
  const shorthand = /^(async\s+)?(?:\*\s*)?[A-Za-z_$][\w$]*\s*\(/.test(src);
  if (shorthand) {
    const isAsync = src.startsWith('async ');
    const body = isAsync ? src.slice(6) : src;
    return (isAsync ? 'async function ' : 'function ') + body;
  }
  return src;
}

/** Print a function as source, re-indented to sit at `pad`. */
function printFunction(fn, pad) {
  const src = toFunctionSource(fn);
  const [first, ...rest] = src.split('\n');
  if (!rest.length) return first;
  return [first, ...rest.map((l) => (l.trim() ? pad + l : l))].join('\n');
}

/** True when a value prints as a single short token. */
function isAtom(v) {
  return v === null
    || typeof v === 'number'
    || typeof v === 'boolean'
    || typeof v === 'string'
    || typeof v === 'undefined';
}

function printAtom(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return quote(v);
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  return String(v);
}

/**
 * Serialise any value to JS source.
 *
 * @param {*} value
 * @param {number} depth  current indent depth (callers pass 0)
 * @param {string} unit   one indent level (default two spaces)
 * @returns {string}
 */
export function serialize(value, depth = 0, unit = '  ') {
  const pad = unit.repeat(depth);
  const padIn = unit.repeat(depth + 1);

  if (typeof value === 'function') return printFunction(value, pad);
  if (isAtom(value)) return printAtom(value);

  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    const parts = value.map((v) => serialize(v, depth + 1, unit));
    const flat = `[${parts.join(', ')}]`;
    // Keep arrays of plain values on one line when they comfortably fit —
    // this is what makes exported data literals readable.
    if (value.every(isAtom) && flat.length + pad.length <= INLINE_WIDTH) return flat;
    if (parts.every((p) => !p.includes('\n')) && flat.length + pad.length <= INLINE_WIDTH) return flat;
    return `[\n${parts.map((p) => padIn + p).join(',\n')}\n${pad}]`;
  }

  if (value instanceof Date) return `new Date(${quote(value.toISOString())})`;

  const keys = Object.keys(value);
  if (!keys.length) return '{}';
  const parts = keys.map((k) => {
    const key = IDENT.test(k) ? k : quote(k);
    return `${key}: ${serialize(value[k], depth + 1, unit)}`;
  });
  const flat = `{ ${parts.join(', ')} }`;
  if (parts.every((p) => !p.includes('\n')) && flat.length + pad.length <= INLINE_WIDTH) return flat;
  return `{\n${parts.map((p) => padIn + p).join(',\n')}\n${pad}}`;
}

/**
 * Build a function from source text that also *prints* as that source text.
 *
 * Chart.js tick callbacks are the awkward case in this codebase: the live
 * chart needs a real function, but a closure over a spec value would export as
 * `v => prefix + v` with `prefix` undefined at the paste site. Compiling from
 * source and pinning `toString` keeps the exported callback self-contained.
 *
 * @param {string} source e.g. "(v) => '$' + v + 'K'"
 */
export function srcFn(source) {
  // eslint-disable-next-line no-new-func
  const fn = new Function(`return (${source});`)();
  Object.defineProperty(fn, 'toString', { value: () => source, configurable: true });
  return fn;
}

/**
 * A numeric tick formatter with an optional prefix, suffix and thousands
 * separator, built so it exports cleanly.
 */
export function tickFormat({
  prefix = '', suffix = '', separator = false, decimals = null, compact = false, locale = '',
} = {}) {
  if (!prefix && !suffix && !separator && decimals == null && !compact) return undefined;
  const q = (s) => quote(s);
  // The locale is baked in as a literal, like everything else here, so the
  // export formats numbers the way the author saw them rather than the way
  // the reader's browser happens to. Blank means the browser's own.
  const loc = locale ? q(locale) : 'undefined';
  let value = 'v';
  if (compact) {
    // 1234567 → 1.2M. `Intl` has done this since 2020 in every browser that
    // runs the rest of this library, and it knows what a lakh is.
    value = `new Intl.NumberFormat(${loc}, { notation: 'compact', maximumFractionDigits: ${decimals == null ? 1 : decimals} }).format(v)`;
  } else if (decimals != null && separator) {
    value = `v.toLocaleString(${loc}, { minimumFractionDigits: ${decimals}, maximumFractionDigits: ${decimals} })`;
  } else if (decimals != null) {
    value = `v.toFixed(${decimals})`;
  } else if (separator) {
    value = locale ? `v.toLocaleString(${loc})` : 'v.toLocaleString()';
  }
  const parts = [];
  if (prefix) parts.push(q(prefix));
  parts.push(value);
  if (suffix) parts.push(q(suffix));
  return srcFn(`(v) => ${parts.join(' + ')}`);
}

/** Indent every non-blank line of a block by `spaces`. */
export function indent(block, spaces) {
  const pad = ' '.repeat(spaces);
  return String(block)
    .split('\n')
    .map((l) => (l.trim() ? pad + l : l))
    .join('\n');
}

/** Collapse 3+ consecutive blank lines and trim trailing whitespace. */
export function tidy(src) {
  return String(src)
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}
