/**
 * share.js — put an edited chart in the URL, so it can be linked.
 *
 * A chart you have tuned is worth sending to someone. Encoding the whole spec
 * keeps that a pure client-side feature: no server, no storage, no accounts —
 * the link *is* the document.
 *
 * The spec is JSON, deflate-compressed where the browser supports it, then
 * base64url encoded. Compression matters: a 97-chart library includes specs
 * with a few hundred data points, and raw base64 JSON would blow past what
 * some clients will accept in a URL.
 */

const RAW = 'r';   // marker for uncompressed payloads
const GZ = 'z';    // marker for deflate-raw payloads

/* ── base64url, which survives being pasted into anything ────────────────── */

function toBase64Url(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
    + '==='.slice((text.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** CompressionStream is widely but not universally available. */
const canCompress = typeof CompressionStream === 'function'
  && typeof DecompressionStream === 'function';

async function deflate(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

/* ── encode / decode ─────────────────────────────────────────────────────── */

/**
 * Strip the studio's own bookkeeping before sharing. Anything prefixed with
 * `_` is transient internal state and only bloats the link.
 */
function shareable(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(shareable);
  const out = {};
  for (const key of Object.keys(value)) {
    if (key.startsWith('_')) continue;
    out[key] = shareable(value[key]);
  }
  return out;
}

/**
 * @param {object} spec
 * @returns {Promise<string>} an opaque token for the `s` query parameter
 */
export async function encodeSpec(spec) {
  const json = JSON.stringify(shareable(spec));
  if (!canCompress) return RAW + toBase64Url(new TextEncoder().encode(json));
  try {
    return GZ + toBase64Url(await deflate(json));
  } catch {
    return RAW + toBase64Url(new TextEncoder().encode(json));
  }
}

/**
 * @param {string} token
 * @returns {Promise<object|null>} the spec, or null if the token is unusable
 */
export async function decodeSpec(token) {
  if (!token || token.length < 2) return null;
  const kind = token[0];
  const body = token.slice(1);
  try {
    const bytes = fromBase64Url(body);
    const json = kind === GZ ? await inflate(bytes) : new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    // A truncated or hand-edited link should fall back to the default chart,
    // never throw the studio away.
    return null;
  }
}

/** Build the full shareable URL for a chart and its spec. */
export async function buildShareUrl(chartId, spec) {
  const token = await encodeSpec(spec);
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('chart', chartId);
  url.searchParams.set('s', token);
  return url.toString();
}

/**
 * Some clients truncate very long URLs. Report the length so the UI can warn
 * rather than hand over a link that silently breaks.
 */
export const URL_COMFORTABLE = 2000;
