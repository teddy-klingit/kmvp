/** A tab's filter chips (Phase X: the period sits in the tab header, InsightsHeader). */
export function SubBar({ chips }: { chips: React.ReactNode }) {
  if (!chips) return null;
  return <div className="flex min-w-0 flex-wrap items-center gap-3">{chips}</div>;
}
