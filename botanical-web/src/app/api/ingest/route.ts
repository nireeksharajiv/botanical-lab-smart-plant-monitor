import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  // 1. Verify Device Authentication Key
  const configuredDeviceKey = process.env.DEVICE_KEY;
  if (!configuredDeviceKey) {
    return NextResponse.json(
      { error: "Server configuration error: DEVICE_KEY is not configured in .env.local" },
      { status: 500 }
    );
  }

  // Accept key from 'x-device-key' header or 'Authorization: Bearer <key>'
  const headerKey = req.headers.get("x-device-key");
  const authHeader = req.headers.get("authorization");
  const bearerKey = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7).trim()
    : null;

  const providedKey = headerKey || bearerKey;

  if (!providedKey || providedKey !== configuredDeviceKey) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid or missing device key in request header" },
      { status: 401 }
    );
  }

  // 2. Parse and Validate Request JSON
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Bad Request: Malformed JSON body" },
      { status: 400 }
    );
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { error: "Bad Request: Expected a JSON object" },
      { status: 400 }
    );
  }

  const payload = body as Record<string, unknown>;

  // Validation: soil_raw (must be integer number)
  if (typeof payload.soil_raw !== "number" || !Number.isInteger(payload.soil_raw)) {
    return NextResponse.json(
      { error: "Validation error: 'soil_raw' must be an integer" },
      { status: 400 }
    );
  }

  // Validation: soil_pct (float or null)
  if (
    payload.soil_pct !== null &&
    payload.soil_pct !== undefined &&
    typeof payload.soil_pct !== "number"
  ) {
    return NextResponse.json(
      { error: "Validation error: 'soil_pct' must be a number or null" },
      { status: 400 }
    );
  }

  // Validation: temperature_c (float or null)
  if (
    payload.temperature_c !== null &&
    payload.temperature_c !== undefined &&
    typeof payload.temperature_c !== "number"
  ) {
    return NextResponse.json(
      { error: "Validation error: 'temperature_c' must be a number or null" },
      { status: 400 }
    );
  }

  // Validation: humidity_pct (float or null)
  if (
    payload.humidity_pct !== null &&
    payload.humidity_pct !== undefined &&
    typeof payload.humidity_pct !== "number"
  ) {
    return NextResponse.json(
      { error: "Validation error: 'humidity_pct' must be a number or null" },
      { status: 400 }
    );
  }

  // Validation: light_state (string)
  if (typeof payload.light_state !== "string" || !payload.light_state.trim()) {
    return NextResponse.json(
      { error: "Validation error: 'light_state' must be a non-empty string ('BRIGHT' | 'DARK')" },
      { status: 400 }
    );
  }

  // Validation: pump_on (boolean)
  if (typeof payload.pump_on !== "boolean") {
    return NextResponse.json(
      { error: "Validation error: 'pump_on' must be a boolean" },
      { status: 400 }
    );
  }

  // Validation: mode (string)
  if (typeof payload.mode !== "string" || !payload.mode.trim()) {
    return NextResponse.json(
      { error: "Validation error: 'mode' must be a string ('NORMAL' | 'LOW_WATER')" },
      { status: 400 }
    );
  }

  // Validation: problems (array of strings, optional)
  let problemsArray: string[] = [];
  if (payload.problems !== undefined) {
    if (!Array.isArray(payload.problems)) {
      return NextResponse.json(
        { error: "Validation error: 'problems' must be an array of strings" },
        { status: 400 }
      );
    }
    for (const item of payload.problems) {
      if (typeof item !== "string") {
        return NextResponse.json(
          { error: "Validation error: all items in 'problems' must be strings" },
          { status: 400 }
        );
      }
    }
    problemsArray = payload.problems;
  }

  // 3. Connect to Supabase
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Database not configured: Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local" },
      { status: 503 }
    );
  }

  // 4. Insert reading row
  const { data, error } = await supabase
    .from("readings")
    .insert([
      {
        soil_raw: payload.soil_raw,
        soil_pct: payload.soil_pct ?? null,
        temperature_c: payload.temperature_c ?? null,
        humidity_pct: payload.humidity_pct ?? null,
        light_state: payload.light_state.toUpperCase(),
        pump_on: payload.pump_on,
        mode: payload.mode.toUpperCase(),
        problems: problemsArray,
      },
    ])
    .select("id, created_at");

  if (error) {
    return NextResponse.json(
      { error: `Database insert failed: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      id: data?.[0]?.id,
      created_at: data?.[0]?.created_at,
    },
    { status: 201 }
  );
}
