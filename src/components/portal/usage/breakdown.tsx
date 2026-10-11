"use client";

import { useState } from "react";
import { BarList } from "@/components/insights/charts";
import { cn } from "@/lib/utils";

export type BreakdownRow = { key: string; label: string; sub?: string; value: number; tone?: "skill" | "assistant" | "other" | "held" };
const COLOR: Record<string, string> = { skill: "#B455B6", assistant: "#D9A7DA", other: "#C4C4C4", held: "#C4C4C4", team: "#1E1E1E" };

/** Usage → "Where … credits go": one bar per row, tabs for the breakdown, the totals underneath. */
export function Breakdown({ title, meta, tabs, kind, footer }: { title: string; meta: string; tabs: { label: string; rows: BreakdownRow[] }[]; kind: "ai" | "team"; footer?: React.ReactNode }) {
  const [tab, setTab] = useState(0);
  const rows = tabs[tab]?.rows ?? [];
  const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString("en-GB");
  return (
    <section aria-label={title} className="overflow-hidden rounded-[12px] bg-white">
      <div className="flex items-center gap-3 border-b border-brand-line px-6 py-5">
        <h2 className="m-0 flex-1 text-[18px] font-normal">{title}</h2>
        <span className="font-brand-mono text-[12px] uppercase text-brand-ink">{meta}</span>
      </div>
      <div className="flex flex-col gap-4 px-6 py-5">
        <div role="tablist" className="flex flex-wrap gap-1.5">
          {tabs.map((t, i) => (
            <button key={t.label} type="button" role="tab" aria-selected={tab === i} onClick={() => setTab(i)} className={cn("h-8 rounded-full px-3 text-[13px]", tab === i ? "bg-brand-ink text-white" : "bg-brand-chip hover:bg-brand-line")}>
              {t.label}
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="m-0 text-[14px] text-brand-ink-2">Nothing used yet this month.</p>
        ) : (
          <BarList labelWidth={170} rows={rows.map((r) => ({ label: r.label, sub: r.sub, value: r.value, display: fmt(r.value), color: kind === "team" && r.tone !== "held" ? COLOR.team : COLOR[r.tone ?? "skill"] }))} />
        )}
        {footer}
      </div>
    </section>
  );
}
