// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Garmin OAuth 2.0 configuration, read from the environment.
 *
 * The whole OAuth flow is **inert until configured**: `getGarminOAuthConfig()`
 * returns `null` unless the required Garmin credentials/URLs are present. The
 * HA addon and the current (garth-based) app never set these, so the OAuth
 * routes are dormant there and behavior is unchanged. Real values arrive only
 * after the Garmin Developer Program approval (Path B).
 *
 * Env vars (all placeholders until approval):
 *   GARMIN_OAUTH_CLIENT_ID       — OAuth client id
 *   GARMIN_OAUTH_CLIENT_SECRET   — OAuth client secret (if the token endpoint
 *                                  requires client auth; PKCE public clients may
 *                                  omit it)
 *   GARMIN_OAUTH_AUTHORIZE_URL   — Garmin authorize endpoint
 *   GARMIN_OAUTH_TOKEN_URL       — Garmin token endpoint
 *   GARMIN_OAUTH_REDIRECT_URI    — our registered callback URL
 *   GARMIN_OAUTH_SCOPES          — space-separated scopes (e.g. HEALTH_EXPORT ACTIVITY_EXPORT)
 */

export interface GarminOAuthConfig {
  clientId: string;
  clientSecret: string | null;
  authorizeUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scopes: string;
}

// eslint-disable-next-line no-restricted-properties -- server route: `~/env` shim unavailable
const env = () => process.env;

function nonBlank(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

/** Accept only well-formed http(s) URLs so a typo can't throw mid-flow. */
function validHttpUrl(u: string): boolean {
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Resolve the Garmin OAuth config, or `null` if the flow isn't configured.
 *
 * Requires client id + valid authorize/token/redirect URLs. `clientSecret` and
 * `scopes` are optional (public PKCE client / provider default scopes). A
 * malformed URL is treated as "not configured" (stays inert / 501) rather than
 * throwing later when the URL is used.
 */
export function getGarminOAuthConfig(): GarminOAuthConfig | null {
  const e = env();
  const clientId = nonBlank(e.GARMIN_OAUTH_CLIENT_ID);
  const authorizeUrl = nonBlank(e.GARMIN_OAUTH_AUTHORIZE_URL);
  const tokenUrl = nonBlank(e.GARMIN_OAUTH_TOKEN_URL);
  const redirectUri = nonBlank(e.GARMIN_OAUTH_REDIRECT_URI);

  if (!clientId || !authorizeUrl || !tokenUrl || !redirectUri) return null;
  if (![authorizeUrl, tokenUrl, redirectUri].every(validHttpUrl)) return null;

  return {
    clientId,
    clientSecret: nonBlank(e.GARMIN_OAUTH_CLIENT_SECRET) ?? null,
    authorizeUrl,
    tokenUrl,
    redirectUri,
    scopes: nonBlank(e.GARMIN_OAUTH_SCOPES) ?? "",
  };
}

/** True when the Garmin OAuth flow is configured (Path B enabled). */
export function isGarminOAuthEnabled(): boolean {
  return getGarminOAuthConfig() !== null;
}

/** Build the authorize-endpoint redirect URL for an authorization-code flow. */
export function buildAuthorizeUrl(
  config: GarminOAuthConfig,
  challenge: string,
  state: string,
): string {
  const url = new URL(config.authorizeUrl);
  const p = url.searchParams;
  p.set("response_type", "code");
  p.set("client_id", config.clientId);
  p.set("redirect_uri", config.redirectUri);
  p.set("code_challenge", challenge);
  p.set("code_challenge_method", "S256");
  p.set("state", state);
  if (config.scopes) p.set("scope", config.scopes);
  return url.toString();
}
