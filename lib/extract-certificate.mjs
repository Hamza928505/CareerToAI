/**
 * Vision extraction for certificates.
 *
 * Shared by scripts/add-cert.mjs (CLI) and scripts/editor-server.mjs (the
 * "Extract with AI" button in local mode). Both run on your machine — the API
 * key never reaches a browser, which is exactly why this button only appears
 * when the local helper server is running.
 */
import fs from "node:fs";
import path from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import sharp from "sharp";
import { z } from "zod";

import { ROOT } from "./content.mjs";

export const DEFAULT_MODEL = "claude-opus-5";

/** Long edge Claude sees. Bigger costs more tokens and buys no accuracy. */
const ANALYSIS_MAX_EDGE = 1568;

export const IMAGE_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/**
 * .env parsed here rather than via a dependency, so the authoring tools have
 * one less moving part. Only KEY=VALUE lines, with optional quotes.
 */
export function loadEnv() {
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

export const ExtractionSchema = z.object({
  title: z.string().describe("The credential name exactly as printed on the document."),
  issuer: z.string().describe("The organization that granted the credential, e.g. 'Amazon Web Services'."),
  dateIssued: z.string().describe("Issue date as YYYY-MM-DD, or YYYY-MM / YYYY if only that precision is shown. Empty string if absent."),
  dateExpires: z.string().describe("Expiry date in the same format, or empty string if the credential does not expire or no expiry is shown."),
  credentialId: z.string().describe("Printed validation, credential, registration or serial number. Empty string if none."),
  credentialUrl: z.string().describe("Verification URL printed on the document. Empty string if none."),
  description: z.string().describe("Two to four sentences on what the credential covers and what competence it evidences."),
  skills: z.array(z.string()).describe("Four to twelve concrete skills or technologies the credential evidences, in Title Case."),
  extractedText: z.string().describe("Verbatim transcription of every piece of text visible on the document, as one paragraph."),
});

export const SYSTEM_PROMPT = `You extract structured metadata from certificates, diplomas and professional credentials so they can be published on a personal profile site that AI assistants read.

Rules:
- Report only what the document shows, plus widely known public facts about that specific credential program. Never invent dates, ID numbers or issuers. If a field is not present, return an empty string.
- Dates: prefer YYYY-MM-DD. If the document only shows a month or a year, return YYYY-MM or YYYY. Never guess a day that is not printed.
- "description" is written in the third person about the credential itself, not about the person holding it. Describe what it covers and what competence it demonstrates. Do not include the holder's name, and do not use marketing language.
- "skills" are concrete and specific: technologies, methods, domains. "AWS", "VPC", "Data Cleaning" — not "Teamwork" or "Hard Work". Title Case, no duplicates.
- "extractedText" is a faithful transcription used for transparency and search. Preserve names, numbers and spellings exactly as printed, including the holder's name if it appears.`;

/** Build the content block Claude reads from an in-memory file. */
export async function buildSourceBlock(buffer, mimeType) {
  if (mimeType === "application/pdf") {
    if (buffer.length > 28 * 1024 * 1024) {
      throw new Error(
        `PDF is ${(buffer.length / 1048576).toFixed(1)} MB; the API limit is 32 MB per request. Compress it first.`
      );
    }
    return {
      kind: "pdf",
      block: {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
      },
    };
  }

  const resized = await sharp(buffer)
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

/** Same, from a path on disk. Throws on an unsupported extension. */
export async function buildSourceBlockFromFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".pdf") return buildSourceBlock(fs.readFileSync(file), "application/pdf");
  const mediaType = IMAGE_TYPES[ext];
  if (!mediaType) {
    throw new Error(`Unsupported file type "${ext}". Use ${Object.keys(IMAGE_TYPES).join(", ")} or .pdf.`);
  }
  return buildSourceBlock(fs.readFileSync(file), mediaType);
}

/**
 * Run the extraction. Throws with a readable message on a refusal or a
 * response that does not match the schema — callers surface it to the human
 * rather than writing anything.
 */
export async function extractCertificate({ client, model = DEFAULT_MODEL, source }) {
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
    throw new Error(`The model declined to process this document${detail}. Nothing was written.`);
  }

  if (!response.parsed_output) {
    throw new Error("The model's response did not match the expected schema. Nothing was written.");
  }

  return response.parsed_output;
}

export { Anthropic };
