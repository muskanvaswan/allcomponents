import "server-only";
import { createRequire } from "node:module";
import path from "node:path";
import type * as esbuild from "esbuild";
import { getAsset, saveAsset } from "./db";
import { fetchText } from "./ingest/fetch";

// Resolves a preview's npm imports so esbuild can bundle them into the preview
// itself: React comes from this app's own node_modules (one copy shared by the
// component and every package), everything else is fetched once from esm.sh as
// ES modules and kept in SQLite, so rebuilding a preview needs no network.

export const isReactSpec = (spec: string) => /^react(-dom)?(\/.*)?$/.test(spec);

const appRequire = createRequire(path.join(process.cwd(), "package.json"));

/**
 * React modules resolve from this app's node_modules, using browser builds where React ships separate ones.
 * They're picked by file rather than through the packages' exports: the scripts run with
 * --conditions=react-server (so server-only modules load), and the exports would then hand
 * over React's server build, which has no createContext or hooks, and every preview would crash.
 */
const resolveReact = (spec: string) => {
  const [pkg, ...rest] = spec.split("/");
  const file = spec === "react-dom/server" ? "server.browser" : rest.join("/") || "index";
  return path.join(path.dirname(appRequire.resolve(`${pkg}/package.json`)), `${file}.js`);
};

const ESM = "https://esm.sh";

// Packages esm.sh splits badly, so they're fetched as one bundled module instead. Its build of react-aria's
// collection code carries a second copy of the context that tells react-aria-components' parts they're in the
// hidden pass that collects a Select's or Table's items, so those parts render outside their parents and crash.
const BUNDLE_WHOLE = new Set(["react-aria-components"]);

const esmUrl = (spec: string, range?: string) => {
  const parts = spec.split("/");
  const pkg = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  const sub = spec.slice(pkg.length);
  return `${ESM}/${pkg}${range ? `@${encodeURIComponent(range)}` : ""}${sub}?target=es2022&external=react,react-dom${!sub && BUNDLE_WHOLE.has(pkg) ? "&bundle" : ""}`;
};

const inflight = new Map<string, Promise<string>>();

/** An esm.sh module's source, from SQLite when we've fetched it before. */
function esmModule(url: string): Promise<string> {
  const key = `esm:${url}`;
  const cached = getAsset(key);
  if (cached) return Promise.resolve(cached.content);
  let p = inflight.get(url);
  if (!p) {
    p = fetchText(url, { accept: "application/javascript", timeoutMs: 30_000 })
      .then((res) => {
        if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
        saveAsset(key, res.text);
        return res.text;
      })
      .finally(() => inflight.delete(url));
    inflight.set(url, p);
  }
  return p;
}

/** esbuild plugin that loads npm modules (namespace "esm") and their imports. */
export function npmPlugin(): esbuild.Plugin {
  return {
    name: "npm",
    setup(build) {
      build.onResolve({ filter: /.*/, namespace: "esm" }, (args) => {
        if (isReactSpec(args.path)) return { path: resolveReact(args.path), namespace: "file" };
        if (/^https?:\/\//.test(args.path)) return { path: args.path, namespace: "esm" };
        if (args.path.startsWith("/") || args.path.startsWith(".")) return { path: new URL(args.path, args.importer).href, namespace: "esm" };
        return { path: esmUrl(args.path), namespace: "esm" };
      });
      build.onLoad({ filter: /.*/, namespace: "esm" }, async (args) => {
        if (args.path.startsWith("lucide:")) {
          const [, range, names] = args.path.split(":");
          const subset = await lucideSubset(range, names.split(",")).catch(() => null);
          // Fall back to the whole package if an icon isn't in the index.
          if (subset) return { contents: subset, loader: "js" };
          return { contents: await esmModule(esmUrl("lucide-react", range === "latest" ? undefined : range)), loader: "js" };
        }
        if (args.path.startsWith("radix:")) {
          const kebab = (n: string) => n.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
          const lines = args.path.slice("radix:".length).split(",").map((n) => `export * as ${n} from ${JSON.stringify(esmUrl(`@radix-ui/react-${kebab(n)}`))};`);
          return { contents: lines.join("\n"), loader: "js" };
        }
        const source = await esmModule(await plainBuild(args.path));
        // A package's stylesheet can come back as plain CSS even under a .css.mjs name (react-tweet's theme does).
        if (/\.css(\.m?js)?(\?|$)/.test(args.path) && !/^\s*(\/\*[\s\S]*?\*\/\s*)*(import|export|var|let|const|function)\b/.test(source)) {
          return { contents: source, loader: "css" };
        }
        return { contents: zod4Entry(args.path, source) ?? source, loader: "js" };
      });
    },
  };
}

/**
 * esm.sh builds a package once for each set of "external" packages. A package that doesn't use React, imported
 * here with external=react,react-dom and also by esm.sh's own build of, say, react-aria, would load twice, with two
 * sets of classes and caches (@internationalized/date did, breaking React Aria's date fields). Such a package is
 * loaded from its plain build, the one esm.sh's builds import. Whether it uses React comes from its package.json.
 */
async function plainBuild(url: string): Promise<string> {
  const m = url.match(/^https:\/\/esm\.sh\/((?:@[^/@?]+\/)?[^/@?]+)(?:@([^/?]+))?(\/[^?]*)?\?(.*)$/);
  if (!m || !/(^|&)external=react,react-dom(&|$)/.test(m[4])) return url;
  const manifest = `https://cdn.jsdelivr.net/npm/${m[1]}@${m[2] ?? "latest"}/package.json`;
  const uses = await esmModule(manifest)
    .then((text) => {
      const pkg = JSON.parse(text) as { dependencies?: object; peerDependencies?: object };
      return Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }).some((d) => /^react(-dom)?$/.test(d));
    })
    .catch(() => true);
  return uses ? url : url.replace(/[?&]external=react,react-dom/, (s) => (s.startsWith("?") ? "?" : "")).replace("?&", "?");
}

/**
 * esm.sh's builds of zod 4's entry points ("zod" and "zod/v4") export only `default` and `z`, so
 * named imports such as `{ object, string }` fail to bundle. zod/v4/classic/external defines every
 * name, so the entry point is rebuilt from it: everything it exports, plus `z` and the default.
 */
function zod4Entry(url: string, source: string): string | null {
  if (!/\/zod@[^/?]+(\/v4)?(\?|$)/.test(url)) return null;
  const version = source.match(/^\/\* esm\.sh - zod@(\d+)([\d.]*)/)?.slice(1).join("");
  if (!version || Number(version.split(".")[0]) < 4) return null;
  const external = JSON.stringify(`${ESM}/zod@${version}/v4/classic/external?target=es2022`);
  return `export * from ${external};\nimport * as z from ${external};\nexport { z };\nexport default z;`;
}

/** Named imports of `spec` in `code`, or null if it's imported whole (default or namespace). */
function namedImports(code: string, spec: string): string[] | null {
  const from = spec.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const names = new Set<string>();
  for (const m of code.matchAll(new RegExp(`import\\s+(type\\s+)?([^;"'\`]*?)\\s+from\\s*["']${from}["']`, "g"))) {
    if (m[1]) continue; // `import type { ... }` disappears at compile time
    const clause = m[2].trim();
    const braces = clause.match(/\{([^}]*)\}/);
    if (!braces || clause.replace(braces[0], "").replace(/,/g, "").trim()) return null;
    for (const part of braces[1].split(",")) {
      const spec = part.trim();
      if (!spec || spec.startsWith("type ")) continue;
      names.add(spec.split(/\s+as\s+/)[0].trim());
    }
  }
  return names.size ? [...names] : null;
}

// lucide-react ships ~1,700 icons in one module that no bundler can tree-shake
// (esm.sh minifies it and wraps every icon in a namespace object). Its own
// ESM index maps each icon name, aliases included, to a per-icon file, so a
// component that imports three icons gets just those three files.
async function lucideSubset(range: string, names: string[]): Promise<string | null> {
  const base = `https://cdn.jsdelivr.net/npm/lucide-react@${range}/dist/esm`;
  const index = await esmModule(`${base}/lucide-react.mjs`);
  const files = new Map<string, string>();
  for (const m of index.matchAll(/export\s*\{([^}]+)\}\s*from\s*['"]\.\/(icons\/[^'"]+)['"]/g)) {
    for (const part of m[1].split(",")) {
      const alias = part.match(/default\s+as\s+(\w+)/)?.[1];
      if (alias) files.set(alias, m[2]);
    }
  }
  const lines: string[] = [];
  for (const name of names) {
    const file = files.get(name);
    if (!file) return null;
    lines.push(`export { default as ${name} } from "${base}/${file}";`);
  }
  return lines.join("\n");
}

/** Where a bare import from the component's own code should come from. */
export function resolveBare(spec: string, versions: Map<string, string>, importerCode?: string): esbuild.OnResolveResult {
  if (isReactSpec(spec)) return { path: resolveReact(spec), namespace: "file" };
  const parts = spec.split("/");
  const pkg = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  const range = versions.get(pkg) || undefined;
  const names = (spec === "lucide-react" || spec === "radix-ui") && importerCode ? namedImports(importerCode, spec) : null;
  if (names && spec === "lucide-react") return { path: `lucide:${range ?? "latest"}:${names.sort().join(",")}`, namespace: "esm" };
  // `radix-ui` re-exports every primitive; import only the ones used from their own packages.
  if (names && names.every((n) => /^[A-Z][A-Za-z]+$/.test(n))) {
    return { path: `radix:${names.sort().join(",")}`, namespace: "esm" };
  }
  return { path: esmUrl(spec, range), namespace: "esm" };
}
