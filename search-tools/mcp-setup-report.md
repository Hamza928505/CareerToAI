# MCP and search-tool setup report

Checked on 2026-10-11. Everything marked *verified* was run and its output read; everything else
says why not.

## Environment

| | |
|---|---|
| Client | Claude Code 2.1.296 (this session). Codex CLI is also installed, but its config was not touched. |
| Other MCP configs | Antigravity (`~/.gemini/config/mcp_config.json`: exa, firecrawl, graphify, tavily, tinyfish), used by the project's own search code. Not touched. |
| OS | Windows 11 (10.0.26200), Git Bash and PowerShell |
| Node / npm | 22.13.1 / 10.9.2 (`@playwright/mcp` 0.0.83 needs Node ≥ 18) |
| Python | 3.13.3, venv at `search-tools/.venv` |

`~/.claude.json` was backed up before any change. Afterwards no top-level key was lost, no
project's MCP servers changed, and the existing `headroom` server is unchanged.

## Summary

| Tool | Installed | Connected | Free | API key required | Verification result |
|---|---|---|---|---|---|
| Parallel Search MCP | Yes, user scope (`parallel-search`) | Yes | Yes (anonymous, lower rate limits) | No | **Verified**: 2 tools (`web_search`, `web_fetch`); docs search returned docs.parallel.ai |
| Exa MCP | Already present as `claude.ai Exa`; not re-added | Yes | Yes (anonymous, rate-limited) | No | **Verified**: 2 tools (`web_search_exa`, `web_fetch_exa`); docs search returned exa.ai/docs |
| Playwright MCP | Yes, user scope (`playwright`) | Yes | Yes | No | **Verified**: 25 tools; opened demo.playwright.dev/todomvc ("React • TodoMVC") and closed it |
| Python packages (6) | Yes, in `search-tools/.venv` | n/a | Yes | No | **Verified**: all import; `pip check` clean |
| Arbeitnow API | Client `arbeitnow.py` | Yes | Yes | No | **Verified**: 1 request, 200 OK, 325 jobs on page 1, pagination by `?page=`; offline filter check passes |
| JobSpy (`python-jobspy`) | Yes, 1.3.0 | n/a | Yes | No | **Import verified only.** Collection is off; never run |
| JobSpy MCP server | **No** | No | Yes | No | **Skipped**: shell-injection risk (below) |
| Backinjob RSS | Feed parsing via `feedparser` | Yes | Yes | No | **Verified**: `rss/jobs.xml` is RSS 2.0 with 500 entries; 21 feeds listed |
| Firecrawl MCP | Not added to Claude Code (already in the Antigravity config) | Keyless endpoint: yes | Keyless: yes (daily limits). Key: 1,000 credits/period | Keyless: no | **Verified**: keyless endpoint lists 3 tools; key valid, 910/1000 credits before and after (none used) |

## MCP servers

### Parallel Search MCP

- `claude mcp add --scope user --transport http parallel-search https://search.parallel.ai/mcp`
- `claude mcp list`: `✔ Connected`. Via the MCP SDK: connected in about 0.5 s and lists `web_search`
  (needs `objective` and `search_queries`) and `web_fetch` (`urls`, up to 20).
- Test: `web_search` with objective "Parallel Search MCP documentation". The first result was
  `https://docs.parallel.ai/integrations/mcp/search-mcp.md`.
- Limits: free anonymous use "at lower rate limits"; no figures published. Anonymous searches run in
  `fast` mode, overrides are ignored, and output is capped at about 25,000 characters per call.
  A key only raises limits; a `402` would mean no credits. No key was added.

### Exa MCP

- **Not re-added**: `claude mcp list` already shows `claude.ai Exa: https://mcp.exa.ai/mcp ✔ Connected`
  (the claude.ai connector). A second user-scope `exa` would duplicate it.
- Via the MCP SDK (anonymous): about 0.65 s; tools `web_search_exa` (needs `query` **and**
  `objective`) and `web_fetch_exa`.
- Test: `web_search_exa` "Exa MCP server documentation". The first result was
  `https://exa.ai/docs/reference/exa-mcp`.
- Limits: "Free rate-limited usage without sign-in or API key"; a `429` means the free limit is hit.
  `web_search_advanced_exa` must be opted in; `agent_run` is usage-based and needs sign-in. Neither
  was turned on.

### Playwright MCP

- `MSYS_NO_PATHCONV=1 claude mcp add --scope user playwright -- cmd /c npx -y @playwright/mcp@latest`
- **Error on the first attempt:** Git Bash rewrote `/c` to `C:/`, which registered `cmd C:/ npx …`.
  That entry was removed and re-added with path conversion off. `claude mcp get playwright` now shows
  `cmd /c npx -y @playwright/mcp@latest` and `✔ Connected`.
- Test (headless, isolated profile): `browser_navigate` to `https://demo.playwright.dev/todomvc/`
  returned the page title "React • TodoMVC", then `browser_close`. Playwright writes snapshots to its
  working folder, so `.playwright-mcp/` is now gitignored and the verify script runs it in the temp
  folder.
- Note: `@latest` fetches whatever is newest at each start. Pin a version
  (`@playwright/mcp@0.0.83`) if you want it to stay fixed.
- Scope of use: public pages and demo pages only. It must not log in, solve CAPTCHAs or read sites
  whose policy entry is `prohibited` or `unknown`.

### Not installed

**JobSpy MCP server** (`borgius/jobspy-mcp-server`, 117 stars, last push 2026-03-13, no LICENSE file
although `package.json` says MIT). I read the source and did not install it:

- `src/tools/search-jobs.js` builds a shell string,
  ``docker run --rm jobspy --search_term "${params.searchTerm}" …``, and runs it with `execSync`. The
  zod schema accepts any string (`z.string()`), so a search term containing `"` or `$( )`, for
  example one planted in a job page the model just read, runs commands on this computer.
- The shipped `.env` sets `JOBSPY_HOST='0.0.0.0'` and `ENABLE_SSE=1`, with `app.use(cors())`, so the
  server listens on every network interface with open CORS.
- It exposes a proxy-list option, and proxy rotation is out of bounds here.

**Firecrawl in Claude Code**: optional, and already configured with your key for the project's own
code (Antigravity config). Adding it again would copy the key into `~/.claude.json`. The keyless
hosted endpoint `https://mcp.firecrawl.dev/v2/mcp` answers without a key and lists
`firecrawl_scrape`, `firecrawl_search` and `firecrawl_parse`. It was not registered, because
Parallel and Exa already cover search and fetch.

## Python

`search-tools/.venv` (Python 3.13.3): requests 2.34.2, httpx 0.28.1, feedparser 6.0.14,
pandas 3.0.6, openpyxl 3.1.5, python-dotenv 1.2.4, python-jobspy 1.3.0 (with numpy 2.5.4 and
curl_cffi 0.16.3). All seven import; `pip check`: "No broken requirements found."

python-jobspy: 1.3.0 was released on 2026-10-08, three days before this setup. The last older
release (1.1.82, July 2025) pins `NUMPY==1.26.3` and `pandas<3`, which do not install on
Python 3.13, so the current release was used as your spec asked. It depends on `curl_cffi`, which
imitates a browser's TLS fingerprint: one more reason it stays off.

## Job-specific integrations

### Arbeitnow (verified)

- `GET https://www.arbeitnow.com/api/job-board-api`: `200`, JSON `{data, links, meta}`, 325 jobs per
  page, `links.next` for pagination, fields `slug, company_name, title, description, remote, url,
  tags, job_types, location, created_at`.
- Headers: `X-RateLimit-Limit: 50`, `X-RateLimit-Remaining: 49` (window not documented),
  `Cache-Control: max-age=432000`.
- `meta.terms`: "This is a free public API for jobs, please do not abuse. I would appreciate linking
  back to the site. By using the API, you agree to the terms of service present on Arbeitnow.com".
- Terms (<https://www.arbeitnow.com/terms>): section 11 requires a link back and lets them revoke
  API access; section 2 forbids public display, copying and mirroring. Fine for a personal search,
  **not** for republishing on the public GJU board without permission.
- `arbeitnow.py`: one page by default, at most 3, stops when the rate limit runs low, filters for
  intern / Praktikum / Werkstudent / working student. One live request returned 6 student roles
  (France and Switzerland among them).

### Backinjob RSS (verified)

- 21 feeds at <https://www.backinjob.de/rss/>: `jobs.xml` plus 20 by field (`jobs_it_telekommunikation.xml`,
  `jobs_management.xml`, `jobs_ingenieure_techniker.xml` …).
- `feedparser` on `jobs.xml`: status 200, RSS 2.0, not malformed, 500 entries with `title`, `link`,
  `published`, `summary`.
- Conditions: the feed page invites subscribing in an RSS reader. `robots.txt` does not block `/rss/`.
  The AGB (01.12.2016) cover employers only and say nothing on robots or reuse, so republishing stays
  unclear. Personal reading only, at most once a day per feed.

## Sources (27 requested)

Full detail is in `data/source-access-policy.json` (read by `lib/source-policy.mjs`) and `job-sources.json`. Each site got one identified
request (`CareerToAI-setup-check/1.0`) for the homepage and `robots.txt`, and its terms page was read.
No search pages were fetched and no jobs were collected.

- **Automated reading prohibited, with evidence (8):** indeed.de (terms §21), stepstone.de (terms of
  use, 27 Apr 2022), arbeitsagentur.de (§2a(3), 08.07.2026), academics.de, kimeta.de (`robots.txt`
  `Disallow: /` for all unnamed agents), meinestadt.de (§5.2, 07.04.2026), praktikum.de, Talent.com
  (formerly neuvoo).
- **Unknown (16 live sites):** no clause either way, or terms not readable. praktika.de forbids
  reproduction without written permission.
- **Redirected:** indeed.de → de.indeed.com, monster.de → monster.com/de (the German Monster
  company has been insolvent since August 2025), neuvoo.de → de.talent.com.
- **Defunct:** jobscout24.de and letitshine.de (no DNS). **Obsolete:** jobscanner.de (invalid
  certificate, page dated January 2020).
- **Blocked to an identified bot (`403`), not bypassed:** Indeed, Monster, meinestadt,
  praktikumsstellen.de (also its `robots.txt`), and StepStone's terms page (read through Exa instead).
- **IPv6:** praktikumsstellen.de and praktikum.info timed out or reset over IPv6 from this network
  and answered over IPv4.

## Something to fix in the existing project

`lib/job-search.mjs` → `searchPlatforms()` (used by the workspace search and by
`npm run board:search` for the public board) runs `site:` searches over the 20 domains in
`SEARCH_PLATFORMS`, then live-fetches each hit with Firecrawl `firecrawl_scrape` (`maxAge: 0`)
to verify it. For Indeed, StepStone, arbeitsagentur.de, academics, kimeta, meinestadt, praktikum.de
and Talent.com, that fetch is what their terms or `robots.txt` forbid. Search results alone are
fine; the automatic fetch of the posting page is the problem. The setup did not change this code.

## Credits and payments

- No payment method was added and no paid tier turned on.
- Parallel and Exa were used anonymously; no keys were created.
- Firecrawl: 910 of 1,000 credits remaining before and after the setup (no credit used).
- Arbeitnow, Backinjob: free, one request each during the setup.
