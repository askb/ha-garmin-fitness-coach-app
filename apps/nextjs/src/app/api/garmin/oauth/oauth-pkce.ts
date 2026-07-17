// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
import { createHash, randomBytes } from "node:crypto";

/**
 * OAuth 2.0 PKCE helpers (RFC 7636) + CSRF state, for the Garmin OAuth flow.
 *
 * Pure and dependency-light so it can be unit-tested without any Garmin
 * credentials. The Garmin-specific pieces (authorize/token URLs, client id,
 * scopes) are all injected from config elsewhere — this module only does the
 * standard crypto.
 */

/** base64url without padding (RFC 7636 §A). */
function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * A high-entropy `code_verifier`: 43–128 chars from the unreserved set
 * `[A-Za-z0-9-._~]`. 32 random bytes → 43 base64url chars.
 */
export function generateCodeVerifier(): string {
  return base64url(randomBytes(32));
}

/** `code_challenge` = base64url(SHA256(verifier)) — the S256 method. */
export function codeChallengeS256(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

/** Opaque anti-CSRF `state` value tying the callback to this request. */
export function generateState(): string {
  return base64url(randomBytes(16));
}

export interface PkceStart {
  verifier: string;
  challenge: string;
  state: string;
}

/** Everything needed to begin an authorization-code + PKCE flow. */
export function createPkceStart(): PkceStart {
  const verifier = generateCodeVerifier();
  return {
    verifier,
    challenge: codeChallengeS256(verifier),
    state: generateState(),
  };
}
