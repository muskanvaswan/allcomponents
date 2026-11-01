import "server-only";
import * as cheerio from "cheerio";
import { fetchText, mapLimit, robotsAllows } from "./fetch";
import { humanize } from "./shadcn";
import { normalizeUrl, slugify } from "./links";
import type { ComponentFile, ExtractResult, Progress, RawComponent } from "../types";

// Fallback for libraries without a machine-readable registry: walk the docs
// site (llms.txt, sitemap, and links under the submitted path) and treat each
// component page as a component, keeping its title, description, preview image
// and code samples.

const NOT_COMPONENT = /^(introduction|intro|installation|install|getting-started|get-started|quick-?start|changelog|releases?|theming|themes?|customi[sz]ation|dark-mode|cli|contributing|contribution|code-of-conduct|license|roadmap|figma|faq|about|pricing|blog|docs|components|overview|usage|setup|config|configuration|migration|upgrade|showcase|templates?|sponsors?|privacy|terms|login|signup|search|tags?|page|\d+)$/i;
const COMPONENTISH_PATH = /\/(components?|blocks?|ui|elements?|widgets?|sections?|primitives|effects|animations|backgrounds|text-animations)(\/|$)/i;

export type CrawlOptions = { maxPages?: number; progress: Progress };

function candidatePages(landingUrl: string, pages: { href: string; title?: string; description?: string }[]) {
  const landing = new URL(landingUrl);
  const prefix = landing.pathname.replace(/\/+$/, "");
  const urls = pages.filter(({ href }) => {
    const u = new URL(href);
    const p = u.pathname.replace(/\/+$/, "");
    if (p === prefix || !p) return false;
    const last = p.split("/").pop() ?? "";
    if (NOT_COMPONENT.test(last.replace(/\.(md|mdx|html)$/, ""))) return false;
    if (/\.(png|jpe?g|svg|gif|webp|ico|xml|txt|json|zip|pdf)$/i.test(p)) return false;
    if (/\/page\/\d+$/.test(p)) return false;
    return prefix && prefix !== "/" ? p.startsWith(prefix + "/") || COMPONENTISH_PATH.test(p) : COMPONENTISH_PATH.test(p);
  });
  // Category index pages (e.g. /components/backgrounds) are parents of other candidates; skip them.
  const paths = urls.map((u) => new URL(u.href).pathname.replace(/\/+$/, ""));
  return urls.filter((_, i) => paths.filter((p) => p.startsWith(paths[i] + "/")).length < 2);
}

type Extracted = Omit<RawComponent, "slug"> & { slug?: string };

const CODE_LANGS = new Set(["tsx", "jsx", "ts", "js", "typescript", "javascript", "vue", "svelte", "html", "astro", "css"]);

function pickCode(blocks: { lang: string; code: string }[]): { source?: { lang: string; code: string }; usage?: { lang: string; code: string }; install?: string } {
  const install = blocks.map((b) => b.code.trim()).find((c) => /^(npx|pnpm dlx|bunx|npm (i|install)|pnpm add|yarn add|bun add)\b/m.test(c) && c.length < 400);
  const code = blocks.filter((b) => (CODE_LANGS.has(b.lang) || !b.lang) && !/^(npx|pnpm|npm|yarn|bun)\b/.test(b.code.trim()) && b.code.length > 40);
  const looksLikeComponent = (c: string) => /export (default|function|const)|<template>|<script|defineComponent|className=|class="/.test(c);
  const candidates = code.filter((b) => looksLikeComponent(b.code)).sort((a, b) => b.code.length - a.code.length);
  const source = candidates[0];
  const usage = candidates.find((b) => b !== source && b.code.length < (source?.code.length ?? Infinity) * 0.8);
  return { source, usage, install };
}

function extFor(lang: string, code: string): string {
  if (lang === "vue" || /<template>/.test(code)) return "vue";
  if (lang === "svelte") return "svelte";
  if (lang === "html" || (/class="/.test(code) && !/className=/.test(code) && !/import /.test(code))) return "html";
  if (lang === "ts" || lang === "typescript") return /<\w/.test(code) ? "tsx" : "ts";
  if (lang === "js" || lang === "javascript") return /<\w/.test(code) ? "jsx" : "js";
  return lang && CODE_LANGS.has(lang) ? lang : "tsx";
}

function frameworkFor(ext: string): string {
  if (ext === "vue" || ext === "svelte" || ext === "astro" || ext === "html") return ext;
  return "react";
}

function depsFrom(install?: string): string[] {
  if (!install) return [];
  const m = install.match(/(?:npm (?:i|install)|pnpm add|yarn add|bun add)\s+([^\n&|;]+)/);
  if (!m) return [];
  return m[1].split(/\s+/).filter((d) => d && !d.startsWith("-"));
}

function fromHtml(html: string, url: string): Extracted | null {
  const $ = cheerio.load(html);
  const meta = (sel: string) => $(sel).attr("content")?.trim() || undefined;
  const ogTitle = meta('meta[property="og:title"]');
  const h1 = $("main h1, article h1, h1").first().text().trim() || undefined;
  const titleTag = $("title").first().text().split(/\s[|–—·-]\s/)[0].trim() || undefined;
  const title = h1 ?? ogTitle?.split(/\s[|–—·-]\s/)[0] ?? titleTag;
  if (!title) return null;
  let description = meta('meta[name="description"]') ?? meta('meta[property="og:description"]');
  if (!description) {
    const p = $("main p, article p, p").filter((_, el) => $(el).text().trim().length > 30).first().text().trim();
    description = p || undefined;
  }
  const blocks: { lang: string; code: string }[] = [];
  $("pre").each((_, el) => {
    const codeEl = $(el).find("code").first();
    const cls = `${codeEl.attr("class") ?? ""} ${$(el).attr("class") ?? ""}`;
    const lang = (cls.match(/language-([\w-]+)/)?.[1] ?? $(el).attr("data-language") ?? codeEl.attr("data-language") ?? "").toLowerCase();
    const code = (codeEl.length ? codeEl : $(el)).text();
    if (code.trim()) blocks.push({ lang, code });
  });
  const crumbs = $('nav[aria-label*="readcrumb"] a, [class*="breadcrumb"] a').map((_, el) => $(el).text().trim()).get();
  return finish({ title, description, blocks, url, previewImage: meta('meta[property="og:image"]') ?? meta('meta[name="twitter:image"]'), hints: crumbs });
}

function fromMarkdown(md: string, url: string): Extracted | null {
  const front = md.match(/^---\n([\s\S]*?)\n---/);
  const fm = (key: string) => front?.[1].match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, "m"))?.[1];
  const title = fm("title") ?? md.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (!title) return null;
  const body = front ? md.slice(front[0].length) : md;
  const description = fm("description") ?? body.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !/^[#<`!|[-]/.test(p) && p.length > 30);
  const blocks = [...md.matchAll(/```([\w-]*)[^\n]*\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1].toLowerCase(), code: m[2] }));
  return finish({ title, description, blocks, url, hints: [fm("category") ?? ""].filter(Boolean) });
}

function finish(p: { title: string; description?: string; blocks: { lang: string; code: string }[]; url: string; previewImage?: string; hints?: string[] }): Extracted {
  const { source, usage, install } = pickCode(p.blocks);
  const segments = new URL(p.url).pathname.split("/").filter(Boolean).slice(0, -1);
  const files: ComponentFile[] = [];
  let framework: string | undefined;
  const slug = slugify(new URL(p.url).pathname.split("/").filter(Boolean).pop()?.replace(/\.(md|mdx|html)$/, "") ?? p.title);
  if (source) {
    const ext = extFor(source.lang, source.code);
    framework = frameworkFor(ext);
    files.push({ path: `${slug}.${ext}`, content: source.code });
  }
  return {
    name: humanize(p.title),
    description: p.description?.slice(0, 400),
    hints: [...segments, ...(p.hints ?? [])],
    framework,
    dependencies: depsFrom(install),
    installCommand: install?.split("\n")[0],
    docsUrl: p.url,
    previewImage: p.previewImage,
    files,
    example: usage ? { files: [{ path: `${slug}-usage.${extFor(usage.lang, usage.code)}`, content: usage.code }] } : undefined,
  };
}

export async function crawlDocs(
  landingUrl: string,
  pages: { href: string; title?: string; description?: string }[],
  opts: CrawlOptions,
): Promise<ExtractResult> {
  const warnings: string[] = [];
  const maxPages = opts.maxPages ?? 300;
  let candidates = candidatePages(landingUrl, pages);
  if (candidates.length > maxPages) {
    warnings.push(`Found ${candidates.length} pages; indexed the first ${maxPages}.`);
    candidates = candidates.slice(0, maxPages);
  }
  if (!candidates.length) {
    return { strategy: "docs-crawl", components: [], warnings: ["No component pages found under this URL. Try submitting the page that lists the components."] };
  }
  opts.progress(`Crawling ${candidates.length} component pages`);

  let done = 0;
  let disallowed = 0;
  const results = await mapLimit(candidates, 4, async (page) => {
    try {
      if (!(await robotsAllows(page.href))) {
        disallowed++;
        return null;
      }
      const res = await fetchText(page.href, { timeoutMs: 20_000 });
      if (!res.ok) return null;
      const isMarkdown = /\.mdx?$/.test(new URL(page.href).pathname) || /markdown|text\/plain/.test(res.contentType);
      const extracted = isMarkdown ? fromMarkdown(res.text, page.href) : fromHtml(res.text, page.href);
      if (extracted && page.description && !extracted.description) extracted.description = page.description;
      return extracted;
    } catch {
      return null;
    } finally {
      if (++done % 20 === 0) opts.progress(`Crawled ${done}/${candidates.length} pages`);
    }
  });
  if (disallowed) warnings.push(`Skipped ${disallowed} pages disallowed by robots.txt.`);

  const seen = new Set<string>();
  const components: RawComponent[] = [];
  for (const r of results) {
    if (!r) continue;
    const slug = r.slug ?? slugify(r.name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    components.push({ ...r, slug, docsUrl: r.docsUrl && normalizeUrl(r.docsUrl) });
  }
  return { strategy: "docs-crawl", components, warnings };
}
