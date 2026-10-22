"use client";

import React, { useState, useEffect } from "react";
import { Leaf } from "lucide-react";

interface TopBarProps {
  deviceOnline: boolean;
  lastSeen?: string | null;
}

export default function TopBar({ deviceOnline, lastSeen }: TopBarProps) {
  // Store calculated minutes elapsed since last check-in
  const [minutesAgo, setMinutesAgo] = useState<number | null>(null);

  useEffect(() => {
    if (!lastSeen) {
      setMinutesAgo(null);
      return;
    }
    // Safely calculate elapsed time on client after mount
    const diffMs = Date.now() - new Date(lastSeen).getTime();
    const mins = Math.floor(diffMs / (1000 * 60));
    setMinutesAgo(mins > 0 ? mins : 1);
  }, [lastSeen]);

  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-6 border-b border-gray-200">
      {/* Brand logo and title */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#F0FDF4] text-[#16A34A] border border-green-200/60">
          <Leaf className="w-5 h-5 text-[#16A34A]" />
        </div>
        <span className="text-xl font-bold tracking-tight text-[#1F2937]">
          Botanical Lab
        </span>
      </div>

      {/* Device connection status and last update time */}
      <div className="flex items-center gap-3">
        {/* Status pill */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200 bg-white shadow-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              deviceOnline ? "bg-[#16A34A]" : "bg-gray-400"
            }`}
          />
          <span className={deviceOnline ? "text-[#1F2937]" : "text-gray-500"}>
            {deviceOnline ? "Device online" : "Offline"}
          </span>
        </div>

        {/* Last updated text */}
        <span className="text-xs text-gray-500">
          {minutesAgo !== null ? `Updated ${minutesAgo} min ago` : "No readings yet"}
        </span>
      </div>
    </header>
  );
}
