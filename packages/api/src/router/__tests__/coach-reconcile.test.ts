// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReconcileResult } from "@acme/engine";

const mocks = vi.hoisted(() => {
  const auditReturning = vi.fn();
  const auditValues = vi.fn(() => ({ returning: auditReturning }));
  const auditInsert = vi.fn(() => ({ values: auditValues }));

  return {
    auditDb: { insert: auditInsert },
    auditInsert,
    auditValues,
    auditReturning,
    reconcilePlanVsActual: vi.fn(),
  };
});

vi.mock("@acme/db/client", () => ({
  db: mocks.auditDb,
}));

vi.mock("@acme/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@acme/engine")>();
  return {
    ...actual,
    reconcilePlanVsActual: mocks.reconcilePlanVsActual,
  };
});

const { appRouter } = await import("../../root");

const TEST_USER_ID = "coach-user-1";
const TEST_DATE = "2026-04-10";

function makeSession(userId = TEST_USER_ID) {
  const now = new Date();
  return {
    user: {
      id: userId,
      name: "Coach User",
      email: "coach@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: "test-session",
      userId,
      token: "test-token",
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt: now,
      updatedAt: now,
    },
  };
}

function makePlanned(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    userId: TEST_USER_ID,
    date: TEST_DATE,
    sportType: "running",
    workoutType: "tempo",
    title: "Tempo Run",
    targetDurationMin: 50,
    targetDurationMax: 55,
    targetHrZoneHigh: 4,
    targetStrainHigh: 12,
    status: "planned",
    ...overrides,
  };
}

function makeActivity(overrides: Record<string, unknown> = {}) {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    userId: TEST_USER_ID,
    sportType: "running",
    startedAt: new Date(`${TEST_DATE}T12:00:00Z`),
    durationMinutes: 50,
    avgHr: 150,
    maxHr: 176,
    ...overrides,
  };
}

function makeReconcile(
  overrides: Partial<ReconcileResult> = {},
): ReconcileResult {
  return {
    date: TEST_DATE,
    status: "completed",
    matchedActivityIds: ["10000000-0000-4000-8000-000000000001"],
    deviation: {
      durationMinDelta: 0,
      durationPctDelta: 0,
      intensityShift: 0,
      sportTypeMatch: true,
    },
    notes: ["matched by sportType+duration"],
    confidence: 0.94,
    ...overrides,
  };
}

function makeDb(
  args: {
    planned?: ReturnType<typeof makePlanned> | null;
    activities?: ReturnType<typeof makeActivity>[];
    audits?: unknown[];
  } = {},
) {
  const updateWhere = vi.fn(async () => undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  return {
    update,
    updateSet,
    updateWhere,
    query: {
      Profile: {
        findFirst: vi.fn(async () => ({
          userId: TEST_USER_ID,
          timezone: "UTC",
          maxHr: 176,
        })),
      },
      DailyWorkout: {
        findFirst: vi.fn(async () =>
          Object.hasOwn(args, "planned") ? args.planned : makePlanned(),
        ),
      },
      Activity: {
        findMany: vi.fn(async () => args.activities ?? [makeActivity()]),
      },
      RecommendationAudit: {
        findMany: vi.fn(async () => args.audits ?? []),
      },
    },
  };
}

function createCaller(db: ReturnType<typeof makeDb>, userId = TEST_USER_ID) {
  return appRouter.createCaller({
    authApi: null as never,
    session: makeSession(userId),
    db: db as never,
  });
}

function setup(args: Parameters<typeof makeDb>[0] = {}) {
  const db = makeDb(args);
  return { caller: createCaller(db), db };
}

function auditRow() {
  const calls = mocks.auditValues.mock.calls as unknown as Array<[unknown]>;
  return calls.at(-1)![0] as {
    kind: string;
    payload: {
      reconcile: ReconcileResult;
      plannedId: string | null;
      actualIds: string[];
    };
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function shiftIsoDay(isoDay: string, deltaDays: number) {
  const date = new Date(`${isoDay}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function makeAudit(
  date: string,
  status: ReconcileResult["status"],
  overrides: Record<string, unknown> = {},
) {
  const actualIds = status === "missed" ? [] : [`activity-${date}`];
  return {
    id: `audit-${date}`,
    userId: TEST_USER_ID,
    date,
    kind: "reconciliation",
    confidence: 0.9,
    relatedActivityIds: actualIds,
    payload: {
      reconcile: makeReconcile({ date, status, matchedActivityIds: actualIds }),
      plannedId: `planned-${date}`,
      actualIds,
      plannedDurationMin: 50,
      actualDurationMin: status === "missed" ? 0 : 50,
    },
    ...overrides,
  };
}

describe("coach reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditReturning.mockResolvedValue([{ id: "audit-1" }]);
    mocks.reconcilePlanVsActual.mockReturnValue(makeReconcile());
  });

  it("records completed reconciliation and updates DailyWorkout.status", async () => {
    const { caller, db } = setup();

    const result = await caller.coach.reconcile({
      userId: TEST_USER_ID,
      date: TEST_DATE,
    });

    expect(mocks.reconcilePlanVsActual).toHaveBeenCalledWith(
      expect.objectContaining({
        date: TEST_DATE,
        planned: expect.objectContaining({ durationMin: 50 }),
        actuals: [expect.objectContaining({ durationMin: 50 })],
      }),
    );
    expect(result.auditId).toBe("audit-1");
    expect(db.updateSet).toHaveBeenCalledWith({ status: "completed" });
    expect(auditRow().kind).toBe("reconciliation");
  });

  it("records missed reconciliation and updates DailyWorkout.status", async () => {
    mocks.reconcilePlanVsActual.mockReturnValue(
      makeReconcile({
        status: "missed",
        matchedActivityIds: [],
        confidence: 1,
      }),
    );
    const { caller, db } = setup({ activities: [] });

    await caller.coach.reconcile({ userId: TEST_USER_ID, date: TEST_DATE });

    expect(auditRow().kind).toBe("reconciliation");
    expect(db.updateSet).toHaveBeenCalledWith({ status: "missed" });
  });

  it("counts rest-day extras as completed adherence", async () => {
    mocks.reconcilePlanVsActual.mockReturnValue(
      makeReconcile({ status: "extra", confidence: 1 }),
    );
    const { caller, db } = setup({
      planned: makePlanned({ workoutType: "rest", targetDurationMin: 0 }),
    });

    await caller.coach.reconcile({ userId: TEST_USER_ID, date: TEST_DATE });

    expect(auditRow().kind).toBe("reconciliation");
    expect(db.updateSet).toHaveBeenCalledWith({ status: "extra" });
  });

  it("records no-plan activity as reconciliation without touching DailyWorkout", async () => {
    mocks.reconcilePlanVsActual.mockReturnValue(
      makeReconcile({ status: "no-plan", confidence: 1 }),
    );
    const { caller, db } = setup({ planned: null });

    await caller.coach.reconcile({ userId: TEST_USER_ID, date: TEST_DATE });

    expect(auditRow().kind).toBe("reconciliation");
    expect(auditRow().payload.plannedId).toBeNull();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("echoes engine confidence into the audit payload", async () => {
    mocks.reconcilePlanVsActual.mockReturnValue(
      makeReconcile({ confidence: 0.37 }),
    );
    const { caller } = setup();

    await caller.coach.reconcile({ userId: TEST_USER_ID, date: TEST_DATE });

    expect(auditRow().payload.reconcile.confidence).toBe(0.37);
  });

  it("rejects userId mismatch", async () => {
    const { caller } = setup();

    await expect(
      caller.coach.reconcile({ userId: "other-user", date: TEST_DATE }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("propagates audit failure before mutating workout status", async () => {
    mocks.auditReturning.mockRejectedValue(new Error("audit unavailable"));
    const { caller, db } = setup();

    await expect(
      caller.coach.reconcile({ userId: TEST_USER_ID, date: TEST_DATE }),
    ).rejects.toThrow("audit unavailable");

    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("coach adherenceTrend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-04-10T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns points and completed percentage for basic audits", async () => {
    const today = todayIso();
    const rows = [
      makeAudit(shiftIsoDay(today, -2), "completed"),
      makeAudit(shiftIsoDay(today, -1), "missed"),
      makeAudit(today, "partial"),
    ];
    const { caller } = setup({ audits: rows });

    const result = await caller.coach.adherenceTrend({
      userId: TEST_USER_ID,
      days: 3,
    });

    expect(result.points.map((point) => point.status)).toEqual([
      "completed",
      "missed",
      "partial",
    ]);
    expect(result.summary.completedPct).toBe(66.67);
  });

  it("computes current and longest streaks", async () => {
    const today = todayIso();
    const rows = Array.from({ length: 5 }, (_, index) =>
      makeAudit(shiftIsoDay(today, index - 4), "completed"),
    );
    const { caller } = setup({ audits: rows });

    const result = await caller.coach.adherenceTrend({
      userId: TEST_USER_ID,
      days: 5,
    });

    expect(result.summary.currentStreak).toBe(5);
    expect(result.summary.longestStreak).toBe(5);
  });

  it("ignores audit rows outside the requested days window", async () => {
    const today = todayIso();
    const rows = [
      makeAudit(shiftIsoDay(today, -10), "completed"),
      makeAudit(shiftIsoDay(today, -1), "missed"),
      makeAudit(today, "completed"),
    ];
    const { caller } = setup({ audits: rows });

    const result = await caller.coach.adherenceTrend({
      userId: TEST_USER_ID,
      days: 2,
    });

    expect(result.points.map((point) => point.date)).toEqual([
      shiftIsoDay(today, -1),
      today,
    ]);
  });
});
