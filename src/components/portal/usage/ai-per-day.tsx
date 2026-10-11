"use client";

import { useState } from "react";
import { ColumnChart, Legend } from "@/components/insights/charts";
import { cn } from "@/lib/utils";

const USED = "#B455B6";
const FORECAST = "#E7C9E8";

/** Usage → AI credits per day: used (purple) and the forecast (light purple); this month, last month or 12 months. */
export function AiPerDay({ perDay, lastMonth, months, footer, method }: { perDay: { day: number; used: number; forecast: number }[]; lastMonth: { day: number; used: number }[]; months: { label: string; used: number }[]; footer: React.ReactNode; method: string }) {
  const [tab, setTab] = useState<"month" | "last" | "year">("month");
  const data =
    tab === "month"
      ? perDay.map((d) => ({ x: String(d.day), values: [d.used, d.forecast] }))
      : tab === "last"
        ? lastMonth.map((d) => ({ x: String(d.day), values: [d.used, 0] }))
        : months.map((m) => ({ x: m.label, values: [m.used, 0] }));
  return (
    <section aria-label="AI credits per day" className="overflow-hidden rounded-[12px] bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-brand-line px-6 py-5">
        <h2 className="m-0 flex-1 text-[18px] font-normal">{tab === "year" ? "AI credits per month" : "AI credits per day"}</h2>
        <div role="tablist" className="flex gap-1 rounded-full bg-[var(--seg-track)] p-1">
          {(
            [
              ["month", "This month"],
              ["last", "Last month"],
              ["year", "12 months"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("h-9 rounded-full px-4 text-[14px]", tab === k ? "bg-brand-ink text-white" : "hover:bg-black/5")}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3 px-6 py-5">
        <span title={method} className="self-start">
          <Legend
            items={[
              { label: "Used", color: USED },
              ...(tab === "month" ? [{ label: "Forecast", color: FORECAST }] : []),
            ]}
          />
        </span>
        <ColumnChart data={data} series={[{ name: "Used", color: USED }, { name: "Forecast", color: FORECAST }]} height={200} xEvery={tab === "year" ? 1 : 5} />
        {tab === "month" && footer}
      </div>
    </section>
  );
}
