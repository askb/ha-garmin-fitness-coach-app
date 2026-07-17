// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireSession } from "~/auth/guard";
import { buildAuthorizeUrl, getGarminOAuthConfig } from "../oauth-config";
import {
  OAUTH_COOKIE_PATH,
  STATE_COOKIE,
  VERIFIER_COOKIE,
} from "../oauth-cookies";
import { createPkceStart } from "../oauth-pkce";

// User-specific redirect; never cache.
export const dynamic = "force-dynamic";

/**
 * GET /api/garmin/oauth/start — begin the Garmin OAuth 2.0 + PKCE flow.
 *
 * Inert (501) until Garmin OAuth is configured (Path B). Generates a PKCE
 * verifier/challenge + CSRF state, stashes verifier+state in short-lived
 * httpOnly cookies, and redirects the user to Garmin's consent screen.
 */
export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;

  const config = getGarminOAuthConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Garmin OAuth is not configured" },
      { status: 501 },
    );
  }

  const { verifier, challenge, state } = createPkceStart();
  const jar = await cookies();
  // eslint-disable-next-line no-restricted-properties -- server route: `~/env` shim unavailable
  const secure = process.env.NODE_ENV === "production";
  const opts = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const, // survive the top-level GET redirect back from Garmin
    path: OAUTH_COOKIE_PATH,
    maxAge: 600,
  };
  jar.set(VERIFIER_COOKIE, verifier, opts);
  jar.set(STATE_COOKIE, state, opts);

  return NextResponse.redirect(buildAuthorizeUrl(config, challenge, state));
}
