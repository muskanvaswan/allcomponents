import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type CSSProperties, type ReactNode } from "react";
import { ChipRow } from "@/components/chip-row";
import { ComponentTile, TileGrid } from "@/components/component-tile";
import { LibraryFilter } from "@/components/library-filter";
import { LibraryMark } from "@/components/library-mark";
import { SidebarToggle } from "@/components/sidebar";
import { SubmitForm } from "@/components/submit-form";
import { GLASS, Toolbar } from "@/components/toolbar";
import { categoryCounts, listLibraries, READ_ONLY, totals } from "@/lib/db";
import { searchComponents } from "@/lib/search";
import { jsonLd, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { CATEGORIES, CATEGORY_BY_ID, GROUPS } from "@/lib/taxonomy";
import type { Library } from "@/lib/types";

const PAGE_SIZE = 48;
// Columns follow the width the grid has rather than the window's, so hiding the sidebar makes room for another one.
// Each step also sets --cols, which the loading ripple uses to find a tile's row and column.
const GRID_COLUMNS = "@xl:grid-cols-2 @xl:[--cols:2] @4xl:grid-cols-3 @4xl:[--cols:3] @6xl:grid-cols-4 @6xl:[--cols:4] @[100rem]:grid-cols-5 @[100rem]:[--cols:5]";
// The first two rows or so start loading from the server's HTML instead of waiting for the page to hydrate.
const EAGER_TILES = 8;
type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

function hrefWith(sp: Params, patch: Record<string, string | undefined>) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ q: one(sp.q), category: one(sp.category), library: one(sp.library), ...patch })) {
    if (v) next.set(k, v);
  }
  const s = next.toString();
  return s ? `/?${s}` : "/";
}

// The read-only site has no "Add a library"; the same link lists the libraries instead.
const LIBRARIES_LINK = READ_ONLY ? "Libraries" : "Add a library";

/** "EasyUI, Magic UI and Pin UI", or "12 libraries" once there are too many to name. */
const libraryNames = (names: string[]) => (names.length <= 4 ? new Intl.ListFormat("en").format(names) : `${names.length} libraries`);

/**
 * Search engines get one address per view: filters and page number in a fixed
 * order. Searches aren't indexed, since they're endless and repeat the categories.
 */
export async function generateMetadata({ searchParams }: PageProps<"/">): Promise<Metadata> {
  const sp = await searchParams;
  const q = one(sp.q);
  const ready = listLibraries().filter((l) => l.status === "ready");
  const picked = one(sp.library)?.split(",") ?? [];
  const chosen = ready.filter((l) => picked.includes(l.slug));
  const category = CATEGORY_BY_ID.get(one(sp.category) ?? "");
  const page = Math.max(1, Number(one(sp.page) ?? 1) || 1);
  const canonical = hrefWith({}, { category: category?.id, library: chosen.map((l) => l.slug).join(",") || undefined, page: page > 1 ? String(page) : undefined });
  // The layout's "%s · Components" title template only reaches pages below it, so the home page adds the name itself.
  if (q) return { title: { absolute: `Search for “${q}” · ${SITE_NAME}` }, robots: { index: false, follow: true }, alternates: { canonical } };
  if (!category && !chosen.length && page === 1) return { alternates: { canonical } };

  const from = libraryNames((chosen.length ? chosen : ready).map((l) => l.name));
  const count = category ? (categoryCounts({ library: chosen.map((l) => l.slug).join(",") || undefined }).get(category.id) ?? 0) : chosen.reduce((n, l) => n + l.componentCount, 0);
  const what = category ? category.label : `${from} components`;
  const title = `${category && chosen.length ? `${category.label} from ${from}` : what}${page > 1 ? ` (page ${page})` : ""}`;
  const description = `${count} ${category ? category.label.toLowerCase() : "components"} from ${from}, gathered by ${SITE_NAME}, a UI component aggregator, with live previews and links to the originals.`;
  return { title: { absolute: `${title} · ${SITE_NAME}` }, description, alternates: { canonical }, openGraph: { title, description, url: canonical } };
}

const navItem = (active: boolean) =>
  `flex items-baseline justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[14px] transition-colors ${active ? "bg-accent-soft" : "hover:bg-fill"}`;

export default function Home(props: PageProps<"/">) {
  // The toolbar and the sidebar's frame don't wait for the database, so they're up straight away.
  // The page fills the window beside the sidebar: its 15rem, plus its 1.25rem margin and a 1.5rem gap.
  return (
    <>
      <Suspense fallback={<SidebarFrame />}>
        <Sidebar searchParams={props.searchParams} />
      </Suspense>
      <div className="px-4 sm:px-6 lg:pl-[17.75rem] lg:sidebar-closed:pl-6">
        <Toolbar>
          {/* While the sidebar is hidden, its toggle waits here. */}
          <SidebarToggle controls="filters" className={`hidden rounded-full lg:sidebar-closed:flex ${GLASS}`} />
        </Toolbar>
        <Suspense fallback={<GridSkeleton />}>
          <Results searchParams={props.searchParams} />
        </Suspense>
      </div>
    </>
  );
}

type SearchParamsProp = Pick<PageProps<"/">, "searchParams">;

/** The filters in the URL, with `?library=easyui,magicui` narrowed to libraries that are ready. */
async function readFilters(searchParams: SearchParamsProp["searchParams"]) {
  const sp = await searchParams;
  await connection();
  const libraries = listLibraries();
  const ready = libraries.filter((l) => l.status === "ready");
  const picked = one(sp.library)?.split(",") ?? [];
  const chosen = ready.filter((l) => picked.includes(l.slug));
  const q = one(sp.q);
  const category = one(sp.category);
  const library = chosen.map((l) => l.slug).join(",") || undefined;
  return { sp, libraries, ready, chosen, q, category, library };
}

async function Sidebar({ searchParams }: SearchParamsProp) {
  const { sp, ready, chosen, category, library } = await readFilters(searchParams);
  if (!ready.length)
    return (
      <SidebarFrame>
        <Link href="/sources" className={navItem(false)}>
          {LIBRARIES_LINK}
        </Link>
      </SidebarFrame>
    );
  const counts = categoryCounts({ library });

  return (
    <SidebarFrame>
      <LibraryFilter
        libraries={ready.map((l) => ({ slug: l.slug, name: l.name, count: l.componentCount }))}
        selected={chosen.map((l) => l.slug)}
        base={hrefWith(sp, { library: undefined, page: undefined })}
      />
      <Link href="/sources" className="mt-2 mb-7 ml-2.5 inline-block text-[13px] font-medium text-muted hover:text-ink">
        {LIBRARIES_LINK}
      </Link>

      <nav aria-label="Categories" className="space-y-6">
        <Link href={hrefWith(sp, { category: undefined, page: undefined })} className={navItem(!category)}>
          All categories
        </Link>
        {GROUPS.map((group) => {
          const cats = CATEGORIES.filter((c) => c.group === group && counts.get(c.id));
          if (!cats.length) return null;
          return (
            <div key={group}>
              <h2 className="mb-2 px-2.5 text-[12px] font-semibold text-muted">{group}</h2>
              <ul className="space-y-px">
                {cats.map((c) => (
                  <li key={c.id}>
                    <Link href={hrefWith(sp, { category: c.id === category ? undefined : c.id, page: undefined })} className={navItem(c.id === category)}>
                      <span className="truncate">{c.label}</span>
                      <span className="text-[12px] text-muted tabular-nums">{counts.get(c.id)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </SidebarFrame>
  );
}

/**
 * A rounded pane of frosted glass floating at the window's left edge, as tall as the window
 * less its margin, like the sidebar in Apple's own apps. Its toggle sits at the
 * panel's top right; while the panel is hidden, the toolbar shows one instead.
 */
function SidebarFrame({ children }: { children?: ReactNode }) {
  return (
    <aside
      id="filters"
      aria-label="Filters"
      className="fixed top-5 bottom-5 left-5 z-40 hidden w-60 flex-col overflow-hidden rounded-[22px] bg-surface/55 shadow-card backdrop-blur-2xl backdrop-saturate-150 lg:flex lg:sidebar-closed:hidden"
    >
      {/* 2.75rem tall, like the toolbar's row, so the toggle lines up with the toolbar's controls. */}
      <div className="flex h-11 shrink-0 items-center justify-end px-2">
        <SidebarToggle controls="filters" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">{children}</div>
    </aside>
  );
}

async function Results({ searchParams }: SearchParamsProp) {
  const { sp, libraries, ready, chosen, q, category, library } = await readFilters(searchParams);
  const page = Math.max(1, Number(one(sp.page) ?? 1) || 1);
  const { components: totalComponents } = totals();
  if (!totalComponents) return <Welcome indexing={libraries.filter((l) => l.status === "pending" || l.status === "ingesting").map((l) => l.name)} />;

  const result = searchComponents({ query: q, category, library, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const counts = categoryCounts({ library });
  const activeCategory = category ? CATEGORY_BY_ID.get(category) : undefined;
  const heading = q ? (
    `“${q}”`
  ) : (
    activeCategory?.label ?? (
      <>
        {/* "All" in an italic serif. The serif runs small beside the wide sans, so it's set a little larger (with no
            extra line height), and it gets a hair of space after it, since its slant leans into the gap. */}
        <em className="pr-[0.04em] font-serif text-[1.12em] leading-none font-normal tracking-normal">All</em> Components
      </>
    )
  );
  const librariesInView = new Set(result.items.map((c) => c.librarySlug));
  const unfiltered = !q && !category && !chosen.length && page === 1;

  return (
    <main className="@container pt-20 pb-8 sm:pt-2">
      {unfiltered && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd({ "@type": "WebSite", name: SITE_NAME, url: SITE_URL, description: SITE_DESCRIPTION, inLanguage: "en" }) }}
        />
      )}
      {/* On phones the header section (heading, description and chip rows) gets a wide band of space, 80px, above
          and below it. From sm up it sits close under the toolbar, with the usual 40px before the grid on wide screens. */}
      {/* On phones the heading and its description sit 20px from the screen edge, a little in from the column. */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 max-sm:pl-1 lg:mb-10">
        <div className="min-w-0">
          <h1 className="font-display text-[30px] leading-tight font-light tracking-[-0.025em] sm:text-[38px]">{heading}</h1>
          {unfiltered ? (
            // The first thing a visitor reads under the heading says what the site is.
            <p className="mt-2 max-w-[68ch] text-[15px] text-muted">
              An aggregator of UI components: <span className="tabular-nums">{result.total}</span> components from {libraryNames(ready.map((l) => l.name))}, sorted by
              category, with live previews and links to the originals.
            </p>
          ) : (
            <p className="mt-2 text-[15px] text-muted">
              <span className="tabular-nums">{result.total}</span> {result.total === 1 ? "component" : "components"}
              {chosen.length ? ` from ${new Intl.ListFormat("en").format(chosen.map((l) => l.name))}` : ` from ${librariesInView.size} of ${ready.length} libraries`}
              {q && result.detectedCategories[0] && !category && <>, including everything filed under {CATEGORY_BY_ID.get(result.detectedCategories[0])?.label.toLowerCase()}</>}
            </p>
          )}
        </div>
      </div>

      <MobileLibraries sp={sp} ready={ready} chosen={chosen.map((l) => l.slug)} />
      <MobileCategories sp={sp} counts={counts} active={category} />

      {result.items.length ? (
        <TileGrid columns={GRID_COLUMNS}>
          {result.items.map((c, i) => (
            <ComponentTile key={c.id} c={c} showCategory={!category} index={i} eager={i < EAGER_TILES} />
          ))}
        </TileGrid>
      ) : (
        <div className="rounded-2xl bg-surface p-10 text-center shadow-card">
          <p className="font-display text-[22px] font-light tracking-[-0.02em]">Nothing matches that yet</p>
          <p className="mx-auto mt-2 max-w-[48ch] text-[15px] text-muted">
            {READ_ONLY ? "Try a broader word or clear a filter." : "Try a broader word, clear a filter, or add a library that has what you're looking for."}
          </p>
        </div>
      )}

      {(page > 1 || result.total > page * PAGE_SIZE) && (
        <nav className="mt-8 flex items-center justify-between text-[15px]" aria-label="Pages">
          {page > 1 ? (
            <Link className="rounded-full bg-fill px-4 py-1.5 font-medium hover:bg-fill-strong" href={hrefWith(sp, { page: page - 1 > 1 ? String(page - 1) : undefined })}>
              Previous page
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted tabular-nums">
            Page {page} of {Math.ceil(result.total / PAGE_SIZE)}
          </span>
          {result.total > page * PAGE_SIZE ? (
            <Link className="rounded-full bg-fill px-4 py-1.5 font-medium hover:bg-fill-strong" href={hrefWith(sp, { page: String(page + 1) })}>
              Next page
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}

/**
 * Without the sidebar (below lg), the libraries are a row of chips: each one toggles that library in or out of the
 * filter, like the sidebar's checkboxes. The row ends with the sidebar's libraries link.
 */
function MobileLibraries({ sp, ready, chosen }: { sp: Params; ready: Library[]; chosen: string[] }) {
  const toggled = (slug: string) => {
    const next = chosen.includes(slug) ? chosen.filter((s) => s !== slug) : [...chosen, slug];
    return next.join(",") || undefined;
  };
  return (
    <ChipRow className="-mx-4 mb-2 flex items-center gap-2 px-4 lg:hidden">
      {ready.map((l) => {
        const on = chosen.includes(l.slug);
        return (
          <Link
            key={l.slug}
            href={hrefWith(sp, { library: toggled(l.slug), page: undefined })}
            aria-pressed={on}
            // Its own 13px text and flex box, so the line box matches the category chips' (the page's 16px would add space above).
            className={`flex shrink-0 items-center rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${on ? "bg-accent text-on-accent" : "bg-chip hover:bg-chip-hover"}`}
          >
            <LibraryMark id={l.id} name={l.name} />
          </Link>
        );
      })}
      <Link href="/sources" className="shrink-0 px-2 py-1.5 text-[13px] font-medium text-muted hover:text-ink">
        {LIBRARIES_LINK}
      </Link>
    </ChipRow>
  );
}

function MobileCategories({ sp, counts, active }: { sp: Params; counts: Map<string, number>; active?: string }) {
  const cats = CATEGORIES.filter((c) => counts.get(c.id)).sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  return (
    <ChipRow className="-mx-4 mb-20 flex gap-2 px-4 sm:mb-16 lg:hidden">
      {cats.map((c) => (
        <Link
          key={c.id}
          href={hrefWith(sp, { category: c.id === active ? undefined : c.id, page: undefined })}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${c.id === active ? "bg-accent text-on-accent" : "bg-chip hover:bg-chip-hover"}`}
        >
          {c.label}
        </Link>
      ))}
    </ChipRow>
  );
}

function Welcome({ indexing }: { indexing: string[] }) {
  return (
    <main className="mx-auto max-w-3xl py-12 sm:py-20">
      <h1 className="font-display text-[40px] leading-[1.05] font-light tracking-[-0.03em] sm:text-[56px]">Every UI library&apos;s components, in one place.</h1>
      <p className="mt-6 max-w-[58ch] text-[19px] leading-relaxed text-muted">
        {SITE_NAME} is an aggregator of UI components. From a link to a component library, it pulls in the components, files each one under a category like buttons,
        carousels or backgrounds, and shows them side by side with live previews and a link back to the original.
      </p>
      {indexing.length > 0 && <p className="mt-6 rounded-xl bg-surface px-4 py-3 text-[15px] shadow-card">Indexing {indexing.join(", ")}. This page fills in when it finishes.</p>}
      {!READ_ONLY && (
        <div className="mt-10 rounded-2xl bg-surface p-6 shadow-card">
          <SubmitForm />
        </div>
      )}
    </main>
  );
}

function GridSkeleton() {
  return (
    <div className="@container pt-20 pb-8 sm:pt-2">
      <div className="mb-4 h-[90px] lg:mb-10" />
      <div className={`grid grid-cols-1 gap-5 [--cols:1] ${GRID_COLUMNS}`}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="relative aspect-[4/3.7] overflow-hidden rounded-2xl bg-surface/40" style={{ "--i": i } as CSSProperties}>
            <div className="tile-wave absolute inset-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
