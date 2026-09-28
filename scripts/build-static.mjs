/**
 * Build a copy of the site that works straight from disk.
 *
 *   node scripts/build-static.mjs [output-dir]      (default: dist-static/)
 *
 * The normal build (`npm run build`) is already static HTML, but it assumes a
 * web server: links point at folders (`/workspace/`), asset paths carry the
 * GitHub Pages prefix (`/CareerToAI/assets/…`), and the page scripts are ES
 * modules. Double-click `index.html` and all three break — Chrome refuses to
 * run `<script type="module">` from a file:// URL, and nothing turns a folder
 * link into `workspace/index.html`.
 *
 * This script runs the same Eleventy build, then rewrites the output so a
 * browser can open it from the file system:
 *
 *   - every root-relative link becomes relative to the page it sits on, and
 *     folder links get an explicit `index.html`;
 *   - the module scripts are bundled (esbuild, IIFE) into classic scripts, so
 *     the imports of SweetAlert2 and the skill library are inlined.
 *
 * Nothing in src/ changes: the published site and this copy are the same
 * pages, differing only in how they are addressed. The editor and workspace
 * behave as they do on the published site — read-only, because there is no
 * `npm run editor` helper to write files or run tasks.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

import { resolveSite } from "../lib/site.mjs";

const site = resolveSite();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = path.join(root, "_site");
const outDir = path.resolve(root, process.argv[2] || "dist-static");

// 1. The normal Eleventy build. Absolute URLs (canonical, Open Graph, sitemap)
//    keep pointing at the real site: a copy on disk should still say where
//    the page actually lives. Only the root-relative links get rewritten below.
execSync("npx eleventy", { cwd: root, stdio: "inherit" });

// 2. Fresh output directory.
fs.rmSync(outDir, { recursive: true, force: true });
fs.cpSync(siteDir, outDir, { recursive: true });

// 3. Bundle the page scripts. Each `<script type="module" src>` in the build
//    becomes a classic script with its imports inlined.
const moduleScripts = new Set();
for (const file of walk(outDir, ".html")) {
  for (const m of fs.readFileSync(file, "utf8").matchAll(/<script type="module" src="([^"]+)"/g)) {
    moduleScripts.add(stripPrefix(m[1]));
  }
}
for (const rel of moduleScripts) {
  const entry = path.join(outDir, rel);
  // Not `format: "iife"`: workspace.js uses top-level await, which esbuild
  // only accepts for ESM output. After bundling no import/export is left, so
  // wrapping the ESM output in an async IIFE gives a valid classic script.
  await build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    target: "es2022",
    banner: { js: "(async () => {" },
    footer: { js: "})();" },
    outfile: entry,
    allowOverwrite: true,
    logLevel: "warning",
  });
}

// 4. Relativise every root-relative href/src and name index.html explicitly.
for (const file of walk(outDir, ".html")) {
  const dir = path.dirname(file);
  const toRel = (target) => {
    // "/" -> "index.html", "/workspace/" -> "workspace/index.html"
    const [pathname, suffix = ""] = target.split(/(?=[?#])/);
    const fsPath = path.join(outDir, stripPrefix(pathname), pathname.endsWith("/") ? "index.html" : "");
    let rel = path.relative(dir, fsPath).split(path.sep).join("/");
    if (!rel.startsWith(".")) rel = "./" + rel;
    return rel + suffix;
  };
  const html = fs
    .readFileSync(file, "utf8")
    .replace(/<script type="module" src="/g, '<script src="')
    .replace(/\b(href|src)="(\/(?!\/)[^"]*)"/g, (_, attr, target) => `${attr}="${toRel(target)}"`);
  fs.writeFileSync(file, html);
}

console.log(`\nStatic copy written to ${path.relative(root, outDir) || "."}/ — open index.html directly.`);

/** "/CareerToAI/assets/x.js" -> "assets/x.js" (the Pages sub-path, if any). */
function stripPrefix(pathname) {
  const p = pathname.startsWith(site.pathPrefix) ? pathname.slice(site.pathPrefix.length) : pathname;
  return p.replace(/^\/+/, "");
}

function* walk(dir, ext) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p, ext);
    else if (p.endsWith(ext)) yield p;
  }
}
