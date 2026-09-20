"use client";

import React from 'react';
import { Card } from '@/components/ui/card';
import { AlertItem } from '@/lib/api';
import { Bell, AlertTriangle, Info, AlertOctagon, CheckCircle2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTimeIST } from '@/lib/date-utils';

interface AlertLogProps {
  alerts: AlertItem[];
  isLoading?: boolean;
  onAcknowledge?: (alertId: number) => void;
}

export function AlertLog({ alerts, isLoading = false, onAcknowledge }: AlertLogProps) {
  const getSeverityIcon = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'alert':
        return <AlertOctagon className="h-3.5 w-3.5 text-[#E5675B]" />;
      case 'warning':
        return <AlertTriangle className="h-3.5 w-3.5 text-[#F5B942]" />;
      default:
        return <Info className="h-3.5 w-3.5 text-[#B6F04A]" />;
    }
  };

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'alert':
        return 'text-[#E5675B] bg-[#E5675B]/10 border-[#E5675B]/20';
      case 'warning':
        return 'text-[#F5B942] bg-[#F5B942]/10 border-[#F5B942]/20';
      default:
        return 'text-[#B6F04A] bg-[#B6F04A]/10 border-[#B6F04A]/20';
    }
  };

  return (
    <Card className="flex flex-col w-full h-full p-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 lg:p-6 border-b border-app-muted/10 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Bell className="h-4 w-4 text-app-primary" />
          <h2 className="text-sm font-bold tracking-[0.2em] text-app-primary font-sans leading-none">
            SYSTEM ALERTS & LOGS
          </h2>
        </div>
        <span className="text-[10px] text-app-muted uppercase font-mono tracking-widest">
          {alerts.length} NOTIFICATIONS
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 lg:p-6 overflow-y-auto max-h-[320px] space-y-2.5">
        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-12 bg-app-muted/10 rounded" />
            <div className="h-12 bg-app-muted/10 rounded" />
            <div className="h-12 bg-app-muted/10 rounded" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="h-32 flex flex-col items-center justify-center text-center p-4">
            <span className="font-mono text-xs text-app-muted uppercase tracking-widest">
              NO ACTIVE SYSTEM ALERTS
            </span>
            <span className="font-mono text-[10px] text-app-muted/50 mt-1">
              All sensors and subsystems operating within nominal thresholds
            </span>
          </div>
        ) : (
          alerts.map((alert) => {
            const timeStr = formatTimeIST(alert.timestamp);
            return (
              <div
                key={alert.id}
                className={cn(
                  "p-3 bg-app-bg tech-border rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors",
                  alert.is_resolved ? "opacity-75" : "hover:border-app-muted/40"
                )}
              >
                <div className="flex items-start space-x-2.5">
                  <div className="mt-0.5">{getSeverityIcon(alert.severity)}</div>
                  <div className="flex flex-col">
                    <span className="text-xs text-app-primary font-sans leading-snug">
                      {alert.message}
                    </span>
                    <div className="flex items-center space-x-2 mt-1 font-mono text-[10px] text-app-muted">
                      {alert.category && (
                        <span className="uppercase tracking-widest text-app-primary">
                          [{alert.category}]
                        </span>
                      )}
                      <span>{timeStr}</span>
                      {alert.is_resolved && (
                        <span className="text-[#B6F04A] bg-[#B6F04A]/10 border border-[#B6F04A]/20 px-1.5 py-0.2 rounded-sm text-[9px]">
                          RESOLVED
                        </span>
                      )}
                      {alert.acknowledged && (
                        <span className="text-app-muted bg-app-card border border-app-muted/20 px-1.5 py-0.2 rounded-sm text-[9px]">
                          ACKNOWLEDGED
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 self-end sm:self-center">
                  {!alert.acknowledged && !alert.is_resolved && onAcknowledge && (
                    <button
                      onClick={() => onAcknowledge(alert.id)}
                      className="px-2 py-1 text-[9px] font-mono uppercase tracking-wider text-app-muted bg-app-card border border-app-muted/30 rounded-sm hover:text-[#F5B942] hover:border-[#F5B942] transition-colors flex items-center space-x-1"
                    >
                      <Check className="h-2.5 w-2.5" />
                      <span>ACK</span>
                    </button>
                  )}
                  <span
                    className={cn(
                      "text-[9px] uppercase font-mono tracking-widest px-2 py-0.5 border rounded-sm",
                      getSeverityBadgeClass(alert.severity)
                    )}
                  >
                    {alert.severity}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
