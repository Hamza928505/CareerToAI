import { aggregateSkills, isPlaceholder, loadCertificates, PROFILE_JSON, readJson, real } from "../../lib/content.mjs";

export default () => {
  const raw = readJson(PROFILE_JSON);
  const certificates = loadCertificates();

  // Placeholder links would render as dead <a> tags, so drop them and warn
  // instead. Everything else falls back to "" via real().
  const links = (raw.links || []).filter((l) => l && l.url && !/TODO/i.test(l.url));
  const todos = Object.entries(raw)
    .filter(([, v]) => isPlaceholder(v))
    .map(([k]) => k)
    .concat((raw.links || []).length !== links.length ? ["links"] : [])
    .concat((raw.skills || []).some(isPlaceholder) ? ["skills"] : []);

  if (todos.length) {
    console.warn(`[profile] Still using placeholder values for: ${todos.join(", ")} — edit data/profile.json.`);
  }

  return {
    ...raw,
    name: real(raw.name) || "Unnamed Profile",
    headline: real(raw.headline),
    bio: real(raw.bio),
    location: real(raw.location),
    email: real(raw.email),
    jobTitle: real(raw.jobTitle),
    worksFor: real(raw.worksFor),
    pronouns: real(raw.pronouns),
    links,
    skills: aggregateSkills(raw.skills, certificates),
    certificateCount: certificates.length,
    hasPlaceholders: todos.length > 0,
  };
};
