import { connection, NextResponse, type NextRequest } from "next/server";
import { findAlternatives, originFrom } from "@/lib/agent";

/**
 * Component alternatives for agents (see /llms.txt).
 * `/api/alternatives?query=animated+pricing+table&limit=8` finds candidates for a need;
 * `/api/alternatives?for=magicui/marquee` finds other libraries' takes on a component.
 * Both accept `category=<id>` and `library=<slug>[,<slug>]`.
 */
export async function GET(req: NextRequest) {
  await connection();
  const p = req.nextUrl.searchParams;
  const result = findAlternatives(
    { for: p.get("for"), query: p.get("query") ?? p.get("q"), category: p.get("category"), library: p.get("library"), limit: Number(p.get("limit")) || undefined },
    originFrom(req.headers),
  );
  return NextResponse.json(result, { status: "error" in result ? (p.get("for") ? 404 : 400) : 200 });
}
