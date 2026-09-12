"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const INK = "#1B1140";

/** Shows "12 Mar" rather than the ISO day the query returns. */
const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function PlaysChart({ data }: { data: { day: string; plays: number }[] }) {
  return (
    <div className="mt-3 rounded-2xl bg-card p-3 [border:var(--border-thick)]">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={INK} strokeOpacity={0.12} vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={shortDay}
            tick={{ fontSize: 11, fontWeight: 700, fill: INK }}
            stroke={INK}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fontWeight: 700, fill: INK }} stroke={INK} />
          <Tooltip
            cursor={{ fill: INK, fillOpacity: 0.06 }}
            labelFormatter={(v) => shortDay(String(v))}
            formatter={(v) => [`${v}`, "plays"] as [string, string]}
            contentStyle={{
              border: `2.5px solid ${INK}`,
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 12,
            }}
            // Recharts colours the tooltip row to match the bar by default,
            // which here is lemon on white — unreadable.
            itemStyle={{ color: INK, fontWeight: 700 }}
            labelStyle={{ color: INK, fontWeight: 800 }}
          />
          <Bar dataKey="plays" fill="#D7FF4A" stroke={INK} strokeWidth={2.5} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
