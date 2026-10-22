import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

// Command expiry window in seconds
const EXPIRY_SECONDS = 120;

export async function GET(req: NextRequest) {
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

  // 2. Connect to Supabase
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Database not configured: Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local" },
      { status: 503 }
    );
  }

  // 3. Mark any pending commands older than 120 seconds as 'rejected'
  const cutoffIso = new Date(Date.now() - EXPIRY_SECONDS * 1000).toISOString();

  await supabase
    .from("commands")
    .update({ status: "rejected" })
    .eq("status", "pending")
    .lt("created_at", cutoffIso);

  // 4. Query for the oldest pending command that is still fresh (created_at >= cutoffIso)
  const { data, error } = await supabase
    .from("commands")
    .select("id, created_at, command, status")
    .eq("status", "pending")
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    return NextResponse.json(
      { error: `Database query failed: ${error.message}` },
      { status: 500 }
    );
  }

  const pendingCommand = data && data.length > 0 ? data[0] : null;

  // Include command's created_at in the response so ESP32 can also check its age
  return NextResponse.json({
    has_pending: Boolean(pendingCommand),
    command: pendingCommand
      ? {
          id: pendingCommand.id,
          command: pendingCommand.command,
          status: pendingCommand.status,
          created_at: pendingCommand.created_at,
        }
      : null,
  });
}
