#!/usr/bin/env node
/**
 * Local-only content authoring tool. Reads a certificate image or PDF with a
 * vision-capable Claude model, lets you edit every drafted field, then writes
 * the entry into data/certificates.json and publishes a display-resolution copy
 * of the image into src/certs/.
 *
 * This is the terminal path. The same extraction is available with a button in
 * /editor/ when `npm run editor` is running — both share
 * lib/extract-certificate.mjs, so they draft identical fields.
 *
 * Never runs in production. The deployed site is pre-built static files, and
 * the API key lives in .env, which is git-ignored and never read at build time.
 *
 *   npm run add-cert -- ./certs-source/aws.jpg
 *   npm run add-cert -- ./certs-source/coursera.pdf --image ./certs-source/preview.png
 *   npm run add-cert -- ./certs-source/aws.jpg --yes
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";

import sharp from "sharp";

import {
  CERTS_JSON,
  PUBLISHED_CERT_DIR,
  loadCertificates,
  readJson,
  slugify,
  writeJson,
} from "../lib/content.mjs";
import {
  Anthropic,
  DEFAULT_MODEL,
  IMAGE_TYPES,
  buildSourceBlockFromFile,
  extractCertificate,
  loadEnv,
} from "../lib/extract-certificate.mjs";

/** Long edge published to the web. The original stays in certs-source/. */
const PUBLISH_MAX_WIDTH = 1200;

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

  <file>            Certificate image (${Object.keys(IMAGE_TYPES).join(" ")}) or .pdf

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

Prefer a form? Run ${c.cyan("npm run editor")} and use the browser editor instead.
`;

// ---------------------------------------------------------------------------
// Publishing the image
// ---------------------------------------------------------------------------

/**
 * Write the public copy: downscaled, re-encoded and metadata-stripped (sharp
 * drops EXIF unless told otherwise, so GPS tags and camera serials never ship).
 */
async function publishAsset({ id, sourceFile, imageOverride, sourceKind }) {
  fs.mkdirSync(PUBLISHED_CERT_DIR, { recursive: true });

  let imageSource = imageOverride || (sourceKind === "image" ? sourceFile : null);
  if (!imageSource && sourceKind === "pdf") imageSource = renderPdfFirstPage(sourceFile);

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
        key === "skills" ? answer.split(",").map((s) => s.trim()).filter(Boolean) : answer;
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
  if (opts.help || !opts.file) return console.log(USAGE);

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

  let source;
  let draft;
  try {
    source = await buildSourceBlockFromFile(file);
    draft = await extractCertificate({ client, model, source });
  } catch (error) {
    if (error instanceof Anthropic.APIError) die(`Anthropic API error ${error.status ?? ""}: ${error.message}`);
    die(error.message);
  }
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
  src${published}
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
