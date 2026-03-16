/**
 * Seed script: creates 1 mock user + 30 days of realistic fake Garmin data.
 *
 * Usage: npx tsx packages/db/src/seed.ts
 */
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  Profile,
  DailyMetric,
  Activity,
  VO2maxEstimate,
  TrainingStatus,
  JournalEntry,
} from "./schema";

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL or POSTGRES_URL not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool, { casing: "snake_case" });

// Pseudo-random with seed for reproducibility
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const rand = seededRandom(42);
const randBetween = (min: number, max: number) =>
  Math.round(min + rand() * (max - min));
const randFloat = (min: number, max: number) =>
  Math.round((min + rand() * (max - min)) * 100) / 100;

async function seed() {
  console.log("🌱 Seeding database...");

  // We'll use a placeholder userId — in a real app this would be created by auth
  const userId = "seed-user-001";

  // Create profile
  await db.insert(Profile).values({
    userId,
    age: 32,
    sex: "male",
    massKg: 78,
    heightCm: 180,
    timezone: "America/New_York",
    experienceLevel: "intermediate",
    primarySports: ["running", "strength"],
    goals: [
      { sport: "running", goalType: "performance", target: "sub-20 5K" },
      { sport: "strength", goalType: "maintain" },
    ],
    weeklyDays: ["mon", "tue", "wed", "thu", "sat"],
    minutesPerDay: 50,
    maxHr: 188,
    restingHrBaseline: 58,
    hrvBaseline: 48,
    sleepBaseline: 420,
  }).onConflictDoNothing();

  console.log("✅ Profile created");

  // Generate 30 days of daily metrics
  const today = new Date();
  const metrics = [];
  const activities = [];

  for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    const dateStr = date.toISOString().split("T")[0]!;

    // Simulate realistic variance
    const isGoodSleep = rand() > 0.3;
    const isRestDay = rand() > 0.7;
    const isHardDay = !isRestDay && rand() > 0.6;

    metrics.push({
      userId,
      date: dateStr,
      sleepScore: randBetween(isGoodSleep ? 65 : 35, isGoodSleep ? 95 : 60),
      totalSleepMinutes: randBetween(isGoodSleep ? 380 : 280, isGoodSleep ? 510 : 380),
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
      // New expanded fields
      respirationRate: randFloat(14, 20),
      spo2: randBetween(94, 99),
      skinTemp: randFloat(33.5, 37.0),
      intensityMinutes: randBetween(0, isRestDay ? 10 : 60),
      floorsClimbed: randBetween(2, 25),
      bodyBatteryHigh: randBetween(70, 100),
      bodyBatteryLow: randBetween(5, 40),
      sleepStartTime: `${randBetween(21, 23)}:${randBetween(0, 59).toString().padStart(2, "0")}`,
      sleepEndTime: `${randBetween(5, 7)}:${randBetween(0, 59).toString().padStart(2, "0")}`,
      sleepNeedMinutes: 480,
      sleepDebtMinutes: randBetween(-30, 90),
    });

    // Generate activities for non-rest days
    if (!isRestDay) {
      const isRunDay = rand() > 0.4;
      const activityDate = new Date(date);
      activityDate.setHours(7, 0, 0, 0);

      activities.push({
        userId,
        sportType: isRunDay ? "running" : "strength",
        subType: isRunDay
          ? (isHardDay ? "intervals" : "easy_run")
          : "full_body",
        startedAt: activityDate,
        endedAt: new Date(activityDate.getTime() + randBetween(25, 70) * 60000),
        durationMinutes: randBetween(25, 70),
        distanceMeters: isRunDay ? randFloat(3000, 12000) : null,
        avgHr: isHardDay ? randBetween(145, 170) : randBetween(115, 145),
        maxHr: isHardDay ? randBetween(170, 188) : randBetween(140, 165),
        avgPaceSecPerKm: isRunDay ? randBetween(270, 360) : null,
        calories: randBetween(200, 600),
        trimpScore: randFloat(30, isHardDay ? 200 : 100),
        strainScore: randFloat(isHardDay ? 12 : 4, isHardDay ? 18 : 10),
        vo2maxEstimate: isRunDay ? randFloat(45, 55) : null,
        // New running form fields
        avgGct: isRunDay ? randBetween(220, 280) : null,
        gctBalance: isRunDay ? randFloat(49.0, 51.5) : null,
        verticalOscillation: isRunDay ? randFloat(7.0, 11.0) : null,
        verticalRatio: isRunDay ? randFloat(7.5, 10.0) : null,
        strideLength: isRunDay ? randFloat(1.0, 1.4) : null,
        avgCadence: isRunDay ? randBetween(160, 190) : null,
        avgPower: isRunDay ? randBetween(200, 320) : null,
        elevationGain: isRunDay ? randBetween(20, 200) : null,
        elevationLoss: isRunDay ? randBetween(20, 200) : null,
        aerobicTe: isRunDay ? randFloat(2.0, 5.0) : randFloat(1.0, 3.0),
        anaerobicTe: isHardDay ? randFloat(1.0, 4.0) : randFloat(0.0, 1.5),
      });
    }
  }

  // Batch insert
  for (const metric of metrics) {
    await db.insert(DailyMetric).values(metric).onConflictDoNothing();
  }
  console.log(`✅ ${metrics.length} daily metrics created`);

  for (const activity of activities) {
    await db.insert(Activity).values(activity).onConflictDoNothing();
  }
  console.log(`✅ ${activities.length} activities created`);

  // Seed VO2max estimates (weekly, for running activities)
  const vo2maxEstimates = [];
  for (let weeksAgo = 3; weeksAgo >= 0; weeksAgo--) {
    const date = new Date(today);
    date.setDate(date.getDate() - weeksAgo * 7);
    const dateStr = date.toISOString().split("T")[0]!;
    vo2maxEstimates.push({
      userId,
      date: dateStr,
      sport: "running",
      value: randFloat(47, 53),
      source: "garmin",
    });
  }
  for (const est of vo2maxEstimates) {
    await db.insert(VO2maxEstimate).values(est).onConflictDoNothing();
  }
  console.log(`✅ ${vo2maxEstimates.length} VO2max estimates created`);

  // Seed training status (weekly snapshots)
  const statuses = ["productive", "maintaining", "productive", "productive"];
  for (let weeksAgo = 3; weeksAgo >= 0; weeksAgo--) {
    const date = new Date(today);
    date.setDate(date.getDate() - weeksAgo * 7);
    const dateStr = date.toISOString().split("T")[0]!;
    await db.insert(TrainingStatus).values({
      userId,
      date: dateStr,
      status: statuses[3 - weeksAgo]!,
      vo2maxTrend: randFloat(-0.5, 1.5),
      acuteLoad: randFloat(40, 80),
      chronicLoad: randFloat(50, 70),
      trainingStressBalance: randFloat(-15, 20),
      loadRatio: randFloat(0.7, 1.4),
      loadFocus: rand() > 0.5 ? "aerobic" : "mixed",
      explanation: "Training is progressing well with adequate recovery.",
    }).onConflictDoNothing();
  }
  console.log(`✅ 4 training status records created`);

  // Seed journal entries (sporadic, realistic)
  const journalTags: Record<string, string | number | boolean>[] = [
    { alcohol: true, caffeine: 2, hydration: "good" },
    { travel: true, stress: "high" },
    { caffeine: 3, hydration: "poor" },
    { alcohol: true, social: true },
    { meditation: true, hydration: "excellent" },
  ];
  for (let i = 0; i < 5; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i * 5 - randBetween(0, 2));
    const dateStr = date.toISOString().split("T")[0]!;
    await db.insert(JournalEntry).values({
      userId,
      date: dateStr,
      tags: journalTags[i]!,
      notes: i === 0 ? "Felt sluggish after last night" : null,
    }).onConflictDoNothing();
  }
  console.log(`✅ 5 journal entries created`);

  console.log("🎉 Seeding complete!");
  await pool.end();
  process.exit(0);
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
