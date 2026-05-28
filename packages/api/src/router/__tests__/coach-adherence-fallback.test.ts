// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

import { appRouter } from "../../root";

const TEST_USER_ID = "adherence-user";

function makeSession() {
  const now = new Date("2026-05-03T12:00:00Z");
  return {
    user: {
      id: TEST_USER_ID,
      name: "Adherence User",
      email: "adherence@example.test",
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

describe("coach adherence fallback", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("prefers audit rows over workout and activity fallbacks", async () => {
    vi.setSystemTime(new Date("2026-05-03T12:00:00Z"));
    const db = makeDb({
      auditRows: [
        {
          date: "2026-05-03",
          kind: "workout_complete",
          payload: { actualDurationMin: 42, actualIds: ["audit-activity"] },
          confidence: 0.8,
          relatedActivityIds: ["audit-activity"],
        },
      ],
      workoutRows: [
        { date: "2026-05-03", status: "missed", targetDurationMin: 30 },
      ],
      activityRows: [
        {
          id: "activity-1",
          userId: TEST_USER_ID,
          startedAt: new Date("2026-05-03T01:00:00Z"),
          durationMinutes: 60,
        },
      ],
    });

    const result = await createCaller(db).coach.adherenceTrend({
      userId: TEST_USER_ID,
      days: 1,
    });

    expect(result.source).toBe("audit");
    expect(result.points[0]).toMatchObject({
      status: "completed",
      actualIds: ["audit-activity"],
    });
    expect(db.query.DailyWorkout.findMany).not.toHaveBeenCalled();
    expect(db.query.Activity.findMany).not.toHaveBeenCalled();
  });

  it("uses workout fallback before activity fallback", async () => {
    vi.setSystemTime(new Date("2026-05-03T12:00:00Z"));
    const db = makeDb({
      workoutRows: [
        { date: "2026-05-03", status: "completed", targetDurationMin: 45 },
      ],
      activityRows: [
        {
          id: "activity-1",
          userId: TEST_USER_ID,
          startedAt: new Date("2026-05-03T01:00:00Z"),
          durationMinutes: 60,
        },
      ],
    });

    const result = await createCaller(db).coach.adherenceTrend({
      userId: TEST_USER_ID,
      days: 1,
    });

    expect(result.source).toBe("workout");
    expect(result.points[0]).toMatchObject({
      status: "completed",
      plannedDurationMin: 45,
      actualDurationMin: 45,
    });
    expect(db.query.Activity.findMany).not.toHaveBeenCalled();
  });

  it("falls back to timezone-local Garmin activity days", async () => {
    vi.setSystemTime(new Date("2026-05-03T12:00:00Z"));
    const db = makeDb({
      activityRows: [
        {
          id: "activity-1",
          userId: TEST_USER_ID,
          startedAt: new Date("2026-05-02T15:30:00Z"),
          durationMinutes: 31.4,
        },
        {
          id: "activity-2",
          userId: TEST_USER_ID,
          startedAt: new Date("2026-05-02T22:00:00Z"),
          durationMinutes: 20,
        },
      ],
    });

    const result = await createCaller(db).coach.adherenceTrend({
      userId: TEST_USER_ID,
      days: 2,
    });

    expect(result.source).toBe("activity");
    expect(result.points).toEqual([
      {
        date: "2026-05-02",
        status: "no-plan",
        plannedDurationMin: null,
        actualDurationMin: 0,
        confidence: 0,
        actualIds: [],
      },
      {
        date: "2026-05-03",
        status: "completed",
        plannedDurationMin: null,
        actualDurationMin: 51,
        confidence: 0,
        actualIds: ["activity-1", "activity-2"],
      },
    ]);
  });

  it("excludes no-plan days from adherence percentages", async () => {
    vi.setSystemTime(new Date("2026-05-03T12:00:00Z"));
    const db = makeDb({
      workoutRows: [
        { date: "2026-05-01", status: "completed", targetDurationMin: 45 },
        { date: "2026-05-03", status: "missed", targetDurationMin: 45 },
      ],
    });

    const result = await createCaller(db).coach.adherenceTrend({
      userId: TEST_USER_ID,
      days: 3,
    });

    expect(result.points.map((point) => point.status)).toEqual([
      "completed",
      "no-plan",
      "missed",
    ]);
    expect(result.summary.completedPct).toBe(50);
    expect(result.summary.missedPct).toBe(50);
  });
});
