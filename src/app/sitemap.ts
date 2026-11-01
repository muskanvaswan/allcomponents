import type { MetadataRoute } from "next";
import { categoryCounts, componentDates, listLibraries } from "@/lib/db";
import { SITE_URL } from "@/lib/site";

// Built with each deploy from the read-only snapshot, so it lists the whole
// collection: the home page, each category and library, and every component.
export default function sitemap(): MetadataRoute.Sitemap {
  const ready = listLibraries().filter((l) => l.status === "ready");
  const lastIndexed = ready.flatMap((l) => (l.ingestedAt ? [l.ingestedAt] : [])).sort().at(-1);
  return [
    { url: SITE_URL, lastModified: lastIndexed, changeFrequency: "weekly", priority: 1 },
    ...[...categoryCounts().keys()].map((id) => ({ url: `${SITE_URL}/?category=${id}`, lastModified: lastIndexed, priority: 0.7 })),
    ...ready.map((l) => ({ url: `${SITE_URL}/?library=${l.slug}`, lastModified: l.ingestedAt ?? undefined, priority: 0.6 })),
    ...componentDates().map((c) => ({ url: `${SITE_URL}/c/${c.id}`, lastModified: c.updatedAt, priority: 0.8 })),
    { url: `${SITE_URL}/sources`, lastModified: lastIndexed, priority: 0.3 },
  ];
}
