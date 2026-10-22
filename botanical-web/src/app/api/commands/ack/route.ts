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

  // 2. Parse request body
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is acceptable; will acknowledge oldest pending command
    body = {};
  }

  const payload = (typeof body === "object" && body !== null ? body : {}) as {
    id?: number;
    status?: "done" | "rejected";
    duration_seconds?: number;
    source?: "auto" | "manual";
  };

  const newStatus = payload.status === "rejected" ? "rejected" : "done";

  // 3. Connect to Supabase
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Database not configured: Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local" },
      { status: 503 }
    );
  }

  let targetCommandId = payload.id;

  // If command id was not provided, look up the oldest pending command
  if (!targetCommandId) {
    const { data: pendingRows } = await supabase
      .from("commands")
      .select("id")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1);

    if (pendingRows && pendingRows.length > 0) {
      targetCommandId = pendingRows[0].id;
    }
  }

  if (!targetCommandId) {
    return NextResponse.json(
      { error: "No pending command found to acknowledge" },
      { status: 404 }
    );
  }

  // 4. Update the command status
  const { error: updateError } = await supabase
    .from("commands")
    .update({ status: newStatus })
    .eq("id", targetCommandId);

  if (updateError) {
    return NextResponse.json(
      { error: `Failed to update command: ${updateError.message}` },
      { status: 500 }
    );
  }

  // 5. If duration_seconds was reported, record in watering_events table
  if (typeof payload.duration_seconds === "number" && payload.duration_seconds > 0) {
    await supabase.from("watering_events").insert([
      {
        duration_seconds: payload.duration_seconds,
        source: payload.source === "auto" ? "auto" : "manual",
      },
    ]);
  }

  return NextResponse.json({
    success: true,
    command_id: targetCommandId,
    status: newStatus,
  });
}
