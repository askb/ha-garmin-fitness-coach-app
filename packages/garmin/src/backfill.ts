/**
 * Backfill stub — generates realistic mock Garmin data for N days.
 *
 * Follows the same data-generation patterns as the DB seed script
 * (`packages/db/src/seed.ts`) to produce data ready for DB insertion.
 *
 * TODO: Replace with real Garmin Health API calls once the API key is approved.
 *       The real implementation will paginate through historical daily summaries
 *       and activities for the given date range.
 */

import type { NormalizedActivity, NormalizedDailyMetric } from "./types";

// Deterministic pseudo-random for reproducible test data
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export interface BackfillResult {
  metrics: NormalizedDailyMetric[];
  activities: NormalizedActivity[];
}

/**
 * Generate `days` worth of realistic mock daily-metric and activity data.
 *
 * @param _accessToken - Garmin access token (unused in stub)
 * @param days         - Number of days to backfill (counting back from today)
 * @returns Normalized arrays ready for DB insertion
 */
export function backfillDays(
  _accessToken: string,
  days: number,
): BackfillResult {
  const rand = seededRandom(42);
  const randBetween = (min: number, max: number) =>
    Math.round(min + rand() * (max - min));
  const randFloat = (min: number, max: number) =>
    Math.round((min + rand() * (max - min)) * 100) / 100;

  const metrics: NormalizedDailyMetric[] = [];
  const activities: NormalizedActivity[] = [];

  const today = new Date();

  for (let daysAgo = days - 1; daysAgo >= 0; daysAgo--) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    const dateStr = date.toISOString().split("T")[0]!;

    const isGoodSleep = rand() > 0.3;
    const isRestDay = rand() > 0.7;
    const isHardDay = !isRestDay && rand() > 0.6;

    metrics.push({
      date: dateStr,
      sleepScore: randBetween(isGoodSleep ? 65 : 35, isGoodSleep ? 95 : 60),
      totalSleepMinutes: randBetween(
        isGoodSleep ? 380 : 280,
        isGoodSleep ? 510 : 380,
      ),
      deepSleepMinutes: randBetween(60, 120),
      remSleepMinutes: randBetween(70, 130),
      lightSleepMinutes: randBetween(120, 220),
      awakeMinutes: randBetween(10, 45),
      hrv: randFloat(35, 65),
      restingHr: randBetween(54, 68),
      maxHr: isRestDay ? randBetween(90, 120) : randBetween(155, 188),
      stressScore: randBetween(15, 65),
      bodyBatteryStart: randBetween(40, 95),
      bodyBatteryEnd: randBetween(15, 50),
      steps: randBetween(3000, 15000),
      calories: randBetween(1800, 3200),
      garminTrainingReadiness: rand() > 0.5 ? randBetween(30, 95) : null,
      garminTrainingLoad: rand() > 0.5 ? randFloat(20, 120) : null,
      rawGarminData: {} as never, // stub — no raw data in mock mode
    });

    if (!isRestDay) {
      const isRunDay = rand() > 0.4;
      const activityDate = new Date(date);
      activityDate.setHours(7, 0, 0, 0);
      const durationMin = randBetween(25, 70);

      activities.push({
        garminActivityId: `mock-activity-${dateStr}`,
        sportType: isRunDay ? "running" : "strength",
        subType: isRunDay
          ? isHardDay
            ? "intervals"
            : "easy_run"
          : "full_body",
        startedAt: activityDate,
        endedAt: new Date(activityDate.getTime() + durationMin * 60_000),
        durationMinutes: durationMin,
        distanceMeters: isRunDay ? randFloat(3000, 12000) : null,
        avgHr: isHardDay ? randBetween(145, 170) : randBetween(115, 145),
        maxHr: isHardDay ? randBetween(170, 188) : randBetween(140, 165),
        avgPaceSecPerKm: isRunDay ? randBetween(270, 360) : null,
        calories: randBetween(200, 600),
        vo2maxEstimate: isRunDay ? randFloat(45, 55) : null,
        rawGarminData: {} as never, // stub — no raw data in mock mode
      });
    }
  }

  return { metrics, activities };
}
