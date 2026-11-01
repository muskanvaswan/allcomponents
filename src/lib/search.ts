import "server-only";
import { filteredIds, ftsCandidates, summariesByIds, type Filters } from "./db";
import { categoriesForQuery, queryTokens } from "./taxonomy";
import type { Component, ComponentSummary } from "./types";

export type SearchOptions = Filters & { query?: string; limit?: number; offset?: number };

export type SearchResult = { total: number; items: ComponentSummary[]; detectedCategories: string[] };

const ANIMATION_WORDS = new Set(["animated", "animation", "animate", "motion", "moving"]);

/**
 * Ranks components for a query across every library. Text relevance comes from
 * SQLite FTS5; a query that names a category ("carousel") also pulls in that
 * category's members even when their names don't contain the word ("Marquee").
 * Results are interleaved by library so one big source can't drown out the rest.
 */
export function searchComponents(opts: SearchOptions): SearchResult {
  const limit = Math.min(opts.limit ?? 48, 200);
  const offset = opts.offset ?? 0;
  const filters: Filters = { category: opts.category, library: opts.library, framework: opts.framework, animated: opts.animated };
  const tokens = queryTokens(opts.query ?? "");

  if (!tokens.length) {
    const ids = filteredIds(filters);
    const items = interleave(summariesByIds(ids)).slice(offset, offset + limit);
    return { total: ids.length, items, detectedCategories: [] };
  }

  const wantsAnimation = tokens.some((t) => ANIMATION_WORDS.has(t));
  const textTokens = tokens.filter((t) => !ANIMATION_WORDS.has(t));
  const detected = categoriesForQuery(textTokens.join(" "));

  const scores = new Map<string, number>();
  if (textTokens.length) {
    const match = textTokens.map((t) => `"${t.replace(/"/g, "")}"*`).join(" OR ");
    const hits = ftsCandidates(match, filters);
    const best = Math.min(...hits.map((h) => h.rank), -1e-6);
    for (const h of hits) scores.set(h.id, (h.rank / best) * 1.0);
  }
  for (const [i, cat] of detected.entries()) {
    for (const id of filteredIds({ ...filters, category: cat }, 600)) {
      scores.set(id, (scores.get(id) ?? 0) + (i === 0 ? 0.9 : 0.5));
    }
  }
  if (!textTokens.length && wantsAnimation) {
    for (const id of filteredIds({ ...filters, animated: true }, 600)) scores.set(id, 0.5);
  }

  const components = summariesByIds([...scores.keys()]);
  for (const c of components) {
    let s = scores.get(c.id) ?? 0;
    if (detected.length && c.category === detected[0]) s += 0.4;
    if (wantsAnimation) s += c.animated ? 0.35 : -0.2;
    if (c.description) s += 0.03;
    scores.set(c.id, s);
  }
  components.sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0));

  // Keep strong matches in score order, but interleave libraries within each relevance band.
  const top = scores.get(components[0]?.id ?? "") ?? 0;
  const strong = components.filter((c) => (scores.get(c.id) ?? 0) >= top * 0.6);
  const rest = components.filter((c) => (scores.get(c.id) ?? 0) < top * 0.6);
  const ordered = [...interleave(strong), ...interleave(rest)];
  return { total: ordered.length, items: ordered.slice(offset, offset + limit), detectedCategories: detected };
}

/** Round-robins items by library, preserving each library's internal order. */
function interleave<T extends { librarySlug: string }>(items: T[]): T[] {
  const buckets = new Map<string, T[]>();
  for (const c of items) {
    const b = buckets.get(c.librarySlug);
    if (b) b.push(c);
    else buckets.set(c.librarySlug, [c]);
  }
  const out: T[] = [];
  const queues = [...buckets.values()];
  for (let i = 0; out.length < items.length; i++) {
    for (const q of queues) if (i < q.length) out.push(q[i]);
  }
  return out;
}

/** Same-category components from other libraries: the "alternatives" strip on a component page. */
export function alternativesFor(c: Component, limit = 8): ComponentSummary[] {
  const ids = filteredIds({ category: c.category }, 400).filter((id) => id !== c.id);
  const all = summariesByIds(ids);
  const others = interleave(all.filter((o) => o.librarySlug !== c.librarySlug));
  const same = all.filter((o) => o.librarySlug === c.librarySlug);
  return [...others, ...same].slice(0, limit);
}
