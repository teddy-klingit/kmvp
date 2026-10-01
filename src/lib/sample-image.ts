/**
 * Deterministic placeholder photography for a pitch/demo client's seeded
 * content — generic stock-style imagery (Lorem Picsum), never a real brand's
 * trademarked assets. Seeded by id so the same post always gets the same
 * image across reloads instead of a random one on every render.
 */
export function sampleImageUrl(seed: string, size = 200) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${size}/${size}`;
}
