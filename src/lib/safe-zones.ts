/**
 * Where the platform's own UI sits on top of an ad (the "dead areas"), as shares of the image. Meta's guidance:
 * Stories keep the top 14% (profile, progress bar) and the bottom 20% (link sticker, reply) free; Reels the top 14%,
 * the bottom 35% (caption, CTA, audio) and 6% at each side (the like/comment/share column sits in the right one).
 * Feed placements put their UI around the image, not on it, so they have none.
 */
export type SafeZone = { kind: "story" | "reel"; top: number; bottom: number; side: number; label: string };

const STORY: SafeZone = { kind: "story", top: 0.14, bottom: 0.2, side: 0, label: "Stories: top 14% and bottom 20%" };
const REEL: SafeZone = { kind: "reel", top: 0.14, bottom: 0.35, side: 0.06, label: "Reels: top 14%, bottom 35% and 6% at the sides" };

/** The safe zone for a format ("Story 9:16", "Reel / video", "9:16 for Stories/Reels") or a width ÷ height ratio. */
export function safeZoneFor(format: string | number | null | undefined): SafeZone | null {
  if (typeof format === "number") return format < 0.7 ? STORY : null;
  const f = (format ?? "").toLowerCase();
  if (/reel|tiktok/.test(f)) return REEL;
  if (/story|stories|9:16|portrait/.test(f)) return STORY;
  return null;
}

/** The instruction an image prompt gets for a format with dead areas (empty for one without). */
export function safeZonePrompt(format: string | null | undefined): string {
  const z = safeZoneFor(format);
  if (!z) return "";
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return `LAYOUT (platform safe zone, ${z.kind}): the platform's UI covers the top ${pct(z.top)} and the bottom ${pct(z.bottom)}${z.side ? ` and ${pct(z.side)} at each side` : ""} of the frame. Keep every word, the logo, the call to action and the product's key details inside the area between them; let only background, texture or sky run into those bands.`;
}
