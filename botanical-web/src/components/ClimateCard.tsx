"use client";

import React from "react";
import { Thermometer, Droplets } from "lucide-react";

interface ClimateCardProps {
  temperatureC?: number | null;
  humidityPct?: number | null;
  hasReading?: boolean;
}

export default function ClimateCard({
  temperatureC = null,
  humidityPct = null,
  hasReading = true,
}: ClimateCardProps) {
  return (
    <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-2xl p-6 shadow-xs flex flex-col justify-between">
      {/* Card Header Label: medium green #15803D */}
      <span className="text-xs font-semibold tracking-wider text-[#15803D] uppercase">
        Climate
      </span>

      {/* Temperature & Humidity Side by Side */}
      <div className="mt-4 grid grid-cols-2 gap-4 divide-x divide-[#BBF7D0]">
        {/* Temperature Column */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[#15803D] text-xs font-medium">
            {/* Icon: primary green #16A34A */}
            <Thermometer className="w-3.5 h-3.5 text-[#16A34A]" />
            <span>Temp</span>
          </div>
          {/* Big number: dark gray-green #14532D or -- */}
          <div
            className={`text-3xl sm:text-4xl font-bold tracking-tight ${
              hasReading && temperatureC !== null
                ? "text-[#14532D]"
                : "text-gray-400"
            }`}
          >
            {hasReading && temperatureC !== null ? `${temperatureC}°C` : "--"}
          </div>
        </div>

        {/* Humidity Column */}
        <div className="flex flex-col gap-1 pl-4 sm:pl-6">
          <div className="flex items-center gap-1.5 text-[#15803D] text-xs font-medium">
            {/* Icon: primary green #16A34A */}
            <Droplets className="w-3.5 h-3.5 text-[#16A34A]" />
            <span>Humidity</span>
          </div>
          {/* Big number: dark gray-green #14532D or -- */}
          <div
            className={`text-3xl sm:text-4xl font-bold tracking-tight ${
              hasReading && humidityPct !== null
                ? "text-[#14532D]"
                : "text-gray-400"
            }`}
          >
            {hasReading && humidityPct !== null ? `${humidityPct}%` : "--"}
          </div>
        </div>
      </div>
    </div>
  );
}
