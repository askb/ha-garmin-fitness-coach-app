/**
 * Seed script: 90 days of realistic athlete data for charts/pages demo.
 *
 * Usage: pnpm --filter @acme/db db:seed
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import {
  Activity,
  AdvancedMetric,
  DailyMetric,
  Intervention,
  JournalEntry,
  Profile,
  SessionReport,
} from "./schema";

const DATABASE_URL = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ POSTGRES_URL or DATABASE_URL not set");
  process.exit(1);
}

const nonPoolingUrl = DATABASE_URL.replace(":6543", ":5432");
const pool = new pg.Pool({ connectionString: nonPoolingUrl });
const db = drizzle(pool, { casing: "snake_case" });

// ---------------------------------------------------------------------------
// Deterministic pseudo-random number generator
// ---------------------------------------------------------------------------
function makeRng(seed: number) {
  let s = seed;
  return {
    next(): number {
      s = (s * 16807 + 0) % 2147483647;
      return (s - 1) / 2147483646;
    },
    int(min: number, max: number): number {
      return Math.floor(min + this.next() * (max - min + 1));
    },
    float(min: number, max: number, decimals = 1): number {
      return parseFloat((min + this.next() * (max - min)).toFixed(decimals));
    },
    bool(probability = 0.5): boolean {
      return this.next() < probability;
    },
  };
}

const rng = makeRng(42);
const USER_ID = "seed-user-001";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function dateStr(daysAgo: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0]!;
}

function dateAt(daysAgo: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Day plan types
// ---------------------------------------------------------------------------
type ActivityType =
  | "easy_run"
  | "threshold_run"
  | "long_run"
  | "bike"
  | "strength"
  | null;

interface DayPlan {
  daysAgo: number;
  date: string;
  dayOfWeek: number;
  actType: ActivityType;
  load: number; // TSS-like training load
}

// ---------------------------------------------------------------------------
// Main seed
// ---------------------------------------------------------------------------
async function seed() {
  // Safety check: refuse to seed if real data exists
  const existing = await db
    .select({ count: sql<number>`count(*)` })
    .from(Activity)
    .where(sql`garmin_activity_id NOT LIKE 'seed-%'`);
  const realCount = Number(existing[0]?.count ?? 0);
  if (realCount > 0) {
    console.error(
      `❌ Aborting: found ${realCount} real activities in the database.\n` +
        `   The seed script is for demo/empty databases only.\n` +
        `   To force, set FORCE_SEED=1`,
    );
    if (!process.env.FORCE_SEED) {
      process.exit(1);
    }
    console.warn(
      "⚠️  FORCE_SEED=1 set — seeding anyway (may mix with real data)",
    );
  }
  console.log("🌱 Seeding 90 days of realistic athlete data…");

  // --- Profile ---
  await db
    .insert(Profile)
    .values({
      userId: USER_ID,
      age: 32,
      sex: "male",
      massKg: 72,
      heightCm: 178,
      timezone: "America/New_York",
      experienceLevel: "intermediate",
      primarySports: ["running", "cycling", "strength_training"],
      goals: [
        { sport: "running", goalType: "performance", target: "sub-40 10K" },
        { sport: "cycling", goalType: "endurance", target: "3hr gran fondo" },
      ],
      weeklyDays: ["mon", "tue", "wed", "sat", "sun"],
      minutesPerDay: 55,
      maxHr: 192,
      restingHrBaseline: 53,
      hrvBaseline: 65,
      sleepBaseline: 430,
      vo2maxRunning: 52.0,
      functionalThresholdPower: 280,
    })
    .onConflictDoNothing();

  // --- Build 90-day schedule ---
  // Mon=easy run, Tue=strength, Wed=threshold, Thu=rest, Fri=rest, Sat=long run, Sun=bike
  const days: DayPlan[] = [];

  for (let daysAgo = 89; daysAgo >= 0; daysAgo--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - daysAgo);
    const dow = d.getDay(); // 0=Sun

    let actType: ActivityType = null;
    let load = 0;

    if (dow === 1) {
      // Monday: easy run ~45 min
      actType = "easy_run";
      load = rng.int(42, 58);
    } else if (dow === 2) {
      // Tuesday: strength
      actType = "strength";
      load = rng.int(28, 42);
    } else if (dow === 3) {
      // Wednesday: threshold run
      actType = "threshold_run";
      load = rng.int(72, 98);
    } else if (dow === 6) {
      // Saturday: long run
      actType = "long_run";
      load = rng.int(85, 120);
    } else if (dow === 0) {
      // Sunday: bike
      actType = "bike";
      load = rng.int(60, 88);
    }

    days.push({
      daysAgo,
      date: dateStr(daysAgo),
      dayOfWeek: dow,
      actType,
      load,
    });
  }

  // --- Insert activities ---
  const insertedActivities: {
    id: string;
    date: string;
    actType: ActivityType;
    load: number;
  }[] = [];

  for (const day of days.filter((d) => d.actType !== null)) {
    const { daysAgo, date, actType, load } = day;
    const garminId = `seed-${date}-${actType}`;

    let sportType: string;
    let subType: string | null = null;
    let durationMinutes: number;
    let distanceMeters: number | null = null;
    let avgHr: number;
    let maxHr: number;
    let calories: number;
    let avgPaceSecPerKm: number | null = null;
    let avgPower: number | null = null;
    let normalizedPower: number | null = null;
    let elevationGain: number | null = null;
    let avgCadence: number | null = null;
    let aerobicTE: number | null = null;
    let anaerobicTE: number | null = null;

    switch (actType) {
      case "easy_run":
        sportType = "running";
        subType = "easy";
        durationMinutes = rng.float(42, 50, 0);
        distanceMeters = rng.float(6500, 8500, 0);
        avgHr = rng.int(130, 145);
        maxHr = rng.int(150, 162);
        calories = rng.int(380, 480);
        avgPaceSecPerKm = Math.round(
          (durationMinutes * 60) / (distanceMeters / 1000),
        );
        avgCadence = rng.float(168, 176, 0);
        elevationGain = rng.float(40, 120, 0);
        aerobicTE = rng.float(2.5, 3.5, 1);
        anaerobicTE = rng.float(0.0, 0.5, 1);
        break;

      case "threshold_run":
        sportType = "running";
        subType = "threshold";
        durationMinutes = rng.float(32, 40, 0);
        distanceMeters = rng.float(7000, 9500, 0);
        avgHr = rng.int(158, 170);
        maxHr = rng.int(172, 185);
        calories = rng.int(400, 520);
        avgPaceSecPerKm = Math.round(
          (durationMinutes * 60) / (distanceMeters / 1000),
        );
        avgCadence = rng.float(174, 184, 0);
        elevationGain = rng.float(30, 80, 0);
        aerobicTE = rng.float(3.5, 4.5, 1);
        anaerobicTE = rng.float(1.5, 3.0, 1);
        break;

      case "long_run":
        sportType = "running";
        subType = "long";
        durationMinutes = rng.float(65, 80, 0);
        distanceMeters = rng.float(13000, 18000, 0);
        avgHr = rng.int(138, 152);
        maxHr = rng.int(158, 170);
        calories = rng.int(650, 900);
        avgPaceSecPerKm = Math.round(
          (durationMinutes * 60) / (distanceMeters / 1000),
        );
        avgCadence = rng.float(166, 174, 0);
        elevationGain = rng.float(80, 250, 0);
        aerobicTE = rng.float(3.8, 5.0, 1);
        anaerobicTE = rng.float(0.0, 1.0, 1);
        break;

      case "bike":
        sportType = "cycling";
        subType = "endurance";
        durationMinutes = rng.float(80, 100, 0);
        distanceMeters = rng.float(35000, 45000, 0);
        avgHr = rng.int(130, 148);
        maxHr = rng.int(158, 172);
        calories = rng.int(700, 950);
        avgPower = rng.float(195, 240, 0);
        normalizedPower = parseFloat(
          ((avgPower as number) * rng.float(1.02, 1.08, 3)).toFixed(0),
        );
        elevationGain = rng.float(300, 900, 0);
        avgCadence = rng.float(84, 94, 0);
        aerobicTE = rng.float(3.0, 4.2, 1);
        anaerobicTE = rng.float(0.0, 1.0, 1);
        break;

      default: // strength
        sportType = "strength_training";
        subType = "full_body";
        durationMinutes = rng.float(40, 55, 0);
        avgHr = rng.int(110, 130);
        maxHr = rng.int(140, 158);
        calories = rng.int(250, 380);
        aerobicTE = rng.float(1.0, 2.0, 1);
        anaerobicTE = rng.float(0.5, 2.0, 1);
    }

    const startTime = dateAt(daysAgo, 7, 0);
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

    const numLaps =
      sportType === "running"
        ? Math.ceil(durationMinutes / 5)
        : Math.ceil(durationMinutes / 10);
    const laps = Array.from({ length: numLaps }, (_, i) => ({
      index: i + 1,
      distanceMeters: distanceMeters ? distanceMeters / numLaps : 0,
      durationSeconds: Math.round((durationMinutes * 60) / numLaps),
      avgHr: avgHr + rng.int(-5, 5),
      ...(avgPaceSecPerKm
        ? { avgPace: avgPaceSecPerKm + rng.int(-5, 10) }
        : {}),
      ...(avgPower
        ? { avgPower: (avgPower as number) + rng.int(-10, 10) }
        : {}),
    }));

    const [inserted] = await db
      .insert(Activity)
      .values({
        userId: USER_ID,
        garminActivityId: garminId,
        sportType,
        subType,
        startedAt: startTime,
        endedAt: endTime,
        durationMinutes,
        distanceMeters,
        avgHr,
        maxHr,
        avgPaceSecPerKm,
        calories,
        avgPower,
        normalizedPower,
        elevationGain,
        avgCadence,
        aerobicTE,
        anaerobicTE,
        trimpScore: load,
        laps,
        rawGarminData: { source: "seed", version: "1.0" },
      })
      .onConflictDoNothing()
      .returning({ id: Activity.id });

    if (inserted) {
      insertedActivities.push({ id: inserted.id, date, actType, load });
    }
  }

  console.log(`✅ ${insertedActivities.length} activities inserted`);

  // --- Daily Metrics (90 days) ---
  let runningFatigue = 0;
  const dailyMetrics = [];

  for (const day of days) {
    const { date, actType, load } = day;
    runningFatigue = runningFatigue * 0.85 + load;

    const isRestDay = actType === null;
    const isHardDay = actType === "threshold_run" || actType === "long_run";

    const hrvBase = isRestDay ? 68 : isHardDay ? 54 : 62;
    const hrv = rng.float(hrvBase - 7, hrvBase + 7, 1);

    const rhrBase = isRestDay ? 49 : isHardDay ? 56 : 52;
    const restingHr = rng.int(rhrBase - 2, rhrBase + 3);

    const sleepBase = isHardDay ? 68 : isRestDay ? 82 : 76;
    const sleepScore = Math.min(
      95,
      Math.max(50, rng.int(sleepBase - 8, sleepBase + 10)),
    );
    const totalSleepMinutes = rng.int(
      sleepScore > 75 ? 420 : 370,
      sleepScore > 75 ? 480 : 430,
    );

    const fatigueFactor = Math.min(runningFatigue / 180, 1);
    const bbHigh = Math.round(
      Math.min(100, Math.max(60, 95 - fatigueFactor * 32 + rng.int(-4, 4))),
    );
    const bbLow = Math.round(Math.min(40, Math.max(10, 20 + rng.int(-5, 10))));

    const steps = isRestDay ? rng.int(6000, 9000) : rng.int(9500, 14000);

    dailyMetrics.push({
      userId: USER_ID,
      date,
      hrv,
      restingHr,
      totalSleepMinutes,
      sleepScore,
      deepSleepMinutes: rng.int(65, 110),
      remSleepMinutes: rng.int(75, 130),
      lightSleepMinutes: rng.int(130, 210),
      awakeMinutes: rng.int(10, 40),
      bodyBatteryHigh: bbHigh,
      bodyBatteryLow: bbLow,
      bodyBatteryStart: Math.min(100, bbHigh - rng.int(0, 5)),
      bodyBatteryEnd: Math.min(50, Math.max(10, bbLow + rng.int(0, 8))),
      steps,
      stressScore: isHardDay ? rng.int(25, 45) : rng.int(10, 30),
      garminTrainingLoad: actType !== null ? load : 0,
      respirationRate: rng.float(13.5, 16.0, 1),
      spo2: rng.int(95, 99),
      intensityMinutes: actType !== null ? rng.int(20, 55) : rng.int(0, 10),
      floorsClimbed: rng.int(3, 20),
      calories: actType !== null ? rng.int(2400, 3200) : rng.int(1900, 2400),
      maxHr: isRestDay
        ? null
        : isHardDay
          ? rng.int(178, 189)
          : rng.int(155, 172),
      sleepStartTime: `${rng.int(21, 23)}:${rng.int(0, 59).toString().padStart(2, "0")}`,
      sleepEndTime: `${rng.int(5, 7)}:${rng.int(0, 59).toString().padStart(2, "0")}`,
    });
  }

  for (const m of dailyMetrics) {
    await db.insert(DailyMetric).values(m).onConflictDoNothing();
  }
  console.log(`✅ ${dailyMetrics.length} daily metrics inserted`);

  // --- Journal Entries (~5x/week: skip Thu & Fri) ---
  const journalDays = days.filter(
    (d) => d.dayOfWeek !== 4 && d.dayOfWeek !== 5,
  );
  let journalCount = 0;

  for (const day of journalDays) {
    const { date, actType } = day;
    const isHard = actType === "threshold_run" || actType === "long_run";

    await db
      .insert(JournalEntry)
      .values({
        userId: USER_ID,
        date,
        sorenessScore: isHard ? rng.int(3, 5) : rng.int(1, 3),
        moodScore: rng.int(3, 5),
        caffeineAmountMg: rng.bool(0.8) ? rng.int(100, 220) : rng.int(0, 60),
        napMinutes: rng.bool(0.1) ? rng.int(15, 25) : 0,
        medications: ["none"],
        menstrualPhase: null,
        notes: isHard ? "Hard session, legs felt it during cool-down." : null,
      })
      .onConflictDoNothing();
    journalCount++;
  }
  console.log(`✅ ${journalCount} journal entries inserted`);

  // --- Session Reports (one per activity) ---
  let sessionCount = 0;
  for (const act of insertedActivities) {
    const { id: activityId, actType, load } = act;
    const isHard = actType === "threshold_run" || actType === "long_run";
    const sessionType =
      actType === "easy_run"
        ? "base"
        : actType === "threshold_run"
          ? "threshold"
          : actType === "long_run"
            ? "base"
            : actType === "bike"
              ? "base"
              : "recovery";

    await db
      .insert(SessionReport)
      .values({
        userId: USER_ID,
        activityId,
        rpe: isHard ? rng.int(6, 8) : rng.int(3, 5),
        sessionType,
        internalLoad: parseFloat((load * rng.float(0.9, 1.1, 2)).toFixed(1)),
      })
      .onConflictDoNothing();
    sessionCount++;
  }
  console.log(`✅ ${sessionCount} session reports inserted`);

  // --- Interventions (4 over 90 days) ---
  const interventions = [
    {
      userId: USER_ID,
      date: dateStr(60),
      type: "massage",
      description:
        "Sports massage — 60 min deep tissue, focused on calves and hamstrings",
      outcomeNotes:
        "Significant reduction in muscle tightness; HRV improved +8ms over next 3 days",
      effectivenessRating: 4,
      linkedMetricDate: dateStr(57),
    },
    {
      userId: USER_ID,
      date: dateStr(45),
      type: "sleep_focus",
      description:
        "Extra sleep focus week — targeting 8+ hours, blackout curtains, no screens 1hr before bed",
      outcomeNotes:
        "Avg sleep score jumped 72→84; HRV improved ~8ms; body battery consistently above 85",
      effectivenessRating: 5,
      linkedMetricDate: dateStr(38),
    },
    {
      userId: USER_ID,
      date: dateStr(21),
      type: "ice_bath",
      description: "Cold water immersion after race week — 10 min at 12°C",
      outcomeNotes:
        "Reduced perceived soreness next day; felt fresher than usual for Monday run",
      effectivenessRating: 4,
      linkedMetricDate: dateStr(20),
    },
    {
      userId: USER_ID,
      date: dateStr(14),
      type: "deload_week",
      description:
        "Planned deload: volume reduced 40%, no threshold sessions, extra sleep",
      outcomeNotes:
        "TSB rose to +15, HRV stabilized at 68ms, motivation fully returned by day 7",
      effectivenessRating: 4,
      linkedMetricDate: dateStr(7),
    },
  ];

  for (const iv of interventions) {
    await db.insert(Intervention).values(iv).onConflictDoNothing();
  }
  console.log(`✅ ${interventions.length} interventions inserted`);

  // --- Advanced Metrics: CTL/ATL/TSB (from day 42 of data) ---
  // Formulas:
  //   CTL(t) = CTL(t-1) * exp(-1/42) + load * (1 - exp(-1/42))
  //   ATL(t) = ATL(t-1) * exp(-1/7)  + load * (1 - exp(-1/7))
  //   TSB(t) = CTL(t-1) - ATL(t-1)   [yesterday's values]
  const k42 = Math.exp(-1 / 42);
  const g42 = 1 - k42;
  const k7 = Math.exp(-1 / 7);
  const g7 = 1 - k7;

  let ctl = 0;
  let atl = 0;
  const ctlHistory: number[] = [];
  let advancedCount = 0;

  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    const { date, load } = day;

    const tsb = ctl - atl; // computed from yesterday's values
    const newCtl = ctl * k42 + load * g42;
    const newAtl = atl * k7 + load * g7;
    const acwr = newCtl > 0 ? newAtl / Math.max(newCtl, 1) : 0;

    ctlHistory.push(newCtl);
    const rampRate = i >= 7 ? newCtl - (ctlHistory[i - 7] ?? 0) : newCtl;

    // Only insert once we have 42 days of data (i >= 42)
    if (i >= 42) {
      await db
        .insert(AdvancedMetric)
        .values({
          userId: USER_ID,
          date,
          ctl: parseFloat(newCtl.toFixed(2)),
          atl: parseFloat(newAtl.toFixed(2)),
          tsb: parseFloat(tsb.toFixed(2)),
          acwr: parseFloat(acwr.toFixed(3)),
          rampRate: parseFloat(rampRate.toFixed(2)),
          cp: 280,
        })
        .onConflictDoNothing();
      advancedCount++;
    }

    ctl = newCtl;
    atl = newAtl;
  }

  const finalTsb = parseFloat((ctl - atl).toFixed(1));
  console.log(`✅ ${advancedCount} advanced metric records inserted`);
  console.log(
    `   Final CTL: ${ctl.toFixed(1)} | ATL: ${atl.toFixed(1)} | TSB: ${finalTsb}`,
  );

  // --- Summary ---
  console.log(
    `\n🎉 Seeded ${insertedActivities.length} activities, ${dailyMetrics.length} daily metrics, ${journalCount} journal entries`,
  );
  await pool.end();
  process.exit(0);
}

seed().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});
