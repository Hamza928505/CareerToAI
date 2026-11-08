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
    id: "apify",
    getKey: "https://console.apify.com/settings/integrations",
    name: "Apify",
    env: "APIFY_TOKEN",
    unit: "USD",
    // The Actors that search StepStone and Arbeitsagentur run through Claude's Apify connector but are billed to this
    // same account, so its monthly usage limit is the balance: what the plan allows minus what has been spent this cycle.
    async check(key) {
      const body = await getJson("https://api.apify.com/v2/users/me/limits", { Authorization: `Bearer ${key}` });
      const d = body.data || body;
      const total = num(d.limits?.maxMonthlyUsageUsd);
      const used = num(d.current?.monthlyUsageUsd);
      const end = Date.parse(d.monthlyUsageCycle?.endAt);
      return {
        remaining: total != null && used != null ? Math.max(0, total - used) : null,
        total,
        // The cycle ends at 23:59:59.999 UTC; the new one starts a millisecond later.
        resetsAt: Number.isNaN(end) ? "" : new Date(end + 1).toISOString().slice(0, 10),
      };
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
  // The free job APIs. None shows a balance, and a check would spend a search (Jooble's plan is 500 requests, ever),
  // so a saved key is reported as saved. `also` lists the other settings the service needs before it can answer.
  {
    id: "adzuna",
    getKey: "https://developer.adzuna.com/signup",
    name: "Adzuna",
    env: "ADZUNA_APP_KEY",
    also: ["ADZUNA_APP_ID"],
    unit: "",
    async check() { return { remaining: null, total: null, note: "Free plan: 250 searches a day. No balance is shared." }; },
  },
  {
    id: "jooble",
    getKey: "https://de.jooble.org/api/about",
    name: "Jooble",
    env: "JOOBLE_API_KEY_DE",
    unit: "",
    async check() { return { remaining: null, total: null, note: "Free plan: 500 requests per key, ever. No balance is shared." }; },
  },
  {
    id: "careerjet",
    getKey: "https://www.careerjet.com/partners/api/",
    name: "Careerjet",
    env: "CAREERJET_API_KEY",
    also: ["CAREERJET_USER_IP"],
    unit: "",
    async check() { return { remaining: null, total: null, note: "Free publisher account. No balance is shared." }; },
  },
];

export async function checkCredits(env = process.env) {
  return Promise.all(PROVIDERS.map(async (p) => {
    const base = { id: p.id, name: p.name, unit: p.unit, envName: p.env, getKey: p.getKey };
    const missing = p.env ? [p.env, ...(p.also || [])].filter((name) => !env[name]) : [];
    if (missing.length) return { ...base, status: "no-key", message: `Add ${missing.join(" and ")} to .env and restart the editor.` };
    try {
      return { ...base, status: "ok", ...(await p.check(p.env ? env[p.env] : null)) };
    } catch (e) {
      return { ...base, status: "error", message: e.name === "TimeoutError" ? "No answer in time." : e.message };
    }
  }));
}
