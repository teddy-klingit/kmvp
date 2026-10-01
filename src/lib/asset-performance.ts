export function performanceTierFor(ctr: number | null): { label: string; tone: "success" | "info" | "warning" | "danger" | "neutral" } {
  if (ctr === null) return { label: "No data", tone: "neutral" };
  if (ctr >= 6.5) return { label: "Top performer", tone: "success" };
  if (ctr >= 4.5) return { label: "Good", tone: "info" };
  if (ctr >= 3) return { label: "Average", tone: "warning" };
  return { label: "Below avg", tone: "danger" };
}
