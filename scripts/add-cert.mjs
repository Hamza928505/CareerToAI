#!/usr/bin/env node
/**
 * Local-only content authoring tool. Reads a certificate image or PDF with a
 * vision-capable Claude model, lets you edit every drafted field, then writes
 * the entry into data/certificates.json and publishes a display-resolution copy
 * of the image into src/certs/.
 *
 * This never runs in production. The deployed site is pre-built static files;
 * GitHub Pages could not execute this even if it wanted to. The API key lives
 * in .env, which is git-ignored and never read at build time.
 *
 *   npm run add-cert -- ./certs-source/aws.jpg
 *   npm run add-cert -- ./certs-source/coursera.pdf --image ./certs-source/preview.png
 *   npm run add-cert -- ./certs-source/aws.jpg --yes
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import sharp from "sharp";
import { z } from "zod";

import {
  CERTS_JSON,
  PUBLISHED_CERT_DIR,
  ROOT,
  loadCertificates,
  readJson,
  slugify,
  writeJson,
} from "../lib/content.mjs";

const DEFAULT_MODEL = "claude-opus-5";

/** Long edge Claude sees. Bigger costs more tokens and buys no accuracy. */
const ANALYSIS_MAX_EDGE = 1568;

/** Long edge published to the web. The original stays in certs-source/. */
const PUBLISH_MAX_WIDTH = 1200;

const IMAGE_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

const die = (msg) => {
  console.error(`\n${c.red("Error:")} ${msg}\n`);
  process.exit(1);
};

// ---------------------------------------------------------------------------
// .env — parsed here rather than via a dependency so the tool has one less
// moving part. Only KEY=VALUE lines, with optional quotes.
// ---------------------------------------------------------------------------

function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if (/^(["']).*\1$/s.test(value)) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { file: null, id: null, image: null, model: null, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return { help: true };
    else if (arg === "--yes" || arg === "-y") opts.yes = true;
    else if (arg === "--id") opts.id = argv[++i];
    else if (arg === "--image") opts.image = argv[++i];
    else if (arg === "--model") opts.model = argv[++i];
    else if (arg.startsWith("-")) die(`Unknown option: ${arg}`);
    else if (!opts.file) opts.file = arg;
    else die(`Unexpected extra argument: ${arg}`);
  }
  return opts;
}

const USAGE = `
${c.bold("Add a certificate to the vault")}

  npm run add-cert -- <file> [options]

  <file>            Certificate image (.jpg .jpeg .png .gif .webp) or .pdf

Options:
  --id <slug>       Use this id instead of one derived from the title.
                    An existing id updates that entry in place.
  --image <file>    Use this file for the published image. Useful for PDFs
                    when poppler's pdftoppm is not installed, or when you
                    have cropped a version with personal details removed.
  --model <id>      Override the extraction model (default: ${DEFAULT_MODEL}).
  --yes, -y         Accept the drafted fields without the interactive review.
  --help, -h        Show this message.

The API key is read from .env (ANTHROPIC_API_KEY). Originals are never copied
into the repo — only a ${PUBLISH_MAX_WIDTH}px-wide, metadata-stripped copy in src/certs/.
`;

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

const ExtractionSchema = z.object({
  title: z.string().describe("The credential name exactly as printed on the document."),
  issuer: z
    .string()
    .describe("The organization that granted the credential, e.g. 'Amazon Web Services'."),
  dateIssued: z
    .string()
    .describe("Issue date as YYYY-MM-DD, or YYYY-MM / YYYY if only that precision is shown. Empty string if absent."),
  dateExpires: z
    .string()
    .describe("Expiry date in the same format, or empty string if the credential does not expire or no expiry is shown."),
  credentialId: z
    .string()
    .describe("Printed validation, credential, registration or serial number. Empty string if none."),
  credentialUrl: z
    .string()
    .describe("Verification URL printed on the document. Empty string if none."),
  description: z
    .string()
    .describe("Two to four sentences on what the credential covers and what competence it evidences."),
  skills: z
    .array(z.string())
    .describe("Four to twelve concrete skills or technologies the credential evidences, in Title Case."),
  extractedText: z
    .string()
    .describe("Verbatim transcription of every piece of text visible on the document, as one paragraph."),
});

const SYSTEM_PROMPT = `You extract structured metadata from certificates, diplomas and professional credentials so they can be published on a personal profile site that AI assistants read.

Rules:
- Report only what the document shows, plus widely known public facts about that specific credential program. Never invent dates, ID numbers or issuers. If a field is not present, return an empty string.
- Dates: prefer YYYY-MM-DD. If the document only shows a month or a year, return YYYY-MM or YYYY. Never guess a day that is not printed.
- "description" is written in the third person about the credential itself, not about the person holding it. Describe what it covers and what competence it demonstrates. Do not include the holder's name, and do not use marketing language.
- "skills" are concrete and specific: technologies, methods, domains. "AWS", "VPC", "Data Cleaning" — not "Teamwork" or "Hard Work". Title Case, no duplicates.
- "extractedText" is a faithful transcription used for transparency and search. Preserve names, numbers and spellings exactly as printed, including the holder's name if it appears.`;

async function extract({ client, model, source }) {
  const response = await client.messages.parse({
    model,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: "medium",
      format: zodOutputFormat(ExtractionSchema),
    },
    messages: [
      {
        role: "user",
        content: [
          source.block,
          {
            type: "text",
            text: "Extract the metadata for this credential. Read every line of text on it, including small print, validation numbers and dates.",
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    const detail = response.stop_details
      ? ` (${response.stop_details.category ?? "unspecified"}: ${response.stop_details.explanation ?? ""})`
      : "";
    die(
      `The model declined to process this document${detail}.\n` +
      `  Nothing was written. If this is your own certificate, try again; if it keeps happening,\n` +
      `  add the entry by hand in data/certificates.json.`
    );
  }

  if (!response.parsed_output) {
    die("The model's response did not match the expected schema. Nothing was written. Try re-running.");
  }

  return response.parsed_output;
}

// ---------------------------------------------------------------------------
// Source file handling
// ---------------------------------------------------------------------------

/** Build the content block Claude reads, downscaling images to keep tokens sane. */
async function buildSourceBlock(file) {
  const ext = path.extname(file).toLowerCase();

  if (ext === ".pdf") {
    const bytes = fs.readFileSync(file);
    if (bytes.length > 28 * 1024 * 1024) {
      die(`PDF is ${(bytes.length / 1048576).toFixed(1)} MB; the API limit is 32 MB per request. Compress it first.`);
    }
    return {
      kind: "pdf",
      block: {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") },
      },
    };
  }

  const mediaType = IMAGE_TYPES[ext];
  if (!mediaType) {
    die(`Unsupported file type "${ext}". Use ${Object.keys(IMAGE_TYPES).join(", ")} or .pdf.`);
  }

  const resized = await sharp(file)
    .rotate()
    .resize({ width: ANALYSIS_MAX_EDGE, height: ANALYSIS_MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();

  return {
    kind: "image",
    block: {
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: resized.toString("base64") },
    },
  };
}

/**
 * Write the public copy: downscaled, re-encoded and metadata-stripped (sharp
 * drops EXIF unless told otherwise, so GPS tags and camera serials never ship).
 * Returns the fields to store on the certificate entry.
 */
async function publishAsset({ id, sourceFile, imageOverride, sourceKind }) {
  fs.mkdirSync(PUBLISHED_CERT_DIR, { recursive: true });

  let imageSource = imageOverride || (sourceKind === "image" ? sourceFile : null);

  if (!imageSource && sourceKind === "pdf") {
    imageSource = renderPdfFirstPage(sourceFile);
  }

  if (!imageSource) {
    // No way to make a picture, so publish the PDF itself and link to it.
    const dest = path.join(PUBLISHED_CERT_DIR, `${id}.pdf`);
    fs.copyFileSync(sourceFile, dest);
    console.log(
      c.yellow(
        "\n  Note: pdftoppm (poppler) was not found, so no preview image was generated.\n" +
        "  The PDF itself has been published instead. To get an image, either install\n" +
        "  poppler-utils, or re-run with --image <a screenshot of the certificate>.\n" +
        "  Be aware the PDF is served at full fidelity, so redact it first if it\n" +
        "  contains details you do not want public."
      )
    );
    return { certificateImage: "", certificateFile: `/certs/${id}.pdf` };
  }

  const dest = path.join(PUBLISHED_CERT_DIR, `${id}.jpg`);
  const info = await sharp(imageSource)
    .rotate()
    .resize({ width: PUBLISH_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(dest);

  return {
    certificateImage: `/certs/${id}.jpg`,
    certificateImageWidth: info.width,
    certificateImageHeight: info.height,
    certificateFile: "",
  };
}

/** Render page 1 of a PDF to a temp JPEG via poppler. Returns null if unavailable. */
function renderPdfFirstPage(pdfPath) {
  const probe = spawnSync("pdftoppm", ["-v"], { stdio: "ignore" });
  if (probe.error) return null;

  const prefix = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cert-")), "page");
  const result = spawnSync(
    "pdftoppm",
    ["-jpeg", "-r", "150", "-f", "1", "-l", "1", "-singlefile", pdfPath, prefix],
    { stdio: "ignore" }
  );
  if (result.status !== 0) return null;

  const out = `${prefix}.jpg`;
  return fs.existsSync(out) ? out : null;
}

// ---------------------------------------------------------------------------
// Interactive review
// ---------------------------------------------------------------------------

async function review(draft) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const result = { ...draft };

  console.log(`\n${c.bold("Review the drafted entry.")} ${c.dim("Press Enter to keep a value, or type a replacement.")}`);
  console.log(c.dim("For skills, type a comma-separated list. Type - to clear a field.\n"));

  const fields = [
    ["title", "Title"],
    ["issuer", "Issuer"],
    ["dateIssued", "Date issued (YYYY-MM-DD)"],
    ["dateExpires", "Date expires (blank if none)"],
    ["credentialId", "Credential ID"],
    ["credentialUrl", "Verification URL"],
    ["description", "Description"],
    ["skills", "Skills"],
  ];

  try {
    for (const [key, label] of fields) {
      const current = key === "skills" ? result.skills.join(", ") : result[key];
      console.log(`${c.cyan(label)}: ${current || c.dim("(empty)")}`);
      const answer = (await rl.question("> ")).trim();
      console.log("");
      if (!answer) continue;
      if (answer === "-") {
        result[key] = key === "skills" ? [] : "";
        continue;
      }
      result[key] =
        key === "skills"
          ? answer.split(",").map((s) => s.trim()).filter(Boolean)
          : answer;
    }

    console.log(c.dim("Transcribed text (kept verbatim, not editable here — edit data/certificates.json if needed):"));
    console.log(c.dim(`  ${result.extractedText.slice(0, 300)}${result.extractedText.length > 300 ? "…" : ""}\n`));

    const ok = (await rl.question(`Save this entry? ${c.dim("[Y/n]")} `)).trim().toLowerCase();
    if (ok && !["y", "yes"].includes(ok)) {
      console.log("\nAborted. Nothing was written.\n");
      process.exit(0);
    }
  } finally {
    rl.close();
  }

  return result;
}

async function confirmOverwrite(id) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `\n${c.yellow("A certificate with id")} ${c.bold(id)} ${c.yellow("already exists.")} Replace it? ${c.dim("[y/N]")} `
    );
    return ["y", "yes"].includes(answer.trim().toLowerCase());
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return console.log(USAGE);
  if (!opts.file) return console.log(USAGE);

  loadEnv();

  const file = path.resolve(opts.file);
  if (!fs.existsSync(file)) die(`No such file: ${opts.file}`);
  if (opts.image && !fs.existsSync(path.resolve(opts.image))) die(`No such file: ${opts.image}`);

  if (!process.env.ANTHROPIC_API_KEY) {
    die(
      "ANTHROPIC_API_KEY is not set.\n" +
      "  Copy .env.example to .env and put your key in it. .env is git-ignored\n" +
      "  and is only ever read by this script on your machine."
    );
  }

  const model = opts.model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const client = new Anthropic();

  console.log(`\n${c.bold("Reading")} ${path.relative(process.cwd(), file)} ${c.dim(`with ${model}…`)}`);
  const source = await buildSourceBlock(file);
  const draft = await extract({ client, model, source });
  console.log(c.green("Extraction complete."));

  const reviewed = opts.yes ? draft : await review(draft);

  if (!reviewed.title.trim()) die("A certificate needs a title. Nothing was written.");

  const year = /^(\d{4})/.exec(reviewed.dateIssued || "")?.[1];
  const id = opts.id || [slugify(reviewed.title), year].filter(Boolean).join("-");

  const existing = readJson(CERTS_JSON);
  const index = existing.findIndex((entry) => entry.id === id);
  if (index !== -1 && !opts.id && !opts.yes && !(await confirmOverwrite(id))) {
    console.log("\nAborted. Nothing was written.\n");
    process.exit(0);
  }

  const asset = await publishAsset({
    id,
    sourceFile: file,
    imageOverride: opts.image ? path.resolve(opts.image) : null,
    sourceKind: source.kind,
  });

  const entry = {
    id,
    title: reviewed.title.trim(),
    issuer: reviewed.issuer.trim(),
    dateIssued: reviewed.dateIssued.trim(),
    dateExpires: reviewed.dateExpires.trim(),
    credentialId: reviewed.credentialId.trim(),
    credentialUrl: reviewed.credentialUrl.trim(),
    description: reviewed.description.trim(),
    skills: reviewed.skills,
    certificateImage: asset.certificateImage,
    certificateImageWidth: asset.certificateImageWidth,
    certificateImageHeight: asset.certificateImageHeight,
    certificateFile: asset.certificateFile,
    sourceFileType: source.kind,
    extractedText: reviewed.extractedText.trim(),
    addedAt: new Date().toISOString().slice(0, 10),
  };

  if (index === -1) existing.push(entry);
  else existing[index] = { ...existing[index], ...entry };

  writeJson(CERTS_JSON, existing);

  const total = loadCertificates().length;
  const published = asset.certificateImage || asset.certificateFile;

  console.log(`
${c.green(index === -1 ? "Added" : "Updated")} ${c.bold(id)}

  data/certificates.json   ${total} certificate${total === 1 ? "" : "s"} total
  src/certs${published.replace("/certs", "")}${published ? "" : "  (no asset published)"}
  page                     /certificates/${id}/

${c.dim("The original stays where it is — certs-source/ is git-ignored, so only the")}
${c.dim("downscaled copy is ever published.")}

Next:
  npm run serve            preview at http://localhost:8080
  git add -A && git commit -m "Add ${id}" && git push
`);
}

main().catch((error) => {
  if (error instanceof Anthropic.APIError) {
    die(`Anthropic API error ${error.status ?? ""}: ${error.message}`);
  }
  die(error?.stack || String(error));
});
