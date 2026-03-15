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

  console.log("🎉 Seeding complete!");
  await pool.end();
  process.exit(0);
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
