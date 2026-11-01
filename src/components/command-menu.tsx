"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import type { ComponentSummary } from "@/lib/types";
import { playSound } from "@/lib/sounds";
import { LibraryMark } from "./library-mark";

const RESULTS = 8;
const subscribeNever = () => () => {};

type Option = { id: string; href: string; component?: ComponentSummary };

function show(dialog: HTMLDialogElement | null, input: HTMLInputElement | null) {
  if (!dialog || dialog.open) return;
  dialog.showModal();
  input?.select();
  playSound("open");
}

/**
 * Search behind a header button and ⌘K (Ctrl+K off Apple devices). Results come
 * in as you type: the first row opens the full results page, the others go
 * straight to a component.
 */
export function CommandMenu({ categoryLabels }: { categoryLabels: Record<string, string> }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ q: string; total: number; items: ComponentSummary[] } | null>(null);
  const [active, setActive] = useState(0);
  const apple = useSyncExternalStore(subscribeNever, () => /Mac|iPhone|iPad/.test(navigator.userAgent), () => true);
  const q = query.trim();

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      e.preventDefault();
      if (dialog.current?.open) dialog.current.close();
      else show(dialog.current, input.current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!q) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}&limit=${RESULTS}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((r: { total: number; items: ComponentSummary[] }) => setFound({ q, total: r.total, items: r.items }))
        .catch(() => {});
    }, 120);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  // Until the new results arrive, the previous ones stay up so the list doesn't flicker.
  const nothing = Boolean(q) && found?.q === q && found.total === 0;
  const options: Option[] =
    q && !nothing
      ? [
          { id: `${listId}-all`, href: `/?q=${encodeURIComponent(q)}` },
          ...(found?.items ?? []).map((c, i) => ({ id: `${listId}-${i}`, href: `/c/${c.id}`, component: c })),
        ]
      : [];
  const current = Math.min(active, options.length - 1);

  const go = (o: Option) => {
    dialog.current?.close();
    router.push(o.href);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!options.length || e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (current + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      setActive(next);
      document.getElementById(options[next].id)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(options[current]);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => show(dialog.current, input.current)}
        aria-label="Search components"
        aria-haspopup="dialog"
        // The menu plays its own opening chime.
        data-sound="none"
        aria-keyshortcuts={apple ? "Meta+K" : "Control+K"}
        className="flex h-9 shrink-0 items-center gap-2 rounded-full px-2.5 text-[15px] text-muted transition-colors hover:bg-fill sm:w-52 sm:pr-1.5 sm:pl-3"
      >
        <SearchIcon />
        <span className="hidden sm:inline">Search</span>
        <kbd className="ml-auto hidden rounded-full bg-fill px-2 py-0.5 font-sans text-[12px] font-medium sm:inline">{apple ? "⌘K" : "Ctrl K"}</kbd>
      </button>

      {/* A modal <dialog> brings focus trapping, Escape to close and the backdrop. A click on the backdrop lands on the dialog itself. */}
      <dialog
        ref={dialog}
        aria-label="Search components"
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
        onClose={() => playSound("close")}
        className="mx-auto mt-[12vh] w-[min(640px,calc(100vw-32px))] max-w-none overflow-hidden rounded-2xl bg-surface p-0 text-ink shadow-raised backdrop:bg-black/30"
      >
        <div className="flex items-center gap-3 border-b border-line px-4 text-muted">
          <SearchIcon />
          <input
            ref={input}
            type="text"
            role="combobox"
            aria-label="Search components"
            aria-expanded={options.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={options[current]?.id}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search components"
            autoComplete="off"
            spellCheck={false}
            className="h-14 min-w-0 flex-1 bg-transparent text-[17px] text-ink placeholder:text-muted focus:outline-none"
          />
          <kbd className="hidden rounded-md bg-fill px-1.5 font-sans text-[12px] font-medium sm:inline">esc</kbd>
        </div>

        <ul id={listId} role="listbox" aria-label="Results" className="max-h-[min(440px,60vh)] overflow-y-auto overscroll-contain p-2 empty:hidden">
          {options.map((o, i) => (
            <li
              key={o.id}
              id={o.id}
              role="option"
              aria-selected={i === current}
              onMouseMove={() => i !== current && setActive(i)}
              onClick={() => go(o)}
              className="flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-[15px] aria-selected:bg-accent-soft"
            >
              {o.component ? (
                <>
                  <span className="min-w-0 flex-1 truncate font-medium">{o.component.name}</span>
                  <span className="hidden shrink-0 text-[13px] text-muted sm:inline">{categoryLabels[o.component.category]}</span>
                  <span className="flex w-24 shrink-0 text-muted">
                    <LibraryMark id={o.component.libraryId} name={o.component.libraryName} />
                  </span>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate">Show all results for “{q}”</span>
                  {found?.q === q && <span className="text-[13px] text-muted tabular-nums">{found.total}</span>}
                </>
              )}
            </li>
          ))}
        </ul>
        {nothing && <p className="px-5 py-5 text-[15px] text-muted">Nothing matches “{q}”. Try a broader word, like “button” or “card”.</p>}
        {!q && <p className="px-5 py-5 text-[15px] text-muted">Type a component or a kind of component, like “carousel”.</p>}
      </dialog>
    </>
  );
}

function SearchIcon() {
  return (
    <svg className="shrink-0" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
