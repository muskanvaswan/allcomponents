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
