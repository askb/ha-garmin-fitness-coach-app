// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { findUserIdByGarminUserId } from "../garmin-oauth-store";
import { parseGarminPush } from "../webhook-parse";

/**
 * Official **Garmin Health API** push-notification receiver (Path B, B4).
 *
 * SKELETON — inert until Path B is live. Gated behind
 * `GARMIN_HEALTH_WEBHOOK_ENABLED=true`; otherwise every request gets 503 so the
 * HA addon and the current (garth-based) deployment are unaffected.
 *
 * Sender authentication: unlike our self-hosted addon webhook (which HMAC-signs
 * with a shared secret at `/api/garmin/webhook`), the official Health API does
 * NOT sign pushes. Garmin's guidance is to (a) allowlist Garmin's source IPs at
 * the edge and (b) only act on summaries whose `userId` maps to a user who has
 * actually connected. We additionally support an optional shared secret
 * (`GARMIN_HEALTH_WEBHOOK_TOKEN`, matched against the `token` query param) for
 * integrators who register the webhook URL with one; it is enforced fail-closed
 * only when configured.
 *
 * Persistence of the summaries is intentionally NOT implemented here: the real
 * payload field shapes are behind Developer Program approval and must be
 * validated in the eval environment first (see webhook-parse.ts). For now the
 * receiver authenticates, resolves the user, and acknowledges — writing nothing.
 */

// eslint-disable-next-line no-restricted-properties -- server route: `~/env` shim unavailable
const env = () => process.env;

/** Reject pushes larger than this before parsing (unsigned endpoint → DoS guard). */
const MAX_BODY_BYTES = 1_000_000; // 1 MB

function isEnabled(): boolean {
  return env().GARMIN_HEALTH_WEBHOOK_ENABLED === "true";
}

/** Constant-time compare for the optional shared-secret token. */
function tokenMatches(provided: string | null): boolean {
  const expected = env().GARMIN_HEALTH_WEBHOOK_TOKEN?.trim();
  if (!expected) return true; // no token configured → this check is a no-op
  // Cheap length gate first so a huge `?token=` can't force Buffer allocation.
  if (!provided || provided.length !== expected.length) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 401 response if the optional shared secret is set and doesn't match. */
function tokenGuard(request: Request): NextResponse | null {
  const token = new URL(request.url).searchParams.get("token");
  return tokenMatches(token)
    ? null
    : NextResponse.json({ error: "Invalid token" }, { status: 401 });
}

/** Endpoint reachability / verification check. */
export function GET(request: Request) {
  if (!isEnabled()) {
    return NextResponse.json({ error: "Not enabled" }, { status: 503 });
  }
  return tokenGuard(request) ?? NextResponse.json({ status: "ok" });
}

/** Garmin Health API push handler. */
export async function POST(request: Request) {
  if (!isEnabled()) {
    return NextResponse.json({ error: "Not enabled" }, { status: 503 });
  }

  const denied = tokenGuard(request);
  if (denied) return denied;

  // Size guard before reading/parsing (endpoint is unsigned).
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const body = await request.text();
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let summaries;
  try {
    summaries = parseGarminPush(body);
  } catch (error) {
    console.error("[garmin/oauth/webhook] Malformed push payload:", error);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // Cache lookups per request so repeated garminUserIds hit the DB once.
  const userIdCache = new Map<string, string | null>();
  const resolveUserId = async (
    garminUserId: string,
  ): Promise<string | null> => {
    const cached = userIdCache.get(garminUserId);
    if (cached !== undefined) return cached;
    const userId = await findUserIdByGarminUserId(garminUserId);
    userIdCache.set(garminUserId, userId);
    return userId;
  };

  let matched = 0;
  let skipped = 0;
  for (const { garminUserId } of summaries) {
    const userId = await resolveUserId(garminUserId);
    if (!userId) {
      skipped++;
      continue;
    }
    matched++;
    // TODO(B4): once payload shapes are validated in the eval env, map each
    // `summary`'s fields into our schema (Activity / DailyMetric / …) keyed by
    // `type` and `userId`, mirroring the addon webhook's normalize+insert path.
  }

  // One aggregated line, no user identifiers.
  console.info(
    `[garmin/oauth/webhook] processed ${summaries.length} summaries: ${matched} matched, ${skipped} skipped (persist pending B4 validation)`,
  );

  // Ack quickly (Garmin retries on non-2xx). Nothing is persisted yet.
  return NextResponse.json({ received: summaries.length, matched, skipped });
}
