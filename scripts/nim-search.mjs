/** Runs the NVIDIA NIM search alone and writes what it found: node --env-file=.env scripts/nim-search.mjs <outfile.json> */
import { writeFileSync } from "node:fs";

import { searchNim } from "../lib/nim-agent.mjs";
import { NEW_DAYS, newEligible } from "../lib/application-flow.mjs";

const result = await searchNim({ days: NEW_DAYS });
const { jobs, skipped } = newEligible(result.jobs, []);
writeFileSync(process.argv[2] || "nim-search-result.json", JSON.stringify({ ...result, kept: jobs, skipped }, null, 1));
console.log(result.warnings.join("\n"));
console.log(`Kept by the search rules (posted in the last ${NEW_DAYS} days, IT, GJU): ${jobs.length}. Left out:`, JSON.stringify(skipped));
