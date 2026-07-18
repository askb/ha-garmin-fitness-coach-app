// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
/**
 * Parsing for the **official Garmin Health API** push notifications (Path B, B4).
 *
 * The Health API "Push" model POSTs a JSON envelope whose top-level keys are
 * summary-type collections, each an array of per-user summaries carrying
 * Garmin's own `userId` (their API user id, NOT ours):
 *
 *   {
 *     "dailies":    [ { "userId": "…", "summaryId": "…", "calendarDate": "…", … } ],
 *     "activities": [ { "userId": "…", "summaryId": "…", … } ],
 *     "sleeps":     [ … ], "epochs": [ … ], "userMetrics": [ … ], …
 *   }
 *
 * IMPORTANT: the exact field names/shapes above are from Garmin's public docs
 * and are NOT yet verified against a live tenant — the real payloads are behind
 * Developer Program approval. This module only extracts the routing envelope
 * (which user + which type); mapping individual fields into our schema is a
 * TODO that must be validated in the eval environment before it persists
 * anything. Until then the receiver logs and acknowledges without writing.
 */

/** A known Health API summary collection key → our internal summary "type". */
export const GARMIN_SUMMARY_COLLECTIONS = {
  dailies: "dailySummary",
  activities: "activity",
  activityDetails: "activityDetail",
  sleeps: "sleep",
  epochs: "epoch",
  userMetrics: "userMetrics",
  bodyComps: "bodyComposition",
  stressDetails: "stress",
  pulseOx: "pulseOx",
  respiration: "respiration",
  hrv: "hrv",
} as const;

export type GarminSummaryType =
  (typeof GARMIN_SUMMARY_COLLECTIONS)[keyof typeof GARMIN_SUMMARY_COLLECTIONS];

export interface GarminPushSummary {
  /** Garmin's user id (`userId` in the payload) — maps to our user via the store. */
  garminUserId: string;
  /** Normalised summary type derived from the collection key. */
  type: GarminSummaryType;
  /** The raw summary object, for field mapping once validated (B4 follow-up). */
  summary: Record<string, unknown>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Flatten a Health API push envelope into a list of `{ garminUserId, type,
 * summary }`. Unknown collection keys and entries missing a `userId` are
 * skipped rather than throwing, so a payload shape we don't recognise yet can't
 * take the receiver down. Throws (SyntaxError) on invalid JSON, and (Error) when
 * the top-level JSON is valid but not an object.
 */
export function parseGarminPush(body: string): GarminPushSummary[] {
  const parsed: unknown = JSON.parse(body);
  if (!isRecord(parsed)) {
    throw new Error("Garmin push payload is not a JSON object");
  }

  const out: GarminPushSummary[] = [];
  for (const [key, type] of Object.entries(GARMIN_SUMMARY_COLLECTIONS)) {
    const collection = parsed[key];
    if (!Array.isArray(collection)) continue;
    for (const entry of collection) {
      if (!isRecord(entry)) continue;
      const garminUserId = entry.userId;
      if (typeof garminUserId !== "string" || garminUserId.length === 0) {
        continue;
      }
      out.push({ garminUserId, type, summary: entry });
    }
  }
  return out;
}
