import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Screenshot runs (scripts/screenshots) set this so the dev-mode badge doesn't land in captures.
  ...(process.env.NEXT_HIDE_DEV_INDICATOR === "1" ? { devIndicators: false as const } : {}),
};

export default nextConfig;
