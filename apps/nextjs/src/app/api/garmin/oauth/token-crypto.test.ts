// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
/* eslint-disable no-restricted-properties -- test manipulates the raw GARMIN_TOKEN_ENC_KEY env by design */
import { randomBytes } from "node:crypto";

import {
  decryptToken,
  encryptToken,
  isTokenEncryptionConfigured,
  loadTokenKey,
} from "./token-crypto";

const KEY_B64 = randomBytes(32).toString("base64");

const savedKey = process.env.GARMIN_TOKEN_ENC_KEY;
afterEach(() => {
  if (savedKey === undefined) delete process.env.GARMIN_TOKEN_ENC_KEY;
  else process.env.GARMIN_TOKEN_ENC_KEY = savedKey;
});

describe("token-crypto", () => {
  it("round-trips a token", () => {
    process.env.GARMIN_TOKEN_ENC_KEY = KEY_B64;
    const secret = "garmin-access-token-abc.123~xyz";
    expect(decryptToken(encryptToken(secret))).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    process.env.GARMIN_TOKEN_ENC_KEY = KEY_B64;
    expect(encryptToken("x")).not.toBe(encryptToken("x"));
  });

  it("fails to decrypt if the ciphertext is tampered", () => {
    process.env.GARMIN_TOKEN_ENC_KEY = KEY_B64;
    const enc = encryptToken("secret");
    const buf = Buffer.from(enc, "base64");
    buf[buf.length - 1] = (buf[buf.length - 1] ?? 0) ^ 0xff; // flip a byte
    expect(() => decryptToken(buf.toString("base64"))).toThrow();
  });

  it("fails to decrypt with a different key", () => {
    process.env.GARMIN_TOKEN_ENC_KEY = KEY_B64;
    const enc = encryptToken("secret");
    expect(() => decryptToken(enc, randomBytes(32))).toThrow();
  });

  it("requires a 32-byte base64 key", () => {
    process.env.GARMIN_TOKEN_ENC_KEY = "tooshort";
    expect(() => loadTokenKey()).toThrow(/32 bytes/);
    delete process.env.GARMIN_TOKEN_ENC_KEY;
    expect(() => loadTokenKey()).toThrow(/not set/);
    expect(isTokenEncryptionConfigured()).toBe(false);
    process.env.GARMIN_TOKEN_ENC_KEY = KEY_B64;
    expect(isTokenEncryptionConfigured()).toBe(true);
  });
});
