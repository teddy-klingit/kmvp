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
      // Brand IQ (Phase J): brand health is computed on the overview; its asset list is the Library.
      { source: "/assets/brand-health/assets", destination: "/library", permanent: true },
      { source: "/assets/brand-health/:rest*", destination: "/assets", permanent: true },
      // Phase Q (nav v3): Skills, Output library and Settings got their own homes. Old links, bookmarks and
      // notification actionUrls keep working.
      { source: "/assets/agents-templates/brand-os", destination: "/assets/rules", permanent: true },
      { source: "/assets/agents-templates/templates/:rest*", destination: "/skills/templates/:rest*", permanent: true },
      { source: "/assets/agents-templates/agent/:id", destination: "/skills/:id", permanent: true },
      { source: "/assets/agents-templates", destination: "/skills", permanent: true },
      { source: "/assets/templates/:rest*", destination: "/skills/templates", permanent: true },
      { source: "/assets/library/:rest*", destination: "/library/:rest*", permanent: true },
      { source: "/assets/top-performers", destination: "/library/top-performers", permanent: true },
      { source: "/assets/by-campaign", destination: "/library/by-campaign", permanent: true },
      { source: "/assets/sources/:rest*", destination: "/settings/connections", permanent: true },
      { source: "/apps", destination: "/settings/apps", permanent: true },
      { source: "/reports/:rest*", destination: "/settings/reporting/:rest*", permanent: true },
      { source: "/account/usage", destination: "/settings/usage", permanent: true },
      { source: "/account/billing", destination: "/settings/usage/billing", permanent: true },
      { source: "/account/:rest*", destination: "/settings/account/:rest*", permanent: true },
      { source: "/settings", destination: "/settings/account", permanent: false },
      { source: "/ops/agents/:rest*", destination: "/ops/skills/:rest*", permanent: true },
    ];
  },
  experimental: {
    // Asset uploads go through a server action: approved limit is 250 MB for video (25 MB for images/PDF, checked in uploads.ts).
    serverActions: { bodySizeLimit: "251mb" },
  },
};

export default nextConfig;
