import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { CATEGORY_BY_ID } from "@/lib/taxonomy";
import type { ComponentSummary } from "@/lib/types";
import { LibraryMark } from "./library-mark";
import { PreviewFrame } from "./preview-frame";

/**
 * `columns` sets both the grid's columns and `--cols` to match, which the
 * loading ripple uses to find each tile's row and column (see .tile-wave).
 */
export function TileGrid({ children, columns = "sm:grid-cols-2 sm:[--cols:2] xl:grid-cols-3 xl:[--cols:3] 2xl:grid-cols-4 2xl:[--cols:4]" }: { children: ReactNode; columns?: string }) {
  return <ul className={`grid grid-cols-1 gap-5 [--cols:1] ${columns}`}>{children}</ul>;
}

/** `index` is the tile's place in its grid; `eager` starts its preview from the server's HTML. */
export function ComponentTile({ c, showCategory = true, index = 0, eager = false }: { c: ComponentSummary; showCategory?: boolean; index?: number; eager?: boolean }) {
  return (
    <li style={{ "--i": index } as CSSProperties}>
      <Link
        href={`/c/${c.id}`}
        prefetch={false}
        className="group block overflow-hidden rounded-2xl bg-surface shadow-card transition-shadow duration-200 hover:shadow-raised"
      >
        <PreviewFrame id={c.id} title={c.name} fallbackImage={c.previewImage} eager={eager} wide={c.kind === "block"} />
        <div className="px-4 pt-3 pb-3.5">
          <h3 className="truncate text-[15px] font-semibold">{c.name}</h3>
          <div className="mt-1 flex items-center justify-between gap-3 text-muted">
            <LibraryMark id={c.libraryId} name={c.libraryName} />
            {showCategory && <span className="truncate text-[12px]">{CATEGORY_BY_ID.get(c.category)?.label}</span>}
          </div>
        </div>
      </Link>
    </li>
  );
}
