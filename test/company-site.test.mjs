import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { findCompanySites, siteMatches } from "../lib/company-site.mjs";

test("a site is accepted only when its name matches the company's, never a job board", () => {
  assert.equal(siteMatches("Drees & Sommer SE", "https://www.dreso.com/de"), false); // no shared word
  assert.equal(siteMatches("Drees & Sommer SE", "https://www.drees-sommer.com/karriere"), true);
  assert.equal(siteMatches("360 Consulting GmbH", "https://www.360consulting.de/"), true);
  assert.equal(siteMatches("LBBW Landesbank Baden-Württemberg", "https://www.lbbw.de/"), true);
  assert.equal(siteMatches("Drees & Sommer SE", "https://www.stepstone.de/drees-sommer"), false);
  assert.equal(siteMatches("Acme GmbH", "https://de.wikipedia.org/wiki/Acme"), false);
  assert.equal(siteMatches("Acme GmbH", "not a url"), false);
});

test("lookups go to Exa once per company, answers (and misses) are cached, a failure stops quietly", async () => {
  const file = path.join(await mkdtemp(path.join(os.tmpdir(), "sites-")), "sites.json");
  const asked = [];
  const fetchImpl = async (url, init) => {
    const { query } = JSON.parse(init.body);
    asked.push(query);
    assert.equal(init.headers["x-api-key"], "k");
    const results = query.startsWith("Drees") ? [{ url: "https://www.stepstone.de/x" }, { url: "https://www.drees-sommer.com/en/" }] : [{ url: "https://news.example/a" }];
    return { ok: true, json: async () => ({ results }) };
  };
  const first = await findCompanySites(["Drees & Sommer SE", "Unknown Firma GmbH", "Drees & Sommer SE"], { key: "k", fetchImpl, file });
  assert.deepEqual(first.sites, { "Drees & Sommer SE": "https://www.drees-sommer.com", "Unknown Firma GmbH": "" });
  assert.equal(asked.length, 2);
  const again = await findCompanySites(["Drees & Sommer SE", "Unknown Firma GmbH"], { key: "k", fetchImpl, file });
  assert.equal(again.asked, 0);
  assert.equal(asked.length, 2);
  const down = await findCompanySites(["Other AG"], { key: "k", file, fetchImpl: async () => ({ ok: false, status: 429 }) });
  assert.match(down.error, /429/);
  assert.deepEqual(await findCompanySites(["Other AG"], { key: "", file }), { sites: {}, asked: 0, error: "no Exa key" });
});
