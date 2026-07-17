// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
import type { NextRequest } from "next/server";
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
export async function GET(req: NextRequest) {
  // Defense-in-depth: don't let another origin initiate an OAuth flow for a
  // logged-in user via a cross-site top-level GET. Same-origin/same-site and
  // direct navigation (`none`) are allowed; browsers without the header pass.
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json(
      { error: "Cross-site request rejected" },
      { status: 403 },
    );
  }

  const denied = await requireSession();
  if (denied) {
    // Browser navigation, not an XHR — send unauthenticated users to login.
    return NextResponse.redirect(new URL("/", req.url));
  }

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
