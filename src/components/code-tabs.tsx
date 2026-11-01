"use client";

import { useState } from "react";
import { CopyButton } from "./copy-button";

export type CodeFile = { path: string; html: string; raw: string; label?: string };

export function CodeTabs({ files }: { files: CodeFile[] }) {
  const [active, setActive] = useState(0);
  const file = files[active];
  if (!file) return null;
  return (
    <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <div role="tablist" aria-label="Source files" className="flex min-w-0 gap-0.5 overflow-x-auto rounded-lg bg-fill p-0.5">
          {files.map((f, i) => (
            <button
              key={f.path}
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={`shrink-0 rounded-md px-3 py-1 text-[13px] font-medium transition-all ${i === active ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
            >
              {f.label ?? f.path.split("/").pop()}
            </button>
          ))}
        </div>
        <CopyButton text={file.raw} label="Copy code" />
      </div>
      <div className="max-h-[560px] overflow-auto p-4 font-mono text-[12.5px] leading-relaxed [&_pre]:!m-0" dangerouslySetInnerHTML={{ __html: file.html }} />
    </div>
  );
}
