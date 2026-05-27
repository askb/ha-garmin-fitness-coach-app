// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/** Idempotent e2e seed for the AI-native coach loop Playwright suite. */
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import {
  account,
  Activity,
  AdvancedMetric,
  DailyMetric,
  DailyWorkout,
  Profile,
  ReadinessScore,
  RecommendationAudit,
  session,
  user,
} from "./schema";

const USER_ID = "seed-user-001";
const DATABASE_URL = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("POSTGRES_URL or DATABASE_URL must be set");

const pool = new pg.Pool({
  connectionString: DATABASE_URL.replace(":6543", ":5432"),
});
const db = drizzle(pool, { casing: "snake_case" });

function isoDay(offsetDays = 0): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function dateAt(day: string, hour: number): Date {
  return new Date(`${day}T${String(hour).padStart(2, "0")}:00:00.000Z`);
}

async function resetSeedData(): Promise<void> {
  await db.delete(session).where(eq(session.userId, USER_ID));
  await db.delete(account).where(eq(account.userId, USER_ID));
  await db
    .delete(RecommendationAudit)
    .where(eq(RecommendationAudit.userId, USER_ID));
  await db.delete(Activity).where(eq(Activity.userId, USER_ID));
  await db.delete(AdvancedMetric).where(eq(AdvancedMetric.userId, USER_ID));
  await db.delete(DailyWorkout).where(eq(DailyWorkout.userId, USER_ID));
  await db.delete(ReadinessScore).where(eq(ReadinessScore.userId, USER_ID));
  await db.delete(DailyMetric).where(eq(DailyMetric.userId, USER_ID));
  await db.delete(Profile).where(eq(Profile.userId, USER_ID));
  await db.delete(user).where(eq(user.id, USER_ID));
}

async function seed(): Promise<void> {
  const now = new Date();
  const today = isoDay();
  await resetSeedData();

  await db.insert(user).values({
    id: USER_ID,
    name: "E2E Coach User",
    email: "e2e@local",
    emailVerified: true,
    image: null,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(Profile).values({
    userId: USER_ID,
    age: 36,
    sex: "male",
    massKg: 72,
    heightCm: 178,
    timezone: "UTC",
    experienceLevel: "intermediate",
    primarySports: ["running"],
    goals: [
      {
        sport: "running",
        goalType: "consistency",
        target: "steady aerobic base",
      },
    ],
    weeklyDays: ["mon", "wed", "fri", "sun"],
    minutesPerDay: 45,
    maxHr: 190,
    restingHrBaseline: 52,
    hrvBaseline: 64,
    sleepBaseline: 450,
    vo2maxRunning: 50,
  });
  await db.insert(DailyMetric).values({
    userId: USER_ID,
    date: today,
    sleepScore: 78,
    totalSleepMinutes: 440,
    deepSleepMinutes: 85,
    remSleepMinutes: 110,
    lightSleepMinutes: 225,
    awakeMinutes: 20,
    hrv: 62,
    restingHr: 53,
    stressScore: 22,
    bodyBatteryStart: 82,
    bodyBatteryEnd: 36,
    steps: 8200,
    garminTrainingReadiness: 66,
    garminTrainingReadinessLevel: "medium",
    garminTrainingLoad: 38,
    intensityMinutes: 20,
    calories: 2300,
    maxHr: 145,
  });
  await db.insert(ReadinessScore).values({
    userId: USER_ID,
    date: today,
    score: 64,
    zone: "balanced",
    sleepQuantityComponent: 70,
    sleepQualityComponent: 68,
    hrvComponent: 62,
    restingHrComponent: 65,
    trainingLoadComponent: 58,
    stressComponent: 66,
    explanation: "Medium readiness: aerobic work is appropriate.",
    factors: { source: "e2e", level: "medium" },
  });
  await db.insert(AdvancedMetric).values({
    userId: USER_ID,
    date: today,
    ctl: 38,
    atl: 35,
    tsb: 3,
    acwr: 0.92,
    rampRate: 1.4,
  });
  const [workout] = await db
    .insert(DailyWorkout)
    .values({
      userId: USER_ID,
      date: today,
      sportType: "running",
      workoutType: "z2_run",
      title: "Z2 30min Run",
      description: "Easy zone 2 aerobic run for 30 minutes.",
      targetDurationMin: 30,
      targetDurationMax: 30,
      targetHrZoneLow: 2,
      targetHrZoneHigh: 2,
      targetStrainLow: 4,
      targetStrainHigh: 7,
      status: "planned",
      explanation: "Seeded e2e workout for the coach loop.",
    })
    .returning({ id: DailyWorkout.id });
  await db.insert(RecommendationAudit).values({
    userId: USER_ID,
    date: today,
    kind: "recommendation",
    action: "workout",
    intensity: "easy",
    workoutType: "z2_run",
    durationMin: 30,
    confidence: 0.72,
    hardBlocks: [],
    ruleTrace: [
      {
        ruleId: "plan-honored-when-safe",
        fired: true,
        severity: "info",
        message: "Plan day — no signals against your scheduled workout.",
        inputs: { plannedWorkoutType: "z2_run" },
      },
      {
        ruleId: "readiness-balanced-allows-training",
        fired: true,
        severity: "info",
        message:
          "Readiness is balanced, so a steady aerobic session is appropriate.",
        inputs: { readiness: "balanced" },
      },
    ],
    relatedWorkoutId: workout?.id,
    payload: { source: "e2e-seed" },
  });

  for (let offset = -7; offset <= -1; offset += 1) {
    const date = isoDay(offset);
    const completed = offset % 3 !== 0;
    let activityId: string | null = null;
    if (completed) {
      const [activity] = await db
        .insert(Activity)
        .values({
          userId: USER_ID,
          garminActivityId: `e2e-${date}`,
          sportType: "running",
          subType: "easy",
          startedAt: dateAt(date, 7),
          endedAt: dateAt(date, 8),
          durationMinutes: 31,
          distanceMeters: 5000,
          avgHr: 138,
          maxHr: 155,
          calories: 360,
          trimpScore: 35,
          rawGarminData: { source: "e2e" },
        })
        .returning({ id: Activity.id });
      activityId = activity?.id ?? null;
    }
    await db.insert(RecommendationAudit).values({
      userId: USER_ID,
      date,
      kind: completed ? "workout_complete" : "workout_missed",
      confidence: 0.82,
      durationMin: 30,
      relatedWorkoutId: null,
      relatedActivityIds: activityId ? [activityId] : [],
      payload: {
        reconcile: {
          status: completed ? "completed" : "missed",
          confidence: 0.82,
        },
        plannedId: null,
        actualIds: activityId ? [activityId] : [],
        plannedDurationMin: 30,
        actualDurationMin: completed ? 31 : 0,
      },
    });
  }
  await db.execute(sql`select 1`);
  await pool.end();
  console.log(`Seeded e2e coach-loop data for ${USER_ID} on ${today}`);
}

seed().catch(async (error) => {
  console.error("E2E seed failed", error);
  await pool.end();
  process.exit(1);
});
