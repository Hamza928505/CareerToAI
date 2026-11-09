/**
 * Runs the NVIDIA NIM search alone and writes what it found, without touching the tracker:
 *   node --env-file=.env scripts/nim-search.mjs <outfile.json> [--global] [--field="Nursing Science"]
 * By default it searches for the major in the profile; --global searches every field, --field names another major.
 */
import { writeFileSync } from "node:fs";

import { NEW_DAYS, newEligible } from "../lib/application-flow.mjs";
import { searchNim } from "../lib/nim-agent.mjs";
import { searchPlan } from "../lib/search-focus.mjs";

const args = process.argv.slice(2);
const field = args.find((arg) => arg.startsWith("--field="))?.slice("--field=".length);
const plan = await searchPlan({ mode: args.includes("--global") ? "global" : "profile", ...(field ? { field } : {}) });
console.log(`Searching for: ${plan.label}`);
const result = await searchNim({ days: NEW_DAYS, plan });
const { jobs, skipped } = newEligible(result.jobs, [], { field: null });
writeFileSync(args.find((arg) => !arg.startsWith("--")) || "nim-search-result.json", JSON.stringify({ plan: plan.label, ...result, kept: jobs, skipped }, null, 1));
console.log(result.warnings.join("\n"));
console.log(`Kept by the search rules (posted in the last ${NEW_DAYS} days, GJU rules, any field): ${jobs.length}. Left out:`, JSON.stringify(skipped));
