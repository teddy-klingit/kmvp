import { prisma } from "@/lib/prisma";
import { SectionLabel } from "@/components/ui/card";
import { AssetTile } from "@/components/portal/asset-tile";

export default async function ClientBrandAssetsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const assets = await prisma.asset.findMany({
    where: { clientId },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <SectionLabel>{assets.length} assets in the archive</SectionLabel>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
        {assets.map((a) => (
          <AssetTile key={a.id} name={a.name} format={a.format} color={a.thumbnailColor} ctr={a.performanceCtr} campaign={a.project.name} />
        ))}
      </div>
    </div>
  );
}
