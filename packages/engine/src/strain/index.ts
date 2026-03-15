import type { ActivityInput } from "../types";

/**
 * Compute TRIMP (Training Impulse) from activity data.
 *
 * TRIMP = duration_minutes × ΔHR_ratio × e^(k × ΔHR_ratio)
 * where ΔHR_ratio = (avgHr - restingHr) / (maxHr - restingHr)
 * k = 1.92 (male) or 1.67 (female)
 */
export function computeTRIMP(
  activity: { durationMinutes: number; avgHr: number | null; maxHr: number | null },
  restingHr: number,
  userMaxHr: number,
  sex: string | null,
): number {
  if (activity.avgHr === null || userMaxHr <= restingHr) return 0;

  const hrReserve = userMaxHr - restingHr;
  if (hrReserve <= 0) return 0;

  const deltaHrRatio = Math.max(0, Math.min(1, (activity.avgHr - restingHr) / hrReserve));
  const k = sex === "female" ? 1.67 : 1.92;

  return activity.durationMinutes * deltaHrRatio * Math.exp(k * deltaHrRatio);
}

/**
 * Convert TRIMP to a 0-21 strain score (WHOOP-style scale).
 *
 * strain = 21 × (1 - e^(-trimp / personalTrimpMax))
 * personalTrimpMax defaults to ~250 for most athletes.
 */
export function computeStrainScore(
  trimp: number,
  personalTrimpMax = 250,
): number {
  if (trimp <= 0) return 0;
  const raw = 21 * (1 - Math.exp(-trimp / personalTrimpMax));
  return Math.round(raw * 100) / 100; // 2 decimal places
}

/**
 * Compute Acute:Chronic Workload Ratio (ACWR).
 *
 * ACWR = 3-day average strain / 7-day average strain
 * Sweet spot: 0.8 – 1.3
 * Danger zone: > 1.5
 */
export function computeACWR(
  strainScores: number[], // most recent first (index 0 = today)
): number {
  if (strainScores.length < 3) return 1.0; // not enough data

  const acute3 =
    strainScores.slice(0, 3).reduce((sum, s) => sum + s, 0) / 3;

  const chronicDays = Math.min(strainScores.length, 7);
  const chronic7 =
    strainScores.slice(0, chronicDays).reduce((sum, s) => sum + s, 0) /
    chronicDays;

  if (chronic7 === 0) return acute3 > 0 ? 2.0 : 1.0;
  return Math.round((acute3 / chronic7) * 100) / 100;
}

/**
 * Count consecutive hard days (strain > threshold).
 */
export function countConsecutiveHardDays(
  strainScores: number[], // most recent first
  threshold = 14,
): number {
  let count = 0;
  for (const score of strainScores) {
    if (score > threshold) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

export { computeTRIMP as trimp, computeStrainScore as strain };
