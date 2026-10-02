import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { SectionCard, CardBody, CardNote } from "@/components/ds/card";
import { ColorSwatch } from "@/components/portal/color-swatch";
import { AssetTile } from "@/components/portal/asset-tile-dialog";
import { AddAssetButton } from "@/components/portal/add-asset-button";
import { jsonArray } from "@/lib/utils";
import { VISUAL_IDENTITY_FOLDERS } from "@/lib/brand-iq-taxonomy";
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
          <CardBody className="flex flex-wrap gap-6">
            {legacyColors.map((c) => (
              <ColorSwatch key={c} hex={c} showCmyk />
            ))}
          </CardBody>
        ) : (
          <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-brand-line">
            {primary.length > 0 && (
              <SwatchGroup label="PRIMARY">
                <div className="flex flex-wrap gap-6">
                  {primary.map((c) => (
                    <ColorSwatch key={c.hex} hex={c.hex} name={c.name} showCmyk />
                  ))}
                </div>
              </SwatchGroup>
            )}
            {secondary.length > 0 && (
              <SwatchGroup label="SECONDARY">
                <div className="flex flex-wrap gap-6">
                  {secondary.map((c) => (
                    <ColorSwatch key={c.hex} hex={c.hex} name={c.name} showCmyk />
                  ))}
                </div>
              </SwatchGroup>
            )}
            {gradients.length > 0 && (
              <SwatchGroup label="GRADIENTS">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {gradients.map((g) => (
                    <div key={g.name} className="flex flex-col gap-2">
                      <div
                        className="aspect-square rounded-[10px] border border-brand-line"
                        style={{ backgroundImage: `linear-gradient(135deg, ${g.from}, ${g.to})` }}
                      />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[13px] text-brand-ink">{g.name}</span>
                        <span className="font-brand-mono text-[11px] text-brand-ink-2">
                          {g.from.toUpperCase()} → {g.to.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </SwatchGroup>
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
          <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fonts.map((font) => (
              <div key={font} className="flex flex-col gap-1 rounded-[10px] bg-brand-chip p-5">
                <p className="m-0 text-[28px] font-light leading-[1.2] text-brand-ink" style={{ fontFamily: font }}>
                  Aa Bb Cc
                </p>
                <p className="m-0 text-[13px] text-brand-ink-2">{font}</p>
              </div>
            ))}
          </CardBody>
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
        <CardBody className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {assets.map((a) => (
            <AssetTile key={a.id} asset={a} transparent={TRANSPARENT_CATEGORIES.has(category)} />
          ))}
        </CardBody>
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
    <SectionCard
      title={title}
      meta={
        count > 0 ? (
          <span className="font-brand-mono text-[12px] text-brand-ink-2">
            {count} ITEM{count === 1 ? "" : "S"}
          </span>
        ) : undefined
      }
      action={action}
    >
      {children}
    </SectionCard>
  );
}

function SwatchGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 px-6 py-5">
      <span className="font-brand-mono text-[11px] text-brand-ink-2">{label}</span>
      {children}
    </div>
  );
}

function EmptyFolder() {
  return <CardNote>Nothing in this folder yet. Assets show up here once they&apos;re added.</CardNote>;
}
