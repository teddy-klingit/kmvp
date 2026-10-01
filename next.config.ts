import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Screenshot runs (scripts/screenshots) set this so the dev-mode badge doesn't land in captures.
  ...(process.env.NEXT_HIDE_DEV_INDICATOR === "1" ? { devIndicators: false as const } : {}),
  experimental: {
    // Asset uploads go through a server action: approved limit is 250 MB for video (25 MB for images/PDF, checked in uploads.ts).
    serverActions: { bodySizeLimit: "251mb" },
  },
};

export default nextConfig;
