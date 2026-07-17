// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
/* eslint-disable no-restricted-properties -- test manipulates the raw Garmin OAuth env by design */
import {
  buildAuthorizeUrl,
  getGarminOAuthConfig,
  isGarminOAuthEnabled,
} from "./oauth-config";

const KEYS = [
  "GARMIN_OAUTH_CLIENT_ID",
  "GARMIN_OAUTH_CLIENT_SECRET",
  "GARMIN_OAUTH_AUTHORIZE_URL",
  "GARMIN_OAUTH_TOKEN_URL",
  "GARMIN_OAUTH_REDIRECT_URI",
  "GARMIN_OAUTH_SCOPES",
];

const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function configure(secret = true, scopes = true) {
  process.env.GARMIN_OAUTH_CLIENT_ID = "cid";
  if (secret) process.env.GARMIN_OAUTH_CLIENT_SECRET = "sec";
  process.env.GARMIN_OAUTH_AUTHORIZE_URL = "https://garmin.example/authorize";
  process.env.GARMIN_OAUTH_TOKEN_URL = "https://garmin.example/token";
  process.env.GARMIN_OAUTH_REDIRECT_URI =
    "https://app.example/api/garmin/oauth/callback";
  if (scopes) process.env.GARMIN_OAUTH_SCOPES = "HEALTH_EXPORT ACTIVITY_EXPORT";
}

describe("getGarminOAuthConfig", () => {
  it("is null (inert) when unconfigured", () => {
    expect(getGarminOAuthConfig()).toBeNull();
    expect(isGarminOAuthEnabled()).toBe(false);
  });

  it("is null when any required var is blank", () => {
    configure();
    process.env.GARMIN_OAUTH_TOKEN_URL = "   ";
    expect(getGarminOAuthConfig()).toBeNull();
  });

  it("returns config when required vars are set", () => {
    configure();
    const c = getGarminOAuthConfig();
    expect(c).not.toBeNull();
    expect(c!.clientId).toBe("cid");
    expect(c!.clientSecret).toBe("sec");
    expect(c!.scopes).toBe("HEALTH_EXPORT ACTIVITY_EXPORT");
    expect(isGarminOAuthEnabled()).toBe(true);
  });

  it("clientSecret null and scopes empty when omitted (public PKCE client)", () => {
    configure(false, false);
    const c = getGarminOAuthConfig()!;
    expect(c.clientSecret).toBeNull();
    expect(c.scopes).toBe("");
  });
});

describe("buildAuthorizeUrl", () => {
  it("includes the standard authorization-code + PKCE params", () => {
    configure();
    const c = getGarminOAuthConfig()!;
    const url = new URL(buildAuthorizeUrl(c, "CHALLENGE", "STATE"));
    expect(url.origin + url.pathname).toBe("https://garmin.example/authorize");
    const p = url.searchParams;
    expect(p.get("response_type")).toBe("code");
    expect(p.get("client_id")).toBe("cid");
    expect(p.get("redirect_uri")).toBe(c.redirectUri);
    expect(p.get("code_challenge")).toBe("CHALLENGE");
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("state")).toBe("STATE");
    expect(p.get("scope")).toBe("HEALTH_EXPORT ACTIVITY_EXPORT");
  });

  it("omits scope when none configured", () => {
    configure(true, false);
    const c = getGarminOAuthConfig()!;
    const url = new URL(buildAuthorizeUrl(c, "CH", "ST"));
    expect(url.searchParams.has("scope")).toBe(false);
  });
});
