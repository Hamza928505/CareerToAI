/**
 * How many credits are left on each search/scrape key.
 *
 * Runs in the local editor server only. The keys come from .env (git-ignored),
 * go out as request headers, and are never returned: the browser gets numbers
 * and names, nothing else. Each provider is asked on its own, so one failing
 * (bad key, offline, no such endpoint) never hides the others.
 */

const TIMEOUT_MS = 8000;

async function getJson(url, headers) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 401 || res.status === 403) throw new Error("The key was refused. Check it in .env.");
  if (!res.ok) throw new Error(`The service answered ${res.status}.`);
  return res.json();
}

const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null);

const PROVIDERS = [
  {
    id: "firecrawl",
    getKey: "https://www.firecrawl.dev/app/api-keys",
    name: "Firecrawl",
    env: "FIRECRAWL_API_KEY",
    unit: "credits",
    async check(key) {
      const headers = { Authorization: `Bearer ${key}` };
      let body;
      try {
        body = await getJson("https://api.firecrawl.dev/v2/team/credit-usage", headers);
      } catch (e) {
        if (/refused/.test(e.message)) throw e;
        body = await getJson("https://api.firecrawl.dev/v1/team/credit-usage", headers);
      }
      const d = body.data || body;
      return { remaining: num(d.remainingCredits ?? d.remaining_credits), total: num(d.planCredits ?? d.plan_credits) };
    },
  },
  {
    id: "tavily",
    getKey: "https://app.tavily.com/home",
    name: "Tavily",
    env: "TAVILY_API_KEY",
    unit: "credits",
    async check(key) {
      const body = await getJson("https://api.tavily.com/usage", { Authorization: `Bearer ${key}` });
      // The key's own limit when it has one, otherwise the plan's.
      const limit = num(body.key?.limit) ?? num(body.account?.plan_limit);
      const used = num(body.key?.limit) != null ? num(body.key?.usage) : num(body.account?.plan_usage);
      return { remaining: limit != null && used != null ? Math.max(0, limit - used) : null, total: limit };
    },
  },
  {
    id: "tinyfish",
    getKey: "https://agent.tinyfish.ai",
    name: "TinyFish",
    env: "TINYFISH_API_KEY",
    unit: "USD",
    async check(key) {
      const body = await getJson("https://agent.tinyfish.ai/v1/wallet", { "X-API-Key": key });
      // A wallet balance has no plan size, so there is no bar, only the amount.
      return { remaining: num(body.available_balance), total: null };
    },
  },
  {
    id: "exa",
    getKey: "https://dashboard.exa.ai/api-keys",
    name: "Exa",
    env: "EXA_API_KEY",
    unit: "",
    // Exa has no balance endpoint, and checking the key would spend a paid search on every page load.
    async check() {
      return { remaining: null, total: null, message: "Key saved. Exa shares no balance through its API, so open your dashboard to see it." };
    },
  },
];

export async function checkCredits(env = process.env) {
  return Promise.all(PROVIDERS.map(async (p) => {
    const base = { id: p.id, name: p.name, unit: p.unit, envName: p.env, getKey: p.getKey };
    const key = p.env ? env[p.env] : null;
    if (p.env && !key) return { ...base, status: "no-key", message: `Add ${p.env} to .env and restart the editor.` };
    try {
      return { ...base, status: "ok", ...(await p.check(key)) };
    } catch (e) {
      return { ...base, status: "error", message: e.name === "TimeoutError" ? "No answer in time." : e.message };
    }
  }));
}
