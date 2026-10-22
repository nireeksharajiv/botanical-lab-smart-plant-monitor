"use client";

import React, { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { SoilHistoryPoint } from "@/lib/types";

interface SoilHistoryChartProps {
  data: SoilHistoryPoint[];
}

// Custom minimal tooltip styled with white background and soft green border
function MinimalTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-[#BBF7D0] shadow-sm rounded-lg px-2.5 py-1.5 text-xs text-[#14532D]">
        <span className="font-semibold">{payload[0].value}%</span>
        <span className="text-[#15803D]/70 ml-1.5">{label}</span>
      </div>
    );
  }
  return null;
}

export default function SoilHistoryChart({ data }: SoilHistoryChartProps) {
  // Ensure chart renders client-side to prevent SSR layout mismatch
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const hasData = data && data.length > 0;

  return (
    <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-2xl p-6 shadow-xs">
      {/* Header Label: medium green #15803D */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold tracking-wider text-[#15803D] uppercase">
          Soil Moisture (24h)
        </span>
        {!hasData && (
          <span className="text-xs font-medium text-gray-400">
            No history yet
          </span>
        )}
      </div>

      {/* Minimal Line Chart: stroke #16A34A, grid lines #DCFCE7 */}
      <div className="h-56 sm:h-64 w-full relative">
        {isMounted ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={hasData ? data : [{ time: "", soil_pct: 0 }]}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid stroke="#DCFCE7" vertical={false} />
              <XAxis
                dataKey="time"
                stroke="#15803D"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                dy={6}
              />
              <YAxis
                domain={[0, 100]}
                stroke="#15803D"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `${val}%`}
                ticks={[0, 25, 50, 75, 100]}
              />
              {hasData && <Tooltip content={<MinimalTooltip />} />}
              {hasData && (
                <Line
                  type="monotone"
                  dataKey="soil_pct"
                  stroke="#16A34A"
                  strokeWidth={2.5}
                  dot={{ r: 2.5, fill: "#16A34A" }}
                  activeDot={{
                    r: 5,
                    fill: "#16A34A",
                    stroke: "#F0FDF4",
                    strokeWidth: 3,
                  }}
                  isAnimationActive={true}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
            Loading chart...
          </div>
        )}
      </div>
    </div>
  );
}
