import { relations } from "drizzle-orm";
import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
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
  experienceLevel: t.varchar({ length: 20 }).default("intermediate"),
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
  healthConditions: t.jsonb().$type<string[]>().default([]),
  currentInjuries: t
    .jsonb()
    .$type<
      {
        bodyPart: string;
        severity: "mild" | "moderate" | "severe";
        since?: string;
        notes?: string;
      }[]
    >()
    .default([]),
  medications: t.text(),
  allergies: t.text(),
  createdAt: t.timestamp().defaultNow().notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .defaultNow()
    .$onUpdateFn(() => new Date()),
}));

export const CreateProfileSchema = createInsertSchema(Profile, {
  sex: z.enum(["male", "female", "other"]).optional(),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]).optional(),
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
    garminTrainingReadinessLevel: t.varchar({ length: 30 }),
    garminTrainingLoad: t.doublePrecision(),
    garminTrainingStatus: t.varchar({ length: 30 }),
    garminLoadFocus: t.jsonb(),
    garminRecoveryHours: t.doublePrecision(),
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
    uniqueIndex("daily_metric_user_date_unique").on(table.userId, table.date),
  ],
);

export const CreateDailyMetricSchema = createInsertSchema(DailyMetric).omit({
  id: true,
  syncedAt: true,
});

// ---------------------------------------------------------------------------
// Activities (Garmin workout data)
// ---------------------------------------------------------------------------
export const Activity = pgTable(
  "activity",
  (t) => ({
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
    laps: t.jsonb().$type<
      {
        index: number;
        distanceMeters: number;
        durationSeconds: number;
        avgHr?: number;
        avgPace?: number;
        avgPower?: number;
      }[]
    >(),
    hrZoneMinutes: t.jsonb().$type<{
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
  }),
  (table) => [
    index("activity_user_started_at_idx").on(table.userId, table.startedAt),
  ],
);

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
    uniqueIndex("readiness_score_user_date_unique").on(
      table.userId,
      table.date,
    ),
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

// DailyWorkout.status legal value space. Declared here so the `status`
// column below can narrow its TypeScript type to the tuple via $type().
// Kept in sync with the v0.17.0 reconciliation engine (see
// packages/engine/src/planned-vs-actual). "planned" is the initial state
// written when the workout is generated; reconciliation later updates it
// to one of the post-state values.
export const DAILY_WORKOUT_STATUSES = [
  "planned",
  "completed",
  "partial",
  "missed",
  "extra",
  "skipped",
] as const;

export type DailyWorkoutStatus = (typeof DAILY_WORKOUT_STATUSES)[number];

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
  status: t
    .varchar({ length: 20 })
    .$type<DailyWorkoutStatus>()
    .default("planned"),
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
    uniqueIndex("training_status_user_date_unique").on(
      table.userId,
      table.date,
    ),
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
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    uniqueIndex("journal_entry_user_date_unique").on(table.userId, table.date),
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
    activityId: t.uuid().references(() => Activity.id, { onDelete: "cascade" }),
    garminActivityId: t.varchar({ length: 100 }),
    rpe: t.integer().notNull(),
    sessionType: t.varchar({ length: 30 }),
    drillNotes: t.text(),
    internalLoad: t.doublePrecision(),
    createdAt: t.timestamp().defaultNow().notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    uniqueIndex("session_report_activity_user_unique").on(
      table.activityId,
      table.userId,
    ),
  ],
);

export const CreateSessionReportSchema = createInsertSchema(SessionReport).omit(
  { id: true, createdAt: true, updatedAt: true },
);

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
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    uniqueIndex("intervention_user_date_type_unique").on(
      table.userId,
      table.date,
      table.type,
    ),
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
    uniqueIndex("advanced_metric_user_date_unique").on(
      table.userId,
      table.date,
    ),
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
    zScoreLatest: t.doublePrecision(), // z-score of today's value vs baseline
    daysOfData: t.integer(),
    computedAt: t.timestamp().defaultNow().notNull(),
  }),
  (table) => [
    uniqueIndex("athlete_baseline_user_metric_unique").on(
      table.userId,
      table.metricName,
    ),
  ],
);
export const CreateAthleteBaselineSchema = createInsertSchema(
  AthleteBaseline,
).omit({ id: true, computedAt: true });

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
export const CreateDataQualityLogSchema = createInsertSchema(
  DataQualityLog,
).omit({ id: true, createdAt: true });

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
export const CreateAuditLogSchema = createInsertSchema(AuditLog).omit({
  id: true,
  syncedAt: true,
});

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
  garminComparableValue: t.doublePrecision(), // matching Garmin estimate at same date
  deviationPercent: t.doublePrecision(), // (garmin - reference) / reference * 100
  notes: t.text(),
  createdAt: t.timestamp().defaultNow().notNull(),
}));
export const CreateReferenceMeasurementSchema = createInsertSchema(
  ReferenceMeasurement,
).omit({ id: true, userId: true, createdAt: true });

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
    // "sleep_debt"|"overreaching"|"peaking"|"correlation_found"|
    // "daily_summary"|"spo2_alert"|"rr_alert"
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
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    uniqueIndex("ai_insight_user_date_type_unique").on(
      table.userId,
      table.date,
      table.insightType,
    ),
  ],
);

export const CreateAiInsightSchema = createInsertSchema(AiInsight).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ---------------------------------------------------------------------------
// Recommendation Audit (v0.17.0 AI-native coaching decision log)
// ---------------------------------------------------------------------------
//
// Inescapable audit trail for every state-changing event in the coach loop:
//   - "recommendation": engine produced a daily recommendation
//   - "intervention_accept": user accepted today's recommendation
//   - "intervention_skip": user skipped today's recommendation
//   - "intervention_defer": user deferred today's recommendation
//   - "reconciliation": planned-vs-actual reconciliation result
//   - "workout_complete": legacy reconciliation matched a workout
//   - "workout_missed": legacy reconciliation found no matching activity
//   - "override": user manually overrode the recommendation
//
// `ruleTrace` is the full rule-by-rule output from
// `@acme/engine.recommendDay()`. `llmExplanation` is the optional
// natural-language framing produced by the AI backend; it is NEVER
// allowed to mutate the structured action/intensity/hardBlocks fields.
//
export const RECOMMENDATION_AUDIT_KINDS = [
  "recommendation",
  "intervention_accept",
  "intervention_skip",
  "intervention_defer",
  "reconciliation",
  "workout_complete",
  "workout_missed",
  "override",
] as const;

export type RecommendationAuditKind =
  (typeof RECOMMENDATION_AUDIT_KINDS)[number];

export const RecommendationAudit = pgTable(
  "recommendation_audit",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t.text().notNull(),
    date: t.date().notNull(),
    kind: t.varchar({ length: 32 }).notNull().$type<RecommendationAuditKind>(),
    action: t.varchar({ length: 32 }), // recommendation.action snapshot
    intensity: t.varchar({ length: 16 }),
    workoutType: t.varchar({ length: 64 }),
    durationMin: t.integer(),
    confidence: t.doublePrecision(),
    hardBlocks: t.jsonb().$type<string[]>(),
    ruleTrace: t.jsonb(), // engine RuleTrace[]
    llmExplanation: t.text(),
    relatedActivityIds: t.jsonb().$type<string[]>(),
    relatedWorkoutId: t.uuid(), // DailyWorkout.id, optional
    payload: t.jsonb(), // arbitrary kind-specific extras
    createdAt: t.timestamp().defaultNow().notNull(),
  }),
  (table) => [
    index("recommendation_audit_user_date_idx").on(table.userId, table.date),
    index("recommendation_audit_kind_idx").on(table.kind),
  ],
);

export const CreateRecommendationAuditSchema = createInsertSchema(
  RecommendationAudit,
)
  .omit({
    id: true,
    createdAt: true,
  })
  // The drizzle-zod inference treats `kind` as a generic string because
  // .$type<RecommendationAuditKind>() is a TypeScript-only constraint with
  // no runtime effect. Override with a real Zod enum so invalid kinds are
  // rejected at the API boundary (the inescapable audit helper validates
  // every insert against this schema before touching Postgres).
  .extend({
    kind: z.enum(RECOMMENDATION_AUDIT_KINDS),
  });

// DailyWorkout.status legal value space — defined alongside the
// DailyWorkout table declaration above. Re-exported here for symmetry
// with the v0.17.0 audit constants (callers can import both from one
// section). DO NOT re-declare the tuple; the canonical definition lives
// above the DailyWorkout pgTable() call.

// ---------------------------------------------------------------------------
// History Embedding (RAG / coach memory over full history) — spec 007
// ---------------------------------------------------------------------------
//
// Compact periodic summaries of the athlete's history, embedded once and
// retrieved semantically so the coach can answer multi-year aggregate /
// narrative questions without dumping raw rows into the prompt.
//
// MVP stores the embedding as a plain `jsonb` number[] (NOT pgvector): this is
// single-user / local-first with only a few hundred vectors, so brute-force
// cosine similarity in TS is fast enough and avoids a Postgres extension that
// is not reliably packaged for the addon's Alpine image. pgvector can replace
// this column later if scale ever demands it.
//
export const HISTORY_PERIOD_TYPES = [
  "week",
  "month",
  "year",
  "activity",
] as const;

export type HistoryPeriodType = (typeof HISTORY_PERIOD_TYPES)[number];

export const HistoryEmbedding = pgTable(
  "history_embedding",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t.text().notNull(),
    // "week" | "month" | "year" | "activity"
    periodType: t.varchar({ length: 16 }).notNull().$type<HistoryPeriodType>(),
    // Stable key within the period type, e.g. "2024-W12", "2024-03", "2024",
    // or an activity id. Used for idempotent upserts.
    periodKey: t.varchar({ length: 64 }).notNull(),
    summaryText: t.text().notNull(),
    embedding: t.jsonb().$type<number[]>(),
    // Deterministic numeric facts behind the summary (counts, totals, deltas)
    // so the LLM quality gate can ground claims without re-querying.
    metrics: t.jsonb().$type<Record<string, number | string | null>>(),
    model: t.varchar({ length: 64 }),
    createdAt: t.timestamp().defaultNow().notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    uniqueIndex("history_embedding_user_period_unique").on(
      table.userId,
      table.periodType,
      table.periodKey,
    ),
    index("history_embedding_user_type_idx").on(table.userId, table.periodType),
  ],
);

export const CreateHistoryEmbeddingSchema = createInsertSchema(HistoryEmbedding)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({ periodType: z.enum(HISTORY_PERIOD_TYPES) });

// ---------------------------------------------------------------------------
// Outcome Attribution (close the learning loop) — ai-loop-close-learning
// ---------------------------------------------------------------------------
//
// Joins a coach decision (from RecommendationAudit) to the athlete's
// *subsequent* N-day physiological outcome (readiness / HRV / TSB), so we can
// score per-rule effectiveness per athlete. Phase 1 only SURFACES this (a
// "what worked for you" view + a confidence input); per-athlete threshold
// tuning is a later, guard-railed phase.
//
export const OUTCOME_DECISION_KINDS = [
  "recommendation",
  "intervention_accept",
  "intervention_skip",
  "intervention_defer",
  "override",
] as const;

export type OutcomeDecisionKind = (typeof OUTCOME_DECISION_KINDS)[number];

export const OutcomeAttribution = pgTable(
  "outcome_attribution",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t.text().notNull(),
    // The engine ruleId that fired (e.g. "low-readiness-blocks-hard"), or
    // "__decision__" for whole-recommendation attribution.
    ruleId: t.varchar({ length: 64 }).notNull(),
    decisionKind: t
      .varchar({ length: 32 })
      .notNull()
      .$type<OutcomeDecisionKind>(),
    decisionDate: t.date().notNull(),
    horizonDays: t.integer().notNull(),
    // Baseline (decision day) and outcome (decision day + horizon) snapshots.
    baselineReadiness: t.doublePrecision(),
    baselineHrv: t.doublePrecision(),
    baselineTsb: t.doublePrecision(),
    outcomeReadiness: t.doublePrecision(),
    outcomeHrv: t.doublePrecision(),
    outcomeTsb: t.doublePrecision(),
    deltaReadiness: t.doublePrecision(),
    deltaHrv: t.doublePrecision(),
    deltaTsb: t.doublePrecision(),
    createdAt: t.timestamp().defaultNow().notNull(),
  }),
  (table) => [
    uniqueIndex("outcome_attribution_unique").on(
      table.userId,
      table.ruleId,
      table.decisionDate,
      table.horizonDays,
    ),
    index("outcome_attribution_user_rule_idx").on(table.userId, table.ruleId),
  ],
);

export const CreateOutcomeAttributionSchema = createInsertSchema(
  OutcomeAttribution,
)
  .omit({ id: true, createdAt: true })
  .extend({ decisionKind: z.enum(OUTCOME_DECISION_KINDS) });

// ---------------------------------------------------------------------------
// Garmin OAuth tokens (Path B — official API). Per-user, ENCRYPTED AT REST.
// The token columns hold AES-256-GCM ciphertext (encrypted by the Next.js app's
// oauth token-crypto module before insert); never store plaintext tokens here.
// ---------------------------------------------------------------------------
export const GarminOAuthToken = pgTable(
  "garmin_oauth_token",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t.text().notNull(),
    // AES-256-GCM ciphertext (base64), not plaintext tokens.
    accessTokenEnc: t.text().notNull(),
    refreshTokenEnc: t.text(),
    expiresAt: t.timestamp({ mode: "date", withTimezone: true }),
    scope: t.text(),
    createdAt: t.timestamp().defaultNow().notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    // One Garmin connection per user.
    uniqueIndex("garmin_oauth_token_user_unique").on(table.userId),
  ],
);

// ---------------------------------------------------------------------------
// Legacy Post table (keep for reference, can remove later)
// ---------------------------------------------------------------------------
export const Post = pgTable("post", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  title: t.varchar({ length: 256 }).notNull(),
  content: t.text().notNull(),
  createdAt: t.timestamp().defaultNow().notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .defaultNow()
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
