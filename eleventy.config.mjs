import { formatDate } from "./lib/content.mjs";
import { collectionGraph, credentialGraph, personGraph } from "./lib/jsonld.mjs";
import { resolveSite } from "./lib/site.mjs";

const site = resolveSite();

export default function (eleventyConfig) {
  // Certificate images and the stylesheet ship as-is.
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/certs": "certs" });
  // Publish the raw data too — an AI agent that would rather parse JSON than
  // HTML can fetch /data/certificates.json directly.
  eleventyConfig.addPassthroughCopy({ "data/certificates.json": "data/certificates.json" });
  eleventyConfig.addPassthroughCopy({ "data/profile.json": "data/profile.json" });

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
  // base layout, keyed off each page's `schemaType` front matter.
  eleventyConfig.addFilter("personJsonLd", (profile, certificates) => personGraph(profile, certificates, abs));
  eleventyConfig.addFilter("credentialJsonLd", (cert, profile) => credentialGraph(cert, profile, abs));
  eleventyConfig.addFilter("collectionJsonLd", (certificates, profile) => collectionGraph(certificates, profile, abs));

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
