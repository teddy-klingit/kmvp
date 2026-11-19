import { cn } from "@/lib/utils";

/**
 * A brand as logo + name everywhere on Insights (Phase X 2b): the logo stored from the brand's website in Edit
 * competitors, else a coloured monogram. The client's own brand is a black mark with a "You" pill.
 */
const MONOGRAM = ["#C8755A", "#3F87A6", "#9A7B4F", "#6F8A5E", "#8E6BA8", "#B0656F", "#5E7F94"];

export function monogramColor(name: string) {
  let h = 0;
  for (const c of name.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return MONOGRAM[h % MONOGRAM.length];
}

export function BrandLogo({ name, logo, you, size = 24, className }: { name: string; logo?: string | null; you?: boolean; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) };
  if (logo && !you)
    // eslint-disable-next-line @next/next/no-img-element -- a stored favicon, already small
    return <img src={logo} alt="" width={size} height={size} style={style} className={cn("shrink-0 rounded-full bg-white object-contain ring-1 ring-brand-line", className)} />;
  return (
    <span aria-hidden style={{ ...style, background: you ? "#1E1E1E" : monogramColor(name) }} className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white", className)}>
      {you ? (name.trim()[0] ?? "?") : (name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

export function BrandMark({ name, logo, you, size = 24, className, nameClassName }: { name: string; logo?: string | null; you?: boolean; size?: number; className?: string; nameClassName?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <BrandLogo name={name} logo={logo} you={you} size={size} />
      <span className={cn("truncate", you && !nameClassName && "font-medium", nameClassName)}>{name}</span>
      {you && <span className="rounded-full bg-brand-ink px-2 py-0.5 text-[11px] text-white">You</span>}
    </span>
  );
}

/** A brand's rank in an AI answer: logo + rank chip; the client's own is outlined in black. */
export function RankChip({ name, logo, rank, you }: { name: string; logo?: string | null; rank: number; you?: boolean }) {
  return (
    <span title={name} className={cn("inline-flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 text-[12px] tabular-nums", you ? "bg-white ring-2 ring-brand-ink" : "bg-transparent")}>
      <BrandLogo name={name} logo={logo} you={you} size={18} />
      {rank}
    </span>
  );
}
