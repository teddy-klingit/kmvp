import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { AssetTile } from "@/components/portal/asset-tile";

export default async function BrandHealthAssetsPage() {
  const viewer = await getPortalViewer();
  const assets = await prisma.asset.findMany({
    where: { clientId: viewer.clientId },
    include: { project: true },
    orderBy: { createdAt: "desc" },
    take: 24,
  });

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {assets.map((a) => (
        <AssetTile key={a.id} name={a.name} format={a.format} color={a.thumbnailColor} ctr={a.performanceCtr} campaign={a.project.name} fileUrl={a.fileUrl} />
      ))}
    </div>
  );
}
