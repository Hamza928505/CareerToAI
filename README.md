# AI-Readable Personal Profile & Certificate Vault

A personal profile site built so that **any AI assistant can actually fetch and read it**.
LinkedIn blocks bot traffic; this does the opposite. Every page is pre-rendered static
HTML, robots.txt welcomes every crawler by name, and the whole profile is also published
as one dense plain-text file and as raw JSON.

You fill it in through a LinkedIn-style editor at `/editor/` — name, education, about,
experience, licenses and certifications — and it autosaves in your browser as you type.
Certificates can also be read by a vision-capable Claude model, which drafts the title,
issuer, dates, description and skill tags for you to edit before publishing.

**Cost to run: nothing.** GitHub Pages hosts it free. The only thing you ever pay for is
the handful of Anthropic API tokens spent when you add a certificate, on your own machine.

---

## Table of contents

- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [The editor](#the-editor)
- [Adding a certificate from the terminal](#adding-a-certificate-from-the-terminal)
- [The API key](#the-api-key)
- [Customizing your profile by hand](#customizing-your-profile-by-hand)
- [Deploying to GitHub Pages](#deploying-to-github-pages)
- [What makes it machine-readable](#what-makes-it-machine-readable)
- [Data model](#data-model)
- [Project layout](#project-layout)
- [The job-search framework](#the-job-search-framework)
- [Troubleshooting](#troubleshooting)

---

## How it works

There are two completely separate halves, and keeping them separate is what makes the
zero-cost, no-backend constraint hold:

```
  AUTHORING (three ways in, one way out)         PUBLISHING (GitHub)
  ──────────────────────────────────────         ───────────────────
  /editor/ in your browser                       git push
    autosaves to localStorage + IndexedDB            │
    ├─ published site → Download .json               ▼
    │                   npm run import-data      GitHub Actions
    ├─ npm run editor → Save to data/  ──┐           │
    │                                    │           ├─► npm ci
  npm run add-cert -- certs-source/x.jpg │           ├─► npm run build (Eleventy)
    Claude reads it, you edit, it saves ─┤           └─► deploy _site/ to Pages
                                         │                │
  hand-editing data/*.json ──────────────┤                ▼
                                         ▼      https://you.github.io/CareerToAI
                        data/profile.json
                        data/experience.json
                        data/certificates.json
                        src/certs/*.jpg  src/media/*.jpg
                                         │
                                  git commit
```

The deployed site is nothing but static files. There is no server and no database — a
static host cannot accept writes, so publishing is always a commit. The editor is the one
page with JavaScript on it, it is marked `noindex`, and it only ever writes to your own
browser; every profile page is still pre-rendered HTML. The Anthropic API is called
**only** from your machine, never at build time and never by a visitor.

---

## Quick start

```bash
npm install          # installs Eleventy + the local authoring tools
npm run make-samples # draws placeholder images for the two sample certificates
npm run editor       # http://localhost:8081/CareerToAI/editor/
```

`npm run editor` is the one to start with: it builds the site, serves it, and opens the
editor in a mode that can write straight into the repository. If you only want to look at
the site, `npm run serve` runs the plain Eleventy dev server with live reload on port 8080.

You will see a site built from the two sample certificates in `data/certificates.json`
and the placeholder profile in `data/profile.json`. The build prints a warning listing
every field still holding a `TODO:` value.

Then:

1. Open the editor and fill in your name, about, education, experience and certifications.
2. Press **Save to data/** (or **Download .json** and run `npm run import-data`).
3. Delete anything left over from the samples, then commit and push.

---

## The editor

`/editor/` is a LinkedIn-style form for everything the site publishes: your name,
headline, location and email; an About paragraph; Education; Experience; Licenses &
certifications; links; and any extra skills. Repeatable sections have **+ Add** buttons,
and skills are entered as chips — type one and press <kbd>Enter</kbd>.

**Nothing is ever lost to a refresh.** Every keystroke is saved to this browser's
`localStorage` after a short pause, and uploaded images go into its `IndexedDB` (which,
unlike `localStorage`'s ~5MB ceiling, can hold certificate scans). The status in the
toolbar tells you when the last save landed. Both stores are private to that browser on
that device — the page uploads nothing on its own.

It runs in one of two modes, and the note under the heading tells you which:

### Local mode — `npm run editor`

The recommended way to work. A small Node server (`scripts/editor-server.mjs`, bound to
`127.0.0.1` only) builds the site, serves it on port 8081, and adds two buttons:

- **Save to data/** writes `data/profile.json`, `data/experience.json`,
  `data/certificates.json` and every uploaded image into `src/certs/` and `src/media/`,
  then rebuilds. No download, no copying files around — just commit and push afterwards.
- **Extract with AI** appears on a certificate once you attach an image. It sends that
  image to Claude and fills in *only the fields you have left blank*, so it never
  overwrites something you typed. This button exists only in local mode, because the
  API key is read from `.env` by the Node server and must never be shipped to a browser.

### Published mode — `/editor/` on the live site

The same page, deployed so you can edit from your phone. It cannot write to the
repository (no static host can), so it gives you **Download .json** instead — one file
containing all your text *and* your images. Feed it back in with:

```bash
npm run import-data -- ./careertoai-data.json
git add -A && git commit -m "Update profile" && git push
```

**Load .json** restores an export into the editor, which is also how you move your
work-in-progress between devices.

> The editor is marked `noindex, nofollow` and is left out of `sitemap.xml`. It is the
> only page on the site that runs JavaScript; every profile page is still pre-rendered
> static HTML, so nothing about AI readability changes.

> **Publishing is still a git push.** The editor writes to your browser, and in local mode
> to your working tree. Neither one deploys anything. Until you commit and push, the live
> site shows the last version you pushed.

---

## Adding a certificate from the terminal

Put the original file anywhere; `certs-source/` exists for this and is git-ignored.

```bash
npm run add-cert -- ./certs-source/aws-sa.jpg
```

What happens:

1. The image is downscaled to 1568px (as much as the model can use — anything larger just
   costs tokens) and sent to `claude-opus-5` with a schema-constrained request.
2. Claude returns the title, issuer, issue and expiry dates, credential ID, a drafted
   2–4 sentence description, 4–12 skill tags, and a verbatim transcription of every line
   of text on the certificate.
3. You are shown each field one at a time. Press <kbd>Enter</kbd> to keep it, type a
   replacement to change it, or type `-` to clear it. Skills are a comma-separated list.
4. On confirmation the entry is written to `data/certificates.json`, and a
   **1200px-wide, re-encoded, metadata-stripped** copy of the image is written to
   `src/certs/<id>.jpg`.

```
Options:
  --id <slug>     Use this id instead of one derived from the title + issue year.
                  Passing an existing id updates that entry in place.
  --image <file>  Use this file as the published image instead of the source.
                  Use it for PDFs when pdftoppm is unavailable, or to publish a
                  cropped version with personal details removed.
  --model <id>    Override the extraction model (default: claude-opus-5).
  --yes, -y       Skip the interactive review and accept the draft as-is.
  --help
```

### What gets published, and what does not

The full-resolution original **never enters the repo**. `certs-source/` is in
`.gitignore`, and the script writes only a downscaled JPEG re-encoded through sharp,
which drops EXIF (so no GPS coordinates, camera serials or editing history ship with it).

That is a mitigation, not a guarantee. If a certificate has a licence number, national ID
or home address printed on it, **crop or redact it before adding it** — at 1200px wide,
large print is still perfectly legible. Then pass the redacted file, or use
`--image redacted.jpg` to keep the clean copy for the model while publishing the safe one.

### PDFs

PDFs are sent to Claude directly — it reads them natively, no conversion needed. For the
*published image*, the script shells out to `pdftoppm` (from poppler-utils) to render page 1.

If `pdftoppm` is not on your PATH, the script says so and publishes the PDF itself
instead, linked from the certificate page. **A published PDF is served at full fidelity**,
so redact it first, or supply a display image with `--image`:

```bash
npm run add-cert -- ./certs-source/coursera.pdf --image ./certs-source/screenshot.png
```

Installing poppler: `brew install poppler` (macOS), `apt install poppler-utils` (Debian/Ubuntu),
`winget install oschwartz10612.Poppler` or `choco install poppler` (Windows).

### Editing or removing a certificate

Easiest in `/editor/`. Otherwise `data/certificates.json` is a plain array — edit it by
hand any time. Re-running `add-cert` with `--id <existing-id>` re-extracts and overwrites
that entry. To remove a certificate, delete its object from the array and its image from
`src/certs/`.

> `npm run import-data` and the editor's **Save to data/** button both **replace**
> `data/profile.json`, `data/experience.json` and `data/certificates.json` wholesale — an
> export is the complete picture, not a patch. If you added a certificate with
> `add-cert` in the terminal, load the current state into the editor before saving over
> it, or the terminal-added entry will be dropped.

---

## The API key

Copy the example file and add your key from <https://console.anthropic.com/>:

```bash
cp .env.example .env
```

```
ANTHROPIC_API_KEY=sk-ant-...
```

> **The key must never reach the published site.**
>
> - `.env` is in `.gitignore`. Do not remove that line, and do not commit the file.
> - The key is read **only** by `scripts/add-cert.mjs`, which runs on your machine.
> - The build (`npm run build`) never reads it. No template, no data file, and no
>   client-side script references it, so it cannot be inlined into `_site/`.
> - GitHub Actions never needs it — CI only runs Eleventy over JSON that is already
>   in the repo. Do **not** add it as a repository secret; there is nothing to use it.
>
> If you ever suspect the key was committed, revoke it in the Anthropic console
> immediately. Rewriting git history does not un-publish a pushed secret.

---

## Customizing your profile by hand

`/editor/` is the easy path; this is what it writes. Everything about you lives in
`data/profile.json`:

| Field       | Notes |
|-------------|-------|
| `firstName`, `lastName` | Joined into the `<h1>`, every `<title>`, and schema.org `Person.name`. |
| `headline`  | One line under your name. Also appended to the home page `<title>`. |
| `bio`       | 2–4 sentences of plain prose. This is the single most-quoted piece of text when an AI summarizes you — write it as fact, not marketing. |
| `location`  | Free text, e.g. `"Amman, Jordan"`. |
| `email`     | Rendered as a `mailto:` link and included in JSON-LD and `/llms.txt`. Leave the `TODO:` value in place to publish no email at all. |
| `pronouns`  | Optional; shown on the profile when set. |
| `jobTitle`, `worksFor` | Optional. Left blank, they fall back to whichever Experience entry has no end date, so your current role only has to be typed once. |
| `education` | Array of `{ school, industry, degree, fieldOfStudy, startDate, endDate, description }`. Emitted as schema.org `alumniOf`. An entry whose `school` is still a `TODO:` value is dropped. |
| `links`     | `{ "label", "url" }` pairs, rendered with `rel="me"` and emitted as `sameAs`. Any URL containing `TODO` is dropped from the build with a warning. |
| `skills`    | Only skills **not** already implied by a role or certificate. The site unions this with the skills on every Experience entry and every certificate, deduplicates case-insensitively, and sorts by how many entries evidence each one. |

`data/experience.json` is a separate array — one object per position:

| Field | Notes |
|---|---|
| `id` | URL-safe slug, derived from title + organization. |
| `title`, `organization` | Job title and employer. |
| `employmentType`, `location` | Optional, e.g. `"Full-time"`, `"Remote"`. |
| `startDate`, `endDate` | `YYYY-MM` (or `YYYY-MM-DD` / `YYYY`). **An empty `endDate` means the role is current** — it renders as "– Present" and drives the `jobTitle` fallback. |
| `description` | Free prose about the role. |
| `skills` | Feeds the role's own list and the aggregated profile list. |
| `attachmentImage` | Optional image under `/media/`, published the same way certificate images are. |

Any string field left starting with `TODO:` is treated as unset: it is omitted from the
page, the JSON-LD and the plain-text summary rather than published as a placeholder.
Delete a field entirely if you never want it.

To change the look, edit `src/assets/style.css`. It is presentation only — every fact on
the site is in the HTML, so a text-only reader loses nothing by ignoring it.

---

## Deploying to GitHub Pages

### One-time setup

1. **Create the repository and push.** The workflow triggers on pushes to `main`.

   ```bash
   git init
   git add -A
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

   Make sure `package-lock.json` is committed — the workflow runs `npm ci`, which requires it.

2. **Turn on Pages with the Actions source.** In the repository: **Settings → Pages →
   Build and deployment → Source**, choose **GitHub Actions** (*not* "Deploy from a
   branch"). This is the only manual step, and nothing deploys until you do it.

3. **Push again, or run the workflow manually** from the **Actions** tab
   (*Build and deploy to GitHub Pages* → *Run workflow*). Watch it go green; the
   deployed URL is printed in the `deploy` job summary.

After that, every push to `main` rebuilds and republishes automatically.

### About the site URL

You do not need to hardcode your URL. `actions/configure-pages` reports the real deployed
base URL, the workflow passes it to the build as `SITE_URL`, and the build derives from it:

- absolute URLs for `<link rel="canonical">`, Open Graph, JSON-LD and `sitemap.xml`
- the sub-path prefix for every internal link, so a project site served from
  `/<repo>/` works without any extra configuration

`data/site.json` only matters for local previews with correct absolute URLs:

```bash
SITE_URL="https://you.github.io/CareerToAI/" npm run build
```

Set `url` there once and the build stops warning about the placeholder.

### Custom domain

Add a `CNAME` file containing your domain to `src/` (Eleventy copies it through — add
`eleventyConfig.addPassthroughCopy("src/CNAME")` to `eleventy.config.mjs`), set the domain
under **Settings → Pages**, and the workflow's `SITE_URL` picks it up automatically on the
next run.

> **robots.txt on a project site.** Crawlers only read `robots.txt` at the domain root.
> On `you.github.io/<repo>/` it is served at `/<repo>/robots.txt`, which they will not
> look for. This costs you nothing — the file's whole purpose here is to *allow*
> everything, which is already the default — and every page additionally carries an
> explicit `<meta name="robots" content="index, follow, …">` tag that works anywhere.
> To have the file itself honoured, use a custom domain or name the repository
> `<your-username>.github.io`.

---

## What makes it machine-readable

This is the part that matters, so it is deliberately over-provisioned:

- **Content is in the HTML.** Eleventy renders the profile at build time. It runs no
  JavaScript — not one `<script>` tag beyond the JSON-LD data block. An AI tool that
  fetches raw HTML without executing JS gets everything in a single request. (`/editor/`
  is the one exception: it is an authoring tool, it is `noindex`, and it publishes
  nothing.) Certificate transcriptions sit inside `<details>` elements, so they are
  collapsed on screen but fully present in the markup.
- **`/llms.txt` and `/about.txt`** — the entire profile as one dense plain-text document:
  bio, contact, education, every position with dates and skills, the complete skill list
  (both as bullets and as one comma-separated line), and every certification with issuer,
  dates, credential ID, skills, description and the transcribed certificate text. One
  fetch answers "what do you know about this person".
- **One JSON-LD graph in the `<head>`** — schema.org `Person` carrying `hasCredential`
  (one `EducationalOccupationalCredential` per certificate, defined inline in the same
  graph), `alumniOf` (one `EducationalOrganization` per education entry) and
  `hasOccupation` (one `Occupation` per role, with employer, dates and skills). Every
  `@id` resolves to a fragment defined in the same document, and each one matches a real
  `id=` anchor in the HTML.
- **Raw JSON at `/data/certificates.json` and `/data/profile.json`** for agents that would
  rather not parse anything.
- **A fragment per credential** at `#credential-<id>` on the profile page, so a single
  certification can still be linked to directly. There is no separate page per credential
  — the whole profile is one document.
- **Semantic HTML** — `<article>`, `<section aria-labelledby>`, real heading hierarchy,
  `<dl>` for facts, `<ul>` for skills, and `<time datetime="…">` for every date.
- **Complete meta coverage** — descriptive `<title>`, `<meta name="description">`,
  canonical link, Open Graph and Twitter card tags, all computed from the real data
  rather than hand-copied.
- **A permissive `robots.txt`** that allows `*` and then names GPTBot, ClaudeBot,
  PerplexityBot, Google-Extended, Applebot-Extended, CCBot and a dozen others explicitly,
  plus a `sitemap.xml` listing every page including the plain-text summaries.

### Checking it worked

Ask an assistant to fetch `https://you.github.io/<repo>/llms.txt` and summarize it. Or:

```bash
curl -s https://you.github.io/<repo>/ | grep -c "<h1>"       # content is in the raw HTML
curl -s https://you.github.io/<repo>/llms.txt | head -40
```

Paste the profile URL into Google's Rich Results Test to validate the JSON-LD.

---

## Data model

`data/certificates.json` is an array of objects. Only `id` and `title` are strictly
required; everything else degrades gracefully when empty.

```json
{
  "id": "aws-certified-solutions-architect-associate-2024",
  "title": "AWS Certified Solutions Architect – Associate",
  "issuer": "Amazon Web Services",
  "dateIssued": "2024-03-15",
  "dateExpires": "2027-03-15",
  "credentialId": "SAA-C03-SAMPLE-0001",
  "credentialUrl": "",
  "description": "What the credential covers and what competence it evidences.",
  "skills": ["AWS", "Cloud Architecture", "EC2", "VPC"],
  "certificateImage": "/certs/aws-certified-solutions-architect-associate-2024.jpg",
  "certificateImageWidth": 1200,
  "certificateImageHeight": 849,
  "certificateFile": "",
  "sourceFileType": "image",
  "extractedText": "Verbatim text the vision model read off the certificate.",
  "addedAt": "2024-03-20"
}
```

| Field | Purpose |
|---|---|
| `id` | Stable identity, and the `#credential-<id>` anchor on the profile page. Changing it changes that anchor. |
| `dateIssued`, `dateExpires` | `YYYY-MM-DD`, or `YYYY-MM` / `YYYY` when the certificate only shows that much. Empty string for none. A past `dateExpires` marks the credential expired on the site. |
| `credentialUrl` | Public verification link, if the issuer provides one. |
| `skills` | Feeds the per-certificate list, the aggregated profile list, and `competencyRequired` in JSON-LD. |
| `certificateImage` | Root-relative path under `/certs/`. Empty if only a PDF was published. |
| `certificateFile` | Set instead of `certificateImage` when a PDF is published directly. |
| `sourceFileType` | `"image"` or `"pdf"` — what the model read. |
| `extractedText` | Kept verbatim and shown on the profile in a collapsed `<details>` block, so the summary can be checked against the source. |

`data/experience.json` and the `education` array inside `data/profile.json` are documented
in [Customizing your profile by hand](#customizing-your-profile-by-hand).

The editor's export file (`careertoai-data.json`) is a different, self-contained shape —
`{ version, profile, experience, certificates, images }`, where `images` holds every
uploaded file as a data URL. `npm run import-data` is what turns it back into the three
files above plus the images in `src/certs/` and `src/media/`.

---

## Project layout

```
data/
  profile.json          You: name, about, education, links, extra skills.
  experience.json       Work history.
  certificates.json     Licenses & certifications.
  site.json             Fallback site URL for local builds.
certs-source/           Full-resolution originals. Git-ignored, never published.
lib/
  content.mjs           Schema, loading, sorting, slugs, date parsing.
  site.mjs              Resolves SITE_URL into origin + path prefix.
  jsonld.mjs            schema.org graph builders.
  plaintext.mjs         Builds /llms.txt and /about.txt.
  apply-data.mjs        Turns an editor export into data files + images.
  extract-certificate.mjs  Claude vision extraction, shared by CLI and editor.
scripts/
  editor-server.mjs     Local helper: serves /editor/, saves, AI extraction.
  import-data.mjs       Imports a downloaded careertoai-data.json.
  add-cert.mjs          Terminal path for adding one certificate.
  make-sample-images.mjs  Draws placeholder images for the sample data.
src/
  _data/                Eleventy global data (site, profile, certificates, experience).
  _includes/base.njk    The HTML shell: meta, Open Graph, JSON-LD, nav, footer.
  src.11tydata.js       Computes each page's title/description/OG image.
  index.njk             The profile. The entire public site is this one page.
  editor.njk            /editor/ — noindex authoring form.
  llms.11ty.js          /llms.txt
  about.11ty.js         /about.txt
  robots.11ty.js        /robots.txt
  sitemap.11ty.js       /sitemap.xml
  assets/style.css      Site presentation.
  assets/editor.css     Editor presentation.
  assets/editor.js      The editor. The only JavaScript on the site.
  certs/                Published certificate images. Committed.
  media/                Published experience attachments. Committed.
eleventy.config.mjs     Build config, filters, passthrough copies.
_site/                  Build output. Git-ignored.
job-search/             The ai-job-search framework, vendored as a git subtree.
                        Self-contained: Python + Bun, its own .gitignore and
                        CLAUDE.md. See "The job-search framework" below.
.claude/
  skills/gju-internship/          The GJU German Year workflow. Written here.
  skills/job-application-assistant/  Upstream's profile + evaluation skill.
  skills/job-scraper/             Portal search across the CLIs in job-search/.
  skills/upskill/                 Skill-gap analysis over tracked postings.
  commands/                       Slash commands. See the table below.
  NOTICE.md                       Attribution and what came from where.
```

### Commands

| Command | Does |
|---|---|
| `npm run editor` | Build + serve on `http://localhost:8081`, with the editor able to write files and run AI extraction. |
| `npm run serve` | Plain Eleventy dev server with live reload at `http://localhost:8080`. |
| `npm run build` | Builds to `_site/`. |
| `npm run import-data -- <file>` | Import a `careertoai-data.json` downloaded from the editor. |
| `npm run add-cert -- <file>` | Add or update one certificate from the terminal. |
| `npm run make-samples` | Generate placeholder images for sample certificates. |
| `npm run clean` | Delete `_site/`. |

---

## The job-search framework

`job-search/` holds [ai-job-search](https://github.com/MadsLorentzen/ai-job-search)
(MIT), merged in as a git subtree with its full history. It is a separate toolchain
from the site: Python for the tools and tests, Bun for the portal CLIs, LaTeX for the
CV and cover-letter templates. Nothing in it is needed to build or deploy the site,
and `npm run build` never touches it.

```
job-search/
  .agents/skills/*-search/cli/  Six portal search CLIs (Bun + TypeScript):
                                LinkedIn, Jobindex, Jobnet, Jobbank,
                                JobDanmark, Freehire.
  tools/                        verify_pdf, robots_check, security_guards,
                                salary conversion, skill linting.
  tests/                        ~30 pytest files covering the tools and commands.
  cv/, cover_letters/           LaTeX templates (moderncv + a cover class).
  documents/                    Where you drop your CV, diplomas, references.
                                Contents are git-ignored; structure is tracked.
  salary_lookup.py              Danish salary lookup.
  CLAUDE.md                     Upstream's candidate profile, still placeholders.
```

### The two workflows

Both are available; they answer different questions.

| | `gju-internship` | `job-application-assistant` |
|---|---|---|
| Written for | A GJU student on a German student visa | A general job seeker, Danish market |
| Source of truth | `data/profile.json` + `src/assets/gy-internships/` | `.claude/skills/job-application-assistant/01-candidate-profile.md` |
| Output | German `Anschreiben`, rows in `internship-tracker.xlsx` | Tailored LaTeX CV + cover letter PDFs |
| Status | In use, filled in | Vendored, still full of `[PLACEHOLDER]` tokens |

`/apply`, `/rank` and `/outcome` are the GJU versions — they were rewritten for the
German Year rules before this merge, and they win the name. Upstream's originals are
preserved unedited at `job-search/.claude/commands/`. Run `/setup` if you want to fill
in the upstream profile and use its CV pipeline too.

### Commands from the framework

| Command | Does |
|---|---|
| `/setup` | Fills in the `job-application-assistant` profile from your documents. |
| `/interview` | Prepares for an interview on a tracked application. |
| `/expand` | Pulls competencies out of documents and your online presence. |
| `/add-portal` | Generates a new portal-search CLI for your local market. |
| `/add-template` | Registers a custom CV or cover-letter template. |
| `/html-report` | Builds an application tracker dashboard. |
| `/gmail-sync` | Syncs application status from Gmail. |
| `/notion-sync` | Pushes ranked jobs to a Notion database. |
| `/reset` | Clears the candidate profile data. |

### Running its tools

The framework's paths are relative to `job-search/`, so run it from there:

```bash
cd job-search
pip install -r requirements.txt   # if present; otherwise the stdlib suffices
python -m pytest tests/
bun run .agents/skills/linkedin-search/cli/src/cli.ts search --help
```

### Pulling upstream updates

The subtree keeps its history, so updates still merge:

```bash
git fetch ai-job-search
git merge -s subtree --allow-unrelated-histories ai-job-search/master
```

Files under `job-search/` are kept byte-identical to upstream so this stays clean.
The copies surfaced in `.claude/` differ only by a `job-search/` path prefix; if a
merge changes one upstream, re-copy it and re-apply the prefix.

---

## Troubleshooting

**`ANTHROPIC_API_KEY is not set`** — create `.env` from `.env.example` and put your key in
it. The script reads `.env` from the project root regardless of where you invoke it.

**Build warns about placeholder values** — expected until you fill in `data/profile.json`.
It lists exactly which fields are still `TODO:`.

**Build warns about the placeholder URL** — expected locally. GitHub Actions sets
`SITE_URL` automatically, so the deployed site is correct. Set `url` in `data/site.json`
to silence it.

**Links break on the deployed site** — every internal link must go through Eleventy's
`url` filter (`{{ '/llms.txt' | url }}`), which applies the `/<repo>/` prefix. A
hardcoded `href="/llms.txt"` will 404 on a project site.

**`npm ci` fails in Actions** — `package-lock.json` is not committed, or is out of sync
with `package.json`. Run `npm install` locally and commit the lockfile.

**No preview image for a PDF** — install poppler-utils, or pass `--image <file>`. See
[PDFs](#pdfs).

**The editor says "Could not save to this browser"** — site data is blocked, you are in a
private window, or the quota is full. Press **Download .json** straight away so nothing is
lost, then fix the browser setting and use **Load .json** to restore.

**Edits in the editor are not on the live site** — the editor writes to your browser, and
in local mode to your working tree. Publishing is still `git add -A && git commit && git push`.

**"Save to data/" is missing** — you are on the published site, or the local helper is not
running. Start it with `npm run editor` and open the URL it prints.

**"Extract with AI" is missing** — it only appears in local mode, on a certification that
already has an image attached, and only when `ANTHROPIC_API_KEY` is set in `.env`. The
server prints which of those is true at startup.

**A certificate added with `add-cert` disappeared after saving from the editor** — the
editor saves its whole state, replacing the data files. Load the current data into the
editor before saving over it, or add certificates in one place only.

**An AI assistant still says it cannot read the site** — check the deployment finished
(Actions tab), then confirm `curl -s <your-url>/llms.txt` returns the profile. Some tools
cache a failed fetch; point them at `/llms.txt` directly.
