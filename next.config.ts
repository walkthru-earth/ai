import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static export — no SSR, deploy to any CDN/S3/GitHub Pages
  output: "export",
  // Serve under /ai subpath (e.g. walkthru.earth/ai)
  basePath: process.env.BASE_PATH || "/ai",
  // Run ESLint separately via `npm run lint` (avoids deprecated next lint)
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Stub optional peer deps from @standard-community/standard-json
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      effect: false,
      sury: false,
      "@valibot/to-json-schema": false,
    };
    return config;
  },
};

export default nextConfig;
