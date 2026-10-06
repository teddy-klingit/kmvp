import { LibraryChips } from "@/components/portal/library-chips";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { SectionLabel } from "@/components/ui/card";
import { AssetTile, assetTileInclude, tileMedia } from "@/components/portal/asset-tile";
import { clientCtrAverage } from "@/lib/insights-data";
import { clientVisibleAsset } from "@/lib/qc/visibility";

export default async function AssetsByCampaignPage() {
  const viewer = await getPortalViewer();
  const average = await clientCtrAverage(viewer.clientId);
  const assets = await prisma.asset.findMany({
    where: { clientId: viewer.clientId, ...clientVisibleAsset },
    include: { project: true, ...assetTileInclude },
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
              <AssetTile key={a.id} name={a.name} format={a.format} color={a.thumbnailColor} ctr={a.performanceCtr} {...tileMedia(a)} average={average} href={`/assets/library/${a.id}`} />
            ))}
          </div>
        </div>
      ))}
    </div>
    </div>
  );
}
