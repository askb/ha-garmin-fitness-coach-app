// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Recommendation } from "@acme/engine";

const mocks = vi.hoisted(() => {
  const auditReturning = vi.fn();
  const auditValues = vi.fn(() => ({ returning: auditReturning }));
  const auditInsert = vi.fn(() => ({ values: auditValues }));

  return {
    auditDb: { insert: auditInsert },
    auditInsert,
    auditValues,
    auditReturning,
    recommendDay: vi.fn(),
    frameRecommendationReason: vi.fn(),
  };
});

vi.mock("@acme/db/client", () => ({
  db: mocks.auditDb,
}));

vi.mock("@acme/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@acme/engine")>();
  return {
    ...actual,
    computeStrainScore: vi.fn((trimp: number) => trimp / 10),
    countConsecutiveHardDays: vi.fn(() => 1),
    recommendDay: mocks.recommendDay,
  };
});

vi.mock("../../lib/ai-framing", () => ({
  frameRecommendationReason: mocks.frameRecommendationReason,
}));

const { appRouter } = await import("../../root");

const TEST_USER_ID = "coach-user-1";
const TEST_DATE = "2026-04-10";

const engineRecommendation: Recommendation = {
  action: "workout",
  workoutType: "tempo",
  durationMin: 50,
  intensity: "hard",
  reason: "Plan day — no signals against your scheduled workout.",
  confidence: 0.92,
  rules: [
    {
      ruleId: "plan-honored-when-safe",
      fired: true,
      severity: "info",
      message: "Plan day — no signals against your scheduled workout.",
      inputs: { plannedToday: { workoutType: "tempo" } },
    },
  ],
  hardBlocks: [],
  raceProximityDays: null,
};

function makeSession() {
  const now = new Date();
  return {
    user: {
      id: TEST_USER_ID,
      name: "Coach User",
      email: "coach@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: "test-session",
      userId: TEST_USER_ID,
      token: "test-token",
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt: now,
      updatedAt: now,
    },
  };
}

function makeDb() {
  return {
    query: {
      Profile: {
        findFirst: vi.fn(async () => ({
          userId: TEST_USER_ID,
          timezone: "America/Los_Angeles",
          goals: [],
          weeklyDays: ["mon", "tue", "thu", "sat"],
        })),
      },
      ReadinessScore: {
        findFirst: vi.fn(async () => ({
          userId: TEST_USER_ID,
          date: TEST_DATE,
          score: 82,
          zone: "high",
          computedAt: new Date(`${TEST_DATE}T08:00:00Z`),
        })),
      },
      Activity: {
        findMany: vi.fn(async () => [
          {
            id: "activity-1",
            userId: TEST_USER_ID,
            startedAt: new Date(`${TEST_DATE}T12:00:00Z`),
            strainScore: 12,
            trimpScore: null,
            sportType: "running",
          },
        ]),
      },
      DailyWorkout: {
        findFirst: vi.fn(async () => ({
          id: "00000000-0000-4000-8000-000000000001",
          userId: TEST_USER_ID,
          date: TEST_DATE,
          workoutType: "tempo",
          targetDurationMin: 50,
          targetDurationMax: 55,
          targetHrZoneHigh: 4,
          targetStrainHigh: 12,
          status: "planned",
        })),
        findMany: vi.fn(async () => [
          {
            id: "00000000-0000-4000-8000-000000000001",
            userId: TEST_USER_ID,
            date: TEST_DATE,
            workoutType: "tempo",
            status: "planned",
          },
        ]),
      },
      WeeklyPlan: {
        findFirst: vi.fn(async () => ({
          id: "weekly-plan-1",
          userId: TEST_USER_ID,
          weekStart: "2026-04-06",
        })),
      },
      Intervention: {
        findMany: vi.fn(async () => [
          { userId: TEST_USER_ID, date: "2026-04-09", type: "massage" },
        ]),
      },
      AthleteBaseline: {
        findMany: vi.fn(async () => [
          {
            userId: TEST_USER_ID,
            metricName: "hrv",
            baselineValue: 60,
            baselineSD: 8,
            zScoreLatest: 0.4,
          },
        ]),
      },
      DailyMetric: {
        findFirst: vi.fn(async () => ({
          userId: TEST_USER_ID,
          date: TEST_DATE,
          sleepDebtMinutes: 0,
        })),
      },
      AdvancedMetric: {
        findFirst: vi.fn(async () => ({
          userId: TEST_USER_ID,
          date: TEST_DATE,
          acwr: 1.0,
          tsb: 5,
        })),
      },
    },
  };
}

function createCaller(db: ReturnType<typeof makeDb>) {
  return appRouter.createCaller({
    authApi: null as never,
    session: makeSession(),
    db: db as never,
  });
}

function setup() {
  const db = makeDb();
  const caller = createCaller(db);
  return { caller, db };
}

describe("coach router", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.recommendDay.mockReturnValue(engineRecommendation);
    mocks.frameRecommendationReason.mockResolvedValue(null);
    mocks.auditReturning.mockResolvedValue([{ id: "audit-1" }]);
  });

  it("returns a recommendation and records a full recommendation audit", async () => {
    const { caller } = setup();

    const result = await caller.coach.getDailyRecommendation({
      userId: TEST_USER_ID,
      date: TEST_DATE,
    });

    expect(mocks.recommendDay).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      recommendation: engineRecommendation,
      auditId: "audit-1",
    });

    expect(mocks.auditValues).toHaveBeenCalledTimes(1);
    const auditCalls = mocks.auditValues.mock.calls as unknown as Array<
      [unknown]
    >;
    const auditRow = auditCalls[0]![0] as {
      kind: string;
      payload: { recommendation: Recommendation; engineInput: unknown };
    };
    expect(auditRow.kind).toBe("recommendation");
    expect(auditRow.payload.recommendation.rules).toEqual(
      engineRecommendation.rules,
    );
    expect(auditRow.payload.engineInput).toEqual(
      expect.objectContaining({ date: TEST_DATE }),
    );
  });

  it("lets LLM framing change only reason and never structured fields", async () => {
    const { caller } = setup();
    mocks.frameRecommendationReason.mockResolvedValue(
      '{"action":"hard_intervals","reason":"fake"}',
    );

    const result = await caller.coach.getDailyRecommendation({
      userId: TEST_USER_ID,
      date: TEST_DATE,
    });

    expect(result.recommendation.reason).toBe(
      '{"action":"hard_intervals","reason":"fake"}',
    );
    expect(result.recommendation.action).toBe(engineRecommendation.action);
    expect(result.recommendation.hardBlocks).toEqual(
      engineRecommendation.hardBlocks,
    );
    expect(result.recommendation.rules).toEqual(engineRecommendation.rules);
    expect(result.recommendation.intensity).toBe(
      engineRecommendation.intensity,
    );
    expect(result.recommendation.workoutType).toBe(
      engineRecommendation.workoutType,
    );
  });

  it("falls back to the deterministic reason when LLM framing times out", async () => {
    vi.useFakeTimers();
    const { caller } = setup();
    mocks.frameRecommendationReason.mockReturnValue(
      new Promise(() => undefined),
    );

    const pending = caller.coach.getDailyRecommendation({
      userId: TEST_USER_ID,
      date: TEST_DATE,
    });
    await vi.advanceTimersByTimeAsync(5_500);
    const result = await pending;

    expect(result.recommendation.reason).toBe(engineRecommendation.reason);
  });

  it("falls back to the deterministic reason when LLM framing throws", async () => {
    const { caller } = setup();
    mocks.frameRecommendationReason.mockRejectedValue(new Error("LLM failed"));

    const result = await caller.coach.getDailyRecommendation({
      userId: TEST_USER_ID,
      date: TEST_DATE,
    });

    expect(result.recommendation.reason).toBe(engineRecommendation.reason);
  });

  it("throws instead of returning an unaudited recommendation", async () => {
    const { caller } = setup();
    mocks.auditReturning.mockRejectedValue(new Error("audit unavailable"));

    await expect(
      caller.coach.getDailyRecommendation({
        userId: TEST_USER_ID,
        date: TEST_DATE,
      }),
    ).rejects.toThrow("audit unavailable");

    expect(mocks.frameRecommendationReason).not.toHaveBeenCalled();
  });

  it("does not import RecommendationAudit directly in the coach router", async () => {
    const source = await readFile(
      new URL("../coach.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toMatch(
      /import\s+.*RecommendationAudit.*from\s+["']@acme\/db/s,
    );
    expect(source).toContain("recordRecommendationAudit");
  });
});
