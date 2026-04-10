import { NextResponse } from "next/server";

import type { GarminActivity, GarminDailySummary } from "@acme/garmin/webhook";
import { db } from "@acme/db/client";
import { Activity, DailyMetric } from "@acme/db/schema";
import {
  normalizeActivity,
  normalizeDailySummary,
} from "@acme/garmin/normalize";
import {
  parseWebhookPayload,
  verifyWebhookSignature,
} from "@acme/garmin/webhook";

/** Garmin verification ping. */
export function GET() {
  return NextResponse.json({ status: "ok" });
}

/** Garmin webhook push handler. */
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-garmin-signature") ?? "";

  if (!verifyWebhookSignature(body, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const payload = parseWebhookPayload(body);

    switch (payload.type) {
      case "dailySummary": {
        const normalized = normalizeDailySummary(
          payload.data as GarminDailySummary,
        );
        await db
          .insert(DailyMetric)
          .values({ userId: payload.userId, ...normalized })
          .onConflictDoNothing();
        break;
      }

      case "activity": {
        const normalized = normalizeActivity(payload.data as GarminActivity);
        await db
          .insert(Activity)
          .values({ userId: payload.userId, ...normalized })
          .onConflictDoNothing();
        break;
      }

      // "sleep" and other types are acknowledged but not persisted yet
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[garmin/webhook] Error processing payload:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
