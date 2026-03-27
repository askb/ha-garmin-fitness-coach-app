import type { DailyMetricInput, SleepCoachResult } from "../types";

/**
 * SLEEP COACH — Evidence-Based Sleep Recommendations
 *
 * Ref: Hirshkowitz M et al. National Sleep Foundation's sleep time duration
 *      recommendations. Sleep Health. 2015;1(1):40-43.
 *   → Adults 18-64: 7-9 hours, 65+: 7-8 hours
 *
 * Ref: Bird SP. Sleep, recovery, and athletic performance.
 *      Strength Cond J. 2013;35(5):43-47.
 *   → Athletes should target 8-10 hours for optimal recovery
 *
 * Ref: Mah CD et al. The effects of sleep extension on the athletic
 *      performance of collegiate basketball players. Sleep. 2011;34(7):943-950.
 *   → Extending sleep to 10h improved sprint times, free throw %, reaction time
 *
 * Ref: Simpson NS et al. Repeating patterns of sleep restriction and recovery:
 *      do we bounce back? Sleep. 2016;39(3):693-700.
 *   → Sleep debt accumulates and requires extended recovery sleep to repay
 */

/**
 * Calculate sleep need based on training load and individual factors.
 *
 * Base need: 7.5h for adults, 8.5h for athletes (Bird 2013)
 * Adjustments:
 * - +30 min for high training load (strain > 14)
 * - +15 min for moderate training load (strain 8-14)
 * - +30 min if sleep debt > 120 min over last 3 days
 * - Age 18-25: +15 min (growth/recovery needs)
 * - Age 65+: -30 min (Hirshkowitz 2015)
 */
export function calculateSleepNeed(
  age: number | null,
  isAthlete: boolean,
  recentStrain: number, // today's strain or average recent strain
  sleepDebtMinutes: number,
): number {
  // Base need (minutes)
  let need = isAthlete ? 510 : 450; // 8.5h or 7.5h

  // Training load adjustment
  if (recentStrain > 14) need += 30;
  else if (recentStrain > 8) need += 15;

  // Sleep debt payback
  if (sleepDebtMinutes > 120) need += 30;
  else if (sleepDebtMinutes > 60) need += 15;

  // Age adjustments (Hirshkowitz et al. 2015)
  if (age !== null) {
    if (age <= 25) need += 15;
    else if (age >= 65) need -= 30;
  }

  return Math.round(need);
}

/**
 * Calculate cumulative sleep debt over a rolling window.
 *
 * Sleep debt = sum of (need - actual) for days where actual < need.
 * Positive number = minutes of accumulated debt.
 *
 * Ref: Simpson NS et al. (2016) — Sleep debt accumulates and impairs
 * performance even after "recovery" sleep.
 */
export function calculateSleepDebt(
  recentMetrics: DailyMetricInput[], // last 7 days, most recent first
  sleepNeedMinutes: number,
): number {
  let debt = 0;
  for (const m of recentMetrics.slice(0, 7)) {
    if (
      m.totalSleepMinutes !== null &&
      m.totalSleepMinutes < sleepNeedMinutes
    ) {
      debt += sleepNeedMinutes - m.totalSleepMinutes;
    }
  }
  return Math.round(debt);
}

/**
 * Generate sleep coach recommendation.
 *
 * Combines sleep need calculation with bedtime optimization.
 *
 * Bedtime recommendation based on:
 * - Desired wake time (from user profile or recent pattern)
 * - Calculated sleep need
 * - Sleep onset latency (typically 10-20 min for healthy adults)
 *   Ref: Ohayon MM et al. Meta-analysis of quantitative sleep parameters.
 *        Sleep. 2004;27(7):1255-1273.
 */
export function generateSleepCoachResult(
  age: number | null,
  isAthlete: boolean,
  recentStrain: number,
  recentMetrics: DailyMetricInput[],
  wakeTimeHHMM: string | null, // "06:30" format
): SleepCoachResult {
  const sleepNeedMinutes = calculateSleepNeed(age, isAthlete, recentStrain, 0);
  const sleepDebt = calculateSleepDebt(recentMetrics, sleepNeedMinutes);

  // Recalculate with debt factored in
  const adjustedNeed = calculateSleepNeed(
    age,
    isAthlete,
    recentStrain,
    sleepDebt,
  );

  // Calculate bedtime from wake time
  let recommendedBedtime: string | null = null;
  const recommendedWakeTime: string | null = wakeTimeHHMM;

  if (wakeTimeHHMM) {
    const [wakeH, wakeM] = wakeTimeHHMM.split(":").map(Number);
    if (wakeH !== undefined && wakeM !== undefined) {
      const wakeMinutes = wakeH * 60 + wakeM;
      const sleepOnsetLatency = 15; // minutes (Ohayon et al. 2004)
      const bedtimeMinutes = wakeMinutes - adjustedNeed - sleepOnsetLatency;

      const normalizedBedtime = ((bedtimeMinutes % 1440) + 1440) % 1440;
      const bedH = Math.floor(normalizedBedtime / 60);
      const bedM = normalizedBedtime % 60;
      recommendedBedtime = `${String(bedH).padStart(2, "0")}:${String(bedM).padStart(2, "0")}`;
    }
  }

  // Generate insight
  const hoursNeed = (adjustedNeed / 60).toFixed(1);
  let insight: string;

  if (sleepDebt > 120) {
    insight = `You have ${Math.round(sleepDebt / 60)}h of sleep debt. Target ${hoursNeed}h tonight to recover. Sleep debt impairs reaction time, mood, and recovery (Simpson et al. 2016).`;
  } else if (sleepDebt > 60) {
    insight = `Minor sleep debt of ${Math.round(sleepDebt / 60)}h. Aim for ${hoursNeed}h tonight. Getting to bed 30 min earlier can make a significant difference.`;
  } else if (recentStrain > 14) {
    insight = `High training load today — aim for ${hoursNeed}h sleep for optimal recovery. Athletes benefit from 8-10h after hard training (Bird 2013).`;
  } else {
    insight = `Sleep is on track. Target ${hoursNeed}h for optimal recovery and performance.`;
  }

  return {
    recommendedMinutes: adjustedNeed,
    recommendedBedtime,
    recommendedWakeTime,
    sleepDebtMinutes: sleepDebt,
    insight,
  };
}
