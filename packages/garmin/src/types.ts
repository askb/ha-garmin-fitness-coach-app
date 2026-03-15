// ---------------------------------------------------------------------------
// Garmin API Response Types (as returned by Garmin Health API)
// ---------------------------------------------------------------------------

/** Raw Garmin daily summary from the Health API / webhook push */
export interface GarminDailySummary {
  summaryId: string;
  calendarDate: string;
  startTimeInSeconds: number;
  durationInSeconds: number;
  sleepDurationInSeconds: number;
  deepSleepDurationInSeconds: number;
  remSleepInSeconds: number;
  lightSleepDurationInSeconds: number;
  awakeDurationInSeconds: number;
  averageHeartRateInBeatsPerMinute: number;
  restingHeartRateInBeatsPerMinute: number;
  maxHeartRateInBeatsPerMinute: number;
  averageStressLevel: number;
  bodyBatteryChargedValue: number;
  bodyBatteryDrainedValue: number;
  steps: number;
  activeKilocalories: number;
  totalKilocalories: number;
  vO2MaxValue: number | null;
  sleepScoreQuality: string | null;
  sleepScoreValue: number | null;
  trainingReadinessScore: number | null;
  trainingLoadValue: number | null;
}

/** Raw Garmin activity from the Health API / webhook push */
export interface GarminActivity {
  activityId: string;
  activityType: string;
  activitySubType: string | null;
  startTimeInSeconds: number;
  durationInSeconds: number;
  distanceInMeters: number | null;
  averageHeartRateInBeatsPerMinute: number | null;
  maxHeartRateInBeatsPerMinute: number | null;
  averageRunningCadenceInStepsPerMinute: number | null;
  averagePaceInMinutesPerKilometer: number | null;
  activeKilocalories: number | null;
  vO2MaxValue: number | null;
}

/** Raw Garmin sleep data from the Health API / webhook push */
export interface GarminSleepData {
  summaryId: string;
  calendarDate: string;
  startTimeInSeconds: number;
  durationInSeconds: number;
  deepSleepDurationInSeconds: number;
  lightSleepDurationInSeconds: number;
  remSleepInSeconds: number;
  awakeDurationInSeconds: number;
  sleepScoreValue: number | null;
  sleepScoreQuality: string | null;
  restingHeartRateInBeatsPerMinute: number | null;
}

// ---------------------------------------------------------------------------
// Webhook payload types
// ---------------------------------------------------------------------------

export interface GarminWebhookPayload {
  type: "dailySummary" | "activity" | "sleep";
  userId: string;
  summaryId?: string;
  activityId?: string;
  data: GarminDailySummary | GarminActivity | GarminSleepData;
}

// ---------------------------------------------------------------------------
// OAuth types
// ---------------------------------------------------------------------------

export interface GarminOAuthTokens {
  accessToken: string;
  refreshToken: string;
  garminUserId: string;
}

// ---------------------------------------------------------------------------
// Normalized types (matching our DB schema fields)
// ---------------------------------------------------------------------------

export interface NormalizedDailyMetric {
  date: string;
  sleepScore: number | null;
  totalSleepMinutes: number | null;
  deepSleepMinutes: number | null;
  remSleepMinutes: number | null;
  lightSleepMinutes: number | null;
  awakeMinutes: number | null;
  hrv: number | null;
  restingHr: number | null;
  maxHr: number | null;
  stressScore: number | null;
  bodyBatteryStart: number | null;
  bodyBatteryEnd: number | null;
  steps: number | null;
  calories: number | null;
  garminTrainingReadiness: number | null;
  garminTrainingLoad: number | null;
  rawGarminData: GarminDailySummary;
}

export interface NormalizedActivity {
  garminActivityId: string;
  sportType: string;
  subType: string | null;
  startedAt: Date;
  endedAt: Date;
  durationMinutes: number;
  distanceMeters: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgPaceSecPerKm: number | null;
  calories: number | null;
  vo2maxEstimate: number | null;
  rawGarminData: GarminActivity;
}
