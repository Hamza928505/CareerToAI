// Single source of truth for the deployed URL. Imported by both
// eleventy.config.mjs (needs pathPrefix at config load) and src/_data/site.js.
import { readJson, SITE_JSON } from "./content.mjs";

export function resolveSite() {
  const file = readJson(SITE_JSON);
  // SITE_URL wins over data/site.json. The GitHub Actions workflow sets it to
  // the real Pages URL, so absolute URLs and the sub-path prefix are always
  // correct without anyone hardcoding a username or repo name.
  const raw = process.env.SITE_URL || file.url;
  const url = new URL(raw);
  const pathPrefix = url.pathname.endsWith("/") ? url.pathname : url.pathname + "/";
  return {
    ...file,
    url: url.origin + url.pathname.replace(/\/+$/, ""),
    origin: url.origin,
    pathPrefix,
    isPlaceholderUrl: /TODO/i.test(raw),
  };
}

/**
 * Build an absolute-URL helper bound to a resolved site object.
 * Root-relative in, fully qualified out; absolute URLs pass through untouched.
 */
export function absoluteUrlFactory(site) {
  return (pathname) => {
    const p = String(pathname || "/");
    if (/^https?:\/\//i.test(p)) return p;
    return site.origin + site.pathPrefix + p.replace(/^\/+/, "");
  };
}
