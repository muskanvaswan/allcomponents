// The site's name, what it says about itself, and where it lives, for page
// titles, search results, link previews and agents.

export const SITE_NAME = "Components";

/** The home page's title, which says what the site is. */
export const SITE_TITLE = `${SITE_NAME}: a UI component aggregator`;

/** For search results and link previews: under 160 characters, so it isn't cut off. */
export const SITE_DESCRIPTION =
  "An aggregator of UI components: browse components from many UI libraries in one place, sorted by category, with live previews and links to the originals.";

/**
 * The site's public address. Set SITE_URL to the domain it's served from; on
 * Vercel it falls back to the project's production domain.
 */
export const SITE_URL =
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : `http://localhost:${process.env.PORT ?? 3000}`);

/** Structured data for search engines, as a script tag's contents. `<` is escaped so text can't close the tag. */
export const jsonLd = (data: object) => JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c");
