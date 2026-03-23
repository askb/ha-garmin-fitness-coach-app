import { relations } from "drizzle-orm";
import { pgTable } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Re-export auth schema tables
export * from "./auth-schema";

// ---------------------------------------------------------------------------
// User Profile (extends auth user)
// ---------------------------------------------------------------------------
export const Profile = pgTable("profile", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  userId: t.text().notNull().unique(),
  age: t.integer(),
  sex: t.varchar({ length: 20 }),
  massKg: t.doublePrecision(),
  heightCm: t.doublePrecision(),
  timezone: t.varchar({ length: 50 }).default("UTC"),
  experienceLevel: t
    .varchar({ length: 20 })
    .default("intermediate"),
  primarySports: t.jsonb().$type<string[]>().default([]),
  goals: t
    .jsonb()
    .$type<{ sport: string; goalType: string; target?: string }[]>()
    .default([]),
  weeklyDays: t.jsonb().$type<string[]>().default([]),
  minutesPerDay: t.integer().default(45),
  maxHr: t.integer(),
  restingHrBaseline: t.doublePrecision(),
  hrvBaseline: t.doublePrecision(),
  sleepBaseline: t.doublePrecision(),
  vo2maxRunning: t.doublePrecision(),
  vo2maxCycling: t.doublePrecision(),
  lactateThreshold: t.integer(),
  functionalThresholdPower: t.doublePrecision(),
  audienceMode: t.varchar({ length: 20 }).default("all"),
  healthConditions: t
    .jsonb()
    .$type<string[]>()
    .default([]),
  currentInjuries: t
    .jsonb()
    .$type<{ bodyPart: string; severity: "mild" | "moderate" | "severe"; since?: string; notes?: string }[]>()
    .default([]),
  medications: t.text(),
  allergies: t.text(),
  createdAt: t.timestamp().defaultNow().notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true }).defaultNow()
    .$onUpdateFn(() => new Date()),
}));

export const CreateProfileSchema = createInsertSchema(Profile, {
  sex: z.enum(["male", "female", "other"]).optional(),
  experienceLevel: z
    .enum(["beginner", "intermediate", "advanced"])
    .optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ---------------------------------------------------------------------------
// Daily Metrics (Garmin health data)
// ---------------------------------------------------------------------------
export const DailyMetric = pgTable(
  "daily_metric",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t.text().notNull(),
    date: t.date().notNull(),
    sleepScore: t.integer(),
    totalSleepMinutes: t.integer(),
    deepSleepMinutes: t.integer(),
    remSleepMinutes: t.integer(),
    lightSleepMinutes: t.integer(),
    awakeMinutes: t.integer(),
    hrv: t.doublePrecision(),
    restingHr: t.integer(),
    maxHr: t.integer(),
    stressScore: t.integer(),
    bodyBatteryStart: t.integer(),
    bodyBatteryEnd: t.integer(),
    steps: t.integer(),
    calories: t.integer(),
    garminTrainingReadiness: t.integer(),
    garminTrainingLoad: t.doublePrecision(),
    respirationRate: t.doublePrecision(),
    spo2: t.doublePrecision(),
    skinTemp: t.doublePrecision(),
    intensityMinutes: t.integer(),
    floorsClimbed: t.integer(),
    bodyBatteryHigh: t.integer(),
    bodyBatteryLow: t.integer(),
    hrvOvernight: t.jsonb().$type<number[]>(),
    sleepStartTime: t.varchar({ length: 10 }),
    sleepEndTime: t.varchar({ length: 10 }),
    sleepNeedMinutes: t.integer(),
    sleepDebtMinutes: t.integer(),
    rawGarminData: t.jsonb(),
    syncedAt: t.timestamp().defaultNow().notNull(),
    garminApiVersion: t.varchar({ length: 20 }),
    deviceModel: t.varchar({ length: 50 }),
    rawDataHash: t.varchar({ length: 64 }),
  }),
  (table) => [
    {
      name: "daily_metric_user_date_unique",
      columns: [table.userId, table.date],
      unique: true,
    },
  ],
);

export const CreateDailyMetricSchema = createInsertSchema(DailyMetric).omit({
  id: true,
  syncedAt: true,
});

// ---------------------------------------------------------------------------
// Activities (Garmin workout data)
// ---------------------------------------------------------------------------
export const Activity = pgTable("activity", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  userId: t.text().notNull(),
  garminActivityId: t.varchar({ length: 100 }).unique(),
  sportType: t.varchar({ length: 50 }).notNull(),
  subType: t.varchar({ length: 50 }),
  startedAt: t.timestamp({ withTimezone: true }).notNull(),
  endedAt: t.timestamp({ withTimezone: true }),
  durationMinutes: t.doublePrecision().notNull(),
  distanceMeters: t.doublePrecision(),
  avgHr: t.integer(),
  maxHr: t.integer(),
  avgPaceSecPerKm: t.integer(),
  calories: t.integer(),
  trimpScore: t.doublePrecision(),
  strainScore: t.doublePrecision(),
  vo2maxEstimate: t.doublePrecision(),
  avgPower: t.doublePrecision(),
  maxPower: t.doublePrecision(),
  normalizedPower: t.doublePrecision(),
  avgCadence: t.doublePrecision(),
  maxCadence: t.doublePrecision(),
  elevationGain: t.doublePrecision(),
  elevationLoss: t.doublePrecision(),
  aerobicTE: t.doublePrecision(),
  anaerobicTE: t.doublePrecision(),
  epocMl: t.doublePrecision(),
  avgGroundContactTime: t.doublePrecision(),
  gctBalance: t.doublePrecision(),
  verticalOscillation: t.doublePrecision(),
  verticalRatio: t.doublePrecision(),
  strideLength: t.doublePrecision(),
  avgRespirationRate: t.doublePrecision(),
  laps: t
    .jsonb()
    .$type<
      Array<{
        index: number;
        distanceMeters: number;
        durationSeconds: number;
        avgHr?: number;
        avgPace?: number;
        avgPower?: number;
      }>
    >(),
  hrZoneMinutes: t
    .jsonb()
    .$type<{
      zone1: number;
      zone2: number;
      zone3: number;
      zone4: number;
      zone5: number;
    }>(),
  rawGarminData: t.jsonb(),
  syncedAt: t.timestamp().defaultNow().notNull(),
  garminApiVersion: t.varchar({ length: 20 }),
  deviceModel: t.varchar({ length: 50 }),
  rawDataHash: t.varchar({ length: 64 }),
}));

export const CreateActivitySchema = createInsertSchema(Activity).omit({
  id: true,
  syncedAt: true,
});

// ---------------------------------------------------------------------------
// Readiness Scores (computed daily)
// ---------------------------------------------------------------------------
export const ReadinessScore = pgTable(
  "readiness_score",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t.text().notNull(),
    date: t.date().notNull(),
    score: t.integer().notNull(),
    zone: t.varchar({ length: 20 }).notNull(),
    sleepQuantityComponent: t.doublePrecision(),
    sleepQualityComponent: t.doublePrecision(),
    hrvComponent: t.doublePrecision(),
    restingHrComponent: t.doublePrecision(),
    trainingLoadComponent: t.doublePrecision(),
    stressComponent: t.doublePrecision(),
    explanation: t.text(),
    factors: t.jsonb(),
    computedAt: t.timestamp().defaultNow().notNull(),
  }),
  (table) => [
    {
      name: "readiness_score_user_date_unique",
      columns: [table.userId, table.date],
      unique: true,
    },
  ],
);

// ---------------------------------------------------------------------------
// Weekly Plans
// ---------------------------------------------------------------------------
export const WeeklyPlan = pgTable("weekly_plan", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  userId: t.text().notNull(),
  weekStart: t.date().notNull(),
  sport: t.varchar({ length: 50 }).notNull(),
  goalType: t.varchar({ length: 50 }).notNull(),
  template: t.jsonb(),
  createdAt: t.timestamp().defaultNow().notNull(),
}));

// ---------------------------------------------------------------------------
// Daily Workouts (generated recommendations)
// ---------------------------------------------------------------------------
export const DailyWorkout = pgTable("daily_workout", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  weeklyPlanId: t.uuid(),
  userId: t.text().notNull(),
  date: t.date().notNull(),
  sportType: t.varchar({ length: 50 }).notNull(),
  workoutType: t.varchar({ length: 50 }).notNull(),
  title: t.varchar({ length: 200 }).notNull(),
  description: t.text(),
  targetDurationMin: t.integer(),
  targetDurationMax: t.integer(),
  targetHrZoneLow: t.integer(),
  targetHrZoneHigh: t.integer(),
  targetStrainLow: t.doublePrecision(),
  targetStrainHigh: t.doublePrecision(),
  structure: t.jsonb(),
  readinessZoneUsed: t.varchar({ length: 20 }),
  status: t.varchar({ length: 20 }).default("planned"),
  explanation: t.text(),
  createdAt: t.timestamp().defaultNow().notNull(),
}));

// ---------------------------------------------------------------------------
// Chat Messages
// ---------------------------------------------------------------------------
export const ChatMessage = pgTable("chat_message", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  userId: t.text().notNull(),
  role: t.varchar({ length: 20 }).notNull(),
  content: t.text().notNull(),
  context: t.jsonb(),
  createdAt: t.timestamp().defaultNow().notNull(),
}));

// ---------------------------------------------------------------------------
// VO2max Estimates (historical tracking)
// ---------------------------------------------------------------------------
export const VO2maxEstimate = pgTable("vo2max_estimate", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  userId: t.text().notNull(),
  date: t.date().notNull(),
  sport: t.varchar({ length: 50 }).notNull(),
  value: t.doublePrecision().notNull(),
  source: t.varchar({ length: 50 }).notNull(),
  activityId: t.uuid(),
  createdAt: t.timestamp().defaultNow().notNull(),
}));

export const CreateVO2maxEstimateSchema = createInsertSchema(
  VO2maxEstimate,
).omit({ id: true, createdAt: true });

// ---------------------------------------------------------------------------
// Training Status (daily training load analysis)
// ---------------------------------------------------------------------------
export const TrainingStatus = pgTable(
  "training_status",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t.text().notNull(),
    date: t.date().notNull(),
    status: t.varchar({ length: 30 }).notNull(),
    vo2maxTrend: t.doublePrecision(),
    acuteLoad: t.doublePrecision(),
    chronicLoad: t.doublePrecision(),
    trainingStressBalance: t.doublePrecision(),
    loadRatio: t.doublePrecision(),
    loadFocus: t.varchar({ length: 30 }),
    explanation: t.text(),
    createdAt: t.timestamp().defaultNow().notNull(),
  }),
  (table) => [
    {
      name: "training_status_user_date_unique",
      columns: [table.userId, table.date],
      unique: true,
    },
  ],
);

export const CreateTrainingStatusSchema = createInsertSchema(
  TrainingStatus,
).omit({ id: true, createdAt: true });

// ---------------------------------------------------------------------------
// Journal Entries (subjective daily logging)
// ---------------------------------------------------------------------------
export const JournalEntry = pgTable(
  "journal_entry",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t.text().notNull(),
    date: t.date().notNull(),
    tags: t
      .jsonb()
      .$type<Record<string, number | boolean | string>>()
      .default({}),
    notes: t.text(),
    // Extended check-in fields
    sorenessScore: t.integer(),
    sorenessRegions: t.jsonb().$type<string[]>(),
    moodScore: t.integer(),
    caffeineAmountMg: t.integer(),
    caffeineTime: t.varchar({ length: 5 }),
    alcoholDrinks: t.integer(),
    napMinutes: t.integer(),
    medications: t.jsonb().$type<string[]>(),
    menstrualPhase: t.varchar({ length: 20 }),
    createdAt: t.timestamp().defaultNow().notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true }).defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    {
      name: "journal_entry_user_date_unique",
      columns: [table.userId, table.date],
      unique: true,
    },
  ],
);

export const CreateJournalEntrySchema = createInsertSchema(JournalEntry, {
  sorenessScore: z.number().int().min(1).max(10).optional(),
  sorenessRegions: z.array(z.string()).optional(),
  moodScore: z.number().int().min(1).max(10).optional(),
  caffeineAmountMg: z.number().int().min(0).optional(),
  caffeineTime: z.string().optional(),
  alcoholDrinks: z.number().int().min(0).optional(),
  napMinutes: z.number().int().min(0).optional(),
  medications: z.array(z.string()).optional(),
  menstrualPhase: z
    .enum(["follicular", "ovulation", "luteal", "menstrual"])
    .optional()
    .nullable(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ---------------------------------------------------------------------------
// Session Reports (post-session RPE + tagging)
// ---------------------------------------------------------------------------
export const SessionReport = pgTable(
  "session_report",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t.text().notNull(),
    activityId: t
      .uuid()
      .references(() => Activity.id, { onDelete: "cascade" }),
    garminActivityId: t.varchar({ length: 100 }),
    rpe: t.integer().notNull(),
    sessionType: t.varchar({ length: 30 }),
    drillNotes: t.text(),
    internalLoad: t.doublePrecision(),
    createdAt: t.timestamp().defaultNow().notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true }).defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    {
      name: "session_report_activity_user_unique",
      columns: [table.activityId, table.userId],
      unique: true,
    },
  ],
);

export const CreateSessionReportSchema = createInsertSchema(
  SessionReport,
).omit({ id: true, createdAt: true, updatedAt: true });

export const SessionReportRelations = relations(SessionReport, ({ one }) => ({
  activity: one(Activity, {
    fields: [SessionReport.activityId],
    references: [Activity.id],
  }),
}));

// ---------------------------------------------------------------------------
// Interventions (recovery actions + outcome tracking)
// ---------------------------------------------------------------------------
export const Intervention = pgTable(
  "intervention",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t.text().notNull(),
    date: t.date().notNull(),
    type: t.varchar({ length: 50 }).notNull(),
    description: t.text(),
    outcomeNotes: t.text(),
    effectivenessRating: t.integer(),
    linkedMetricDate: t.date(),
    createdAt: t.timestamp().defaultNow().notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true }).defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    {
      name: "intervention_user_date_type_unique",
      columns: [table.userId, table.date, table.type],
      unique: true,
    },
  ],
);

export const CreateInterventionSchema = createInsertSchema(Intervention).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ---------------------------------------------------------------------------
// Advanced Metrics (computed CTL/ATL/ACWR/CP)
// ---------------------------------------------------------------------------
export const AdvancedMetric = pgTable(
  "advanced_metric",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t.text().notNull(),
    date: t.date().notNull(),
    ctl: t.doublePrecision(),
    atl: t.doublePrecision(),
    tsb: t.doublePrecision(),
    acwr: t.doublePrecision(),
    rampRate: t.doublePrecision(),
    cp: t.doublePrecision(),
    wPrime: t.doublePrecision(),
    frc: t.doublePrecision(),
    mftp: t.doublePrecision(),
    tte: t.doublePrecision(),
    effectiveVo2max: t.doublePrecision(),
    computedAt: t.timestamp().defaultNow().notNull(),
  }),
  (table) => [
    {
      name: "advanced_metric_user_date_unique",
      columns: [table.userId, table.date],
      unique: true,
    },
  ],
);

export const CreateAdvancedMetricSchema = createInsertSchema(
  AdvancedMetric,
).omit({ id: true, computedAt: true });

// ---------------------------------------------------------------------------
// Correlation Results (computed metric correlations)
// ---------------------------------------------------------------------------
export const CorrelationResult = pgTable("correlation_result", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  userId: t.text().notNull(),
  metricA: t.varchar({ length: 100 }).notNull(),
  metricB: t.varchar({ length: 100 }).notNull(),
  period: t.varchar({ length: 20 }).notNull(),
  rValue: t.doublePrecision().notNull(),
  pValue: t.doublePrecision(),
  sampleSize: t.integer().notNull(),
  direction: t.varchar({ length: 20 }).notNull(),
  insight: t.text(),
  computedAt: t.timestamp().defaultNow().notNull(),
}));

export const CreateCorrelationResultSchema = createInsertSchema(
  CorrelationResult,
).omit({ id: true, computedAt: true });

// ---------------------------------------------------------------------------
// Race Predictions
// ---------------------------------------------------------------------------
export const RacePrediction = pgTable("race_prediction", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  userId: t.text().notNull(),
  date: t.date().notNull(),
  distance: t.varchar({ length: 30 }).notNull(),
  predictedSeconds: t.integer().notNull(),
  vo2maxUsed: t.doublePrecision().notNull(),
  method: t.varchar({ length: 30 }).notNull(),
  createdAt: t.timestamp().defaultNow().notNull(),
}));

export const CreateRacePredictionSchema = createInsertSchema(
  RacePrediction,
).omit({ id: true, createdAt: true });

// ---------------------------------------------------------------------------
// Workout Time Series (per-workout chart data)
// ---------------------------------------------------------------------------
export const WorkoutTimeSeries = pgTable("workout_time_series", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  activityId: t
    .uuid()
    .notNull()
    .references(() => Activity.id, { onDelete: "cascade" }),
  timestampOffset: t.integer().notNull(),
  heartRate: t.integer(),
  pace: t.doublePrecision(),
  power: t.doublePrecision(),
  cadence: t.doublePrecision(),
  elevation: t.doublePrecision(),
  distance: t.doublePrecision(),
}));

export const CreateWorkoutTimeSeriesSchema = createInsertSchema(
  WorkoutTimeSeries,
).omit({ id: true });

// ---------------------------------------------------------------------------
// Athlete Baselines (computed personal norms)
// ---------------------------------------------------------------------------
export const AthleteBaseline = pgTable(
  "athlete_baseline",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t.text().notNull(),
    metricName: t.varchar({ length: 50 }).notNull(), // "hrv"|"restingHr"|"sleep"|"strain"
    baselineValue: t.doublePrecision().notNull(),
    baselineSD: t.doublePrecision(),
    windowDays: t.integer().default(30),
    seasonPhase: t.varchar({ length: 20 }), // "base"|"build"|"peak"|"taper"|"off"
    zScoreLatest: t.doublePrecision(),        // z-score of today's value vs baseline
    daysOfData: t.integer(),
    computedAt: t.timestamp().defaultNow().notNull(),
  }),
  (table) => [
    { name: "athlete_baseline_user_metric_unique", columns: [table.userId, table.metricName], unique: true },
  ],
);
export const CreateAthleteBaselineSchema = createInsertSchema(AthleteBaseline).omit({ id: true, computedAt: true });

// ---------------------------------------------------------------------------
// Data Quality Log (ingestion validation issues)
// ---------------------------------------------------------------------------
export const DataQualityLog = pgTable("data_quality_log", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  userId: t.text().notNull(),
  date: t.date().notNull(),
  checkName: t.varchar({ length: 50 }).notNull(),
  // "missing_hrv"|"duplicate_date"|"outlier_hr"|"stale_data"|"impossible_value"|"timezone_drift"
  severity: t.varchar({ length: 10 }).notNull(), // "info"|"warn"|"error"
  message: t.text().notNull(),
  rawValue: t.doublePrecision(),
  expectedRange: t.jsonb().$type<{ min: number; max: number }>(),
  resolvedAt: t.timestamp(),
  createdAt: t.timestamp().defaultNow().notNull(),
}));
export const CreateDataQualityLogSchema = createInsertSchema(DataQualityLog).omit({ id: true, createdAt: true });

// ---------------------------------------------------------------------------
// Audit Log (data lineage / provenance)
// ---------------------------------------------------------------------------
export const AuditLog = pgTable("audit_log", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  userId: t.text().notNull(),
  entityType: t.varchar({ length: 50 }).notNull(), // "daily_metric"|"activity"
  entityId: t.uuid().notNull(),
  action: t.varchar({ length: 20 }).notNull(), // "create"|"update"|"delete"
  changedFields: t.jsonb().$type<string[]>(),
  rawDataHash: t.varchar({ length: 64 }), // SHA-256 of raw Garmin JSON
  garminApiVersion: t.varchar({ length: 20 }),
  deviceModel: t.varchar({ length: 50 }),
  appVersion: t.varchar({ length: 20 }),
  syncedAt: t.timestamp().defaultNow().notNull(),
}));
export const CreateAuditLogSchema = createInsertSchema(AuditLog).omit({ id: true, syncedAt: true });

// ---------------------------------------------------------------------------
// Reference Measurements (lab/device vs Garmin comparison)
// ---------------------------------------------------------------------------
export const ReferenceMeasurement = pgTable("reference_measurement", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  userId: t.text().notNull(),
  date: t.date().notNull(),
  measurementType: t.varchar({ length: 50 }).notNull(),
  // "lab_vo2max"|"lactate_threshold"|"body_composition"|"chest_strap_hr"|"ecg_hrv"|"sleep_lab"
  value: t.doublePrecision().notNull(),
  unit: t.varchar({ length: 30 }).notNull(),
  source: t.varchar({ length: 50 }).notNull(), // "lab"|"manual"|"device_import"
  garminComparableValue: t.doublePrecision(),  // matching Garmin estimate at same date
  deviationPercent: t.doublePrecision(),       // (garmin - reference) / reference * 100
  notes: t.text(),
  createdAt: t.timestamp().defaultNow().notNull(),
}));
export const CreateReferenceMeasurementSchema = createInsertSchema(ReferenceMeasurement).omit({ id: true, userId: true, createdAt: true });

// ---------------------------------------------------------------------------
// AI Insights (proactive rules-based and LLM-generated recommendations)
// ---------------------------------------------------------------------------
export const AiInsight = pgTable(
  "ai_insight",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t.text().notNull(),
    date: t.date().notNull(),
    insightType: t.varchar({ length: 50 }).notNull(),
    // "injury_risk"|"recovery_needed"|"positive_trend"|"load_spike"|
    // "sleep_debt"|"overreaching"|"peaking"|"correlation_found"
    severity: t.varchar({ length: 10 }).notNull(), // "info"|"warn"|"critical"
    title: t.varchar({ length: 200 }).notNull(),
    body: t.text().notNull(),
    metrics: t.jsonb().$type<Record<string, number | string>>(), // cited metrics
    confidence: t.doublePrecision(), // 0-1 confidence
    actionSuggestion: t.text(),
    isRead: t.boolean().default(false),
    generatedBy: t.varchar({ length: 30 }).default("rules"), // "rules"|"llm"
    createdAt: t.timestamp().defaultNow().notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true }).defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    {
      name: "ai_insight_user_date_type_unique",
      columns: [table.userId, table.date, table.insightType],
      unique: true,
    },
  ],
);

export const CreateAiInsightSchema = createInsertSchema(AiInsight).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ---------------------------------------------------------------------------
// Legacy Post table (keep for reference, can remove later)
// ---------------------------------------------------------------------------
export const Post = pgTable("post", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  title: t.varchar({ length: 256 }).notNull(),
  content: t.text().notNull(),
  createdAt: t.timestamp().defaultNow().notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true }).defaultNow()
    .$onUpdateFn(() => new Date()),
}));

export const CreatePostSchema = createInsertSchema(Post, {
  title: z.string().max(256),
  content: z.string().max(256),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
