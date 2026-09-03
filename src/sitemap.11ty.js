import { absoluteUrlFactory } from "../lib/site.mjs";

const escapeXml = (s) =>
  String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));

export default class {
  data() {
    return {
      permalink: "/sitemap.xml",
      eleventyExcludeFromCollections: true,
      layout: null,
    };
  }

  render({ collections, site }) {
    const abs = absoluteUrlFactory(site);

    // collections.all is every HTML page: robots/sitemap/llms/about all set
    // eleventyExcludeFromCollections, so they are added by hand below.
    const entries = collections.all.map((item) => ({
      loc: abs(item.url),
      priority: item.url === "/" ? "1.0" : item.url === "/certificates/" ? "0.9" : "0.8",
    }));

    // The text summaries are primary entry points for AI agents, not an
    // afterthought — list them so a crawler that only reads the sitemap finds them.
    entries.push({ loc: abs("/llms.txt"), priority: "0.7" });
    entries.push({ loc: abs("/about.txt"), priority: "0.5" });

    const urls = entries
      .map(
        ({ loc, priority }) =>
          `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${site.buildDay}</lastmod>\n    <priority>${priority}</priority>\n  </url>`
      )
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  }
}
