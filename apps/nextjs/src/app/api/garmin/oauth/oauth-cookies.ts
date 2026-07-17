// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared cookie names/path for the Garmin OAuth PKCE flow, so `start` and
 * `callback` agree without importing one route handler into the other.
 * The path must match on set (start) and delete (callback).
 */
export const VERIFIER_COOKIE = "garmin_oauth_verifier";
export const STATE_COOKIE = "garmin_oauth_state";
export const OAUTH_COOKIE_PATH = "/api/garmin/oauth";
