// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
import type { GarminOAuthConfig } from "./oauth-config";
import { exchangeCodeForTokens } from "./oauth-token";

const baseConfig: GarminOAuthConfig = {
  clientId: "cid",
  clientSecret: null,
  authorizeUrl: "https://garmin.example/authorize",
  tokenUrl: "https://garmin.example/token",
  redirectUri: "https://app.example/api/garmin/oauth/callback",
  scopes: "HEALTH_EXPORT",
};

function okFetch(captured: { url?: string; init?: RequestInit }) {
  return (async (url: string, init?: RequestInit) => {
    captured.url = url;
    captured.init = init;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "at",
        refresh_token: "rt",
        expires_in: 3600,
        token_type: "Bearer",
      }),
      text: async () => "",
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe("exchangeCodeForTokens", () => {
  it("posts the standard PKCE body and returns parsed tokens", async () => {
    const cap: { url?: string; init?: RequestInit } = {};
    const tokens = await exchangeCodeForTokens(
      baseConfig,
      "CODE",
      "VERIFIER",
      okFetch(cap),
    );
    expect(tokens.access_token).toBe("at");
    expect(cap.url).toBe(baseConfig.tokenUrl);
    const body = String(cap.init?.body);
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=CODE");
    expect(body).toContain("code_verifier=VERIFIER");
    expect(body).toContain("client_id=cid");
  });

  it("omits Authorization for a public client (no secret)", async () => {
    const cap: { url?: string; init?: RequestInit } = {};
    await exchangeCodeForTokens(baseConfig, "C", "V", okFetch(cap));
    const headers = cap.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("sends HTTP Basic auth for a confidential client (secret set)", async () => {
    const cap: { url?: string; init?: RequestInit } = {};
    await exchangeCodeForTokens(
      { ...baseConfig, clientSecret: "sec" },
      "C",
      "V",
      okFetch(cap),
    );
    const headers = cap.init?.headers as Record<string, string>;
    const expected = "Basic " + Buffer.from("cid:sec").toString("base64");
    expect(headers.Authorization).toBe(expected);
  });

  it("throws on a non-ok token response", async () => {
    const failFetch = (async () =>
      ({
        ok: false,
        status: 401,
        json: async () => ({}),
        text: async () => "invalid_grant",
      }) as unknown as Response) as unknown as typeof fetch;
    await expect(
      exchangeCodeForTokens(baseConfig, "C", "V", failFetch),
    ).rejects.toThrow(/401/);
  });
});
