import type { Metadata } from "next";
import { Browse } from "@/components/browse";

// Fully static: the unfiltered first page, prerendered at build time from the read-only snapshot. Any filter,
// search or page number in the address is rewritten to /browse (next.config.ts), so this never runs per request.
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function Home() {
  return <Browse />;
}
