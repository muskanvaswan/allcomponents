import type { ReactNode } from "react";
import { SKILL_INSTALL } from "@/lib/site";
import { CATEGORIES } from "@/lib/taxonomy";
import { CommandMenu } from "./command-menu";
import { SkillInstall } from "./skill-install";
import { SoundToggle } from "./sound";
import { ThemeToggle } from "./theme";

// Only the labels go to the browser, not the classifier that lives alongside them.
const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

/** Frosted glass for controls that float on the page. */
export const GLASS = "bg-surface/60 shadow-card backdrop-blur-xl backdrop-saturate-150";

/**
 * The bar along the top of each page: the skill chip, the sound and theme switches and search, with room on
 * the left for whatever the page needs there. Each page places it in its own content column, so the home
 * page's sidebar can run the full height beside it. The bar itself is clear and scrolls away with the page;
 * its controls sit in a glass capsule, like the toolbars in Apple's own apps, 1.25rem down, level with the
 * top of the home page's floating sidebar.
 *
 * On phones the capsule becomes a notch instead, like the Dynamic Island grown out of the top of the screen:
 * it hangs from the top edge across the content column, rounds off at the bottom, and flares into the top
 * edge with a concave curve on each side that fills the page's 16px margin. It's nearly opaque, so the flares
 * meet the bar without a seam.
 */
export function Toolbar({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <header className="sm:pt-5">
      <div className={`flex items-center gap-3 sm:h-11 ${className}`}>
        <div className="hidden min-w-0 flex-1 items-center sm:flex">{children}</div>
        <div className={`relative flex min-w-0 items-center gap-0.5 backdrop-blur-xl backdrop-saturate-150 ${NOTCH} ${CAPSULE}`}>
          {/* On a phone the chip holds the left end and the switches the right. */}
          <div className="mr-auto flex min-w-0 sm:mr-0">
            <SkillInstall command={SKILL_INSTALL} />
          </div>
          <SoundToggle />
          <ThemeToggle />
          <CommandMenu categoryLabels={CATEGORY_LABELS} />
        </div>
      </div>
    </header>
  );
}

// The phone notch: square at the top, round at the bottom, with a 16px concave flare on each side made from a
// square whose corner circle is masked away.
const NOTCH = [
  "w-full rounded-b-[24px] bg-surface/90 p-2 shadow-[0_10px_24px_-14px_rgb(0_0_0/0.3)]",
  "before:absolute before:top-0 before:right-full before:size-4 before:bg-surface/90 before:[mask-image:radial-gradient(circle_at_bottom_left,transparent_16px,black_16.5px)]",
  "after:absolute after:top-0 after:left-full after:size-4 after:bg-surface/90 after:[mask-image:radial-gradient(circle_at_bottom_right,transparent_16px,black_16.5px)]",
].join(" ");

// From sm up, the glass capsule (GLASS, written out per breakpoint), without the flares.
const CAPSULE = "sm:w-auto sm:rounded-full sm:bg-surface/60 sm:p-1 sm:shadow-card sm:before:hidden sm:after:hidden";
