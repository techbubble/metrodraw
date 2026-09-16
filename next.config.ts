import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/maps": ["./extract.md"],
  },
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
