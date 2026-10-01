import { Badge } from "@/components/ui/badge";
import { performanceTierFor } from "@/lib/asset-performance";

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
    <div className="flex flex-col gap-2">
      <div className="relative flex aspect-square flex-col justify-between overflow-hidden rounded-xl p-3" style={fileUrl ? undefined : { backgroundColor: color }}>
        {fileUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl} alt="" className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
          </>
        )}
        <div className="relative flex items-start justify-between">
          <Badge tone={tier.tone}>{tier.label}</Badge>
          {ctr !== null && (
            <span className="rounded-full bg-black/40 px-2 py-0.5 text-xs font-semibold text-white">{ctr}% CTR</span>
          )}
        </div>
        <span className="relative text-xs font-medium text-white/90">{format}</span>
      </div>
      <div>
        <p className="truncate text-sm font-medium">{format}</p>
        {campaign && <p className="truncate text-xs text-muted-foreground">{campaign}</p>}
      </div>
    </div>
  );
}
