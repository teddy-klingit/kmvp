import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Screenshot runs (scripts/screenshots) set this so the dev-mode badge doesn't land in captures.
  ...(process.env.NEXT_HIDE_DEV_INDICATOR === "1" ? { devIndicators: false as const } : {}),
  // Insights went from two tab levels to one (Insights.dc.html). Old links, bookmarks and notification
  // actionUrls keep working. Old /insights with performance filters lands on Performance with the same query.
  async redirects() {
    return [
      { source: "/insights", has: [{ type: "query", key: "platform" }], destination: "/insights/performance", permanent: true },
      { source: "/insights", has: [{ type: "query", key: "tier" }], destination: "/insights/performance", permanent: true },
      { source: "/insights", has: [{ type: "query", key: "range" }], destination: "/insights/performance", permanent: true },
      { source: "/insights/market-intelligence/seo", destination: "/insights/seo", permanent: true },
      { source: "/insights/market-intelligence/:view(competitors|trends|ideas)", destination: "/insights/market/:view", permanent: true },
      { source: "/insights/market-intelligence", destination: "/insights/market", permanent: true },
      { source: "/insights/community", destination: "/insights/audience#community", permanent: true },
      { source: "/insights/website", destination: "/insights/audience#website", permanent: true },
    ];
  },
  experimental: {
    // Asset uploads go through a server action: approved limit is 250 MB for video (25 MB for images/PDF, checked in uploads.ts).
    serverActions: { bodySizeLimit: "251mb" },
  },
};

export default nextConfig;
