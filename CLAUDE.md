# CareerToAI

One project, two halves that share a spine:

- **The site** — an Eleventy static profile built to be read by machines. Source in
  `src/`, `lib/`, `scripts/`, data in `data/`, edited in GJUBoard and imported with
  `npm run import-data -- <file>`, deployed to GitHub Pages by `.github/workflows/deploy.yml`.
- **The job search** — the `job-search/` framework (vendored from
  [ai-job-search](https://github.com/MadsLorentzen/ai-job-search), MIT) plus the
  GJU German Year layer in `.claude/skills/gju-internship/`.

They are not two projects that happen to live in one repo. The site publishes the
facts the job search argues from, and the job search records the outcomes the site
eventually shows.

## The shared spine

Three files are the single source of truth. Everything else is generated from them
or points at them.

| Spine file | Owns | Generated from it |
|---|---|---|
| `data/profile.json`, `data/experience.json`, `data/projects.json`, `data/certificates.json`, `data/profile-extras.json` | Who you are | the site's pages, and `.claude/skills/job-application-assistant/01-candidate-profile.md` via `npm run profile` |
| `data/applications.csv` | Every application, one row each | `job_search_tracker.xlsx` via `npm run tracker` |
| `data/tracker-schema.json` | The tracker's columns, and the **only** status vocabulary | the workbook's columns and validation, and what every command reads/writes |

Rules that follow from that:

- **Never hand-edit a generated file.** `01-candidate-profile.md` and
  `job_search_tracker.xlsx` are outputs. Edit the JSON or the CSV and re-run the
  script; a hand edit is gone at the next build.
- **A fact that is not in `data/` does not exist.** Not on the CV, not in a cover
  letter, not in an interview answer. If a fact surfaces mid-conversation, write it
  into `data/` in the same turn, then re-run `npm run profile`.
- **One status vocabulary.** `data/tracker-schema.json` → `statuses`. Anything else
  is a bug, including a status you think reads better.
- **Array order is publication order.** Education, experience, projects,
  certificates and links publish in the order the JSON lists them; `lib/content.mjs`
  re-sorts nothing on load. Reordering an array is a real edit to the profile, so
  never rearrange one incidentally. `byDateDesc` is there when date order is
  wanted explicitly, and the GJUBoard editor reorders by dragging.
- **The student's files stay out of git too.** `src/assets/Student-data/student.json`, the two
  base `.docx` files and everything in `Student-data/tailored/` (the per-application CV and
  cover letter) hold contact details, so they are gitignored and never published. The workspace
  reads them locally to score jobs and tailor documents (the search itself reads the field of study from `data/profile.json`, then from `student.json`); the AI provider is
  chosen in `.env` (`LLM_PROVIDER`, see `.env.example`). The phone number lives in
  `data/profile-private.json`, also gitignored: never put it in `profile-extras.json`,
  because that file and the generated candidate profile are committed.
- **The tracker stays out of git.** It holds employers' contact names, e-mails and
  phone numbers, and this repo publishes a public site. `data/applications.csv`
  and `job_search_tracker.xlsx` are gitignored; `data/applications.example.csv`
  carries the header so the schema is still
  reviewable in a diff.

## One of everything

The repository keeps a single set of project files at the root: one `README.md`,
`CLAUDE.md`, `AGENTS.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`,
`SETUP.md`, `LICENSE`, `package.json`, `package-lock.json`, `.gitignore`,
`.env.example`, one `.claude/` and one `.github/`. There is no second copy of any
of them inside `job-search/`.

`.claude/` holds all the workflow text — commands, skills, settings — and every
file in it carries a `PROJECT SPINE` header naming the three shared files above.
Paths written in those files are relative to the repository root, so the
framework's own code reads as `job-search/tools/…`, `job-search/documents/…`,
`job-search/.agents/skills/…`.

- `/apply`, `/rank` and `/outcome` are GJU forks: rewritten for the German Year
  rules, not adaptations of upstream's text.
- Every other command is upstream's text with an **In this project** section at the
  end carrying the local overrides. Keep new project-specific rules in that
  section, so the difference from upstream stays legible.
- `01-candidate-profile.md` is generated. Do not edit it.

`job-search/` now holds code only: `tools/`, `tests/`, `templates/`, `cv/`,
`cover_letters/`, `documents/`, `company_research/`, `job_scraper/`, `upskill/`,
`salary_lookup.py`, and the six portal CLIs under `.agents/skills/*/cli/`. Those
CLIs keep their own `package.json` — they are independent Bun packages, not part of
the root npm project.

**One consequence to know:** merging the two `.claude/` trees means upstream can no
longer be re-synced file-for-file. `.github/workflows/upstream-watch.yml` still
reports what changed upstream, but adopting a change is now a manual port into the
root tree.

## Commands

| Command | Does |
|---|---|
| `npm run editor` | Serves the local `/workspace/` and application APIs; `/editor/` offers migration of old browser drafts to GJUBoard |
| `npm run profile` | Regenerate the framework's candidate profile from `data/*.json` |
| `npm run profile:check` | Fail if that file is stale (what CI should run) |
| `npm run tracker` | Re-render `job_search_tracker.xlsx` from `data/applications.csv` |
| `npm run skills:harvest` | Pull advert requirements out of the tracker into `data/skill-pool.json` |
| `npm run build` / `npm run serve` | Build or serve the site |

`npm run tracker` is safe to re-run: the rows live in the CSV, and the workbook is a
rendering of them.

## The workspace page

`/workspace/` is the student-facing front end. Under `npm run editor` it reads
`data/applications.csv` live, runs the four deterministic npm tasks above through
`POST /__editor/run` (a fixed task map — the browser names a key, never a
command), and appends tracker rows through `POST /__editor/tracker`. On the
published site it is static and says so: nothing runs and the tracker is empty.

Applying (`POST /__editor/apply`) picks a route per row (`applicationRoute`): an employer
e-mail address is sent with the tailored CV and cover letter attached
(`lib/send-email.mjs`: the Gmail API with a send-only token, set up once by `npm run gmail:auth`,
else SMTP; credentials in the gitignored `.env`); a web form with tailored files is
filled in a local Chromium that uploads them from disk (`lib/local-browser.mjs`); a web form
without them falls back to the remote Firecrawl/TinyFish tool, which cannot upload local files.
All three run only after the preview is confirmed and never retry on their own.

A search (`POST /__editor/search`, body `{ mode, sources, useProfile }`) looks for internships anywhere in Germany, in German and
English, and the student chooses two things. **What:** `mode: "profile"` (default) is the student's own major, the field of study
of the profile, turned into job-title words by `lib/search-focus.mjs` from `data/majors.json` (the 22 GJU majors; a field it does not list is
searched by its own name plus title words from the AI provider when one is set up); `mode: "global"` is every field once (generic
internship words plus one word per area). **With what:** `sources` switches Claude (Indeed, and StepStone and Arbeitsagentur through Apify),
NVIDIA NIM and the free job sources on or off, so each student's own keys decide the cost; no source is capped here. The same plan feeds the
free sources (`engineKeywords`, at most 8 words of at least 5 letters, because some free sources match a keyword anywhere in the text),
Indeed (`indeedSearches`, at most 16), Apify (the first 6, 10 in global mode) and the NVIDIA NIM model (`nimBrief`). The old IT lists
(`ENGINE_KEYWORDS`, `INDEED_SEARCHES`, `APIFY_SEARCHES`, `DEFAULT_FOCUS` in `lib/nim-agent.mjs`) are only the defaults of those functions.
`GET /__editor/search-plan?mode=` shows the plan without searching or calling an AI. It adds only what is new and can count: not in the
workbook yet (by link, or by company and title), a known posting date in the last `NEW_DAYS` (7) days (the one exception is a NIM site lead, below), an internship the GJU check does
not fail (`newEligible` in `lib/application-flow.mjs`; its `field` test defaults to `isIT` but the workspace passes `null`, so every field counts).
No posting is dropped for a low Fit: the AI scores up to `MAX_SCORED` (100) new postings, the rest get the built-in score
(`scoreJobMatch` with the major's words and skills and `keepLow`, so a posting that matches nothing still gets a low number), and the board
sorts by it. A new row gets the duration, pay and language levels the advert states (`lib/board-extract.mjs`),
blank when it states none. The GJU check (`gjuVerdict`) is the guideline's: an internship of 20 weeks to 6 months, in
Germany or a country approved as easily; pay and language level are not rules (unpaid is allowed, pay is often settled
at the interview, employers take students at their level), and the AI scoring is told to ignore language too. Besides
the JobSearchEngine it searches Indeed through the Indeed connector of the student's Claude account:
`lib/indeed-agent.mjs` runs `claude -p` in `INTERNSHIPS_DIR` with only ToolSearch and the two Indeed tools allowed
(`dontAsk`), `--setting-sources project` so the user's plugins and hooks stay out, and no `ANTHROPIC_*` in its env
(connectors load only with the claude.ai login). Postings are parsed from the tool results, never from the model's text. A Cowork pre-search saved as `indeed-presearch.md` in that folder (the connector's raw results) is merged in; a missing or old file is fine (the laptop may have been off) and a failed live run falls back to it.
Indeed rows are for the private tracker only; never feed them to the public board. Claude searches only what nothing else reaches (Indeed, and StepStone and Arbeitsagentur through its Apify connector, both with `--model sonnet`). An NVIDIA NIM model (`lib/nim-agent.mjs`, model and key from `.env`) searches LinkedIn and the other boards through plain search APIs (Tavily, Exa, Firecrawl, the Arbeitnow API) and the MCP search tools allowlisted in `MCP_TOOLS` (today TinyFish `search`, through the MCP client `lib/antigravity-mcp.mjs` and the servers of `~/.gemini/config/mcp_config.json`, opened only when `TINYFISH_API_KEY` is set; never an MCP tool that opens a page, runs an agent or buys data; the claude.ai connectors Indeed and Apify load only in `claude -p`, so NIM cannot use them) so Claude spends no tokens there; it reads snippets only, never opens a page, never searches Indeed, takes dates from the tool results by code, and its rows are unverified leads. **Site sweep:** the model picks what it likes, so after its loop `sweepSites` searches each of the 24 `NIM_SITES` that has no dated, in-window, GJU-passing, not-yet-known posting on its own (what the model's tools already returned first, free; then Arbeitnow's feed, Exa, Tavily, Firecrawl, TinyFish, each limited to that site, at most 3 sites at once, two queries per engine, 10 calls per site, one retry after a 429, 150 s in all) and keeps ONE posting per site: a dated one when any engine finds it, else a **site lead** (`site_lead: true`, a blank `date_posted`, `data_source` ending "no posting date"). A lead is never dated by the day it was found, `newEligible` takes it without a date but still applies the known check and the GJU check, and the shortlist shows it as *Date unknown* in the "Last 7 days" view for the week after `date_found`. Only an individual posting page of that very site whose title says internship counts (`isIndividualPosting`, then `looksLikePosting`, which keeps category pages, listings and advice articles out by title and address, then `gjuVerdict`), a date after tomorrow is dropped as no posting date, nothing is opened, and the employer and city are read off the row's own title and snippet by one more model call and kept only when that text states them. The search says how many sites have a post and names those with none (measured live on 2026-11-09: 16 of 24; the other eight show a search engine only category, company-list, event or filter pages, or nothing, and the sweep takes none of those for a post). The search tags every row with `data_source`, and the board derives *Searched by* (Claude, NVIDIA NIM, Search APIs) from it, with *Site* and *Posted* (default: last 7 days) filters and Fit as a percentage. The shortlist (`#flow-review`) is
the old private board page moved into the workspace: its hero with count tiles, its filter panel and its internship list
(`src/assets/workspace-board.js`, the dropdown in `board-combo.js`, the look in `board.css`, every class and token
prefixed `gb-`), fed from the tracker rows. The filters also drive the spreadsheet views (Shortlist essentials, All
columns, …), and *Who applies* takes the filtered rows. The board dates a row by its posting date only, never by the day
it was found; the one row without a date it still shows as new is a NIM site lead (`lead` in `toPosting`), for the week after it was found.

Every request to the editor server goes through `lib/local-guard.mjs`: its own address only (no DNS rebinding),
GET and POST only, no POST from another site, no `/__editor/` request started by another site. Keep new routes
behind it, and serve private files (the tracker, the student's files) from this server only,
never from a second one such as `python -m http.server`, which also listens on every network interface by default.

The public GJU board is a separate project. Its page and data live in the sibling repo `../GJUBoard`
(static site, no keys, internships only), whose remote is the **public** GitHub repo
`Hamza928505/GJUYearKit` (branch `main`; GitHub Pages stays off, the host is still to be chosen), so
`npm run board:search -- --publish` pushes the day's data to a public place. The only part in this repo is the private runner, `scripts/board-search.mjs`
with `lib/board-*.mjs`: it uses the keys and MCP config here, never reads the student's tracker or
profile, and writes derived facts only. It searches one area and eight sites a day with the credit-based tools, but
only sites that `data/source-access-policy.json` marks `permitted` (`lib/source-policy.mjs`): today none is, so
that search is paused. The workspace search no longer searches job sites itself: it asks the JobSearchEngine
(`../JobSearchEngine`, `lib/engine-search.mjs`), whose results from free APIs and feeds are used as they are and whose
search-engine leads for restricted sites become unverified rows, nothing opened. The private board page
(`board:preview`, `.board-preview/`) is gone: its hero, filters and list are the workspace's shortlist now. The public
board takes only sources whose terms allow public display (`board:search -- --sources=engine`, which asks the engine for
those sources alone), and every run first drops whatever the policy no longer allows (`publicPostingRule`, day files
included). It takes a posting only with a known posting date inside the run's window (`absorb` in `lib/board-run.mjs`):
never date a posting by the day it was found, because an old advert then looks new. The public board shows link-only search leads only from sites whose policy entry has `publicLeads: true`; never add that flag without reading the site's terms **and imprint** (a second reading found clauses against it on 7 of 10 sites). Never mark a site `permitted` without quoted evidence from its terms. A
second, free source for the Bundesagentur für Arbeit's job board is built (`lib/board-source-ba.mjs`) but **off by
default and not to be switched on for the public board**: the agency's terms of use forbid robots and reading content
out of the portal through interfaces (section 2a(3)), so it needs the agency's permission first
(`{"arbeitsagentur": {"enabled": true}}` in `data/board-config.json`, then `--sources=arbeitsagentur`). Its rotation
state and credit log are the git-ignored
`data/board-state.json` and `data/board-run-log.jsonl`. `npm run board:demo` builds a preview of the
page with invented sample internships; `npm run board:vendor` rebuilds the page's vendored libraries.

`data/gju-rules.json` is a fourth shared file in the same spirit as the spine:
the 20-week minimum, the 6 recognised months, the country table and the 861 EUR/month
figure are written once there, and the workbook formulas and the workspace search's GJU
check both read them.

`data/majors.json` is a fifth: the 22 GJU majors with their German and English job-title words (the first words matter most), their
skills, and one word per area for the global search. `lib/search-focus.mjs` is the only reader. Keep every word at least 5 letters (a short
word such as KI would match "Kinder" in the free sources). A student whose profile has no field of study must import their GJUBoard export
(`npm run import-data -- <file>`) before a search by major can run; the global search needs nothing.

## For a GJU German Year internship

The `gju-internship` skill outranks the general job-application skill. Its
eligibility rules are hard gates — the 20-week minimum, approved countries — not
preferences to weigh against a good score. Pay is not one: unpaid is allowed, and
861 EUR/month only matters for a visa extension. The rules
themselves are in `src/assets/gy-internships/`, which is reference material and is
never rewritten.
