// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
import type { GarminOAuthConfig } from "./oauth-config";
import type { OAuthTokenResponse } from "./oauth-token";

/**
 * Refresh an access token using a stored refresh token (RFC 6749 §6).
 *
 * Standard `grant_type=refresh_token` request; the Garmin endpoint comes from
 * config. Pure (injectable `fetch`) so it's unit-testable without network or
 * credentials. Confidential clients authenticate with HTTP Basic (form-encoded
 * per §2.3.1); public PKCE clients omit it.
 */
export async function refreshAccessToken(
  config: GarminOAuthConfig,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (config.clientSecret) {
    const cred = `${formUrlEncode(config.clientId)}:${formUrlEncode(config.clientSecret)}`;
    headers.Authorization = `Basic ${Buffer.from(cred).toString("base64")}`;
  }

  const res = await fetchImpl(config.tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(
      `Garmin token refresh failed: ${res.status}${detail ? ` ${detail}` : ""}`,
    );
  }
  return (await res.json()) as OAuthTokenResponse;
}

/**
 * True when `expiresAt` is at/near expiry (within `skewSeconds`, default 60),
 * i.e. the caller should refresh before using the token. Null expiry (unknown)
 * is treated as "refresh to be safe".
 */
export function needsRefresh(
  expiresAt: Date | null,
  now: Date = new Date(),
  skewSeconds = 60,
): boolean {
  if (!expiresAt) return true;
  return expiresAt.getTime() - now.getTime() <= skewSeconds * 1000;
}

/** application/x-www-form-urlencoded encoding (space → `+`, escaping sub-delims). */
function formUrlEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/%20/g, "+")
    .replace(
      /[!'()*]/g,
      (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase(),
    );
}
