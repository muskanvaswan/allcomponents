import type { ReactNode } from "react";
import { CATEGORIES } from "@/lib/taxonomy";
import { CommandMenu } from "./command-menu";
import { SoundToggle } from "./sound";
import { ThemeToggle } from "./theme";

// Only the labels go to the browser, not the classifier that lives alongside them.
const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

/** Frosted glass for controls that float on the page. */
export const GLASS = "bg-surface/60 shadow-card backdrop-blur-xl backdrop-saturate-150";

/**
 * The bar along the top of each page: the sound and theme switches and search, with room
 * on the left for whatever the page needs there. Each page places it in its own
 * content column, so the home page's sidebar can run the full height beside it.
 * The bar itself is clear and scrolls away with the page; its controls sit in
 * glass capsules, like the toolbars in Apple's own apps. They start 1.25rem
 * down, level with the top of the home page's floating sidebar.
 */
export function Toolbar({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <header className="pt-5">
      <div className={`flex h-11 items-center gap-3 ${className}`}>
        <div className="flex min-w-0 flex-1 items-center">{children}</div>
        <div className={`flex items-center gap-0.5 rounded-full p-1 ${GLASS}`}>
          <SoundToggle />
          <ThemeToggle />
          <CommandMenu categoryLabels={CATEGORY_LABELS} />
        </div>
      </div>
    </header>
  );
}
