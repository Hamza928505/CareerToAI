// Directory data file for everything under src/.
//
// <title>, <meta name="description"> and the Open Graph tags are rendered by
// _includes/base.njk, which only sees the data cascade — a `{% set %}` inside a
// page body would not reach it. Computing them here keeps every page's metadata
// derived from the real profile/certificate data instead of hand-copied strings.
export default {
  eleventyComputed: {
    title: (data) => {
      if (data.certificate) {
        return `${data.certificate.title} — ${data.certificate.issuer} — ${data.profile.name}`;
      }
      if (data.schemaType === "collection") {
        return `Certificates — ${data.profile.name}`;
      }
      if (data.schemaType === "person") {
        return data.profile.headline
          ? `${data.profile.name} — ${data.profile.headline}`
          : data.profile.name;
      }
      return data.profile.name;
    },

    description: (data) => {
      if (data.certificate) {
        const when = data.certificate.issued ? ` Issued ${data.certificate.issued.iso}.` : "";
        return `${data.certificate.title}, issued by ${data.certificate.issuer} to ${data.profile.name}.${when} ${data.certificate.description}`;
      }
      if (data.schemaType === "collection") {
        return `Every certification and credential held by ${data.profile.name} — ${data.certificates.length} in total, with issuer, dates and the skills each one covers.`;
      }
      if (data.schemaType === "person") {
        return data.profile.bio || data.profile.headline || `Profile of ${data.profile.name}.`;
      }
      return `Profile of ${data.profile.name}.`;
    },

    ogImage: (data) => (data.certificate ? data.certificate.certificateImage : ""),

    ogImageAlt: (data) =>
      data.certificate
        ? `Certificate: ${data.certificate.title}, issued by ${data.certificate.issuer}`
        : "",
  },
};
