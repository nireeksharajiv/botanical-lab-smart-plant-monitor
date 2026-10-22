import { createClient } from "@supabase/supabase-js";

// Database row interfaces matching the Supabase schema
export interface ReadingRow {
  id: number;
  created_at: string;
  soil_raw: number;
  soil_pct: number | null;
  temperature_c: number | null;
  humidity_pct: number | null;
  light_state: string;
  pump_on: boolean;
  mode: string;
  problems: string[];
}

export interface WateringEventRow {
  id: number;
  started_at: string;
  duration_seconds: number;
  source: "auto" | "manual";
}

export interface CommandRow {
  id: number;
  created_at: string;
  command: string;
  status: "pending" | "done" | "rejected";
}

// Server-side Supabase client singleton using the service-role key
// IMPORTANT: This file must ONLY be imported in server-side routes or Server Components.
export function getSupabaseServerClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
