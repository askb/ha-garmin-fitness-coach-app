import "server-only";

import { NextResponse } from "next/server";

import { getSession } from "~/auth/server";

/**
 * Session guard for operational Garmin API routes (auth/sync/recompute).
 *
 * Mirrors the tRPC protected-procedure bypass (packages/api/src/trpc.ts):
 * inside the HA add-on, authentication is enforced by Home Assistant ingress
 * and `DEV_BYPASS_AUTH=true` is set, so no app session exists; local dev is
 * also exempt. In every other deployment a valid session is required —
 * without this, any unauthenticated caller could trigger Garmin logins,
 * token imports, logouts, syncs, and recomputes.
 *
 * @returns a 401 response to short-circuit with, or `null` when allowed.
 */
export async function requireSession(): Promise<NextResponse | null> {
  // Server-side route guard: `~/env` shim isn't available here.
  // eslint-disable-next-line no-restricted-properties
  if (process.env.DEV_BYPASS_AUTH === "true") return null;
  // eslint-disable-next-line no-restricted-properties
  if (process.env.NODE_ENV !== "production") return null;

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }
  return null;
}
