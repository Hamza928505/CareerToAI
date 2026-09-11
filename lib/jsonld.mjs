// schema.org structured data builders. Kept out of the templates so the exact
// shape is reviewable in one place — this is the payload most AI crawlers and
// search engines parse first.
//
// The site is a single page, so every node lives in one graph on "/" and is
// addressed by a fragment on that URL. Nothing points at a URL that does not
// exist.

const clean = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
};

const credentialId = (cert, abs) => `${abs("/")}#credential-${cert.id}`;
const projectId = (project, abs) => `${abs("/")}#project-${project.id}`;
const personId = (abs) => abs("/") + "#person";

export function credentialNode(cert, abs) {
  return clean({
    "@type": "EducationalOccupationalCredential",
    "@id": credentialId(cert, abs),
    name: cert.title,
    description: cert.description,
    credentialCategory: "certificate",
    recognizedBy: { "@type": "Organization", name: cert.issuer },
    dateCreated: cert.issued ? cert.issued.iso : undefined,
    validFrom: cert.issued ? cert.issued.iso : undefined,
    expires: cert.expires ? cert.expires.iso : undefined,
    identifier: cert.credentialId,
    // The issuer's own verification page, when the certificate prints one.
    url: cert.credentialUrl || undefined,
    competencyRequired: cert.skills,
    image: cert.certificateImage ? abs(cert.certificateImage) : undefined,
  });
}

/**
 * A project is a CreativeWork the person authored — SoftwareSourceCode when it
 * carries a repository, since that is the type search engines actually
 * understand for code. schema.org has no inverse of `author` on Person, so the
 * link runs project -> person and the whole graph travels in one document.
 */
export function projectNode(project, abs) {
  return clean({
    "@type": project.sourceUrl ? "SoftwareSourceCode" : "CreativeWork",
    "@id": projectId(project, abs),
    name: project.name,
    description: project.description,
    author: { "@id": personId(abs) },
    // The project's own home page, when it has one; the repository is separate
    // so a reader is never sent to the code when a live thing exists.
    url: project.url || undefined,
    codeRepository: project.sourceUrl || undefined,
    sourceOrganization: project.organization
      ? { "@type": "Organization", name: project.organization }
      : undefined,
    dateCreated: project.started ? project.started.iso : undefined,
    datePublished: project.ended ? project.ended.iso : undefined,
    keywords: project.skills,
    image: project.attachmentImage ? abs(project.attachmentImage) : undefined,
  });
}

export function personNode(profile, certificates, experience, abs) {
  return clean({
    "@type": "Person",
    "@id": personId(abs),
    name: profile.name,
    givenName: profile.firstName,
    familyName: profile.lastName,
    url: abs("/"),
    description: profile.bio,
    disambiguatingDescription: profile.headline,
    jobTitle: profile.jobTitle,
    email: profile.email ? `mailto:${profile.email}` : "",
    address: profile.location
      ? { "@type": "PostalAddress", name: profile.location }
      : undefined,
    worksFor: profile.worksFor
      ? { "@type": "Organization", name: profile.worksFor }
      : undefined,
    sameAs: (profile.links || []).map((l) => l.url),
    knowsAbout: (profile.skills || []).map((s) => s.name),
    // The level goes in alternateName rather than being glued onto the name:
    // "German" is the language, "C1 (advanced)" is how well you work in it, and
    // a consumer reading `name` should get a language it recognises.
    knowsLanguage: (profile.languages || []).map((l) =>
      clean({
        "@type": "Language",
        name: l.language,
        alternateName: l.level || undefined,
        description: l.notes || undefined,
      })
    ),
    hasCredential: certificates.map((c) => ({ "@id": credentialId(c, abs) })),
    alumniOf: (profile.education || []).map((e) =>
      clean({
        "@type": "EducationalOrganization",
        name: e.school,
        description: [e.degree, e.fieldOfStudy, e.industry].filter(Boolean).join(", "),
      })
    ),
    // schema.org has no clean "past job" type, so each role becomes an
    // Occupation carrying the employer, dates and skills as plain fields.
    hasOccupation: (experience || []).map((role) =>
      clean({
        "@type": "Occupation",
        name: role.title,
        description: role.description,
        occupationalCategory: role.employmentType,
        skills: role.skills,
        hiringOrganization: role.organization
          ? { "@type": "Organization", name: role.organization }
          : undefined,
        startDate: role.started ? role.started.iso : undefined,
        endDate: role.ended ? role.ended.iso : undefined,
      })
    ),
  });
}

/**
 * The whole profile: the Person, every credential it holds and every project it
 * authored, inline in one graph.
 */
export function personGraph(profile, certificates, experience, projects, abs) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      personNode(profile, certificates, experience, abs),
      ...certificates.map((c) => credentialNode(c, abs)),
      ...(projects || []).map((p) => projectNode(p, abs)),
    ],
  };
}
