import "server-only";
import { categoryCounts, getComponent, getLibrary, listLibraries, toSummary } from "./db";
import { parseRegistryName, registryItem, registryName } from "./registry";
import { alternativesFor, searchComponents } from "./search";
import { loadSource } from "./source";
import { CATEGORIES, CATEGORY_BY_ID } from "./taxonomy";
import type { Component, ComponentSummary } from "./types";

// The collection as an agent sees it. /api/alternatives, the MCP tools at /mcp
// and /llms.txt all answer from here. Every result carries what an agent needs
// to choose and install a component (install command, registry item,
// dependencies) and links a person can open to look at it first.

const DEFAULT_RESULTS = 8;
const MAX_RESULTS = 24;

export function originFrom(headers: Headers) {
  return `${headers.get("x-forwarded-proto") ?? "http"}://${headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost"}`;
}

export function agentComponent(c: ComponentSummary, origin: string) {
  const item = `${origin}/r/${registryName(c)}.json`;
  return {
    id: c.id,
    name: c.name,
    library: c.libraryName,
    category: CATEGORY_BY_ID.get(c.category)?.label ?? c.category,
    description: c.description ?? null,
    animated: c.animated,
    framework: c.framework ?? null,
    dependencies: c.dependencies,
    install: `npx shadcn@latest add ${item}`,
    registryItem: item,
    preview: `${origin}/preview/${c.id}`,
    page: `${origin}/c/${c.id}`,
    docs: c.docsUrl ?? null,
  };
}

/** A component by id (`magicui/marquee`) or registry name (`magicui--marquee`). */
function lookup(ref: string): Component | null {
  const id = ref.trim().replace(/^\/+|\/+$/g, "");
  return getComponent(id) ?? getComponent(parseRegistryName(id) ?? "");
}

const clamp = (limit: number | undefined) => Math.min(MAX_RESULTS, Math.max(1, Math.floor(limit || DEFAULT_RESULTS)));

export type AlternativesRequest = { for?: string | null; query?: string | null; category?: string | null; library?: string | null; limit?: number };

/**
 * `for`: other libraries' takes on a component you already have (same
 * category, other libraries first). `query`: candidates for something you
 * need, described in words. `library` narrows either to one or more library
 * slugs, comma-separated.
 */
export function findAlternatives(req: AlternativesRequest, origin: string) {
  const limit = clamp(req.limit);
  const libraries = req.library?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  if (req.for) {
    const c = lookup(req.for);
    if (!c) return { error: `No component "${req.for}". Use an id from a search result, like "magicui/marquee".` };
    const pool = alternativesFor(c, libraries.length ? 400 : limit);
    const results = (libraries.length ? pool.filter((o) => libraries.includes(o.librarySlug)) : pool).slice(0, limit);
    return { for: agentComponent(toSummary(c), origin), category: CATEGORY_BY_ID.get(c.category)?.label ?? c.category, results: results.map((o) => agentComponent(o, origin)) };
  }
  if (req.query || req.category) {
    const result = searchComponents({ query: req.query ?? undefined, category: req.category ?? undefined, library: libraries.join(",") || undefined, limit });
    const detected = result.detectedCategories[0];
    return {
      query: req.query ?? null,
      category: req.category ? (CATEGORY_BY_ID.get(req.category)?.label ?? req.category) : detected ? (CATEGORY_BY_ID.get(detected)?.label ?? null) : null,
      total: result.total,
      results: result.items.map((o) => agentComponent(o, origin)),
    };
  }
  return { error: 'Pass `query` (what you need, like "animated pricing table") or `for` (a component id, like "magicui/marquee").' };
}

/** One component with its full source files, as the shadcn registry serves it. */
export async function componentSource(ref: string, origin: string) {
  const c = lookup(ref);
  const lib = c && getLibrary(c.libraryId);
  if (!c || !lib) return { error: `No component "${ref}". Use an id from a search result, like "magicui/marquee".` };
  const full = await loadSource(c, lib);
  const item = registryItem(full);
  return { ...agentComponent(toSummary(full), origin), files: item.files, registryDependencies: item.registryDependencies };
}

/** The categories and libraries there are to filter by, with how many components each holds. */
export function catalogue() {
  const counts = categoryCounts();
  return {
    categories: CATEGORIES.filter((c) => counts.get(c.id)).map((c) => ({ id: c.id, label: c.label, group: c.group, components: counts.get(c.id) ?? 0 })),
    libraries: listLibraries()
      .filter((l) => l.status === "ready")
      .map((l) => ({ slug: l.slug, name: l.name, url: l.url, components: l.componentCount })),
  };
}
