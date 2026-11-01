import "server-only";
import path from "node:path/posix";
import * as esbuild from "esbuild";
import { getPreview, READ_ONLY, savePreview } from "./db";
import { fetchJson } from "./ingest/fetch";
import { rawGithubUrl } from "./ingest/links";
import type { RegistryItem } from "./ingest/shadcn";
import { SCROLLBAR_SCRIPT } from "./scrollbars";
import { fetchRaw, loadSource, registryLookup, repoTree } from "./source";
import { compileTailwind } from "./tailwind";
import { npmPlugin, resolveBare } from "./vendor";
import type { Component, ComponentStyles, Library } from "./types";

// Live previews: the component (and its demo, when the library ships one) is
// bundled on the server with esbuild from a virtual file system, and its
// Tailwind CSS is compiled on the server from the classes it uses. npm imports
// are bundled in too (React from this app, other packages from esm.sh, see
// vendor.ts), so a preview is one self-contained HTML document with a single
// inline script and stylesheet. It's served from /preview/* and shown in a
// sandboxed iframe, so third-party code never runs with this app's origin.

const VERSION = "preview:v23";
const SHADCN_BASE = "https://ui.shadcn.com/r/styles/new-york-v4";
const EXTS = ["", ".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"];

export type PreviewResult = { html: string; ok: boolean; error?: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const clean = (p: string) => path.normalize(p.replace(/^\.?\/+/, ""));
const stripExt = (p: string) => p.replace(/\.(tsx|ts|jsx|js|mjs|cjs)$/, "");
const pascal = (s: string) => s.split(/[^a-zA-Z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("");

const SHIMS: Record<string, string> = {
  "next/link": `import * as React from "react"; export default React.forwardRef(function Link({ href, prefetch, replace, scroll, shallow, legacyBehavior, passHref, ...rest }, ref) { return React.createElement("a", { ref, href: typeof href === "string" ? href : (href && href.pathname) || "#", ...rest }); });`,
  "next/image": `import * as React from "react"; export default React.forwardRef(function Image({ src, alt, fill, priority, quality, placeholder, blurDataURL, loader, unoptimized, style, ...rest }, ref) { const s = typeof src === "object" && src ? src.src : src; return React.createElement("img", { ref, src: s, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", ...style } : style, ...rest }); });`,
  "next/navigation": `export const useRouter = () => ({ push() {}, replace() {}, back() {}, forward() {}, refresh() {}, prefetch() {} }); export const usePathname = () => "/"; export const useSearchParams = () => new URLSearchParams(); export const useParams = () => ({}); export const redirect = () => {}; export const notFound = () => {};`,
  "next/router": `export const useRouter = () => ({ push() {}, replace() {}, back() {}, pathname: "/", query: {}, asPath: "/", events: { on() {}, off() {} } }); export default { push() {} };`,
  "next/dynamic": `import * as React from "react"; export default function dynamic(loader) { const C = React.lazy(async () => { const m = await loader(); return { default: m.default ?? m }; }); return (props) => React.createElement(React.Suspense, { fallback: null }, React.createElement(C, props)); }`,
  "next/head": `export default function Head() { return null; }`,
  "next/script": `export default function Script() { return null; }`,
  "next/font/google": `export default new Proxy({}, { get: () => () => ({ className: "", style: {}, variable: "" }) }); export const Inter = () => ({ className: "", variable: "" }); export const Geist = Inter, Geist_Mono = Inter, Roboto = Inter, Poppins = Inter, Space_Grotesk = Inter, JetBrains_Mono = Inter, Instrument_Serif = Inter;`,
  "next/font/local": `export default () => ({ className: "", style: {}, variable: "" });`,
  "next-themes": `import * as React from "react"; const dark = () => document.documentElement.classList.contains("dark"); export function useTheme() { const t = dark() ? "dark" : "light"; return { theme: t, resolvedTheme: t, systemTheme: t, themes: ["light", "dark"], setTheme: (v) => document.documentElement.classList.toggle("dark", v === "dark") }; } export function ThemeProvider({ children }) { return React.createElement(React.Fragment, null, children); }`,
};

const CN_SHIM = `import { clsx } from "clsx"; import { twMerge } from "tailwind-merge"; export function cn(...inputs) { return twMerge(clsx(inputs)); }`;

/** Holds every source file the bundle may need, and resolves imports against them. */
class SourceGraph {
  files = new Map<string, string>();
  private byBase = new Map<string, string>();
  private aliases = new Map<string, string>();
  deps = new Map<string, string>();
  /** The component's own registry item URL, so imports of its siblings (`@/registry/magicui/x`) can be fetched. */
  itemUrl: string | null = null;

  constructor(private library: Library) {}

  add(filePath: string, content: string, aliases: (string | undefined)[] = []) {
    const p = clean(filePath);
    if (this.files.has(p)) return p;
    this.files.set(p, content);
    for (const a of [p, ...aliases]) {
      if (!a) continue;
      this.aliases.set(stripExt(clean(a)), p);
      const base = norm(stripExt(a.split("/").pop()!));
      if (!this.byBase.has(base)) this.byBase.set(base, p);
    }
    return p;
  }

  addDeps(deps: string[] | undefined) {
    for (const d of deps ?? []) {
      const m = d.match(/^(@[^/@]+\/[^@]+|[^@]+)(?:@(.+))?$/);
      if (m && !this.deps.has(m[1])) this.deps.set(m[1], m[2] ?? "");
    }
  }

  addItem(item: RegistryItem, namePrefix = "") {
    for (const f of item.files ?? []) {
      if (typeof f === "string" || !f.content) continue;
      this.add(f.path, f.content, [f.target, namePrefix && `${namePrefix}/${item.name}`]);
    }
    this.addDeps(item.dependencies);
  }

  /** The first candidate path that exists in the library's GitHub repo, fetched and added. */
  private async fromRepo(candidates: string[]): Promise<string | null> {
    const repo = this.library.repo;
    if (!repo) return null;
    const tree = new Set(await repoTree(repo));
    const hit = candidates.map(clean).find((c) => tree.has(c));
    const content = hit ? await fetchRaw(rawGithubUrl(repo, hit)) : null;
    return hit && content != null ? this.add(hit, content) : null;
  }

  private lookup(candidates: string[]): string | null {
    for (const c of candidates) {
      const p = clean(c);
      if (this.files.has(p)) return p;
      const viaAlias = this.aliases.get(stripExt(p));
      if (viaAlias) return viaAlias;
    }
    return null;
  }

  async resolve(spec: string, importer: string | null): Promise<string | null> {
    let bases: string[];
    if (spec.startsWith(".")) bases = [path.join(path.dirname(importer ?? ""), spec)];
    else {
      const rest = spec.replace(/^(@|~|#|\$lib)\//, "");
      bases = [rest, `src/${rest}`, `app/${rest}`];
      // In a monorepo, `@/` means the importing app's own folder, like apps/v4/ in shadcn/ui's repo.
      const app = importer?.match(/^((?:apps|packages)\/[^/]+)\//)?.[1];
      if (app) bases.push(`${app}/${rest}`, `${app}/src/${rest}`);
    }
    const candidates = bases.flatMap((b) => EXTS.map((e) => b + e));
    const found = this.lookup(candidates);
    if (found) return found;

    // A demo from inside a monorepo app imports that app's own copies of the components, which can differ from the
    // registry's (shadcn/ui's per-style bases), so those come from the repo before any same-named file here.
    if (importer && /^(apps|packages)\//.test(importer)) {
      const own = await this.fromRepo(candidates);
      if (own) return own;
    }

    const last = norm(stripExt(spec.split("/").pop()!));
    if (last !== "index" && this.byBase.has(last)) return this.byBase.get(last)!;

    const own = await this.fromRepo(candidates);
    if (own) return own;

    // Another item from the component's own registry, like Magic UI's `@/registry/magicui/tweet-card`.
    const sibling = this.itemUrl && /^(@|~)\/registry\//.test(spec) ? spec.split("/").pop()! : null;
    if (sibling && /^[a-z0-9-]+$/.test(sibling)) {
      const url = this.itemUrl!.replace(/[^/]+?(\.json)?$/, (m) => sibling + (m.endsWith(".json") ? ".json" : ""));
      const item = await fetchJson<RegistryItem>(url);
      const first = item?.files?.find((f) => typeof f === "object" && f.content);
      if (item && first && typeof first === "object") {
        this.addItem(item);
        this.aliases.set(stripExt(clean(spec.replace(/^(@|~)\//, ""))), clean(first.path));
        return clean(first.path);
      }
    }

    // shadcn/ui primitives (`@/components/ui/button`, `@/hooks/use-mobile`) come from the official registry, as do
    // the per-style copies its own demos import (`@/styles/radix-nova/ui/card`, `@/registry/bases/radix/ui/card`).
    const base = spec.match(/(?:components\/ui|registry\/[\w-]+\/ui|registry\/bases\/[\w-]+\/ui|styles\/[\w-]+\/ui|hooks)\/([\w-]+)$/)?.[1];
    if (base) {
      const item = await fetchJson<RegistryItem>(`${SHADCN_BASE}/${base}.json`);
      if (item?.files?.length) {
        this.addItem(item);
        const first = item.files[0];
        const p = typeof first === "string" ? first : first.path;
        this.aliases.set(stripExt(clean(spec.replace(/^(@|~)\//, ""))), clean(p));
        return clean(p);
      }
    }
    return null;
  }
}

/** Translates registry `cssVars` / `css` / `tailwind` fields into Tailwind v4 CSS. */
function stylesToCss(styles: ComponentStyles | null | undefined): string {
  if (!styles) return "";
  const kebab = (k: string) => (/^[a-z]+[A-Z]/.test(k) ? k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`) : k);
  const vars = (o: Record<string, string> | undefined) => Object.entries(o ?? {}).map(([k, v]) => `  ${k.startsWith("--") ? k : `--${k}`}: ${v};`).join("\n");
  const block = (o: Record<string, unknown>): string =>
    Object.entries(o)
      .map(([k, v]) => (v && typeof v === "object" ? `${k} {\n${block(v as Record<string, unknown>)}\n}` : `${kebab(k)}: ${v};`))
      .join("\n");
  const out: string[] = [];
  const theme: string[] = [];
  if (styles.cssVars?.theme) theme.push(vars(styles.cssVars.theme));
  if (styles.cssVars?.light) out.push(`:root {\n${vars(styles.cssVars.light)}\n}`);
  if (styles.cssVars?.dark) out.push(`.dark {\n${vars(styles.cssVars.dark)}\n}`);
  if (styles.css) out.push(block(styles.css));
  const extend = styles.tailwind?.config?.theme?.extend as { keyframes?: Record<string, Record<string, unknown>>; animation?: Record<string, string> } | undefined;
  for (const [name, frames] of Object.entries(extend?.keyframes ?? {})) out.push(`@keyframes ${name} {\n${block(frames)}\n}`);
  for (const [name, value] of Object.entries(extend?.animation ?? {})) theme.push(`  --animate-${name}: ${value};`);
  if (theme.length) out.unshift(`@theme {\n${theme.join("\n")}\n}`);
  return out.join("\n");
}

let twAnimate: Promise<string> | null = null;
const twAnimateCss = () => (twAnimate ??= fetchRaw("https://cdn.jsdelivr.net/npm/tw-animate-css@1.4.0/dist/tw-animate.css").then((t) => t ?? ""));

const THEME_CSS = `
@custom-variant dark (&:is(.dark *));
:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0); --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0); --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0); --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0); --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0); --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0); --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0); --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325); --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(0.922 0 0); --input: oklch(0.922 0 0); --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.646 0.222 41.116); --chart-2: oklch(0.6 0.118 184.704); --chart-3: oklch(0.398 0.07 227.392); --chart-4: oklch(0.828 0.189 84.429); --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(0.985 0 0); --sidebar-foreground: oklch(0.145 0 0); --sidebar-primary: oklch(0.205 0 0); --sidebar-primary-foreground: oklch(0.985 0 0); --sidebar-accent: oklch(0.97 0 0); --sidebar-accent-foreground: oklch(0.205 0 0); --sidebar-border: oklch(0.922 0 0); --sidebar-ring: oklch(0.708 0 0);
}
.dark {
  --background: oklch(0.145 0 0); --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0); --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0); --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0); --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0); --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0); --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0); --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%); --input: oklch(1 0 0 / 15%); --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.488 0.243 264.376); --chart-2: oklch(0.696 0.17 162.48); --chart-3: oklch(0.769 0.188 70.08); --chart-4: oklch(0.627 0.265 303.9); --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.205 0 0); --sidebar-foreground: oklch(0.985 0 0); --sidebar-primary: oklch(0.488 0.243 264.376); --sidebar-primary-foreground: oklch(0.985 0 0); --sidebar-accent: oklch(0.269 0 0); --sidebar-accent-foreground: oklch(0.985 0 0); --sidebar-border: oklch(1 0 0 / 10%); --sidebar-ring: oklch(0.556 0 0);
}
@theme inline {
  --color-background: var(--background); --color-foreground: var(--foreground);
  --color-card: var(--card); --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover); --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary); --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary); --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted); --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent); --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive); --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border); --color-input: var(--input); --color-ring: var(--ring);
  --color-chart-1: var(--chart-1); --color-chart-2: var(--chart-2); --color-chart-3: var(--chart-3); --color-chart-4: var(--chart-4); --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar); --color-sidebar-foreground: var(--sidebar-foreground); --color-sidebar-primary: var(--sidebar-primary); --color-sidebar-primary-foreground: var(--sidebar-primary-foreground); --color-sidebar-accent: var(--sidebar-accent); --color-sidebar-accent-foreground: var(--sidebar-accent-foreground); --color-sidebar-border: var(--sidebar-border); --color-sidebar-ring: var(--sidebar-ring);
  --radius-sm: calc(var(--radius) - 4px); --radius-md: calc(var(--radius) - 2px); --radius-lg: var(--radius); --radius-xl: calc(var(--radius) + 4px);
}
@layer base {
  * { @apply border-border outline-ring/50; }
  html, body { @apply bg-background text-foreground; margin: 0; }
}`;

// Mounts the demo (or component) inside an error boundary. If the demo crashes,
// it falls back to the bare component, then the component with sample children,
// and only reports an error to the parent page when every attempt fails.
const MOUNT = `
import * as Mod from "__target__";
import * as Main from "__component__";
import * as Providers from "__providers__";
import * as React from "react";
import { createRoot } from "react-dom/client";
const report = (status, error) => { try { parent.postMessage({ source: "ui-agg-preview", status, error: error ? String(error.message || error) : undefined }, "*"); } catch {} };
const isComp = (v) => typeof v === "function" || (v && typeof v === "object" && "$$typeof" in v);
function pick(m, preferred) {
  for (const name of preferred) if (isComp(m[name])) return m[name];
  if (isComp(m.default)) return m.default;
  const named = Object.entries(m).find(([k, v]) => /^[A-Z]/.test(k) && isComp(v));
  return named ? named[1] : null;
}
const entry = pick(Mod, __PREFERRED__);
const main = pick(Main, __PREFERRED_MAIN__);
// A bare component often needs the provider its module ships beside it (Sidebar and SidebarProvider).
const providerOf = (m, C) => { const name = Object.keys(m).find((k) => m[k] === C); return name && isComp(m[name + "Provider"]) ? m[name + "Provider"] : null; };
const attempts = [];
if (entry) attempts.push([entry, {}, providerOf(Mod, entry)]);
if (main && main !== entry) attempts.push([main, {}, providerOf(Main, main)]);
if (main || entry) attempts.push([main || entry, { children: "Preview" }, main ? providerOf(Main, main) : providerOf(Mod, entry)]);
class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { error: null, attempt: 0 }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) {
    if (this.state.attempt < attempts.length - 1) this.setState({ error: null, attempt: this.state.attempt + 1 });
    else report("error", error);
  }
  render() {
    if (this.state.error) {
      // Render nothing until componentDidCatch moves on: rendering the attempt that just failed would only
      // throw again, past this boundary, and skip the fallbacks.
      if (this.state.attempt < attempts.length - 1) return null;
      return React.createElement("div", { className: "__preview-error" }, "This preview crashed (" + String(this.state.error.message || this.state.error) + "). The original page shows it in action.");
    }
    const [C, props, Provider] = attempts[this.state.attempt];
    let el = React.createElement(C, props);
    if (Provider) el = React.createElement(Provider, null, el);
    return Providers.TooltipProvider ? React.createElement(Providers.TooltipProvider, null, el) : el;
  }
}
// Only React's own uncaught errors count as a failed preview. Errors React recovers
// from, or that come from timers and animation loops, are left to the console.
if (!attempts.length) report("error", "No component export found");
else {
  const root = createRoot(document.getElementById("root"), {
    onUncaughtError: (error) => report("error", error),
    onCaughtError: (error) => console.warn("Preview fallback:", error),
    onRecoverableError: (error) => console.warn(error),
  });
  root.render(React.createElement(Boundary));
  // Report after the first paint; browsers pause animation frames in offscreen frames, so a timer backs it up.
  let sent = false;
  const ready = () => { if (!sent) { sent = true; report("ready"); } };
  requestAnimationFrame(() => requestAnimationFrame(ready));
  setTimeout(ready, 150);
  // Some parts render nothing on their own (a provider, a form context, an empty list); say so rather than show an empty box.
  setTimeout(() => {
    const root = document.getElementById("root");
    const shows = root.textContent.trim() || [...root.querySelectorAll("*")].some((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    if (!shows) report("error", "This component renders nothing on its own");
  }, 1500);
}`;

// Sets the preview's theme before it paints. Opened on its own it follows
// ?theme=, or else the system. Inside Lookbook it asks the page and follows it
// from then on (src/lib/preview-bridge.ts), so the URL carries no theme, the
// page can put frames in its server HTML, and a theme switch reloads nothing.
const THEME_BRIDGE = `(function(){var q=new URLSearchParams(location.search),d=document.documentElement;function set(t){d.classList.toggle("dark",t==="dark")}if(q.get("frame")==="tile")d.dataset.frame="tile";var forced=q.get("theme");if(forced)return set(forced);set(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");if(parent===window)return;addEventListener("message",function(e){if(e.source===parent&&e.data&&e.data.source==="lookbook"&&e.data.theme)set(e.data.theme)});try{parent.postMessage({source:"ui-agg-preview",want:"theme"},"*")}catch(x){}})();`;

function documentHtml(parts: { head?: string; css?: string; body: string; script?: string }) {
  const esc = (s: string) => s.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html>
<!-- ${VERSION} -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>${THEME_BRIDGE}${SCROLLBAR_SCRIPT}</script>
<style>
#root { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 32px; box-sizing: border-box; }
/* Grid tiles don't take pointer input, so a scrollbar there can't be used. Anything taller than the tile is cropped instead. */
html[data-frame="tile"] { overflow: hidden; }
/* Lookbook's scrollbars: no track, a translucent pill shown while scrolling (SCROLLBAR_SCRIPT). Grey reads on light and dark demos alike; a component's own scrollbar styles still win. */
::-webkit-scrollbar { width: 12px; height: 12px; }
::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
::-webkit-scrollbar-thumb { border: 3px solid transparent; border-radius: 999px; background: transparent padding-box; }
[data-scrolling]::-webkit-scrollbar-thumb { background-color: rgb(128 128 128 / 0.4); }
::-webkit-scrollbar-thumb:hover, ::-webkit-scrollbar-thumb:active { background-color: rgb(128 128 128 / 0.6); }
@supports not selector(::-webkit-scrollbar) { html { scrollbar-width: thin; scrollbar-color: transparent transparent; } [data-scrolling] { scrollbar-color: rgb(128 128 128 / 0.4) transparent; } }
#root > * { max-width: 100%; }
/* A card that sets no width of its own (like shadcn/ui's chart demos) would shrink to fit its title in this
   centred layout, leaving a chart sized "100% wide" with nothing to fill. It gets a comfortable width instead.
   It's in the base layer, so a width the demo does set (a Tailwind utility) still wins. */
@layer base { #root > [data-slot="card"] { width: min(100%, 36rem); } }
.__preview-error { font: 14px/1.5 system-ui, sans-serif; color: #737373; text-align: center; max-width: 320px; }
${parts.css ?? ""}
</style>
${parts.head ?? ""}
</head>
<body>
<div id="root">${parts.body}</div>
${parts.script ? `<script type="module">${esc(parts.script)}</script>` : ""}
</body>
</html>`;
}

function errorHtml(message: string) {
  const safe = message.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
  return documentHtml({
    body: `<div class="__preview-error">${safe}</div>`,
    script: `parent.postMessage({ source: "ui-agg-preview", status: "error", error: ${JSON.stringify(message)} }, "*");`,
  });
}

function exportedNames(code: string): { named: Set<string>; defaultName: string | null } {
  const named = new Set<string>();
  for (const m of code.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) named.add(m[1]);
  for (const m of code.matchAll(/export\s*\{([^}]*)\}/g)) for (const part of m[1].split(",")) named.add(part.trim().split(/\s+as\s+/).pop()!.trim());
  const defaultName = code.match(/export\s+default\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/)?.[1] ?? code.match(/export\s+default\s+([A-Z][\w$]*)\s*;?\s*$/m)?.[1] ?? null;
  return { named, defaultName };
}

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/**
 * Replaces `import { DEMO_COMPONENTS } from "./registry"` with an object built
 * from real imports: names the main component exports come from it, anything
 * else is looked up among the library's other components.
 */
async function rewriteLookup(
  source: string,
  lookup: { statement: string; binding: string },
  mainCode: string,
  graph: SourceGraph,
  examplePath: string,
): Promise<string | null> {
  const names = new Set<string>();
  for (const m of source.matchAll(new RegExp(`const\\s*\\{([^}]*)\\}\\s*=\\s*${lookup.binding}\\b`, "g"))) {
    for (const part of m[1].split(",")) {
      const name = part.split(":")[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  const { named, defaultName } = exportedNames(mainCode);
  const imports = [`import * as __main from "__component__";`];
  const entries: string[] = [];
  let i = 0;
  // The lookup table itself, fetched from the repo only if a name isn't in the component or its ui folder.
  let table: { path: string; code: string } | null | undefined;
  const tableEntry = async (name: string) => {
    if (table === undefined) {
      const spec = lookup.statement.match(/from\s*["']([^"']+)["']/)?.[1];
      const tablePath = spec ? await graph.resolve(spec, examplePath) : null;
      table = tablePath ? { path: tablePath, code: graph.files.get(tablePath) ?? "" } : null;
    }
    // An entry like `Chat: lazyNamed(() => import("../sections/Showcase"), "ChatShowcase")` or `Chat: lazy(() => import("../ui/Chat"))`.
    const m = table?.code.match(new RegExp(`\\b${name}\\s*:\\s*[\\w.]+\\(\\s*\\(\\)\\s*=>\\s*import\\(\\s*["']([^"']+)["']\\s*\\)(?:\\s*,\\s*["'](\\w+)["'])?`));
    const file = table && m ? await graph.resolve(m[1], table.path) : null;
    return file ? { file, exportName: m![2] ?? name } : null;
  };
  for (const name of names) {
    if (named.has(name)) entries.push(`${name}: __main.${name}`);
    else if (name === defaultName) entries.push(`${name}: __main.default`);
    else {
      const path = (await graph.resolve(`@/components/ui/${name}`, null)) ?? (await graph.resolve(`@/components/ui/${kebab(name)}`, null));
      const listed = path ? null : await tableEntry(name);
      if (path) {
        imports.push(`import * as __dep${i} from "__path__:${path}";`);
        entries.push(`${name}: __dep${i}.${name} ?? __dep${i}.default`);
        i++;
      } else if (listed) {
        imports.push(`import * as __dep${i} from "__path__:${listed.file}";`);
        entries.push(`${name}: __dep${i}[${JSON.stringify(listed.exportName)}] ?? __dep${i}.default`);
        i++;
      } else return null;
    }
  }
  return source.replace(lookup.statement, `${imports.join("\n")}\nconst ${lookup.binding} = { ${entries.join(", ")} };`);
}

/**
 * Maps paths in a library's code to the files in its GitHub repo, so images and
 * sounds load in the preview. A docs site that is its own repo refers to its
 * `public/` folder with root-relative paths: "/library/shoe.jpg", or a folder
 * like "/library/voice" that the code appends file names to.
 */
async function repoAssets(library: Library) {
  const repo = library.repo;
  const files = new Set(repo ? await repoTree(repo) : []);
  const publicDirs = new Set<string>();
  for (const f of files) {
    if (!f.startsWith("public/")) continue;
    const parts = f.split("/");
    for (let i = 2; i < parts.length; i++) publicDirs.add(parts.slice(0, i).join("/"));
  }
  const publicUrl = (p: string) => {
    const candidate = `public${p.replace(/[?#].*$/, "")}`;
    return repo && (files.has(candidate) || publicDirs.has(candidate)) ? rawGithubUrl(repo, candidate) : null;
  };
  return {
    /** Where a stylesheet's `url(...)` should point. SVG filter fragments, data URIs and absolute URLs stay as written. */
    cssUrl(spec: string, importer: string): string {
      if (/^(#|data:|https?:|\/\/)/.test(spec) || !repo) return spec;
      if (spec.startsWith("/")) return publicUrl(spec) ?? spec;
      const candidate = path.join(path.dirname(importer), spec.replace(/[?#].*$/, ""));
      return files.has(candidate) ? rawGithubUrl(repo, candidate) : spec;
    },
    /** Rewrites root-relative string literals that name a file or folder in `public/`. */
    inCode(code: string): string {
      if (!publicDirs.size) return code;
      return code.replace(/(["'`])(\/[\w.-]+(?:\/[\w.-]+)*)\1/g, (m, quote: string, p: string) => {
        const url = publicUrl(p);
        return url ? `${quote}${url}${quote}` : m;
      });
    },
  };
}

async function bundleReact(c: Component, library: Library): Promise<PreviewResult> {
  const assets = await repoAssets(library);
  const graph = new SourceGraph(library);
  graph.itemUrl = c.itemUrl;
  graph.addDeps(c.dependencies);
  const mainFiles = c.files.filter((f) => f.content && /\.(tsx|jsx|ts|js|css)$/.test(f.path));
  if (!mainFiles.some((f) => /\.(tsx|jsx|js)$/.test(f.path))) return { ok: false, html: errorHtml("No source code is available for a live preview."), error: "no-source" };
  for (const f of c.files) if (f.content) graph.add(f.path, f.content, [f.target, `components/${c.librarySlug}/${c.slug}`, `components/ui/${c.slug}`]);

  // Registry dependencies such as `@magicui/marquee`, a full item URL, or a shadcn primitive name.
  await Promise.all(
    c.registryDependencies.slice(0, 10).map(async (dep) => {
      const name = dep.replace(/\.json$/, "").split("/").pop()!;
      const url = /^https?:/.test(dep) ? dep : dep.startsWith("@") && c.itemUrl ? c.itemUrl.replace(/[^/]+(\.json)?$/, (m) => name + (m.endsWith(".json") ? ".json" : "")) : `${SHADCN_BASE}/${name}.json`;
      const item = await fetchJson<RegistryItem>(url);
      if (item) graph.addItem(item, "components");
    }),
  );

  // A block that ships its own page (shadcn's registry:page) is previewed as that page: the page sets up what its
  // parts need, like the SidebarProvider around a sidebar, so a demo or a bare part would only crash without it.
  const page = mainFiles.find((f) => f.type === "registry:page" && /\.(tsx|jsx|js)$/.test(f.path));
  const mainComponent =
    page ??
    mainFiles.find((f) => f.type !== "registry:lib" && /\.(tsx|jsx|js)$/.test(f.path) && !/lib\/utils/.test(f.path)) ??
    mainFiles.find((f) => /\.(tsx|jsx|js)$/.test(f.path))!;
  let exampleFile = page ? undefined : c.example?.files?.find((f) => f.content && /\.(tsx|jsx|js)$/.test(f.path));
  let exampleSource = exampleFile?.content;
  const lookup = exampleSource ? registryLookup(exampleSource) : null;
  if (lookup && exampleSource) {
    exampleSource = (await rewriteLookup(exampleSource, lookup, mainComponent.content ?? "", graph, exampleFile!.path)) ?? undefined;
    // A demo that needs components we can't find is worse than no demo.
    if (!exampleSource) exampleFile = undefined;
  }
  const entryFile = exampleFile ?? mainComponent;
  const entrySource = exampleFile && exampleSource ? exampleSource : mainComponent.content!;
  const entryPath = graph.add(entryFile.path, entrySource);
  const preferred = [pascal(stripExt(entryPath.split("/").pop()!)), pascal(c.slug), pascal(`${c.slug}-demo`)];
  const preferredMain = [pascal(stripExt(mainComponent.path.split("/").pop()!)), pascal(c.slug)];

  // Apps built with shadcn/ui put a TooltipProvider at their root, and its Tooltip now expects one, so a preview
  // that uses the tooltip gets one too (MOUNT): from the module the code imports it from, like "@/components/ui/tooltip".
  const tooltipModule = [...graph.files.values()].flatMap((code) => [...code.matchAll(/from\s+["']((?:@|~)\/[^"']*\/tooltip)["']/g)].map((m) => m[1]))[0];

  const missing: string[] = [];
  const cssLinks: string[] = [];
  const plugin: esbuild.Plugin = {
    name: "virtual",
    setup(build) {
      build.onResolve({ filter: /.*/ }, async (args) => {
        // Imports inside npm packages (esm.sh modules, React on disk) resolve normally.
        if (args.kind !== "entry-point" && (args.namespace === "esm" || args.namespace === "file")) return undefined;
        const spec = args.path;
        if (args.kind === "url-token") return { path: assets.cssUrl(spec, args.importer), external: true };
        if (args.kind === "import-rule" && /^(https?:)?\/\//.test(spec)) return { path: spec, external: true };
        if (spec === "__entry__") return { path: "__entry__", namespace: "v" };
        if (spec === "__target__") return { path: entryPath, namespace: "v" };
        if (spec === "__component__") return { path: clean(mainComponent.path), namespace: "v" };
        if (spec === "__providers__") return { path: "__providers__", namespace: "v" };
        if (spec.startsWith("__path__:")) return { path: spec.slice("__path__:".length), namespace: "v" };
        if (SHIMS[spec]) return { path: `shim:${spec}`, namespace: "v" };
        const importer = args.namespace === "v" ? args.importer : null;
        // shadcn's newer registry items import the class helper as a bare "cn".
        if (/(^|\/)lib\/utils$/.test(spec) || spec === "@/lib/utils" || spec === "cn") {
          const own = await graph.resolve(spec, importer);
          return own ? { path: own, namespace: "v" } : { path: "shim:cn", namespace: "v" };
        }
        const isBare = !/^(\.|\/|@\/|~\/|#\/|\$lib\/)/.test(spec);
        if (isBare) {
          if (spec.endsWith(".css")) {
            cssLinks.push(`https://cdn.jsdelivr.net/npm/${spec}`);
            return { path: "shim:empty", namespace: "v" };
          }
          return resolveBare(spec, graph.deps, importer ? graph.files.get(importer) : undefined);
        }
        const resolved = await graph.resolve(spec, importer);
        if (resolved) return { path: resolved, namespace: "v" };
        missing.push(spec);
        return { path: `missing:${spec}`, namespace: "v" };
      });
      build.onLoad({ filter: /.*/, namespace: "v" }, (args) => {
        if (args.path === "__entry__") {
          return { contents: MOUNT.replace("__PREFERRED__", JSON.stringify(preferred)).replace("__PREFERRED_MAIN__", JSON.stringify(preferredMain)), loader: "js" };
        }
        if (args.path === "__providers__") {
          const contents = tooltipModule ? `import * as T from ${JSON.stringify(tooltipModule)};\nexport const TooltipProvider = T.TooltipProvider;` : "export const TooltipProvider = undefined;";
          return { contents, loader: "js" };
        }
        if (args.path === "shim:cn") return { contents: CN_SHIM, loader: "js" };
        if (args.path === "shim:empty") return { contents: "", loader: "js" };
        if (args.path.startsWith("shim:")) return { contents: SHIMS[args.path.slice(5)], loader: "js" };
        if (args.path.startsWith("missing:")) {
          return { contents: `module.exports = new Proxy({}, { get: (_, k) => k === "__esModule" ? false : () => null });`, loader: "js" };
        }
        if (/\.(png|jpe?g|gif|webp|svg|mp4|webm|woff2?)$/.test(args.path)) return { contents: `export default ""`, loader: "js" };
        const contents = graph.files.get(args.path) ?? "";
        const ext = args.path.split(".").pop()!;
        const loader = (["tsx", "ts", "jsx", "js", "css", "json"] as const).find((l) => l === ext) ?? "tsx";
        return { contents: loader === "css" || loader === "json" ? contents : assets.inCode(contents), loader };
      });
    },
  };

  let js = "";
  let css = "";
  try {
    const out = await esbuild.build({
      entryPoints: ["__entry__"],
      bundle: true,
      write: false,
      outdir: "out",
      format: "esm",
      platform: "browser",
      target: "es2022",
      jsx: "automatic",
      logLevel: "silent",
      minify: true,
      absWorkingDir: process.cwd(),
      define: { "process.env.NODE_ENV": '"production"' },
      plugins: [plugin, npmPlugin()],
    });
    for (const f of out.outputFiles) {
      if (f.path.endsWith(".css")) css += f.text;
      else js += f.text;
    }
  } catch (e) {
    const msg = (e as esbuild.BuildFailure).errors?.map((er) => er.text).join("; ") || (e as Error).message;
    return { ok: false, html: errorHtml(`Couldn't bundle this component: ${msg}`), error: msg };
  }

  const sources = [...graph.files].map(([p, content]) => ({ path: p, content }));
  const allCode = sources.map((f) => f.content).join("\n");
  const needsTwAnimate = /\banimate-(in|out)\b|\bfade-(in|out)-|\bzoom-(in|out)-|slide-in-from/.test(allCode) || graph.deps.has("tw-animate-css") || graph.deps.has("tailwindcss-animate");
  const tailwindCss = await compileTailwind(sources, [THEME_CSS, stylesToCss(c.styles), needsTwAnimate ? await twAnimateCss() : ""].join("\n"));
  const html = documentHtml({
    css: `${tailwindCss}\n${css}`,
    head: cssLinks.map((href) => `<link rel="stylesheet" href="${href}">`).join("\n"),
    body: "",
    script: js,
  });
  return { ok: true, html, error: missing.length ? `Unresolved imports: ${missing.join(", ")}` : undefined };
}

export async function buildPreview(c: Component, library: Library): Promise<PreviewResult> {
  const loaded = await loadSource(c, library);
  if (loaded.framework === "html") {
    const snippet = loaded.files.find((f) => f.content)?.content;
    if (snippet) return { ok: true, html: documentHtml({ body: snippet, css: await compileTailwind([{ path: "snippet.html", content: snippet }], THEME_CSS) }) };
  }
  if (loaded.framework && loaded.framework !== "react") {
    return { ok: false, html: errorHtml(`Live previews support React components; this one is ${loaded.framework}.`), error: "unsupported-framework" };
  }
  const result = await bundleReact(loaded, library);
  // A demo importing the library's own modules that can't be found (say, one written for another of its styles)
  // renders undefined components and crashes, so the component is tried on its own instead.
  const unresolved = result.error?.startsWith("Unresolved imports: ") ? result.error.slice(20).split(", ") : [];
  if (loaded.example && unresolved.some((spec) => /^(@|~)?[./]/.test(spec))) {
    const alone = await bundleReact({ ...loaded, example: null }, library);
    if (alone.ok && !alone.error) return alone;
  }
  return result;
}

const inflight = new Map<string, Promise<PreviewResult>>();
// A read-only snapshot can't store what it builds, so a preview missing from it is kept here instead.
const builtHere = new Map<string, PreviewResult>();

/** Whether a component has a preview stored for the current preview version. */
export function hasCurrentPreview(id: string): boolean {
  return !!getPreview(id)?.html?.includes(VERSION);
}

/** Cached preview document for a component, built on first request. */
export async function previewFor(c: Component, library: Library, opts: { rebuild?: boolean } = {}): Promise<PreviewResult> {
  if (!opts.rebuild) {
    const cached = getPreview(c.id);
    if (cached?.html?.includes(VERSION)) return { html: cached.html, ok: !cached.error || cached.error.startsWith("Unresolved"), error: cached.error ?? undefined };
    const kept = builtHere.get(c.id);
    if (kept) return kept;
  }
  let p = inflight.get(c.id);
  if (!p) {
    p = buildPreview(c, library)
      .catch((e: unknown): PreviewResult => ({ ok: false, html: errorHtml(`Preview failed: ${(e as Error).message}`), error: (e as Error).message }))
      .then((r) => {
        savePreview(c.id, r.html, r.ok ? (r.error ?? null) : (r.error ?? "failed"));
        if (READ_ONLY) builtHere.set(c.id, r);
        return r;
      })
      .finally(() => inflight.delete(c.id));
    inflight.set(c.id, p);
  }
  return p;
}
