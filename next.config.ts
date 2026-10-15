import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Screenshot runs (scripts/screenshots) set this so the dev-mode badge doesn't land in captures.
  ...(process.env.NEXT_HIDE_DEV_INDICATOR === "1" ? { devIndicators: false as const } : {}),
  // Insights went from two tab levels to one (Insights.dc.html). Old links, bookmarks and notification
  // actionUrls keep working. Old /insights with performance filters lands on Performance with the same query.
  async redirects() {
    return [
      // Phase T: Price List, Billing, Migration and Plans & settings live under Admin. Old links keep working.
      { source: "/ops/price-list", destination: "/ops/admin/price-list", permanent: false },
      { source: "/ops/price-list/:rest*", destination: "/ops/admin/price-list/:rest*", permanent: false },
      { source: "/ops/billing", destination: "/ops/admin/billing", permanent: false },
      { source: "/ops/billing/:rest*", destination: "/ops/admin/billing/:rest*", permanent: false },
      { source: "/ops/migration", destination: "/ops/admin/migration", permanent: false },
      { source: "/ops/settings", destination: "/ops/admin/settings", permanent: false },
      { source: "/ops/plans", destination: "/ops/admin/settings/plans", permanent: false },
      { source: "/insights", has: [{ type: "query", key: "platform" }], destination: "/insights/performance", permanent: true },
      { source: "/insights", has: [{ type: "query", key: "tier" }], destination: "/insights/performance", permanent: true },
      { source: "/insights", has: [{ type: "query", key: "range" }], destination: "/insights/performance", permanent: true },
      { source: "/insights/market-intelligence/seo", destination: "/insights/seo", permanent: true },
      { source: "/insights/market-intelligence/ideas", destination: "/planner/opportunities", permanent: true },
      { source: "/insights/market-intelligence/:view(competitors|trends)", destination: "/insights/market/:view", permanent: true },
      { source: "/insights/market/ideas", destination: "/planner/opportunities", permanent: true },
      { source: "/projects/inspiration", destination: "/planner/opportunities", permanent: true },
      { source: "/insights/market-intelligence", destination: "/insights/market", permanent: true },
      { source: "/insights/community", destination: "/insights/audience#community", permanent: true },
      { source: "/insights/website", destination: "/insights/audience#website", permanent: true },
      // Brand IQ (Phase J): brand health is computed on the overview; its asset list is the Library.
      { source: "/assets/brand-health/assets", destination: "/library", permanent: true },
      { source: "/assets/brand-health/:rest*", destination: "/assets", permanent: true },
      // Phase Q (nav v3): Skills, Output library and Settings got their own homes. Old links, bookmarks and
      // notification actionUrls keep working.
      { source: "/assets/agents-templates/brand-os", destination: "/assets/rules", permanent: true },
      { source: "/assets/agents-templates/templates/:rest*", destination: "/assets/visual-identity#layouts", permanent: true },
      // Quick fixes: Plan is called Planner (Settings → Plan, the pricing plan, keeps its name).
      { source: "/plan", destination: "/planner", permanent: true },
      { source: "/plan/:rest*", destination: "/planner/:rest*", permanent: true },
      { source: "/ops/plan", destination: "/ops/planner", permanent: true },
      { source: "/ops/clients/:clientId/plan", destination: "/ops/clients/:clientId/planner", permanent: true },
      // Phase R: Plan replaces Calendar.
      { source: "/calendar", destination: "/planner", permanent: true },
      { source: "/calendar/:rest*", destination: "/planner", permanent: true },
      // Phase R: templates are layouts in Visual identity and "Start from" in a skill run.
      { source: "/skills/templates", destination: "/skills", permanent: true },
      { source: "/skills/templates/:rest*", destination: "/skills", permanent: true },
      { source: "/assets/agents-templates/agent/:id", destination: "/skills/:id", permanent: true },
      { source: "/assets/agents-templates", destination: "/skills", permanent: true },
      { source: "/assets/templates/:rest*", destination: "/assets/visual-identity#layouts", permanent: true },
      { source: "/assets/library", destination: "/library", permanent: true },
      { source: "/assets/library/:rest*", destination: "/library/:rest*", permanent: true },
      { source: "/assets/top-performers", destination: "/library", permanent: true },
      { source: "/assets/by-campaign", destination: "/library", permanent: true },
      { source: "/library/top-performers", destination: "/library", permanent: true },
      { source: "/library/by-campaign", destination: "/library", permanent: true },
      { source: "/assets/sources/:rest*", destination: "/settings/connections", permanent: true },
      { source: "/apps", destination: "/settings/apps", permanent: true },
      { source: "/reports/:rest*", destination: "/settings/reporting/:rest*", permanent: true },
      { source: "/account/usage", destination: "/settings/usage", permanent: true },
      { source: "/account/billing", destination: "/settings/usage", permanent: true },
      { source: "/settings/usage/billing", destination: "/settings/usage", permanent: true },
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
