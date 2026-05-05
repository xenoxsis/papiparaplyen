import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" is only used for Docker builds (set DOCKER_BUILD=true).
  // Vercel manages its own output format and does not support this option.
  ...(process.env.DOCKER_BUILD === "true" && { output: "standalone" }),

  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },

  // In the Docker container the browser uses relative URLs (/api/…) and
  // Next.js proxies them to the Express backend running on port 3001.
  // On Vercel this rewrite is a no-op (no backend on localhost:3001).
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/api/:path*",
      },
    ];
  },
};

export default nextConfig;
