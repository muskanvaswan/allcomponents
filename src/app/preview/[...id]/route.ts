import { createHash } from "node:crypto";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { connection, type NextRequest } from "next/server";
import { getComponent, getLibrary, READ_ONLY } from "@/lib/db";
import { previewFor } from "@/lib/preview";

// The preview document runs third-party code. The CSP sandbox gives it an
// opaque origin even if it's opened directly, so it can't reach this app's
// cookies, storage or same-origin APIs.
const HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "content-security-policy": "sandbox allow-scripts allow-popups allow-pointer-lock",
  "x-content-type-options": "nosniff",
  // A bare demo isn't a page worth finding in search; its component page is.
  "x-robots-tag": "noindex",
  vary: "accept-encoding",
};

// Browsers reuse a preview for a minute, then revalidate with its ETag (a 304
// unless it was rebuilt), and may show the stale copy while they check. A
// read-only snapshot only changes when it's redeployed, so a CDN may also keep
// it for a day (Vercel's starts afresh with each deployment).
const CACHE = READ_ONLY ? "public, max-age=60, s-maxage=86400, stale-while-revalidate=604800" : "public, max-age=60, stale-while-revalidate=86400";

// A preview is a few hundred KB of minified script and CSS, and a grid page
// loads dozens. Brotli at quality 6 sends under a third of it for ~10ms of work,
// so each version of a preview is compressed once and kept here.
type Encoding = "br" | "gzip";
const COMPRESSED_MAX = 400;
const compressed = new Map<string, Buffer>();

function encode(html: string, hash: string, encoding: Encoding): Buffer {
  const key = `${encoding}:${hash}`;
  let body = compressed.get(key);
  if (!body) {
    body = encoding === "br" ? brotliCompressSync(html, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } }) : gzipSync(html, { level: 6 });
    compressed.set(key, body);
    // Oldest first: rebuilt previews leave their old versions behind.
    if (compressed.size > COMPRESSED_MAX) compressed.delete(compressed.keys().next().value!);
  }
  return body;
}

export async function GET(req: NextRequest, ctx: RouteContext<"/preview/[...id]">) {
  await connection();
  const { id } = await ctx.params;
  const c = getComponent(id.join("/"));
  const lib = c && getLibrary(c.libraryId);
  if (!c || !lib) return new Response("Not found", { status: 404, headers: { ...HEADERS, "cache-control": "no-store" } });

  // Rebuilding is for working on previews locally; a public read-only site never does it on request.
  const rebuild = !READ_ONLY && req.nextUrl.searchParams.get("rebuild") === "1";
  const result = await previewFor(c, lib, { rebuild });
  const accepts = req.headers.get("accept-encoding") ?? "";
  const encoding: Encoding | null = /\bbr\b/.test(accepts) ? "br" : /\bgzip\b/.test(accepts) ? "gzip" : null;
  const hash = createHash("sha1").update(result.html).digest("base64url").slice(0, 22);
  // Each encoding is its own representation, so it gets its own ETag.
  const etag = `"${hash}${encoding ? `-${encoding}` : ""}"`;
  const headers: Record<string, string> = { ...HEADERS, etag, "cache-control": rebuild ? "no-store" : CACHE, "x-preview-status": result.ok ? "ok" : "error" };
  if (!rebuild && req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  if (!encoding) return new Response(result.html, { headers });
  return new Response(new Uint8Array(encode(result.html, hash, encoding)), { headers: { ...headers, "content-encoding": encoding } });
}
