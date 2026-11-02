// While the next page loads, <html data-navigating> is set, so the page can show it's working (the grid dims and the
// loading ripple rolls across it: globals.css). Links set it as they're clicked (src/components/navigation-status.tsx),
// code that navigates by itself calls startNavigation, and it's cleared once the new page has rendered.

let timer: ReturnType<typeof setTimeout> | undefined;

/** Shows the loading state, unless `href` is the page already showing (nothing would load). */
export function startNavigation(href?: string) {
  if (href) {
    const url = new URL(href, location.href);
    if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
  }
  document.documentElement.setAttribute("data-navigating", "");
  clearTimeout(timer);
  // In case the navigation never lands, such as when it fails.
  timer = setTimeout(stopNavigation, 15000);
}

export function stopNavigation() {
  clearTimeout(timer);
  document.documentElement.removeAttribute("data-navigating");
}
