"use client";

import React, { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";

interface ToastProps {
  message: string;
  isVisible: boolean;
  onClose: () => void;
}

export default function Toast({ message, isVisible, onClose }: ToastProps) {
  useEffect(() => {
    if (!isVisible) return;

    // Automatically hide toast after 3 seconds
    const timer = setTimeout(() => {
      onClose();
    }, 3000);

    return () => clearTimeout(timer);
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-white border border-gray-200 rounded-xl shadow-lg transition-all animate-in fade-in slide-in-from-bottom-2">
      <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
      <span className="text-sm font-medium text-[#1F2937]">{message}</span>
    </div>
  );
}
