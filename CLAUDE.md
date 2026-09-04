# CareerToAI

One project, two halves that share a spine:

- **The site** — an Eleventy static profile built to be read by machines. Source in
  `src/`, `lib/`, `scripts/`, data in `data/`, edited through `/editor/`
  (`npm run editor`), deployed to GitHub Pages by `.github/workflows/deploy.yml`.
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
| `data/profile.json`, `data/experience.json`, `data/certificates.json`, `data/profile-extras.json` | Who you are | the site's pages, and `.claude/skills/job-application-assistant/01-candidate-profile.md` via `npm run profile` |
| `data/tracker.csv` | Every application, one row each | `internship-tracker.xlsx` via `npm run tracker` |
| `data/tracker-schema.json` | The tracker's columns, and the **only** status vocabulary | the workbook's columns and validation, and what every command reads/writes |

Rules that follow from that:

- **Never hand-edit a generated file.** `01-candidate-profile.md` and
  `internship-tracker.xlsx` are outputs. Edit the JSON or the CSV and re-run the
  script; a hand edit is gone at the next build.
- **A fact that is not in `data/` does not exist.** Not on the CV, not in a cover
  letter, not in an interview answer. If a fact surfaces mid-conversation, write it
  into `data/` in the same turn, then re-run `npm run profile`.
- **One status vocabulary.** `data/tracker-schema.json` → `statuses`. Anything else
  is a bug, including a status you think reads better.
- **The tracker stays out of git.** It holds employers' contact names, e-mails and
  phone numbers, and this repo publishes a public site. `data/tracker.csv` is
  gitignored; `data/tracker.example.csv` carries the header so the schema is still
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
| `npm run editor` | Serves `/editor/` and `/workspace/` locally — the only mode where they can write files or run tasks |
| `npm run profile` | Regenerate the framework's candidate profile from `data/*.json` |
| `npm run profile:check` | Fail if that file is stale (what CI should run) |
| `npm run tracker` | Re-render `internship-tracker.xlsx` from `data/tracker.csv` |
| `npm run skills:harvest` | Pull advert requirements out of the tracker into `data/skill-pool.json` |
| `npm run build` / `npm run serve` | Build or serve the site |

`npm run tracker` is safe to re-run: the rows live in the CSV, and the workbook is a
rendering of them.

## The workspace page

`/workspace/` is the student-facing front end. Under `npm run editor` it reads
`data/tracker.csv` live, runs the four deterministic npm tasks above through
`POST /__editor/run` (a fixed task map — the browser names a key, never a
command), and appends tracker rows through `POST /__editor/tracker`. On the
published site it is static and says so: nothing runs, the tracker is empty, and
only the GJU eligibility checker works, because that is arithmetic in the
browser against `data/gju-rules.json`.

`data/gju-rules.json` is a fourth shared file in the same spirit as the spine:
the 20-week minimum, the country table and the 861 EUR/month threshold are
written once there, and both the workbook formulas and the checker read them.

## For a GJU German Year internship

The `gju-internship` skill outranks the general job-application skill. Its
eligibility rules are hard gates — the 20-week minimum, approved countries, the
861 EUR/month threshold — not preferences to weigh against a good score. The rules
themselves are in `src/assets/gy-internships/`, which is reference material and is
never rewritten.
