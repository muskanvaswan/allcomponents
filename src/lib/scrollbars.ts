// Scrollbar thumbs only show while their area is scrolling, the way macOS
// does it. CSS can't tell when something scrolls, so this marks the scrolling
// element (or <html>, for the page) with data-scrolling and clears it once
// scrolling has stopped. Runs on the site and inside preview documents.

export const SCROLLBAR_SCRIPT = `(function(){var t=new WeakMap();document.addEventListener("scroll",function(e){var el=e.target===document?document.documentElement:e.target;if(!el||!el.setAttribute)return;if(!el.hasAttribute("data-scrolling"))el.setAttribute("data-scrolling","");clearTimeout(t.get(el));t.set(el,setTimeout(function(){el.removeAttribute("data-scrolling")},900))},{capture:true,passive:true})})()`;
