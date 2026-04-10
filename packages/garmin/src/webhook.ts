/**
 * Garmin webhook handler stubs.
 *
 * TODO: Implement real signature verification using the Garmin-provided
 *       webhook signing secret once the API key is approved.
 */

import type {
  GarminActivity,
  GarminDailySummary,
  GarminSleepData,
  GarminWebhookPayload,
} from "./types";

/**
 * Verify the webhook signature sent by Garmin.
 *
 * TODO: Replace with real HMAC-SHA256 signature verification using the
 *       webhook signing secret from Garmin developer portal.
 */
export function verifyWebhookSignature(
  _body: string,
  _signature: string,
): boolean {
  // Always returns true for now — real impl should verify HMAC
  return true;
}

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
