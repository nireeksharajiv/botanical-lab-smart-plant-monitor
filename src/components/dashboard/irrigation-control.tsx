"use client";

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { cn } from '@/lib/utils';
import { Droplets, RefreshCw } from 'lucide-react';
import { api, SystemSettings, IrrigationEvent } from '@/lib/api';

interface IrrigationControlProps {
  deviceId?: number;
  settings: SystemSettings | null;
  latestEvent: IrrigationEvent | null;
  currentSoilMoisture?: number | null;
  currentTankLevel?: number | null;
  onSettingsUpdated?: (newSettings: SystemSettings) => void;
  onEventCreated?: (newEvent: IrrigationEvent) => void;
}

export function IrrigationControl({
  deviceId,
  settings,
  latestEvent,
  currentSoilMoisture = null,
  currentTankLevel = null,
  onSettingsUpdated,
  onEventCreated,
}: IrrigationControlProps) {
  const [updating, setUpdating] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived state from real backend props
  const mode = settings?.auto_mode ? 'AUTO' : 'MANUAL';
  const pumpActive = latestEvent?.action === 'ON';
  const startThreshold = settings?.soil_start_threshold ?? 30;
  const stopThreshold = settings?.soil_stop_threshold ?? 45;
  const minTankLevel = settings?.tank_minimum_threshold ?? 20;

  const handleModeChange = async (newMode: 'AUTO' | 'MANUAL') => {
    if (!settings) return;
    setUpdating(true);
    setError(null);
    try {
      const updated = await api.updateSettings(
        { auto_mode: newMode === 'AUTO' },
        deviceId
      );
      if (onSettingsUpdated) onSettingsUpdated(updated);
    } catch (err: unknown) {
      console.error('Failed to update control mode:', err);
      setError('Failed to update mode.');
    } finally {
      setUpdating(false);
    }
  };

  const handleThresholdChange = async (type: 'start' | 'stop', value: number) => {
    if (!settings) return;
    setUpdating(true);
    setError(null);
    try {
      const updated = await api.updateSettings(
        type === 'start' ? { soil_start_threshold: value } : { soil_stop_threshold: value },
        deviceId
      );
      if (onSettingsUpdated) onSettingsUpdated(updated);
    } catch (err: unknown) {
      console.error('Failed to update thresholds:', err);
      setError('Failed to update threshold.');
    } finally {
      setUpdating(false);
    }
  };

  const handleManualWaterToggle = async () => {
    if (mode === 'AUTO') return;
    setActionLoading(true);
    setError(null);
    try {
      const targetAction = pumpActive ? 'OFF' : 'ON';
      const reason = pumpActive ? 'manual_stop' : 'manual_start';

      const event = await api.createIrrigationEvent({
        device_id: deviceId,
        action: targetAction,
        reason,
        soil_moisture: currentSoilMoisture,
        tank_level: currentTankLevel,
        mode: 'MANUAL',
      });

      if (onEventCreated) onEventCreated(event);
    } catch (err: unknown) {
      console.error('Failed to record manual irrigation command:', err);
      setError('Failed to execute command.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Card className="flex flex-col w-full h-full p-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 lg:p-6 border-b border-app-muted/10 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold tracking-[0.2em] text-app-primary font-sans leading-none">
            IRRIGATION CONTROL
          </h2>
          <span className="text-[10px] text-app-muted uppercase tracking-widest mt-1.5 leading-none block">
            PUMP ACTUATION & HYSTERESIS
          </span>
        </div>
        {updating && (
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-app-signal" />
        )}
      </div>

      <div className="flex-1 p-4 lg:p-6 flex flex-col gap-6">
        
        {/* Pump Status */}
        <div className="flex items-center justify-between p-4 bg-app-bg tech-border rounded-sm">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-widest text-app-muted mb-1 font-mono">PUMP STATUS</span>
            <div className="flex items-center space-x-2">
              <StatusIndicator status={pumpActive ? 'live' : 'offline'} pulse={pumpActive} />
              <span className={cn(
                "text-sm font-sans uppercase tracking-widest font-bold",
                pumpActive ? "text-app-signal" : "text-app-muted"
              )}>
                {pumpActive ? "PUMP ACTIVE" : "PUMP OFF"}
              </span>
            </div>
          </div>
          {latestEvent && (
            <div className="flex flex-col items-end text-right font-mono text-[10px] text-app-muted">
              <span className="uppercase tracking-widest">REASON</span>
              <span className="text-app-primary mt-0.5">{latestEvent.reason.replace('_', ' ').toUpperCase()}</span>
            </div>
          )}
        </div>

        {/* Mode Selection */}
        <div className="flex flex-col space-y-2">
          <span className="text-[9px] uppercase tracking-widest text-app-muted font-mono">CONTROL MODE</span>
          <div className="flex p-1 bg-app-bg tech-border rounded-sm">
            <button
              onClick={() => handleModeChange('AUTO')}
              disabled={updating || !settings}
              className={cn(
                "flex-1 text-xs py-2 uppercase tracking-widest transition-colors font-sans rounded-sm",
                mode === 'AUTO' 
                  ? "bg-app-card text-app-signal border border-app-signal/30" 
                  : "text-app-muted hover:text-app-primary border border-transparent"
              )}
            >
              AUTO
            </button>
            <button
              onClick={() => handleModeChange('MANUAL')}
              disabled={updating || !settings}
              className={cn(
                "flex-1 text-xs py-2 uppercase tracking-widest transition-colors font-sans rounded-sm",
                mode === 'MANUAL' 
                  ? "bg-app-card text-app-signal border border-app-signal/30" 
                  : "text-app-muted hover:text-app-primary border border-transparent"
              )}
            >
              MANUAL
            </button>
          </div>
        </div>

        {/* Manual Control Button */}
        <div className="flex flex-col space-y-2">
          <button
            onClick={handleManualWaterToggle}
            disabled={mode === 'AUTO' || actionLoading || !settings}
            className={cn(
              "w-full py-3 flex items-center justify-center space-x-2 text-xs uppercase tracking-widest font-bold transition-all rounded-sm",
              mode === 'AUTO'
                ? "bg-app-bg border border-app-muted/20 text-app-muted/50 cursor-not-allowed"
                : pumpActive
                  ? "bg-[#E5675B]/10 border border-[#E5675B]/30 text-[#E5675B] hover:bg-[#E5675B]/20"
                  : "bg-app-signal/10 border border-app-signal/30 text-app-signal hover:bg-app-signal/20"
            )}
          >
            {actionLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Droplets className="h-4 w-4" />
            )}
            <span>
              {mode === 'AUTO' 
                ? "CONTROLLED AUTOMATICALLY" 
                : pumpActive 
                  ? "STOP WATERING" 
                  : "WATER NOW"}
            </span>
          </button>
          {error && (
            <span className="text-[10px] font-mono text-[#E5675B] text-center">{error}</span>
          )}
        </div>

        {/* Hysteresis Controls */}
        <div className="flex flex-col space-y-4 pt-4 border-t border-app-muted/10">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-app-muted font-sans font-bold">SOIL THRESHOLDS</span>
            <span className="text-[9px] font-mono text-app-muted">MIN TANK: {minTankLevel}%</span>
          </div>

          <div className="flex flex-col space-y-3">
            <div className="flex flex-col">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[9px] uppercase tracking-widest text-app-muted font-mono">START WATERING</span>
                <span className="text-xs font-mono text-app-primary">{startThreshold} %</span>
              </div>
              <input 
                type="range" 
                min="10" 
                max="60" 
                step="1" 
                value={startThreshold} 
                onChange={(e) => handleThresholdChange('start', Number(e.target.value))}
                disabled={updating || !settings}
                className="w-full accent-app-signal h-1 bg-app-bg appearance-none rounded-none outline-none"
              />
            </div>
            
            <div className="flex flex-col">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[9px] uppercase tracking-widest text-app-muted font-mono">STOP WATERING</span>
                <span className="text-xs font-mono text-app-primary">{stopThreshold} %</span>
              </div>
              <input 
                type="range" 
                min="20" 
                max="80" 
                step="1" 
                value={stopThreshold} 
                onChange={(e) => handleThresholdChange('stop', Number(e.target.value))}
                disabled={updating || !settings}
                className="w-full accent-app-signal h-1 bg-app-bg appearance-none rounded-none outline-none"
              />
            </div>
          </div>
        </div>

      </div>

      {/* Footer / Soil Status */}
      <div className="bg-app-bg/50 border-t border-app-muted/10 p-3 px-6 grid grid-cols-3 gap-2">
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-widest text-app-muted font-mono">CURRENT SOIL</span>
          <span className="text-sm text-app-signal font-mono font-bold mt-0.5">
            {currentSoilMoisture !== null ? `${currentSoilMoisture.toFixed(1)} %` : '-- %'}
          </span>
        </div>
        <div className="flex flex-col text-center">
          <span className="text-[9px] uppercase tracking-widest text-app-muted font-mono">START AT</span>
          <span className="text-xs text-app-primary font-mono mt-1">{startThreshold} %</span>
        </div>
        <div className="flex flex-col text-right">
          <span className="text-[9px] uppercase tracking-widest text-app-muted font-mono">STOP AT</span>
          <span className="text-xs text-app-primary font-mono mt-1">{stopThreshold} %</span>
        </div>
      </div>

    </Card>
  );
}
