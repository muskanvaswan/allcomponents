import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Crawlers read the pages. The JSON endpoints, the MCP server and the registry
// are for tools, and previews are bare demos already shown on the pages.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/mcp", "/preview/", "/r/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
