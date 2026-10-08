/**
 * The keys and AI provider choice, edited from the workspace instead of by hand.
 *
 * Only the names listed here can be read or written, and a secret's value is
 * never sent to the browser: it learns whether a key is saved and its last four
 * characters, nothing more. Values go to .env (git-ignored) and to process.env,
 * so a change takes effect without restarting the editor.
 */
import fs from "node:fs";
import path from "node:path";

import { ROOT } from "./content.mjs";

export const PROVIDER_CHOICES = ["ollama", "openrouter", "nvidia", "github", "anthropic"];

export const FIELDS = [
  { name: "LLM_PROVIDER", group: "ai", label: "AI provider", kind: "choice", choices: PROVIDER_CHOICES, help: "Runs suggestions, job scoring and CV/letter tailoring." },
  { name: "LLM_MODEL", group: "ai", label: "Model", kind: "text", help: "Leave empty for the provider's default." },
  { name: "LLM_BASE_URL", group: "ai", label: "Base URL", kind: "text", help: "Only for Ollama on another machine or a custom endpoint." },
  { name: "OPENROUTER_API_KEY", group: "ai", label: "OpenRouter key", kind: "secret", getKey: "https://openrouter.ai/keys" },
  { name: "NVIDIA_API_KEY", group: "ai", label: "NVIDIA NIM key", kind: "secret", getKey: "https://build.nvidia.com/settings/api-keys" },
  { name: "GITHUB_MODELS_TOKEN", group: "ai", label: "GitHub Models token", kind: "secret", getKey: "https://github.com/settings/personal-access-tokens" },
  { name: "ANTHROPIC_API_KEY", group: "ai", label: "Anthropic key", kind: "secret", getKey: "https://console.anthropic.com/settings/keys" },
  { name: "FIRECRAWL_API_KEY", group: "search", label: "Firecrawl key", kind: "secret", getKey: "https://www.firecrawl.dev/app/api-keys" },
  { name: "TAVILY_API_KEY", group: "search", label: "Tavily key", kind: "secret", getKey: "https://app.tavily.com/home" },
  { name: "TINYFISH_API_KEY", group: "search", label: "TinyFish key", kind: "secret", getKey: "https://agent.tinyfish.ai" },
  { name: "EXA_API_KEY", group: "search", label: "Exa key", kind: "secret", getKey: "https://dashboard.exa.ai/api-keys" },
];

const BY_NAME = new Map(FIELDS.map((field) => [field.name, field]));
const envFile = () => path.join(ROOT, ".env");

// Keys for services this workspace has no built-in field for. The suffix keeps them to credentials:
// PATH, NODE_OPTIONS and the like can never match.
export const CUSTOM_NAME = /^[A-Z][A-Z0-9_]{1,56}_(?:API_KEY|KEY|TOKEN|SECRET)$/;
const MAX_CUSTOM = 30;

/** NAME=value pairs of .env, quotes removed. */
function readEnvFile(file) {
  const found = new Map();
  if (!fs.existsSync(file)) return found;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m) found.set(m[1], m[2].trim().replace(/^(["'])(.*)\1$/s, "$2"));
  }
  return found;
}

const isCustom = (name) => CUSTOM_NAME.test(name) && !BY_NAME.has(name);
const prettyName = (name) => name.replace(/_(?:API_KEY|KEY|TOKEN|SECRET)$/, "").toLowerCase().replace(/(^|_)(\w)/g, (_, gap, c) => (gap ? " " : "") + c.toUpperCase());

/** What the browser may see: saved or not, the value only for non-secrets, the last four characters of a secret. */
export function readSettings(env = process.env, file = envFile()) {
  const custom = [...readEnvFile(file)].filter(([name]) => isCustom(name))
    .map(([name, value]) => ({ name, group: "custom", label: prettyName(name), kind: "secret", value: env[name] ?? value }));
  return [...FIELDS.map((field) => ({ ...field, value: env[field.name] || "" })), ...custom]
    .map(({ name, group, label, kind, choices, help, getKey, value }) => ({
      name, group, label, kind, choices, help, getKey, set: Boolean(value),
      ...(kind === "secret" ? { hint: value ? `••••${value.slice(-4)}` : "" } : { value }),
    }));
}

function checked(name, value) {
  const field = BY_NAME.get(name) || (CUSTOM_NAME.test(name) ? { label: name, kind: "secret" } : null);
  if (!field) throw Object.assign(new Error(`${name} is not a setting you can change here. Other keys must be named like MY_SERVICE_API_KEY (ending in _API_KEY, _KEY, _TOKEN or _SECRET).`), { statusCode: 400 });
  if (value === null || value === "") return null;
  const text = String(value).trim();
  if (!text || text.length > 400 || /[\r\n"]/.test(text)) throw Object.assign(new Error(`${field.label} has characters that cannot be saved.`), { statusCode: 400 });
  if (field.kind === "choice" && !field.choices.includes(text)) throw Object.assign(new Error(`${field.label} must be one of: ${field.choices.join(", ")}.`), { statusCode: 400 });
  if (name === "LLM_BASE_URL" && !/^https?:\/\/\S+$/.test(text)) throw Object.assign(new Error("Base URL must start with http:// or https://."), { statusCode: 400 });
  return text;
}

/**
 * Save changes: a string sets a value, null or "" removes it. Other lines of
 * .env, comments included, stay exactly as they were. Nothing is written if any value is rejected.
 */
export function saveSettings(changes, { file = envFile(), env = process.env } = {}) {
  const wanted = Object.entries(changes || {}).map(([name, value]) => [name, checked(name, value)]);
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/) : [];
  if (lines.at(-1) === "") lines.pop();
  const known = new Set(readEnvFile(file).keys());
  const created = wanted.filter(([name, value]) => value !== null && isCustom(name) && !known.has(name)).length;
  if ([...known].filter(isCustom).length + created > MAX_CUSTOM) throw Object.assign(new Error(`You can keep up to ${MAX_CUSTOM} other keys. Remove one first.`), { statusCode: 400 });
  for (const [name, value] of wanted) {
    const at = lines.findIndex((line) => new RegExp(`^\\s*${name}\\s*=`).test(line));
    const line = value === null ? null : /[\s#]/.test(value) ? `${name}="${value}"` : `${name}=${value}`;
    if (at >= 0) { if (line === null) lines.splice(at, 1); else lines[at] = line; }
    else if (line !== null) lines.push(line);
  }
  const temporary = `${file}.${process.pid}.tmp`;
  try { fs.writeFileSync(temporary, `${lines.join("\n")}\n`); fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, { force: true }); }
  for (const [name, value] of wanted) { if (value === null) delete env[name]; else env[name] = value; }
  return wanted.length;
}
