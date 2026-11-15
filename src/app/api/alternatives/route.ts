import { connection, NextResponse, type NextRequest } from "next/server";
import { findAlternatives, originFrom } from "@/lib/agent";
import { READ_ONLY } from "@/lib/db";
import { SITE_URL } from "@/lib/site";

// The read-only site's answers only change with a deploy, and Vercel's CDN starts afresh with each one, so the CDN
// keeps each answer for the life of the deploy and repeat questions don't run this. Browsers keep it for a minute.
// Errors aren't kept.
const CACHED: Record<string, string> = READ_ONLY ? { "cache-control": "public, max-age=60", "cdn-cache-control": "public, max-age=31536000" } : { "cache-control": "no-store" };

/**
 * Component alternatives for agents (see /llms.txt).
 * `/api/alternatives?query=animated+pricing+table&limit=8` finds candidates for a need;
 * `/api/alternatives?for=magicui/marquee` finds other libraries' takes on a component.
 * Both accept `category=<id>` and `library=<slug>[,<slug>]`.
 */
export async function GET(req: NextRequest) {
  await connection();
  const p = req.nextUrl.searchParams;
  // A cached answer must depend on the URL alone, so the read-only site's links name its own address rather than
  // the host the request came in on. Locally they name the address the server was reached on.
  const origin = READ_ONLY ? SITE_URL : originFrom(req.headers);
  const result = findAlternatives(
    { for: p.get("for"), query: p.get("query") ?? p.get("q"), category: p.get("category"), library: p.get("library"), limit: Number(p.get("limit")) || undefined },
    origin,
  );
  if ("error" in result) return NextResponse.json(result, { status: p.get("for") ? 404 : 400, headers: { "cache-control": "no-store" } });
  return NextResponse.json(result, { headers: CACHED });
}
