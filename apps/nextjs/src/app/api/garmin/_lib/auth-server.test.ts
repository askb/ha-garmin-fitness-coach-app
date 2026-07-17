// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
/* eslint-disable no-restricted-properties -- test manipulates the raw GARMIN_AUTH_SERVER env by design */
import { garminUserHeaders, getAuthServerBase } from "./auth-server";

jest.mock("~/auth/server", () => ({
  getSession: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getSession } = require("~/auth/server") as {
  getSession: jest.Mock;
};

const LOCAL = "http://127.0.0.1:8099";

describe("getAuthServerBase", () => {
  const original = process.env.GARMIN_AUTH_SERVER;

  afterEach(() => {
    if (original === undefined) delete process.env.GARMIN_AUTH_SERVER;
    else process.env.GARMIN_AUTH_SERVER = original;
  });

  it("defaults to the local addon service when unset", () => {
    delete process.env.GARMIN_AUTH_SERVER;
    expect(getAuthServerBase()).toBe(LOCAL);
  });

  it("falls back to local when blank/whitespace", () => {
    process.env.GARMIN_AUTH_SERVER = "   ";
    expect(getAuthServerBase()).toBe(LOCAL);
  });

  it("uses a configured value", () => {
    process.env.GARMIN_AUTH_SERVER = "https://backend.example.com";
    expect(getAuthServerBase()).toBe("https://backend.example.com");
  });

  it("strips trailing slashes so callers don't produce //", () => {
    process.env.GARMIN_AUTH_SERVER = "https://backend.example.com/";
    expect(getAuthServerBase()).toBe("https://backend.example.com");
  });
});

describe("garminUserHeaders", () => {
  const original = process.env.DEV_BYPASS_AUTH;

  afterEach(() => {
    if (original === undefined) delete process.env.DEV_BYPASS_AUTH;
    else process.env.DEV_BYPASS_AUTH = original;
  });

  it("sends no user header in addon single-user mode (DEV_BYPASS_AUTH)", async () => {
    process.env.DEV_BYPASS_AUTH = "true";
    // Must not forward a user id — the addon keeps its shared token dir. This
    // path returns before importing the session module, so no mocking needed.
    await expect(garminUserHeaders()).resolves.toEqual({});
  });

  it("forwards the session user id when not in bypass mode", async () => {
    delete process.env.DEV_BYPASS_AUTH;
    getSession.mockResolvedValue({ user: { id: "user-42" } });
    await expect(garminUserHeaders()).resolves.toEqual({
      "X-PulseCoach-User": "user-42",
    });
  });

  it("sends no header when there is no session", async () => {
    delete process.env.DEV_BYPASS_AUTH;
    getSession.mockResolvedValue(null);
    await expect(garminUserHeaders()).resolves.toEqual({});
  });
});
