import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readable, readJson, writeJson } from "../lib/content.mjs";

test("readable: the student's git-ignored file wins, its .example.json stands in only when it is missing, writes go to the real file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "careertoai-content-"));
  try {
    const real = path.join(dir, "profile.json");
    const example = path.join(dir, "profile.example.json");
    fs.writeFileSync(example, JSON.stringify({ name: "TODO: placeholder" }));

    assert.equal(readable(real), example, "no real file: the placeholder is read");
    assert.equal(readJson(real).name, "TODO: placeholder");

    writeJson(real, { name: "Student" });
    assert.equal(readable(real), real, "the real file wins once it exists");
    assert.equal(readJson(real).name, "Student");
    assert.equal(JSON.parse(fs.readFileSync(example, "utf8")).name, "TODO: placeholder", "a write never touches the placeholder");

    const lone = path.join(dir, "site.json");
    assert.equal(readable(lone), lone, "a file without a placeholder is read as it is (and fails as before when missing)");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
