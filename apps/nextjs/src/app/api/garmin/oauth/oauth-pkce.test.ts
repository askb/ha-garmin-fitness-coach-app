// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
import {
  codeChallengeS256,
  createPkceStart,
  generateCodeVerifier,
  generateState,
} from "./oauth-pkce";

describe("oauth-pkce", () => {
  it("verifier is 43-128 chars of the unreserved set", () => {
    for (let i = 0; i < 20; i++) {
      const v = generateCodeVerifier();
      expect(v.length).toBeGreaterThanOrEqual(43);
      expect(v.length).toBeLessThanOrEqual(128);
      expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/);
    }
  });

  it("challenge is deterministic and url-safe", () => {
    const v = generateCodeVerifier();
    expect(codeChallengeS256(v)).toBe(codeChallengeS256(v));
    const c = codeChallengeS256(v);
    expect(c).not.toMatch(/[+/=]/);
  });

  it("matches the RFC 7636 known-answer vector", () => {
    expect(
      codeChallengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    ).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("verifier and state are random", () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
    expect(generateState()).not.toBe(generateState());
  });

  it("createPkceStart returns a consistent triple", () => {
    const s = createPkceStart();
    expect(s.challenge).toBe(codeChallengeS256(s.verifier));
    expect(s.state).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });
});
