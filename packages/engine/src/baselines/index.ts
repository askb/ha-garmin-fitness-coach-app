import type { DailyMetricInput, Baselines } from "../types";

// Default baselines for cold-start (new users with < 7 days data)
const POPULATION_DEFAULTS = {
  male: { hrv: 45, restingHr: 62, sleep: 420, dailyStrainCapacity: 12 },
  female: { hrv: 50, restingHr: 65, sleep: 420, dailyStrainCapacity: 11 },
  other: { hrv: 47, restingHr: 63, sleep: 420, dailyStrainCapacity: 11.5 },
} as const;

/**
 * Compute 30-day exponential moving average (EMA).
 * α = 2 / (period + 1)
 */
export function computeEMA(
  values: number[],
  period = 30,
): number {
  if (values.length === 0) return 0;
  const alpha = 2 / (period + 1);
  let ema = values[0]!;
  for (let i = 1; i < values.length; i++) {
    ema = alpha * values[i]! + (1 - alpha) * ema;
  }
  return ema;
}

/**
 * Get population defaults for cold-start users.
 */
export function getPopulationDefaults(
  sex: string | null,
): Baselines {
  const key = (sex === "male" || sex === "female") ? sex : "other";
  return { ...POPULATION_DEFAULTS[key] };
}

/**
 * Compute personal baselines from historical daily metrics.
 * Blends personal data with population defaults based on data availability.
 */
export function computeBaselines(
  metrics: DailyMetricInput[],
  sex: string | null,
): Baselines {
  const defaults = getPopulationDefaults(sex);
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

  // Compute EMAs
  const personalHrv = hrvValues.length > 0 ? computeEMA(hrvValues) : null;
  const personalRhr = rhrValues.length > 0 ? computeEMA(rhrValues) : null;
  const personalSleep = sleepValues.length > 0 ? computeEMA(sleepValues) : null;

  // Blend: weight personal data more as we accumulate data
  const personalWeight = Math.min(1.0, daysOfData / 30);

  const blend = (personal: number | null, defaultVal: number): number => {
    if (personal === null) return defaultVal;
    return personalWeight * personal + (1 - personalWeight) * defaultVal;
  };

  return {
    hrv: blend(personalHrv, defaults.hrv),
    restingHr: blend(personalRhr, defaults.restingHr),
    sleep: blend(personalSleep, defaults.sleep),
    dailyStrainCapacity: defaults.dailyStrainCapacity,
  };
}
