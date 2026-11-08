import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    instantInsights: { validationLevel: "manual-warning" },
  },
};

export default nextConfig;
