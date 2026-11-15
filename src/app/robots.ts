import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Crawlers read the pages, all prerendered: the home page, /sources and each
// component page. The home page's filtered, searched and paged views (/browse,
// and the old /?category=… form that redirects there) are left out: each one
// renders on request, the combinations are endless, and crawlers working
// through them ran over a million function calls in a day. The JSON
// endpoints, the MCP server and the registry are for tools, previews are bare
// demos already shown on the pages, and /polishd is the owner's analytics dashboard.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/?", "/browse", "/api/", "/mcp", "/preview/", "/r/", "/polishd"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
