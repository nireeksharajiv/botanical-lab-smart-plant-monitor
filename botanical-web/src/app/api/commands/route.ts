import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

// Command expiry window in seconds
const EXPIRY_SECONDS = 120;

export async function POST(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const payload = (typeof body === "object" && body !== null ? body : {}) as {
    command?: string;
  };

  const commandName = payload.command || "water_now";

  // Connect to Supabase
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Database not configured: Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local" },
      { status: 503 }
    );
  }

  const cutoffIso = new Date(Date.now() - EXPIRY_SECONDS * 1000).toISOString();

  // 1. Mark any stale pending commands older than 120s as 'rejected'
  await supabase
    .from("commands")
    .update({ status: "rejected" })
    .eq("command", commandName)
    .eq("status", "pending")
    .lt("created_at", cutoffIso);

  // 2. Check if this command is already pending and fresh (created within last 120s)
  const { data: existingFresh, error: checkError } = await supabase
    .from("commands")
    .select("id, created_at, command, status")
    .eq("command", commandName)
    .eq("status", "pending")
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .limit(1);

  if (checkError) {
    return NextResponse.json(
      { error: `Failed to check existing commands: ${checkError.message}` },
      { status: 500 }
    );
  }

  // If already pending and fresh, return the existing one without inserting another
  if (existingFresh && existingFresh.length > 0) {
    return NextResponse.json(
      {
        success: true,
        already_pending: true,
        command: existingFresh[0],
      },
      { status: 200 }
    );
  }

  // 3. Otherwise, insert a new pending command
  const { data, error } = await supabase
    .from("commands")
    .insert([
      {
        command: commandName,
        status: "pending",
      },
    ])
    .select("id, created_at, command, status");

  if (error) {
    return NextResponse.json(
      { error: `Failed to insert command: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      already_pending: false,
      command: data?.[0],
    },
    { status: 201 }
  );
}
