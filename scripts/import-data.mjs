#!/usr/bin/env node
/**
 * Import a careertoai-data.json exported from /editor/ on the published site.
 *
 *   npm run import-data -- ./careertoai-data.json
 *
 * Writes data/profile.json, data/experience.json, data/certificates.json and
 * the images into src/certs/ and src/media/. This is the published-mode
 * counterpart of the editor's "Save to data/" button, and both go through the
 * same lib/apply-data.mjs so they cannot drift apart.
 */
import fs from "node:fs";
import path from "node:path";

import { applyPayload } from "../lib/apply-data.mjs";

const [file] = process.argv.slice(2);

if (!file || file === "--help" || file === "-h") {
  console.log(`
Import an editor export into the repository.

  npm run import-data -- <careertoai-data.json>

Get the file from /editor/ using the "Download .json" button. Importing
replaces data/profile.json, data/experience.json and data/certificates.json
entirely — the export is the full picture, not a patch.
`);
  process.exit(file ? 0 : 1);
}

const resolved = path.resolve(file);
if (!fs.existsSync(resolved)) {
  console.error(`\nError: no such file: ${file}\n`);
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(fs.readFileSync(resolved, "utf8"));
} catch (error) {
  console.error(`\nError: ${path.basename(resolved)} is not valid JSON — ${error.message}\n`);
  process.exit(1);
}

try {
  const result = await applyPayload(payload);
  console.log(`
Imported ${path.basename(resolved)}

  ${result.counts.education} education entr${result.counts.education === 1 ? "y" : "ies"}
  ${result.counts.experience} position${result.counts.experience === 1 ? "" : "s"}
  ${result.counts.certificates} certification${result.counts.certificates === 1 ? "" : "s"}
  ${result.images} image${result.images === 1 ? "" : "s"} published

Written: ${result.written.join(", ")}

Next:
  npm run serve            preview at http://localhost:8080
  git add -A && git commit -m "Update profile" && git push
`);
} catch (error) {
  console.error(`\nError: ${error.message}\n`);
  process.exit(1);
}
