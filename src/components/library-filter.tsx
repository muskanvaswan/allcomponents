"use client";

import { useRouter } from "next/navigation";
import { startTransition, useOptimistic, type ReactNode } from "react";

type Library = { slug: string; name: string; count: number };

/**
 * Narrows the grid to any mix of libraries; nothing ticked means all of them.
 * A tick shows straight away while the page loads.
 */
export function LibraryFilter({ libraries, selected, base }: { libraries: Library[]; selected: string[]; base: string }) {
  const router = useRouter();
  const [ticked, setTicked] = useOptimistic(selected);

  const choose = (next: string[]) =>
    startTransition(() => {
      setTicked(next);
      // Slugs are URL-safe, and a literal comma reads better than %2C.
      const slugs = libraries.filter((l) => next.includes(l.slug)).map((l) => l.slug);
      router.push(slugs.length ? `${base}${base.includes("?") ? "&" : "?"}library=${slugs.join(",")}` : base);
    });

  return (
    <fieldset>
      <legend className="mb-2.5 px-2.5 text-[12px] font-semibold text-muted">Sources</legend>
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
