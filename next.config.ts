import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  images: {
    remotePatterns: [{ protocol: "https", hostname: "image.tmdb.org" }],
  },
  async rewrites() {
    return [
      // Apple prefers /.well-known/apple-app-site-association and will look
      // there first. A directory whose name starts with a dot isn't reachable
      // through the app router, so the route handler lives at the root path
      // and this points the well-known path at it. Both URLs answer, which is
      // what Apple's own documentation recommends anyway.
      {
        source: "/.well-known/apple-app-site-association",
        destination: "/apple-app-site-association",
      },
    ];
  },
};

export default nextConfig;
