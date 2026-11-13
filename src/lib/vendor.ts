import "server-only";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import * as esbuild from "esbuild";
import { getAsset, saveAsset, READ_ONLY } from "./db";
import { fetchText } from "./ingest/fetch";

// Resolves a preview's npm imports so esbuild can bundle them into the preview
// itself: React comes from one script every preview shares (sharedReactRuntime),
// built from this app's own node_modules, and everything else is fetched once
// from esm.sh as ES modules and kept in SQLite, so rebuilding a preview needs no
// network.

export const isReactSpec = (spec: string) => /^react(-dom)?(\/.*)?$/.test(spec);

/**
 * The React module an esm.sh URL names (`/react@19.3.1/es2022/jsx-runtime.mjs` is "react/jsx-runtime"). A package
 * loaded from its plain build because it doesn't declare React (ce-la-react, under media-chrome's React wrapper)
 * still imports it, and must get this app's copy rather than a second React whose hooks have no renderer.
 */
function esmReactSpec(url: string): string | null {
  const m = url.match(/^https:\/\/esm\.sh\/(react|react-dom)(?:@[^/?]+)?(\/[^?]*)?(?:\?|$)/);
  if (!m) return null;
  const rest = (m[2] ?? "").replace(/^\/es20\d\d\//, "/").replace(/\.(development\.)?mjs$/, "");
  return m[1] + (rest === `/${m[1]}` ? "" : rest);
}

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

/**
 * The React modules every preview loads from one shared script instead of bundling a copy each. React was about
 * 60 KB of each compressed preview, the bulk of the snapshot, which outgrew GitHub's 100 MB file limit with it.
 */
const SHARED_REACT = new Set(["react", "react/jsx-runtime", "react/jsx-dev-runtime", "react/compiler-runtime", "react-dom", "react-dom/client"]);
const SHARED_GLOBAL = "__lookbookReact";

/** Where an import of React resolves: the shared script's copy, or the file on disk for a part it doesn't carry. */
export function resolveReactSpec(spec: string): esbuild.OnResolveResult {
  return SHARED_REACT.has(spec) ? { path: spec, namespace: "shared-react" } : { path: resolveReact(spec), namespace: "file" };
}

const RUNTIME_DIR = path.join(process.cwd(), "public", "preview-runtime");
const runtimeCode = new Map<string, string | null>();

/**
 * A stored preview with the shared React script's code in place of its link, as it's served. Every request a
 * sandboxed preview makes counts as third-party, and content blockers (the Claude app's own browser among them)
 * refuse third-party scripts, so the page carries React itself as previews always did: only the stored copies,
 * and so the snapshot, share one.
 */
export function withSharedReact(html: string): string {
  return html.replace(/<script src="\/preview-runtime\/([\w.-]+\.js)"><\/script>/, (tag, name: string) => {
    let code = runtimeCode.get(name);
    if (code === undefined) {
      code = existsSync(path.join(RUNTIME_DIR, name)) ? readFileSync(path.join(RUNTIME_DIR, name), "utf8") : null;
      runtimeCode.set(name, code);
    }
    return code == null ? tag : `<script>${code.replace(/<\/script/gi, "<\\/script")}</script>`;
  });
}

let runtime: Promise<string> | null = null;

/**
 * The shared React script's path on the site. It's built once from this app's copy of React and kept in
 * public/preview-runtime/ (committed, so production has it) under a name that changes with its content, so a
 * preview built against one copy never gets another.
 */
export function sharedReactRuntime(): Promise<string> {
  runtime ??= (async () => {
    const modules = [...SHARED_REACT].map((s) => `${JSON.stringify(s)}: require(${JSON.stringify(resolveReact(s))})`);
    const out = await esbuild.build({
      stdin: { contents: `globalThis.${SHARED_GLOBAL} = {\n${modules.join(",\n")}\n};`, resolveDir: process.cwd(), loader: "js" },
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      target: "es2022",
      minify: true,
      logLevel: "silent",
      define: { "process.env.NODE_ENV": '"production"' },
    });
    const code = out.outputFiles[0].text;
    const { version } = appRequire("react/package.json") as { version: string };
    const name = `react-${version}-${createHash("sha256").update(code).digest("hex").slice(0, 10)}.js`;
    if (!READ_ONLY && !existsSync(path.join(RUNTIME_DIR, name))) {
      mkdirSync(RUNTIME_DIR, { recursive: true });
      writeFileSync(path.join(RUNTIME_DIR, name), code);
    }
    return `/preview-runtime/${name}`;
  })();
  return runtime;
}

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
      // A part of React the shared script doesn't carry (react-dom/server) is bundled from disk, and uses its React.
      build.onResolve({ filter: /^react(-dom)?(\/.*)?$/, namespace: "file" }, (args) => (SHARED_REACT.has(args.path) ? resolveReactSpec(args.path) : undefined));
      build.onLoad({ filter: /.*/, namespace: "shared-react" }, (args) => ({
        contents: `module.exports = globalThis.${SHARED_GLOBAL}[${JSON.stringify(args.path)}];`,
        loader: "js",
      }));
      build.onResolve({ filter: /.*/, namespace: "esm" }, (args) => {
        if (isReactSpec(args.path)) return resolveReactSpec(args.path);
        // A whole lucide-react loaded in place of a subset (below) still imports its parts by esm.sh paths.
        const url = /^https?:\/\//.test(args.path)
          ? args.path
          : args.path.startsWith("/") || args.path.startsWith(".")
            ? new URL(args.path, /^https?:\/\//.test(args.importer) ? args.importer : `${ESM}/`).href
            : null;
        if (url) {
          const react = esmReactSpec(url);
          if (react && isReactSpec(react)) return resolveReactSpec(react);
          return { path: url, namespace: "esm" };
        }
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
  // Releases before about 0.545 name their index lucide-react.js; without it every icon would be bundled.
  const index = (await esmModule(`${base}/lucide-react.mjs`).catch(() => null)) ?? (await esmModule(`${base}/lucide-react.js`));
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
  if (isReactSpec(spec)) return resolveReactSpec(spec);
  const parts = spec.split("/");
  const pkg = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  const range = versions.get(pkg) || undefined;
  const names = (spec === "lucide-react" || spec === "radix-ui") && importerCode ? namedImports(importerCode, spec) : null;
  if (names && spec === "lucide-react") return { path: `lucide:${range ?? "latest"}:${names.sort().join(",")}`, namespace: "esm" };
  // `radix-ui` re-exports every primitive; import only the ones used from their own packages.
  if (names && names.every((n) => /^[A-Z][A-Za-z]+$/.test(n))) {
    return { path: `radix:${names.sort().join(",")}`, namespace: "esm" };
  }
  // faker's main entry carries every locale (about 4 MB, so each of Kibo UI's demos that make sample data was near
  // 1 MB compressed). A demo that only wants `faker` gets the English one, which exports the same object.
  if (spec === "@faker-js/faker" && importerCode && namedImports(importerCode, spec)?.join() === "faker") {
    return { path: esmUrl("@faker-js/faker/locale/en", range), namespace: "esm" };
  }
  // Some icon sets come from esm.sh as one module per icon (@tabler/icons-react 3.31, which shadcn/ui pins: about
  // 5,000 requests for one preview). Asked for just the icons used, esm.sh sends one module instead.
  const icons = ICON_SETS.test(spec) && importerCode ? namedImports(importerCode, spec) : null;
  if (icons?.length) return { path: `${esmUrl(spec, range)}&exports=${icons.sort().join(",")}`, namespace: "esm" };
  return { path: esmUrl(spec, range), namespace: "esm" };
}

const ICON_SETS = /^(@tabler\/icons-react|@phosphor-icons\/react|@radix-ui\/react-icons|@remixicon\/react|@hugeicons\/core-free-icons|@heroicons\/react\/.+|react-icons\/\w+)$/;
