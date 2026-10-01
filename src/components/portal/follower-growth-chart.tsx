"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, CartesianGrid } from "recharts";
import { CHART_GRID, CHART_AXIS_TICK, CHART_TOOLTIP_STYLE, CHART_SERIES_COLORS, chartDot } from "@/lib/chart-theme";
import { ChartLegendDots } from "@/components/portal/chart-legend-dots";

/** One shaded area per platform, sharing a common date axis — data is a
 * wide-format array of { date, [platform]: count } rows so Recharts can
 * plot every series in one chart with a legend distinguishing them. */
export function FollowerGrowthChart({ data, platforms }: { data: Record<string, string | number>[]; platforms: string[] }) {
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {platforms.map((platform, i) => (
              <linearGradient key={platform} id={`fg-${platform}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length]} stopOpacity={0.28} />
                <stop offset="100%" stopColor={CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid {...CHART_GRID} />
          <XAxis dataKey="date" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => v.toLocaleString()} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value) => Number(value ?? 0).toLocaleString()} />
          <Legend content={<ChartLegendDots />} />
          {platforms.map((platform, i) => (
            <Area
              key={platform}
              type="monotone"
              dataKey={platform}
              name={platform}
              stroke={CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length]}
              strokeWidth={2.5}
              fill={`url(#fg-${platform})`}
              dot={chartDot(CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length])}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
