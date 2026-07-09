import { NextResponse } from "next/server";

function getAuthServerBase() {
  // Server-side route in addon container; `~/env` shim isn't available.
  // eslint-disable-next-line no-restricted-properties
  return process.env.GARMIN_AUTH_SERVER ?? "http://127.0.0.1:8099";
}

/**
 * Forward a Google Calendar request to the addon auth server and normalise the
 * response. Shared by the gcal-link and gcal-calendars proxy routes so the
 * 404-degradation and success-flag contract stay in one place.
 */
export async function gcalForward(path: string, init?: RequestInit) {
  try {
    const res = await fetch(`${getAuthServerBase()}${path}`, init);
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
              "Google Calendar linking not available. Update addon to v0.22.0+",
          },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { ...data, success: false },
        { status: res.status },
      );
    }
    return NextResponse.json({ ...data, success: true });
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
