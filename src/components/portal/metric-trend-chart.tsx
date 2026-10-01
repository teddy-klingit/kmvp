"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_GRID, CHART_AXIS_TICK, CHART_TOOLTIP_STYLE, chartDot } from "@/lib/chart-theme";

export function MetricTrendChart({ data, label }: { data: { date: string; value: number }[]; label: string }) {
  return (
    <div style={{ height: 120 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid {...CHART_GRID} />
          <XAxis dataKey="date" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} width={32} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value) => [value, label]} />
          <Line type="monotone" dataKey="value" stroke="var(--purple)" strokeWidth={2.5} dot={chartDot("var(--purple)")} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
