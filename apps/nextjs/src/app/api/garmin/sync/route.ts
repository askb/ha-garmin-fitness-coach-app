import { NextResponse } from "next/server";

const AUTH_SERVER = "http://127.0.0.1:8099";
const IS_ADDON = process.env.NODE_ENV === "production";

let mockSyncing = false;

/** GET /api/garmin/sync — get sync status */
export async function GET() {
  if (!IS_ADDON) {
    return NextResponse.json({
      syncing: mockSyncing,
      phase: mockSyncing ? "daily_stats" : "idle",
      detail: mockSyncing ? "Syncing 2025-03-22" : "",
      progress: mockSyncing ? 42 : 100,
    });
  }
  try {
    const res = await fetch(`${AUTH_SERVER}/auth/sync-status`);
    const data: unknown = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({
      syncing: false,
      phase: "idle",
      detail: "",
      progress: 100,
    });
  }
}

/** POST /api/garmin/sync — trigger manual sync */
export async function POST() {
  if (!IS_ADDON) {
    mockSyncing = true;
    setTimeout(() => {
      mockSyncing = false;
    }, 10000);
    return NextResponse.json({ success: true, message: "Mock sync started" });
  }
  try {
    const res = await fetch(`${AUTH_SERVER}/auth/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data: unknown = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to reach sync service" },
      { status: 502 },
    );
  }
}
