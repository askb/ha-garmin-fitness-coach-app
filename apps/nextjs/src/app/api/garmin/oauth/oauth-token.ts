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
    const basic = Buffer.from(
      `${config.clientId}:${config.clientSecret}`,
    ).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  }

  const res = await fetchImpl(config.tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Garmin token exchange failed: ${res.status}${detail ? ` ${detail}` : ""}`,
    );
  }
  return (await res.json()) as OAuthTokenResponse;
}
