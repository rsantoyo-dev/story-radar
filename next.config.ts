import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.fal.media",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
