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
