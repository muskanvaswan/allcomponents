import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Native binaries used to build component previews at request time.
  serverExternalPackages: ["esbuild", "@tailwindcss/node", "@tailwindcss/oxide", "lightningcss"],
  // Production reads the read-only snapshot of the database (npm run snapshot), so
  // it ships with every route; the working copy stays behind. So does the React
  // script stored previews share, which the preview route puts into each page.
  outputFileTracingIncludes: { "/*": ["./data/snapshot.db", "./public/preview-runtime/*"] },
  outputFileTracingExcludes: { "/*": ["./data/aggregator.db*"] },
  // That script is also served as a file, named for its content, so a copy never goes stale.
  headers() {
    return [{ source: "/preview-runtime/:file", headers: [{ key: "cache-control", value: "public, max-age=31536000, immutable" }] }];
  },
  // The home page is fully static; its filtered, searched and paged views moved to /browse. Links in the old form
  // (/?category=…, /?q=…, /?library=…, /?page=…) are sent there with their query, by Vercel's router rather than a
  // function, and permanently (308), so search engines drop the old addresses instead of rechecking them. (A rewrite
  // would keep the old address, but the client router treats one path as one route and would keep showing the
  // static page when a filter is clicked.)
  redirects() {
    return ["q", "category", "library", "page"].map((key) => ({ source: "/", has: [{ type: "query" as const, key }], destination: "/browse", permanent: true }));
  },
  // Next sends "HTML-limited" bots (Bingbot, Applebot, Twitterbot, Slackbot, Google's ad and preview fetchers…)
  // past a prerendered page to a function, so they get the page's metadata in <head> rather than streamed in. The
  // public pages here are prerendered with their metadata already in <head>, so that detour would only cost a
  // function call per crawl. This matches no user agent. (The dynamic pages, /browse and /polishd, then stream
  // metadata to those bots too; neither is meant to be indexed.)
  htmlLimitedBots: /[^\s\S]/,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
