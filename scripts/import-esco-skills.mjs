/**
 * Import the ESCO skills pillar into data/skill-taxonomy.json.
 *
 *   npm run skills:import              English + German, the whole pillar
 *   npm run skills:import -- --en-only skip the German pass (half the requests)
 *
 * ESCO is the EU's occupation and skill classification: ~14,000 skills across
 * every trade and profession, not just IT, openly licensed and reachable
 * without an API key. That breadth is the point — GJU sends students to
 * mechanical engineering, architecture, logistics and translation placements,
 * and a hand-written list was never going to cover them.
 *
 * The file this writes is optional. Without it the editor uses the curated
 * library in src/assets/skill-library.js; with it, the picker gains a searchable
 * taxonomy and German labels, loaded lazily so a normal page load is unaffected.
 *
 * Traversal note: a child link carries a title but no type, so the only way to
 * tell a group from a skill is the URI. Groups are dotted codes (S1.2.0, T4.3);
 * skills are UUIDs. So we fetch groups and harvest skills from their links,
 * which is a few hundred requests rather than fourteen thousand.
 *
 * The knowledge pillar breaks that rule: its inner nodes are UUIDs too, and
 * they hold exactly the domain terms a GJU student needs — mechanical
 * engineering, accounting, hydraulics. So inside that branch we recurse into
 * UUID nodes as well, bounded by KNOWLEDGE_DEPTH so it cannot run away.
 */

import fs from "node:fs";
import path from "node:path";

import { DATA_DIR, ROOT } from "../lib/content.mjs";

const API = "https://ec.europa.eu/esco/api";
const SKILLS_SCHEME = "http://data.europa.eu/esco/concept-scheme/skills";
const OUT = path.join(DATA_DIR, "skill-taxonomy.json");

const CONCURRENCY = 8;
const RETRIES = 4;
const PAUSE_MS = 60;
const KNOWLEDGE_DEPTH = 5;
const KNOWLEDGE = "http://data.europa.eu/esco/skill/K";

/** Nodes ESCO would not serve even after retries. Reported, never fatal. */
const skipped = [];

/**
 * A leaf concept always has a UUID; every other URI shape is a group.
 * Testing for the leaf is the only rule that holds — group URIs come as dotted
 * codes (S1.2.0), bare letters (K, T) and ISCED paths (isced-f/07).
 */
const isLeaf = (uri) => /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(uri);
const isGroup = (uri) => !isLeaf(uri);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, attempt = 1) {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    if (attempt > RETRIES) {
      skipped.push({ url, reason: error.message });
      return null;
    }
    await sleep(400 * attempt * attempt);
    return getJson(url, attempt + 1);
  }
}

const children = (node) =>
  node?._links?.narrowerConcept || node?._links?.narrowerSkill || node?._links?.hasTopConcept || [];

const conceptUrl = (uri, language) =>
  `${API}/resource/concept?uri=${encodeURIComponent(uri)}&language=${language}`;

/**
 * Walk the pillar in one language.
 * Returns { labels: Map<uri, title>, topOf: Map<uri, topGroupUri>, order: uri[] }.
 */
async function crawl(language, onProgress) {
  const root = await getJson(
    `${API}/resource/taxonomy?uri=${encodeURIComponent(SKILLS_SCHEME)}&language=${language}`
  );
  if (!root) throw new Error("ESCO taxonomy root did not respond — check your connection");

  const labels = new Map();
  const parentOf = new Map();
  const order = [];
  const seen = new Set();

  // The four pillars: attitudes and values, skills, knowledge, language skills.
  let frontier = children(root).map((c) => ({
    uri: c.uri,
    title: c.title,
    depth: 0,
    knowledge: c.uri === KNOWLEDGE,
  }));
  for (const node of frontier) labels.set(node.uri, node.title);

  let groupsFetched = 0;

  while (frontier.length) {
    const nextFrontier = [];

    for (let i = 0; i < frontier.length; i += CONCURRENCY) {
      const batch = frontier.slice(i, i + CONCURRENCY).filter((n) => !seen.has(n.uri));
      batch.forEach((n) => seen.add(n.uri));

      const nodes = await Promise.all(batch.map((n) => getJson(conceptUrl(n.uri, language))));

      nodes.forEach((node, index) => {
        groupsFetched += 1;
        const parent = batch[index];
        if (!node) return;
        if (node.title) labels.set(parent.uri, node.title);

        const knowledge = parent.knowledge || parent.uri === KNOWLEDGE;
        // Inside the knowledge branch a UUID node may still have children.
        const walkable = (uri) => isGroup(uri) || (knowledge && parent.depth < KNOWLEDGE_DEPTH);

        for (const child of children(node)) {
          if (child.uri === parent.uri) continue;
          if (!labels.has(child.uri)) {
            labels.set(child.uri, child.title);
            parentOf.set(child.uri, parent.uri);
            if (!isGroup(child.uri)) order.push(child.uri);
          }
          if (walkable(child.uri) && !seen.has(child.uri)) {
            nextFrontier.push({
              uri: child.uri,
              title: child.title,
              depth: parent.depth + 1,
              knowledge,
            });
          }
        }
      });

      onProgress?.({ language, groupsFetched, skills: order.length });
      if (PAUSE_MS) await sleep(PAUSE_MS);
    }

    frontier = nextFrontier;
  }

  return { labels, parentOf, order };
}

async function main() {
  const enOnly = process.argv.includes("--en-only");
  const started = Date.now();
  let lastLog = 0;

  const progress = ({ language, groupsFetched, skills }) => {
    const now = Date.now();
    if (now - lastLog < 2000) return;
    lastLog = now;
    process.stdout.write(`  [${language}] ${groupsFetched} groups walked, ${skills} skills found\n`);
  };

  console.log("Crawling the ESCO skills pillar (English)…");
  const en = await crawl("en", progress);

  let de = null;
  if (!enOnly) {
    console.log("Crawling again for German labels…");
    de = await crawl("de", progress);
  }

  // Group the leaves under the pillar they hang from, keeping ESCO's own names.
  const byTop = new Map();
  for (const uri of en.order) {
    const groupName = en.labels.get(en.parentOf.get(uri)) || "Other";
    if (!byTop.has(groupName)) byTop.set(groupName, []);
    byTop.get(groupName).push({
      en: en.labels.get(uri),
      ...(de && de.labels.get(uri) ? { de: de.labels.get(uri) } : {}),
    });
  }

  const groups = [...byTop.entries()]
    .map(([group, skills]) => ({
      group,
      skills: skills
        .filter((s) => s.en)
        .sort((a, b) => a.en.localeCompare(b.en)),
    }))
    .sort((a, b) => a.group.localeCompare(b.group));

  const total = groups.reduce((sum, g) => sum + g.skills.length, 0);

  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        source: "ESCO — European Skills, Competences, Qualifications and Occupations",
        sourceUrl: "https://esco.ec.europa.eu/",
        licence: "European Union, CC BY 4.0. Attribution required if you republish it.",
        generatedAt: new Date().toISOString(),
        languages: de ? ["en", "de"] : ["en"],
        count: total,
        groups,
      },
      null,
      0
    ) + "\n"
  );

  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`\nWrote ${path.relative(ROOT, OUT).replace(/\\/g, "/")}`);
  console.log(`  ${total} skills in ${groups.length} groups${de ? ", English and German" : ", English only"}`);
  console.log(`  ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB, ${seconds}s`);
  if (skipped.length) {
    console.warn(`  ${skipped.length} node${skipped.length === 1 ? "" : "s"} skipped after retries — rerun to pick them up`);
  }
  console.log("\nThe editor picks it up on the next build — it is loaded lazily, only when");
  console.log("you open “Add from library”, so a normal page load is unaffected.");
}

await main();
