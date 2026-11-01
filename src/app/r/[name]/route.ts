import { connection, NextResponse, type NextRequest } from "next/server";
import { getComponent, getLibrary } from "@/lib/db";
import { parseRegistryName, registryItem } from "@/lib/registry";
import { loadSource } from "@/lib/source";

/** `/r/<library>--<component>.json`, e.g. `/r/magicui--marquee.json`. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/r/[name]">) {
  await connection();
  const { name } = await ctx.params;
  const id = parseRegistryName(name);
  const c = id && getComponent(id);
  const lib = c && getLibrary(c.libraryId);
  if (!c || !lib) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(registryItem(await loadSource(c, lib)));
}
