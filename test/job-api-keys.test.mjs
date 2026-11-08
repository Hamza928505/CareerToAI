import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkCredits } from "../lib/credits.mjs";
import { readSettings, saveSettings } from "../lib/env-settings.mjs";

const NAMES = ["ADZUNA_APP_ID", "ADZUNA_APP_KEY", "JOOBLE_API_KEY_DE", "CAREERJET_API_KEY", "CAREERJET_USER_IP"];

test("the free job APIs have key rows with a way to get each key, and a bad IP is refused", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jobapis-")), ".env");
  const rows = readSettings({}, file).filter((f) => f.group === "jobapis");
  assert.deepEqual(rows.map((f) => f.name), NAMES);
  assert.ok(rows.filter((f) => f.kind === "secret").every((f) => /^https:\/\//.test(f.getKey)));
  const env = {};
  assert.throws(() => saveSettings({ CAREERJET_USER_IP: "my home" }, { file, env }), /IP address/);
  saveSettings({ ADZUNA_APP_ID: "id1", ADZUNA_APP_KEY: "key1", CAREERJET_USER_IP: "203.0.113.7" }, { file, env });
  assert.equal(env.ADZUNA_APP_KEY, "key1"); // the engine is started with this environment, so the next search sees it
  assert.match(fs.readFileSync(file, "utf8"), /CAREERJET_USER_IP=203\.0\.113\.7/);
});

test("each job API's card needs every setting it uses, then reports the key as saved", async () => {
  const find = (list, id) => list.find((p) => p.id === id);
  const none = await checkCredits({});
  for (const id of ["adzuna", "jooble", "careerjet"]) assert.equal(find(none, id).status, "no-key");
  const half = await checkCredits({ ADZUNA_APP_KEY: "k", CAREERJET_API_KEY: "k" }); // Adzuna lacks its app ID, Careerjet your IP
  assert.match(find(half, "adzuna").message, /ADZUNA_APP_ID/);
  assert.match(find(half, "careerjet").message, /CAREERJET_USER_IP/);
  const all = await checkCredits({ ADZUNA_APP_ID: "i", ADZUNA_APP_KEY: "k", JOOBLE_API_KEY_DE: "k", CAREERJET_API_KEY: "k", CAREERJET_USER_IP: "203.0.113.7" });
  for (const id of ["adzuna", "jooble", "careerjet"]) assert.ok(find(all, id).status === "ok" && find(all, id).note);
});

// The shape is what GET /v2/users/me/limits really returned for this account (free plan, 10 USD a month).
const APIFY_LIMITS = { data: {
  monthlyUsageCycle: { startAt: "2026-10-23T00:00:00.000Z", endAt: "2026-11-22T23:59:59.999Z" },
  limits: { maxMonthlyUsageUsd: 10, maxMonthlyActorComputeUnits: 625 },
  current: { monthlyUsageUsd: 0.39790351194493717, monthlyActorComputeUnits: 0 } } };

test("the Apify card shows the monthly usage left and when it resets, and sends the token only to Apify", async () => {
  const real = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push([String(url), init?.headers?.Authorization]);
    return String(url).startsWith("https://api.apify.com/") ? { ok: true, status: 200, json: async () => APIFY_LIMITS } : { ok: false, status: 404, json: async () => ({}) };
  };
  try {
    const apify = (list) => list.find((p) => p.id === "apify");
    assert.equal(apify(await checkCredits({})).status, "no-key");
    const card = apify(await checkCredits({ APIFY_TOKEN: "apify_api_x" }));
    assert.equal(card.status, "ok");
    assert.equal(card.unit, "USD");
    assert.equal(card.total, 10);
    assert.ok(Math.abs(card.remaining - 9.6020964880550628) < 1e-9);
    assert.equal(card.resetsAt, "2026-11-23"); // the cycle ends on the 22nd at 23:59:59 UTC, the next one starts on the 23rd
    assert.deepEqual(seen.filter(([url]) => url.includes("apify")), [["https://api.apify.com/v2/users/me/limits", "Bearer apify_api_x"]]);
    assert.ok(seen.filter(([, auth]) => auth === "Bearer apify_api_x").every(([url]) => url.startsWith("https://api.apify.com/"))); // no other address received the token
    // Over the limit: nothing left, never negative.
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: { ...APIFY_LIMITS.data, current: { monthlyUsageUsd: 12.5 } } }) });
    assert.equal(apify(await checkCredits({ APIFY_TOKEN: "t" })).remaining, 0);
    // A refused token is a clear message, not a crash.
    globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
    assert.match(apify(await checkCredits({ APIFY_TOKEN: "bad" })).message, /refused/);
  } finally {
    globalThis.fetch = real;
  }
});

test("the Apify token has a row in the search settings with a link to get it", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "apify-")), ".env");
  const row = readSettings({}, file).find((f) => f.name === "APIFY_TOKEN");
  assert.equal(row.group, "search");
  assert.equal(row.kind, "secret");
  assert.match(row.getKey, /^https:\/\/console\.apify\.com\//);
});
