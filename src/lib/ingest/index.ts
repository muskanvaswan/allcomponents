import "server-only";
import { createLibrary, getLibrary, replaceComponents, updateLibrary, type ComponentInput } from "../db";
import { classify } from "../taxonomy";
import { crawlDocs } from "./docs";
import { BlockedError, fetchText } from "./fetch";
import { collectSitePages, docsPageIndex, normalizeUrl, parseGithubUrl, slugify } from "./links";
import { scanRepo } from "./repo";
import { discoverRegistry, extractRegistry, humanize } from "./shadcn";
import type { ExtractResult, Library, RawComponent } from "../types";

const ANIMATION_DEPS = /^(framer-motion|motion|gsap|@gsap\/|react-spring|@react-spring\/|animejs|lottie|@lottiefiles\/|three|@react-three\/|ogl|postprocessing|motion-v|@vueuse\/motion|@formkit\/auto-animate|canvas-confetti|matter-js|cobe|@paper-design\/shaders)/;
const ANIMATION_CODE = /@keyframes|\banimate-[a-z]|<motion\.|motion\.\w+|useSpring|useAnimate|useAnimation|requestAnimationFrame|gsap\.|useFrame\(/;
const ANIMATION_WORDS = /animat|motion|morph|particle|shimmer|marquee|typing|typewriter|scroll|parallax|reveal|ripple|meteor|sparkle|glow|beam|orbit|spring|wave|aurora|shader|confetti|ticker|flip|rotat|blur fade|fade|bounce|pulse|transition/i;

function isAnimated(c: RawComponent): boolean {
  if (c.dependencies?.some((d) => ANIMATION_DEPS.test(d))) return true;
  if (c.files?.some((f) => f.content && ANIMATION_CODE.test(f.content))) return true;
  if (c.styles?.css && Object.keys(c.styles.css).some((k) => k.startsWith("@keyframes"))) return true;
  return ANIMATION_WORDS.test(`${c.name} ${c.description ?? ""}`);
}

function stylingOf(c: RawComponent, strategy: ExtractResult["strategy"]): string | null {
  const code = c.files?.map((f) => f.content ?? "").join("\n") ?? "";
  if (c.dependencies?.some((d) => /^(styled-components|@emotion\/)/.test(d))) return "css-in-js";
  if (/class(Name)?=["'{`][^"'`]*\b(flex|grid|p[xy]?-\d|m[xy]?-\d|text-(xs|sm|lg|xl)|bg-|rounded|gap-)/.test(code) || /\bcn\(/.test(code)) return "tailwind";
  if (c.files?.some((f) => f.path.endsWith(".css")) || /import .+\.css['"]/.test(code)) return "css";
  if (strategy === "shadcn-registry") return "tailwind";
  return null;
}

/** Initial name and slug for a submitted URL, before ingestion learns the real name. */
function guessIdentity(url: string): { name: string; slug: string } {
  const gh = parseGithubUrl(url);
  if (gh) return { name: humanize(gh.repo), slug: slugify(gh.repo) };
  const host = new URL(url).hostname.replace(/^www\./, "");
  const label = host.split(".").slice(0, -1).join("-") || host;
  return { name: prettyName(label), slug: slugify(label) };
}

function prettyName(label: string): string {
  const m = label.match(/^(.+?)-?ui$/i);
  return m ? `${humanize(m[1])} UI` : humanize(label);
}

const metaContent = (html: string, attr: string, value: string) =>
  html.match(new RegExp(`<meta[^>]+${attr}=["']${value}["'][^>]+content=["']([^"']+)`, "i"))?.[1] ??
  html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${value}["']`, "i"))?.[1];

/** The site's own name: og:site_name, else a short <title> on its home page. */
async function siteNameFor(url: string, landingHtml: string): Promise<string | undefined> {
  const own = metaContent(landingHtml, "property", "og:site_name") ?? metaContent(landingHtml, "name", "application-name");
  if (own) return own.trim();
  const origin = new URL(url).origin;
  if (normalizeUrl(origin) === normalizeUrl(url)) return undefined;
  try {
    const home = await fetchText(origin, { timeoutMs: 10_000, retries: 0 });
    const name = metaContent(home.text, "property", "og:site_name") ?? home.text.match(/<title[^>]*>([^<|–—·]{2,24})<\/title>/i)?.[1];
    return name?.trim();
  } catch {
    return undefined;
  }
}

export function normalizeSubmittedUrl(input: string): string {
  const trimmed = input.trim();
  const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http(s) URLs are supported");
  return normalizeUrl(url.toString());
}

export function submitLibrary(input: string): Library {
  const url = normalizeSubmittedUrl(input);
  return createLibrary({ url, ...guessIdentity(url) });
}

const running = new Set<number>();

export function isIngesting(id: number) {
  return running.has(id);
}

/** Discovers, extracts and categorises a library's components, then swaps them into the collection. */
export async function ingestLibrary(libraryId: number): Promise<void> {
  if (running.has(libraryId)) return;
  const library = getLibrary(libraryId);
  if (!library) return;
  running.add(libraryId);
  const progress = (message: string) => updateLibrary(libraryId, { progress: message });
  updateLibrary(libraryId, { status: "ingesting", progress: "Fetching the page", error: null });

  try {
    const github = parseGithubUrl(library.url);
    const isGithub = Boolean(github);
    let landingHtml: string | null = null;
    let siteName: string | undefined;
    let siteDescription: string | undefined;
    if (!isGithub && !library.url.endsWith(".json")) {
      const res = await fetchText(library.url);
      if (!res.ok) throw new Error(`The page returned HTTP ${res.status}`);
      landingHtml = res.text;
      siteName = await siteNameFor(library.url, landingHtml);
      siteDescription = metaContent(landingHtml, "name", "description");
    }

    progress("Looking for a component registry");
    const registry = await discoverRegistry(library.url, landingHtml);

    progress("Mapping documentation pages");
    const pages = isGithub ? [] : await collectSitePages(library.url, landingHtml);

    let result: ExtractResult;
    if (registry) {
      progress(`Reading registry ${registry.indexUrl}`);
      result = await extractRegistry(registry, { landingHtml, docsIndex: docsPageIndex(pages, library.url), progress });
    } else if (github) {
      result = await scanRepo(github, { progress });
    } else {
      result = await crawlDocs(library.url, pages, { progress });
    }
    if (!result.components.length) throw new Error(result.warnings[0] ?? "No components found at this URL.");

    progress(`Categorising ${result.components.length} components`);
    const records: ComponentInput[] = result.components.map((c) => {
      const cls = classify({ name: c.name, description: c.description, hints: c.hints, tags: c.tags, kind: c.kind });
      return {
        id: `${library.slug}/${c.slug}`,
        slug: c.slug,
        name: c.name,
        description: c.description ?? null,
        category: cls.category,
        categories: cls.categories,
        tags: cls.tags,
        confidence: cls.confidence,
        framework: c.framework ?? null,
        styling: stylingOf(c, result.strategy),
        animated: isAnimated(c),
        dependencies: c.dependencies ?? [],
        registryDependencies: c.registryDependencies ?? [],
        installCommand: c.installCommand ?? null,
        docsUrl: c.docsUrl ?? null,
        sourceUrl: c.sourceUrl ?? null,
        previewImage: c.previewImage ?? null,
        itemUrl: c.itemUrl ?? null,
        files: c.files ?? [],
        example: c.example ?? null,
        styles: c.styles ?? null,
        variants: c.variants ?? [],
        kind: c.kind ?? null,
      };
    });
    replaceComponents(library, records);

    const frameworks = [...new Set(records.map((r) => r.framework).filter((f): f is string => Boolean(f)))];
    updateLibrary(libraryId, {
      name: siteName || (result.name ? prettyName(result.name) : library.name),
      description: result.description ?? siteDescription ?? null,
      homepage: result.homepage && !parseGithubUrl(result.homepage) ? result.homepage : new URL(library.url).origin,
      strategy: result.strategy,
      repo: result.repo ?? null,
      status: "ready",
      progress: null,
      error: null,
      warnings: result.warnings,
      componentCount: records.length,
      frameworks,
      ingestedAt: new Date().toISOString(),
    });
  } catch (e) {
    const blocked = e instanceof BlockedError;
    updateLibrary(libraryId, {
      status: blocked ? "blocked" : "error",
      progress: null,
      error: blocked
        ? `${(e as Error).message} Submit the library's GitHub repo or its registry.json URL instead.`
        : e instanceof Error
          ? e.message
          : String(e),
    });
  } finally {
    running.delete(libraryId);
  }
}
