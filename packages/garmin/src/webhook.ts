/**
 * Garmin webhook payload parsing.
 *
 * Signature verification lives in the Next.js route handler
 * (`apps/nextjs/src/app/api/garmin/webhook/route.ts`), which has access to
 * Node's crypto APIs. This package stays runtime-agnostic (no node deps).
 */

import type {
  GarminActivity,
  GarminDailySummary,
  GarminSleepData,
  GarminWebhookPayload,
} from "./types";

/**
 * Parse a raw webhook body into a typed payload with a discriminated type
 * field: 'dailySummary' | 'activity' | 'sleep'.
 */
export function parseWebhookPayload(body: string): GarminWebhookPayload {
  const raw = JSON.parse(body) as Record<string, unknown>;

  const type = detectPayloadType(raw);

  return {
    type,
    userId: (raw.userId as string) ?? "unknown",
    summaryId: raw.summaryId as string | undefined,
    activityId: raw.activityId as string | undefined,
    data: raw as unknown as
      | GarminDailySummary
      | GarminActivity
      | GarminSleepData,
  };
}

function detectPayloadType(
  raw: Record<string, unknown>,
): "dailySummary" | "activity" | "sleep" {
  if ("activityId" in raw || "activityType" in raw) return "activity";
  if ("sleepScoreValue" in raw && !("steps" in raw)) return "sleep";
  return "dailySummary";
}

export type { GarminDailySummary, GarminActivity, GarminSleepData };
