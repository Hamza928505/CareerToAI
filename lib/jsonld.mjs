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

export function personNode(profile, certificates, experience, abs) {
  return clean({
    "@type": "Person",
    "@id": abs("/") + "#person",
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

/** The whole profile: the Person plus every credential it holds, inline. */
export function personGraph(profile, certificates, experience, abs) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      personNode(profile, certificates, experience, abs),
      ...certificates.map((c) => credentialNode(c, abs)),
    ],
  };
}
