"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { startNavigation, stopNavigation } from "@/lib/navigation";

/**
 * Shows the loading state the moment a link to another page of the site is clicked, rather than leaving the old
 * page sitting still until the new one has rendered, and clears it once the new address is showing.
 */
export function NavigationStatus() {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    stopNavigation();
  }, [pathname, search]);

  useEffect(() => {
    // In the capture phase, since Next's links cancel the click's default to navigate in place.
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      startNavigation(a.href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
