"use client";

import React from "react";
import { Sun, Moon } from "lucide-react";

interface LightCardProps {
  lightState?: string | null;
  hasReading?: boolean;
}

export default function LightCard({
  lightState = null,
  hasReading = true,
}: LightCardProps) {
  const isBright = lightState === "BRIGHT";

  return (
    <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-2xl p-6 shadow-xs flex flex-col justify-between">
      {/* Card Header Label: medium green #15803D */}
      <span className="text-xs font-semibold tracking-wider text-[#15803D] uppercase">
        Light
      </span>

      {/* Sun/Moon Icon + Status Text */}
      <div className="my-3 flex items-center gap-3">
        {!hasReading ? (
          <>
            <Sun className="w-8 h-8 text-gray-300 stroke-[2]" />
            <span className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-400">
              --
            </span>
          </>
        ) : isBright ? (
          <>
            {/* Icon: primary green #16A34A */}
            <Sun className="w-8 h-8 text-[#16A34A] stroke-[2]" />
            {/* Value: dark gray-green #14532D */}
            <span className="text-3xl sm:text-4xl font-bold tracking-tight text-[#14532D]">
              Bright
            </span>
          </>
        ) : (
          <>
            <Moon className="w-8 h-8 text-[#16A34A] stroke-[2]" />
            <span className="text-3xl sm:text-4xl font-bold tracking-tight text-[#14532D]">
              Dark
            </span>
          </>
        )}
      </div>
    </div>
  );
}
