import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card } from "@/components/ui/card";
import { jsonArray } from "@/lib/utils";
import { VISUAL_IDENTITY_FOLDERS } from "@/lib/brand-iq-taxonomy";
import { Palette, Type, Image as ImageIcon, Shapes, Grid3x3, Video, Sparkles } from "lucide-react";
import type { BrandAssetCategory } from "@/generated/prisma";
import { sectionSources } from "@/lib/brand-sources-data";
import { SourcesRow } from "@/components/portal/brand-sources/sources-row";
import { FigmaDesignSystemSlot } from "@/components/portal/brand-sources/figma-slot";

const ICON_FOR: Record<string, React.ComponentType<{ className?: string }>> = {
  logotype: Shapes,
  "brand-colours": Palette,
  typography: Type,
  photography: ImageIcon,
  illustration: Sparkles,
  icons: Grid3x3,
  patterns: Grid3x3,
  video: Video,
  animation: Video,
};

const CATEGORY_FOR: Record<string, BrandAssetCategory> = {
  logotype: "LOGO",
  photography: "PHOTOGRAPHY",
  illustration: "ILLUSTRATION",
  icons: "ICON",
  patterns: "PATTERN",
  video: "VIDEO",
  animation: "ANIMATION",
};

export default async function VisualIdentityPage() {
  const viewer = await getPortalViewer();
  const [brandOS, brandAssets, linked, figma] = await Promise.all([
    prisma.brandOS.findUnique({ where: { clientId: viewer.clientId } }),
    prisma.brandAsset.findMany({ where: { clientId: viewer.clientId } }),
    sectionSources(viewer.clientId, "visual-identity"),
    sectionSources(viewer.clientId, "figma-design-system"),
  ]);
  const figmaConnected = figma.connected.some((c) => c.app === "figma");

  const colors = jsonArray<string>(brandOS?.approvedColors);
  const typography = jsonArray<string>(brandOS?.approvedTypography);

  const countFor = (slug: string) => {
    if (slug === "brand-colours") return colors.length;
    if (slug === "typography") return typography.length;
    const category = CATEGORY_FOR[slug];
    return category ? brandAssets.filter((a) => a.category === category).length : 0;
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Visual identity</h2>
        <p className="text-sm text-muted-foreground">
          The complete visual system — logos, colour, type, photography, and motion.
        </p>
      </div>
      <FigmaDesignSystemSlot
        source={figma.sources.at(-1) ?? null}
        figmaConnected={figmaConnected}
        connected={figma.connected}
        linkedCount={figma.sources.length}
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {VISUAL_IDENTITY_FOLDERS.map((folder, i) => {
          const Icon = ICON_FOR[folder.slug] ?? Shapes;
          const count = countFor(folder.slug);
          return (
            <Link
              key={folder.slug}
              href={`/assets/visual-identity/${folder.slug}`}
              className="animate-in fade-in slide-in-from-bottom-1 duration-300"
              style={{ animationDelay: `${i * 40}ms`, animationFillMode: "backwards" }}
            >
              <Card className="flex flex-col gap-3 p-5 transition-colors hover:border-ink/30">
                <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{folder.label}</p>
                  <p className="text-xs text-muted-foreground">{count} item{count === 1 ? "" : "s"}</p>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
      <Card className="p-6">
        <SourcesRow section="visual-identity" sources={linked.sources} connected={linked.connected} divider={false} />
      </Card>
    </div>
  );
}
