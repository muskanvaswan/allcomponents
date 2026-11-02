// The site's name, what it says about itself, and where it lives, for page
// titles, search results, link previews and agents.

export const SITE_NAME = "Components";

/** The home page's title, which says what the site is. */
export const SITE_TITLE = `${SITE_NAME}: a UI component aggregator`;

/** For search results and link previews: under 160 characters, so it isn't cut off. */
export const SITE_DESCRIPTION =
  "An aggregator of React and Tailwind UI components from shadcn/ui, Magic UI and more, sorted by category, with live previews and install commands.";

/** What people search for when they're after a site like this, for search engines that still read keywords. */
export const SITE_KEYWORDS = [
  "UI components",
  "UI component aggregator",
  "React components",
  "Tailwind CSS components",
  "shadcn/ui",
  "shadcn registry",
  "Magic UI",
  "component library",
  "animated components",
  "copy and paste components",
];

/**
 * The site's public address. Set SITE_URL to the domain it's served from; on
 * Vercel it falls back to the project's production domain.
 */
export const SITE_URL =
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : `http://localhost:${process.env.PORT ?? 3000}`);

/** The order libraries are listed in everywhere, by slug. Libraries not named here follow, newest first. */
export const LIBRARY_ORDER = ["easyui", "rare-ui", "pin-ui", "magicui", "boardui", "ui-shadcn"];

/** A library's place in LIBRARY_ORDER, for sorting; libraries not named there all share the last place. */
export const libraryRank = (slug: string) => (LIBRARY_ORDER.includes(slug) ? LIBRARY_ORDER.indexOf(slug) : LIBRARY_ORDER.length);

/**
 * Installs the agent skill that has coding agents look here for a component before writing one, and show the
 * alternatives when several fit. The site serves it at /skill (src/app/skill/route.ts).
 */
export const SKILL_INSTALL = `npx skills add ${SITE_URL}/skill`;

/** Structured data for search engines, as a script tag's contents. `<` is escaped so text can't close the tag. */
export const jsonLd = (data: object) => JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c");
