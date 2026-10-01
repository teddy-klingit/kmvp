"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_GRID, CHART_AXIS_TICK, CHART_TOOLTIP_STYLE } from "@/lib/chart-theme";
import { BarFadeDefs, barFadeUrl } from "@/components/portal/bar-fade";

export function CtrByFormatChart({ data, dataKey = "format" }: { data: Record<string, string | number>[]; dataKey?: string }) {
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <BarFadeDefs data={data} dataKey="ctr" idPrefix="ctr" />
          <CartesianGrid {...CHART_GRID} />
          <XAxis dataKey={dataKey} tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} unit="%" />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value) => [`${value}%`, "CTR"]} />
          <Bar dataKey="ctr" radius={[6, 6, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={barFadeUrl(i, "ctr")} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
