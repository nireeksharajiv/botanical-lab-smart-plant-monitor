"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusIndicator, StatusType } from '@/components/ui/status-indicator';
import { cn } from '@/lib/utils';
import { ResponsiveContainer, LineChart, Line, YAxis } from 'recharts';

interface SensorCardProps {
  title: string;
  value?: number | string;
  unit?: string;
  icon: React.ReactNode;
  status?: StatusType;
  statusLabel?: string;
  sparklineData?: number[];
  isLoading?: boolean;
}

export function SensorCard({
  title,
  value,
  unit,
  icon,
  status = 'offline',
  statusLabel,
  sparklineData,
  isLoading = false,
}: SensorCardProps) {
  const getStatusColorHex = (s: StatusType) => {
    switch (s) {
      case 'live': return '#B6F04A';
      case 'warning': return '#F5B942';
      case 'alert': return '#E5675B';
      case 'offline': return '#7FA08C';
      default: return '#7FA08C';
    }
  };

  const chartData = sparklineData && sparklineData.length > 0 
    ? sparklineData.map((val, i) => ({ value: val, index: i })) 
    : [];

  return (
    <Card className="flex flex-col h-full justify-between">
      <CardHeader className="flex flex-row items-center justify-between pb-1">
        <CardTitle className="flex items-center space-x-2 text-[10px]">
          {icon}
          <span className="font-sans uppercase tracking-widest">{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-end pt-2">
        {isLoading ? (
          <div className="flex flex-col mb-4 space-y-2 animate-pulse">
            <div className="h-8 bg-app-muted/10 rounded w-20" />
            <div className="h-3 bg-app-muted/10 rounded w-16" />
          </div>
        ) : (
          <div className="flex flex-col mb-4">
            <div className="flex items-baseline space-x-1.5">
              <span
                className={cn(
                  "font-mono text-3xl tracking-tight",
                  status === 'alert' && "text-app-alert",
                  status === 'warning' && "text-app-warning",
                  (status === 'live' || status === 'offline') && "text-app-primary"
                )}
              >
                {value !== undefined ? value : '--'}
              </span>
              {unit && (
                <span className="font-mono text-xs text-app-muted tracking-wider">
                  {unit}
                </span>
              )}
            </div>
            
            <div className="flex items-center space-x-2 mt-2">
              <StatusIndicator status={status} pulse={status === 'live' || status === 'alert'} />
              {statusLabel && (
                <span className={cn(
                  "font-mono text-[10px] uppercase font-bold tracking-widest",
                  status === 'alert' && "text-app-alert",
                  status === 'warning' && "text-app-warning",
                  status === 'live' && "text-app-signal",
                  status === 'offline' && "text-app-muted"
                )}>
                  {statusLabel}
                </span>
              )}
            </div>
          </div>
        )}

        {chartData.length > 0 ? (
          <div className="h-10 w-full mt-2 border-t border-app-muted/10 pt-3 relative -bottom-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <YAxis domain={['dataMin - 1', 'dataMax + 1']} hide />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={getStatusColorHex(status)}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-10 w-full mt-2 border-t border-app-muted/10 pt-3 flex items-center justify-center">
            <span className="font-mono text-[9px] text-app-muted/40 uppercase tracking-widest">
              TELEMETRY LIVE
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
