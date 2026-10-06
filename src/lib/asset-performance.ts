/**
 * How an asset's CTR compares, as a label. With the client's own average (the normal case) the tiers are relative
 * to it, so a brand with low CTRs overall still has its top performers; without one, fixed industry-ish bands.
 */
export function performanceTierFor(ctr: number | null, average?: number | null): { label: string; tone: "success" | "info" | "warning" | "danger" | "neutral" } {
  if (ctr === null) return { label: "No data", tone: "neutral" };
  if (average) {
    const r = ctr / average;
    if (r >= 1.3) return { label: "Top performer", tone: "success" };
    if (r >= 1) return { label: "Above avg", tone: "info" };
    if (r >= 0.75) return { label: "Average", tone: "warning" };
    return { label: "Below avg", tone: "danger" };
  }
  if (ctr >= 6.5) return { label: "Top performer", tone: "success" };
  if (ctr >= 4.5) return { label: "Good", tone: "info" };
  if (ctr >= 3) return { label: "Average", tone: "warning" };
  return { label: "Below avg", tone: "danger" };
}
