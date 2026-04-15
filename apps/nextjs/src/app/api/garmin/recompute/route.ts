import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getAuthServerBase() {
  return process.env.GARMIN_AUTH_SERVER ?? "http://127.0.0.1:8099";
}

export async function POST() {
  try {
    const res = await fetch(`${getAuthServerBase()}/auth/recompute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      // Fallback: if addon doesn't support /auth/recompute yet, return helpful message
      if (res.status === 404) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Recompute endpoint not available. Update addon to v0.16.0+",
          },
          { status: 404 },
        );
      }
      const body = await res.text().catch(() => "");
      return NextResponse.json(
        { success: false, message: body || "Recompute failed" },
        { status: res.status },
      );
    }

    const data = (await res.json()) as Record<string, unknown>;
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
    const res = await fetch(`${getAuthServerBase()}/auth/recompute-status`);
    if (!res.ok) {
      return NextResponse.json({ status: "unknown" });
    }
    const data = (await res.json()) as Record<string, unknown>;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ status: "unknown" });
  }
}
