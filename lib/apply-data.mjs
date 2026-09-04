/**
 * Turns an editor export payload into the repository's data files and images.
 *
 * Shared by the two paths that publish what you typed in /editor/:
 *   - scripts/editor-server.mjs  POST /__editor/save   (local mode)
 *   - scripts/import-data.mjs    npm run import-data    (published mode)
 *
 * Keeping it in one place is what stops the two from drifting into producing
 * different JSON from identical input.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {
  CERTS_JSON,
  EXPERIENCE_JSON,
  PROFILE_JSON,
  PUBLISHED_CERT_DIR,
  PUBLISHED_MEDIA_DIR,
  ROOT,
  slugify,
  writeJson,
} from "./content.mjs";

/** Long edge published to the web. Originals are never written into the repo. */
const PUBLISH_MAX_WIDTH = 1200;

const str = (v) => (typeof v === "string" ? v.trim() : "");
const list = (v) => (Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : []);

function decodeDataUrl(dataUrl) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl || ""));
  if (!match) return null;
  const [, type = "application/octet-stream", isBase64, body] = match;
  return {
    type,
    buffer: isBase64 ? Buffer.from(body, "base64") : Buffer.from(decodeURIComponent(body), "utf8"),
  };
}

/** Make every id unique within its own list, so two "AWS" certs cannot collide. */
function uniqueId(candidate, used, fallback) {
  let base = candidate || fallback;
  if (!base) base = "entry";
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

/**
 * Write one uploaded file into the published assets folder.
 * Images are downscaled and re-encoded (which drops EXIF); PDFs are copied
 * as-is because there is nothing to re-encode them into here.
 */
async function publishImage({ image, id, dir }) {
  const decoded = decodeDataUrl(image.dataUrl);
  if (!decoded) return null;

  fs.mkdirSync(dir, { recursive: true });

  if (decoded.type === "application/pdf") {
    const file = path.join(dir, `${id}.pdf`);
    fs.writeFileSync(file, decoded.buffer);
    return { file: `${path.basename(dir)}/${id}.pdf`, isPdf: true };
  }

  const file = path.join(dir, `${id}.jpg`);
  const info = await sharp(decoded.buffer)
    .rotate()
    .resize({ width: PUBLISH_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(file);

  return {
    file: `${path.basename(dir)}/${id}.jpg`,
    width: info.width,
    height: info.height,
    isPdf: false,
  };
}

export function validatePayload(payload) {
  if (!payload || typeof payload !== "object") return "Payload is not an object.";
  if (!payload.profile || typeof payload.profile !== "object") return "Payload has no profile object.";
  if (payload.experience && !Array.isArray(payload.experience)) return "experience must be an array.";
  if (payload.certificates && !Array.isArray(payload.certificates)) return "certificates must be an array.";
  return null;
}

/**
 * Apply the payload. Returns which files were written and how many images were
 * published, so both callers can report the same thing.
 */
export async function applyPayload(payload) {
  const problem = validatePayload(payload);
  if (problem) throw new Error(problem);

  const images = payload.images || {};
  const today = new Date().toISOString().slice(0, 10);
  let imageCount = 0;

  // ---- profile ----------------------------------------------------------
  const raw = payload.profile;
  const profile = {
    firstName: str(raw.firstName),
    lastName: str(raw.lastName),
    headline: str(raw.headline),
    pronouns: str(raw.pronouns),
    location: str(raw.location),
    email: str(raw.email),
    bio: str(raw.bio),
    jobTitle: str(raw.jobTitle),
    worksFor: str(raw.worksFor),
    education: (raw.education || [])
      .filter((e) => str(e.school))
      .map((e) => ({
        school: str(e.school),
        industry: str(e.industry),
        degree: str(e.degree),
        fieldOfStudy: str(e.fieldOfStudy),
        startDate: str(e.startDate),
        endDate: str(e.endDate),
        description: str(e.description),
      })),
    links: (raw.links || [])
      .filter((l) => str(l.url))
      .map((l) => ({ label: str(l.label) || str(l.url), url: str(l.url) })),
    skills: list(raw.skills),
  };

  // ---- experience -------------------------------------------------------
  const usedExperienceIds = new Set();
  const experience = [];
  for (const entry of payload.experience || []) {
    if (!str(entry.title) && !str(entry.organization)) continue;
    const id = uniqueId(
      str(entry.id) || slugify([str(entry.title), str(entry.organization)].filter(Boolean).join("-")),
      usedExperienceIds,
      "position"
    );

    let attachmentImage = str(entry.attachmentImage);
    let width;
    let height;
    if (entry.imageKey && images[entry.imageKey]) {
      const published = await publishImage({ image: images[entry.imageKey], id, dir: PUBLISHED_MEDIA_DIR });
      if (published && !published.isPdf) {
        attachmentImage = `/${published.file}`;
        width = published.width;
        height = published.height;
        imageCount++;
      }
    }

    experience.push({
      id,
      title: str(entry.title),
      organization: str(entry.organization),
      employmentType: str(entry.employmentType),
      location: str(entry.location),
      locationType: str(entry.locationType),
      startDate: str(entry.startDate),
      endDate: str(entry.endDate),
      description: str(entry.description),
      skills: list(entry.skills),
      attachmentImage,
      attachmentImageWidth: width,
      attachmentImageHeight: height,
      addedAt: str(entry.addedAt) || today,
    });
  }

  // ---- certificates -----------------------------------------------------
  const usedCertIds = new Set();
  const certificates = [];
  for (const entry of payload.certificates || []) {
    if (!str(entry.title)) continue;
    const year = /^(\d{4})/.exec(str(entry.dateIssued))?.[1];
    const id = uniqueId(
      str(entry.id) || [slugify(str(entry.title)), year].filter(Boolean).join("-"),
      usedCertIds,
      "certificate"
    );

    let certificateImage = str(entry.certificateImage);
    let certificateFile = str(entry.certificateFile);
    let width;
    let height;
    let sourceFileType = str(entry.sourceFileType) || "image";

    if (entry.imageKey && images[entry.imageKey]) {
      const published = await publishImage({ image: images[entry.imageKey], id, dir: PUBLISHED_CERT_DIR });
      if (published?.isPdf) {
        certificateFile = `/${published.file}`;
        certificateImage = "";
        sourceFileType = "pdf";
        imageCount++;
      } else if (published) {
        certificateImage = `/${published.file}`;
        certificateFile = "";
        width = published.width;
        height = published.height;
        imageCount++;
      }
    }

    certificates.push({
      id,
      title: str(entry.title),
      issuer: str(entry.issuer),
      dateIssued: str(entry.dateIssued),
      dateExpires: str(entry.dateExpires),
      credentialId: str(entry.credentialId),
      credentialUrl: str(entry.credentialUrl),
      description: str(entry.description),
      skills: list(entry.skills),
      certificateImage,
      certificateImageWidth: width,
      certificateImageHeight: height,
      certificateFile,
      sourceFileType,
      extractedText: str(entry.extractedText),
      addedAt: str(entry.addedAt) || today,
    });
  }

  writeJson(PROFILE_JSON, profile);
  writeJson(EXPERIENCE_JSON, experience);
  writeJson(CERTS_JSON, certificates);

  return {
    written: [PROFILE_JSON, EXPERIENCE_JSON, CERTS_JSON].map((f) => path.relative(ROOT, f).replace(/\\/g, "/")),
    images: imageCount,
    counts: {
      education: profile.education.length,
      experience: experience.length,
      certificates: certificates.length,
    },
  };
}
