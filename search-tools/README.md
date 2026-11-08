# Internship search tools

Free tools for finding internships, Werkstudent jobs and graduate roles in Germany, and the
rules for which job sites may be read automatically. Set up and verified on 2026-10-11
(Windows 11, Claude Code 2.1.296, Node 22.13.1, Python 3.13.3).

| File | What it is |
|---|---|
| `mcp-setup-report.md` | What was installed, how it was tested, and what failed |
| `../data/source-access-policy.json` | Per site (moved to `data/`, where the code reads it): API, RSS, whether automated reading is allowed, the evidence, what to do instead |
| `job-sources.json` | The 27 requested sites, normalised: redirects, dead domains, same operators |
| `requirements.txt` | Python packages, pinned |
| `arbeitnow.py` | Read-only client for the free Arbeitnow API |
| `verify-mcp.mjs` | Re-runs the MCP checks |

## The one rule

**Look up a site in `data/source-access-policy.json` before anything reads it automatically.**

- `prohibited`: Indeed, StepStone, Arbeitsagentur, academics, kimeta, meinestadt, praktikum.de and
  Talent.com (formerly neuvoo). Their terms or `robots.txt` forbid automated reading. Use search
  results (Parallel, Exa) to find a posting's link, then open it yourself.
- `unknown`: nothing found either way. Treat it like `prohibited` until the terms say otherwise
  or the operator agrees in writing.
- `permitted`: only the Arbeitnow API, for your own search, with a link back.

None of these tools may get around a CAPTCHA, a login, a rate limit or a `403`. No proxy
rotation, no browser impersonation, no republishing of listings.

## MCP servers (Claude Code, user scope)

Already registered. To set them up on another machine:

```bash
claude mcp add --scope user --transport http parallel-search https://search.parallel.ai/mcp
# Exa: claude.ai already provides it as "claude.ai Exa" (same endpoint). Only if you do not have that:
claude mcp add --scope user --transport http exa https://mcp.exa.ai/mcp
# Playwright. On Windows npx needs cmd /c, and in Git Bash MSYS_NO_PATHCONV=1 stops "/c" becoming "C:/":
MSYS_NO_PATHCONV=1 claude mcp add --scope user playwright -- cmd /c npx -y @playwright/mcp@latest
# macOS/Linux:
claude mcp add --scope user playwright -- npx -y @playwright/mcp@latest
```

Check them with `claude mcp list`, or run the same tests as the setup:

```bash
node search-tools/verify-mcp.mjs            # connect and list tools
node search-tools/verify-mcp.mjs --call     # plus one harmless call each (docs search, Playwright demo page)
node search-tools/verify-mcp.mjs exa        # one server only
```

New servers appear in Claude Code from the next session on. Restart it if `parallel-search` or
`playwright` is missing from `/mcp`.

## Python

```bash
python -m venv search-tools/.venv
search-tools/.venv/Scripts/python -m pip install -r search-tools/requirements.txt   # Windows
search-tools/.venv/bin/python -m pip install -r search-tools/requirements.txt       # macOS/Linux
```

The venv is gitignored.

## Arbeitnow (free API, no key)

```bash
search-tools/.venv/Scripts/python search-tools/arbeitnow.py                 # page 1, internships and Werkstudent
search-tools/.venv/Scripts/python search-tools/arbeitnow.py --pages 2 --visa true
search-tools/.venv/Scripts/python search-tools/arbeitnow.py --check         # offline self-check
```

It reads at most 3 pages and stops when the rate limit runs low. Results include France,
Switzerland and others, so filter by location yourself. Keep the Arbeitnow link with each job,
and do not republish them on the public GJU board: Arbeitnow's terms forbid public display.

## Backinjob (RSS)

Backinjob publishes 21 RSS feeds (all jobs, plus 20 by field) at <https://www.backinjob.de/rss/>
and invites people to subscribe to them. Read them for your own search, at most once a day:

```python
import feedparser
feed = feedparser.parse("https://www.backinjob.de/rss/jobs_it_telekommunikation.xml",
                        agent="CareerToAI-internship-search/1.0")
for entry in feed.entries:
    print(entry.title, entry.link, entry.published)
```

## Installed but switched off

- **JobSpy** (`python-jobspy`) is installed and nothing calls it. Most of the sites it targets
  forbid scraping, and its `curl_cffi` dependency imitates a browser's TLS fingerprint. Leave it
  off.
- **JobSpy MCP server**: not installed. See `mcp-setup-report.md` for the shell-injection problem.
- **Firecrawl**: already configured for the project's own search in the Antigravity MCP config,
  so it was not added to Claude Code a second time. A keyless hosted endpoint
  (`https://mcp.firecrawl.dev/v2/mcp`: search, scrape, parse within daily limits) exists if you
  ever want it there.
