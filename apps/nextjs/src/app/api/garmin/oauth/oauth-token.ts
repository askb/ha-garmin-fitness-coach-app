// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
import type { GarminOAuthConfig } from "./oauth-config";

/** Standard OAuth 2.0 token response (RFC 6749 §5.1). */
export interface OAuthTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * Exchange an authorization code for tokens (authorization_code + PKCE).
 *
 * Standard RFC 6749/7636 request; the Garmin-specific endpoint comes from
 * config. A confidential client (clientSecret present) authenticates with HTTP
 * Basic; a public PKCE client omits it. Kept as a pure function taking `fetch`
 * so it can be unit-tested without network or credentials.
 */
export async function exchangeCodeForTokens(
  config: GarminOAuthConfig,
  code: string,
  codeVerifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    code_verifier: codeVerifier,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (config.clientSecret) {
    // RFC 6749 §2.3.1: form-urlencode the id and secret before base64.
    const cred = `${formUrlEncode(config.clientId)}:${formUrlEncode(config.clientSecret)}`;
    headers.Authorization = `Basic ${Buffer.from(cred).toString("base64")}`;
  }

  const res = await fetchImpl(config.tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });
  if (!res.ok) {
    // Cap the detail — token endpoints can return large HTML error pages.
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(
      `Garmin token exchange failed: ${res.status}${detail ? ` ${detail}` : ""}`,
    );
  }
  return (await res.json()) as OAuthTokenResponse;
}

/** application/x-www-form-urlencoded encoding (space → `+`, escaping the
 * sub-delims `encodeURIComponent` leaves: `! ' ( ) *`). */
function formUrlEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/%20/g, "+")
    .replace(
      /[!'()*]/g,
      (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase(),
    );
}
