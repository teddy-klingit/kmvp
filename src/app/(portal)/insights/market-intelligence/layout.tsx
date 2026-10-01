import { PageHeader } from "@/components/shared/page-header";
import { NavTabs } from "@/components/ui/nav-tabs";
import { INSIGHTS_TABS } from "@/lib/insights-tabs";

export default function MarketIntelligenceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Market Intelligence"
        tabs={INSIGHTS_TABS}
      />
      <NavTabs
        size="sm"
        items={[
          { label: "Feed", href: "/insights/market-intelligence" },
          { label: "Competitors", href: "/insights/market-intelligence/competitors" },
          { label: "Trends", href: "/insights/market-intelligence/trends" },
          { label: "Ideas", href: "/insights/market-intelligence/ideas" },
          { label: "SEO & AI Visibility", href: "/insights/market-intelligence/seo" },
        ]}
        className="-mt-2 border-b-0"
      />
      {children}
    </div>
  );
}
