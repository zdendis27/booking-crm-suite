import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sdílené balíčky v monorepu jsou TypeScript zdrojáky bez vlastního buildu.
  transpilePackages: ["@repo/ui", "@repo/copy", "@repo/db"],
};

export default nextConfig;
