/**
 * Garmin OAuth 1.0a stub.
 *
 * TODO: Garmin uses OAuth 1.0a (NOT 2.0). The real implementation will need
 *       the `oauth-1.0a` npm package for request-signing with consumer key,
 *       consumer secret, and HMAC-SHA1 signatures.
 *
 * TODO: Replace stubs with actual Garmin Connect API calls once the API key
 *       is approved. See: https://developer.garmin.com/gc-developer-program/
 */

import type { GarminOAuthTokens } from "./types";

const MOCK_GARMIN_AUTH_URL =
  "https://connect.garmin.com/oauthConfirm?oauth_token=mock_request_token";

/**
 * Initiate the OAuth 1.0a flow by requesting a temporary token from Garmin
 * and returning the authorization URL the user should be redirected to.
 *
 * TODO: Real implementation needs:
 *   1. POST to Garmin request-token endpoint with signed OAuth header
 *   2. Store the temporary oauth_token_secret server-side
 *   3. Return the redirect URL with the real oauth_token
 */
export function initiateOAuth(): { authUrl: string; oauthTokenSecret: string } {
  return {
    authUrl: MOCK_GARMIN_AUTH_URL,
    oauthTokenSecret: "mock_token_secret_store_in_session",
  };
}

/**
 * Exchange the callback parameters for permanent access tokens.
 *
 * TODO: Real implementation needs:
 *   1. Sign a POST to the Garmin access-token endpoint using the
 *      oauth_token, oauth_verifier, and stored oauth_token_secret
 *   2. Parse the response for the permanent access token / secret pair
 */
export function handleCallback(
  _oauthToken: string,
  _oauthVerifier: string,
): GarminOAuthTokens {
  return {
    accessToken: "mock_garmin_access_token",
    refreshToken: "mock_garmin_refresh_token",
    garminUserId: "garmin-user-mock-001",
  };
}

/**
 * Refresh an expired token pair.
 *
 * TODO: Garmin OAuth 1.0a tokens generally don't expire, but the real
 *       implementation should handle token revocation and re-authorization.
 */
export function refreshTokens(_refreshToken: string): GarminOAuthTokens {
  return {
    accessToken: "mock_garmin_access_token_refreshed",
    refreshToken: "mock_garmin_refresh_token_refreshed",
    garminUserId: "garmin-user-mock-001",
  };
}
