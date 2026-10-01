"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_GRID, CHART_AXIS_TICK, CHART_TOOLTIP_STYLE } from "@/lib/chart-theme";
import { ChartLegendDots } from "@/components/portal/chart-legend-dots";

export function CapacityForecastChart({ data }: { data: { week: string; committed: number; available: number }[] }) {
  return (
    <div style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid {...CHART_GRID} />
          <XAxis dataKey="week" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} unit="h" />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          <Legend content={<ChartLegendDots />} />
          <Bar dataKey="committed" stackId="a" fill="var(--purple)" name="Committed" radius={[0, 0, 0, 0]} />
          <Bar dataKey="available" stackId="a" fill="var(--eggshell)" name="Available" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
