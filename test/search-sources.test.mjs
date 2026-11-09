import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { NIM_SITES } from "../lib/nim-agent.mjs";

const sources = JSON.parse(readFileSync(new URL("../src/_data/searchSources.json", import.meta.url), "utf8"));
const dir = new URL("../src/assets/service-logos/", import.meta.url);

// The logos under "Search with" must be the boards the NIM search really covers, in its order.
test("the NIM logos list exactly the boards of NIM_SITES", () => {
  assert.deepEqual(sources.nim.map((s) => s.name), Object.values(NIM_SITES));
});

// A chip may have no logo (a site that blocks icon downloads), but a logo it names must be a real PNG in the folder.
test("every logo a source names is a bundled PNG", () => {
  for (const group of ["claude", "nim", "apis"]) {
    assert.ok(sources[group].length > 0, group);
    for (const { name, logo } of sources[group]) {
      if (!logo) continue;
      const file = new URL(`${logo}.png`, dir);
      assert.ok(existsSync(file), `${group}: ${name} has no ${logo}.png`);
      assert.deepEqual([...readFileSync(file).subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], `${logo}.png is not a PNG`);
    }
  }
});
