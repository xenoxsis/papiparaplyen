import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" is only used for Docker builds (set DOCKER_BUILD=true).
  // Vercel manages its own output format and does not support this option.
  ...(process.env.DOCKER_BUILD === "true" && { output: "standalone" }),

  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },

  // Proxy /api/* to the backend.
  // BACKEND_URL overrides everything (used for local dev against production).
  // Otherwise falls back to localhost:BACKEND_PORT (default 3001).
  async rewrites() {
    const destination = process.env.BACKEND_URL
      ? `${process.env.BACKEND_URL}/api/:path*`
      : `http://localhost:${process.env.BACKEND_PORT ?? 3001}/api/:path*`;
    return [
      {
        source: "/api/:path*",
        destination,
      },
    ];
  },
};

export default nextConfig;
