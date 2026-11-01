import { after, connection, NextResponse, type NextRequest } from "next/server";
import { listLibraries, READ_ONLY } from "@/lib/db";
import { ingestLibrary, submitLibrary } from "@/lib/ingest";

export async function GET() {
  await connection();
  return NextResponse.json({ libraries: listLibraries() });
}

/** Body: `{ "url": "https://magicui.design/docs/components" }`. Ingestion runs after the response. */
export async function POST(req: NextRequest) {
  if (READ_ONLY) return NextResponse.json({ error: "This site is read-only, so libraries can't be added here." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { url?: string };
  if (!body.url) return NextResponse.json({ error: "Missing `url`" }, { status: 400 });
  try {
    const lib = submitLibrary(body.url);
    after(() => ingestLibrary(lib.id));
    return NextResponse.json({ library: lib }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
}
