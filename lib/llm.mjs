/**
 * One way to ask a model for JSON, whichever provider the student has a key for.
 *
 * Ollama, OpenRouter, NVIDIA NIM and GitHub Models all speak the OpenAI
 * /chat/completions dialect, so one fetch covers them; only the base URL and
 * the key differ. Anthropic keeps its SDK. Runs in the local editor server
 * only: keys come from .env and are never returned to the browser.
 */
import { Anthropic, DEFAULT_MODEL } from "./extract-certificate.mjs";

const TIMEOUT_MS = 180_000;

const PROVIDERS = {
  ollama: { baseUrl: "http://localhost:11434/v1", keyEnv: null, model: "llama3.1" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", keyEnv: "OPENROUTER_API_KEY", model: "meta-llama/llama-3.3-70b-instruct" },
  nvidia: { baseUrl: "https://integrate.api.nvidia.com/v1", keyEnv: "NVIDIA_API_KEY", model: "nvidia/nemotron-3-super-120b-a12b" },
  github: { baseUrl: "https://models.github.ai/inference", keyEnv: "GITHUB_MODELS_TOKEN", model: "openai/gpt-4.1-mini" },
};

/** The provider to use, or null when none is set up. Never includes the key in anything sent to the browser. */
export function llmConfig(env = process.env) {
  const name = (env.LLM_PROVIDER || (env.ANTHROPIC_API_KEY ? "anthropic" : "")).toLowerCase();
  if (name === "anthropic") {
    return env.ANTHROPIC_API_KEY ? { provider: "anthropic", model: env.LLM_MODEL || env.ANTHROPIC_MODEL || DEFAULT_MODEL } : null;
  }
  const preset = PROVIDERS[name];
  if (!preset) return null;
  const key = preset.keyEnv ? env[preset.keyEnv] : "";
  if (preset.keyEnv && !key) return null;
  return { provider: name, baseUrl: (env.LLM_BASE_URL || preset.baseUrl).replace(/\/+$/, ""), key, model: env.LLM_MODEL || preset.model };
}

/** The chosen provider for the Overview card: which one, whether it can run, and the model. Never the key. */
export function llmOverview(env = process.env) {
  const chosen = (env.LLM_PROVIDER || (env.ANTHROPIC_API_KEY ? "anthropic" : "")).toLowerCase();
  const config = llmConfig(env);
  return { provider: chosen, configured: Boolean(config), model: config?.model || "" };
}

/** What the browser may know: that a provider is ready and which one. */
export const llmStatus = (env = process.env) => {
  const config = llmConfig(env);
  return config ? { configured: true, provider: config.provider, model: config.model } : { configured: false, provider: null, model: null };
};

/** Pull the JSON object out of a reply that may be fenced or wrapped in chatter. */
export function extractJson(reply) {
  const text = String(reply ?? "").replace(/```(?:json)?/gi, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

async function complete(config, system, user, fetchImpl) {
  if (config.provider === "anthropic") {
    const response = await new Anthropic().messages.create({
      model: config.model, max_tokens: 8000, system, messages: [{ role: "user", content: user }],
    });
    return response.content.filter((part) => part.type === "text").map((part) => part.text).join("");
  }
  const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(config.key ? { Authorization: `Bearer ${config.key}` } : {}) },
    body: JSON.stringify({ model: config.model, temperature: 0.2, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 401 || response.status === 403) throw new Error(`${config.provider} refused the key. Check it in .env.`);
  if (!response.ok) throw new Error(`${config.provider} answered ${response.status}.`);
  const body = await response.json();
  return body.choices?.[0]?.message?.content ?? "";
}

/**
 * Ask for one JSON object and validate it with a zod schema. One retry that
 * tells the model what was wrong; after that the error is the caller's to show.
 */
export async function chatJson({ system, user, schema, config = llmConfig(), fetchImpl = fetch }) {
  if (!config) throw new Error("No AI provider is set up. Add LLM_PROVIDER and its key to .env, then restart npm run editor.");
  const prompt = `${system}\n\nReply with one JSON object and nothing else.`;
  let problem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await complete(config, prompt, problem ? `${user}\n\nYour last reply was rejected: ${problem} Reply again with only the JSON object.` : user, fetchImpl);
    const json = extractJson(reply);
    if (!json) { problem = "it was not valid JSON."; continue; }
    const parsed = schema.safeParse(json);
    if (parsed.success) return parsed.data;
    problem = `it did not match the required shape (${parsed.error.issues[0]?.path.join(".") || "root"}: ${parsed.error.issues[0]?.message}).`;
  }
  throw new Error(`The model did not return usable JSON (${problem}).`);
}
