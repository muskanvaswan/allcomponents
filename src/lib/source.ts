import "server-only";
import { saveComponentSource } from "./db";
import { fetchJson, fetchText, mapLimit } from "./ingest/fetch";
import { rawGithubUrl } from "./ingest/links";
import type { RegistryItem } from "./ingest/shadcn";
import type { Component, ComponentFile, ComponentStyles, ExampleRef, Library, RepoRef } from "./types";

// Component source is fetched on demand (the first time someone opens a
// component) rather than during ingestion, so registering a library with
// thousands of items stays fast. Everything fetched is persisted.

const treeCache = new Map<string, Promise<string[]>>();

/** A GitHub REST API response. Unauthenticated requests are limited to 60 an hour; set GITHUB_TOKEN to raise that. */
export async function githubApi<T>(path: string): Promise<T> {
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "lookbook" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/${path}`, { headers, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`GitHub API returned HTTP ${res.status} for ${path}`);
  return (await res.json()) as T;
}

/** Every file path in a GitHub repo, via one API call per repo per server lifetime. */
export function repoTree(repo: RepoRef): Promise<string[]> {
  const key = `${repo.owner}/${repo.repo}@${repo.branch}`;
  let p = treeCache.get(key);
  if (!p) {
    p = githubApi<{ tree?: { path: string; type: string }[] }>(`repos/${repo.owner}/${repo.repo}/git/trees/${repo.branch}?recursive=1`)
      .then((data) => (data.tree ?? []).filter((t) => t.type === "blob").map((t) => t.path))
      .catch(() => {
        treeCache.delete(key);
        return [];
      });
    treeCache.set(key, p);
  }
  return p;
}

export async function fetchRaw(url: string): Promise<string | null> {
  try {
    const res = await fetchText(url, { accept: "text/plain,*/*", timeoutMs: 20_000 });
    return res.ok ? res.text : null;
  } catch {
    return null;
  }
}

const itemFiles = (item: RegistryItem): ComponentFile[] =>
  (item.files ?? []).map((f) => (typeof f === "string" ? { path: f } : { path: f.path, content: f.content, type: f.type, target: f.target }));

async function fillFiles(files: ComponentFile[]): Promise<ComponentFile[]> {
  return mapLimit(files, 4, async (f) => (f.content || !f.url ? f : { ...f, content: (await fetchRaw(f.url)) ?? undefined }));
}

const DEMO_SEARCH_VERSION = 3;

/**
 * Demos that pull components out of a lookup object, e.g.
 * `import { DEMO_COMPONENTS } from "../demo-registry"; const { Stepper } = DEMO_COMPONENTS;`.
 * The preview bundler rewrites that import to the component's own module.
 */
const REGISTRY_IMPORT = /import\s*\{\s*([A-Z][A-Z0-9_]*)\s*\}\s*from\s*["']([^"']*(?:registry|demo)[^"']*)["'];?/g;

/** The `import { X } from "…registry…"` statement and binding name, when `X` is destructured into components. */
export function registryLookup(content: string): { statement: string; binding: string } | null {
  for (const m of content.matchAll(REGISTRY_IMPORT)) {
    if (new RegExp(`const\\s*\\{[^}]*\\}\\s*=\\s*${m[1]}\\b`).test(content)) return { statement: m[0], binding: m[1] };
  }
  return null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const baseName = (p: string) => p.split("/").pop()!.replace(/\.(tsx|jsx|ts|js|vue|svelte)$/, "");

/** Looks for a demo/preview file for a component inside its library's repo. */
async function findRepoDemo(repo: RepoRef, c: Component): Promise<ExampleRef | null> {
  const tree = await repoTree(repo);
  if (!tree.length) return null;
  const names = new Set([norm(c.slug), ...c.files.map((f) => norm(baseName(f.path)))]);
  const candidates = tree.filter((p) => {
    if (!/\.(tsx|jsx)$/.test(p) || !/(demo|example|preview|showcase)/i.test(p)) return false;
    const b = norm(baseName(p).replace(/[.-](demo|example|preview)(-?\d+)?$/i, ""));
    return names.has(b);
  });
  if (!candidates.length) return null;
  // shadcn/ui keeps a copy of each demo per primitive library (examples/radix, examples/base, examples/aria).
  // Its registry components are built on Radix, so the Radix copy is the one whose imports match.
  const flavour = (p: string) => (/\/radix\//.test(p) ? 0 : /\/(aria|base|bases)\//.test(p) ? 2 : 1);
  candidates.sort((a, b) => flavour(a) - flavour(b));

  const fetched = await mapLimit(candidates.slice(0, 4), 4, async (path) => ({ path, content: await fetchRaw(rawGithubUrl(repo, path)) }));
  const fileBases = c.files.map((f) => baseName(f.path).toLowerCase());
  const score = ({ path, content }: { path: string; content: string | null }) => {
    if (!content) return -Infinity;
    let s = 0;
    const imports = [...content.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1].split("/").pop()!.toLowerCase());
    if (imports.some((i) => fileBases.includes(i) || norm(i) === norm(c.slug))) s += 3;
    if (registryLookup(content)) s += 4;
    if (/lazy\(|INLINE_DEMO/.test(content)) s -= 3;
    if (/export default/.test(content)) s += 1;
    if (/[./-]demo\.|\/demos?\//.test(path)) s += 0.5;
    return s - content.length / 20_000;
  };
  const best = fetched.sort((a, b) => score(b) - score(a))[0];
  if (!best?.content || score(best) < 1) return null;
  return { name: baseName(best.path), files: [{ path: best.path, content: best.content }] };
}

/** Returns the component with file contents, styles and demo filled in, fetching whatever is missing. */
export async function loadSource(c: Component, library: Library): Promise<Component> {
  const needsFiles = c.files.length === 0 || c.files.some((f) => !f.content);
  const needsExample =
    !c.example ||
    Boolean(c.example.files?.length && c.example.files.some((f) => !f.content)) ||
    (c.example.itemUrl && !c.example.files?.some((f) => f.content)) ||
    (!c.example.files?.length && c.example.searched !== DEMO_SEARCH_VERSION);
  if (!needsFiles && !needsExample) return c;

  let files = c.files;
  let styles: ComponentStyles | null = c.styles;
  let dependencies = c.dependencies;
  let registryDependencies = c.registryDependencies;
  if (needsFiles && c.itemUrl) {
    const item = await fetchJson<RegistryItem>(c.itemUrl);
    if (item) {
      const fromItem = itemFiles(item);
      if (fromItem.some((f) => f.content)) files = fromItem;
      if (item.cssVars || item.css || item.tailwind) styles = { cssVars: item.cssVars, css: item.css, tailwind: item.tailwind };
      dependencies = [...new Set([...dependencies, ...(item.dependencies ?? [])])];
      registryDependencies = item.registryDependencies ?? registryDependencies;
    }
  }
  files = await fillFiles(files);

  let example = c.example;
  if (example?.itemUrl && !example.files?.some((f) => f.content)) {
    const item = await fetchJson<RegistryItem>(example.itemUrl);
    if (item) example = { ...example, files: itemFiles(item) };
  }
  if (example?.files?.length) example = { ...example, files: await fillFiles(example.files) };
  if (!example?.files?.some((f) => f.content)) {
    // An empty `files` list records "looked, found nothing" so we don't search again.
    example = (library.repo ? await findRepoDemo(library.repo, { ...c, files }) : null) ?? { files: [], searched: DEMO_SEARCH_VERSION };
  }

  const updated = { ...c, files, styles, dependencies, registryDependencies, example };
  saveComponentSource(c.id, updated);
  return updated;
}
