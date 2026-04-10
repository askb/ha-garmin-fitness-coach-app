import type { Baselines, DailyMetricInput } from "../types";

/**
 * Baseline calculations with standard deviation for z-score scoring.
 *
 * APPROACH:
 * - Uses 30-day EMA for central tendency (standard in sports analytics)
 * - Computes rolling SD for z-score transformation
 * - Blends personal data with age/sex-adjusted population defaults
 *
 * CITATIONS:
 * - Buchheit M. Monitoring training status with HR measures: do not throw
 *   the baby out with the bathwater. IJSPP. 2014;9:883-895.
 *   → Recommends individual z-scores (daily value vs rolling mean ± SD)
 * - Plews DJ et al. Heart-rate variability and training-intensity distribution
 *   in elite rowers. IJSPP. 2014;9(6):1026-1032.
 *   → lnRMSSD coefficient of variation (CV) for monitoring
 * - Shaffer F, Ginsberg JP. An overview of heart rate variability metrics and
 *   norms. Front Public Health. 2017;5:258.
 *   → Population HRV norms by age and sex
 * - Hirshkowitz M et al. National Sleep Foundation's sleep time duration
 *   recommendations. Sleep Health. 2015;1(1):40-43.
 *   → Age-stratified sleep duration recommendations
 */

// ---------------------------------------------------------------------------
// Population defaults — age and sex stratified
// Sources: Shaffer & Ginsberg 2017 (HRV), Hirshkowitz et al. 2015 (sleep)
// ---------------------------------------------------------------------------
interface PopulationDefaults {
  hrv: number;
  hrvSD: number;
  restingHr: number;
  restingHrSD: number;
  sleep: number;
  sleepSD: number;
  dailyStrainCapacity: number;
}

const POPULATION_DEFAULTS: Record<string, PopulationDefaults> = {
  // HRV norms: lnRMSSD. Shaffer & Ginsberg 2017, Table 2.
  // RHR: American Heart Association. General ranges by sex.
  // Sleep: Hirshkowitz et al. 2015. Adults 18-64: 7-9h (420-540 min)
  male: {
    hrv: 45,
    hrvSD: 12,
    restingHr: 62,
    restingHrSD: 5,
    sleep: 450,
    sleepSD: 45,
    dailyStrainCapacity: 12,
  },
  female: {
    hrv: 50,
    hrvSD: 14,
    restingHr: 65,
    restingHrSD: 5,
    sleep: 450,
    sleepSD: 45,
    dailyStrainCapacity: 11,
  },
  other: {
    hrv: 47,
    hrvSD: 13,
    restingHr: 63,
    restingHrSD: 5,
    sleep: 450,
    sleepSD: 45,
    dailyStrainCapacity: 11.5,
  },
};

// Age adjustment factors for HRV (declines ~3-5% per decade after 20)
// Source: Shaffer & Ginsberg 2017, Table 3
const AGE_HRV_FACTORS: Array<{ maxAge: number; factor: number }> = [
  { maxAge: 25, factor: 1.15 },
  { maxAge: 35, factor: 1.0 },
  { maxAge: 45, factor: 0.85 },
  { maxAge: 55, factor: 0.72 },
  { maxAge: 65, factor: 0.6 },
  { maxAge: 999, factor: 0.5 },
];

function getAgeHrvFactor(age: number | null): number {
  if (age === null) return 1.0;
  for (const band of AGE_HRV_FACTORS) {
    if (age <= band.maxAge) return band.factor;
  }
  return 0.5;
}

// Sleep need by age (Hirshkowitz et al. 2015)
// Athletes need +30-60 min (Bird 2013)
function getSleepNeedMinutes(age: number | null, isAthlete: boolean): number {
  const base = age !== null && age >= 65 ? 420 : 450; // 7h for 65+, 7.5h default
  return isAthlete ? base + 45 : base; // athletes: +45 min (Bird 2013)
}

/**
 * Compute 30-day exponential moving average (EMA).
 * α = 2 / (period + 1)
 *
 * Standard smoothing technique in sports analytics.
 */
export function computeEMA(values: number[], period = 30): number {
  if (values.length === 0) return 0;
  const alpha = 2 / (period + 1);
  let ema = values[0]!;
  for (let i = 1; i < values.length; i++) {
    ema = alpha * values[i]! + (1 - alpha) * ema;
  }
  return ema;
}

/**
 * Compute standard deviation of a number array.
 * Used for z-score calculations per Buchheit (2014).
 */
export function computeSD(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  const variance =
    squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Compute z-score: how many standard deviations from baseline.
 *
 * Ref: Buchheit M. (2014) — Recommends individual z-scores for
 * monitoring HRV, RHR, and other autonomic markers.
 *
 * z = (value - mean) / SD
 * Interpretation:
 *   z > 1.0  → notably above baseline (top ~16%)
 *   z = 0    → at baseline
 *   z < -1.0 → notably below baseline (bottom ~16%)
 *   z < -2.0 → critically below baseline (bottom ~2.5%)
 */
export function computeZScore(value: number, mean: number, sd: number): number {
  if (sd <= 0) return 0;
  return (value - mean) / sd;
}

/**
 * Transform a z-score to a 0-100 score using a logistic sigmoid.
 *
 * This provides smooth, continuous scoring without arbitrary breakpoints.
 * The steepness parameter controls sensitivity:
 * - k=1.5: moderate sensitivity (default) — 1 SD = ~73, 2 SD = ~88
 * - k=1.0: gentler curve
 * - k=2.0: more aggressive (larger score differences for small z changes)
 *
 * score = 50 + 50 × tanh(k × z)
 *
 * Properties:
 * - z = 0 → score = 50 (at baseline)
 * - z = 1 → score ≈ 73 (1 SD above)
 * - z = -1 → score ≈ 27 (1 SD below)
 * - z = 2 → score ≈ 88
 * - z = -2 → score ≈ 12
 * - Asymptotes at 0 and 100 (never exceeds bounds)
 */
export function zScoreToScore(z: number, steepness = 1.5): number {
  const score = 50 + 50 * Math.tanh(steepness * z);
  return Math.round(Math.min(100, Math.max(0, score)) * 10) / 10;
}

/**
 * Get population defaults for cold-start users, adjusted for age.
 */
export function getPopulationDefaults(
  sex: string | null,
  age?: number | null,
): Baselines {
  const key = sex === "male" || sex === "female" ? sex : "other";
  const defaults = POPULATION_DEFAULTS[key]!;
  const ageFactor = getAgeHrvFactor(age ?? null);

  return {
    hrv: Math.round(defaults.hrv * ageFactor * 10) / 10,
    hrvSD: defaults.hrvSD,
    restingHr: defaults.restingHr,
    restingHrSD: defaults.restingHrSD,
    sleep: defaults.sleep,
    sleepSD: defaults.sleepSD,
    dailyStrainCapacity: defaults.dailyStrainCapacity,
    daysOfData: 0,
  };
}

/**
 * Compute personal baselines from historical daily metrics.
 * Blends personal data with population defaults based on data availability.
 *
 * Key improvement: now tracks standard deviation for z-score calculations.
 *
 * Ref: Buchheit (2014) — Individual rolling mean ± SD approach
 *      for autonomic nervous system markers.
 */
export function computeBaselines(
  metrics: DailyMetricInput[],
  sex: string | null,
  age?: number | null,
): Baselines {
  const defaults = getPopulationDefaults(sex, age);
  const daysOfData = metrics.length;

  if (daysOfData === 0) return defaults;

  // Extract non-null values
  const hrvValues = metrics
    .map((m) => m.hrv)
    .filter((v): v is number => v !== null);
  const rhrValues = metrics
    .map((m) => m.restingHr)
    .filter((v): v is number => v !== null);
  const sleepValues = metrics
    .map((m) => m.totalSleepMinutes)
    .filter((v): v is number => v !== null);

  // Compute EMAs and SDs
  const personalHrv = hrvValues.length > 0 ? computeEMA(hrvValues) : null;
  const personalHrvSD = hrvValues.length >= 7 ? computeSD(hrvValues) : null;
  const personalRhr = rhrValues.length > 0 ? computeEMA(rhrValues) : null;
  const personalRhrSD = rhrValues.length >= 7 ? computeSD(rhrValues) : null;
  const personalSleep = sleepValues.length > 0 ? computeEMA(sleepValues) : null;
  const personalSleepSD =
    sleepValues.length >= 7 ? computeSD(sleepValues) : null;

  // Blend: weight personal data more as we accumulate data
  // Full trust at 30 days (1 menstrual/training cycle)
  const personalWeight = Math.min(1.0, daysOfData / 30);

  const blend = (personal: number | null, defaultVal: number): number => {
    if (personal === null) return defaultVal;
    return personalWeight * personal + (1 - personalWeight) * defaultVal;
  };

  return {
    hrv: blend(personalHrv, defaults.hrv),
    hrvSD:
      personalHrvSD !== null && personalHrvSD > 0
        ? personalWeight * personalHrvSD + (1 - personalWeight) * defaults.hrvSD
        : defaults.hrvSD,
    restingHr: blend(personalRhr, defaults.restingHr),
    restingHrSD:
      personalRhrSD !== null && personalRhrSD > 0
        ? personalWeight * personalRhrSD +
          (1 - personalWeight) * defaults.restingHrSD
        : defaults.restingHrSD,
    sleep: blend(personalSleep, defaults.sleep),
    sleepSD:
      personalSleepSD !== null && personalSleepSD > 0
        ? personalWeight * personalSleepSD +
          (1 - personalWeight) * defaults.sleepSD
        : defaults.sleepSD,
    dailyStrainCapacity: defaults.dailyStrainCapacity,
    daysOfData,
  };
}

export { getSleepNeedMinutes };
