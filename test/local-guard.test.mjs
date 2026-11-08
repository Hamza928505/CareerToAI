import assert from "node:assert/strict";
import test from "node:test";

import { refusal } from "../lib/local-guard.mjs";

const ask = (method, headers = {}, pathname = "/__editor/private-profile") => refusal({ method, headers: { host: "127.0.0.1:8081", ...headers } }, pathname, 8081);

test("the workspace's own requests are answered, and local tools without browser headers too", () => {
  assert.equal(ask("GET"), null);
  assert.equal(ask("GET", { host: "localhost:8081", "sec-fetch-site": "same-origin" }), null);
  assert.equal(ask("GET", { host: "LOCALHOST:8081" }), null);
  assert.equal(ask("POST", { origin: "http://127.0.0.1:8081", "sec-fetch-site": "same-origin" }), null);
  assert.equal(ask("POST", { origin: "http://localhost:8081" }), null);
  assert.equal(ask("POST"), null); // curl or node on this computer
  assert.equal(ask("GET", { "sec-fetch-site": "none" }, "/__editor/excel"), null); // typed, bookmarked or opened from the terminal
});

test("a page whose domain points at 127.0.0.1 (DNS rebinding) gets nothing, whatever it asks", () => {
  for (const method of ["GET", "POST"]) {
    for (const host of ["attacker.example:8081", "127.0.0.1:9999", "127.0.0.1", "", undefined]) {
      assert.equal(ask(method, { host, origin: `http://${host}`, "sec-fetch-site": "same-origin" })?.status, 403, `${method} ${host}`);
    }
  }
  assert.equal(ask("GET", { host: "attacker.example:8081" }, "/workspace/")?.status, 403); // the site's pages too
});

test("only GET and POST exist, so no other method can reach a handler that writes on anything but GET", () => {
  for (const method of ["PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]) {
    assert.equal(ask(method, { origin: "http://127.0.0.1:8081", "sec-fetch-site": "same-origin" })?.status, 405, method);
  }
});

test("another site can neither post to the server nor start its routes, but may link to the public pages", () => {
  assert.equal(ask("POST", { origin: "https://attacker.example" })?.status, 403);
  assert.equal(ask("POST", { origin: "null" })?.status, 403); // a sandboxed frame or a file
  for (const site of ["cross-site", "same-site"]) {
    assert.equal(ask("GET", { "sec-fetch-site": site }, "/__editor/apply-preview")?.status, 403, site); // the AI drafts cost money
    assert.equal(ask("GET", { "sec-fetch-site": site }, "/__editor/excel")?.status, 403, site);
    assert.equal(ask("GET", { "sec-fetch-site": site }, "/workspace/"), null, site);
  }
});
