// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
/**
 * application/x-www-form-urlencoded encoding for a single component
 * (RFC 6749 §2.3.1 / HTML form URL encoding): space → `+`, and escape the
 * sub-delims that `encodeURIComponent` leaves untouched (`! ' ( ) *`).
 *
 * Shared by the OAuth token-exchange and refresh flows so the encoding can't
 * drift between them.
 */
export function formUrlEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/%20/g, "+")
    .replace(
      /[!'()*]/g,
      (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase(),
    );
}
