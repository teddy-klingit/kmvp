/**
 * No invented numbers: every number an agent puts on the page must be in the data it was given, or a ratio or a
 * percentage change between two of those numbers. Anything else is dropped before it's stored.
 */

/** Every number in a text: "6.1%", "SEK 3,822", "−44%" → 6.1, 3822, -44. */
export function numbersIn(text: string): number[] {
  return [...text.replace(/−/g, "-").matchAll(/-?\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, ""))).filter((n) => Number.isFinite(n));
}

const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.011, Math.abs(b) * 0.012);

/** Whether `n` is in the pool, rounds from it, or is a ratio or % change between two pool numbers. */
export function isGrounded(n: number, pool: number[]): boolean {
  const abs = Math.abs(n);
  if (pool.some((p) => close(abs, Math.abs(p)) || close(abs, Math.round(Math.abs(p))) || close(abs, Math.round(Math.abs(p) * 10) / 10))) return true;
  const small = pool.filter((p) => p !== 0).slice(0, 120);
  for (const a of small)
    for (const b of small) {
      if (a === b) continue;
      if (close(abs, Math.abs(a / b))) return true;
      if (close(abs, Math.abs(((a - b) / b) * 100))) return true;
    }
  return false;
}

/** A text is grounded when every number in it is. */
export const textGrounded = (text: string, pool: number[]) => numbersIn(text).every((n) => isGrounded(n, pool));
