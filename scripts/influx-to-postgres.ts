/**
 * ETL: InfluxDB JSON exports (Garmin data from HAOS) → PostgreSQL (GarminCoach app)
 *
 * Imports real Garmin data from two sources:
 *   - legacy_daily.json (HA addon InfluxDB:8086): 2,200+ days since Jan 2020
 *   - daily_stats.json + sleep/activity/vo2max (standalone InfluxDB:8087): detailed since Sep 2025
 *
 * Data was exported via SSH from HAOS InfluxDB instances.
 *
 * Usage: POSTGRES_URL="postgresql://dev:dev@localhost:5432/garmincoach" pnpm dlx tsx scripts/influx-to-postgres.ts
 */

import { readFileSync } from "fs";
import { join } from "path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and } from "drizzle-orm";
import {
  Profile,
  DailyMetric,
  Activity,
  VO2maxEstimate,
  RacePrediction,
} from "../packages/db/src/schema";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const DATA_DIR = join(import.meta.dirname ?? __dirname, "data");
const POSTGRES_URL =
  process.env.POSTGRES_URL ??
  process.env.DATABASE_URL ??
  "postgresql://dev:dev@localhost:5432/garmincoach";
const USER_ID = process.env.USER_ID ?? "seed-user-001";

const pool = new pg.Pool({ connectionString: POSTGRES_URL });
const db = drizzle(pool, { casing: "snake_case" });

// ---------------------------------------------------------------------------
// JSON file reader — parses InfluxDB query response format
// ---------------------------------------------------------------------------
function readInfluxJSON(filename: string): any[] {
  try {
    const raw = readFileSync(join(DATA_DIR, filename), "utf-8");
    const json = JSON.parse(raw);
    const series = json.results?.[0]?.series?.[0];
    if (!series) return [];

    const { columns, values } = series;
    return values.map((row: any[]) => {
      const obj: Record<string, any> = {};
      columns.forEach((col: string, i: number) => {
        obj[col] = row[i];
      });
      return obj;
    });
  } catch (e: any) {
    console.warn(`   ⚠ Could not read ${filename}: ${e.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Import LEGACY garmin_daily (2020-2025) → DailyMetric (basic fields only)
// ---------------------------------------------------------------------------
async function importLegacyDaily() {
  console.log("📜 Importing legacy daily data (2020-2025)...");
  const rows = readInfluxJSON("legacy_daily.json");
  console.log(`   Found ${rows.length} legacy days`);

  let imported = 0;
  for (const r of rows) {
    const date = r.time.split("T")[0];
    const intensityMin =
      (r.moderate_minutes ? Math.round(r.moderate_minutes) : 0) +
      (r.vigorous_minutes ? Math.round(r.vigorous_minutes) : 0);

    try {
      await db
        .insert(DailyMetric)
        .values({
          userId: USER_ID,
          date,
          steps: r.steps ? Math.round(r.steps) : null,
          calories: r.calories ? Math.round(r.calories) : null,
          floorsClimbed: r.floors ? Math.round(r.floors) : null,
          intensityMinutes: intensityMin > 0 ? intensityMin : null,
        })
        .onConflictDoNothing();
      imported++;
    } catch (e: any) {
      // Skip duplicates silently
    }
  }
  console.log(`   ✅ ${imported} legacy daily records imported (2020-2025)`);
}

// ---------------------------------------------------------------------------
// Import DailyStats → DailyMetric (detailed, Sep 2025+)
// ---------------------------------------------------------------------------
async function importDailyStats() {
  console.log("📊 Importing DailyStats (Sep 2025+)...");
  const rows = readInfluxJSON("daily_stats.json");
  console.log(`   Found ${rows.length} days`);

  let imported = 0;
  for (const r of rows) {
    const date = r.time.split("T")[0];
    // Compute avg stress score from durations (weighted average of stress levels)
    const totalStress = (r.highStressDuration ?? 0) + (r.mediumStressDuration ?? 0) + (r.lowStressDuration ?? 0);
    const stressScore = totalStress > 0
      ? Math.round(
          ((r.highStressPercentage ?? 0) * 80 +
            (r.mediumStressPercentage ?? 0) * 50 +
            (r.lowStressPercentage ?? 0) * 25) / 100
        )
      : null;

    const intensityMin =
      (r.moderateIntensityMinutes ?? 0) + (r.vigorousIntensityMinutes ?? 0);

    try {
      // First try update (merges with legacy data)
      const updated = await db
        .update(DailyMetric)
        .set({
          restingHr: r.restingHeartRate ?? null,
          maxHr: r.maxHeartRate ?? null,
          stressScore,
          bodyBatteryStart: r.bodyBatteryAtWakeTime ?? null,
          bodyBatteryEnd: r.bodyBatteryLowestValue ?? null,
          bodyBatteryHigh: r.bodyBatteryHighestValue ?? null,
          bodyBatteryLow: r.bodyBatteryLowestValue ?? null,
          steps: r.totalSteps ?? null,
          calories: Math.round(
            (r.activeKilocalories ?? 0) + (r.bmrKilocalories ?? 0)
          ),
          spo2: r.averageSpo2 ?? null,
          floorsClimbed: r.floorsAscended ? Math.round(r.floorsAscended) : null,
          intensityMinutes: intensityMin > 0 ? intensityMin : null,
        })
        .where(
          and(eq(DailyMetric.userId, USER_ID), eq(DailyMetric.date, date))
        );

      if (updated.rowCount === 0) {
        // No existing row — insert new
        await db
          .insert(DailyMetric)
          .values({
            userId: USER_ID,
            date,
            restingHr: r.restingHeartRate ?? null,
            maxHr: r.maxHeartRate ?? null,
            stressScore,
            bodyBatteryStart: r.bodyBatteryAtWakeTime ?? null,
            bodyBatteryEnd: r.bodyBatteryLowestValue ?? null,
            bodyBatteryHigh: r.bodyBatteryHighestValue ?? null,
            bodyBatteryLow: r.bodyBatteryLowestValue ?? null,
            steps: r.totalSteps ?? null,
            calories: Math.round(
              (r.activeKilocalories ?? 0) + (r.bmrKilocalories ?? 0)
            ),
            spo2: r.averageSpo2 ?? null,
            floorsClimbed: r.floorsAscended ? Math.round(r.floorsAscended) : null,
            intensityMinutes: intensityMin > 0 ? intensityMin : null,
          })
          .onConflictDoNothing();
      }
      imported++;
    } catch (e: any) {
      if (!e.message?.includes("duplicate")) {
        console.warn(`   ⚠ Day ${date}: ${e.message}`);
      }
    }
  }
  console.log(`   ✅ ${imported} daily stats imported`);
}

// ---------------------------------------------------------------------------
// Import SleepSummary → merge into DailyMetric
// ---------------------------------------------------------------------------
async function importSleepSummary() {
  console.log("😴 Importing SleepSummary...");
  const rows = readInfluxJSON("sleep_summary.json");
  console.log(`   Found ${rows.length} sleep records`);

  let updated = 0;
  for (const r of rows) {
    const date = r.time.split("T")[0];
    const totalSleepSec = r.sleepTimeSeconds ?? 0;
    const totalSleepMin = Math.round(totalSleepSec / 60);

    try {
      // Try to update existing DailyMetric row (from DailyStats import)
      const result = await db
        .update(DailyMetric)
        .set({
          sleepScore: r.sleepScore ?? null,
          totalSleepMinutes: totalSleepMin || null,
          deepSleepMinutes: r.deepSleepSeconds
            ? Math.round(r.deepSleepSeconds / 60)
            : null,
          remSleepMinutes: r.remSleepSeconds
            ? Math.round(r.remSleepSeconds / 60)
            : null,
          lightSleepMinutes: r.lightSleepSeconds
            ? Math.round(r.lightSleepSeconds / 60)
            : null,
          awakeMinutes: r.awakeSleepSeconds
            ? Math.round(r.awakeSleepSeconds / 60)
            : null,
          hrv: r.avgOvernightHrv ?? null,
          respirationRate: r.averageRespirationValue ?? null,
          sleepStartTime: r.time
            ? new Date(r.time).toTimeString().slice(0, 5)
            : null,
        })
        .where(
          and(eq(DailyMetric.userId, USER_ID), eq(DailyMetric.date, date))
        );

      // If no row existed, insert a new one
      if (result.rowCount === 0) {
        await db
          .insert(DailyMetric)
          .values({
            userId: USER_ID,
            date,
            sleepScore: r.sleepScore ?? null,
            totalSleepMinutes: totalSleepMin || null,
            deepSleepMinutes: r.deepSleepSeconds
              ? Math.round(r.deepSleepSeconds / 60)
              : null,
            remSleepMinutes: r.remSleepSeconds
              ? Math.round(r.remSleepSeconds / 60)
              : null,
            lightSleepMinutes: r.lightSleepSeconds
              ? Math.round(r.lightSleepSeconds / 60)
              : null,
            awakeMinutes: r.awakeSleepSeconds
              ? Math.round(r.awakeSleepSeconds / 60)
              : null,
            hrv: r.avgOvernightHrv ?? null,
            respirationRate: r.averageRespirationValue ?? null,
            sleepStartTime: r.time
              ? new Date(r.time).toTimeString().slice(0, 5)
              : null,
          })
          .onConflictDoNothing();
      }
      updated++;
    } catch (e: any) {
      console.warn(`   ⚠ Sleep ${date}: ${e.message}`);
    }
  }
  console.log(`   ✅ ${updated} sleep records merged`);
}

// ---------------------------------------------------------------------------
// Import ActivitySummary → Activity
// ---------------------------------------------------------------------------
function mapActivityType(garminType: string | null): string {
  if (!garminType) return "other";
  const t = garminType.toLowerCase();
  if (t.includes("running") || t.includes("run")) return "running";
  if (t.includes("cycling") || t.includes("bike") || t.includes("biking"))
    return "cycling";
  if (t.includes("swim")) return "swimming";
  if (t.includes("yoga")) return "yoga";
  if (t.includes("strength") || t.includes("weight")) return "strength";
  if (t.includes("walk") || t.includes("hike")) return "walking";
  if (t.includes("cardio") || t.includes("elliptical")) return "cardio";
  return t;
}

async function importActivities() {
  console.log("🏃 Importing Activities...");
  const allRows = readInfluxJSON("activity_summary.json");
  const rows = allRows.filter((r: any) => r.activityName !== "END");
  console.log(`   Found ${rows.length} activities`);

  let imported = 0;
  for (const r of rows) {
    const startedAt = new Date(r.time);
    const durationSec = r.elapsedDuration ?? r.movingDuration ?? 0;
    const durationMin = Math.round(durationSec / 60);
    const distanceM = r.distance ?? null;
    const avgPace =
      distanceM && distanceM > 0 && durationSec > 0
        ? Math.round((durationSec / (distanceM / 1000)))
        : null;

    // Simple TRIMP estimate: duration(min) × HR_ratio × gender_factor
    // Using exponential TRIMP: k * duration * delta_HR_ratio * exp(b * delta_HR_ratio)
    const avgHr = r.averageHR ?? null;
    const maxHr = r.maxHR ?? null;
    let trimpScore: number | null = null;
    if (avgHr && durationMin > 0) {
      // Rough TRIMP using Banister formula (assume male, max HR ~188, rest HR ~68)
      const restHr = 68;
      const estimatedMax = maxHr ?? 188;
      const deltaRatio = (avgHr - restHr) / (estimatedMax - restHr);
      if (deltaRatio > 0) {
        trimpScore = Math.round(
          durationMin * deltaRatio * 0.64 * Math.exp(1.92 * deltaRatio) * 10
        ) / 10;
      }
    }

    try {
      await db
        .insert(Activity)
        .values({
          userId: USER_ID,
          sportType: mapActivityType(r.activityType),
          subType: r.activityName ?? null,
          startedAt,
          endedAt: new Date(startedAt.getTime() + durationSec * 1000),
          durationMinutes: durationMin,
          distanceMeters: distanceM ? Math.round(distanceM) : null,
          avgHr: avgHr ? Math.round(avgHr) : null,
          maxHr: maxHr ? Math.round(maxHr) : null,
          avgPaceSecPerKm: avgPace,
          calories: r.calories ? Math.round(r.calories) : null,
          trimpScore,
          strainScore: trimpScore
            ? Math.round(Math.min(21, trimpScore / 10) * 10) / 10
            : null,
          hrZoneMinutes: {
            zone1: r.hrTimeInZone_1
              ? Math.round(r.hrTimeInZone_1 / 60)
              : 0,
            zone2: r.hrTimeInZone_2
              ? Math.round(r.hrTimeInZone_2 / 60)
              : 0,
            zone3: r.hrTimeInZone_3
              ? Math.round(r.hrTimeInZone_3 / 60)
              : 0,
            zone4: r.hrTimeInZone_4
              ? Math.round(r.hrTimeInZone_4 / 60)
              : 0,
            zone5: r.hrTimeInZone_5
              ? Math.round(r.hrTimeInZone_5 / 60)
              : 0,
          },
        })
        .onConflictDoNothing();
      imported++;
    } catch (e: any) {
      if (!e.message?.includes("duplicate")) {
        console.warn(
          `   ⚠ Activity ${r.activityName} at ${r.time}: ${e.message}`
        );
      }
    }
  }
  console.log(`   ✅ ${imported} activities imported`);
}

// ---------------------------------------------------------------------------
// Import VO2_Max → VO2maxEstimate
// ---------------------------------------------------------------------------
async function importVO2max() {
  console.log("🫁 Importing VO2max...");
  const rows = readInfluxJSON("vo2max.json");
  console.log(`   Found ${rows.length} VO2max records`);

  let imported = 0;
  for (const r of rows) {
    const date = r.time.split("T")[0];
    try {
      await db
        .insert(VO2maxEstimate)
        .values({
          userId: USER_ID,
          date,
          sport: "running",
          value: r.VO2_max_value,
          source: "garmin",
        })
        .onConflictDoNothing();
      imported++;
    } catch (e: any) {
      if (!e.message?.includes("duplicate")) {
        console.warn(`   ⚠ VO2max ${date}: ${e.message}`);
      }
    }
  }
  console.log(`   ✅ ${imported} VO2max records imported`);
}

// ---------------------------------------------------------------------------
// Import RacePredictions → RacePrediction
// ---------------------------------------------------------------------------
async function importRacePredictions() {
  console.log("🏅 Importing Race Predictions...");
  const rows = readInfluxJSON("race_predictions.json");
  if (rows.length === 0) {
    console.log("   No race predictions found");
    return;
  }

  const r = rows[0];
  const date = r.time.split("T")[0];
  const distances = [
    { distance: "5k", seconds: r.time5K },
    { distance: "10k", seconds: r.time10K },
    { distance: "half_marathon", seconds: r.timeHalfMarathon },
    { distance: "marathon", seconds: r.timeMarathon },
  ];

  let imported = 0;
  for (const d of distances) {
    if (d.seconds) {
      try {
        await db
          .insert(RacePrediction)
          .values({
            userId: USER_ID,
            date,
            distance: d.distance,
            predictedSeconds: d.seconds,
            vo2maxUsed: rows[0].VO2_max_value ?? null,
            method: "garmin",
          })
          .onConflictDoNothing();
        imported++;
      } catch (e: any) {
        if (!e.message?.includes("duplicate")) {
          console.warn(`   ⚠ Race ${d.distance}: ${e.message}`);
        }
      }
    }
  }
  console.log(`   ✅ ${imported} race predictions imported`);
}

// ---------------------------------------------------------------------------
// Update Profile with real data
// ---------------------------------------------------------------------------
async function updateProfile() {
  console.log("👤 Updating profile with real data...");

  const bodyComp = readInfluxJSON("body_composition.json");
  const fitnessAge = readInfluxJSON("fitness_age.json");
  const vo2max = readInfluxJSON("vo2max.json");
  const daily = readInfluxJSON("daily_stats.json");

  const weightGrams = bodyComp[0]?.weight;
  const massKg = weightGrams ? Math.round(weightGrams / 1000) : null;
  const age = fitnessAge[0]?.chronologicalAge ?? null;
  const vo2maxVal = vo2max.length > 0 ? vo2max[vo2max.length - 1]?.VO2_max_value : null;
  const restHr = daily.length > 0 ? daily[daily.length - 1]?.restingHeartRate : null;

  // Compute avg HRV from sleep data
  const sleepData = readInfluxJSON("sleep_summary.json");
  const hrvValues = sleepData.filter((s: any) => s.avgOvernightHrv).map((s: any) => s.avgOvernightHrv);
  const avgHrv = hrvValues.length > 0 ? hrvValues.reduce((a: number, b: number) => a + b, 0) / hrvValues.length : null;

  try {
    await db
      .update(Profile)
      .set({
        ...(age != null && { age }),
        ...(massKg != null && { massKg }),
        ...(restHr != null && { restingHrBaseline: restHr }),
        ...(avgHrv != null && { hrvBaseline: Math.round(avgHrv) }),
        ...(vo2maxVal != null && { vo2maxRunning: vo2maxVal }),
      })
      .where(eq(Profile.userId, USER_ID));
    console.log(
      `   ✅ Profile updated: age=${age}, mass=${massKg}kg, RHR=${restHr}, HRV=${avgHrv ? Math.round(avgHrv) : "?"}, VO2max=${vo2maxVal}`
    );
  } catch (e: any) {
    console.warn(`   ⚠ Profile update: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("🔄 GarminCoach ETL: InfluxDB JSON → PostgreSQL");
  console.log(`   Data dir: ${DATA_DIR}`);
  console.log(`   Postgres: ${POSTGRES_URL.replace(/:[^:@]+@/, ':***@')}`);
  console.log(`   User: ${USER_ID}`);
  console.log("");

  await updateProfile();
  await importLegacyDaily();  // 2020-2025 (basic: steps, calories, distance)
  await importDailyStats();   // Sep 2025+ (detailed: HR, stress, body battery, etc.)
  await importSleepSummary(); // Recent sleep data — merges into DailyMetric
  await importActivities();
  await importVO2max();
  await importRacePredictions();

  console.log("\n🎉 ETL complete! Your real Garmin data is now in the app.");
  console.log("   Start the app: cd ~/git/garmin-coach && pnpm --filter @acme/nextjs dev");
  await pool.end();
}

main().catch((e) => {
  console.error("ETL failed:", e);
  process.exit(1);
});
