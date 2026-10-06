import { Image as ImageIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { AssetTile } from "@/components/portal/asset-tile";
import { EmptyState } from "@/components/shared/empty-state";
import { LibraryChips } from "@/components/portal/library-chips";
import { clientVisibleAsset } from "@/lib/qc/visibility";

export default async function AssetsAllPage() {
  const viewer = await getPortalViewer();
  const assets = await prisma.asset.findMany({
    where: { clientId: viewer.clientId, ...clientVisibleAsset },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });

  if (assets.length === 0) {
    return (
      <EmptyState
        icon={ImageIcon}
        title="No assets yet"
        description="Once your first project reaches production, delivered assets will show up here."
        actionLabel="Start a brief"
        actionHref="/brief/new"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LibraryChips />
        <span className="text-[12px] text-brand-ink-2">{assets.length} assets</span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {assets.map((a) => (
          <AssetTile
            key={a.id}
            name={a.name}
            format={a.format}
            color={a.thumbnailColor}
            ctr={a.performanceCtr}
            campaign={a.project.name}
            fileUrl={a.fileUrl}
          />
        ))}
      </div>
    </div>
  );
}
