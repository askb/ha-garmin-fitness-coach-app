// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import type { ReadinessZone } from "../types";
import { getReadinessZone } from "../readiness";

export interface TargetStrainBand {
  /** Lower bound of recommended day-strain (0-21 WHOOP scale). */
  min: number;
  /** Upper bound of recommended day-strain (0-21 WHOOP scale). */
  max: number;
  /** Midpoint, useful for single-number summaries. */
  target: number;
  /** Plain-language label (e.g. "All-out", "Moderate", "Recovery"). */
  label: string;
  /** Short rationale citing the readiness zone. */
  rationale: string;
  /** Echoed readiness zone (driven the band). */
  readinessZone: ReadinessZone;
}

/**
 * Compute today's recommended Day-Strain band.
 *
 * Maps the readiness score onto a target Day-Strain (0-21) band on the
 * WHOOP-style exponential strain scale. The defaults are derived from
 * WHOOP's published "Strain Coach" guidance (rest, moderate, all-out)
 * and converted to numeric bands using the asymptotic strain curve in
 * `computeStrainScore` (where ~14 ≈ "vigorous", ~18 ≈ "all-out").
 *
 * Refs:
 *  - Foster C et al. A new approach to monitoring exercise training.
 *    J Strength Cond Res. 2001;15(1):109-115.  (session RPE → load)
 *  - Halson SL. Monitoring training load to understand fatigue in
 *    athletes. Sports Med. 2014;44(Suppl 2):S139-S147.
 *  - Soligard T et al. How much is too much? IOC consensus statement
 *    on load. Br J Sports Med. 2016;50(17):1030-1041.
 *  - Hulin BT et al. The acute:chronic workload ratio. Br J Sports
 *    Med. 2016;50(4):231-236.  (ACWR sweet-spot 0.8-1.3 maps to
 *    "build" vs "consolidate" recommendations below)
 *
 * Optionally narrows the band toward the athlete's recent
 * chronic load (last 14 days) so the recommendation tracks their
 * actual training level instead of WHOOP's population defaults.
 *
 * @param readinessScore readiness 0-100 (see ./readiness)
 * @param recentDailyStrains last 14 days of daily-strain values (0-21).
 *        Used only to compute an athlete-specific midpoint (median).
 */
export function computeTargetStrain(
  readinessScore: number,
  recentDailyStrains: number[] = [],
): TargetStrainBand {
  const score = Math.max(0, Math.min(100, readinessScore));
  const zone = getReadinessZone(score);

  // Population-default bands by readiness zone (WHOOP Strain Coach style).
  const defaults: Record<
    ReadinessZone,
    { min: number; max: number; label: string }
  > = {
    prime: { min: 14, max: 18, label: "All-out" },
    high: { min: 11, max: 15, label: "Vigorous" },
    moderate: { min: 8, max: 12, label: "Moderate" },
    low: { min: 4, max: 9, label: "Light" },
    poor: { min: 0, max: 6, label: "Recovery" },
  };
  const base = defaults[zone];

  // Personalise toward the athlete's median chronic strain when we
  // have ≥7 days of data. Shifts the band by up to ±2 points so we
  // don't ask a recreational athlete to hit a pro-level number.
  let { min, max } = base;
  if (recentDailyStrains.length >= 7) {
    const sorted = [...recentDailyStrains].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const midpoint = (min + max) / 2;
    const shift = clamp(median - midpoint, -2, 2);
    min = clamp(min + shift, 0, 21);
    max = clamp(max + shift, 0, 21);
  }

  const target = Math.round(((min + max) / 2) * 10) / 10;
  const rationale = rationaleFor(zone);

  return {
    min: round1(min),
    max: round1(max),
    target,
    label: base.label,
    rationale,
    readinessZone: zone,
  };
}

function rationaleFor(zone: ReadinessZone): string {
  switch (zone) {
    case "prime":
      return "Your body is primed for hard work — chase a peak session today.";
    case "high":
      return "Good recovery — capacity for a quality session is high.";
    case "moderate":
      return "Recovery is partial — train, but stay in the aerobic zone.";
    case "low":
      return "Recovery is impaired — keep effort easy and conversational.";
    case "poor":
      return "Recovery is poor — prioritise rest, mobility, or a short walk.";
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
