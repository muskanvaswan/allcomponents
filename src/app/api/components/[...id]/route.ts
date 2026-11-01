import { connection, NextResponse, type NextRequest } from "next/server";
import { getComponent, getLibrary } from "@/lib/db";
import { loadSource } from "@/lib/source";

/** Full component record, including source files (fetched on first request). */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/components/[...id]">) {
  await connection();
  const { id } = await ctx.params;
  const c = getComponent(id.join("/"));
  const lib = c && getLibrary(c.libraryId);
  if (!c || !lib) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ component: await loadSource(c, lib) });
}
