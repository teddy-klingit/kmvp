import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { MarketChips } from "@/components/portal/insights/market-chips";

/** Market: Feed · Competitors · Trends · Ideas as filter chips (the old second tab level). */
export default async function MarketLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getPortalViewer();
  const newIdeas = await prisma.marketIntelligenceIdea.count({ where: { clientId: viewer.clientId, status: "NEW" } });
  return (
    <div className="flex flex-col gap-6">
      <MarketChips newIdeas={newIdeas} />
      {children}
    </div>
  );
}
