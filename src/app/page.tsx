"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TopNav } from '@/components/layout/top-nav';
import { SensorCard } from '@/components/dashboard/sensor-card';
import { SignalChart } from '@/components/dashboard/signal-chart';
import { IrrigationControl } from '@/components/dashboard/irrigation-control';
import { AlertLog } from '@/components/dashboard/alert-log';
import { AlertPopup } from '@/components/dashboard/alert-popup';
import { 
  Thermometer, 
  Droplets, 
  Sun, 
  CloudRain, 
  Database,
  AlertCircle,
  RefreshCw 
} from 'lucide-react';
import { 
  api, 
  Device, 
  SensorReading, 
  AlertItem, 
  IrrigationEvent, 
  SystemSettings 
} from '@/lib/api';
import { formatTimeIST } from '@/lib/date-utils';

export default function Home() {
  const [device, setDevice] = useState<Device | null>(null);
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [latestEvent, setLatestEvent] = useState<IrrigationEvent | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [dismissedPopupIds, setDismissedPopupIds] = useState<number[]>([]);
  
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateStr, setLastUpdateStr] = useState<string | null>(null);

  // Polling ref to prevent race conditions
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Initial Device Discovery
  const initDevice = async (): Promise<number | undefined> => {
    try {
      const devicesList = await api.getDevices();
      if (devicesList && devicesList.length > 0) {
        // Find Botanical Lab ESP32 or active device
        const activeDev = devicesList.find(d => d.is_active) || devicesList[0];
        setDevice(activeDev);
        return activeDev.id;
      }
      return undefined;
    } catch (err) {
      console.warn('Could not fetch devices list:', err);
      return undefined;
    }
  };

  // 2. Fetch all real telemetry & state from FastAPI
  const fetchDashboardData = useCallback(async (activeDeviceId?: number) => {
    const devId = activeDeviceId !== undefined ? activeDeviceId : device?.id;
    try {
      // Parallel fetch for optimal performance
      const [
        latestReadings,
        alertsList,
        eventsList,
        deviceSettings,
      ] = await Promise.all([
        api.getLatestReadings(devId),
        api.getAlerts({ deviceId: devId, limit: 15 }),
        api.getIrrigationEvents({ deviceId: devId, limit: 5 }),
        api.getSettings(devId),
      ]);

      setReadings(latestReadings || []);
      setAlerts(alertsList || []);
      setLatestEvent(eventsList && eventsList.length > 0 ? eventsList[0] : null);
      setSettings(deviceSettings);
      setIsOnline(true);
      setError(null);

      // Compute last update timestamp
      if (latestReadings && latestReadings.length > 0) {
        const timestamps = latestReadings.map(r => new Date(r.timestamp).getTime());
        const maxTime = Math.max(...timestamps);
        const formatted = formatTimeIST(maxTime);
        setLastUpdateStr(formatted);
      }
    } catch (err: unknown) {
      console.error('FastAPI fetch error:', err);
      setIsOnline(false);
      setError('Backend service is currently unavailable.');
    } finally {
      setIsLoading(false);
    }
  }, [device?.id]);

  // Initial load and polling setup (5-second polling interval)
  useEffect(() => {
    let isMounted = true;

    const setupAndPoll = async () => {
      setIsLoading(true);
      const devId = await initDevice();
      if (isMounted) {
        await fetchDashboardData(devId);
      }
    };

    setupAndPoll();

    // 5-second polling interval
    pollingTimerRef.current = setInterval(() => {
      fetchDashboardData();
    }, 5000);

    return () => {
      isMounted = false;
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
    };
  }, [fetchDashboardData]);

  // 3. Live Server-Sent Events (SSE) stream listener
  useEffect(() => {
    const unsubscribe = api.subscribeToAlerts(
      (event) => {
        if (event.event === 'alert_created') {
          const newAlert = event.data as AlertItem;
          if (newAlert && newAlert.id) {
            setAlerts(prev => {
              const exists = prev.some(a => a.id === newAlert.id);
              if (exists) {
                return prev.map(a => a.id === newAlert.id ? newAlert : a);
              }
              return [newAlert, ...prev];
            });
          }
        } else if (event.event === 'alert_acknowledged') {
          const data = event.data;
          if (data.id) {
            setAlerts(prev => prev.map(a => a.id === data.id ? { ...a, acknowledged: true } : a));
          }
        } else if (event.event === 'alert_resolved') {
          const data = event.data;
          if (data.id) {
            setAlerts(prev => prev.map(a => a.id === data.id ? { ...a, is_resolved: true } : a));
          }
        }
      },
      (err) => {
        console.warn('SSE stream error (will retry automatically):', err);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Alert Action Handlers
  const handleAcknowledgeAlert = async (alertId: number) => {
    try {
      await api.acknowledgeAlert(alertId);
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a));
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  const handleWaterNow = async (alert: AlertItem) => {
    try {
      const devId = device?.id || alert.device_id || null;
      const newEvent = await api.createIrrigationEvent({
        device_id: devId,
        action: 'ON',
        reason: 'manual_start',
        mode: 'MANUAL',
        soil_moisture: soilMoistureVal,
        tank_level: tankVal,
      });
      setLatestEvent(newEvent);

      // Acknowledge the alert
      await handleAcknowledgeAlert(alert.id);

      // Refresh dashboard data
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to trigger Water Now action:', err);
    }
  };

  const handleDismissPopup = (alertId: number) => {
    setDismissedPopupIds(prev => [...prev, alertId]);
  };

  // Filter alerts for the popup system (hide dismissed ones)
  const popupAlerts = alerts.filter(a => !dismissedPopupIds.includes(a.id));

  // Extract individual sensor values from real backend readings
  const getSensorReading = (sensorName: string) => {
    return readings.find(r => r.sensor === sensorName);
  };

  const soilReading = getSensorReading('soil_moisture');
  const rainReading = getSensorReading('rain');
  const tempReading = getSensorReading('temperature');
  const tankReading = getSensorReading('tank_level');
  const lightReading = getSensorReading('light');

  // Soil status
  const soilMoistureVal = soilReading?.raw_value ?? null;
  const startThresh = settings?.soil_start_threshold ?? 30;
  const soilStatus = soilMoistureVal !== null
    ? soilMoistureVal <= startThresh
      ? 'warning'
      : 'live'
    : 'offline';
  const soilStatusLabel = soilMoistureVal !== null
    ? soilMoistureVal <= startThresh
      ? 'DRY'
      : 'OPTIMAL'
    : 'NO DATA';

  // Rain status
  const isRaining = rainReading ? rainReading.raw_value > 0 : false;
  const rainStatus = isRaining ? 'alert' : 'offline';
  const rainStatusLabel = rainReading ? (isRaining ? 'DETECTED' : 'NO RAIN') : 'NO DATA';

  // Temp status
  const tempVal = tempReading?.raw_value ?? null;
  const tempStatus = tempVal !== null ? 'live' : 'offline';
  const tempStatusLabel = tempVal !== null ? 'NORMAL' : 'NO DATA';

  // Tank status
  const tankVal = tankReading?.raw_value ?? null;
  const minTankThresh = settings?.tank_minimum_threshold ?? 20;
  const tankStatus = tankVal !== null
    ? tankVal <= minTankThresh
      ? 'alert'
      : 'live'
    : 'offline';
  const tankStatusLabel = tankVal !== null
    ? tankVal <= minTankThresh
      ? 'LOW'
      : 'NORMAL'
    : 'NO DATA';

  // Light status
  const lightVal = lightReading?.raw_value ?? null;
  const lightStatus = lightVal !== null ? 'live' : 'offline';
  const lightStatusLabel = lightVal !== null
    ? lightVal > 40
      ? 'DAYLIGHT'
      : 'LOW LIGHT'
    : 'NO DATA';

  return (
    <div className="min-h-screen flex flex-col bg-app-bg text-[#D6EBDD]">
      {/* Alert Pop-up Notification System */}
      <AlertPopup 
        alerts={popupAlerts}
        onAcknowledge={handleAcknowledgeAlert}
        onWaterNow={handleWaterNow}
        onDismiss={handleDismissPopup}
      />

      <TopNav 
        isOnline={isOnline}
        deviceName={device?.device_name || 'ESP32 NODE'}
        lastUpdate={lastUpdateStr}
        onRefresh={() => fetchDashboardData()}
        isLoading={isLoading}
      />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        {/* Sub-header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-wider uppercase">Live Telemetry</h2>
            <p className="text-sm font-mono text-app-muted mt-1">
              {isOnline 
                ? `Acquiring real telemetry from ${device?.device_name || 'ESP32 Node'} (Supabase PostgreSQL)...` 
                : 'Backend unreachable. Check FastAPI server on http://localhost:8000'}
            </p>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 text-xs font-mono bg-app-card px-3 py-1.5 tech-border rounded-sm">
              <span className="text-app-muted">LOCATION:</span>
              <span className="text-app-primary">{device?.location || 'Plant Unit 01'}</span>
            </div>
            {!isOnline && (
              <button
                onClick={() => fetchDashboardData()}
                className="flex items-center space-x-1.5 text-xs font-mono bg-[#E5675B]/20 text-[#E5675B] border border-[#E5675B]/40 px-3 py-1.5 rounded-sm hover:bg-[#E5675B]/30 transition-colors"
              >
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span>RETRY CONNECTION</span>
              </button>
            )}
          </div>
        </div>

        {/* Offline Banner Warning */}
        {!isOnline && (
          <div className="mb-6 p-4 bg-[#E5675B]/10 border border-[#E5675B]/30 rounded-sm flex items-center space-x-3">
            <AlertCircle className="h-5 w-5 text-[#E5675B] flex-shrink-0" />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-[#E5675B] uppercase tracking-wider">
                FastAPI Backend Offline
              </span>
              <span className="text-[11px] text-app-muted mt-0.5">
                Ensure the FastAPI backend is running with `uvicorn app.main:app --port 8000` connected to Supabase.
              </span>
            </div>
          </div>
        )}

        {/* 5 Sensor Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <SensorCard
            title="SOIL MOISTURE · ADC1"
            value={soilMoistureVal !== null ? Number(soilMoistureVal.toFixed(1)) : undefined}
            unit="%"
            icon={<Droplets className="h-3 w-3 text-app-muted" />}
            status={soilStatus}
            statusLabel={soilStatusLabel}
            isLoading={isLoading && readings.length === 0}
          />
          
          <SensorCard
            title="RAIN SENSOR"
            value={rainReading ? (isRaining ? 'YES' : 'NO') : undefined}
            unit=""
            icon={<CloudRain className="h-3 w-3 text-app-muted" />}
            status={rainStatus}
            statusLabel={rainStatusLabel}
            isLoading={isLoading && readings.length === 0}
          />
          
          <SensorCard
            title="TEMPERATURE"
            value={tempVal !== null ? Number(tempVal.toFixed(1)) : undefined}
            unit="°C"
            icon={<Thermometer className="h-3 w-3 text-app-muted" />}
            status={tempStatus}
            statusLabel={tempStatusLabel}
            isLoading={isLoading && readings.length === 0}
          />

          <SensorCard
            title="TANK LEVEL · ULTRASONIC"
            value={tankVal !== null ? Number(tankVal.toFixed(1)) : undefined}
            unit="%"
            icon={<Database className="h-3 w-3 text-app-muted" />}
            status={tankStatus}
            statusLabel={tankStatusLabel}
            isLoading={isLoading && readings.length === 0}
          />

          <SensorCard
            title="LIGHT · LDR"
            value={lightVal !== null ? Number(lightVal.toFixed(1)) : undefined}
            unit="%"
            icon={<Sun className="h-3 w-3 text-app-muted" />}
            status={lightStatus}
            statusLabel={lightStatusLabel}
            isLoading={isLoading && readings.length === 0}
          />
        </div>

        {/* Analytics & Control Section */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <SignalChart deviceId={device?.id} />
          </div>
          
          <div className="lg:col-span-1 min-h-[300px]">
            <IrrigationControl 
              deviceId={device?.id}
              settings={settings}
              latestEvent={latestEvent}
              currentSoilMoisture={soilMoistureVal}
              currentTankLevel={tankVal}
              onSettingsUpdated={(newSettings) => setSettings(newSettings)}
              onEventCreated={(newEvent) => {
                setLatestEvent(newEvent);
                fetchDashboardData();
              }}
            />
          </div>
        </div>

        {/* Live Alerts & Event Log Section */}
        <div className="mt-8">
          <AlertLog 
            alerts={alerts} 
            isLoading={isLoading && alerts.length === 0} 
            onAcknowledge={handleAcknowledgeAlert}
          />
        </div>
      </main>
    </div>
  );
}
