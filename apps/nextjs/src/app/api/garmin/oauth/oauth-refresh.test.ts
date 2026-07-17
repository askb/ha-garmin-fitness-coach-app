// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
import type { GarminOAuthConfig } from "./oauth-config";
import { needsRefresh, refreshAccessToken } from "./oauth-refresh";

const config: GarminOAuthConfig = {
  clientId: "cid",
  clientSecret: null,
  authorizeUrl: "https://garmin.example/authorize",
  tokenUrl: "https://garmin.example/token",
  redirectUri: "https://app.example/api/garmin/oauth/callback",
  scopes: "HEALTH_EXPORT",
};

function okFetch(cap: { init?: RequestInit }) {
  return (async (_url: string, init?: RequestInit) => {
    cap.init = init;
    return {
      ok: true,
      status: 200,
      json: async () => ({ access_token: "new", expires_in: 3600 }),
      text: async () => "",
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe("refreshAccessToken", () => {
  it("posts a refresh_token grant and returns new tokens", async () => {
    const cap: { init?: RequestInit } = {};
    const t = await refreshAccessToken(config, "RT", okFetch(cap));
    expect(t.access_token).toBe("new");
    const body = String(cap.init?.body);
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("refresh_token=RT");
    expect(body).toContain("client_id=cid");
  });

  it("adds Basic auth for a confidential client", async () => {
    const cap: { init?: RequestInit } = {};
    await refreshAccessToken(
      { ...config, clientSecret: "sec" },
      "RT",
      okFetch(cap),
    );
    const headers = cap.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      "Basic " + Buffer.from("cid:sec").toString("base64"),
    );
  });

  it("throws on a non-ok refresh response", async () => {
    const fail = (async () =>
      ({
        ok: false,
        status: 400,
        text: async () => "invalid_grant",
        json: async () => ({}),
      }) as unknown as Response) as unknown as typeof fetch;
    await expect(refreshAccessToken(config, "RT", fail)).rejects.toThrow(/400/);
  });
});

describe("needsRefresh", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  it("is true when expiry is null (unknown)", () => {
    expect(needsRefresh(null, now)).toBe(true);
  });
  it("is true within the skew window", () => {
    expect(needsRefresh(new Date(now.getTime() + 30_000), now)).toBe(true);
  });
  it("is false when comfortably valid", () => {
    expect(needsRefresh(new Date(now.getTime() + 3_600_000), now)).toBe(false);
  });
  it("is true when already expired", () => {
    expect(needsRefresh(new Date(now.getTime() - 1000), now)).toBe(true);
  });
});
