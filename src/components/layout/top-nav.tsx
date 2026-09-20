"use client";

import React from 'react';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { Leaf, RefreshCw } from 'lucide-react';

interface TopNavProps {
  isOnline?: boolean;
  deviceName?: string;
  lastUpdate?: string | null;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export function TopNav({
  isOnline = false,
  deviceName = 'ESP32 NODE',
  lastUpdate = null,
  onRefresh,
  isLoading = false,
}: TopNavProps) {
  return (
    <header className="border-b border-app-muted/20 bg-app-bg sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 sm:h-16 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0">
        
        {/* LEFT SIDE: Branding */}
        <div className="flex items-center space-x-3">
          <Leaf className="h-5 w-5 text-app-signal" />
          <div className="flex flex-col">
            <h1 className="text-sm font-bold tracking-[0.2em] text-app-primary font-sans leading-none">
              BOTANICAL LAB
            </h1>
            <span className="text-[10px] text-app-muted uppercase tracking-widest mt-1.5 leading-none">
              SMART PLANT MONITOR
            </span>
          </div>
        </div>
        
        {/* CENTER/RIGHT SIDE: Status */}
        <div className="flex items-center space-x-4 sm:space-x-6 w-full sm:w-auto justify-between sm:justify-end border-t border-app-muted/20 sm:border-t-0 pt-3 sm:pt-0 mt-1 sm:mt-0">
          
          <div className="flex items-center space-x-2 font-mono text-xs">
            <StatusIndicator status={isOnline ? 'live' : 'offline'} pulse={isOnline} />
            <span className={isOnline ? "text-app-primary tracking-wider" : "text-[#E5675B] tracking-wider"}>
              {isOnline ? `${deviceName.toUpperCase()} ONLINE` : 'BACKEND OFFLINE'}
            </span>
          </div>
          
          <div className="h-4 w-[1px] bg-app-muted/20 hidden sm:block" />
          
          <div className="flex items-center space-x-2 font-mono text-xs text-app-muted">
            <span className="uppercase tracking-widest text-[10px]">LAST UPDATE</span>
            <span className="text-app-primary tracking-wider">
              {lastUpdate || '--:--:--'}
            </span>
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              title="Refresh Telemetry"
              className="p-1.5 text-app-muted hover:text-app-primary transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-app-signal' : ''}`} />
            </button>
          )}
          
        </div>
      </div>
    </header>
  );
}
