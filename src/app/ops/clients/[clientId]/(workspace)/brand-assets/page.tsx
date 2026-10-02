import { prisma } from "@/lib/prisma";
import { SectionCard, CardBody, CardNote } from "@/components/ds/card";
import { AssetTile } from "@/components/portal/asset-tile";

export default async function ClientBrandAssetsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const assets = await prisma.asset.findMany({
    where: { clientId },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <SectionCard title="Asset archive" meta={<span className="font-brand-mono text-[12px] text-brand-ink-2">{assets.length}</span>}>
      {assets.length === 0 ? (
        <CardNote>No assets delivered to this client yet.</CardNote>
      ) : (
        <CardBody>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
            {assets.map((a) => (
              <AssetTile key={a.id} name={a.name} format={a.format} color={a.thumbnailColor} ctr={a.performanceCtr} campaign={a.project.name} />
            ))}
          </div>
        </CardBody>
      )}
    </SectionCard>
  );
}
