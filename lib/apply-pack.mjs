/**
 * The details an employer's web form asks for first, as label/value pairs ready to copy.
 * Built from the spine files only, so a missing value is shown as missing rather than invented.
 */
export function buildApplyPack(profile = {}, extras = {}) {
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  const school = (profile.education || [])[0];
  const fields = [
    ["Full name", name],
    ["First name", profile.firstName],
    ["Last name", profile.lastName],
    ["Email", profile.email],
    ["Phone", extras.phone],
    ["Location", profile.location],
    ["Current studies", school && [school.degree, school.fieldOfStudy, school.school].filter(Boolean).join(", ")],
    ["Languages", (profile.languages || []).map((l) => `${l.language} (${l.level})`).join("; ")],
    ["Employment status", extras.employmentStatus],
    ...(profile.links || []).map((l) => [l.label, l.url]),
  ];
  return fields.map(([label, value]) => ({ label, value: String(value || "").trim() }));
}
