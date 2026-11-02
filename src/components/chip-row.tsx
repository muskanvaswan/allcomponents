"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A row of chips that scrolls sideways, fading out at whichever edge has more chips past it (.chip-row in
 * globals.css), so it's clear the row scrolls. It starts faded on the right, since on a phone it nearly always
 * overflows; once mounted it follows the real scroll position and width.
 */
export function ChipRow({ className = "", children }: { className?: string; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const update = () => {
      el.toggleAttribute("data-more-start", el.scrollLeft > 1);
      el.toggleAttribute("data-more-end", el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      resize.disconnect();
    };
  }, []);
  return (
    <div ref={row} data-more-end="" className={`chip-row overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}>
      {children}
    </div>
  );
}
