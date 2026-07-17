import { NextResponse } from "next/server";

import { requireSession } from "~/auth/guard";
import { getAuthServerBase } from "../_lib/auth-server";

export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await requireSession();
  if (denied) return denied;
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
  const denied = await requireSession();
  if (denied) return denied;
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
