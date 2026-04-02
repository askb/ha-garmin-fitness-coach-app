import type { VO2maxEstimateResult, RacePredictionResult } from "../types";

/**
 * VO2MAX ESTIMATION & RACE PREDICTION
 *
 * Multiple estimation methods for cross-validation:
 * 1. Running pace + HR (ACSM equation) — most accurate for runners
 * 2. Uth ratio (HRmax / HRrest) — simple but rough estimate
 * 3. Cooper test — from 12-min distance test
 * 4. From race result — using Daniels' VDOT tables
 *
 * Race predictions use the Riegel formula (1981) — one of the most
 * validated prediction models for distances 1500m to marathon.
 */

/**
 * Estimate VO2max from running activity data.
 *
 * Uses the ACSM metabolic equation for running:
 * VO2 (ml/kg/min) = 3.5 + 0.2 × speed (m/min) + 0.9 × speed × grade
 * For flat running (grade=0): VO2 = 3.5 + 0.2 × speed
 *
 * Then: VO2max ≈ VO2_running / fraction_of_HRmax
 * where fraction_of_HRmax = (avgHR - restingHR) / (maxHR - restingHR)
 * adjusted using the Swain equation: %VO2R ≈ %HRR
 *
 * Ref: ACSM's Guidelines for Exercise Testing and Prescription, 11th ed. 2021.
 * Ref: Swain DP et al. Relationship between %heart rate reserve and %VO2reserve.
 *      Med Sci Sports Exerc. 1998;30(2):318-321.
 *
 * This is most accurate for steady-state runs of 12+ minutes at >60% HRR.
 * Returns null if insufficient data.
 */
export function estimateVO2maxFromRunning(
  distanceMeters: number,
  durationMinutes: number,
  avgHr: number,
  restingHr: number,
  maxHr: number,
): VO2maxEstimateResult | null {
  // Minimum quality thresholds
  if (durationMinutes < 12 || distanceMeters < 1500) return null;
  if (avgHr <= restingHr || maxHr <= restingHr) return null;

  const speedMPerMin = distanceMeters / durationMinutes;

  // ACSM running VO2 equation (flat terrain assumed)
  const vo2Running = 3.5 + 0.2 * speedMPerMin;

  // Heart rate reserve fraction (Swain 1998: %HRR ≈ %VO2R)
  const hrrFraction = (avgHr - restingHr) / (maxHr - restingHr);

  if (hrrFraction <= 0.4 || hrrFraction > 1.0) return null; // outside valid range

  const vo2max = vo2Running / hrrFraction;

  // Sanity check: VO2max should be 20-90 ml/kg/min for humans
  if (vo2max < 20 || vo2max > 90) return null;

  return {
    value: Math.round(vo2max * 10) / 10,
    source: "running_pace_hr",
    confidence: hrrFraction >= 0.6 && durationMinutes >= 20 ? "high" : "medium",
  };
}

/**
 * Estimate VO2max using the Uth method (simple ratio).
 *
 * VO2max = 15.3 × (HRmax / HRrest)
 *
 * Ref: Uth N et al. Estimation of VO2max from the ratio between HRmax
 *      and HRrest — the Heart Rate Ratio Method. Eur J Appl Physiol.
 *      2004;91:111-115.
 *
 * Accuracy: ±5 ml/kg/min (rough estimate, good for initial baseline).
 * Most accurate for untrained to moderately trained individuals.
 */
export function estimateVO2maxUth(
  maxHr: number,
  restingHr: number,
): VO2maxEstimateResult | null {
  if (maxHr <= restingHr || restingHr <= 0) return null;

  const vo2max = 15.3 * (maxHr / restingHr);

  if (vo2max < 20 || vo2max > 90) return null;

  return {
    value: Math.round(vo2max * 10) / 10,
    source: "uth_ratio",
    confidence: "low", // rough estimate
  };
}

/**
 * Estimate VO2max from Cooper 12-minute run test.
 *
 * VO2max = (distance_meters - 504.9) / 44.73
 *
 * Ref: Cooper KH. A means of assessing maximal oxygen intake: correlation
 *      between field and treadmill testing. JAMA. 1968;203(3):201-204.
 *
 * Accuracy: r=0.897 with treadmill VO2max testing.
 * Requires a maximal 12-minute effort to be valid.
 */
export function estimateVO2maxCooper(
  distanceMeters12min: number,
): VO2maxEstimateResult | null {
  if (distanceMeters12min < 800 || distanceMeters12min > 5000) return null;

  const vo2max = (distanceMeters12min - 504.9) / 44.73;

  if (vo2max < 15 || vo2max > 90) return null;

  return {
    value: Math.round(vo2max * 10) / 10,
    source: "cooper",
    confidence: "medium",
  };
}

/**
 * Predict race times using the Riegel formula.
 *
 * T2 = T1 × (D2 / D1) ^ 1.06
 *
 * Ref: Riegel PS. Athletic Records and Human Endurance.
 *      American Scientist. 1981;69(3):285-290.
 *
 * The exponent 1.06 is empirically derived from world records and has
 * been validated across distances from 1500m to marathon. It accounts
 * for the non-linear relationship between distance and pace (fatigue
 * factor increases with distance).
 *
 * Accuracy: ±2-3% for well-trained runners, ±5% for recreational runners.
 * Less accurate beyond marathon distance (ultramarathon exponent is higher).
 */
export function predictRaceTimes(
  knownDistanceMeters: number,
  knownTimeSeconds: number,
  vo2max: number,
): RacePredictionResult[] {
  const RACE_DISTANCES: Array<{
    name: RacePredictionResult["distance"];
    meters: number;
  }> = [
    { name: "5K", meters: 5000 },
    { name: "10K", meters: 10000 },
    { name: "half_marathon", meters: 21097.5 },
    { name: "marathon", meters: 42195 },
  ];

  const RIEGEL_EXPONENT = 1.06; // Riegel (1981)

  return RACE_DISTANCES.map(({ name, meters }) => {
    const predictedSeconds = Math.round(
      knownTimeSeconds *
        Math.pow(meters / knownDistanceMeters, RIEGEL_EXPONENT),
    );

    return {
      distance: name,
      distanceMeters: meters,
      predictedSeconds,
      predictedFormatted: formatTime(predictedSeconds),
      method: "riegel" as const,
      vo2maxUsed: vo2max,
    };
  });
}

/**
 * Predict race times from VO2max using a simplified VDOT approach.
 *
 * Uses the relationship between VO2max and running velocity:
 * velocity (m/min) = (VO2max - 3.5) / 0.2 (from ACSM equation, inverted)
 * Then applies a distance-specific efficiency factor.
 *
 * Ref: Daniels J. Daniels' Running Formula, 3rd ed. Human Kinetics, 2013.
 *
 * Note: This is a simplified approximation. Full VDOT tables would provide
 * more accurate predictions, especially for non-elite runners.
 */
export function predictRaceTimesFromVO2max(
  vo2max: number,
): RacePredictionResult[] {
  // Simplified: race VO2 as fraction of VO2max depends on duration
  // Shorter races use higher fraction (98-100%), marathon uses ~75-85%
  const RACE_PARAMS: Array<{
    name: RacePredictionResult["distance"];
    meters: number;
    fractionVO2max: number;
  }> = [
    { name: "5K", meters: 5000, fractionVO2max: 0.95 },
    { name: "10K", meters: 10000, fractionVO2max: 0.9 },
    { name: "half_marathon", meters: 21097.5, fractionVO2max: 0.83 },
    { name: "marathon", meters: 42195, fractionVO2max: 0.78 },
  ];

  return RACE_PARAMS.map(({ name, meters, fractionVO2max }) => {
    // VO2 at race effort
    const raceVO2 = vo2max * fractionVO2max;

    // Running velocity from ACSM equation (inverted)
    const speedMPerMin = (raceVO2 - 3.5) / 0.2;

    if (speedMPerMin <= 0) {
      return {
        distance: name,
        distanceMeters: meters,
        predictedSeconds: 0,
        predictedFormatted: "N/A",
        method: "vdot" as const,
        vo2maxUsed: vo2max,
      };
    }

    const predictedSeconds = Math.round((meters / speedMPerMin) * 60);

    return {
      distance: name,
      distanceMeters: meters,
      predictedSeconds,
      predictedFormatted: formatTime(predictedSeconds),
      method: "vdot" as const,
      vo2maxUsed: vo2max,
    };
  });
}

/**
 * Known low-confidence VO2max estimation sources excluded from trend analysis.
 * The Uth method (15.3 × HRmax/HRrest) has ±5 ml/kg/min accuracy
 * (Uth et al. 2004), which is too noisy for trend detection.
 */
const LOW_CONFIDENCE_SOURCES = new Set(["uth_method", "uth_ratio"]);

/**
 * Detect VO2max trend over a period.
 *
 * Uses simple linear regression on recent VO2max estimates.
 * A positive slope indicates improving aerobic capacity.
 *
 * Thresholds (informed by Firstbeat/Garmin documentation):
 * - Improving: slope > 0.5 ml/kg/min per 4 weeks
 * - Stable: slope within ±0.5
 * - Declining: slope < -0.5
 *
 * Note: At least 4 data points over 14+ days needed for meaningful trend.
 *
 * When source metadata is available, known low-confidence estimates
 * ("uth_method"/"uth_ratio") are excluded to prevent ambient daily
 * recalculations from skewing the trend. Other sources (including
 * "garmin_official", "running_pace_hr", "cooper", and any future/unknown
 * values) are retained.
 *
 * Ref: Uth N et al. (2004) — accuracy ±5 ml/kg/min (too noisy for trends).
 */
export function computeVO2maxTrend(
  estimates: Array<{ date: string; value: number; source?: string }>,
): {
  trend: "improving" | "stable" | "declining";
  slopePerWeek: number;
} | null {
  const hasSourceData = estimates.some((e) => e.source != null);
  const filtered = hasSourceData
    ? estimates.filter((e) => !LOW_CONFIDENCE_SOURCES.has(e.source ?? ""))
    : estimates;

  if (filtered.length < 4) return null;

  // Simple linear regression (days as x, VO2max as y)
  const startDate = new Date(filtered[0]!.date).getTime();
  const points = filtered.map((e) => ({
    x: (new Date(e.date).getTime() - startDate) / (1000 * 60 * 60 * 24), // days
    y: e.value,
  }));

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { trend: "stable", slopePerWeek: 0 };

  const slopePerDay = (n * sumXY - sumX * sumY) / denom;
  const slopePerWeek = Math.round(slopePerDay * 7 * 100) / 100;

  // 0.5 ml/kg/min per 4 weeks = 0.125 per week
  const trend =
    slopePerWeek > 0.125
      ? "improving"
      : slopePerWeek < -0.125
        ? "declining"
        : "stable";

  return { trend, slopePerWeek };
}

function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
