import {
  PROFILE_JSON,
  buildProfile,
  isPlaceholder,
  loadCertificates,
  loadExperience,
  readJson,
} from "../../lib/content.mjs";

export default () => {
  const raw = readJson(PROFILE_JSON);
  const profile = buildProfile(raw, {
    certificates: loadCertificates(),
    experience: loadExperience(),
  });

  // Placeholder links and TODO values are dropped by buildProfile rather than
  // published; say which ones so a fresh clone knows what is still unset.
  const todos = Object.entries(raw)
    .filter(([, v]) => isPlaceholder(v))
    .map(([k]) => k);
  if ((raw.links || []).length !== profile.links.length) todos.push("links");
  if ((raw.skills || []).some(isPlaceholder)) todos.push("skills");
  if ((raw.education || []).some((e) => isPlaceholder(e.school))) todos.push("education");

  if (todos.length) {
    console.warn(`[profile] Still using placeholder values for: ${todos.join(", ")} — edit data/profile.json or use /editor/.`);
  }

  return { ...profile, hasPlaceholders: todos.length > 0 };
};
