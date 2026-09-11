---
framework_version: 1.0.0
---

# Agent guidelines

One project: a machine-readable profile site, and the job-search workflow that
argues from it. Any agent runtime — Claude Code, Codex, Antigravity, Cursor,
Gemini CLI — should load the canonical specifications from the places below and
duplicate none of them.

## Single source of truth

1. **The candidate profile.**
   `.claude/skills/job-application-assistant/01-candidate-profile.md`, **generated**
   from `data/profile.json`, `data/experience.json`, `data/projects.json`,
   `data/certificates.json` and `data/profile-extras.json` by `npm run profile`. Never edit the markdown; edit
   the JSON, or use the editor (`npm run editor`). A fact that is not in `data/`
   does not belong in a CV, a letter, or an interview answer.

2. **The workflows.** `.claude/commands/` and `.claude/skills/` hold the
   step-by-step specifications for setup, scrape, rank, apply, upskill, outcome and
   interview. Treat them as the single source of truth and do not restate their
   rules elsewhere. Each carries a `PROJECT SPINE` header naming the three shared
   files.

3. **The tracker.** `data/tracker.csv`, shaped by `data/tracker-schema.json`, whose
   `statuses` list is the only status vocabulary in the repo.
   `internship-tracker.xlsx` is rendered from the CSV by `npm run tracker`.
   The CSV is gitignored — it holds employers' contact details and this repo
   publishes a public site. `data/tracker.example.csv` carries the header.

4. **Portal search skills.** `job-search/.agents/skills/*/SKILL.md`, in the portable
   Agent Skills format, each with its own Bun CLI under `cli/`. Codex and
   Antigravity discover them automatically; `/scrape` orchestrates them.

## Layout

| Path | Holds |
|---|---|
| `.claude/` | All workflow text — commands, skills, settings. One tree, no copies. |
| `data/` | The spine: profile JSON, tracker CSV, tracker schema. |
| `src/`, `lib/`, `scripts/` | The Eleventy site and its build tooling. |
| `job-search/` | The framework's code: `tools/`, `tests/`, `templates/`, `cv/`, `cover_letters/`, `documents/`, `.agents/` portal CLIs. |
| `src/assets/gy-internships/` | GJU German Year rules — reference material, never rewritten. |

Paths written in the workflow files are relative to the repository root. The six
portal CLIs under `job-search/.agents/skills/*/cli/` are independent Bun packages
with their own `package.json`; that is deliberate, and they are not part of the
root npm project.

## Two workflows, one spine

`gju-internship` handles GJU German Year internships; `job-application-assistant`
handles general applications. They read the same profile and write the same
tracker. For a German Year internship the GJU skill wins: its eligibility rules
are hard gates, not scoring inputs.
