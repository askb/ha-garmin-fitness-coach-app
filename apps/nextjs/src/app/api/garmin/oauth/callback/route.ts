// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireSession } from "~/auth/guard";
import { getGarminOAuthConfig } from "../oauth-config";
import {
  OAUTH_COOKIE_PATH,
  STATE_COOKIE,
  VERIFIER_COOKIE,
} from "../oauth-cookies";
import { exchangeCodeForTokens } from "../oauth-token";

export const dynamic = "force-dynamic";

/**
 * GET /api/garmin/oauth/callback — Garmin redirects here after consent.
 *
 * Inert (501) until Garmin OAuth is configured (Path B). Validates the CSRF
 * `state` against the cookie, exchanges the `code` (+ PKCE verifier) for tokens,
 * and hands off to token persistence.
 *
 * TODO(B2): persist the tokens encrypted, keyed by the session user id. Until
 * B2 lands, the exchange proves the flow end-to-end but tokens are not stored.
 */
export async function GET(req: NextRequest) {
  const denied = await requireSession();
  if (denied) {
    // Reached via Garmin's browser redirect — send unauthenticated users to
    // login rather than returning a raw 401.
    return NextResponse.redirect(new URL("/", req.url));
  }

  const config = getGarminOAuthConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Garmin OAuth is not configured" },
      { status: 501 },
    );
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const jar = await cookies();
  const verifier = jar.get(VERIFIER_COOKIE)?.value;
  const savedState = jar.get(STATE_COOKIE)?.value;
  // One-shot: clear the flow cookies (matching the path they were set with).
  jar.delete({ name: VERIFIER_COOKIE, path: OAUTH_COOKIE_PATH });
  jar.delete({ name: STATE_COOKIE, path: OAUTH_COOKIE_PATH });

  if (oauthError) {
    return NextResponse.redirect(new URL("/settings?garmin=denied", req.url));
  }
  if (!code || !state || !verifier || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/settings?garmin=invalid", req.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(config, code, verifier);
    if (!tokens.access_token) {
      return NextResponse.redirect(new URL("/settings?garmin=error", req.url));
    }
    // Associate the tokens with the logged-in user and persist encrypted.
    const { getSession } = await import("~/auth/server");
    const session = await getSession();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    const { persistGarminOAuthTokens } = await import("../garmin-oauth-store");
    await persistGarminOAuthTokens(userId, tokens);
    return NextResponse.redirect(
      new URL("/settings?garmin=connected", req.url),
    );
  } catch {
    // Never surface token-endpoint/DB detail to the client.
    return NextResponse.redirect(new URL("/settings?garmin=error", req.url));
  }
}
