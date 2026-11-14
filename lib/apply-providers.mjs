/**
 * The ways an approved application reaches an employer's web form, behind one function.
 *
 * Each provider takes (row, profile, options) and resolves to { status, evidence } with status "Applied",
 * "Needs input" or "Blocked", and none retries on its own. To add or swap a browser tool, add an entry to PROVIDERS;
 * nothing else in the server knows which one runs. Which one runs is the student's choice (APPLY_BROWSER, on the
 * Settings page); with no choice the route decides as before: a job with tailored files goes to this computer's
 * browser, one without goes to the remote browser.
 *
 * E-mail applications are not here: they have no form (lib/send-email.mjs).
 */
import fs from "node:fs";

import { runClaudeApplication } from "./claude-browser.mjs";
import { claudeConnectors } from "./integration-tests.mjs";
import { getApplicationCapabilities, runBrowserApplication } from "./job-search.mjs";
import { runLocalApplication } from "./local-browser.mjs";
import { gmailConfig, smtpConfig } from "./send-email.mjs";

export const PROVIDERS = {
  local: {
    label: "This computer's browser",
    about: "Fills the usual fields by rule, asks the AI provider only for free-text questions, and uploads your tailored CV and cover letter. One page forms. Can submit after your approval, or only fill.",
    run: runLocalApplication,
  },
  claude: {
    label: "Claude in a browser",
    about: "Claude (your subscription) reads each form as it is, fills it from your profile, attaches your documents and follows forms with several steps. It cannot press the final Submit: you do.",
    run: (row, profile) => runClaudeApplication(row, profile),
    fillsOnly: true,
  },
  remote: {
    label: "Remote browser (Firecrawl or TinyFish)",
    about: "A browser run by a web service through its MCP connector. It cannot read files on this computer, so it is for forms that need no upload.",
    run: (row, profile) => runBrowserApplication(row, profile),
  },
};

/** Which provider handles a web form: the student's choice, else by the route (lib/application-flow.mjs applicationRoute). */
export function webProvider(route, env = process.env) {
  const chosen = String(env.APPLY_BROWSER || "").toLowerCase();
  if (Object.hasOwn(PROVIDERS, chosen) && !(chosen === "local" && route === "remote") && !(chosen === "claude" && route === "remote")) return chosen;
  // No tailored files (route "remote"): this computer's browser and Claude both need a CV to upload, so the remote one stays.
  return route === "upload" ? "local" : "remote";
}

export const applyOnWeb = (route, row, profile, options = {}, env = process.env) => {
  const id = webProvider(route, env);
  return PROVIDERS[id].run(row, profile, options).then((outcome) => ({ ...outcome, provider: id }));
};

/** For the Settings page: each way of applying, whether it can run now, and which one web forms use. Asks the claude command and the MCP servers, so it takes a few seconds. */
export async function providerStates(env = process.env) {
  const [{ chromium }, claude, remote] = await Promise.all([
    import("playwright"),
    claudeConnectors().catch(() => ({ found: false })),
    getApplicationCapabilities().catch(() => ({ browser: { available: false } })),
  ]);
  const browser = fs.existsSync(chromium.executablePath());
  const mail = gmailConfig(env) ? "Gmail" : smtpConfig(env) ? "SMTP" : "";
  return {
    chosen: webProvider("upload", env),
    providers: [
      { id: "local", ...pick(PROVIDERS.local), ready: browser, why: browser ? "Chromium is installed." : "Chromium is not installed: run npx playwright install chromium." },
      { id: "claude", ...pick(PROVIDERS.claude), ready: browser && claude.found, why: !browser ? "Chromium is not installed: run npx playwright install chromium." : claude.found ? "The claude command and Chromium were found." : "The claude command was not found. Install Claude Code and sign in." },
      { id: "remote", ...pick(PROVIDERS.remote), ready: Boolean(remote.browser?.available), why: remote.browser?.available ? `Through the ${remote.browser.server} connector.` : "No MCP connector with a browser tool is switched on (Firecrawl or TinyFish)." },
      { id: "email", label: "E-mail", about: "For employers who ask for applications by e-mail: your message with both documents attached, sent after you approve its text.", ready: Boolean(mail), why: mail ? `Sent through ${mail}.` : "E-mail sending is not set up (see Email above)." },
    ],
  };
}
const pick = ({ label, about }) => ({ label, about });
