// The page's side of the conversation with preview documents, which run in
// sandboxed iframes and can only talk by postMessage:
//   preview → page  { source: "ui-agg-preview", status: "ready" | "error", error? }
//   preview → page  { source: "ui-agg-preview", want: "theme" }
//   page → preview  { source: "lookbook", theme: "light" | "dark" }
// PREVIEW_BRIDGE_SCRIPT runs in <head>, before React, so previews the server
// put in the HTML can start at once: it answers their theme questions and
// keeps their reports until each tile hydrates and asks for its own.

export type PreviewReport = { status: "ready" | "error"; error?: string };

declare global {
  interface Window {
    /** Reports keyed by the reporting frame's window. */
    __previewReports?: WeakMap<object, PreviewReport>;
  }
}

export const PREVIEW_BRIDGE_SCRIPT = `(function(){var r=window.__previewReports=new WeakMap();addEventListener("message",function(e){var d=e.data;if(!d||d.source!=="ui-agg-preview"||!e.source)return;if(d.want==="theme")e.source.postMessage({source:"lookbook",theme:document.documentElement.dataset.theme==="dark"?"dark":"light"},"*");else if(d.status==="ready"||d.status==="error")r.set(e.source,{status:d.status,error:d.error})})})()`;

/** A report a frame sent before anything was listening for it. */
export function earlyReport(frame: HTMLIFrameElement | null): PreviewReport | undefined {
  return frame?.contentWindow ? window.__previewReports?.get(frame.contentWindow) : undefined;
}

/** Tells every preview on the page to switch theme, so none of them has to reload. */
export function broadcastTheme(theme: "light" | "dark") {
  for (const f of document.querySelectorAll("iframe")) f.contentWindow?.postMessage({ source: "lookbook", theme }, "*");
}
