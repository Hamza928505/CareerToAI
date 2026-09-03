import { absoluteUrlFactory } from "../lib/site.mjs";

// The point of this project is the opposite of LinkedIn's bot-blocking, so the
// blanket "User-agent: *  Allow: /" is the rule that matters. The named agents
// below are technically redundant, but several of them are the crawlers people
// most often see blocked by default, and naming them makes the intent explicit
// to anyone (or anything) reading this file.
const AI_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "Google-Extended",
  "PerplexityBot",
  "Perplexity-User",
  "Applebot",
  "Applebot-Extended",
  "Amazonbot",
  "Bingbot",
  "DuckAssistBot",
  "meta-externalagent",
  "CCBot",
  "cohere-ai",
  "YouBot",
];

export default class {
  data() {
    return {
      permalink: "/robots.txt",
      eleventyExcludeFromCollections: true,
      layout: null,
    };
  }

  render({ site }) {
    const abs = absoluteUrlFactory(site);
    const lines = [
      "# Every crawler, indexer and AI agent is explicitly welcome here.",
      "# This site exists to be read by machines. Nothing is disallowed.",
      "",
      "User-agent: *",
      "Allow: /",
      "",
      "# Named explicitly so there is no ambiguity:",
      ...AI_AGENTS.flatMap((agent) => [`User-agent: ${agent}`, "Allow: /", ""]),
      `Sitemap: ${abs("/sitemap.xml")}`,
      "",
      "# Plain-text summary of this whole profile, for text-first agents:",
      `# ${abs("/llms.txt")}`,
      "",
    ];
    return lines.join("\n");
  }
}
