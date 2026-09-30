import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Dev only: lets the ngrok tunnel (used for Meta OAuth callbacks) load
  // dev assets and HMR; without it the page never hydrates over the tunnel.
  allowedDevOrigins: ["*.ngrok-free.dev"],
  serverExternalPackages: ["pdfjs-dist"],
  // Serverless functions ship no system fonts; text drawn into images
  // (carousel numbering, credits, maps) uses these (see src/server-fonts.ts).
  outputFileTracingIncludes: { "/**": ["./fonts/**/*"] },
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
