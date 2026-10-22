import { NextResponse } from "next/server";
import { getSupabaseServerClient, ReadingRow, WateringEventRow } from "@/lib/supabaseServer";

// Format ISO timestamp into clean human time (e.g., "14:30" or "Yesterday 18:20")
function formatEventTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const timeStr = `${hours}:${minutes}`;

  if (isToday) {
    return timeStr;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return `Yesterday ${timeStr}`;
  }

  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${month}/${day} ${timeStr}`;
}

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({
      configured: false,
      has_readings: false,
      message: "Supabase credentials are not configured in .env.local",
    });
  }

  try {
    // 1. Fetch latest reading
    const { data: latestRows, error: latestError } = await supabase
      .from("readings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);

    if (latestError) {
      return NextResponse.json(
        { error: `Failed to fetch readings: ${latestError.message}` },
        { status: 500 }
      );
    }

    // If no readings exist in the database table yet
    if (!latestRows || latestRows.length === 0) {
      return NextResponse.json({
        configured: true,
        has_readings: false,
        latest_reading: null,
        device_online: false,
        soil_history: [],
        recent_watering: [],
      });
    }

    const latest = latestRows[0] as ReadingRow;

    // Check device online status: online if last reading is within 5 minutes
    const lastSeenMs = new Date(latest.created_at).getTime();
    const diffMinutes = Math.floor((Date.now() - lastSeenMs) / (1000 * 60));
    const deviceOnline = diffMinutes <= 5;

    // 2. Fetch last 24 hours of soil moisture for the chart
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: historyRows } = await supabase
      .from("readings")
      .select("created_at, soil_pct")
      .gte("created_at", twentyFourHoursAgo)
      .order("created_at", { ascending: true });

    const soilHistory = (historyRows || [])
      .filter((row) => row.soil_pct !== null)
      .map((row) => {
        const d = new Date(row.created_at);
        const time = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
        return {
          time,
          soil_pct: Math.round(row.soil_pct * 10) / 10,
        };
      });

    // 3. Fetch last 5 watering events
    const { data: wateringRows } = await supabase
      .from("watering_events")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(5);

    const recentWatering = ((wateringRows as WateringEventRow[]) || []).map((event) => ({
      id: event.id.toString(),
      time: formatEventTime(event.started_at),
      type: event.source === "auto" ? ("Auto" as const) : ("Manual" as const),
      duration_sec: event.duration_seconds,
    }));

    return NextResponse.json({
      configured: true,
      has_readings: true,
      device_online: deviceOnline,
      last_seen: latest.created_at,
      minutes_ago: diffMinutes > 0 ? diffMinutes : 1,
      latest_reading: {
        soil_pct: latest.soil_pct,
        soil_raw: latest.soil_raw,
        temperature_c: latest.temperature_c,
        humidity_pct: latest.humidity_pct,
        light_state: latest.light_state,
        pump_on: latest.pump_on,
        mode: latest.mode,
        problems: latest.problems || [],
      },
      soil_history: soilHistory,
      recent_watering: recentWatering,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Internal server error: ${message}` },
      { status: 500 }
    );
  }
}
