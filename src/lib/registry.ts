import "server-only";
import { CATEGORY_BY_ID } from "./taxonomy";
import type { Component } from "./types";

// Serves the whole aggregated collection as one shadcn-compatible registry, so
// any component can be installed with `npx shadcn add <origin>/r/<name>.json`.

export const registryName = (c: Pick<Component, "librarySlug" | "slug">) => `${c.librarySlug}--${c.slug}`;

export function parseRegistryName(name: string): string | null {
  const m = name.replace(/\.json$/, "").match(/^(.+?)--(.+)$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

const itemType = (c: Component) => (c.kind === "block" ? "registry:block" : c.kind === "component" ? "registry:component" : "registry:ui");

export function indexEntry(c: Component) {
  return {
    name: registryName(c),
    type: itemType(c),
    title: `${c.name} (${c.libraryName})`,
    description: c.description ?? undefined,
    dependencies: c.dependencies.length ? c.dependencies : undefined,
    categories: [c.category, ...c.categories],
    meta: { library: c.libraryName, librarySlug: c.librarySlug, category: CATEGORY_BY_ID.get(c.category)?.label, docsUrl: c.docsUrl, animated: c.animated },
  };
}

export function registryItem(c: Component) {
  return {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    ...indexEntry(c),
    // Namespaced deps (`@magicui/x`) need the source registry configured; point at its item URL when we can.
    registryDependencies: c.registryDependencies.map((d) => (d.startsWith("@") && c.itemUrl ? c.itemUrl.replace(/[^/]+?(\.json)?$/, (m) => d.split("/").pop()! + (m.endsWith(".json") ? ".json" : "")) : d)),
    files: c.files
      .filter((f) => f.content)
      .map((f) => ({ path: f.path, type: f.type ?? "registry:ui", target: f.target, content: f.content })),
    cssVars: c.styles?.cssVars,
    css: c.styles?.css,
    tailwind: c.styles?.tailwind,
    docs: c.docsUrl ? `Original documentation: ${c.docsUrl}` : undefined,
  };
}
