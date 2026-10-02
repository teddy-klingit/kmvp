import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Suspense } from "react";
import { MarketChips } from "@/components/portal/insights/market-chips";
import { MarketBar } from "@/components/insights/toolbar";

/** Market: Feed · Competitors · Trends · Ideas as filter chips, the range on the right. */
export default async function MarketLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getPortalViewer();
  const newIdeas = await prisma.marketIntelligenceIdea.count({ where: { clientId: viewer.clientId, status: "NEW" } });
  return (
    <div className="flex flex-col gap-6">
      <Suspense>
        <MarketBar chips={<MarketChips newIdeas={newIdeas} />} />
      </Suspense>
      {children}
    </div>
  );
}
