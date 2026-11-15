import { connection, NextResponse } from "next/server";
import { componentsByIds, filteredIds, READ_ONLY } from "@/lib/db";
import { indexEntry } from "@/lib/registry";

// Built once per deploy on the read-only site, so it's a static file; live while working locally.
export async function GET() {
  if (!READ_ONLY) await connection();
  const items = componentsByIds(filteredIds({})).map(indexEntry);
  return NextResponse.json({
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "components",
    homepage: "/",
    items,
  });
}
