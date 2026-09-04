/**
 * Generate the job-search framework's candidate profile from the site's data.
 *
 *   node scripts/build-profile-md.mjs [--check]
 *
 * `data/*.json` is the single source of truth for who you are: the editor at
 * /editor/ writes it, the site publishes it, and this script renders it into
 * `.claude/skills/job-application-assistant/01-candidate-profile.md`, which is
 * what `/apply`, `/rank`, `/interview` and `/upskill` actually read. Edit the
 * JSON (or `/editor/`), re-run this, and both projects agree.
 *
 * The parts the site JSON does not model — phone, working languages,
 * publications, awards, references — live in `data/profile-extras.json`.
 *
 * Nothing here invents a fact. A field you have not filled in renders as an
 * explicit "not set" line, because a fabricated profile is worse than a thin
 * one: the framework's whole factual-grounding rule depends on this file being
 * true.
 *
 * `--check` writes nothing and exits non-zero if the file is out of date,
 * which is what CI should run.
 */

import fs from "node:fs";
import path from "node:path";

import {
  ROOT,
  PROFILE_JSON,
  aggregateSkills,
  buildProfile,
  formatDateRange,
  loadCertificates,
  loadExperience,
  readJson,
  real,
} from "../lib/content.mjs";

const OUT = path.join(
  ROOT, ".claude", "skills", "job-application-assistant", "01-candidate-profile.md",
);
const EXTRAS_JSON = path.join(ROOT, "data", "profile-extras.json");

const BANNER = [
  "<!-- GENERATED FILE - do not edit by hand. -->",
  "<!-- Source: data/profile.json, data/experience.json, data/certificates.json, data/profile-extras.json -->",
  "<!-- Rebuild: npm run profile   (check in CI: npm run profile:check) -->",
].join("\n");

/** An unset field says so. It never guesses, and never leaves a stray placeholder. */
const orNotSet = (value, what) => {
  const v = real(value);
  return v || `_not set — add it to ${what}_`;
};

function identity(profile, extras) {
  const link = (label) =>
    profile.links.find((l) => (l.label || "").toLowerCase().includes(label))?.url || "";

  return [
    "## Identity",
    `- **Name:** ${orNotSet(profile.name === "Unnamed Profile" ? "" : profile.name, "data/profile.json")}`,
    `- **Location:** ${orNotSet(profile.location, "data/profile.json")}`,
    `- **Phone:** ${orNotSet(extras.phone, "data/profile-extras.json")}`,
    `- **Email:** ${orNotSet(profile.email, "data/profile.json")}`,
    `- **LinkedIn:** ${link("linkedin") || "_not set — add it to data/profile.json links_"}`,
    `- **GitHub:** ${link("github") || "_not set — add it to data/profile.json links_"}`,
    `- **Status:** ${orNotSet(extras.employmentStatus, "data/profile-extras.json")}`,
    `- **Constraints:** ${orNotSet(extras.constraints, "data/profile-extras.json")}`,
  ].join("\n");
}

function languages(extras) {
  const rows = (extras.languages || []).filter((l) => real(l.language) && real(l.level));
  const head = [
    "### Languages",
    "",
    "<!-- The Language Gate in 04-job-evaluation.md treats an undeclared language as a hard",
    "no, not a gap to smooth over. Edit data/profile-extras.json, not this file. -->",
    "",
  ];
  if (!rows.length) {
    return head.concat([
      "_No working languages declared. Until you add them to `data/profile-extras.json`,",
      "the Language Gate has nothing to check and every language-conditional posting must",
      "be flagged for your own judgment rather than filtered._",
    ]).join("\n");
  }
  return head.concat([
    "| Language | Level | Notes |",
    "|----------|-------|-------|",
    ...rows.map((l) => `| ${l.language} | ${l.level} | ${real(l.notes)} |`),
  ]).join("\n");
}

function education(profile) {
  const rows = profile.education || [];
  if (!rows.length) return "## Education\n\n_No education entries in `data/profile.json`._";
  return [
    "## Education",
    "",
    "| Degree | Period | Institution | Key Topics |",
    "|--------|--------|-------------|------------|",
    ...rows.map((e) => {
      const degree = [real(e.degree), real(e.fieldOfStudy)].filter(Boolean).join(", ");
      const period = formatDateRange(e.startDate, e.endDate);
      const topics = real(e.description) || real(e.industry);
      return `| ${degree || real(e.school)} | ${period || "—"} | ${real(e.school)} | ${topics} |`;
    }),
  ].join("\n");
}

function experienceSection(experience) {
  if (!experience.length) {
    return "## Professional Experience\n\n_No entries in `data/experience.json`._";
  }
  const blocks = experience.map((e) => {
    const period = formatDateRange(e.startDate, e.endDate);
    const where = [real(e.location), real(e.locationType), real(e.employmentType)]
      .filter(Boolean).join(" · ");
    const lines = [`### ${real(e.title)} - ${real(e.organization)} (${period})`];
    if (where) lines.push(where);
    const desc = real(e.description);
    if (desc) {
      lines.push("");
      for (const s of desc.split(/(?<=\.)\s+(?=[A-Z])/).filter(Boolean)) lines.push(`- ${s.trim()}`);
    }
    if (e.skills?.length) lines.push(`- Skills: ${e.skills.join(", ")}`);
    return lines.join("\n");
  });
  return ["## Professional Experience", "", blocks.join("\n\n")].join("\n");
}

function skillsSection(skills, certificates) {
  const named = skills.map((s) => s.name);
  const backed = skills.filter((s) => s.count > 0).map((s) => s.name);
  const declared = skills.filter((s) => s.count === 0).map((s) => s.name);

  const out = ["## Technical Skills", ""];
  out.push("<!-- Aggregated from data/profile.json skills plus every skill tagged on a role or");
  out.push("certificate. The split below is what /upskill and the Fit score read: evidenced");
  out.push("skills carry a certificate or a role behind them, declared ones do not (yet). -->");
  out.push("");
  out.push("### Evidenced by a role or certificate");
  out.push(backed.length ? backed.map((s) => `- ${s}`).join("\n") : "_none yet_");
  out.push("");
  out.push("### Declared, not yet evidenced");
  out.push(declared.length ? declared.map((s) => `- ${s}`).join("\n") : "_none_");
  out.push("");
  out.push("### Certifications");
  out.push(
    certificates.length
      ? certificates.map((c) => {
          const when = real(c.dateIssued) ? ` (${real(c.dateIssued)})` : "";
          return `- **${real(c.title)}** — ${real(c.issuer)}${when}`;
        }).join("\n")
      : "_No certificates in `data/certificates.json`._",
  );
  out.push("");
  out.push(`_${named.length} skills total._`);
  return out.join("\n");
}

const listSection = (title, items, render, emptyHint) =>
  [
    `## ${title}`,
    "",
    items?.length ? items.map(render).join("\n") : `_${emptyHint}_`,
  ].join("\n");

function render() {
  const profile = buildProfile(readJson(PROFILE_JSON), {
    certificates: loadCertificates(),
    experience: loadExperience(),
  });
  const certificates = loadCertificates();
  const experience = loadExperience();
  const extras = fs.existsSync(EXTRAS_JSON) ? readJson(EXTRAS_JSON) : {};
  const skills = aggregateSkills(profile.skills, certificates, experience);

  return [
    "---",
    "framework_version: 1.1.1",
    "generated: true",
    "---",
    "",
    BANNER,
    "",
    "# Candidate Profile",
    "",
    identity(profile, extras),
    "",
    languages(extras),
    "",
    education(profile),
    "",
    experienceSection(experience),
    "",
    listSection(
      "Independent Projects", extras.projects,
      (p) => `- **${real(p.name)}**: ${real(p.description)}`,
      "No projects listed. Add them to data/profile-extras.json.",
    ),
    "",
    skillsSection(skills, certificates),
    "",
    listSection(
      "Publications", extras.publications,
      (p, i) => `${i + 1}. ${real(p.citation)}`,
      "No publications listed. Add them to data/profile-extras.json.",
    ),
    "",
    listSection(
      "Awards", extras.awards,
      (a) => `- ${real(a.title)}${real(a.event) ? ` - ${real(a.event)}` : ""}${real(a.year) ? ` (${real(a.year)})` : ""}`,
      "No awards listed. Add them to data/profile-extras.json.",
    ),
    "",
    listSection(
      "References", extras.references,
      (r) => `- ${real(r.name)}, ${real(r.title)}, ${real(r.company)} (${real(r.email)})`,
      "No references listed. Add them to data/profile-extras.json.",
    ),
    "",
  ].join("\n") + "\n";
}

const wanted = render();
const check = process.argv.includes("--check");
const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";

if (check) {
  if (current.replace(/\r\n/g, "\n") !== wanted) {
    console.error(
      `${path.relative(ROOT, OUT)} is out of date with data/*.json. Run: npm run profile`,
    );
    process.exit(1);
  }
  console.log(`${path.relative(ROOT, OUT)} is up to date.`);
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, wanted, "utf8");
  console.log(`Wrote ${path.relative(ROOT, OUT)}`);
  console.log(`  source    data/profile.json, experience.json, certificates.json, profile-extras.json`);
}
