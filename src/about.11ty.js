// Identical content to /llms.txt. Some agents probe /about.txt by convention,
// so serving both costs nothing and removes a guess.
import { buildProfileText } from "../lib/plaintext.mjs";
import { absoluteUrlFactory } from "../lib/site.mjs";

export default class {
  data() {
    return {
      permalink: "/about.txt",
      eleventyExcludeFromCollections: true,
      layout: null,
    };
  }

  render({ profile, certificates, site }) {
    return buildProfileText({ profile, certificates, site, abs: absoluteUrlFactory(site) });
  }
}
