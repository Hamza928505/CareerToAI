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

  render({ profile, certificates, experience, projects, site }) {
    return buildProfileText({ profile, certificates, experience, projects, site, abs: absoluteUrlFactory(site) });
  }
}
