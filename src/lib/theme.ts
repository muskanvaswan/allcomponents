// The site's colour theme. A choice made with the header toggle is kept per
// viewer in localStorage; until then the site follows the system setting.
// Shared by the toggle (client) and the root layout (server), so it can't live
// in a "use client" module.

export type Theme = "light" | "dark";
export const THEME_KEY = "lookbook:theme";
export const SYSTEM_DARK = "(prefers-color-scheme: dark)";

/** Runs in <head> before first paint and sets <html data-theme>, so the page never flashes the wrong theme. */
export const THEME_SCRIPT = `(function(){var t;try{t=localStorage.getItem(${JSON.stringify(THEME_KEY)})}catch(e){}if(t!=="light"&&t!=="dark")t=matchMedia(${JSON.stringify(SYSTEM_DARK)}).matches?"dark":"light";document.documentElement.dataset.theme=t})()`;
