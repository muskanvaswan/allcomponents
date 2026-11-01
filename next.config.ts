import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Native binaries used to build component previews at request time.
  serverExternalPackages: ["esbuild", "@tailwindcss/node", "@tailwindcss/oxide", "lightningcss"],
  // Production reads the read-only snapshot of the database (npm run snapshot), so
  // it ships with every route; the working copy stays behind.
  outputFileTracingIncludes: { "/*": ["./data/snapshot.db"] },
  outputFileTracingExcludes: { "/*": ["./data/aggregator.db*"] },
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
