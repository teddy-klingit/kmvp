import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card, CardHeader, SectionCard } from "@/components/ds/card";
import { PageGrid } from "@/components/ds/page-grid";
import { jsonArray } from "@/lib/utils";
import { typefaces } from "@/lib/brand-typography";
import { VISUAL_IDENTITY_FOLDERS, VISUAL_IDENTITY_CATEGORY as CATEGORY_FOR } from "@/lib/brand-iq-taxonomy";
import { Palette, Type, Image as ImageIcon, Shapes, Grid3x3, Video, Sparkles } from "lucide-react";
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
  const typography = typefaces(brandOS?.approvedTypography);

  const countFor = (slug: string) => {
    if (slug === "brand-colours") return colors.length;
    if (slug === "typography") return typography.length;
    const category = CATEGORY_FOR[slug];
    return category ? brandAssets.filter((a) => a.category === category).length : 0;
  };

  return (
    <PageGrid
      main={
        <>
          <FigmaDesignSystemSlot
            source={figma.sources.at(-1) ?? null}
            figmaConnected={figmaConnected}
            connected={figma.connected}
            linkedCount={figma.sources.length}
          />
          <SectionCard title="Visual identity" action={<span className="text-[12px] text-brand-ink-2">{VISUAL_IDENTITY_FOLDERS.length} folders</span>}>
            <ul className="m-0 grid list-none grid-cols-2 gap-3 px-6 py-5 @min-[560px]/col:grid-cols-3">
              {VISUAL_IDENTITY_FOLDERS.map((folder, i) => {
                const Icon = ICON_FOR[folder.slug] ?? Shapes;
                const count = countFor(folder.slug);
                return (
                  <li key={folder.slug} className="animate-in fade-in slide-in-from-bottom-1 duration-300" style={{ animationDelay: `${i * 40}ms`, animationFillMode: "backwards" }}>
                    <Link
                      href={`/assets/visual-identity/${folder.slug}`}
                      className="flex h-full flex-col gap-3 rounded-[10px] bg-brand-chip p-4 text-brand-ink no-underline transition-colors hover:bg-brand-line"
                    >
                      <span className="flex size-9 items-center justify-center rounded-[8px] bg-white text-brand-ink">
                        <Icon className="size-[18px]" />
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span className="text-[15px]">{folder.label}</span>
                        <span className="font-brand-mono text-[11px] text-brand-ink-2">
                          {count} ITEM{count === 1 ? "" : "S"}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        </>
      }
      side={
        // Card (not SectionCard): the add-source popover must not be clipped.
        <Card aria-label="Sources">
          <CardHeader title="Sources" />
          <div className="px-6 py-5">
            <SourcesRow section="visual-identity" sources={linked.sources} connected={linked.connected} divider={false} />
          </div>
        </Card>
      }
    />
  );
}
