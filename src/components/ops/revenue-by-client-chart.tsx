"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_GRID, CHART_AXIS_TICK, CHART_TOOLTIP_STYLE } from "@/lib/chart-theme";
import { BarFadeDefs, barFadeUrl } from "@/components/portal/bar-fade";

export function RevenueByClientChart({ data }: { data: { client: string; revenue: number }[] }) {
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <BarFadeDefs data={data} dataKey="revenue" idPrefix="rev" />
          <CartesianGrid {...CHART_GRID} />
          <XAxis dataKey="client" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value) => [`€${value}`, "Revenue"]} />
          <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={barFadeUrl(i, "rev")} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
