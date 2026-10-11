import { Suspense } from "react";
import { MarketChips } from "@/components/portal/insights/market-chips";
import { MarketBar } from "@/components/insights/toolbar";

/** Market: Feed · Competitors · Trends as filter chips, the range on the right. Ideas moved to Plan → Opportunities. */
export default async function MarketLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense>
        <MarketBar chips={<MarketChips />} />
      </Suspense>
      {children}
    </div>
  );
}
