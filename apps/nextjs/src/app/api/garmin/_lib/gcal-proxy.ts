import { NextResponse } from "next/server";

function getAuthServerBase() {
  // Server-side route in addon container; `~/env` shim isn't available.
  // eslint-disable-next-line no-restricted-properties
  return process.env.GARMIN_AUTH_SERVER ?? "http://127.0.0.1:8099";
}

/**
 * Forward a request to the addon auth server and normalise the response.
 * Shared by the gcal-* and interactions proxy routes so the 404-degradation
 * and success-flag contract stay in one place. `unsupportedMessage` is
 * returned when the addon predates the endpoint (auth server 404s).
 */
export async function authForward(
  path: string,
  init: RequestInit | undefined,
  unsupportedMessage: string,
) {
  try {
    const res = await fetch(`${getAuthServerBase()}${path}`, init);
    const text = await res.text();
    let data: Record<string, unknown> = {};
    let isJson = false;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
      isJson = true;
    } catch {
      if (text) data = { message: text.slice(0, 300) };
    }
    if (!res.ok) {
      // A JSON 404 is an endpoint answering (e.g. "not found" for an id);
      // an HTML 404 means the addon predates the endpoint entirely.
      if (res.status === 404 && !isJson) {
        return NextResponse.json(
          { success: false, message: unsupportedMessage },
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

export async function gcalForward(path: string, init?: RequestInit) {
  return authForward(
    path,
    init,
    "Google Calendar linking not available. Update addon to v0.22.0+",
  );
}
