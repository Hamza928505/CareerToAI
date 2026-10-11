/**
 * Which job sites may be read automatically, from data/source-access-policy.json.
 *
 * Only an entry marked "permitted" (with evidence in the file) lets code fetch a site's pages.
 * "prohibited", "unknown" and a site with no entry at all are discovery-only: a search engine's
 * result (title, link, snippet) may be kept, but the posting page itself is never fetched.
 */
import fs from "node:fs";

const FILE = new URL("../data/source-access-policy.json", import.meta.url);
let cached;
const entries = () => (cached ??= JSON.parse(fs.readFileSync(FILE, "utf8")).sources);
const bare = (value) => String(value || "").toLowerCase().replace(/^www\./, "");
const hostOf = (url) => { try { return bare(new URL(url).hostname); } catch { return ""; } };

/** The policy entry for a domain or any subdomain of it (jobboerse.arbeitsagentur.de finds arbeitsagentur.de). */
export function policyFor(domain, sources = entries()) {
  const host = bare(domain);
  if (!host) return null;
  return sources.find((s) => [bare(s.domain), hostOf(s.currentUrl)].some((d) => d && (host === d || host.endsWith(`.${d}`)))) || null;
}

/** True only when the site's terms were read and permit automated reading. */
export const mayFetch = (domain, sources) => policyFor(domain, sources)?.automatedExtraction === "permitted";
