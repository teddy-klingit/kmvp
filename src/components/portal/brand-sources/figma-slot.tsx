import { ExternalLink } from "lucide-react";
import { Card, CardHeader } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { AppIcon } from "@/components/portal/brand-sources/app-icon";
import { ConnectModal } from "@/components/portal/brand-sources/connect-modal";
import { AddSourcePopover, RemoveSourceButton, type ConnectedApp, type SourceChipData } from "@/components/portal/brand-sources/sources-row";

/** Visual identity's "Figma design system" slot: the client's Figma library, or an empty state to link it. */
export function FigmaDesignSystemSlot({ source, figmaConnected, connected, linkedCount }: { source: SourceChipData | null; figmaConnected: boolean; connected: ConnectedApp[]; linkedCount: number }) {
  if (source) {
    // Card (not SectionCard) so nothing inside is clipped.
    return (
      <Card aria-label="Figma design system">
        <CardHeader title="Figma design system" meta={source.isDemo ? <StatusPill>Demo link</StatusPill> : undefined} action={<RemoveSourceButton sourceId={source.id} label="Unlink" />} />
        <div className="flex items-start gap-3 px-6 py-5">
          <AppIcon app="figma" size={20} tile />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 self-start text-[16px] text-brand-ink no-underline hover:underline">
              {source.title}
              <ExternalLink className="size-3.5 text-brand-ink-2" strokeWidth={1.75} />
            </a>
            <span className="text-[13px] leading-[1.5] text-brand-ink-2">Klingit&apos;s designers and agents use this library as the visual reference.</span>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <section aria-label="Figma design system" className="flex flex-col items-start gap-4 rounded-[12px] border border-dashed border-brand-outline px-6 py-5 @min-[560px]/col:flex-row @min-[560px]/col:items-center">
      <AppIcon app="figma" size={20} tile />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[16px] text-brand-ink">Link your Figma library</span>
        <span className="text-[13px] leading-[1.5] text-brand-ink-2">Your components, colours and type styles in one place, so every asset Klingit makes starts from them.</span>
      </div>
      {figmaConnected ? (
        <AddSourcePopover section="figma-design-system" connected={connected.filter((c) => c.app === "figma")} label="Choose library" />
      ) : (
        <ConnectModal app="figma" connected={false} linkedCount={linkedCount} />
      )}
    </section>
  );
}
