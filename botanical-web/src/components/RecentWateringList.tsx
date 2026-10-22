"use client";

import React from "react";
import { WateringEvent } from "@/lib/types";

interface RecentWateringListProps {
  events: WateringEvent[];
}

export default function RecentWateringList({ events }: RecentWateringListProps) {
  const hasEvents = events && events.length > 0;

  return (
    <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-2xl p-6 shadow-xs">
      {/* Header Label: medium green #15803D */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wider text-[#15803D] uppercase">
          Recent Watering
        </span>
      </div>

      {/* List of watering events or subtle empty state */}
      {hasEvents ? (
        <div className="divide-y divide-[#BBF7D0]">
          {events.slice(0, 5).map((event) => (
            <div
              key={event.id}
              className="flex items-center justify-between py-3 first:pt-2 last:pb-1"
            >
              {/* Timestamp: dark gray-green #14532D */}
              <span className="text-sm font-medium text-[#14532D]">
                {event.time}
              </span>

              {/* Type badge (white bg, green border, dark green text) and Duration in seconds */}
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white text-[#14532D] border border-[#BBF7D0]">
                  {event.type}
                </span>

                <span className="text-xs font-medium text-[#15803D] w-12 text-right">
                  {event.duration_sec}s
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-6 text-center text-xs text-gray-400">
          No watering events recorded yet
        </div>
      )}
    </div>
  );
}
