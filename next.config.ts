import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the Next.js Dev Tools "N" badge in local development.
  // Compile/runtime error overlays and Fast Refresh remain enabled.
  devIndicators: false,
  serverExternalPackages: ["@supabase/supabase-js", "@supabase/ssr", "stripe"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
