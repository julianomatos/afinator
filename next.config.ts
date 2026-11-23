import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
};

export default withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  additionalPrecacheEntries: [
    { url: "/", revision: null },
    { url: "/worklets/pitch-processor.js", revision: null },
    { url: "/icons/icon-192.png", revision: null },
    { url: "/icons/icon-512.png", revision: null },
    { url: "/icons/maskable-512.png", revision: null },
    { url: "/icons/apple-touch-icon.png", revision: null },
  ],
})(nextConfig);
