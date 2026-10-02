import { cn } from "@/lib/utils";

/** No orange (reserved for "your action"), and every colour keeps white initials readable (≥ 4.5:1). */
const PALETTE = ["#6B7A2E", "#2F7F7A", "#8F6C0F", "#B0384C", "#6D5BD0", "#3B6FB6"];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** FNV-1a: spreads our short "First L." display names across the palette better than a ×31 hash. */
function paletteIndex(name: string) {
  let h = 2166136261;
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h % PALETTE.length;
}

function colorFor(name: string) {
  return PALETTE[paletteIndex(name)];
}

/** Initials on a deterministic colour — the same person always gets the same colour. */
export function Avatar({
  name,
  size = 28,
  className,
  ring = false,
  color,
  style,
}: {
  name: string;
  size?: number;
  className?: string;
  ring?: boolean;
  /** Only AvatarStack sets this, to keep neighbours apart. */
  color?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      title={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        ring && "border-2 border-white",
        className
      )}
      style={{ width: size, height: size, backgroundColor: color ?? colorFor(name), fontSize: size >= 36 ? 12 : 11, ...style }}
    >
      {initials(name)}
    </span>
  );
}

/**
 * Overlapping avatars, each with a 2px white ring. They overlap by 6px (the calm dashboard uses 4px) and each one sits above the next,
 * so only the right edge of a ring is covered, never its initials. No two in one stack share a colour.
 */
export function AvatarStack({ names, size = 26, max = 4, overlap = 6 }: { names: string[]; size?: number; max?: number; /** px each avatar tucks under the previous one. */ overlap?: number }) {
  const shown = names.slice(0, max);
  const used = new Set<number>();
  const colors = shown.map((n) => {
    let i = paletteIndex(n);
    for (let step = 0; step < PALETTE.length && used.has(i); step++) i = (i + 1) % PALETTE.length;
    used.add(i);
    return PALETTE[i];
  });
  return (
    <span className="flex">
      {shown.map((n, i) => (
        <Avatar
          key={`${n}-${i}`}
          name={n}
          size={size}
          ring
          color={colors[i]}
          className="relative box-content"
          style={{ zIndex: shown.length - i, marginLeft: i > 0 ? -overlap : undefined }}
        />
      ))}
    </span>
  );
}
