import { ExternalLink } from "lucide-react";
import { Card } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { AppIcon } from "@/components/portal/brand-sources/app-icon";
import { ConnectModal } from "@/components/portal/brand-sources/connect-modal";
import { AddSourcePopover, RemoveSourceButton, type ConnectedApp, type SourceChipData } from "@/components/portal/brand-sources/sources-row";

/** Visual identity's "Figma design system" slot: the client's Figma library, or an empty state to link it. */
export function FigmaDesignSystemSlot({ source, figmaConnected, connected, linkedCount }: { source: SourceChipData | null; figmaConnected: boolean; connected: ConnectedApp[]; linkedCount: number }) {
  if (source) {
    return (
      <Card aria-label="Figma design system" className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <AppIcon app="figma" size={22} tile />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[12px] font-medium text-ds-text-2">Figma design system</span>
          <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[16px] font-semibold text-ds-text no-underline hover:underline">
            {source.title}
            <ExternalLink className="size-3.5 text-ds-text-3" strokeWidth={1.75} />
          </a>
          <span className="text-[13px] text-ds-text-2">Klingit&apos;s designers and agents use this library as the visual reference.</span>
        </div>
        <div className="flex items-center gap-2">
          {source.isDemo && <StatusPill>Demo link</StatusPill>}
          <RemoveSourceButton sourceId={source.id} label="Unlink" />
        </div>
      </Card>
    );
  }
  return (
    <Card aria-label="Figma design system" className="flex flex-col items-start gap-4 border-dashed p-5 sm:flex-row sm:items-center">
      <AppIcon app="figma" size={22} tile />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[16px] font-semibold text-ds-text">Link your Figma library</span>
        <span className="text-[13px] text-ds-text-2">Your components, colours and type styles in one place, so every asset Klingit makes starts from them.</span>
      </div>
      {figmaConnected ? (
        <AddSourcePopover section="figma-design-system" connected={connected.filter((c) => c.app === "figma")} label="Choose library" />
      ) : (
        <ConnectModal app="figma" connected={false} linkedCount={linkedCount} />
      )}
    </Card>
  );
}
