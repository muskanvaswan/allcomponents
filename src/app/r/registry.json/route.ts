import { connection, NextResponse } from "next/server";
import { componentsByIds, filteredIds } from "@/lib/db";
import { indexEntry } from "@/lib/registry";

export async function GET() {
  await connection();
  const items = componentsByIds(filteredIds({})).map(indexEntry);
  return NextResponse.json({
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "components",
    homepage: "/",
    items,
  });
}
