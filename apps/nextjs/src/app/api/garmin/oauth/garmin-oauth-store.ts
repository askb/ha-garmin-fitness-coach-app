// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
import "server-only";

import { eq, GarminOAuthToken } from "@acme/db";
import { db } from "@acme/db/client";

import type { OAuthTokenResponse } from "./oauth-token";
import { decryptToken, encryptToken } from "./token-crypto";

/**
 * Per-user Garmin OAuth token persistence (Path B, B2).
 *
 * Tokens are encrypted at rest with AES-256-GCM (see token-crypto.ts); the DB
 * only ever holds ciphertext. One row per user (unique on userId).
 */

export interface StoredGarminTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
}

function expiryFrom(tokens: OAuthTokenResponse): Date | null {
  return typeof tokens.expires_in === "number"
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;
}

/** Upsert the user's Garmin tokens (encrypted). */
export async function persistGarminOAuthTokens(
  userId: string,
  tokens: OAuthTokenResponse,
): Promise<void> {
  const accessTokenEnc = encryptToken(tokens.access_token);
  const refreshTokenEnc = tokens.refresh_token
    ? encryptToken(tokens.refresh_token)
    : null;
  const expiresAt = expiryFrom(tokens);
  const scope = tokens.scope ?? null;

  await db
    .insert(GarminOAuthToken)
    .values({ userId, accessTokenEnc, refreshTokenEnc, expiresAt, scope })
    .onConflictDoUpdate({
      target: GarminOAuthToken.userId,
      set: {
        accessTokenEnc,
        refreshTokenEnc,
        expiresAt,
        scope,
        updatedAt: new Date(),
      },
    });
}

/** Return the user's decrypted Garmin tokens, or null if not connected. */
export async function getGarminOAuthTokens(
  userId: string,
): Promise<StoredGarminTokens | null> {
  const rows = await db
    .select()
    .from(GarminOAuthToken)
    .where(eq(GarminOAuthToken.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    accessToken: decryptToken(row.accessTokenEnc),
    refreshToken: row.refreshTokenEnc
      ? decryptToken(row.refreshTokenEnc)
      : null,
    expiresAt: row.expiresAt ?? null,
    scope: row.scope ?? null,
  };
}

/** Remove the user's Garmin tokens (disconnect). */
export async function deleteGarminOAuthTokens(userId: string): Promise<void> {
  await db.delete(GarminOAuthToken).where(eq(GarminOAuthToken.userId, userId));
}
