// Whether the filters sidebar on the browse page is open. Like the theme, the
// choice is kept per viewer in localStorage and applied to <html data-sidebar>
// before first paint, so a closed sidebar never flashes open on load.
// Shared by the toggle (client) and the root layout (server).

export const SIDEBAR_KEY = "lookbook:sidebar";

export const SIDEBAR_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(SIDEBAR_KEY)})==="closed")document.documentElement.dataset.sidebar="closed"}catch(e){}})()`;
