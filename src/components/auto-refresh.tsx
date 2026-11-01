"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the current route every few seconds while `active`, e.g. while a library is indexing. */
export function AutoRefresh({ active, intervalMs = 2000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, router]);
  return null;
}
