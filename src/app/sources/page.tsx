import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { LibraryMark } from "@/components/library-mark";
import { SourceActions } from "@/components/source-actions";
import { SubmitForm } from "@/components/submit-form";
import { Toolbar } from "@/components/toolbar";
import { listLibraries, READ_ONLY } from "@/lib/db";
import { SITE_NAME } from "@/lib/site";
import type { Library } from "@/lib/types";

// The read-only site lists the libraries without the form and buttons for changing them.
const TITLE = READ_ONLY ? "Libraries" : "Add a library";

export const metadata: Metadata = {
  title: TITLE,
  description: `The UI component libraries ${SITE_NAME} aggregates, how many components each has, and how they were gathered.`,
  alternates: { canonical: "/sources" },
};

const FRAMEWORK_NAMES: Record<string, string> = { react: "React", vue: "Vue", svelte: "Svelte", astro: "Astro", html: "HTML" };

export default function SourcesPage() {
  return (
    <>
      <Toolbar className="px-4 sm:px-6" />
      <main className="mx-auto max-w-3xl px-4 pt-4 pb-10 sm:px-6 sm:pb-14">
        <nav className="mb-4 text-[14px] text-muted" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-ink">
            All Components
          </Link>
        </nav>
        <h1 className="font-display text-[34px] leading-tight font-bold tracking-[-0.025em] sm:text-[40px]">{TITLE}</h1>
        <p className="mt-4 max-w-[62ch] text-[17px] leading-relaxed text-muted">
          {SITE_NAME} aggregates components from these UI libraries. Libraries that publish a shadcn registry come in with their full source, so every component gets a
          live preview. For other sites, it reads the docs pages and links each component back to its original page.
        </p>
        <Suspense fallback={<div className="mt-8 h-40" />}>
          <Sources />
        </Suspense>
      </main>
    </>
  );
}

async function Sources() {
  await connection();
  const libraries = listLibraries();
  const busy = libraries.some((l) => l.status === "pending" || l.status === "ingesting");
  return (
    <>
      {!READ_ONLY && (
        <>
          <AutoRefresh active={busy} />
          <div className="mt-8 rounded-2xl bg-surface p-5 shadow-card sm:p-6">
            <SubmitForm existing={libraries.map((l) => l.url)} />
          </div>
        </>
      )}
      <h2 className={`${READ_ONLY ? "mt-10" : "mt-12"} mb-3 px-1 text-[13px] font-semibold text-muted`}>In the collection</h2>
      {libraries.length === 0 ? (
        <p className="text-[15px] text-muted">No libraries yet. Add one above and its components will show up in the collection.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-card">
          {libraries.map((l) => (
            <SourceRow key={l.id} library={l} />
          ))}
        </ul>
      )}
    </>
  );
}

function SourceRow({ library: l }: { library: Library }) {
  const busy = l.status === "pending" || l.status === "ingesting";
  return (
    <li className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {l.status === "ready" ? (
            <Link href={`/?library=${l.slug}`} className="font-semibold hover:opacity-70">
              <LibraryMark id={l.id} name={l.name} size="md" />
            </Link>
          ) : (
            <span className="font-semibold">
              <LibraryMark id={l.id} name={l.name} size="md" />
            </span>
          )}
          <a href={l.url} target="_blank" rel="noreferrer" className="truncate text-[13px] text-muted hover:text-ink hover:underline">
            {l.url.replace(/^https?:\/\//, "")}
          </a>
        </div>
        <p className="mt-1 text-[14px]">
          <StatusLine library={l} />
        </p>
        {l.warnings.map((w) => (
          <p key={w} className="mt-1 text-[13px] text-muted">
            {w}
          </p>
        ))}
      </div>
      {!READ_ONLY && <SourceActions slug={l.slug} busy={busy} />}
    </li>
  );
}

function StatusLine({ library: l }: { library: Library }) {
  switch (l.status) {
    case "ready":
      return (
        <span className="text-muted">
          {l.componentCount} components{l.frameworks.length ? ` in ${l.frameworks.map((f) => FRAMEWORK_NAMES[f] ?? f).join(", ")}` : ""},{" "}
          {l.strategy === "shadcn-registry" ? "from its registry" : l.strategy === "repo-scan" ? "from its GitHub repo" : "from its docs pages"}
        </span>
      );
    case "pending":
    case "ingesting":
      return (
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent motion-reduce:animate-none" aria-hidden="true" />
          {l.progress ?? "Waiting to start"}
        </span>
      );
    case "blocked":
      return <span className="text-danger">{l.error}</span>;
    case "error":
      return <span className="text-danger">Indexing failed: {l.error}</span>;
  }
}
