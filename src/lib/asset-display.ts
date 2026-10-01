/**
 * Asset titles never repeat the format: the title is what the piece is ("Beach hero"),
 * the subtitle is the format ("Story · 9:16"). Older rows were named "Story 9:16 — beach hero";
 * strip that leading format so they read the same way.
 */
export function assetTitle(name: string, format: string) {
  const prefix = `${format} — `;
  const rest = name.startsWith(prefix) ? name.slice(prefix.length) : name;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** "Story 9:16" → "Story · 9:16", "Banner 300×250" → "Banner · 300×250"; already-dotted formats pass through. */
export function formatLabel(format: string) {
  if (format.includes(" · ")) return format;
  return format.replace(/^(.*?)\s+(\d+\s*[:×x]\s*\d+)$/, (_, kind: string, size: string) => `${kind} · ${size.replace(/\s/g, "").replace("x", "×")}`);
}
