// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

import { appRouter } from "../../root";

const TEST_USER_ID = "coach-adherence-user";

function makeSession() {
  const now = new Date("2026-05-03T12:00:00Z");
  return {
    user: {
      id: TEST_USER_ID,
      name: "Coach Adherence User",
      email: "coach-adherence@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: "test-session",
      userId: TEST_USER_ID,
      token: "test-token",
      expiresAt: new Date("2026-05-04T12:00:00Z"),
      createdAt: now,
      updatedAt: now,
    },
  };
}

function createCaller(db: unknown) {
  return appRouter.createCaller({
    authApi: null as never,
    session: makeSession(),
    db: db as never,
  });
}

function makeDb(args: {
  auditRows?: unknown[];
  workoutRows?: unknown[];
  activityRows?: unknown[];
}) {
  return {
    query: {
      Profile: {
        findFirst: vi.fn(async () => ({
          userId: TEST_USER_ID,
          timezone: "Australia/Brisbane",
        })),
      },
      RecommendationAudit: {
        findMany: vi.fn(async () => args.auditRows ?? []),
      },
      DailyWorkout: {
        findMany: vi.fn(async () => args.workoutRows ?? []),
      },
      Activity: {
        findMany: vi.fn(async () => args.activityRows ?? []),
      },
    },
  };
}

describe("coach adherence cascade", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("falls back to Garmin activity when workout rows are all planless", async () => {
    vi.setSystemTime(new Date("2026-05-03T12:00:00Z"));
    const db = makeDb({
      workoutRows: [
        {
          date: "2026-05-01",
          status: null,
          weeklyPlanId: null,
          structure: null,
        },
        {
          date: "2026-05-02",
          status: "no-plan",
          weeklyPlanId: null,
          structure: [],
        },
        { date: "2026-05-03", status: "", weeklyPlanId: null, structure: null },
      ],
      activityRows: [
        {
          id: "activity-1",
          userId: TEST_USER_ID,
          startedAt: new Date("2026-05-01T02:00:00Z"),
          durationMinutes: 40,
        },
        {
          id: "activity-2",
          userId: TEST_USER_ID,
          startedAt: new Date("2026-05-03T03:00:00Z"),
          durationMinutes: 30,
        },
      ],
    });

    const result = await createCaller(db).coach.adherenceTrend({
      userId: TEST_USER_ID,
      days: 3,
    });

    expect(result.source).toBe("activity");
    expect(result).not.toHaveProperty("mixedSources");
    expect(result.points.map((point) => point.status)).toEqual([
      "completed",
      "no-plan",
      "completed",
    ]);
    expect(result.summary.completedPct).toBe(100);
  });

  it("overlays Garmin activity onto planless days when the window mixes planned and no-plan workouts", async () => {
    vi.setSystemTime(new Date("2026-05-03T12:00:00Z"));
    const db = makeDb({
      workoutRows: [
        {
          date: "2026-05-01",
          status: "completed",
          targetDurationMin: 45,
          weeklyPlanId: "plan-1",
          structure: [{ step: "warmup" }],
        },
        {
          date: "2026-05-02",
          status: "no-plan",
          weeklyPlanId: null,
          structure: [],
        },
        {
          date: "2026-05-03",
          status: "missed",
          targetDurationMin: 30,
          weeklyPlanId: "plan-1",
          structure: [{ step: "run" }],
        },
      ],
      activityRows: [
        {
          id: "activity-2",
          userId: TEST_USER_ID,
          startedAt: new Date("2026-05-02T02:30:00Z"),
          durationMinutes: 32,
        },
      ],
    });

    const result = await createCaller(db).coach.adherenceTrend({
      userId: TEST_USER_ID,
      days: 3,
    });

    expect(result.source).toBe("workout");
    expect(result.mixedSources).toBe(true);
    expect(result.points).toEqual([
      expect.objectContaining({
        date: "2026-05-01",
        status: "completed",
        plannedDurationMin: 45,
      }),
      expect.objectContaining({
        date: "2026-05-02",
        status: "completed",
        plannedDurationMin: null,
        actualDurationMin: 32,
        actualIds: ["activity-2"],
      }),
      expect.objectContaining({
        date: "2026-05-03",
        status: "missed",
        plannedDurationMin: 30,
      }),
    ]);
    expect(result.summary.completedPct).toBe(66.67);
    expect(result.summary.missedPct).toBe(33.33);
  });

  it("keeps pure plan windows on the workout path without mixedSources", async () => {
    vi.setSystemTime(new Date("2026-05-03T12:00:00Z"));
    const db = makeDb({
      workoutRows: [
        {
          date: "2026-05-02",
          status: "completed",
          targetDurationMin: 45,
          weeklyPlanId: "plan-1",
          structure: [{ step: "warmup" }],
        },
        {
          date: "2026-05-03",
          status: "missed",
          targetDurationMin: 30,
          weeklyPlanId: "plan-1",
          structure: [{ step: "run" }],
        },
      ],
      activityRows: [
        {
          id: "activity-1",
          userId: TEST_USER_ID,
          startedAt: new Date("2026-05-03T01:00:00Z"),
          durationMinutes: 50,
        },
      ],
    });

    const result = await createCaller(db).coach.adherenceTrend({
      userId: TEST_USER_ID,
      days: 2,
    });

    expect(result.source).toBe("workout");
    expect(result).not.toHaveProperty("mixedSources");
    expect(result.points.map((point) => point.status)).toEqual([
      "completed",
      "missed",
    ]);
  });

  it("overlays activities on planless fallback days in a mixed 14-day window", async () => {
    vi.setSystemTime(new Date("2026-05-28T21:42:00Z"));
    const windowDates = [
      "2026-05-15",
      "2026-05-16",
      "2026-05-17",
      "2026-05-18",
      "2026-05-19",
      "2026-05-20",
      "2026-05-21",
      "2026-05-22",
      "2026-05-23",
      "2026-05-24",
      "2026-05-25",
      "2026-05-26",
      "2026-05-27",
      "2026-05-28",
    ];
    const workoutRows = windowDates.map((date) =>
      date === "2026-05-21"
        ? {
            date,
            status: "completed",
            targetDurationMin: 45,
            weeklyPlanId: "plan-1",
            structure: [{ step: "run" }],
          }
        : {
            date,
            status: "planned",
            weeklyPlanId: "plan-1",
            structure: [{ step: "rest" }],
          },
    );
    const db = makeDb({
      workoutRows,
      activityRows: [
        {
          id: "activity-26",
          userId: TEST_USER_ID,
          startedAt: new Date("2026-05-26T05:30:00Z"),
          durationMinutes: 35,
        },
        {
          id: "activity-27",
          userId: TEST_USER_ID,
          startedAt: new Date("2026-05-27T05:30:00Z"),
          durationMinutes: 22,
        },
        {
          id: "activity-28",
          userId: TEST_USER_ID,
          startedAt: new Date("2026-05-28T05:30:00Z"),
          durationMinutes: 41,
        },
      ],
    });

    const result = await createCaller(db).coach.adherenceTrend({
      userId: TEST_USER_ID,
      days: 14,
    });

    const byDate = new Map(result.points.map((point) => [point.date, point]));

    expect(result.source).toBe("workout");
    expect(result.mixedSources).toBe(true);
    expect(byDate.get("2026-05-21")).toMatchObject({
      status: "completed",
      plannedDurationMin: 45,
    });
    expect(byDate.get("2026-05-26")).toMatchObject({
      status: "completed",
      plannedDurationMin: null,
      actualIds: ["activity-26"],
    });
    expect(byDate.get("2026-05-27")).toMatchObject({
      status: "completed",
      plannedDurationMin: null,
      actualIds: ["activity-27"],
    });
    expect(byDate.get("2026-05-28")).toMatchObject({
      status: "completed",
      plannedDurationMin: null,
      actualIds: ["activity-28"],
    });
    expect(byDate.get("2026-05-20")).toMatchObject({
      status: "no-plan",
      actualIds: [],
    });
  });
});
