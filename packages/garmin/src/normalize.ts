/**
 * Normalizers that map raw Garmin API field names to our DailyMetric / Activity
 * schema fields defined in @acme/db.
 *
 * Field mapping reference (Garmin → our schema):
 *
 *   sleepDurationInSeconds ÷ 60        → totalSleepMinutes
 *   deepSleepDurationInSeconds ÷ 60    → deepSleepMinutes
 *   remSleepInSeconds ÷ 60             → remSleepMinutes
 *   lightSleepDurationInSeconds ÷ 60   → lightSleepMinutes
 *   awakeDurationInSeconds ÷ 60        → awakeMinutes
 *   restingHeartRateInBeatsPerMinute    → restingHr
 *   maxHeartRateInBeatsPerMinute        → maxHr
 *   averageStressLevel                  → stressScore
 *   bodyBatteryChargedValue             → bodyBatteryStart
 *   bodyBatteryDrainedValue             → bodyBatteryEnd
 *   sleepScoreValue                     → sleepScore
 *   trainingReadinessScore              → garminTrainingReadiness
 *   trainingLoadValue                   → garminTrainingLoad
 *   steps                               → steps
 *   totalKilocalories                   → calories
 *
 *   activityType                        → sportType
 *   activitySubType                     → subType
 *   durationInSeconds ÷ 60             → durationMinutes
 *   distanceInMeters                    → distanceMeters
 *   averageHeartRateInBeatsPerMinute    → avgHr
 *   maxHeartRateInBeatsPerMinute        → maxHr
 *   averagePaceInMinutesPerKilometer × 60 → avgPaceSecPerKm
 *   activeKilocalories                  → calories
 *   vO2MaxValue                         → vo2maxEstimate
 */

import type {
  GarminActivity,
  GarminDailySummary,
  NormalizedActivity,
  NormalizedDailyMetric,
} from "./types";

/** Convert seconds to whole minutes */
const secToMin = (sec: number): number => Math.round(sec / 60);

/**
 * Map a raw Garmin daily summary to our DailyMetric schema shape.
 */
export function normalizeDailySummary(
  garminData: GarminDailySummary,
): NormalizedDailyMetric {
  return {
    date: garminData.calendarDate,
    sleepScore: garminData.sleepScoreValue ?? null,
    totalSleepMinutes: secToMin(garminData.sleepDurationInSeconds),
    deepSleepMinutes: secToMin(garminData.deepSleepDurationInSeconds),
    remSleepMinutes: secToMin(garminData.remSleepInSeconds),
    lightSleepMinutes: secToMin(garminData.lightSleepDurationInSeconds),
    awakeMinutes: secToMin(garminData.awakeDurationInSeconds),
    hrv: null, // HRV comes from a separate Garmin endpoint
    restingHr: garminData.restingHeartRateInBeatsPerMinute,
    maxHr: garminData.maxHeartRateInBeatsPerMinute,
    stressScore: garminData.averageStressLevel,
    bodyBatteryStart: garminData.bodyBatteryChargedValue,
    bodyBatteryEnd: garminData.bodyBatteryDrainedValue,
    steps: garminData.steps,
    calories: garminData.totalKilocalories,
    garminTrainingReadiness: garminData.trainingReadinessScore ?? null,
    garminTrainingLoad: garminData.trainingLoadValue ?? null,
    rawGarminData: garminData,
  };
}

/**
 * Map a raw Garmin activity to our Activity schema shape.
 */
export function normalizeActivity(
  garminData: GarminActivity,
): NormalizedActivity {
  const startMs = garminData.startTimeInSeconds * 1000;
  const durationMs = garminData.durationInSeconds * 1000;

  return {
    garminActivityId: garminData.activityId,
    sportType: garminData.activityType,
    subType: garminData.activitySubType ?? null,
    startedAt: new Date(startMs),
    endedAt: new Date(startMs + durationMs),
    durationMinutes: Math.round(garminData.durationInSeconds / 60),
    distanceMeters: garminData.distanceInMeters ?? null,
    avgHr: garminData.averageHeartRateInBeatsPerMinute ?? null,
    maxHr: garminData.maxHeartRateInBeatsPerMinute ?? null,
    avgPaceSecPerKm: garminData.averagePaceInMinutesPerKilometer
      ? Math.round(garminData.averagePaceInMinutesPerKilometer * 60)
      : null,
    calories: garminData.activeKilocalories ?? null,
    vo2maxEstimate: garminData.vO2MaxValue ?? null,
    rawGarminData: garminData,
  };
}
