// Directory data file for everything under src/.
//
// <title>, <meta name="description"> and the Open Graph tags are rendered by
// _includes/base.njk, which only sees the data cascade — a `{% set %}` inside a
// page body would not reach it. Computing them here keeps the metadata derived
// from the real profile data instead of hand-copied strings.
export default {
  eleventyComputed: {
    title: (data) => {
      // A page may state its own title in front matter as `pageTitle`; reading
      // `data.title` here instead would be circular.
      if (data.pageTitle) return data.pageTitle;
      return data.profile.headline
        ? `${data.profile.name} — ${data.profile.headline}`
        : data.profile.name;
    },

    description: (data) => {
      if (data.pageDescription) return data.pageDescription;
      return data.profile.bio || data.profile.headline || `Profile of ${data.profile.name}.`;
    },
  },
};
