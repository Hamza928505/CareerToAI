// Builds the plain-text profile served at /llms.txt and /about.txt.
//
// This is a deliberate concession to AI tools that fetch pages as text: one
// dense, unambiguous document beats making them infer structure from HTML and
// CSS. Everything a detail page says appears here too, so a single fetch is
// enough to answer "what do you know about this person".
import { formatDate } from "./content.mjs";

const rule = (char = "=") => char.repeat(72);

function section(heading, body) {
  const lines = Array.isArray(body) ? body : [body];
  // Keep "" entries: they are deliberate blank separator lines inside a section.
  const content = lines.filter((l) => l !== null && l !== undefined);
  if (!content.some((l) => String(l).trim())) return [];
  return ["", heading.toUpperCase(), rule("-"), ...content];
}

function certificateBlock(cert, index, abs) {
  const lines = [
    "",
    `${index + 1}. ${cert.title}`,
    `   Issuer: ${cert.issuer}`,
  ];
  if (cert.issued) lines.push(`   Issued: ${formatDate(cert.dateIssued)} (${cert.issued.iso})`);
  if (cert.expires) {
    const label = cert.isExpired ? "Expired" : "Valid until";
    lines.push(`   ${label}: ${formatDate(cert.dateExpires)} (${cert.expires.iso})`);
  } else {
    lines.push("   Expiry: none stated");
  }
  if (cert.credentialId) lines.push(`   Credential ID: ${cert.credentialId}`);
  if (cert.credentialUrl) lines.push(`   Verify at: ${cert.credentialUrl}`);
  lines.push(`   On the profile page: ${abs("/")}${cert.fragment}`);
  if (cert.skills.length) lines.push(`   Skills: ${cert.skills.join(", ")}`);
  lines.push(`   Summary: ${cert.description}`);
  if (cert.extractedText) {
    lines.push(`   Text read from the certificate: ${cert.extractedText}`);
  }
  return lines;
}

function experienceBlock(role, index) {
  const lines = ["", `${index + 1}. ${role.title}${role.organization ? ` — ${role.organization}` : ""}`];
  if (role.dateRange) lines.push(`   Dates: ${role.dateRange}`);
  if (role.employmentType) lines.push(`   Type: ${role.employmentType}`);
  if (role.location || role.locationType) {
    lines.push(`   Location: ${[role.location, role.locationType].filter(Boolean).join(" · ")}`);
  }
  if (role.skills.length) lines.push(`   Skills: ${role.skills.join(", ")}`);
  if (role.description) lines.push(`   ${role.description}`);
  return lines;
}

function projectBlock(project, index) {
  const lines = ["", `${index + 1}. ${project.name}`];
  if (project.role || project.organization) {
    lines.push(`   ${[project.role, project.organization].filter(Boolean).join(" · ")}`);
  }
  if (project.dateRange) lines.push(`   Dates: ${project.dateRange}`);
  if (project.url) lines.push(`   Project: ${project.url}`);
  if (project.sourceUrl) lines.push(`   Source: ${project.sourceUrl}`);
  if (project.skills.length) lines.push(`   Skills: ${project.skills.join(", ")}`);
  if (project.description) lines.push(`   ${project.description}`);
  return lines;
}

function educationBlock(entry, index) {
  const qualification = [entry.degree, entry.fieldOfStudy].filter(Boolean).join(", ");
  const lines = ["", `${index + 1}. ${entry.school}`];
  if (qualification) lines.push(`   Qualification: ${qualification}`);
  if (entry.industry) lines.push(`   Industry: ${entry.industry}`);
  if (entry.dateRange) lines.push(`   Dates: ${entry.dateRange}`);
  if (entry.description) lines.push(`   ${entry.description}`);
  return lines;
}

export function buildProfileText({ profile, certificates, experience = [], projects = [], site, abs }) {
  const out = [];

  out.push(rule());
  out.push(profile.name.toUpperCase());
  if (profile.headline) out.push(profile.headline);
  out.push(rule());
  out.push("");
  out.push(
    "This is a plain-text summary of the profile at " + abs("/") + ", published by",
    "its subject and intended to be read by AI assistants, search crawlers and anyone",
    "else who wants the facts without parsing HTML. Nothing here is behind a login or",
    "a bot check. The same content is available as semantic HTML at the URL above and",
    "as JSON at " + abs("/data/certificates.json") + "."
  );
  out.push("");
  out.push(`Last built: ${site.buildDay}`);

  out.push(...section("About", profile.bio || "(no bio written yet)"));

  const contact = [];
  if (profile.jobTitle) contact.push(`Role: ${profile.jobTitle}`);
  if (profile.worksFor) contact.push(`Organization: ${profile.worksFor}`);
  if (profile.location) contact.push(`Location: ${profile.location}`);
  if (profile.pronouns) contact.push(`Pronouns: ${profile.pronouns}`);
  if (profile.email) contact.push(`Email: ${profile.email}`);
  for (const link of profile.links) contact.push(`${link.label}: ${link.url}`);
  out.push(...section("Contact and links", contact.length ? contact : "(none listed)"));

  // High in the file on purpose: for a job in another country, what you can
  // work in decides whether the rest is worth reading.
  const languages = (profile.languages || []).map((l) =>
    [`${l.language}${l.level ? ` — ${l.level}` : ""}`, l.notes ? `(${l.notes})` : ""]
      .filter(Boolean)
      .join(" ")
  );
  out.push(
    ...section(
      `Languages (${languages.length})`,
      languages.length
        ? languages.map((l) => `- ${l}`)
        : "(none declared — this is not a claim that none are spoken)"
    )
  );

  out.push(
    ...section(
      `Education (${profile.education.length})`,
      profile.education.length
        ? profile.education.flatMap((entry, i) => educationBlock(entry, i))
        : ""
    )
  );

  out.push(
    ...section(
      `Experience (${experience.length})`,
      experience.length ? experience.flatMap((role, i) => experienceBlock(role, i)) : ""
    )
  );

  out.push(
    ...section(
      `Projects (${projects.length})`,
      projects.length ? projects.flatMap((project, i) => projectBlock(project, i)) : ""
    )
  );

  const skills = profile.skills.map((s) =>
    s.count ? `${s.name} (evidenced by ${s.count} entr${s.count === 1 ? "y" : "ies"})` : s.name
  );
  out.push(
    ...section(`Skills (${skills.length})`, [
      ...skills.map((s) => `- ${s}`),
      "",
      "Counts above are how many certificates, roles or projects evidence each skill.",
      "As a single comma-separated list:",
      profile.skills.map((s) => s.name).join(", "),
    ])
  );

  out.push(
    ...section(
      `Certifications and credentials (${certificates.length})`,
      certificates.length
        ? certificates.flatMap((cert, i) => certificateBlock(cert, i, abs))
        : "(none published yet)"
    )
  );

  out.push(
    ...section("Machine-readable endpoints", [
      `- ${abs("/")} — the whole profile as semantic HTML with schema.org JSON-LD`,
      `- ${abs("/llms.txt")} — this file`,
      `- ${abs("/about.txt")} — identical copy of this file`,
      `- ${abs("/data/profile.json")} — profile and education, raw JSON`,
      `- ${abs("/data/experience.json")} — work history, raw JSON`,
      `- ${abs("/data/projects.json")} — projects, raw JSON`,
      `- ${abs("/data/certificates.json")} — certifications, raw JSON`,
      `- ${abs("/sitemap.xml")} — every page`,
      "",
      "The profile is one pre-rendered static page. No JavaScript execution is needed",
      "to read any content, and robots.txt allows every crawler.",
    ])
  );

  out.push("");
  return out.join("\n");
}
