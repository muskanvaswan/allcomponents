import "server-only";
import { fetchJson, mapLimit } from "./fetch";
import { githubRepoFromHtml, parseGithubUrl, rawGithubUrl, sameSite, slugify } from "./links";
import type { ComponentFile, ExtractResult, Progress, RawComponent, RepoRef } from "../types";

// Libraries following the shadcn registry spec publish an index of items
// (https://ui.shadcn.com/schema/registry.json) and one JSON file per item with
// the full source. https://ui.shadcn.com/r/registries.json is a public
// directory of hundreds of them, which tells us where a site's registry lives.

export type RegistryItem = {
  name: string;
  type?: string;
  title?: string;
  description?: string;
  dependencies?: string[];
  devDependencies?: string[];
  registryDependencies?: string[];
  files?: (string | { path: string; content?: string; type?: string; target?: string })[];
  categories?: string[];
  meta?: Record<string, unknown>;
  cssVars?: Record<string, Record<string, string>>;
  css?: Record<string, unknown>;
  tailwind?: { config?: { theme?: { extend?: Record<string, unknown> } } };
};

type DirectoryEntry = { name: string; homepage?: string; url: string; description?: string };

export type Registry = {
  indexUrl: string;
  items: RegistryItem[];
  name?: string;
  homepage?: string;
  description?: string;
  /** URL templates containing `{name}` that may serve a single item. */
  itemTemplates: string[];
  namespace?: string;
};

const KEEP_TYPES = new Set(["registry:ui", "registry:component", "registry:block"]);
const SKIP_TYPES = new Set(["registry:style", "registry:theme", "registry:lib", "registry:hook", "registry:font", "registry:file", "registry:example", "registry:base"]);
const GENERIC_SEGMENTS = new Set(["registry", "src", "components", "component", "ui", "default", "new-york", "new-york-v4", "lib", "app", "examples", "example", "public", "r"]);

let directory: { at: number; entries: Promise<DirectoryEntry[]> } | null = null;

function registryDirectory(): Promise<DirectoryEntry[]> {
  if (!directory || Date.now() - directory.at > 6 * 3600_000) {
    directory = {
      at: Date.now(),
      entries: fetchJson<DirectoryEntry[]>("https://ui.shadcn.com/r/registries.json", { timeoutMs: 20_000 })
        .then((d) => (Array.isArray(d) ? d : []))
        .catch(() => []),
    };
  }
  return directory.entries;
}

function asIndex(data: unknown): { items: RegistryItem[]; name?: string; homepage?: string; description?: string } | null {
  const isItem = (x: unknown): x is RegistryItem => typeof x === "object" && x !== null && typeof (x as RegistryItem).name === "string";
  if (Array.isArray(data) && data.length && data.every(isItem)) return { items: data };
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)) {
    const d = data as { items: unknown[]; name?: string; homepage?: string; description?: string };
    const items = d.items.filter(isItem);
    if (items.length) return { items, name: d.name, homepage: d.homepage, description: d.description };
  }
  return null;
}

const STYLES = ["new-york-v4", "new-york", "default"];
const fill = (template: string, name: string, style = STYLES[0]) => template.replace("{name}", name).replace("{style}", style);
const dirOf = (url: string) => url.slice(0, url.lastIndexOf("/"));

/**
 * Whether a directory entry is the registry for the submitted page: on the same
 * site, with the page at or below the registry's homepage. One site can host
 * several registries, such as ui.shadcn.com/oidc beside shadcn/ui's own.
 */
function covers(entry: DirectoryEntry, input: URL): boolean {
  const home = new URL(entry.homepage ?? new URL(entry.url).origin);
  if (!sameSite(home.toString(), input.toString())) return false;
  const path = home.pathname.replace(/\/+$/, "");
  return !path || input.pathname === path || input.pathname.startsWith(`${path}/`);
}

/** Finds the registry behind a docs site, a GitHub repo, or a direct registry URL. */
export async function discoverRegistry(inputUrl: string, landingHtml: string | null): Promise<Registry | null> {
  const input = new URL(inputUrl);
  const tries: { indexUrl: string; templates: string[]; namespace?: string; description?: string }[] = [];
  const push = (indexUrl: string, templates: string[], extra: { namespace?: string; description?: string } = {}) => {
    if (!tries.some((t) => t.indexUrl === indexUrl)) tries.push({ indexUrl, templates, ...extra });
  };

  const gh = parseGithubUrl(inputUrl);
  if (gh) {
    const base = (p: string) => rawGithubUrl(gh, gh.path ? `${gh.path}/${p}` : p);
    push(base("registry.json"), [base("public/r/{name}.json")]);
    push(base("public/r/registry.json"), [base("public/r/{name}.json")]);
    push(base("public/registry.json"), [base("public/r/{name}.json")]);
  } else {
    if (input.pathname.endsWith(".json")) push(input.toString(), [`${dirOf(input.toString())}/{name}.json`]);

    const pushEntry = (entry: DirectoryEntry) => {
      for (const style of STYLES) {
        for (const indexName of ["registry", "index"]) {
          push(fill(entry.url, indexName, style), [entry.url.replace("{style}", style)], { namespace: entry.name, description: entry.description });
        }
        if (!entry.url.includes("{style}")) break;
      }
    };
    // Registries elsewhere on the same site are a last resort, after the site's own paths.
    const sameSiteElsewhere: DirectoryEntry[] = [];
    for (const entry of await registryDirectory()) {
      if (covers(entry, input)) pushEntry(entry);
      else if (sameSite(entry.homepage ?? entry.url, inputUrl) || sameSite(entry.url, inputUrl)) sameSiteElsewhere.push(entry);
    }

    // Registry install URLs embedded in the page (`npx shadcn add https://x/r/foo.json`).
    for (const m of (landingHtml ?? "").matchAll(/https?:\/\/[^\s"'<>`\\]+?\/(?:r|registry)(?:\/[\w.-]+)*\/[\w.-]+\.json/g)) {
      if (!sameSite(m[0], inputUrl)) continue;
      const dir = dirOf(m[0]);
      push(`${dir}/registry.json`, [`${dir}/{name}.json`]);
      push(`${dir}/index.json`, [`${dir}/{name}.json`]);
    }

    const bases = new Set([input.origin]);
    const segments = input.pathname.split("/").filter(Boolean);
    for (let i = segments.length; i > 0; i--) bases.add(`${input.origin}/${segments.slice(0, i).join("/")}`);
    for (const base of bases) {
      push(`${base}/r/registry.json`, [`${base}/r/{name}.json`]);
      push(`${base}/registry.json`, [`${base}/r/{name}.json`, `${base}/registry/{name}.json`]);
      // shadcn/ui's own layout, one registry per style: its full index lists demos too, which become the previews.
      if (base === input.origin) for (const style of STYLES) push(`${base}/r/styles/${style}/registry.json`, [`${base}/r/styles/${style}/{name}.json`]);
      push(`${base}/r/index.json`, [`${base}/r/{name}.json`]);
      push(`${base}/registry/index.json`, [`${base}/registry/{name}.json`]);
    }

    for (const entry of sameSiteElsewhere) pushEntry(entry);
  }

  for (const t of tries.slice(0, 40)) {
    const index = asIndex(await fetchJson(t.indexUrl, { timeoutMs: 15_000 }));
    if (!index) continue;
    return {
      indexUrl: t.indexUrl,
      items: index.items,
      name: index.name,
      homepage: index.homepage,
      description: index.description ?? t.description,
      itemTemplates: [...new Set([...t.templates, `${dirOf(t.indexUrl)}/{name}.json`])],
      namespace: t.namespace,
    };
  }
  return null;
}

const VARIANT_SUFFIX = /-(js|ts)-(css|tw)$/i;
const VARIANT_PREFERENCE = ["ts-tw", "js-tw", "ts-css", "js-css"];

/** Collapses React Bits-style language/styling variants into one component. */
function collapseVariants(items: RegistryItem[]): { item: RegistryItem; variants: string[] }[] {
  const groups = new Map<string, RegistryItem[]>();
  for (const item of items) {
    const base = item.name.replace(VARIANT_SUFFIX, "");
    groups.set(base, [...(groups.get(base) ?? []), item]);
  }
  return [...groups.values()].map((group) => {
    if (group.length === 1) return { item: group[0], variants: [] };
    const rank = (i: RegistryItem) => {
      const v = i.name.match(VARIANT_SUFFIX);
      return v ? VARIANT_PREFERENCE.indexOf(`${v[1]}-${v[2]}`.toLowerCase()) : -1;
    };
    const sorted = [...group].sort((a, b) => rank(a) - rank(b));
    return { item: sorted[0], variants: group.map((i) => i.name) };
  });
}

const depName = (dep: string) => dep.replace(/^.*\/r\//, "").replace(/\.json$/, "").replace(/^@[^/]+\//, "").split("/").pop()!;

function filesOf(item: RegistryItem, repo: RepoRef | null): ComponentFile[] {
  return (item.files ?? []).map((f) => {
    const file = typeof f === "string" ? { path: f } : f;
    return {
      path: file.path,
      content: file.content,
      type: file.type,
      target: file.target,
      url: !file.content && repo ? rawGithubUrl(repo, file.path) : undefined,
    };
  });
}

function frameworkOf(files: ComponentFile[]): string {
  const exts = files.map((f) => f.path.split(".").pop()?.toLowerCase());
  if (exts.includes("vue")) return "vue";
  if (exts.includes("svelte")) return "svelte";
  if (exts.includes("astro")) return "astro";
  return "react";
}

function hintsOf(item: RegistryItem, files: ComponentFile[]): string[] {
  const hints = new Set<string>(item.categories ?? []);
  if (typeof item.meta?.category === "string") hints.add(item.meta.category);
  if (item.type === "registry:block") hints.add("section");
  for (const f of files) {
    for (const seg of f.path.split("/").slice(0, -1)) if (!GENERIC_SEGMENTS.has(seg.toLowerCase())) hints.add(seg);
  }
  return [...hints];
}

/** Returns the first template that serves `name` as a registry item with source content. */
async function workingTemplate(templates: string[], name: string): Promise<string | null> {
  for (const t of templates) {
    const item = await fetchJson<RegistryItem>(fill(t, name));
    if (item?.name && item.files?.some((f) => typeof f === "object" && f.content)) return t;
  }
  return null;
}

export async function extractRegistry(
  registry: Registry,
  ctx: { landingHtml: string | null; docsIndex: Map<string, string>; progress: Progress },
): Promise<ExtractResult> {
  const warnings: string[] = [];
  const homepageRepo = registry.homepage ? parseGithubUrl(registry.homepage) : null;
  const rawMatch = registry.indexUrl.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\//);
  const indexRepo: RepoRef | null = rawMatch ? { owner: rawMatch[1], repo: rawMatch[2], branch: rawMatch[3] } : null;
  const repo: RepoRef | null = indexRepo ?? homepageRepo ?? (ctx.landingHtml ? githubRepoFromHtml(ctx.landingHtml) : null);

  let kept = registry.items.filter((i) => KEEP_TYPES.has(i.type ?? ""));
  if (!kept.length) kept = registry.items.filter((i) => !SKIP_TYPES.has(i.type ?? ""));
  // shadcn/ui files some demos as internal items (`sidebar-demo`); a `<name>-demo` counts as a demo whatever its type.
  const examples = registry.items.filter((i) => i.type === "registry:example" || (i.type === "registry:internal" && i.name.endsWith("-demo")));
  const collapsed = collapseVariants(kept);
  ctx.progress(`Found ${collapsed.length} components in the registry`);

  const sample = collapsed.find((c) => c.item.files?.length)?.item ?? collapsed[0]?.item;
  const template = sample ? await workingTemplate(registry.itemTemplates, sample.name) : null;
  if (!template && !repo && !kept.some((i) => i.files?.some((f) => typeof f === "object" && f.content))) {
    warnings.push("Couldn't locate per-item source files; previews may be unavailable.");
  }

  // Index files often omit descriptions; the per-item JSON usually has them.
  const missing = collapsed.filter((c) => !c.item.description);
  const enriched = new Map<string, RegistryItem>();
  if (template && missing.length > collapsed.length / 2 && collapsed.length <= 600) {
    ctx.progress(`Fetching details for ${missing.length} components`);
    let done = 0;
    await mapLimit(missing, 8, async ({ item }) => {
      const full = await fetchJson<RegistryItem>(fill(template, item.name));
      if (full) enriched.set(item.name, full);
      if (++done % 25 === 0) ctx.progress(`Fetched details for ${done}/${missing.length} components`);
    });
  }

  const keptNames = new Set(collapsed.map((c) => c.item.name));
  const exampleFor = new Map<string, RegistryItem>();
  for (const ex of examples) {
    const parents = (ex.registryDependencies ?? []).map(depName).filter((n) => keptNames.has(n));
    const stripped = ex.name.replace(/-(demo|example|preview)(-[\w]+)?$/, "");
    const parent = keptNames.has(stripped) ? stripped : parents[0];
    if (!parent) continue;
    const prev = exampleFor.get(parent);
    // Prefer the canonical `<name>-demo` over numbered or themed variants.
    if (!prev || ex.name === `${parent}-demo`) exampleFor.set(parent, ex);
  }

  const components: RawComponent[] = collapsed.map(({ item: indexItem, variants }) => {
    const item = { ...indexItem, ...enriched.get(indexItem.name) };
    const files = filesOf(item, repo);
    const slug = slugify(indexItem.name.replace(VARIANT_SUFFIX, "")) || slugify(indexItem.name);
    const title = item.title ?? indexItem.name.replace(VARIANT_SUFFIX, "");
    const itemUrl = template ? fill(template, indexItem.name) : undefined;
    const example = exampleFor.get(indexItem.name);
    const docsUrl = ctx.docsIndex.get(slug) ?? ctx.docsIndex.get(slugify(title));
    const installCommand = registry.namespace
      ? `npx shadcn@latest add ${registry.namespace}/${indexItem.name}`
      : itemUrl
        ? `npx shadcn@latest add ${itemUrl}`
        : repo
          ? `npx shadcn@latest add ${repo.owner}/${repo.repo}/${indexItem.name}`
          : undefined;
    return {
      slug,
      name: humanize(title),
      description: item.description,
      hints: hintsOf(item, files),
      framework: frameworkOf(files),
      dependencies: [...(item.dependencies ?? [])],
      registryDependencies: item.registryDependencies ?? [],
      installCommand,
      docsUrl: docsUrl ?? registry.homepage ?? undefined,
      sourceUrl: repo && files[0] ? `https://github.com/${repo.owner}/${repo.repo}/blob/${repo.branch}/${files[0].path}` : undefined,
      itemUrl,
      files,
      example: example ? { name: example.name, itemUrl: template ? fill(template, example.name) : undefined, files: filesOf(example, repo).filter((f) => f.content || f.url) } : undefined,
      styles: item.cssVars || item.css || item.tailwind ? { cssVars: item.cssVars, css: item.css, tailwind: item.tailwind } : undefined,
      variants,
      kind: item.type?.replace("registry:", ""),
    };
  });

  return {
    strategy: "shadcn-registry",
    name: registry.name,
    description: registry.description,
    homepage: registry.homepage,
    repo: repo ?? undefined,
    components,
    warnings,
    themeCss: template ? await registryStyles(registry, template) : undefined,
  };
}

const cssPath = (f: NonNullable<RegistryItem["files"]>[number]) => (typeof f === "string" ? f : f.path).endsWith(".css");

/**
 * A registry's own stylesheets: items like Board UI's `theme`, `typography` and `globals`, whose CSS defines the
 * tokens its components' classes use (`bg-primary`, `text-display-sm`). They're returned in dependency order with
 * their @import lines removed, ready to add to a preview's Tailwind input.
 */
async function registryStyles(registry: Registry, template: string): Promise<string | undefined> {
  const items = registry.items
    .filter((i) => i.files?.length && i.files.every(cssPath) && /^registry:(style|theme|lib|file)$/.test(i.type ?? ""))
    .slice(0, 8);
  if (!items.length) return undefined;
  const names = new Set(items.map((i) => i.name));
  // Stylesheets that build on the others (globals imports theme and typography) go last.
  items.sort((a, b) => (a.registryDependencies ?? []).filter((d) => names.has(d)).length - (b.registryDependencies ?? []).filter((d) => names.has(d)).length);
  const css: string[] = [];
  for (const i of items) {
    const full = await fetchJson<RegistryItem>(fill(template, i.name));
    for (const f of full?.files ?? []) {
      if (typeof f === "object" && f.content && cssPath(f)) css.push(f.content.replace(/^\s*@(import|plugin|source|reference)\b[^;]*;[ \t]*$/gm, ""));
    }
  }
  return css.join("\n") || undefined;
}

const ACRONYMS = new Set(["ai", "ui", "cta", "faq", "otp", "kpi", "svg", "css", "url", "api", "pdf", "qr", "os"]);

/** "text-reveal-card" → "Text Reveal Card"; leaves already-human titles alone. */
export function humanize(s: string): string {
  if (/\s/.test(s) || /^[A-Z][a-z]+[A-Z]/.test(s)) return s.replace(/([a-z])([A-Z])/g, "$1 $2");
  return s
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => (/^\d/.test(w) || ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}
