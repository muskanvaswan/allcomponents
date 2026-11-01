"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      }}
      className="shrink-0 rounded-full bg-fill px-3 py-1 text-[13px] font-medium transition-colors hover:bg-fill-strong"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
