"use client";

import { useRouter } from "next/navigation";
import { startTransition, useOptimistic, useSyncExternalStore, type ReactNode } from "react";
import { startNavigation } from "@/lib/navigation";
import { SOURCES_KEY } from "@/lib/sidebar";

type Library = { slug: string; name: string; count: number };

// Whether the list is collapsed lives on <html data-sources="collapsed">, set before paint by SIDEBAR_SCRIPT.
// The list and the arrow switch through the `sources-collapsed:` variant, so they're right before this code runs.
const listeners = new Set<() => void>();
const readOpen = () => document.documentElement.dataset.sources !== "collapsed";

function setOpen(open: boolean) {
  try {
    localStorage.setItem(SOURCES_KEY, open ? "open" : "collapsed");
  } catch {}
  if (open) delete document.documentElement.dataset.sources;
  else document.documentElement.dataset.sources = "collapsed";
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * Narrows the grid to any mix of libraries; nothing ticked means all of them.
 * A tick shows straight away while the page loads. The heading collapses the
 * list (and `footer`, the link under it); while collapsed it says how many are ticked.
 */
export function LibraryFilter({ libraries, selected, base, footer }: { libraries: Library[]; selected: string[]; base: string; footer?: ReactNode }) {
  const router = useRouter();
  const [ticked, setTicked] = useOptimistic(selected);
  const open = useSyncExternalStore(subscribe, readOpen, () => true);

  const choose = (next: string[]) =>
    startTransition(() => {
      setTicked(next);
      // Slugs are URL-safe, and a literal comma reads better than %2C.
      const slugs = libraries.filter((l) => next.includes(l.slug)).map((l) => l.slug);
      const href = slugs.length ? `${base}${base.includes("?") ? "&" : "?"}library=${slugs.join(",")}` : base;
      startNavigation(href);
      router.push(href);
    });

  return (
    <fieldset className="mb-7">
      <legend className="mb-2.5 w-full sources-collapsed:mb-0">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="sources-list"
          title={open ? "Collapse sources" : "Expand sources"}
          className="-my-1 flex w-full items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-semibold text-muted transition-colors hover:text-ink"
        >
          Sources
          {/* Points up while the list is open (press to fold it away), down while it's collapsed. */}
          <svg
            className="rotate-180 transition-transform duration-200 sources-collapsed:rotate-0"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 4.5 6 7.5l3-3" />
          </svg>
          {ticked.length > 0 && <span className="ml-auto hidden font-medium tabular-nums sources-collapsed:inline">{ticked.length} selected</span>}
        </button>
      </legend>
      <div id="sources-list" className="sources-collapsed:hidden">
        <div className="space-y-px">
          <Row checked={ticked.length === 0} onChange={() => choose([])} count={libraries.reduce((n, l) => n + l.count, 0)}>
            All libraries
          </Row>
          {libraries.map((l) => (
            <Row
              key={l.slug}
              checked={ticked.includes(l.slug)}
              onChange={() => choose(ticked.includes(l.slug) ? ticked.filter((s) => s !== l.slug) : [...ticked, l.slug])}
              count={l.count}
            >
              {l.name}
            </Row>
          ))}
        </div>
        {footer}
      </div>
    </fieldset>
  );
}

function Row({ checked, onChange, count, children }: { checked: boolean; onChange: () => void; count: number; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[14px] transition-colors hover:bg-fill">
      {/* Ink when ticked: the pale accent wouldn't stand out from the panel. */}
      <span className="relative flex shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="peer size-4 appearance-none rounded-[5px] bg-surface shadow-[inset_0_0_0_1.5px_var(--fill-strong)] transition-colors checked:bg-ink checked:shadow-none"
        />
        <svg
          className="pointer-events-none absolute inset-0 m-auto text-surface opacity-0 peer-checked:opacity-100"
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2.5 6.3 5 8.7l4.5-5.4" />
        </svg>
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <span className="text-[12px] text-muted tabular-nums">{count}</span>
    </label>
  );
}
