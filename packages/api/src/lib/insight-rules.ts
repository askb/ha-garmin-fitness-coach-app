// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 The Linux Foundation
/**
 * Pure, testable rule functions for proactive AI insight generation.
 * Each function takes deterministic inputs and returns a structured result.
 */

export type Severity = "HIGH" | "MEDIUM" | "LOW";

export interface RuleResult {
  triggered: boolean;
  severity: Severity | null;
  confidence: number;
}

export interface RampRateResult {
  triggered: boolean;
  severity: Severity | null;
  delta: number;
}

export interface InterventionPatternResult {
  triggered: boolean;
  tag: string | null;
  count: number;
}

/**
 * Rule 1: ACWR Injury Risk
 * > 1.5 → HIGH, > 1.3 → MEDIUM, otherwise not triggered.
 */
export function checkAcwrRisk(
  latestAcwr: number,
): { triggered: boolean; severity: Severity | null; confidence: number } {
  if (latestAcwr > 1.5) {
    return { triggered: true, severity: "HIGH", confidence: 0.85 };
  }
  if (latestAcwr > 1.3) {
    return { triggered: true, severity: "MEDIUM", confidence: 0.75 };
  }
  return { triggered: false, severity: null, confidence: 0 };
}

/**
 * Rule 2: TSB Overreaching
 * < -20 → HIGH, < -10 → MEDIUM, otherwise not triggered.
 */
export function checkTsbOverreaching(
  latestTsb: number,
): { triggered: boolean; severity: Severity | null; confidence: number } {
  if (latestTsb < -20) {
    return { triggered: true, severity: "HIGH", confidence: 0.8 };
  }
  if (latestTsb < -10) {
    return { triggered: true, severity: "MEDIUM", confidence: 0.7 };
  }
  return { triggered: false, severity: null, confidence: 0 };
}

/**
 * Rule 3: HRV Baseline Deviation
 * recentHrv < mean - 2*SD → HIGH, < mean - 1*SD → MEDIUM.
 */
export function checkHrvDeviation(
  recentHrv: number,
  mean: number,
  sd: number,
): { triggered: boolean; severity: Severity | null } {
  if (recentHrv < mean - 2 * sd) {
    return { triggered: true, severity: "HIGH" };
  }
  if (recentHrv < mean - sd) {
    return { triggered: true, severity: "MEDIUM" };
  }
  return { triggered: false, severity: null };
}

/**
 * Rule 4: Sleep Debt
 * avgSleepMinutes < 360 (6h) → HIGH, < 420 (7h) → LOW.
 */
export function checkSleepDebt(
  avgSleepMinutes: number,
): { triggered: boolean; severity: Severity | null } {
  if (avgSleepMinutes < 360) {
    return { triggered: true, severity: "HIGH" };
  }
  if (avgSleepMinutes < 420) {
    return { triggered: true, severity: "LOW" };
  }
  return { triggered: false, severity: null };
}

/**
 * Rule 5: Ramp Rate Spike
 * ctlValues is an ordered array (oldest → newest); delta = last - first.
 * delta > 10 → HIGH, > 7 → MEDIUM.
 */
export function checkRampRate(ctlValues: number[]): RampRateResult {
  if (ctlValues.length < 2) {
    return { triggered: false, severity: null, delta: 0 };
  }
  const delta = (ctlValues[ctlValues.length - 1] ?? 0) - (ctlValues[0] ?? 0);
  if (delta > 10) {
    return { triggered: true, severity: "HIGH", delta };
  }
  if (delta > 7) {
    return { triggered: true, severity: "MEDIUM", delta };
  }
  return { triggered: false, severity: null, delta };
}

/**
 * Rule 6: Intervention Pattern Detection
 * If any single tag appears 3+ times in the provided list → pattern detected.
 */
export function checkInterventionPattern(
  tags: string[],
): InterventionPatternResult {
  const counts = new Map<string, number>();
  for (const tag of tags) {
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  for (const [tag, count] of counts.entries()) {
    if (count >= 3) {
      return { triggered: true, tag, count };
    }
  }
  return { triggered: false, tag: null, count: 0 };
}
