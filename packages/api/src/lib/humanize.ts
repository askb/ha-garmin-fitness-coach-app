// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/** Convert internal activity slugs into human-readable labels for LLM prompts. */
export function humanizeActivityName(slug: string): string {
  return slug
    .replace(/_v\d+$/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
