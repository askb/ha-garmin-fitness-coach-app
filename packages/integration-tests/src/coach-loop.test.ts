// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { execFileSync, spawnSync } from "node:child_process";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const TEST_USER_ID = "integration-user-001";
const TEST_DATE = "2026-04-10";
const OTHER_USER_ID = "integration-user-002";

let containerName: string | null = null;
let appRouter: typeof import("@acme/api").appRouter;
let db: typeof import("@acme/db/client").db;
let pool: { end: () => Promise<void> } | undefined;
let schema: typeof import("@acme/db/schema");
let dbOps: typeof import("@acme/db");

type Caller = ReturnType<typeof appRouter.createCaller>;

function runDocker(args: string[]): string {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function startPostgres(): string {
  const name = `pulsecoach-integration-${process.pid}-${Date.now()}`;
  runDocker([
    "run",
    "--rm",
    "--detach",
    "--name",
    name,
    "--env",
    "POSTGRES_DB=pulsecoach_integration",
    "--env",
    "POSTGRES_USER=pulsecoach",
    "--env",
    "POSTGRES_PASSWORD=pulsecoach",
    "--publish",
    "127.0.0.1::5432",
    "postgres:16-alpine",
  ]);
  containerName = name;

  let lastReadinessOutput: string;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = spawnSync(
      "docker",
      [
        "exec",
        name,
        "pg_isready",
        "-U",
        "pulsecoach",
        "-d",
        "pulsecoach_integration",
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    lastReadinessOutput = `${result.stdout}${result.stderr}`.trim();
    if (result.status === 0) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    if (attempt === 59) {
      throw new Error(
        `Postgres container did not become ready: ${lastReadinessOutput}`,
      );
    }
  }

  const portOutput = runDocker(["port", name, "5432/tcp"]);
  const port = portOutput.split(":").at(-1);
  if (!port)
    throw new Error(`Could not determine Postgres port: ${portOutput}`);

  return `postgresql://pulsecoach:pulsecoach@127.0.0.1:${port}/pulsecoach_integration`;
}

function applySchema(postgresUrl: string): void {
  const result = spawnSync(
    "pnpm",
    [
      "--filter",
      "@acme/db",
      "exec",
      "drizzle-kit",
      "push",
      "--config",
      "drizzle.config.ts",
      "--force",
    ],
    {
      cwd: new URL("../../..", import.meta.url),
      encoding: "utf8",
      env: {
        ...process.env,
        POSTGRES_URL: postgresUrl,
        DATABASE_URL: postgresUrl,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `drizzle-kit push failed\n${result.stdout}\n${result.stderr}`,
    );
  }
}

function makeCaller(userId = TEST_USER_ID): Caller {
  const now = new Date();
  return appRouter.createCaller({
    authApi: null as never,
    session: {
      user: {
        id: userId,
        name: "Integration User",
        email: `${userId}@example.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      session: {
        id: `${userId}-session`,
        userId,
        token: `${userId}-token`,
        expiresAt: new Date(Date.now() + 86_400_000),
        createdAt: now,
        updatedAt: now,
      },
    },
    db,
  });
}

function shiftIsoDay(isoDay: string, deltaDays: number): string {
  const date = new Date(`${isoDay}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

async function clearUserData(userId = TEST_USER_ID): Promise<void> {
  const { eq } = dbOps;
  await db
    .delete(schema.RecommendationAudit)
    .where(eq(schema.RecommendationAudit.userId, userId));
  await db
    .delete(schema.DailyWorkout)
    .where(eq(schema.DailyWorkout.userId, userId));
  await db.delete(schema.Activity).where(eq(schema.Activity.userId, userId));
  await db
    .delete(schema.AdvancedMetric)
    .where(eq(schema.AdvancedMetric.userId, userId));
  await db
    .delete(schema.DailyMetric)
    .where(eq(schema.DailyMetric.userId, userId));
  await db
    .delete(schema.ReadinessScore)
    .where(eq(schema.ReadinessScore.userId, userId));
  await db
    .delete(schema.AthleteBaseline)
    .where(eq(schema.AthleteBaseline.userId, userId));
  await db
    .delete(schema.Intervention)
    .where(eq(schema.Intervention.userId, userId));
  await db
    .delete(schema.WeeklyPlan)
    .where(eq(schema.WeeklyPlan.userId, userId));
  await db.delete(schema.Profile).where(eq(schema.Profile.userId, userId));
}

async function seedRecommendationInputs(date = TEST_DATE): Promise<void> {
  await db.insert(schema.Profile).values({
    userId: TEST_USER_ID,
    timezone: "UTC",
    maxHr: 180,
    weeklyDays: ["monday", "wednesday", "friday"],
    goals: [{ sport: "running", goalType: "fitness", target: "2026-06-01" }],
  });
  await db.insert(schema.ReadinessScore).values({
    userId: TEST_USER_ID,
    date,
    score: 82,
    zone: "optimal",
  });
  await db.insert(schema.DailyMetric).values({
    userId: TEST_USER_ID,
    date,
    sleepScore: 88,
    sleepDebtMinutes: 0,
    hrv: 62,
  });
  await db.insert(schema.AdvancedMetric).values({
    userId: TEST_USER_ID,
    date,
    acwr: 0.92,
    tsb: 6,
  });
  await db.insert(schema.DailyWorkout).values({
    userId: TEST_USER_ID,
    date,
    sportType: "running",
    workoutType: "easy",
    title: "Easy aerobic run",
    targetDurationMin: 45,
    targetDurationMax: 50,
    targetHrZoneLow: 2,
    targetHrZoneHigh: 3,
    structure: [{ step: "easy-run", durationMin: 45 }],
    status: "planned",
  });
}

async function seedRecommendation(date = TEST_DATE) {
  await seedRecommendationInputs(date);
  return makeCaller().coach.getDailyRecommendation({
    userId: TEST_USER_ID,
    date,
  });
}

async function auditRows() {
  const { asc, eq } = dbOps;
  return db.query.RecommendationAudit.findMany({
    where: eq(schema.RecommendationAudit.userId, TEST_USER_ID),
    orderBy: asc(schema.RecommendationAudit.createdAt),
  });
}

async function plannedWorkout(date = TEST_DATE) {
  const { and, eq } = dbOps;
  return db.query.DailyWorkout.findFirst({
    where: and(
      eq(schema.DailyWorkout.userId, TEST_USER_ID),
      eq(schema.DailyWorkout.date, date),
    ),
  });
}

beforeAll(async () => {
  const postgresUrl = startPostgres();
  try {
    process.env.POSTGRES_URL = postgresUrl;
    process.env.DATABASE_URL = postgresUrl;
    delete process.env.COACH_LLM_FRAMING_ENABLED;
    delete process.env.OLLAMA_URL;
    delete process.env.OLLAMA_MODEL;
    delete process.env.SUPERVISOR_TOKEN;

    applySchema(postgresUrl);

    const [apiModule, dbClientModule, schemaModule, dbOpsModule] =
      await Promise.all([
        import("@acme/api"),
        import("@acme/db/client"),
        import("@acme/db/schema"),
        import("@acme/db"),
      ]);
    appRouter = apiModule.appRouter;
    db = dbClientModule.db;
    pool = dbClientModule.pool;
    schema = schemaModule;
    dbOps = dbOpsModule;
  } catch (error) {
    if (containerName) {
      spawnSync("docker", ["stop", containerName], { stdio: "ignore" });
      containerName = null;
    }
    throw error;
  }
});

afterAll(async () => {
  await pool?.end();
  if (containerName) {
    spawnSync("docker", ["stop", containerName], { stdio: "ignore" });
  }
});

beforeEach(async () => {
  await clearUserData(TEST_USER_ID);
  await clearUserData(OTHER_USER_ID);
});

describe("v0.17.0 coach loop integration", () => {
  it("engine → audit → query writes a recommendation audit and returns auditId", async () => {
    const result = await seedRecommendation();
    const rows = await auditRows();

    expect(result.auditId).toMatch(/^[0-9a-f-]{36}$/);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: result.auditId,
      kind: "recommendation",
      userId: TEST_USER_ID,
    });
    expect(rows[0]?.payload).toMatchObject({
      recommendation: expect.objectContaining({ action: expect.any(String) }),
    });
  });

  it("accept flow appends an intervention_accept audit and leaves DailyWorkout unchanged", async () => {
    const recommendation = await seedRecommendation();
    const before = await plannedWorkout();

    const accepted = await makeCaller().coach.accept({
      userId: TEST_USER_ID,
      date: TEST_DATE,
      auditId: recommendation.auditId,
      note: "looks good",
    });

    const rows = await auditRows();
    const after = await plannedWorkout();
    expect(accepted.auditId).not.toBe(recommendation.auditId);
    expect(rows.map((row) => row.kind)).toEqual([
      "recommendation",
      "intervention_accept",
    ]);
    expect(rows[1]?.payload).toMatchObject({
      referencedAuditId: recommendation.auditId,
      note: "looks good",
    });
    expect(after).toMatchObject({
      id: before?.id,
      status: before?.status,
      workoutType: before?.workoutType,
    });
  });

  it("skip flow appends an intervention_skip audit without other side effects", async () => {
    const recommendation = await seedRecommendation();
    const before = await plannedWorkout();

    await makeCaller().coach.skip({
      userId: TEST_USER_ID,
      date: TEST_DATE,
      auditId: recommendation.auditId,
    });

    const rows = await auditRows();
    const after = await plannedWorkout();
    expect(rows.map((row) => row.kind)).toEqual([
      "recommendation",
      "intervention_skip",
    ]);
    expect(rows[1]?.payload).toMatchObject({
      referencedAuditId: recommendation.auditId,
    });
    expect(after).toMatchObject({ id: before?.id, status: "planned" });
  });

  it("defer flow records intervention_defer with the requested deferToDate", async () => {
    const recommendation = await seedRecommendation();
    const tomorrow = shiftIsoDay(TEST_DATE, 1);

    await makeCaller().coach.defer({
      userId: TEST_USER_ID,
      date: TEST_DATE,
      auditId: recommendation.auditId,
      deferToDate: tomorrow,
    });

    const rows = await auditRows();
    expect(rows.map((row) => row.kind)).toEqual([
      "recommendation",
      "intervention_defer",
    ]);
    expect(rows[1]?.payload).toMatchObject({
      referencedAuditId: recommendation.auditId,
      deferToDate: tomorrow,
    });
  });

  it("reconcile flow writes a reconciliation audit before mutating DailyWorkout.status", async () => {
    await seedRecommendationInputs();
    const activityId = "10000000-0000-4000-8000-000000000001";
    await db.insert(schema.Activity).values({
      id: activityId,
      userId: TEST_USER_ID,
      garminActivityId: "integration-activity-1",
      sportType: "running",
      startedAt: new Date(`${TEST_DATE}T12:00:00Z`),
      durationMinutes: 45,
      avgHr: 145,
      maxHr: 176,
    });

    const result = await makeCaller().coach.reconcile({
      userId: TEST_USER_ID,
      date: TEST_DATE,
    });
    const rows = await auditRows();
    const workout = await plannedWorkout();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "reconciliation",
      relatedWorkoutId: workout?.id,
    });
    expect(workout?.status).toBe(result.reconcile.status);
    expect(result.reconcile).toMatchObject({
      date: TEST_DATE,
      status: expect.stringMatching(
        /^(completed|partial|missed|extra|no-plan)$/,
      ),
      matchedActivityIds: [activityId],
      deviation: expect.objectContaining({
        durationMinDelta: expect.any(Number),
      }),
      confidence: expect.any(Number),
    });
  });

  it("adherenceTrend returns 14 oldest-first points including no-plan rows", async () => {
    await db
      .insert(schema.Profile)
      .values({ userId: TEST_USER_ID, timezone: "UTC" });
    const today = new Date().toISOString().slice(0, 10);
    const values = Array.from({ length: 14 }, (_, index) => {
      const date = shiftIsoDay(today, index - 13);
      const status =
        index % 5 === 0 ? "no-plan" : index % 3 === 0 ? "missed" : "completed";
      const actualIds =
        status === "missed" || status === "no-plan"
          ? []
          : [`activity-${index}`];
      return {
        userId: TEST_USER_ID,
        date,
        kind: "reconciliation" as const,
        confidence: 0.8,
        relatedActivityIds: actualIds,
        payload: {
          reconcile: {
            date,
            status,
            matchedActivityIds: actualIds,
            deviation: {
              durationMinDelta: 0,
              durationPctDelta: 0,
              intensityShift: 0,
              sportTypeMatch: true,
            },
            notes: [],
            confidence: 0.8,
          },
          actualIds,
          plannedDurationMin: status === "no-plan" ? null : 45,
          actualDurationMin: actualIds.length ? 45 : 0,
        },
      };
    });
    await db.insert(schema.RecommendationAudit).values(values as never);

    const result = await makeCaller().coach.adherenceTrend({
      userId: TEST_USER_ID,
      days: 14,
    });

    expect(result.points).toHaveLength(14);
    expect(result.points.map((point) => point.date)).toEqual(
      [...result.points.map((point) => point.date)].sort(),
    );
    expect(result.points.some((point) => point.status === "no-plan")).toBe(
      true,
    );
  });

  it("adherenceTrend falls back to completed daily_workout history when audits are empty", async () => {
    await db
      .insert(schema.Profile)
      .values({ userId: TEST_USER_ID, timezone: "UTC" });
    const today = new Date().toISOString().slice(0, 10);
    const workouts = Array.from({ length: 7 }, (_, index) => {
      const date = shiftIsoDay(today, index - 6);
      return {
        userId: TEST_USER_ID,
        date,
        sportType: "running",
        workoutType: "easy",
        title: `Completed workout ${index + 1}`,
        targetDurationMin: 45,
        structure: [{ step: "easy-run", durationMin: 45 }],
        status: "completed" as const,
      };
    });
    await db.insert(schema.DailyWorkout).values(workouts);

    const result = await makeCaller().coach.adherenceTrend({
      userId: TEST_USER_ID,
      days: 7,
    });

    expect(result.points).toHaveLength(7);
    expect(result.points).toEqual(
      workouts.map((workout) =>
        expect.objectContaining({
          date: workout.date,
          status: "completed",
          plannedDurationMin: 45,
          actualDurationMin: 45,
        }),
      ),
    );
    expect(result.summary.completedPct).toBe(100);
  });

  it("rules-first invariant produces deterministic output without LLM calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const result = await seedRecommendation();

      expect(result.recommendation).toMatchObject({
        action: expect.any(String),
        reason: expect.any(String),
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("userId enforcement rejects mutation input that differs from ctx.session.user.id", async () => {
    await expect(
      makeCaller(OTHER_USER_ID).coach.accept({
        userId: TEST_USER_ID,
        date: TEST_DATE,
        auditId: "00000000-0000-4000-8000-000000000001",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
