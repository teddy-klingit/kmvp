import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card } from "@/components/ui/card";
import { ColorSwatch } from "@/components/portal/color-swatch";
import { AssetTile } from "@/components/portal/asset-tile-dialog";
import { AddAssetButton } from "@/components/portal/add-asset-button";
import { EmptyState } from "@/components/shared/empty-state";
import { jsonArray } from "@/lib/utils";
import { VISUAL_IDENTITY_FOLDERS } from "@/lib/brand-iq-taxonomy";
import { FolderOpen } from "lucide-react";
import type { BrandAssetCategory } from "@/generated/prisma";

type PaletteColor = { hex: string; name: string; role: "primary" | "secondary" };
type Gradient = { name: string; from: string; to: string };

const CATEGORY_FOR: Record<string, BrandAssetCategory> = {
  logotype: "LOGO",
  photography: "PHOTOGRAPHY",
  illustration: "ILLUSTRATION",
  icons: "ICON",
  patterns: "PATTERN",
  video: "VIDEO",
  animation: "ANIMATION",
};

const TRANSPARENT_CATEGORIES = new Set(["logotype", "icons"]);

export default async function VisualIdentityFolderPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const folder = VISUAL_IDENTITY_FOLDERS.find((f) => f.slug === category);
  if (!folder) notFound();

  const viewer = await getPortalViewer();

  if (category === "brand-colours") {
    const brandOS = await prisma.brandOS.findUnique({ where: { clientId: viewer.clientId } });
    const palette = jsonArray<PaletteColor>(brandOS?.colorPalette);
    const gradients = jsonArray<Gradient>(brandOS?.colorGradients);
    const legacyColors = jsonArray<string>(brandOS?.approvedColors);
    const primary = palette.filter((c) => c.role === "primary");
    const secondary = palette.filter((c) => c.role === "secondary");
    const totalCount = palette.length || legacyColors.length;

    if (totalCount === 0) {
      return (
        <FolderShell title={folder.label} count={0}>
          <EmptyFolder />
        </FolderShell>
      );
    }

    return (
      <FolderShell title={folder.label} count={totalCount + gradients.length}>
        {palette.length === 0 ? (
          <Card className="flex flex-wrap gap-6 p-5">
            {legacyColors.map((c) => (
              <ColorSwatch key={c} hex={c} showCmyk />
            ))}
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            {primary.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Primary</p>
                <Card className="flex flex-wrap gap-6 p-5">
                  {primary.map((c) => (
                    <ColorSwatch key={c.hex} hex={c.hex} name={c.name} showCmyk />
                  ))}
                </Card>
              </div>
            )}
            {secondary.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Secondary</p>
                <Card className="flex flex-wrap gap-6 p-5">
                  {secondary.map((c) => (
                    <ColorSwatch key={c.hex} hex={c.hex} name={c.name} showCmyk />
                  ))}
                </Card>
              </div>
            )}
            {gradients.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gradients</p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {gradients.map((g) => (
                    <div key={g.name} className="flex flex-col gap-2">
                      <div
                        className="aspect-square rounded-xl border border-border shadow-sm"
                        style={{ backgroundImage: `linear-gradient(135deg, ${g.from}, ${g.to})` }}
                      />
                      <div>
                        <p className="text-xs font-medium">{g.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {g.from.toUpperCase()} → {g.to.toUpperCase()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </FolderShell>
    );
  }

  if (category === "typography") {
    const brandOS = await prisma.brandOS.findUnique({ where: { clientId: viewer.clientId } });
    const fonts = jsonArray<string>(brandOS?.approvedTypography);
    return (
      <FolderShell title={folder.label} count={fonts.length}>
        {fonts.length === 0 ? (
          <EmptyFolder />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fonts.map((font) => (
              <Card key={font} className="p-5">
                <p className="font-display text-2xl font-light" style={{ fontFamily: font }}>
                  Aa Bb Cc
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{font}</p>
              </Card>
            ))}
          </div>
        )}
      </FolderShell>
    );
  }

  const brandCategory = CATEGORY_FOR[category];
  const assets = brandCategory
    ? await prisma.brandAsset.findMany({ where: { clientId: viewer.clientId, category: brandCategory } })
    : [];

  return (
    <FolderShell title={folder.label} count={assets.length} action={<AddAssetButton category={brandCategory ?? ""} />}>
      {assets.length === 0 ? (
        <EmptyFolder />
      ) : (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {assets.map((a) => (
            <AssetTile key={a.id} asset={a} transparent={TRANSPARENT_CATEGORIES.has(category)} />
          ))}
        </div>
      )}
    </FolderShell>
  );
}

function FolderShell({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">
            {count} item{count === 1 ? "" : "s"}
          </p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyFolder() {
  return (
    <EmptyState icon={FolderOpen} title="Nothing here yet" description="Assets in this folder will show up here once added." />
  );
}
