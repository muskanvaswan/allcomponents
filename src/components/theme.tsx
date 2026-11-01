"use client";

import { useSyncExternalStore } from "react";
import { broadcastTheme } from "@/lib/preview-bridge";
import { SYSTEM_DARK, THEME_KEY, type Theme } from "@/lib/theme";

// <html data-theme> is the source of truth: THEME_SCRIPT sets it before the
// page paints, and the toggle, system changes and other tabs update it here.
// Live previews ask the page for it and are told when it changes, so they
// always match the site without reloading.

const listeners = new Set<() => void>();
let watching = false;

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

const read = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  broadcastTheme(theme);
  listeners.forEach((l) => l());
}

function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
  apply(theme);
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!watching) {
    watching = true;
    const system = matchMedia(SYSTEM_DARK);
    const fallback = (): Theme => (system.matches ? "dark" : "light");
    // Until someone picks a theme, follow the system as it changes.
    system.addEventListener("change", () => stored() || apply(fallback()));
    window.addEventListener("storage", (e) => e.key === THEME_KEY && apply(stored() ?? fallback()));
  }
  return () => listeners.delete(l);
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => "light");
}

export function ThemeToggle() {
  const next = useTheme() === "dark" ? "light" : "dark";
  const label = `Switch to ${next} mode`;
  // The icon follows data-theme through CSS, so it's right from first paint.
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-fill"
    >
      <svg className="hidden dark:block" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
      </svg>
      <svg className="dark:hidden" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
      </svg>
    </button>
  );
}
