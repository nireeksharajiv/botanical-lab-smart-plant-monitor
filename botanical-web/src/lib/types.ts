// Botanical Lab - Typed Interfaces for Dashboard and Device State

export interface SoilHistoryPoint {
  time: string;
  soil_pct: number;
}

export interface WateringEvent {
  id: string;
  time: string;
  type: "Auto" | "Manual";
  duration_sec: number;
}

export interface LatestReading {
  soil_pct: number | null;
  soil_raw: number;
  temperature_c: number | null;
  humidity_pct: number | null;
  light_state: string;
  pump_on: boolean;
  mode: string;
  problems: string[];
}

export interface DashboardResponse {
  configured: boolean;
  has_readings: boolean;
  device_online: boolean;
  last_seen?: string;
  minutes_ago?: number;
  latest_reading?: LatestReading | null;
  soil_history: SoilHistoryPoint[];
  recent_watering: WateringEvent[];
  error?: string;
  message?: string;
}
