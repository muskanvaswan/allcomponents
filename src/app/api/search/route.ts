import { connection, NextResponse, type NextRequest } from "next/server";
import { searchComponents } from "@/lib/search";

/** `/api/search?q=animated+carousel&category=&library=easyui,magicui&framework=&animated=1&limit=24&offset=0` */
export async function GET(req: NextRequest) {
  await connection();
  const p = req.nextUrl.searchParams;
  const result = searchComponents({
    query: p.get("q") ?? undefined,
    category: p.get("category") ?? undefined,
    library: p.get("library") ?? undefined,
    framework: p.get("framework") ?? undefined,
    animated: p.get("animated") === "1",
    limit: Number(p.get("limit") ?? 24),
    offset: Number(p.get("offset") ?? 0),
  });
  return NextResponse.json(result);
}
