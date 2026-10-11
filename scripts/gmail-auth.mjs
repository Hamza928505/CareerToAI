#!/usr/bin/env node
/**
 * One-time Gmail permission, so applications can be sent by email.
 *
 *   npm run gmail:auth
 *
 * Needs GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env (an OAuth client of type "Desktop app").
 * Asks Google for the single permission "send email on your behalf": it cannot read, list or
 * delete mail. The token it returns goes to .env (git-ignored) as GMAIL_REFRESH_TOKEN.
 * The redirect goes to this computer only (127.0.0.1) and the script stops after one answer.
 */
import { randomBytes } from "node:crypto";
import http from "node:http";

import { saveSettings } from "../lib/env-settings.mjs";
import { loadEnv } from "../lib/extract-certificate.mjs";

const SCOPE = "https://www.googleapis.com/auth/gmail.send";
const WAIT_MS = 5 * 60_000;

loadEnv();
const { GMAIL_CLIENT_ID: id, GMAIL_CLIENT_SECRET: secret, GMAIL_SENDER: hint } = process.env;
if (!id || !secret) {
  console.error("Add GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET to .env first (workspace > API keys & email).");
  process.exit(1);
}

const state = randomBytes(16).toString("hex");
const server = http.createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const redirect = `http://127.0.0.1:${server.address().port}/`;

const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
url.search = new URLSearchParams({
  client_id: id, redirect_uri: redirect, response_type: "code", scope: SCOPE, state,
  access_type: "offline", prompt: "consent", ...(hint ? { login_hint: hint } : {}),
}).toString();
console.log(`\nOpen this link, sign in with the Gmail account that should send, and allow "Send email on your behalf":\n\n${url}\n`);

const code = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("No answer within 5 minutes.")), WAIT_MS);
  server.on("request", (req, res) => {
    const query = new URL(req.url, redirect).searchParams;
    if (!query.has("code") && !query.has("error")) { res.statusCode = 404; return res.end(); } // favicon and the like
    clearTimeout(timer);
    console.log(`Google answered (${query.get("error") ? "error: " + query.get("error") : "approval received"}). Finishing…`);
    res.setHeader("content-type", "text/plain; charset=utf-8");
    if (query.get("state") !== state || !query.get("code")) {
      res.end("Not connected. You can close this tab.");
      return reject(new Error(query.get("error") ? `Google said: ${query.get("error")}.` : "The answer did not match this request."));
    }
    res.end("Connected. You can close this tab and go back to the terminal.");
    resolve(query.get("code"));
  });
}).finally(() => server.close());

const response = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: "authorization_code" }),
});
const body = await response.json().catch(() => ({}));
if (!response.ok || !body.refresh_token) {
  console.error(`Google did not return a permission token (${body.error_description || body.error || response.status}).`);
  process.exit(1);
}
if (!String(body.scope || "").split(" ").includes(SCOPE) || String(body.scope).split(" ").length > 1) {
  console.error(`Unexpected permissions granted (${body.scope}). Nothing was saved.`);
  process.exit(1);
}
saveSettings({ GMAIL_REFRESH_TOKEN: body.refresh_token });
console.log("Connected. The send-only permission is saved to .env. Applications with an employer e-mail can now be sent.");
