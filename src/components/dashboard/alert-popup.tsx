"use client";

import React from 'react';
import { AlertItem } from '@/lib/api';
import { AlertTriangle, AlertOctagon, Droplets, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTimeIST } from '@/lib/date-utils';

interface AlertPopupProps {
  alerts: AlertItem[];
  onAcknowledge: (alertId: number) => void;
  onWaterNow: (alert: AlertItem) => void;
  onDismiss: (alertId: number) => void;
}

export function AlertPopup({
  alerts,
  onAcknowledge,
  onWaterNow,
  onDismiss,
}: AlertPopupProps) {
  // Only show active and unacknowledged alerts
  const activePopups = alerts.filter(a => !a.acknowledged && !a.is_resolved);

  if (activePopups.length === 0) {
    return null;
  }

  // Prioritize CRITICAL alerts first, then newest WARNING alerts
  const sortedAlerts = [...activePopups].sort((a, b) => {
    const aCrit = a.severity === 'alert' ? 1 : 0;
    const bCrit = b.severity === 'alert' ? 1 : 0;
    if (aCrit !== bCrit) return bCrit - aCrit;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  const activeAlert = sortedAlerts[0];
  const isCritical = activeAlert.severity === 'alert';
  const totalCount = sortedAlerts.length;

  const formatSensorLabel = (sensor?: string | null, category?: string | null) => {
    if (sensor) {
      switch (sensor) {
        case 'soil_moisture': return 'SOIL MOISTURE';
        case 'rain': return 'RAIN SENSOR';
        case 'temperature': return 'DHT11 TEMPERATURE';
        case 'tank_level': return 'TANK LEVEL (HC-SR04)';
        case 'light': return 'LDR LIGHT INTENSITY';
        default: return sensor.toUpperCase().replace('_', ' ');
      }
    }
    if (category) {
      switch (category.toLowerCase()) {
        case 'soil': return 'SOIL MOISTURE SENSOR';
        case 'tank': return 'WATER TANK LEVEL';
        case 'temperature': return 'TEMPERATURE SENSOR';
        case 'irrigation': return 'IRRIGATION CONTROLLER';
        case 'connectivity': return 'ESP32 TELEMETRY NODE';
        default: return category.toUpperCase();
      }
    }
    return 'SYSTEM TELEMETRY';
  };

  const getSensorUnit = (sensor?: string | null, category?: string | null) => {
    if (sensor === 'soil_moisture' || category === 'soil') return '%';
    if (sensor === 'tank_level' || category === 'tank') return '%';
    if (sensor === 'temperature' || category === 'temperature') return '°C';
    if (sensor === 'light' || category === 'light') return '%';
    return '';
  };

  const isIrrigationRelevant = (alert: AlertItem) => {
    return (
      alert.category === 'soil' ||
      alert.sensor === 'soil_moisture' ||
      alert.message.toLowerCase().includes('soil')
    );
  };

  const unit = getSensorUnit(activeAlert.sensor, activeAlert.category);
  const showWaterNow = isIrrigationRelevant(activeAlert);
  const timeStr = formatTimeIST(activeAlert.timestamp);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Dark / Blurred Backdrop */}
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={() => onDismiss(activeAlert.id)}
        aria-hidden="true"
      />

      {/* Centered Modal Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="alert-modal-title"
        className={cn(
          "relative w-full max-w-lg bg-app-card rounded-sm p-5 sm:p-6 shadow-2xl transition-all animate-in fade-in zoom-in-95 duration-200 z-10",
          isCritical
            ? "border-2 border-[#E5675B] shadow-[0_0_40px_rgba(229,103,91,0.25)]"
            : "border-2 border-[#F5B942] shadow-[0_0_40px_rgba(245,185,66,0.2)]"
        )}
      >
        {/* Header */}
        <div className={cn(
          "flex items-start justify-between border-b pb-4 mb-4",
          isCritical ? "border-[#E5675B]/30" : "border-[#F5B942]/30"
        )}>
          <div className="flex items-center space-x-3">
            <div className={cn(
              "p-2.5 rounded-sm border",
              isCritical
                ? "bg-[#E5675B]/20 border-[#E5675B]/40 text-[#E5675B]"
                : "bg-[#F5B942]/20 border-[#F5B942]/40 text-[#F5B942]"
            )}>
              {isCritical ? (
                <AlertOctagon className="h-6 w-6 animate-pulse" />
              ) : (
                <AlertTriangle className="h-6 w-6" />
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 
                  id="alert-modal-title"
                  className={cn(
                    "text-sm sm:text-base font-bold tracking-wider uppercase font-sans",
                    isCritical ? "text-[#E5675B]" : "text-[#F5B942]"
                  )}
                >
                  {isCritical 
                    ? 'CRITICAL SYSTEM ALERT' 
                    : `${(activeAlert.category || 'SYSTEM').toUpperCase()} WARNING`}
                </h3>
                {totalCount > 1 && (
                  <span className="px-1.5 py-0.5 text-[9px] font-mono bg-app-bg text-app-muted border border-app-muted/30 rounded-sm uppercase tracking-widest">
                    1 OF {totalCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-mono text-app-muted uppercase tracking-widest block mt-0.5">
                {formatSensorLabel(activeAlert.sensor, activeAlert.category)}
              </span>
            </div>
          </div>

          <button
            onClick={() => onDismiss(activeAlert.id)}
            className="text-app-muted hover:text-app-primary p-1.5 rounded-sm transition-colors"
            aria-label="Dismiss alert"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Message Body */}
        <div className="space-y-4 mb-6">
          <p className="text-sm text-app-primary font-sans leading-relaxed">
            {activeAlert.message}
          </p>

          {/* Structured Telemetry Data Grid */}
          <div className="bg-app-bg p-3.5 border border-app-muted/20 rounded-sm grid grid-cols-2 gap-3 text-xs font-mono">
            {/* Category & Sensor */}
            <div>
              <span className="text-[9px] uppercase tracking-widest text-app-muted block">CATEGORY</span>
              <span className="text-xs font-bold text-app-primary uppercase">
                {activeAlert.category || 'SYSTEM'}
              </span>
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-widest text-app-muted block">SENSOR</span>
              <span className="text-xs font-bold text-app-primary truncate block">
                {formatSensorLabel(activeAlert.sensor, activeAlert.category)}
              </span>
            </div>

            {/* Current Value & Threshold */}
            <div className="pt-2 border-t border-app-muted/10">
              <span className="text-[9px] uppercase tracking-widest text-app-muted block">CURRENT VALUE</span>
              <span className={cn(
                "text-sm font-bold",
                isCritical ? "text-[#E5675B]" : "text-[#F5B942]"
              )}>
                {activeAlert.value !== null && activeAlert.value !== undefined
                  ? `${activeAlert.value}${unit}`
                  : 'TRIGGERED'}
              </span>
            </div>
            <div className="pt-2 border-t border-app-muted/10">
              <span className="text-[9px] uppercase tracking-widest text-app-muted block">THRESHOLD</span>
              <span className="text-sm font-bold text-app-primary">
                {activeAlert.threshold !== null && activeAlert.threshold !== undefined
                  ? `${activeAlert.threshold}${unit}`
                  : 'SETPOINT'}
              </span>
            </div>

            {/* Timestamp & Severity */}
            <div className="col-span-2 pt-2 border-t border-app-muted/10 flex flex-wrap justify-between items-center text-[10px] text-app-muted gap-2">
              <span className="font-mono">TIMESTAMP: {timeStr}</span>
              <span className={cn(
                "px-2 py-0.5 uppercase font-bold tracking-widest border rounded-sm text-[9px]",
                isCritical
                  ? "text-[#E5675B] bg-[#E5675B]/10 border-[#E5675B]/30"
                  : "text-[#F5B942] bg-[#F5B942]/10 border-[#F5B942]/30"
              )}>
                SEVERITY: {activeAlert.severity.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-3 pt-2 border-t border-app-muted/10">
          <button
            onClick={() => onAcknowledge(activeAlert.id)}
            className="px-4 py-2 bg-app-bg tech-border text-app-primary text-xs font-mono uppercase tracking-wider rounded-sm hover:border-app-signal hover:text-app-signal transition-colors flex items-center space-x-1.5"
          >
            <Check className="h-3.5 w-3.5" />
            <span>ACKNOWLEDGE</span>
          </button>

          {showWaterNow && (
            <button
              onClick={() => onWaterNow(activeAlert)}
              className="px-4 py-2 bg-[#B6F04A] text-black font-bold text-xs font-mono uppercase tracking-wider rounded-sm hover:bg-[#B6F04A]/90 transition-colors flex items-center space-x-1.5 shadow-md"
            >
              <Droplets className="h-3.5 w-3.5" />
              <span>WATER NOW</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
