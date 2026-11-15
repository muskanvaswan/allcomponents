import type { Metadata } from "next";
import { Browse, hrefWith, libraryNames, one } from "@/components/browse";
import { categoryCounts, listLibraries } from "@/lib/db";
import { SITE_NAME } from "@/lib/site";
import { CATEGORY_BY_ID } from "@/lib/taxonomy";

// The home page's filtered, searched and paged views (/browse?category=…&library=…&q=…&page=…). Splitting them
// off lets the plain home page stay fully static; this route reads the query and renders on request. Old links in
// the /?category=… form are redirected here (next.config.ts).

const NOINDEX = { index: false, follow: true };

/**
 * Filtered views keep one address each (filters and page number in a fixed order) as their canonical, but none is
 * indexed: robots.txt keeps crawlers off them, since the combinations are endless and each one runs on request.
 */
export async function generateMetadata({ searchParams }: PageProps<"/browse">): Promise<Metadata> {
  const sp = await searchParams;
  const q = one(sp.q);
  const ready = listLibraries().filter((l) => l.status === "ready");
  const picked = one(sp.library)?.split(",") ?? [];
  const chosen = ready.filter((l) => picked.includes(l.slug));
  const category = CATEGORY_BY_ID.get(one(sp.category) ?? "");
  const page = Math.max(1, Number(one(sp.page) ?? 1) || 1);
  const canonical = hrefWith({}, { category: category?.id, library: chosen.map((l) => l.slug).join(",") || undefined, page: page > 1 ? String(page) : undefined });
  // The layout's "%s · Components" title template only reaches pages below it, so the home page adds the name itself.
  if (q) return { title: { absolute: `Search for “${q}” · ${SITE_NAME}` }, robots: NOINDEX, alternates: { canonical } };
  if (!category && !chosen.length && page === 1) return { robots: NOINDEX, alternates: { canonical } };

  const from = libraryNames((chosen.length ? chosen : ready).map((l) => l.name));
  const count = category ? (categoryCounts({ library: chosen.map((l) => l.slug).join(",") || undefined }).get(category.id) ?? 0) : chosen.reduce((n, l) => n + l.componentCount, 0);
  const what = category ? category.label : `${from} components`;
  const title = `${category && chosen.length ? `${category.label} from ${from}` : what}${page > 1 ? ` (page ${page})` : ""}`;
  const description = `${count} ${category ? category.label.toLowerCase() : "components"} from ${from}, gathered by ${SITE_NAME}, a UI component aggregator, with live previews and links to the originals.`;
  return { title: { absolute: `${title} · ${SITE_NAME}` }, description, robots: NOINDEX, alternates: { canonical }, openGraph: { title, description, url: canonical } };
}

export default function BrowsePage({ searchParams }: PageProps<"/browse">) {
  return <Browse searchParams={searchParams} />;
}
