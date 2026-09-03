#!/usr/bin/env node
/**
 * Generates the placeholder images for the two sample certificates so the site
 * previews correctly on a fresh clone. Real certificates get their images from
 * scripts/add-cert.mjs; this exists only so `npm install && npm run build`
 * produces a complete-looking site before you have added anything of your own.
 *
 *   npm run make-samples
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { PUBLISHED_CERT_DIR, loadCertificates } from "../lib/content.mjs";

const WIDTH = 1200;
const HEIGHT = 849;

const escape = (s) =>
  String(s).replace(/[<>&'"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[ch]));

/** Naive wrap — good enough for two lines of a placeholder title. */
function wrap(text, perLine) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > perLine && line) {
      lines.push(line.trim());
      line = word;
    } else {
      line = `${line} ${word}`;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, 3);
}

function svg(cert) {
  const titleLines = wrap(cert.title, 34);
  const startY = 360 - (titleLines.length - 1) * 30;
  const tspans = titleLines
    .map((line, i) => `<tspan x="${WIDTH / 2}" y="${startY + i * 60}">${escape(line)}</tspan>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <rect width="100%" height="100%" fill="#fdfbf7"/>
  <rect x="26" y="26" width="${WIDTH - 52}" height="${HEIGHT - 52}" fill="none" stroke="#c9a227" stroke-width="3"/>
  <rect x="40" y="40" width="${WIDTH - 80}" height="${HEIGHT - 80}" fill="none" stroke="#e2d9c3" stroke-width="1"/>
  <text x="${WIDTH / 2}" y="200" text-anchor="middle" font-family="Georgia, serif"
        font-size="26" fill="#8a7c5a" letter-spacing="7">CERTIFICATE OF ACHIEVEMENT</text>
  <text x="${WIDTH / 2}" y="255" text-anchor="middle" font-family="Georgia, serif"
        font-size="19" fill="#a89b7c">This is a placeholder image, not a real credential</text>
  <text text-anchor="middle" font-family="Georgia, serif" font-size="46" fill="#2b2720">${tspans}</text>
  <line x1="300" y1="${startY + titleLines.length * 60 + 20}" x2="${WIDTH - 300}" y2="${startY + titleLines.length * 60 + 20}" stroke="#c9a227" stroke-width="2"/>
  <text x="${WIDTH / 2}" y="${startY + titleLines.length * 60 + 80}" text-anchor="middle"
        font-family="Georgia, serif" font-size="30" fill="#5d5a54">${escape(cert.issuer)}</text>
  <text x="${WIDTH / 2}" y="${HEIGHT - 120}" text-anchor="middle" font-family="Georgia, serif"
        font-size="22" fill="#8a8378">Issued ${escape(cert.dateIssued || "—")}</text>
  ${cert.credentialId
      ? `<text x="${WIDTH / 2}" y="${HEIGHT - 85}" text-anchor="middle" font-family="Georgia, serif" font-size="17" fill="#a89b7c">Validation ${escape(cert.credentialId)}</text>`
      : ""}
</svg>`;
}

const certificates = loadCertificates();
fs.mkdirSync(PUBLISHED_CERT_DIR, { recursive: true });

let written = 0;
for (const cert of certificates) {
  if (!cert.certificateImage) continue;
  const dest = path.join(PUBLISHED_CERT_DIR, path.basename(cert.certificateImage));
  if (fs.existsSync(dest)) {
    console.log(`skip   ${path.basename(dest)} (already exists)`);
    continue;
  }
  await sharp(Buffer.from(svg(cert))).jpeg({ quality: 85, mozjpeg: true }).toFile(dest);
  console.log(`write  ${path.basename(dest)}  ${WIDTH}x${HEIGHT}`);
  written++;
}

console.log(`\n${written} placeholder image${written === 1 ? "" : "s"} generated in src/certs/.`);
