// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure helpers extracted from `dashboard-home.tsx` so the readiness
 * component lookup can be unit-tested without rendering the full
 * client component (and its TRPC / React Query dependencies).
 *
 * The readiness payload comes in three shapes depending on whether it
 * was freshly computed or read from the cached DB row:
 *
 *  1. **Top-level numeric columns** (cached rows written before the
 *     refactor): `{ hrvComponent: 78, sleepQuantityComponent: 65, ... }`.
 *  2. **Nested `components` object** (freshly computed by the engine):
 *     `{ components: { hrv: 78, sleepQuantity: 65, ... } }`.
 *  3. **`factors` JSONB fallback** (Garmin-native rows from
 *     v0.16.18 / v0.16.19 where the dedicated columns were null but
 *     the underlying factor scores were preserved in JSONB):
 *     `{ factors: { hrv: 78, sleepQuantity: 65, ... } }`.
 *
 * `getReadinessComponent` walks these three layers in order and
 * returns the first numeric hit, or `null` if no layer has a value.
 */

export function getReadinessComponent(
  data: Record<string, unknown> | null | undefined,
  topKey: string,
  nestedKey: string,
): number | null {
  if (!data) return null;
  const top = data[topKey];
  if (typeof top === "number") return top;
  const comps = data.components;
  if (comps && typeof comps === "object") {
    const nested = (comps as Record<string, unknown>)[nestedKey];
    if (typeof nested === "number") return nested;
  }
  const factors = data.factors;
  if (factors && typeof factors === "object") {
    const nested = (factors as Record<string, unknown>)[nestedKey];
    if (typeof nested === "number") return nested;
  }
  return null;
}
