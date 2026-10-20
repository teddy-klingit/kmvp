import { Chips } from "@/components/insights/source-chip";

const CONF: Record<string, string> = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" };

/** Phase V: what an AI summary is based on: its sources, how much data, and the rule-based confidence. */
export function Basis({ basis, className }: { basis: { sources?: string[]; size?: string; confidence?: string | null } | null; className?: string }) {
  if (!basis?.sources?.length) return null;
  return (
    <span className={`flex flex-wrap items-center gap-1.5 text-[11px] text-brand-ink-2 ${className ?? ""}`}>
      <span className="font-brand-mono uppercase tracking-[0.06em]">Based on</span>
      <Chips sources={basis.sources} />
      {basis.size && <span>{basis.size}</span>}
      <span>· {basis.confidence ? CONF[basis.confidence] : "Not enough data for a confidence label"}</span>
    </span>
  );
}
