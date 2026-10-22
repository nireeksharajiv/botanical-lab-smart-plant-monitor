"use client";

import React, { useState, useEffect, useCallback } from "react";
// Import shared TypeScript definitions
import { DashboardResponse } from "@/lib/types";

// Import UI components
import TopBar from "@/components/TopBar";
import AlertBanner from "@/components/AlertBanner";
import SoilMoistureCard from "@/components/SoilMoistureCard";
import ClimateCard from "@/components/ClimateCard";
import LightCard from "@/components/LightCard";
import PumpCard from "@/components/PumpCard";
import SoilHistoryChart from "@/components/SoilHistoryChart";
import RecentWateringList from "@/components/RecentWateringList";
import Toast from "@/components/Toast";

export default function DashboardPage() {
  // Real-time dashboard state from Supabase
  const [data, setData] = useState<DashboardResponse | null>(null);

  // Toast feedback state for user actions
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Fetch latest readings and 24h history from backend
  const fetchDashboardData = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (res.ok) {
        const json: DashboardResponse = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    }
  }, []);

  // Poll for updates every 5 seconds so ESP32 readings appear automatically
  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 5000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  // Handler for "Water now" button: queues a command row into Supabase
  const handleWaterNow = async () => {
    try {
      const res = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "water_now" }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.already_pending) {
          setToastMessage("Already requested");
        } else {
          setToastMessage("Request sent");
        }
        setToastVisible(true);
      } else {
        const errJson = await res.json();
        setToastMessage(errJson.error || "Failed to send request");
        setToastVisible(true);
      }
    } catch {
      setToastMessage("Network error: could not send request");
      setToastVisible(true);
    }
  };

  const isConfigured = data?.configured ?? true;
  const hasReadings = Boolean(data?.has_readings && data?.latest_reading);
  const latest = data?.latest_reading;
  const isOnline = Boolean(hasReadings && data?.device_online);

  return (
    <main className="min-h-screen bg-white">
      {/* Centered responsive container with generous spacing */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 md:py-10 space-y-6">
        {/* 1. Top bar: Branding, connection status pill, and last updated */}
        <div>
          <TopBar
            deviceOnline={isOnline}
            lastSeen={data?.last_seen}
          />
          {/* Small gray note under the top bar when waiting for first reading */}
          {!hasReadings && (
            <p className="text-xs text-gray-400 mt-2">
              Waiting for first reading
            </p>
          )}
        </div>

        {/* Setup Banner: Only shown when Supabase environment variables are missing */}
        {!isConfigured && (
          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-sm">
            <span className="font-semibold">Setup Required:</span> Please configure{" "}
            <code className="font-mono text-xs bg-amber-100 px-1.5 py-0.5 rounded">
              SUPABASE_URL
            </code>{" "}
            and{" "}
            <code className="font-mono text-xs bg-amber-100 px-1.5 py-0.5 rounded">
              SUPABASE_SERVICE_ROLE_KEY
            </code>{" "}
            in your <code className="font-mono text-xs bg-amber-100 px-1.5 py-0.5 rounded">.env.local</code> file.
          </div>
        )}

        {/* 5. Alert banner: appears only when problems are detected */}
        {hasReadings && latest?.problems && (
          <AlertBanner problems={latest.problems} />
        )}

        {/* 2. Four main cards in a 2x2 grid - ALWAYS rendered */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* Card A: Soil Moisture with progress bar and status badge */}
          <SoilMoistureCard
            hasReading={hasReadings}
            soilPct={latest?.soil_pct}
          />

          {/* Card B: Climate showing temperature and humidity */}
          <ClimateCard
            hasReading={hasReadings}
            temperatureC={latest?.temperature_c}
            humidityPct={latest?.humidity_pct}
          />

          {/* Card C: Light showing Sun/Moon icon and Bright/Dark status */}
          <LightCard
            hasReading={hasReadings}
            lightState={latest?.light_state}
          />

          {/* Card D: Pump status, mode, and Water now button */}
          <PumpCard
            hasReading={hasReadings}
            pumpOn={latest?.pump_on ?? false}
            mode={latest?.mode ?? "NORMAL"}
            deviceOnline={isOnline}
            onWaterNow={handleWaterNow}
          />
        </section>

        {/* 3. Soil moisture line chart over the last 24 hours - ALWAYS rendered */}
        <section>
          <SoilHistoryChart data={data?.soil_history || []} />
        </section>

        {/* 4. Recent watering list showing the last 5 events - ALWAYS rendered */}
        <section>
          <RecentWateringList events={data?.recent_watering || []} />
        </section>
      </div>

      {/* Floating feedback toast */}
      <Toast
        message={toastMessage}
        isVisible={toastVisible}
        onClose={() => setToastVisible(false)}
      />
    </main>
  );
}
