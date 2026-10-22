"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";

interface AlertBannerProps {
  problems: string[];
}

export default function AlertBanner({ problems }: AlertBannerProps) {
  // Only render if there are active problems reported
  if (!problems || problems.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 shadow-xs">
      <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
      <div className="text-sm font-medium">
        {problems.map((problem, idx) => (
          <span key={idx}>
            {problem}
            {idx < problems.length - 1 ? ", " : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
