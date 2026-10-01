"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

export function Sparkline({ data, color = "var(--purple)" }: { data: { value: number }[]; color?: string }) {
  return (
    <div style={{ width: 64, height: 28 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
