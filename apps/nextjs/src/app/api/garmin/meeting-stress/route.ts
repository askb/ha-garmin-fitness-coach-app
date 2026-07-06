import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getAuthServerBase() {
  // Server-side route in addon container; `~/env` shim isn't available.
  // eslint-disable-next-line no-restricted-properties
  return process.env.GARMIN_AUTH_SERVER ?? "http://127.0.0.1:8099";
}

export async function POST() {
  try {
    const res = await fetch(`${getAuthServerBase()}/auth/meeting-stress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      if (text) data = { message: text.slice(0, 300) };
    }
    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Meeting stress endpoint not available. Update addon to v0.20.0+",
          },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { success: false, ...data },
        { status: res.status },
      );
    }
    return NextResponse.json({ success: true, ...data });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : "Connection error",
      },
      { status: 502 },
    );
  }
}

export async function GET() {
  try {
    const res = await fetch(
      `${getAuthServerBase()}/auth/meeting-stress-status`,
    );
    if (!res.ok) {
      // Distinguish "addon too old" so the UI can suggest an update.
      return NextResponse.json({
        running: false,
        unsupported: res.status === 404,
      });
    }
    const data = (await res.json()) as Record<string, unknown>;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ running: false, unreachable: true });
  }
}
