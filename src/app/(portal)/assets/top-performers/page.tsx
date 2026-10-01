import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { AssetTile } from "@/components/portal/asset-tile";

export default async function AssetsTopPerformersPage() {
  const viewer = await getPortalViewer();
  const assets = await prisma.asset.findMany({
    where: { clientId: viewer.clientId, performanceCtr: { not: null } },
    include: { project: true },
    orderBy: { performanceCtr: "desc" },
  });

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {assets.map((a) => (
        <AssetTile key={a.id} name={a.name} format={a.format} color={a.thumbnailColor} ctr={a.performanceCtr} campaign={a.project.name} fileUrl={a.fileUrl} />
      ))}
    </div>
  );
}
