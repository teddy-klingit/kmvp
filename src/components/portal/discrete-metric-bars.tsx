"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList } from "recharts";
import { CHART_AXIS_TICK, CHART_TOOLTIP_STYLE } from "@/lib/chart-theme";
import { BarFadeDefs, barFadeUrl } from "@/components/portal/bar-fade";

/** For a metric that's genuinely reported once per period (e.g. a manual
 * monthly business outcome) — discrete bars with the value labeled on top,
 * rather than a continuous line that would imply daily granularity that
 * doesn't exist. */
export function DiscreteMetricBars({ data, label }: { data: { period: string; value: number }[]; label: string }) {
  return (
    <div style={{ height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
          <BarFadeDefs data={data} dataKey="value" idPrefix="dmb" />
          <XAxis dataKey="period" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value) => [Number(value ?? 0).toLocaleString(), label]} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {data.map((_, i) => (
              <Cell key={i} fill={barFadeUrl(i, "dmb")} />
            ))}
            <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: "var(--ink)" }} formatter={(v) => Number(v ?? 0).toLocaleString()} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
