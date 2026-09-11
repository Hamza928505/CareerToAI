import fs from "node:fs";

import { formatDate } from "./lib/content.mjs";
import { personGraph } from "./lib/jsonld.mjs";
import { resolveSite } from "./lib/site.mjs";

const site = resolveSite();

export default function (eleventyConfig) {
  // Certificate images and the stylesheet ship as-is.
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/certs": "certs" });
  eleventyConfig.addPassthroughCopy({ "src/media": "media" });
  // SweetAlert2 is self-hosted rather than loaded from a CDN: the site makes no
  // third-party requests, and the local editor keeps working offline. The
  // esm.all build carries its own CSS, so this is the only file needed.
  eleventyConfig.addPassthroughCopy({
    "node_modules/sweetalert2/dist/sweetalert2.esm.all.min.js": "assets/sweetalert2.esm.min.js",
  });
  // Publish the raw data too — an AI agent that would rather parse JSON than
  // HTML can fetch /data/certificates.json directly.
  eleventyConfig.addPassthroughCopy({ "data/certificates.json": "data/certificates.json" });
  eleventyConfig.addPassthroughCopy({ "data/profile.json": "data/profile.json" });
  eleventyConfig.addPassthroughCopy({ "data/experience.json": "data/experience.json" });
  eleventyConfig.addPassthroughCopy({ "data/projects.json": "data/projects.json" });
  // Optional: written by `npm run skills:import`. The editor fetches it lazily
  // and works without it, so its absence must not fail the build.
  if (fs.existsSync("data/skill-taxonomy.json")) {
    eleventyConfig.addPassthroughCopy({ "data/skill-taxonomy.json": "data/skill-taxonomy.json" });
  }
  if (fs.existsSync("data/skill-pool.json")) {
    eleventyConfig.addPassthroughCopy({ "data/skill-pool.json": "data/skill-pool.json" });
  }

  eleventyConfig.addWatchTarget("./data/");
  eleventyConfig.addWatchTarget("./lib/");

  /** Root-relative path -> fully qualified URL (for canonical, OG, JSON-LD, sitemap). */
  eleventyConfig.addFilter("absUrl", (pathname) => abs(pathname));

  const abs = (pathname) => {
    const p = String(pathname || "/");
    if (/^https?:\/\//i.test(p)) return p;
    return site.origin + site.pathPrefix + p.replace(/^\/+/, "");
  };

  // Structured data is built in lib/jsonld.mjs and injected into <head> by the
  // base layout. The profile is a single page, so one graph covers the whole site.
  eleventyConfig.addFilter("personJsonLd", (profile, certificates, experience, projects) =>
    personGraph(profile, certificates, experience, projects, abs)
  );

  /** "2024-03-15" -> "15 March 2024"; also handles "2024-03" and "2024". */
  eleventyConfig.addFilter("humanDate", (value) => formatDate(value));

  /**
   * Serialize for a <script type="application/ld+json"> block. Escaping "<"
   * is what prevents a "</script>" inside any field from breaking out.
   */
  eleventyConfig.addFilter("jsonld", (value) =>
    JSON.stringify(value, null, 2).replace(/</g, "\u003c")
  );

  /** Collapse whitespace and hard-truncate — for <meta name="description">. */
  eleventyConfig.addFilter("metaTrim", (text, max = 155) => {
    const s = String(text || "").replace(/\s+/g, " ").trim();
    if (s.length <= max) return s;
    return s.slice(0, s.lastIndexOf(" ", max - 1)).replace(/[,;:.\s]+$/, "") + "…";
  });

  eleventyConfig.on("eleventy.after", () => {
    if (site.isPlaceholderUrl) {
      console.warn(
        "\n[site] data/site.json still has the placeholder URL. Absolute URLs " +
        "(canonical, Open Graph, JSON-LD, sitemap) are wrong until you set it " +
        "or export SITE_URL. GitHub Actions sets SITE_URL automatically.\n"
      );
    }
  });

  return {
    pathPrefix: site.pathPrefix,
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
