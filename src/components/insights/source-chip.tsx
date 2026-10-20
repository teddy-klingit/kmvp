import { sourceLabel } from "@/lib/revenue-labels";
import { cn } from "@/lib/utils";

/** Phase V: a source on a chip (Meta · Shopify · HubSpot · Klaviyo · Planner · Output library · GA4), so every number shows where it came from. */
const CHIP: Record<string, string> = {
  Meta: "bg-[#E4EAF6] text-[#3B6FB6]",
  Google: "bg-[#EEF2DF] text-[#5E6B2A]",
  Klaviyo: "bg-brand-chip text-brand-ink",
  Shopify: "bg-[#E4F2B3] text-[#5E6B2A]",
  HubSpot: "bg-[#FEECE5] text-[#B8460F]",
  GA4: "bg-[#FDF3D8] text-[#8A6A12]",
  Offline: "bg-brand-chip text-brand-ink",
  TikTok: "bg-brand-chip text-brand-ink",
  LinkedIn: "bg-[#E4EAF6] text-[#3B6FB6]",
  Planner: "bg-brand-chip text-brand-ink",
  "Output library": "bg-[#F8DCF9] text-[#8E3A90]",
};
const MONO: Record<string, string> = { Meta: "M", Google: "G", Klaviyo: "K", Shopify: "S", HubSpot: "H", GA4: "GA", Offline: "U", TikTok: "TT", LinkedIn: "in", Planner: "P", "Output library": "O" };

export function SourceChip({ source }: { source: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-[11px]", CHIP[source] ?? "bg-brand-chip text-brand-ink")}>
      <span className="font-brand-mono text-[9px] font-semibold">{MONO[source] ?? source[0]}</span>
      {sourceLabel(source)}
    </span>
  );
}
export const Chips = ({ sources }: { sources: string[] }) => (
  <span className="flex flex-wrap gap-1.5">
    {[...new Set(sources)].map((s) => (
      <SourceChip key={s} source={s} />
    ))}
  </span>
);

