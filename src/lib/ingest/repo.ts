import "server-only";
import { fetchRaw, githubApi, repoTree } from "../source";
import { mapLimit } from "./fetch";
import { rawGithubUrl, slugify } from "./links";
import { humanize } from "./shadcn";
import type { ComponentFile, ExtractResult, Progress, RawComponent, RepoRef } from "../types";

// For GitHub repos without a shadcn registry. Many component libraries are
// their own docs site and keep a catalogue of their components in code: an
// array of entries with a slug, a name, a description and the files that make
// each one up (Pin UI's components/library/registry.ts is one). When a repo
// has such a catalogue, exactly what it lists is indexed; otherwise every
// component file in a component folder becomes an entry named after the file.
// Each component's own files are fetched now; whatever they import from
// elsewhere in the repo is fetched by the preview bundler when it's needed.

const MAX_COMPONENTS = 300;
const COMPONENT_FILE = /\.(tsx|jsx|vue|svelte)$/;
const CODE_FILE = /\.(tsx|jsx|ts|js|mjs|vue|svelte)$/;
const NOT_SOURCE = /(^|\/)(node_modules|\.next|dist|build|out|public|scripts|tests?|__tests__|__mocks__|e2e|cypress|\.storybook|\.github)\//;
// Tests, stories, type declarations, framework route files and hooks.
const NOT_COMPONENT = /\.(test|spec|stories|d)\.|(^|\/)(page|layout|route|loading|error|not-found|template|default|global-error|head|middleware)\.\w+$|(^|\/)use[A-Z][^/]*$/;
const DEMO = /(^|[/.-])(demos?|examples?|previews?|showcase|playground|sandbox)([/.-]|$)/i;
const LIBRARY_DIR = /(^|\/)(ui|components?|library|registry|primitives|elements|blocks?)(\/|$)/i;
const CATALOGUE = /(^|\/)[\w.-]*(registry|catalog|catalogue|components|library|manifest|meta|items|data)[\w.-]*\.(ts|tsx|js|mjs|json)$/i;
const FILE_REF = /^[\w@./-]+\.(tsx|jsx|ts|js|mjs|vue|svelte|css)$/;
const IMAGE = /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i;
const NODE_BUILTINS = new Set(["fs", "path", "os", "crypto", "url", "util", "events", "stream", "buffer", "child_process", "http", "https"]);

type RepoInfo = { default_branch: string; homepage: string | null; description: string | null };

export async function scanRepo(input: RepoRef & { path: string }, opts: { progress: Progress }): Promise<ExtractResult> {
  const warnings: string[] = [];
  opts.progress("Reading the repo");
  const info = await githubApi<RepoInfo>(`repos/${input.owner}/${input.repo}`);
  const repo: RepoRef = { owner: input.owner, repo: input.repo, branch: input.branch === "HEAD" ? info.default_branch : input.branch };
  const homepage = info.homepage?.trim() || undefined;

  const all = await repoTree(repo);
  if (!all.length) throw new Error("Couldn't list this repo's files. GitHub may be limiting requests: set GITHUB_TOKEN and try again.");
  const prefix = input.path ? `${input.path}/` : "";
  const tree = all.filter((p) => p.startsWith(prefix));
  const treeSet = new Set(all);
  const byBase = new Map<string, string[]>();
  for (const p of tree) {
    const base = p.split("/").pop()!.toLowerCase();
    byBase.set(base, [...(byBase.get(base) ?? []), p]);
  }
  const candidates = tree.filter((p) => COMPONENT_FILE.test(p) && !NOT_SOURCE.test(p) && !NOT_COMPONENT.test(p) && !DEMO.test(p));

  opts.progress("Looking for a component catalogue");
  const entries = await catalogueEntries(tree, repo, { treeSet, byBase, candidates });
  let picked: Picked[];
  if (entries.length) {
    picked = entries;
  } else {
    const inLibraryDirs = candidates.filter((p) => LIBRARY_DIR.test(p.slice(prefix.length)));
    picked = (inLibraryDirs.length ? inLibraryDirs : candidates).map((p) => {
      const file = p.split("/").pop()!.replace(/\.\w+$/, "");
      const slug = file === "index" ? (p.split("/").at(-2) ?? file) : file;
      const css = siblingCss(p, slug, treeSet);
      return { slug: slugify(slug), files: css ? [p, css] : [p], hints: dirHints(p.slice(prefix.length)) };
    });
    if (picked.length) warnings.push("This repo has no component catalogue, so components are named after their files.");
  }
  const seen = new Set<string>();
  picked = picked.filter((c) => c.slug && !seen.has(c.slug) && seen.add(c.slug));
  if (!picked.length) throw new Error("No component files found in this repo.");
  if (picked.length > MAX_COMPONENTS) {
    warnings.push(`Found ${picked.length} components; indexed the first ${MAX_COMPONENTS}.`);
    picked = picked.slice(0, MAX_COMPONENTS);
  }

  const versions = await packageVersions(repo, input.path, treeSet);
  const docsUrlFor = docsPattern(tree.map((p) => p.slice(prefix.length)), homepage);
  const servesRegistry = tree.some((p) => /(^|\/)(src\/)?app\/r\/\[[^\]/]+\]\/route\.(ts|js)$/.test(p) || /(^|\/)public\/r\/[\w-]+\.json$/.test(p));

  opts.progress(`Fetching the source of ${picked.length} components`);
  let done = 0;
  const components = await mapLimit(picked, 8, async (c): Promise<RawComponent | null> => {
    const files: ComponentFile[] = await Promise.all(c.files.map(async (path) => ({ path, content: (await fetchRaw(rawGithubUrl(repo, path))) ?? undefined, url: rawGithubUrl(repo, path) })));
    if (++done % 20 === 0) opts.progress(`Fetched ${done}/${picked.length} components`);
    const main = files.find((f) => COMPONENT_FILE.test(f.path) && f.content);
    if (!main) return null;
    const code = files.filter((f) => CODE_FILE.test(f.path)).map((f) => f.content ?? "").join("\n");
    const deps = new Map<string, string>();
    for (const d of c.dependencies ?? []) deps.set(d.replace(/(.)@.*$/, "$1"), d);
    for (const pkg of packagesIn(code)) if (!deps.has(pkg)) deps.set(pkg, versions.get(pkg) ? `${pkg}@${versions.get(pkg)}` : pkg);
    const ext = main.path.split(".").pop();
    return {
      slug: c.slug,
      name: c.name ?? humanize(c.slug),
      description: c.description ?? leadingDoc(main.content!),
      hints: c.hints,
      tags: c.tags,
      framework: ext === "vue" || ext === "svelte" ? ext : "react",
      dependencies: [...deps.values()],
      installCommand: servesRegistry && homepage ? `npx shadcn@latest add ${homepage.replace(/\/+$/, "")}/r/${c.slug}.json` : undefined,
      docsUrl: docsUrlFor?.(c.slug) ?? `https://github.com/${repo.owner}/${repo.repo}/blob/${repo.branch}/${main.path}`,
      sourceUrl: `https://github.com/${repo.owner}/${repo.repo}/blob/${repo.branch}/${main.path}`,
      previewImage: c.image ? imageUrl(c.image, repo, treeSet) : undefined,
      // The main component first: the preview bundler mounts the first component file it finds.
      files: [main, ...files.filter((f) => f !== main && f.content)],
      kind: "component",
    };
  });

  return {
    strategy: "repo-scan",
    name: repo.repo,
    description: info.description ?? undefined,
    homepage,
    repo,
    components: components.filter((c): c is RawComponent => c !== null),
    warnings,
  };
}

type Picked = { slug: string; files: string[]; name?: string; description?: string; hints?: string[]; tags?: string[]; dependencies?: string[]; image?: string };

/** Entries from every catalogue-like file in the repo that lists at least three of its component files. */
async function catalogueEntries(
  tree: string[],
  repo: RepoRef,
  ctx: { treeSet: Set<string>; byBase: Map<string, string[]>; candidates: string[] },
): Promise<Picked[]> {
  const files = tree
    .filter((p) => CATALOGUE.test(p) && !NOT_SOURCE.test(p) && !/(^|\/)(package(-lock)?|tsconfig|components)\.json$/.test(p))
    .sort((a, b) => Number(/registry|catalog/i.test(b)) - Number(/registry|catalog/i.test(a)) || a.length - b.length)
    .slice(0, 12);
  const isCandidate = new Set(ctx.candidates);
  const found = await mapLimit(files, 6, async (path) => {
    const src = await fetchRaw(rawGithubUrl(repo, path));
    if (!src) return [];
    const { objects, labels } = parseCatalogue(src);
    const dir = path.slice(0, path.lastIndexOf("/") + 1);
    const resolve = (ref: string) => {
      const clean = ref.replace(/^(\.\/|\/|@\/|~\/)+/, "");
      if (ctx.treeSet.has(dir + clean)) return dir + clean;
      if (ctx.treeSet.has(clean)) return clean;
      const same = ctx.byBase.get(clean.split("/").pop()!.toLowerCase()) ?? [];
      return same.find((p) => p.startsWith(dir)) ?? (same.length === 1 ? same[0] : null);
    };
    const entries: Picked[] = [];
    for (const o of objects) {
      const slug = o.str("slug") ?? (o.str("name") || o.str("title") ? o.str("id") : undefined);
      if (!slug) continue;
      const refs = [...new Set(o.strings().filter((s) => FILE_REF.test(s)).map(resolve).filter((p): p is string => Boolean(p)))];
      let main = refs.find((p) => isCandidate.has(p));
      // Entries that don't name their files: match the slug to a component file.
      if (!main && !refs.length) main = ctx.candidates.find((p) => squash(p.split("/").pop()!.replace(/\.\w+$/, "")) === squash(slug));
      if (!main) continue;
      const category = o.str("category") ?? o.str("group") ?? o.str("section");
      entries.push({
        slug: slugify(slug),
        files: [main, ...refs.filter((p) => p !== main)],
        name: o.str("name") ?? o.str("title"),
        description: o.str("description") ?? o.str("tagline") ?? o.str("summary") ?? o.str("excerpt") ?? o.str("subtitle"),
        hints: [category, category && labels.get(category)].filter((h): h is string => Boolean(h)),
        tags: o.list("tags") ?? o.list("keywords"),
        dependencies: o.list("dependencies"),
        image: ["poster", "image", "thumbnail", "thumb", "previewImage", "preview", "cover", "screenshot", "ogImage"].map((k) => o.str(k)).find((v) => v && IMAGE.test(v)),
      });
    }
    return entries.length >= 3 ? entries : [];
  });
  return found.flat();
}

// ── A small reader for object literals in JS/TS data files ──

type CatalogueObject = { str(key: string): string | undefined; list(key: string): string[] | undefined; strings(): string[] };

const LITERAL = /"((?:\\.|[^"\\\n])*)"|'((?:\\.|[^'\\\n])*)'|`((?:\\.|[^`\\])*)`/g;
const unescape = (s: string) => s.replace(/\\(.)/g, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
const literals = (raw: string) => [...raw.matchAll(LITERAL)].map((m) => unescape(m[1] ?? m[2] ?? m[3]));

/** A field's value when it is a string, or strings joined with `+`. */
function stringValue(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const rest = raw.replace(LITERAL, "").replace(/\bas\s+const\b/, "").replace(/[+\s]/g, "");
  if (rest) return undefined;
  return literals(raw).join("").trim() || undefined;
}

/**
 * Every object literal in the source with its top-level fields, plus a map of
 * `{ id, name }` pairs (category lists) for turning category ids into labels.
 * Skips strings and comments; regex literals are rare enough in data files to ignore.
 */
function parseCatalogue(src: string): { objects: CatalogueObject[]; labels: Map<string, string> } {
  type Frame = { ch: string; start: number; fields?: Map<string, string>; key?: string; valueStart?: number; expectKey?: boolean };
  const raw: { start: number; end: number; fields: Map<string, string> }[] = [];
  const stack: Frame[] = [];
  const finishField = (f: Frame, end: number) => {
    if (f.key !== undefined && f.valueStart !== undefined) f.fields!.set(f.key, src.slice(f.valueStart, end).trim());
    f.key = f.valueStart = undefined;
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      i = nl < 0 ? src.length : nl;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const close = src.indexOf("*/", i + 2);
      i = close < 0 ? src.length : close + 2;
      continue;
    }
    const top = stack.at(-1);
    if (top?.ch === "{" && top.expectKey && /[\w$"']/.test(c)) {
      top.expectKey = false;
      const m = /^(?:([A-Za-z_$][\w$]*)|"([^"\n]*)"|'([^'\n]*)')\s*:(?!:)/.exec(src.slice(i, i + 200));
      if (m) {
        top.key = m[1] ?? m[2] ?? m[3];
        top.valueStart = i + m[0].length;
        i += m[0].length;
        continue;
      }
    }
    if (c === '"' || c === "'" || c === "`") {
      i = skipString(src, i);
      continue;
    }
    if (c === "{" || c === "[" || c === "(") {
      stack.push(c === "{" ? { ch: c, start: i, fields: new Map(), expectKey: true } : { ch: c, start: i });
    } else if (c === "}" || c === "]" || c === ")") {
      const open = stack.pop();
      if (open?.ch === "{") {
        finishField(open, i);
        raw.push({ start: open.start, end: i + 1, fields: open.fields! });
      }
    } else if (c === "," && top?.ch === "{") {
      finishField(top, i);
      top.expectKey = true;
    } else if (top?.ch === "{" && top.expectKey && !/\s/.test(c)) {
      top.expectKey = false;
    }
    i++;
  }

  const objects = raw.map(({ start, end, fields }) => ({
    str: (key: string) => stringValue(fields.get(key)),
    list: (key: string) => {
      const v = fields.get(key);
      return v?.startsWith("[") ? literals(v) : undefined;
    },
    strings: () => literals(src.slice(start, end)),
  }));
  const labels = new Map<string, string>();
  for (const o of objects) {
    const id = o.str("id");
    const label = o.str("name") ?? o.str("label") ?? o.str("title");
    if (id && label && !o.str("slug") && !labels.has(id)) labels.set(id, label);
  }
  return { objects, labels };
}

function skipString(src: string, i: number): number {
  const quote = src[i];
  let depth = 0;
  for (let j = i + 1; j < src.length; j++) {
    const c = src[j];
    if (c === "\\") j++;
    else if (quote === "`") {
      if (c === "$" && src[j + 1] === "{") {
        depth++;
        j++;
      } else if (c === "}" && depth) depth--;
      else if (c === "`" && !depth) return j + 1;
    } else if (c === quote || c === "\n") return j + 1;
  }
  return src.length;
}

// ── Helpers ──

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** `Button.tsx` next to `button.css` or `Button.css`. */
function siblingCss(path: string, name: string, treeSet: Set<string>): string | undefined {
  const dir = path.slice(0, path.lastIndexOf("/") + 1);
  return [`${dir}${name}.css`, `${dir}${slugify(name)}.css`, `${dir}${name}.module.css`].find((p) => treeSet.has(p));
}

function dirHints(path: string): string[] {
  return path
    .split("/")
    .slice(0, -1)
    .filter((s) => !/^(src|lib|packages?|apps?|components?|ui|library|registry)$/i.test(s));
}

/** npm packages imported by the code, without React and Next.js (the preview provides those). */
function packagesIn(code: string): string[] {
  const out = new Set<string>();
  for (const m of code.matchAll(/(?:import|export)\s[^'"`;]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (/^(\.|\/|@\/|~\/|#|\$|node:)/.test(spec) || /^(react|react-dom|next)(\/|$)/.test(spec)) continue;
    const parts = spec.split("/");
    const pkg = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
    if (!NODE_BUILTINS.has(pkg)) out.add(pkg);
  }
  return [...out];
}

/** Version ranges from the repo's package.json (the scanned folder's, else the root's). */
async function packageVersions(repo: RepoRef, path: string, treeSet: Set<string>): Promise<Map<string, string>> {
  const file = path && treeSet.has(`${path}/package.json`) ? `${path}/package.json` : "package.json";
  const versions = new Map<string, string>();
  try {
    const pkg = JSON.parse((await fetchRaw(rawGithubUrl(repo, file))) ?? "{}") as Record<string, Record<string, string> | undefined>;
    for (const group of [pkg.peerDependencies, pkg.devDependencies, pkg.dependencies]) {
      for (const [name, range] of Object.entries(group ?? {})) if (!/^(workspace|file|link|catalog):/.test(range)) versions.set(name, range);
    }
  } catch {}
  return versions;
}

/** The first doc comment in a file, as a plain sentence or two. */
function leadingDoc(code: string): string | undefined {
  const m = code.match(/\/\*\*([\s\S]*?)\*\//);
  if (!m) return undefined;
  const text = m[1]
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .filter((l) => !l.startsWith("@"))
    .join(" ")
    .trim();
  return text.length > 20 ? text.split(/(?<=\.)\s/).slice(0, 2).join(" ").slice(0, 300) : undefined;
}

/**
 * A docs page URL for each component, from the site's own route for component
 * pages: `app/components/(workbench)/[slug]/page.tsx` on pinui.xyz gives
 * https://www.pinui.xyz/components/<slug>.
 */
function docsPattern(tree: string[], homepage: string | undefined): ((slug: string) => string) | null {
  if (!homepage) return null;
  const routes = tree
    .map((p) => p.match(/^(?:src\/)?app\/(.+?)\/\[[^\]/]+\]\/page\.(?:tsx|jsx|ts|js|mdx)$/)?.[1] ?? p.match(/^(?:src\/)?pages\/(.+?)\/\[[^\]/]+\]\.(?:tsx|jsx|ts|js)$/)?.[1])
    .filter((r): r is string => Boolean(r))
    .map((r) => r.split("/").filter((s) => !/^\(.*\)$/.test(s)).join("/"))
    .filter((r) => r && !r.includes("["))
    .sort((a, b) => a.length - b.length);
  const route = routes.find((r) => /component/i.test(r)) ?? routes.find((r) => /(^|\/)(docs|ui|library)(\/|$)/.test(r));
  if (!route) return null;
  const base = homepage.replace(/\/+$/, "");
  return (slug) => `${base}/${route}/${slug}`;
}

/** Images in a docs site's `public/` folder are served from the repo; anything absolute is used as is. */
function imageUrl(src: string, repo: RepoRef, treeSet: Set<string>): string | undefined {
  if (/^https?:\/\//.test(src)) return src;
  const path = `public/${src.replace(/^\//, "").replace(/\?.*$/, "")}`;
  return treeSet.has(path) ? rawGithubUrl(repo, path) : undefined;
}
