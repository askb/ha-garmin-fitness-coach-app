import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import type { GarminActivity, GarminDailySummary } from "@acme/garmin/webhook";
import { db } from "@acme/db/client";
import { Activity, DailyMetric } from "@acme/db/schema";
import {
  normalizeActivity,
  normalizeDailySummary,
} from "@acme/garmin/normalize";
import { parseWebhookPayload } from "@acme/garmin/webhook";

/**
 * Verify the Garmin webhook signature with HMAC-SHA256 over the raw body.
 * Fails closed: returns false when the secret or signature is missing/invalid.
 */
function verifyGarminSignature(
  body: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature) return false;

  const provided = signature.startsWith("sha256=")
    ? signature.slice("sha256=".length)
    : signature;

  // A SHA-256 HMAC is always 64 hex chars. Reject anything else *before*
  // computing the HMAC, so malformed input can't force needless work and the
  // subsequent constant-time compare always has equal-length buffers.
  if (!/^[0-9a-fA-F]{64}$/.test(provided)) return false;

  const expected = createHmac("sha256", secret).update(body).digest("hex");

  return timingSafeEqual(
    Buffer.from(provided, "hex"),
    Buffer.from(expected, "hex"),
  );
}

/** Garmin verification ping. */
export function GET() {
  return NextResponse.json({ status: "ok" });
}

/** Garmin webhook push handler. */
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-garmin-signature") ?? "";

  // Fail closed: without a configured signing secret we cannot authenticate
  // the sender, so reject all pushes rather than trusting forged payloads.
  // eslint-disable-next-line no-restricted-properties
  const secret = process.env.GARMIN_WEBHOOK_SECRET;
  if (!secret) {
    console.error(
      "[garmin/webhook] GARMIN_WEBHOOK_SECRET is not set; rejecting request",
    );
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 503 },
    );
  }

  if (!verifyGarminSignature(body, signature, secret)) {
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
