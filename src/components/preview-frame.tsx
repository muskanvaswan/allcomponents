"use client";

import { useEffect, useRef, useState } from "react";
import { earlyReport } from "@/lib/preview-bridge";

type Status = "idle" | "loading" | "ready" | "error";

// Grid tiles wait their turn so a page of previews doesn't start dozens of
// documents at once. A slot frees as soon as the frame's document has loaded,
// or after SLOT_MS if it's slow, so one stuck preview can't hold up the rest.
// Eager frames skip the queue but still take a slot while they load.
const MAX_LOADING = 8;
const SLOT_MS = 3000;
// How long to keep the placeholder over a preview that never reports in.
const REPORT_MS = 10_000;
let loading = 0;
const queue: (() => void)[] = [];
function acquire(start: () => void) {
  if (loading < MAX_LOADING) {
    loading++;
    start();
  } else queue.push(start);
}
function release() {
  loading = Math.max(0, loading - 1);
  const next = queue.shift();
  if (next) {
    loading++;
    next();
  }
}

export function PreviewFrame({
  id,
  title,
  variant = "tile",
  eager = false,
  reloadKey = 0,
  fallbackImage,
  original,
  wide = false,
}: {
  id: string;
  title: string;
  variant?: "tile" | "full";
  /** Start loading straight from the server's HTML, before the page hydrates (the first rows of a grid). */
  eager?: boolean;
  /**
   * A whole page, like a dashboard or a sidebar layout. A tile shows it at three times its size scaled
   * down, rather than twice, so it lays out for a desktop-sized window instead of collapsing to mobile.
   */
  wide?: boolean;
  reloadKey?: number;
  fallbackImage?: string | null;
  /** Where to send people when the live preview can't render. */
  original?: { url: string; library: string } | null;
}) {
  // The theme isn't in the frame's URL (the preview asks the page for it, see
  // preview-bridge.ts), so a frame can be in the server's HTML and a theme
  // switch doesn't reload it.
  const startNow = variant === "full" || eager;
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [visible, setVisible] = useState(startNow);
  const [allowed, setAllowed] = useState(startNow);
  // Reports are tied to the iframe instance they came from, so replaying resets them.
  const frameKey = String(reloadKey);
  const [report, setReport] = useState<{ key: string; status: Status; error: string | null } | null>(null);
  const status: Status = !allowed ? "idle" : report?.key === frameKey ? report.status : "loading";
  const error = report?.key === frameKey ? report.error : null;
  const holding = useRef(false);
  const releaseSlot = useRef<() => void>(() => {});

  useEffect(() => {
    if (variant === "full" || !box.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "300px" });
    io.observe(box.current);
    return () => io.disconnect();
  }, [variant]);

  useEffect(() => {
    if (!visible || allowed) return;
    let cancelled = false;
    acquire(() => {
      if (cancelled) return release();
      holding.current = true;
      setAllowed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, allowed]);

  useEffect(() => {
    if (!allowed) return;
    if (startNow && !holding.current) {
      loading++;
      holding.current = true;
    }
    const done = () => {
      if (holding.current) {
        holding.current = false;
        release();
      }
    };
    releaseSlot.current = done;
    const slotTimer = setTimeout(done, SLOT_MS);
    const take = (status: unknown, error?: string) => {
      if (status === "ready") setReport((r) => (r?.key === frameKey && r.status === "error" ? r : { key: frameKey, status: "ready", error: null }));
      if (status === "error") setReport({ key: frameKey, status: "error", error: error ?? null });
      if (status === "ready" || status === "error") done();
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.data?.source !== "ui-agg-preview") return;
      take(e.data.status, e.data.error);
    };
    window.addEventListener("message", onMessage);
    // A frame from the server's HTML may have reported before this listener existed.
    const early = earlyReport(frame.current);
    const replay = early ? setTimeout(() => take(early.status, early.error)) : undefined;
    // Previews that never report (long-running effects, odd demos) are shown as they are.
    const reportTimer = setTimeout(() => setReport((r) => (r?.key === frameKey ? r : { key: frameKey, status: "ready", error: null })), REPORT_MS);
    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(slotTimer);
      clearTimeout(reportTimer);
      clearTimeout(replay);
      done();
    };
  }, [allowed, frameKey, startNow]);

  const isTile = variant === "tile";
  const src = `/preview/${id}${isTile ? "?frame=tile" : ""}`;

  return (
    <div
      ref={box}
      className={`relative overflow-hidden transition-colors duration-300 ${status !== "ready" ? "bg-surface" : "bg-white dark:bg-[#0a0a0a]"} ${isTile ? "aspect-[4/3]" : "h-full"}`}
    >
      {allowed && (
        <iframe
          key={frameKey}
          ref={frame}
          src={src}
          title={`Live preview of ${title}`}
          // Isolation comes from the `Content-Security-Policy: sandbox` header on /preview responses,
          // which gives the document an opaque origin. Some embedders refuse frames with a sandbox attribute.
          onLoad={() => releaseSlot.current()}
          tabIndex={isTile ? -1 : 0}
          className={`absolute top-0 left-0 border-0 transition-opacity duration-300 ${status === "ready" || (status === "error" && !isTile) ? "opacity-100" : "opacity-0"} ${
            !isTile ? "h-full w-full" : wide ? "pointer-events-none h-[300%] w-[300%] origin-top-left scale-[33.333%]" : "pointer-events-none h-[200%] w-[200%] origin-top-left scale-50"
          }`}
        />
      )}
      {(status === "idle" || status === "loading") && <div className="tile-wave pointer-events-none absolute inset-0" />}
      {status === "error" && isTile && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface p-4 text-center text-[13px] text-muted">
          {fallbackImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fallbackImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <span>No live preview. Open it to see the original.</span>
          )}
        </div>
      )}
      {status === "error" && !isTile && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface p-6 text-center">
          <p className="font-display text-[20px] font-light tracking-[-0.02em]">This one can&apos;t be previewed here</p>
          <p className="max-w-[52ch] text-[14px] text-muted">{error ?? "It needs data or setup the library's docs provide."}</p>
          {original && (
            <a href={original.url} target="_blank" rel="noreferrer" className="mt-1 rounded-full bg-accent px-5 py-2 text-[14px] font-medium text-on-accent transition-colors hover:bg-accent-hover">
              See it on {original.library}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
