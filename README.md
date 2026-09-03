# AI-Readable Personal Profile & Certificate Vault

A personal profile site built so that **any AI assistant can actually fetch and read it**.
LinkedIn blocks bot traffic; this does the opposite. Every page is pre-rendered static
HTML, robots.txt welcomes every crawler by name, and the whole profile is also published
as one dense plain-text file and as raw JSON.

Certificates are added with a local tool that reads the image or PDF using a
vision-capable Claude model, drafts the title, issuer, dates, description and skill tags,
and lets you edit every field before it is saved.

**Cost to run: nothing.** GitHub Pages hosts it free. The only thing you ever pay for is
the handful of Anthropic API tokens spent when you add a certificate, on your own machine.

---

## Table of contents

- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Adding a certificate](#adding-a-certificate)
- [The API key](#the-api-key)
- [Customizing your profile](#customizing-your-profile)
- [Deploying to GitHub Pages](#deploying-to-github-pages)
- [What makes it machine-readable](#what-makes-it-machine-readable)
- [Data model](#data-model)
- [Project layout](#project-layout)
- [Troubleshooting](#troubleshooting)

---

## How it works

There are two completely separate halves, and keeping them separate is what makes the
zero-cost, no-backend constraint hold:

```
  ON YOUR MACHINE (authoring)                    ON GITHUB (publishing)
  ─────────────────────────────                  ──────────────────────
  certs-source/aws.jpg                           git push
      │  (git-ignored, full resolution)              │
      ▼                                              ▼
  npm run add-cert -- certs-source/aws.jpg       GitHub Actions
      │                                              │
      ├─► Claude vision API ──► drafted fields       ├─► npm ci
      ├─► you review and edit each field             ├─► npm run build (Eleventy)
      ├─► data/certificates.json  (updated)          └─► deploy _site/ to Pages
      └─► src/certs/aws.jpg  (1200px, EXIF stripped)     │
                    │                                    ▼
                    └──────── git commit ───────►  https://you.github.io/CareerToAI
```

The deployed site is nothing but static files. There is no server, no database, and no
upload form — a static host cannot accept writes, so adding a certificate is always a
local step followed by a commit. The Anthropic API is called **only** by the local
authoring script, never at build time and never by a visitor.

---

## Quick start

```bash
npm install          # installs Eleventy + the local authoring tools
npm run make-samples # draws placeholder images for the two sample certificates
npm run serve        # http://localhost:8080
```

You will see a site built from the two sample certificates in `data/certificates.json`
and the placeholder profile in `data/profile.json`. The build prints a warning listing
every field still holding a `TODO:` value.

Then:

1. Edit `data/profile.json` — see [Customizing your profile](#customizing-your-profile).
2. Delete the two sample entries from `data/certificates.json` and the two sample images
   from `src/certs/` when you are ready to publish for real.
3. Add your own certificates — see below.

---

## Adding a certificate

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

`data/certificates.json` is a plain array — edit it by hand any time. Re-running
`add-cert` with `--id <existing-id>` re-extracts and overwrites that entry. To remove a
certificate, delete its object from the array and its image from `src/certs/`.

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

## Customizing your profile

Everything about you lives in `data/profile.json`:

| Field       | Notes |
|-------------|-------|
| `name`      | Used in the `<h1>`, every `<title>`, and schema.org `Person.name`. |
| `headline`  | One line under your name. Also appended to the home page `<title>`. |
| `bio`       | 2–4 sentences of plain prose. This is the single most-quoted piece of text when an AI summarizes you — write it as fact, not marketing. |
| `location`  | Free text, e.g. `"Amman, Jordan"`. |
| `email`     | Rendered as a `mailto:` link and included in JSON-LD and `/llms.txt`. Leave the `TODO:` value in place to publish no email at all. |
| `pronouns`  | Optional; shown on the profile when set. |
| `jobTitle`, `worksFor` | Optional; feed `Person.jobTitle` / `Person.worksFor`. |
| `links`     | `{ "label", "url" }` pairs, rendered with `rel="me"` and emitted as `sameAs`. Any URL containing `TODO` is dropped from the build with a warning. |
| `skills`    | Only skills **not** already implied by a certificate. The site unions this with every certificate's skills, deduplicates case-insensitively, and sorts by how many certificates evidence each one. |

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

- **Content is in the HTML.** Eleventy renders every page at build time. There is no
  client-side JavaScript anywhere on the site — not one `<script>` tag beyond the JSON-LD
  data block. An AI tool that fetches raw HTML without executing JS gets the full content.
- **`/llms.txt` and `/about.txt`** — the entire profile as one dense plain-text document:
  bio, contact, the complete skill list (both as bullets and as one comma-separated line),
  and every certificate with issuer, dates, credential ID, skills, description and the
  transcribed certificate text. One fetch answers "what do you know about this person".
- **JSON-LD in every `<head>`** — schema.org `Person` on the home page with `hasCredential`
  linking to an `EducationalOccupationalCredential` node per certificate; the credential
  plus its holder on each detail page; a `CollectionPage` + `ItemList` on the index.
- **Raw JSON at `/data/certificates.json` and `/data/profile.json`** for agents that would
  rather not parse anything.
- **A stable URL per credential** at `/certificates/<id>/`, so a single certificate can be
  cited and fetched directly.
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

Paste a certificate URL into Google's Rich Results Test to validate the JSON-LD.

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
| `id` | URL slug and stable identity. Changing it changes the page's URL. |
| `dateIssued`, `dateExpires` | `YYYY-MM-DD`, or `YYYY-MM` / `YYYY` when the certificate only shows that much. Empty string for none. A past `dateExpires` marks the credential expired on the site. |
| `credentialUrl` | Public verification link, if the issuer provides one. |
| `skills` | Feeds the per-certificate list, the aggregated profile list, and `competencyRequired` in JSON-LD. |
| `certificateImage` | Root-relative path under `/certs/`. Empty if only a PDF was published. |
| `certificateFile` | Set instead of `certificateImage` when a PDF is published directly. |
| `sourceFileType` | `"image"` or `"pdf"` — what the model read. |
| `extractedText` | Kept verbatim and shown on the detail page so the summary can be checked against the source. |

---

## Project layout

```
data/
  profile.json          You. Edit by hand.
  certificates.json     Written by add-cert; safe to edit by hand.
  site.json             Fallback site URL for local builds.
certs-source/           Full-resolution originals. Git-ignored, never published.
lib/
  content.mjs           Schema, loading, sorting, slugs, date parsing.
  site.mjs              Resolves SITE_URL into origin + path prefix.
  jsonld.mjs            schema.org graph builders.
  plaintext.mjs         Builds /llms.txt and /about.txt.
scripts/
  add-cert.mjs          The local authoring tool.
  make-sample-images.mjs Draws placeholder images for the sample data.
src/
  _data/                Eleventy global data (site, profile, certificates).
  _includes/base.njk    The HTML shell: meta, Open Graph, JSON-LD, nav, footer.
  src.11tydata.js       Computes each page's title/description/OG image.
  index.njk             Home / profile page.
  certificates.njk      /certificates/ index.
  certificate.njk       One page per certificate, via pagination.
  llms.11ty.js          /llms.txt
  about.11ty.js         /about.txt
  robots.11ty.js        /robots.txt
  sitemap.11ty.js       /sitemap.xml
  assets/style.css      Presentation only.
  certs/                Published, downscaled certificate images. Committed.
eleventy.config.mjs     Build config, filters, passthrough copies.
_site/                  Build output. Git-ignored.
```

### Commands

| Command | Does |
|---|---|
| `npm run serve` | Local dev server with live reload at `http://localhost:8080`. |
| `npm run build` | Builds to `_site/`. |
| `npm run add-cert -- <file>` | Add or update a certificate. |
| `npm run make-samples` | Generate placeholder images for sample certificates. |
| `npm run clean` | Delete `_site/`. |

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
`url` filter (`{{ '/certificates/' | url }}`), which applies the `/<repo>/` prefix. A
hardcoded `href="/certificates/"` will 404 on a project site.

**A certificate is missing from the sitemap** — `certificate.njk` needs
`addAllPagesToCollections: true` in its `pagination` block; without it Eleventy adds only
the first paginated page to `collections.all`.

**`npm ci` fails in Actions** — `package-lock.json` is not committed, or is out of sync
with `package.json`. Run `npm install` locally and commit the lockfile.

**No preview image for a PDF** — install poppler-utils, or pass `--image <file>`. See
[PDFs](#pdfs).

**An AI assistant still says it cannot read the site** — check the deployment finished
(Actions tab), then confirm `curl -s <your-url>/llms.txt` returns the profile. Some tools
cache a failed fetch; point them at `/llms.txt` directly.
