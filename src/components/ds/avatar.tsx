import { cn } from "@/lib/utils";

const PALETTE = ["#D9772B", "#2F7F7A", "#B98A16", "#B0384C", "#6D5BD0", "#3B6FB6"];

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
}: {
  name: string;
  size?: number;
  className?: string;
  ring?: boolean;
  /** Only AvatarStack sets this, to keep neighbours apart. */
  color?: string;
}) {
  return (
    <span
      title={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        ring && "border-2 border-white",
        className
      )}
      style={{ width: size, height: size, backgroundColor: color ?? colorFor(name), fontSize: size >= 36 ? 12 : 11 }}
    >
      {initials(name)}
    </span>
  );
}

/** Overlapping avatars (-8px), each with a white ring. No two in one stack share a colour. */
export function AvatarStack({ names, size = 26, max = 4 }: { names: string[]; size?: number; max?: number }) {
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
        <Avatar key={`${n}-${i}`} name={n} size={size} ring color={colors[i]} className={i > 0 ? "-ml-2" : undefined} />
      ))}
    </span>
  );
}
