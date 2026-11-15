import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { CategoryPicker } from "@/components/category-picker";
import { CodeTabs, type CodeFile } from "@/components/code-tabs";
import { ComponentTile, TileGrid } from "@/components/component-tile";
import { CopyButton } from "@/components/copy-button";
import { LibraryMark } from "@/components/library-mark";
import { PreviewPanel } from "@/components/preview-panel";
import { Toolbar } from "@/components/toolbar";
import { PAGE_SIZE } from "@/components/browse";
import { getComponent, getLibrary, READ_ONLY } from "@/lib/db";
import { highlight } from "@/lib/highlight";
import { registryName } from "@/lib/registry";
import { alternativesFor, searchComponents } from "@/lib/search";
import { jsonLd, SITE_NAME, SITE_URL } from "@/lib/site";
import { loadSource } from "@/lib/source";
import { CATEGORIES, CATEGORY_BY_ID } from "@/lib/taxonomy";

/** Cuts text to fit a search result's description, at a word boundary. */
function clip(text: string, max = 158) {
  if (text.length <= max) return text;
  const cut = text.lastIndexOf(" ", max - 1);
  return `${text.slice(0, cut > 0 ? cut : max - 1)}…`;
}

// The read-only site's data only changes with a deploy, so a component page is rendered once per deploy and then
// served from the CDN. The build prerenders the ones the home page links to; every other one renders on its first
// visit, is upgraded to a static page in the background, and is served from the cache after that. (Prerendering
// all of them made the build about 9 minutes long and half a gigabyte, since each page carries its highlighted
// source.) Working locally, the database is live, so the page reads it on each request instead.
export function generateStaticParams() {
  return searchComponents({ limit: PAGE_SIZE }).items.map((c) => ({ id: c.id.split("/") }));
}

export async function generateMetadata({ params }: PageProps<"/c/[...id]">): Promise<Metadata> {
  const { id } = await params;
  const c = getComponent(id.map(decodeURIComponent).join("/"));
  if (!c) return { title: "Component not found", robots: { index: false } };
  const category = CATEGORY_BY_ID.get(c.category)?.label ?? "components";
  const title = `${c.name} from ${c.libraryName}`;
  const description = clip(
    c.description
      ? `${c.description.replace(/([^.!?])$/, "$1.")} A ${c.libraryName} component with a live preview, install command and source.`
      : `${c.name}, from ${c.libraryName}'s ${category.toLowerCase()}, with a live preview, install command and source, and the same kind of component from other libraries.`,
  );
  const url = `/c/${c.id}`;
  return { title, description, alternates: { canonical: url }, openGraph: { type: "article", title, description, url } };
}

export default function ComponentPage(props: PageProps<"/c/[...id]">) {
  return (
    <>
      <Toolbar className="px-4 sm:px-6" />
      <Suspense fallback={<div className="mx-auto h-[70vh] max-w-6xl px-4 pt-4 pb-8 sm:px-6" />}>
        <ComponentDetail params={props.params} />
      </Suspense>
    </>
  );
}

/** The component with its source, highlighted code and alternatives, or null when there's no such component. */
async function componentView(id: string) {
  const stored = getComponent(id);
  const library = stored && getLibrary(stored.libraryId);
  if (!stored || !library) return null;
  const c = await loadSource(stored, library);
  const codeFiles: CodeFile[] = await Promise.all(
    [
      ...c.files.filter((f) => f.content && f.type !== "registry:lib"),
      ...(c.example?.files ?? []).filter((f) => f.content).map((f) => ({ ...f, label: `Usage: ${f.path.split("/").pop()}` })),
    ].map(async (f) => ({ path: f.path, raw: f.content!, html: await highlight(f.content!, f.path), label: "label" in f ? (f.label as string) : undefined })),
  );
  return { c, library, codeFiles, alternatives: alternativesFor(c, 8) };
}

/** The same, cached for the life of a deploy, so the build can prerender it (highlighting is async work). */
async function cachedComponentView(id: string) {
  "use cache";
  cacheLife("max");
  return componentView(id);
}

/** The address this request came in on, so a local install command points at the local server. */
async function requestOrigin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

async function ComponentDetail({ params }: Pick<PageProps<"/c/[...id]">, "params">) {
  const { id } = await params;
  if (!READ_ONLY) await connection();
  const key = id.map(decodeURIComponent).join("/");
  const view = READ_ONLY ? await cachedComponentView(key) : await componentView(key);
  if (!view) notFound();
  const { c, library, codeFiles, alternatives } = view;

  const category = CATEGORY_BY_ID.get(c.category);
  // The read-only site names its own address rather than reading the request's, which would make the page dynamic.
  const origin = READ_ONLY ? SITE_URL : await requestOrigin();
  const ourInstall = c.files.some((f) => f.content) ? `npx shadcn@latest add ${origin}/r/${registryName(c)}.json` : null;

  const url = `${SITE_URL}/c/${c.id}`;
  const structured = jsonLd({
    "@graph": [
      {
        "@type": "SoftwareSourceCode",
        name: c.name,
        description: c.description ?? undefined,
        url,
        codeRepository: c.sourceUrl ?? undefined,
        keywords: [category?.label, c.framework === "react" ? "React" : c.framework, c.styling === "tailwind" ? "Tailwind CSS" : c.styling].filter(Boolean).join(", "),
        author: { "@type": "Organization", name: c.libraryName, url: library.homepage ?? library.url },
        isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "All Components", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: category?.label, item: `${SITE_URL}/browse?category=${c.category}` },
          { "@type": "ListItem", position: 3, name: c.name, item: url },
        ],
      },
    ],
  });

  return (
    <main className="mx-auto max-w-6xl px-4 pt-4 pb-8 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structured }} />
      <nav className="mb-4 text-[14px] text-muted" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-ink">
          All Components
        </Link>
        <span className="mx-2" aria-hidden="true">/</span>
        <Link href={`/browse?category=${c.category}`} className="hover:text-ink">
          {category?.label}
        </Link>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div className="min-w-0 max-w-[70ch]">
          <h1 className="font-display text-[34px] leading-tight font-light tracking-[-0.025em] sm:text-[44px]">{c.name}</h1>
          {c.description && <p className="mt-3 text-[15px] leading-relaxed text-muted">{c.description}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
            <Link href={`/browse?library=${c.librarySlug}`} className="rounded-full bg-fill px-3 py-1 font-medium transition-colors hover:bg-fill-strong">
              <LibraryMark id={c.libraryId} name={c.libraryName} size="md" />
            </Link>
            {c.framework && <span className="rounded-full bg-fill px-3 py-1 text-muted">{c.framework === "react" ? "React" : c.framework}</span>}
            {c.styling && <span className="rounded-full bg-fill px-3 py-1 text-muted">{c.styling === "tailwind" ? "Tailwind CSS" : c.styling}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {c.docsUrl && (
            <a href={c.docsUrl} target="_blank" rel="noreferrer" className="rounded-full bg-accent px-5 py-2.5 text-[15px] font-medium text-on-accent transition-colors hover:bg-accent-hover">
              View original on {c.libraryName}
            </a>
          )}
          {c.sourceUrl && (
            <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="rounded-full bg-fill px-5 py-2.5 text-[15px] font-medium transition-colors hover:bg-fill-strong">
              Source on GitHub
            </a>
          )}
        </div>
      </div>

      <section className="mt-7" aria-label="Preview">
        <PreviewPanel id={c.id} title={c.name} fallbackImage={c.previewImage} original={c.docsUrl ? { url: c.docsUrl, library: c.libraryName } : null} />
      </section>

      <section className="mt-10 grid gap-8 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0 space-y-8">
          {(c.installCommand || ourInstall) && (
            <div>
              <h2 className="mb-4 font-display text-[20px] font-light tracking-[-0.02em]">Install</h2>
              <div className="space-y-2">
                {c.installCommand && <Command label={`From ${c.libraryName}`} command={c.installCommand} />}
                {ourInstall && <Command label="From this collection" command={ourInstall} />}
              </div>
            </div>
          )}
          {codeFiles.length > 0 && (
            <div>
              <h2 className="mb-4 font-display text-[20px] font-light tracking-[-0.02em]">Code</h2>
              <CodeTabs files={codeFiles} />
            </div>
          )}
        </div>
        <aside className="space-y-6 text-[14px]">
          {c.dependencies.length > 0 && (
            <div>
              <h2 className="mb-3 font-semibold">Dependencies</h2>
              <ul className="flex flex-wrap gap-1.5">
                {c.dependencies.map((d) => (
                  <li key={d} className="rounded-md bg-fill px-2 py-0.5 font-mono text-[12.5px]">
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {c.variants.length > 1 && (
            <div>
              <h2 className="mb-3 font-semibold">Variants in the source library</h2>
              <p className="text-muted">{c.variants.join(", ")}</p>
            </div>
          )}
          {!READ_ONLY && <CategoryPicker id={c.id} current={c.category} options={CATEGORIES.map(({ id, label, group }) => ({ id, label, group }))} />}
        </aside>
      </section>

      {alternatives.length > 0 && (
        <section className="mt-14">
          <h2 className="font-display text-[24px] font-light tracking-[-0.022em]">Other {category?.label.toLowerCase()}</h2>
          <p className="mt-2 mb-7 text-[15px] text-muted">The same kind of component from the other libraries in the collection.</p>
          <TileGrid columns="sm:grid-cols-2 sm:[--cols:2] lg:grid-cols-4 lg:[--cols:4]">
            {alternatives.map((a, i) => (
              <ComponentTile key={a.id} c={a} showCategory={false} index={i} />
            ))}
          </TileGrid>
        </section>
      )}
    </main>
  );
}

function Command({ label, command }: { label: string; command: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-2.5 shadow-card">
      <span className="w-40 shrink-0 text-[13px] text-muted">{label}</span>
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-[13px] whitespace-nowrap">{command}</code>
      <CopyButton text={command} />
    </div>
  );
}
