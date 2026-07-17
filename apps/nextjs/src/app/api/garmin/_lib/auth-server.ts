// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Base URL of the Garmin auth/sync backend.
 *
 * Configurable via `GARMIN_AUTH_SERVER` so the frontend can point at a hosted
 * backend when deployed standalone (outside the HA addon). Defaults to the
 * addon's local service, so addon behavior is unchanged when the var is unset.
 * A blank/whitespace value is treated as unset (`??` alone would keep an empty
 * string and produce relative-URL fetches). A trailing slash is stripped so
 * callers can safely append `/auth/...` without producing `//`.
 */
export function getAuthServerBase(): string {
  // Server-side only; the `~/env` shim isn't available in route handlers.
  // eslint-disable-next-line no-restricted-properties
  const configured = process.env.GARMIN_AUTH_SERVER?.trim().replace(/\/+$/, "");
  return configured ? configured : "http://127.0.0.1:8099";
}

/** Header the backend reads to scope tokens/sync per user (see request_user.py). */
export const GARMIN_USER_HEADER = "X-PulseCoach-User";

/**
 * Header(s) identifying the acting user to the Garmin backend.
 *
 * Only sent in multi-tenant deployments. In the HA addon single-user mode
 * (`DEV_BYPASS_AUTH=true`) this returns no header, so the backend keeps using
 * its shared token dir and existing addon tokens keep working — forwarding the
 * fabricated `seed-user-001` there would switch the backend to a per-user dir
 * and hide those tokens. When real auth is in effect, the session user id is
 * forwarded so the backend isolates tokens and sync per user.
 */
export async function garminUserHeaders(): Promise<Record<string, string>> {
  // eslint-disable-next-line no-restricted-properties
  if (process.env.DEV_BYPASS_AUTH === "true") return {};
  // Dynamic import keeps `server-only` (and better-auth) out of the module's
  // top level, so unit tests importing getAuthServerBase don't pull it in.
  const { getSession } = await import("~/auth/server");
  const session = await getSession();
  const userId = session?.user?.id;
  return userId ? { [GARMIN_USER_HEADER]: userId } : {};
}
