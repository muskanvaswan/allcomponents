"use client";

import { useState, useTransition } from "react";
import { deleteLibraryAction, refreshLibraryAction } from "@/app/actions";

export function SourceActions({ slug, busy }: { slug: string; busy: boolean }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex shrink-0 items-center gap-1 text-[13px]">
      <button
        type="button"
        disabled={busy || pending}
        onClick={() => start(() => refreshLibraryAction(slug))}
        className="rounded-full px-3 py-1 font-medium transition-colors hover:bg-fill disabled:opacity-50"
      >
        Re-index
      </button>
      {confirming ? (
        <>
          <button type="button" disabled={pending} onClick={() => start(() => deleteLibraryAction(slug))} className="rounded-full bg-danger px-3 py-1 font-medium text-white transition-opacity hover:opacity-90">
            Remove from collection
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="rounded-full px-3 py-1 font-medium text-muted transition-colors hover:bg-fill">
            Keep
          </button>
        </>
      ) : (
        <button type="button" disabled={pending} onClick={() => setConfirming(true)} className="rounded-full px-3 py-1 font-medium text-muted transition-colors hover:bg-fill hover:text-danger">
          Remove
        </button>
      )}
    </div>
  );
}
