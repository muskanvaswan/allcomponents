import "server-only";
import * as cheerio from "cheerio";
import { fetchText } from "./fetch";
import type { RepoRef } from "../types";

export function slugify(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function sameSite(a: string, b: string): boolean {
  const host = (u: string) => new URL(u).hostname.replace(/^www\./, "");
  try {
    return host(a) === host(b);
  } catch {
    return false;
  }
}

export function normalizeUrl(u: string): string {
  const url = new URL(u);
  url.hash = "";
  url.search = "";
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

/** Links found on a page, resolved and de-duplicated. */
export function pageLinks(html: string, baseUrl: string): { href: string; text: string }[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const out: { href: string; text: string }[] = [];
  $("a[href]").each((_, el) => {
    const raw = $(el).attr("href");
    if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("javascript:")) return;
    try {
      const href = normalizeUrl(new URL(raw, baseUrl).toString());
      if (seen.has(href)) return;
      seen.add(href);
      out.push({ href, text: $(el).text().trim().replace(/\s+/g, " ") });
    } catch {}
  });
  return out;
}

/** `- [Title](url): description` lines from an llms.txt file. */
export function parseLlmsTxt(text: string, baseUrl: string): { href: string; title: string; description?: string }[] {
  const out: { href: string; title: string; description?: string }[] = [];
  for (const m of text.matchAll(/^\s*[-*]\s*\[([^\]]+)\]\(([^)\s]+)\)(?:\s*:\s*(.+))?$/gm)) {
    try {
      out.push({ title: m[1].trim(), href: normalizeUrl(new URL(m[2], baseUrl).toString()), description: m[3]?.trim() });
    } catch {}
  }
  return out;
}

export async function sitemapUrls(origin: string, limit = 5000): Promise<string[]> {
  const urls: string[] = [];
  const queue = [`${origin}/sitemap.xml`];
  const seen = new Set<string>();
  while (queue.length && urls.length < limit && seen.size < 20) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    try {
      const res = await fetchText(next, { accept: "application/xml,text/xml", timeoutMs: 15_000, retries: 0 });
      if (!res.ok || !res.text.includes("<loc>")) continue;
      const locs = [...res.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
      if (/<sitemapindex/i.test(res.text)) queue.push(...locs);
      else urls.push(...locs);
    } catch {}
  }
  return urls.slice(0, limit);
}

/** The GitHub repo a docs site links to most, which is usually its own source. */
export function githubRepoFromHtml(html: string): RepoRef | null {
  const counts = new Map<string, number>();
  for (const m of html.matchAll(/https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g)) {
    const [owner, repo] = [m[1], m[2].replace(/\.git$/, "")];
    if (["sponsors", "orgs", "features", "topics", "settings", "login", "about"].includes(owner.toLowerCase())) continue;
    const key = `${owner}/${repo}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best) return null;
  const [owner, repo] = best[0].split("/");
  return { owner, repo, branch: "HEAD" };
}

export function parseGithubUrl(url: string): (RepoRef & { path: string }) | null {
  const m = url.match(/^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/#?]+)(?:\/(?:tree|blob)\/([^/]+)(?:\/(.*))?)?/);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, ""), branch: m[3] ?? "HEAD", path: (m[4] ?? "").replace(/\/$/, "") };
}

export const rawGithubUrl = (repo: RepoRef, filePath: string) =>
  `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${repo.branch}/${filePath.replace(/^\.?\//, "")}`;

/**
 * Every page URL we can learn about on a docs site (landing page links, llms.txt,
 * sitemap), so registry items can link back to their original docs page.
 */
export async function collectSitePages(landingUrl: string, landingHtml: string | null): Promise<{ href: string; title?: string; description?: string }[]> {
  const origin = new URL(landingUrl).origin;
  const pages = new Map<string, { href: string; title?: string; description?: string }>();
  const add = (p: { href: string; title?: string; description?: string }) => {
    if (!sameSite(p.href, landingUrl)) return;
    const prev = pages.get(p.href);
    pages.set(p.href, { ...prev, ...p, title: p.title ?? prev?.title, description: p.description ?? prev?.description });
  };
  if (landingHtml) for (const l of pageLinks(landingHtml, landingUrl)) add({ href: l.href, title: l.text || undefined });
  try {
    const llms = await fetchText(`${origin}/llms.txt`, { accept: "text/plain", timeoutMs: 15_000, retries: 0 });
    if (llms.ok && !/^\s*</.test(llms.text)) for (const l of parseLlmsTxt(llms.text, origin)) add(l);
  } catch {}
  for (const href of await sitemapUrls(origin)) {
    try {
      add({ href: normalizeUrl(href) });
    } catch {}
  }
  return [...pages.values()];
}

/** Maps a component slug to the docs page most likely to be its own. */
export function docsPageIndex(pages: { href: string }[], landingUrl: string): Map<string, string> {
  const landingPath = new URL(landingUrl).pathname.replace(/\/+$/, "");
  const index = new Map<string, string>();
  const score = (href: string) => {
    const p = new URL(href).pathname;
    let s = 0;
    if (landingPath && p.startsWith(landingPath + "/")) s += 4;
    if (/\/(components?|ui|blocks?|docs)\//.test(p)) s += 2;
    if (/\.md$/.test(p)) s -= 1;
    return s - p.length / 1000;
  };
  for (const { href } of pages) {
    const last = new URL(href).pathname.split("/").filter(Boolean).pop();
    if (!last) continue;
    const key = slugify(last.replace(/\.(md|mdx|html)$/, ""));
    const prev = index.get(key);
    if (!prev || score(href) > score(prev)) index.set(key, href);
  }
  return index;
}
