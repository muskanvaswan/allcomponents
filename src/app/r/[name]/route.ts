import { connection, NextResponse, type NextRequest } from "next/server";
import { getComponent, getLibrary, READ_ONLY } from "@/lib/db";
import { parseRegistryName, registryItem } from "@/lib/registry";
import { loadSource } from "@/lib/source";

// The read-only site's items only change with a deploy, and Vercel's CDN starts afresh with each one, so the CDN
// keeps each item and serves repeat requests without running this.
const CACHE = READ_ONLY ? "public, max-age=3600, s-maxage=31536000" : "no-store";

/** `/r/<library>--<component>.json`, e.g. `/r/magicui--marquee.json`. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/r/[name]">) {
  await connection();
  const { name } = await ctx.params;
  const id = parseRegistryName(name);
  const c = id && getComponent(id);
  const lib = c && getLibrary(c.libraryId);
  if (!c || !lib) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(registryItem(await loadSource(c, lib)), { headers: { "cache-control": CACHE } });
}
