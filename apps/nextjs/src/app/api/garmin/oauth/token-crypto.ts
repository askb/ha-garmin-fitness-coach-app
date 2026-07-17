// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Authenticated at-rest encryption for Garmin OAuth tokens (AES-256-GCM).
 *
 * Chosen approach (see Phase 2B plan): app-level encryption with a single key
 * from the `GARMIN_TOKEN_ENC_KEY` env var (base64-encoded 32 bytes). Portable,
 * no cloud dependency. Alternatives (cloud KMS envelope encryption, pgcrypto)
 * are documented in the plan for later.
 *
 * Serialized form: base64( VERSION(1) | IV(12) | TAG(16) | CIPHERTEXT ).
 */

const VERSION = 1;
const IV_LEN = 12; // GCM standard nonce
const TAG_LEN = 16;
const KEY_LEN = 32; // AES-256

/** Load and validate the 32-byte key from env, or throw a clear error. */
export function loadTokenKey(): Buffer {
  // eslint-disable-next-line no-restricted-properties -- server-only: `~/env` shim unavailable
  const raw = process.env.GARMIN_TOKEN_ENC_KEY?.trim();
  if (!raw) {
    throw new Error("GARMIN_TOKEN_ENC_KEY is not set");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LEN) {
    throw new Error(
      `GARMIN_TOKEN_ENC_KEY must be base64 of ${KEY_LEN} bytes (got ${key.length})`,
    );
  }
  return key;
}

/** True when a valid token-encryption key is configured. */
export function isTokenEncryptionConfigured(): boolean {
  try {
    loadTokenKey();
    return true;
  } catch {
    return false;
  }
}

/** Encrypt a plaintext token string. `key` defaults to the env key. */
export function encryptToken(
  plaintext: string,
  key: Buffer = loadTokenKey(),
): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), iv, tag, ct]).toString(
    "base64",
  );
}

/** Decrypt a value produced by {@link encryptToken}. Throws if tampered. */
export function decryptToken(
  serialized: string,
  key: Buffer = loadTokenKey(),
): string {
  const buf = Buffer.from(serialized, "base64");
  if (buf.length < 1 + IV_LEN + TAG_LEN) {
    throw new Error("ciphertext too short");
  }
  const version = buf[0];
  if (version !== VERSION) {
    throw new Error(`unsupported ciphertext version ${version}`);
  }
  const iv = buf.subarray(1, 1 + IV_LEN);
  const tag = buf.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
  const ct = buf.subarray(1 + IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
    "utf8",
  );
}
