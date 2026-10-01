"use client";

import { Pie, PieChart, ResponsiveContainer, Cell, Tooltip } from "recharts";
import { CHART_SERIES_COLORS, CHART_TOOLTIP_STYLE } from "@/lib/chart-theme";

const COLORS = CHART_SERIES_COLORS;

export { COLORS as MIX_DONUT_COLORS };

export function MixDonutChart({
  data,
  centerLabel,
  centerValue,
}: {
  data: { name: string; value: number }[];
  centerLabel: string;
  centerValue: string;
}) {
  return (
    <div className="relative" style={{ height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="90%" paddingAngle={3} startAngle={90} endAngle={-270} stroke="none">
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value, name) => [value, name]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="font-display text-xl font-light">{centerValue}</p>
        <p className="text-[11px] text-muted-foreground">{centerLabel}</p>
      </div>
    </div>
  );
}
