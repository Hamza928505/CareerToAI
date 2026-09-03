import { buildProfileText } from "../lib/plaintext.mjs";
import { absoluteUrlFactory } from "../lib/site.mjs";

export default class {
  data() {
    return {
      permalink: "/llms.txt",
      eleventyExcludeFromCollections: true,
      layout: null,
    };
  }

  render({ profile, certificates, experience, site }) {
    return buildProfileText({ profile, certificates, experience, site, abs: absoluteUrlFactory(site) });
  }
}
