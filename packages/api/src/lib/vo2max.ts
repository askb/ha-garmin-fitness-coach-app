// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared VO2max source-priority logic.
 *
 * The DB stores multiple VO2max estimates per user — some from Garmin's
 * Firstbeat algorithm (synced from Garmin Connect, high accuracy), some
 * derived from pace+HR data on running activities (good), some from the
 * Cooper test (okay), and some from the Uth ratio formula (15.3 ×
 * HRmax/HRrest — overestimates for age > 35, ±5 ml/kg/min, PMC8443998).
 *
 * Without a shared helper, the AI coach context (data-context.ts) and
 * the /fitness "Current VO2max" hero card drifted in priority defaults
 * and produced contradictory numbers in the same session (#154).
 */

/** Lower number = higher priority. Defaults to 3 for unknown sources. */
export const VO2_SOURCE_PRIORITY: Record<string, number> = {
  garmin_official: 0,
  running_pace_hr: 1,
  cooper: 2,
  uth_method: 4,
  uth_ratio: 4,
};

/** Priority for a source string. Unknown sources sort below cooper. */
export function vo2SourcePriority(source: string | null | undefined): number {
  if (!source) return 3;
  return VO2_SOURCE_PRIORITY[source] ?? 3;
}

interface Vo2Like {
  date: string;
  source: string;
}

/**
 * Pick the single best estimate from a list using source priority,
 * breaking ties on newest date. Returns undefined for empty input so
 * callers can short-circuit on "no data".
 */
export function pickBestVO2maxEstimate<T extends Vo2Like>(
  estimates: readonly T[],
): T | undefined {
  if (estimates.length === 0) return undefined;
  return estimates.reduce((best, e) => {
    const bp = vo2SourcePriority(best.source);
    const ep = vo2SourcePriority(e.source);
    if (ep < bp) return e;
    if (
      ep === bp &&
      new Date(e.date).getTime() > new Date(best.date).getTime()
    ) {
      return e;
    }
    return best;
  }, estimates[0]!);
}
