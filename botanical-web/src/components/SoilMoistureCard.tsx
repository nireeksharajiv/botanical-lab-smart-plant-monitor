"use client";

import React from "react";

interface SoilMoistureCardProps {
  soilPct?: number | null;
  hasReading?: boolean;
}

// Determine moisture status badge text based on percentage
function getMoistureStatus(pct: number): "Dry" | "Good" | "Wet" {
  if (pct < 30) return "Dry";
  if (pct > 70) return "Wet";
  return "Good";
}

export default function SoilMoistureCard({
  soilPct = null,
  hasReading = true,
}: SoilMoistureCardProps) {
  const isCalibrated = hasReading && soilPct !== null;
  const status = isCalibrated ? getMoistureStatus(soilPct) : null;

  return (
    <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-2xl p-6 shadow-xs flex flex-col justify-between">
      {/* Card Header Label: medium green #15803D */}
      <span className="text-xs font-semibold tracking-wider text-[#15803D] uppercase">
        Soil Moisture
      </span>

      {/* Main Metric & Status Badge */}
      <div className="my-5 flex items-baseline justify-between gap-3">
        {!hasReading ? (
          <>
            <div className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-400">
              --
            </div>
            {/* Gray No data badge on white background with green border */}
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-white text-gray-500 border border-[#BBF7D0]">
              No data
            </span>
          </>
        ) : isCalibrated ? (
          <>
            {/* Big number: dark gray-green #14532D */}
            <div className="text-4xl sm:text-5xl font-bold tracking-tight text-[#14532D]">
              {soilPct}%
            </div>
            {/* Status badge: white background with green border and dark green text */}
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium bg-white border ${
                status === "Good"
                  ? "text-[#14532D] border-[#BBF7D0]"
                  : status === "Dry"
                  ? "text-amber-800 border-amber-300"
                  : "text-[#14532D] border-[#BBF7D0]"
              }`}
            >
              {status}
            </span>
          </>
        ) : (
          <div className="text-2xl font-medium text-gray-400">
            Not calibrated
          </div>
        )}
      </div>

      {/* Horizontal Progress Bar: track #DCFCE7, fill #16A34A */}
      <div className="w-full bg-[#DCFCE7] rounded-full h-2.5 overflow-hidden">
        <div
          className="bg-[#16A34A] h-2.5 rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${isCalibrated && soilPct !== null ? Math.min(Math.max(soilPct, 0), 100) : 0}%`,
          }}
        />
      </div>
    </div>
  );
}
