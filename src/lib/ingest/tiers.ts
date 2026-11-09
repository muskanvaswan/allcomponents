import { fetchText } from "./fetch";
import { parseLlmsTxt, slugify } from "./links";

// Libraries that sell some components alongside free ones often say which is which in their llms.txt, ending each
// entry with "(free)" or "(pro)". Only the free ones are gathered here: the paid ones are a product, even when the
// library's registry serves them to anyone.
const FREE = /\(free\)\s*$/i;
const PAID = /\((?:pro|paid|premium|plus)\)\s*$/i;

/** The slugs of the items a library marks free (by each entry's link and its title). */
export type Tiers = { free: Set<string>; paid: number };

/**
 * Reads the llms.txt at each site's origin and returns the items it marks free, or null when none of them marks
 * any item free or paid (then everything is gathered, as before).
 */
export async function tiersFromLlmsTxt(siteUrls: string[]): Promise<Tiers | null> {
  for (const origin of new Set(siteUrls.map((u) => new URL(u).origin))) {
    const res = await fetchText(`${origin}/llms.txt`, { timeoutMs: 15_000, retries: 1 }).catch(() => null);
    if (!res?.ok || !/text\/(plain|markdown)/.test(res.contentType)) continue;
    const tiers: Tiers = { free: new Set(), paid: 0 };
    for (const entry of parseLlmsTxt(res.text, res.url)) {
      if (PAID.test(entry.description ?? "")) tiers.paid++;
      if (!FREE.test(entry.description ?? "")) continue;
      const last = new URL(entry.href).pathname.split("/").filter(Boolean).at(-1);
      if (last) tiers.free.add(slugify(last));
      tiers.free.add(slugify(entry.title));
    }
    if (tiers.free.size || tiers.paid) return tiers;
  }
  return null;
}

/** Whether an item, by its name or title, is one the library marks free. */
export function isFree(tiers: Tiers, name: string, title?: string): boolean {
  return tiers.free.has(slugify(name)) || (title ? tiers.free.has(slugify(title)) : false);
}
