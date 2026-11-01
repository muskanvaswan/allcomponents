"use client";

import { useSyncExternalStore } from "react";
import { SIDEBAR_KEY } from "@/lib/sidebar";

// <html data-sidebar="closed"> is the source of truth, set before paint by
// SIDEBAR_SCRIPT. The sidebar, and the toggle that stands in for it while
// it's hidden, switch through the `sidebar-closed:` variant, so the layout is
// right before this code runs.

const listeners = new Set<() => void>();
const read = () => document.documentElement.dataset.sidebar !== "closed";

function setOpen(open: boolean) {
  try {
    localStorage.setItem(SIDEBAR_KEY, open ? "open" : "closed");
  } catch {}
  if (open) delete document.documentElement.dataset.sidebar;
  else document.documentElement.dataset.sidebar = "closed";
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** `className` sets the button's display, shape and background, so a page can show it only while the sidebar is open or closed. */
export function SidebarToggle({ controls, className = "flex rounded-lg hover:bg-fill" }: { controls: string; className?: string }) {
  const open = useSyncExternalStore(subscribe, read, () => true);
  const label = open ? "Hide filters" : "Show filters";
  return (
    <button
      type="button"
      onClick={(e) => {
        const focused = document.activeElement === e.currentTarget;
        setOpen(!open);
        // The pressed button may hide along with the sidebar; keep focus on the toggle that took its place.
        if (focused) [...document.querySelectorAll<HTMLElement>(`[aria-controls="${controls}"]`)].find((b) => b.checkVisibility())?.focus();
      }}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={label}
      title={label}
      className={`${className} h-9 w-9 items-center justify-center text-muted transition-colors hover:text-ink`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <rect x="3" y="4.5" width="18" height="15" rx="3.5" />
        <path d="M9.5 4.5v15M5.75 8.5h1.25M5.75 11.5h1.25" />
      </svg>
    </button>
  );
}
