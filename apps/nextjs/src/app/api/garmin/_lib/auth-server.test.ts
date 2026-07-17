// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
/* eslint-disable no-restricted-properties -- test manipulates the raw GARMIN_AUTH_SERVER env by design */
import { getAuthServerBase } from "./auth-server";

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
