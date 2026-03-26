import type { RunningFormScore } from "../types";

/**
 * RUNNING FORM / BIOMECHANICS ANALYSIS
 *
 * Analyzes running dynamics data from Garmin devices (Forerunner 965 etc.)
 * and provides evidence-based scoring and recommendations.
 *
 * Ref: Santos-Concejero J et al. Interaction effects of stride angle and
 *      strike pattern on running economy. Int J Sports Med. 2014;35(13):1118-1123.
 *
 * Ref: Cavanagh PR, Williams KR. The effect of stride length variation on
 *      oxygen uptake during distance running. Med Sci Sports Exerc.
 *      1982;14(1):30-35.
 *   → Optimal stride length is self-selected ±3%. Overstriding increases
 *     energy cost and injury risk.
 *
 * Ref: Heiderscheit BC et al. Effects of step rate manipulation on joint
 *      mechanics during running. Med Sci Sports Exerc. 2011;43(2):296-302.
 *   → Cadence 170-185 spm reduces impact forces and injury risk
 *
 * Ref: Moore IS. Is there an economical running technique?
 *      Sports Med. 2016;46(6):793-807.
 *   → Comprehensive review of running economy biomechanics
 */

/**
 * Ground contact time benchmarks (in milliseconds).
 *
 * Ref: Nummela A et al. Factors related to top running speed and economy.
 *      Int J Sports Med. 2007;28(8):655-661.
 * - Elite distance runners: 180-210ms
 * - Sub-elite: 210-240ms
 * - Recreational: 240-300ms
 * - Novice: 300ms+
 */
function rateGCT(gctMs: number): RunningFormScore["groundContactTime"]["rating"] {
  if (gctMs <= 210) return "elite";
  if (gctMs <= 250) return "good";
  if (gctMs <= 300) return "average";
  return "poor";
}

function scoreGCT(gctMs: number): number {
  // Score 0-100 based on GCT benchmarks
  if (gctMs <= 180) return 100;
  if (gctMs <= 210) return 85 + ((210 - gctMs) / 30) * 15;
  if (gctMs <= 250) return 60 + ((250 - gctMs) / 40) * 25;
  if (gctMs <= 300) return 30 + ((300 - gctMs) / 50) * 30;
  return Math.max(0, 30 - ((gctMs - 300) / 50) * 30);
}

/**
 * Vertical oscillation benchmarks (in centimeters).
 *
 * Ref: Moore IS. (2016) — lower oscillation = more efficient
 * - Elite: <6.0 cm
 * - Good: 6.0-8.0 cm
 * - Average: 8.0-10.0 cm
 * - Poor: >10.0 cm (excessive "bouncing")
 */
function rateVerticalOscillation(voCm: number): RunningFormScore["verticalOscillation"]["rating"] {
  if (voCm <= 6.0) return "elite";
  if (voCm <= 8.0) return "good";
  if (voCm <= 10.0) return "average";
  return "poor";
}

function scoreVO(voCm: number): number {
  if (voCm <= 5.0) return 100;
  if (voCm <= 6.0) return 85 + ((6.0 - voCm) / 1.0) * 15;
  if (voCm <= 8.0) return 60 + ((8.0 - voCm) / 2.0) * 25;
  if (voCm <= 10.0) return 30 + ((10.0 - voCm) / 2.0) * 30;
  return Math.max(0, 30 - ((voCm - 10.0) / 3.0) * 30);
}

/**
 * Stride length assessment.
 *
 * Optimal stride length is highly individual and depends on speed.
 * General guideline: at easy pace, stride length (m) ≈ height (m) × 0.65-0.75
 *
 * Ref: Cavanagh PR, Williams KR. (1982) — self-selected stride length
 *      is within 3% of optimal for most trained runners.
 *
 * For assessment without a reference, we use the vertical ratio
 * (vertical oscillation / stride length × 100) as a proxy:
 * - Optimal vertical ratio: 6-8% (more horizontal = better)
 * - High ratio (>10%): excessive bouncing relative to forward progress
 */
function rateStride(strideLengthM: number, heightCm: number | null): RunningFormScore["strideLength"]["rating"] {
  if (heightCm === null) return "optimal"; // can't assess without height

  const heightM = heightCm / 100;
  const optimalMin = heightM * 0.65;
  const optimalMax = heightM * 0.80;

  if (strideLengthM > optimalMax * 1.05) return "overstriding";
  if (strideLengthM < optimalMin * 0.90) return "understriding";
  return "optimal";
}

/**
 * Ground contact time balance (L/R symmetry).
 *
 * Ref: Seminati E et al. Asymmetry indices for stance phase metrics during
 *      running. J Biomech. 2013;46(Suppl 1):S116.
 * - Balanced: 49.5-50.5% (±0.5%)
 * - Slight imbalance: 48-52% (±2%)
 * - Imbalanced: outside 48-52% range
 *
 * Persistent asymmetry >2% may indicate injury risk or compensatory patterns.
 */
function rateGCTBalance(balancePct: number): RunningFormScore["gctBalance"]["rating"] {
  const deviation = Math.abs(balancePct - 50);
  if (deviation <= 0.5) return "balanced";
  if (deviation <= 2.0) return "slight_imbalance";
  return "imbalanced";
}

/**
 * Cadence (steps per minute) assessment.
 *
 * Ref: Heiderscheit BC et al. (2011) — increasing cadence by 5-10%
 *      reduces peak hip adduction, peak knee flexion, and shock absorption
 *      demand. Reducing overstriding and impact forces.
 *
 * General benchmarks:
 * - Optimal: 170-185 spm (varies with speed and leg length)
 * - Low: <165 spm (often indicates overstriding)
 * - High: >190 spm (usually fine, some elite runners run 190-200+)
 *
 * Note: Cadence naturally increases with speed. These are for easy-moderate pace.
 */
function rateCadence(spm: number): RunningFormScore["cadence"]["rating"] {
  if (spm >= 170 && spm <= 190) return "optimal";
  if (spm < 165) return "low";
  return "high"; // >190 — not necessarily bad, but notable
}

function scoreCadence(spm: number): number {
  if (spm >= 175 && spm <= 185) return 100;
  if (spm >= 170 && spm <= 190) return 80;
  if (spm >= 165 && spm <= 195) return 60;
  if (spm >= 155 && spm <= 200) return 40;
  return 20;
}

/**
 * Compute overall running form score from biomechanics data.
 *
 * Weighted components:
 * - Ground contact time: 30% (strongest efficiency indicator)
 * - Vertical oscillation: 25% (energy waste indicator)
 * - Cadence: 20% (injury prevention)
 * - GCT Balance: 15% (symmetry/injury risk)
 * - Stride length: 10% (assessed via vertical ratio if available)
 */
export function analyzeRunningForm(
  avgGCT: number | null,           // milliseconds
  verticalOscillation: number | null, // centimeters
  strideLength: number | null,     // meters
  gctBalance: number | null,       // percentage (e.g., 50.2)
  cadence: number | null,          // steps per minute
  heightCm: number | null,         // for stride assessment
): RunningFormScore | null {
  // Need at least GCT or cadence to provide meaningful analysis
  if (avgGCT === null && cadence === null) return null;

  let totalScore = 0;
  let totalWeight = 0;

  // GCT component (30%)
  const gctResult = avgGCT !== null ? {
    value: avgGCT,
    rating: rateGCT(avgGCT),
  } : { value: 0, rating: "average" as const };

  if (avgGCT !== null) {
    totalScore += scoreGCT(avgGCT) * 0.30;
    totalWeight += 0.30;
  }

  // Vertical oscillation (25%)
  const voResult = verticalOscillation !== null ? {
    value: verticalOscillation,
    rating: rateVerticalOscillation(verticalOscillation),
  } : { value: 0, rating: "average" as const };

  if (verticalOscillation !== null) {
    totalScore += scoreVO(verticalOscillation) * 0.25;
    totalWeight += 0.25;
  }

  // Stride length (10%)
  const slResult = strideLength !== null ? {
    value: strideLength,
    rating: rateStride(strideLength, heightCm),
  } : { value: 0, rating: "optimal" as const };

  if (strideLength !== null) {
    // Stride scoring via vertical ratio if we have VO data
    const vrScore = verticalOscillation !== null && strideLength > 0
      ? Math.max(0, 100 - ((verticalOscillation / 100) / strideLength * 100 - 7) * 15)
      : 70; // default
    totalScore += vrScore * 0.10;
    totalWeight += 0.10;
  }

  // GCT Balance (15%)
  const balanceResult = gctBalance !== null ? {
    value: gctBalance,
    rating: rateGCTBalance(gctBalance),
  } : { value: 50, rating: "balanced" as const };

  if (gctBalance !== null) {
    const balanceScore = Math.max(0, 100 - Math.abs(gctBalance - 50) * 25);
    totalScore += balanceScore * 0.15;
    totalWeight += 0.15;
  }

  // Cadence (20%)
  const cadenceResult = cadence !== null ? {
    value: cadence,
    rating: rateCadence(cadence),
  } : { value: 0, rating: "optimal" as const };

  if (cadence !== null) {
    totalScore += scoreCadence(cadence) * 0.20;
    totalWeight += 0.20;
  }

  // Normalize score to account for missing components
  const overall = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 50;

  return {
    overall,
    groundContactTime: gctResult,
    verticalOscillation: voResult,
    strideLength: slResult,
    gctBalance: balanceResult,
    cadence: cadenceResult,
  };
}
