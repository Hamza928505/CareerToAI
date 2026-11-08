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
