"use client";

import { useState } from "react";
import { PreviewFrame } from "./preview-frame";
import { useTheme } from "./theme";

export function PreviewPanel({
  id,
  title,
  fallbackImage,
  original,
}: {
  id: string;
  title: string;
  fallbackImage?: string | null;
  original?: { url: string; library: string } | null;
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const theme = useTheme();
  return (
    <div className="overflow-hidden rounded-[22px] bg-surface shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-[13px]">
        <span className="text-muted">Live preview from the library&apos;s source</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="rounded-full px-3 py-1 font-medium transition-colors hover:bg-fill">
            Replay
          </button>
          <a href={`/preview/${id}${theme === "dark" ? "?theme=dark" : ""}`} target="_blank" rel="noreferrer" className="rounded-full px-3 py-1 font-medium transition-colors hover:bg-fill">
            Open full screen
          </a>
        </div>
      </div>
      <div className="h-[420px] sm:h-[520px]">
        <PreviewFrame id={id} title={title} variant="full" reloadKey={reloadKey} fallbackImage={fallbackImage} original={original} />
      </div>
    </div>
  );
}
