import type { MetadataRoute } from "next";
import { componentDates, listLibraries } from "@/lib/db";
import { SITE_URL } from "@/lib/site";

// Built with each deploy from the read-only snapshot. It lists only the canonical,
// prerendered pages: the home page, every component and the library list. Filtered
// views of the home page (/browse?category=…) are left out, as robots.txt keeps crawlers off them.
export default function sitemap(): MetadataRoute.Sitemap {
  const ready = listLibraries().filter((l) => l.status === "ready");
  const lastIndexed = ready.flatMap((l) => (l.ingestedAt ? [l.ingestedAt] : [])).sort().at(-1);
  return [
    { url: SITE_URL, lastModified: lastIndexed, changeFrequency: "weekly", priority: 1 },
    ...componentDates().map((c) => ({ url: `${SITE_URL}/c/${c.id}`, lastModified: c.updatedAt, priority: 0.8 })),
    { url: `${SITE_URL}/sources`, lastModified: lastIndexed, priority: 0.3 },
  ];
}
