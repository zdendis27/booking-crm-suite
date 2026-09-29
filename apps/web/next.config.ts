import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/ui", "@repo/copy", "@repo/db"],
};

export default nextConfig;
