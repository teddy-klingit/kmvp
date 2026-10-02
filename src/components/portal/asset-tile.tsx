import { StatusPill, type PillTone } from "@/components/ds/status-pill";
import { performanceTierFor } from "@/lib/asset-performance";
import { assetTitle, formatLabel } from "@/lib/asset-display";

const TIER_TONE: Record<string, PillTone> = { success: "success", info: "neutral", warning: "watch", danger: "danger", neutral: "neutral" };

/** A delivered asset: its real name (assetTitle(), never "Static 1:1 / Static 1:1"), format and project, plus its measured CTR when there is one. */
export function AssetTile({
  name,
  format,
  color,
  ctr,
  campaign,
  fileUrl,
}: {
  name: string;
  format: string;
  color: string;
  ctr: number | null;
  campaign?: string;
  fileUrl?: string | null;
}) {
  const tier = performanceTierFor(ctr);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="relative flex aspect-square flex-col justify-between overflow-hidden rounded-[12px] p-3" style={fileUrl ? undefined : { backgroundColor: `color-mix(in srgb, ${color} 18%, white)` }}>
        {fileUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl} alt="" className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          </>
        )}
        {ctr !== null && (
          <div className="relative flex items-start justify-between gap-2">
            <StatusPill tone={TIER_TONE[tier.tone]}>{tier.label}</StatusPill>
            <span className="rounded-full bg-white/85 px-2 py-0.5 text-[12px] tabular-nums text-brand-ink">{ctr}% CTR</span>
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="m-0 truncate text-[15px]">{assetTitle(name, format)}</p>
        <p className="m-0 truncate text-[12px] text-brand-ink-2">{[formatLabel(format), campaign].filter(Boolean).join(" · ")}</p>
      </div>
    </div>
  );
}
