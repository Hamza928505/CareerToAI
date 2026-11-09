/**
 * Read-only Gmail, for Check my email with Gemini.
 *
 * Uses its own token, GMAIL_READ_REFRESH_TOKEN (node scripts/gmail-auth.mjs --read), which Google limits to the
 * gmail.readonly permission: it cannot send, label, archive or delete anything. The only calls made here are two GETs
 * (list, get). Message text goes to this server's memory only; nothing is written to disk or logged.
 */
import { accessToken } from "./send-email.mjs";

const API = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const WHAT = { noun: "reading", fix: "node scripts/gmail-auth.mjs --read" };
const MAX_BODY = 4000;
const AT_ONCE = 5;

export function readConfig(env = process.env) {
  const { GMAIL_CLIENT_ID: id, GMAIL_CLIENT_SECRET: secret, GMAIL_READ_REFRESH_TOKEN: refresh } = env;
  return id && secret && refresh ? { id, secret, refresh } : null;
}

const decode = (data) => Buffer.from(data || "", "base64url").toString("utf8");
const header = (payload, name) => payload?.headers?.find((item) => item.name?.toLowerCase() === name)?.value || "";

function findPart(payload, type) {
  if (payload?.mimeType === type && payload.body?.data) return payload;
  for (const part of payload?.parts || []) { const hit = findPart(part, type); if (hit) return hit; }
  return null;
}

// One pass, so "&amp;lt;" becomes "&lt;" and is not decoded a second time into "<".
const ENTITIES = { nbsp: " ", amp: "&", lt: "<", gt: ">" };

/** The readable text of a message: the plain part, else the HTML part with its tags removed. */
export function messageText(payload) {
  const plain = findPart(payload, "text/plain");
  if (plain) return decode(plain.body.data).trim();
  const html = findPart(payload, "text/html");
  return html
    ? decode(html.body.data).replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&(nbsp|amp|lt|gt);/g, (_, name) => ENTITIES[name]).replace(/\s+/g, " ").trim()
    : "";
}

async function get(url, token, fetchImpl) {
  const response = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Gmail answered ${response.status}${body.error?.message ? `: ${String(body.error.message).slice(0, 200)}` : ""}`);
  return body;
}

/**
 * The messages matching a Gmail search, newest first, as { id, text, subject, sender, date, body }. Ids in `skip` (already
 * checked) are not fetched. `text` carries the sender, subject and body, which is what a reader may be shown.
 */
export async function readMessages({ config, query, max = 40, skip = new Set(), fetchImpl = fetch, onProgress = () => {} }) {
  const token = await accessToken(config, fetchImpl, WHAT);
  const listed = await get(`${API}?${new URLSearchParams({ q: query, maxResults: String(max) })}`, token, fetchImpl);
  const ids = (listed.messages || []).map((message) => message.id).filter((id) => !skip.has(id));
  const messages = [];
  onProgress({ stage: `Reading ${ids.length} new e-mail${ids.length === 1 ? "" : "s"}`, listed: ids.length, read: 0 });
  for (let i = 0; i < ids.length; i += AT_ONCE) {
    const batch = await Promise.allSettled(ids.slice(i, i + AT_ONCE).map((id) => get(`${API}/${encodeURIComponent(id)}?format=full`, token, fetchImpl)));
    for (const result of batch) {
      if (result.status !== "fulfilled") continue; // one unreadable message does not stop the check
      const message = result.value;
      const subject = header(message.payload, "subject"), sender = header(message.payload, "from");
      const date = new Date(Number(message.internalDate)).toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
      const body = messageText(message.payload).slice(0, MAX_BODY);
      messages.push({ id: message.id, subject, sender, date, body, text: `Message-ID: ${message.id}\nFrom: ${sender}\nSubject: ${subject}\nDate: ${date}\n\n${body}` });
    }
    onProgress({ read: messages.length });
  }
  return { messages, listed: (listed.messages || []).length };
}
