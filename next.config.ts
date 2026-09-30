import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/maps": ["./extract.md"],
    "/api/samples": ["./samples/**/*"],
    "/api/samples/[domain]/[file]": ["./samples/**/*"],
  },
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
