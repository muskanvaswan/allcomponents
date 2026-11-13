// Whether the filters sidebar on the browse page is open, and whether its
// Sources list is collapsed. Like the theme, each choice is kept per viewer in
// localStorage and applied to <html data-sidebar> / <html data-sources> before
// first paint, so a closed sidebar or a collapsed list never flashes open on load.
// Shared by the toggles (client) and the root layout (server).

export const SIDEBAR_KEY = "lookbook:sidebar";
export const SOURCES_KEY = "lookbook:sources";

export const SIDEBAR_SCRIPT = `(function(){try{var d=document.documentElement.dataset;if(localStorage.getItem(${JSON.stringify(SIDEBAR_KEY)})==="closed")d.sidebar="closed";if(localStorage.getItem(${JSON.stringify(SOURCES_KEY)})==="collapsed")d.sources="collapsed"}catch(e){}})()`;
