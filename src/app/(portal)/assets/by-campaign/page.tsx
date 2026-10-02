import { LibraryChips } from "@/components/portal/library-chips";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { SectionLabel } from "@/components/ui/card";
import { AssetTile } from "@/components/portal/asset-tile";

export default async function AssetsByCampaignPage() {
  const viewer = await getPortalViewer();
  const assets = await prisma.asset.findMany({
    where: { clientId: viewer.clientId },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });

  const byCampaign = new Map<string, typeof assets>();
  for (const a of assets) {
    const list = byCampaign.get(a.project.name) ?? [];
    list.push(a);
    byCampaign.set(a.project.name, list);
  }

  return (
    <div className="flex flex-col gap-4">
      <LibraryChips />
    <div className="flex flex-col gap-8">
      {Array.from(byCampaign.entries()).map(([campaign, items]) => (
        <div key={campaign} className="flex flex-col gap-3">
          <SectionLabel>{campaign}</SectionLabel>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((a) => (
              <AssetTile key={a.id} name={a.name} format={a.format} color={a.thumbnailColor} ctr={a.performanceCtr} fileUrl={a.fileUrl} />
            ))}
          </div>
        </div>
      ))}
    </div>
    </div>
  );
}
