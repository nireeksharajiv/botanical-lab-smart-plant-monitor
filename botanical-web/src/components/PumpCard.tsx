"use client";

import React from "react";

interface PumpCardProps {
  pumpOn?: boolean;
  mode?: string | null;
  deviceOnline?: boolean;
  hasReading?: boolean;
  onWaterNow: () => void;
}

export default function PumpCard({
  pumpOn = false,
  mode = "NORMAL",
  deviceOnline = false,
  hasReading = true,
  onWaterNow,
}: PumpCardProps) {
  // Button is enabled ONLY when a reading exists AND device is online
  const isButtonEnabled = hasReading && deviceOnline;

  return (
    <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-2xl p-6 shadow-xs flex flex-col justify-between">
      {/* Card Header & Status Badges */}
      <div className="flex items-center justify-between gap-2">
        {/* Card Header Label: medium green #15803D */}
        <span className="text-xs font-semibold tracking-wider text-[#15803D] uppercase">
          Pump
        </span>

        {/* State and Mode Badges: white background with green border */}
        <div className="flex items-center gap-2">
          {!hasReading ? (
            <>
              {/* Gray No data and -- badges stay neutral gray on white so empty states look empty */}
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-white text-gray-500 border border-[#BBF7D0]">
                No data
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-white text-gray-400 border border-[#BBF7D0]">
                --
              </span>
            </>
          ) : (
            <>
              {/* Pump Status badge: white background, green border, dark green text */}
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-white text-[#14532D] border border-[#BBF7D0]">
                {pumpOn ? "Watering" : "Off"}
              </span>

              {/* Mode badge: white background, green border, dark green text */}
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-white text-[#14532D] border border-[#BBF7D0]">
                {mode === "LOW_WATER" ? "Low water" : "Normal"}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Action Button */}
      <div className="mt-5">
        {isButtonEnabled ? (
          <button
            type="button"
            onClick={onWaterNow}
            className="w-full py-3 px-4 rounded-xl bg-[#16A34A] text-white font-medium hover:bg-[#15803D] active:scale-[0.99] transition-all duration-150 shadow-xs cursor-pointer text-center text-sm"
          >
            Water now
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="w-full py-3 px-4 rounded-xl bg-[#DCFCE7] text-[#14532D]/70 border border-[#BBF7D0] font-medium cursor-not-allowed text-center text-sm"
          >
            Unavailable
          </button>
        )}
      </div>
    </div>
  );
}
