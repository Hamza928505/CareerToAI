/**
 * Which requests the local editor server (scripts/editor-server.mjs) answers. It listens on 127.0.0.1 only, but every
 * web page open in the browser can still send it requests, so:
 *
 *   - the Host must be the server's own address. A page whose domain is re-pointed at 127.0.0.1 ("DNS rebinding")
 *     counts as same-origin to the browser and could otherwise read the tracker, the student's files and the phone number;
 *   - only GET and POST exist (some handlers treat any other method as a write), and a POST that names another site as
 *     its Origin is refused;
 *   - /__editor/ routes refuse requests another site started (Sec-Fetch-Site): a link or an image elsewhere must not
 *     trigger work such as the apply preview, which drafts emails with the paid AI provider.
 *
 * Returns { status, error } for a request to refuse, or null to answer it. Tools on this computer that send no browser
 * headers (curl, node) are answered, as they can read the files directly anyway.
 */
export function refusal({ method, headers }, pathname, port) {
  const own = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!own.includes(String(headers.host || "").toLowerCase())) return { status: 403, error: "This server answers only at its own local address." };
  if (method !== "GET" && method !== "POST") return { status: 405, error: "Only GET and POST are used here." };
  if (method === "POST" && headers.origin && !own.some((host) => headers.origin === `http://${host}`)) {
    return { status: 403, error: "Open the local workspace to change its files." };
  }
  const site = headers["sec-fetch-site"];
  if (pathname.startsWith("/__editor/") && site && site !== "same-origin" && site !== "none") {
    return { status: 403, error: "Open the local workspace to use this." };
  }
  return null;
}
