// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const auditReturning = vi.fn();
  const auditValues = vi.fn(() => ({ returning: auditReturning }));
  const auditInsert = vi.fn(() => ({ values: auditValues }));

  return {
    auditDb: { insert: auditInsert },
    auditInsert,
    auditValues,
    auditReturning,
  };
});

vi.mock("@acme/db/client", () => ({
  db: mocks.auditDb,
}));

const { appRouter } = await import("../../root");

const TEST_USER_ID = "coach-user-1";
const OTHER_USER_ID = "coach-user-2";
const TEST_DATE = "2026-04-10";
const DEFER_TO_DATE = "2026-04-11";
const RECOMMENDATION_AUDIT_ID = "00000000-0000-4000-8000-000000000101";
const WRITTEN_AUDIT_ID = "00000000-0000-4000-8000-000000000202";

type ActionName = "accept" | "skip" | "defer";

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

function makeRecommendationAudit(overrides: Record<string, unknown> = {}) {
  return {
    id: RECOMMENDATION_AUDIT_ID,
    userId: TEST_USER_ID,
    date: TEST_DATE,
    kind: "recommendation",
    action: "workout",
    intensity: "moderate",
    workoutType: "easy",
    durationMin: 45,
    confidence: 0.86,
    hardBlocks: [],
    ruleTrace: [],
    llmExplanation: null,
    relatedActivityIds: null,
    relatedWorkoutId: null,
    payload: {},
    createdAt: new Date(`${TEST_DATE}T08:00:00Z`),
    ...overrides,
  };
}

function makeDb(
  referencedAudit: Record<string, unknown> | null = makeRecommendationAudit(),
) {
  return {
    query: {
      RecommendationAudit: {
        findFirst: vi.fn(async () => referencedAudit),
      },
      DailyWorkout: {
        insert: vi.fn(),
        update: vi.fn(),
      },
      WeeklyPlan: {
        insert: vi.fn(),
        update: vi.fn(),
      },
    },
    insert: vi.fn(),
    update: vi.fn(),
  };
}

function createCaller(db: ReturnType<typeof makeDb>) {
  return appRouter.createCaller({
    authApi: null as never,
    session: makeSession(),
    db: db as never,
  });
}

function setup(referencedAudit?: Record<string, unknown> | null) {
  const db = makeDb(
    referencedAudit === undefined ? makeRecommendationAudit() : referencedAudit,
  );
  const caller = createCaller(db);
  return { caller, db };
}

function inputFor(action: ActionName, overrides: Record<string, unknown> = {}) {
  const base = {
    userId: TEST_USER_ID,
    date: TEST_DATE,
    auditId: RECOMMENDATION_AUDIT_ID,
    note: "coach action note",
    ...overrides,
  };
  if (action === "defer") {
    return { ...base, deferToDate: DEFER_TO_DATE, ...overrides };
  }
  return base;
}

type BaseActionInput = {
  userId: string;
  date: string;
  auditId: string;
  note?: string;
};

type DeferActionInput = BaseActionInput & { deferToDate: string };

async function callAction(
  caller: ReturnType<typeof createCaller>,
  action: ActionName,
  overrides: Record<string, unknown> = {},
) {
  if (action === "accept") {
    return caller.coach.accept(inputFor(action, overrides) as BaseActionInput);
  }
  if (action === "skip") {
    return caller.coach.skip(inputFor(action, overrides) as BaseActionInput);
  }
  return caller.coach.defer(inputFor(action, overrides) as DeferActionInput);
}

function writtenAuditRow() {
  const calls = mocks.auditValues.mock.calls as unknown as Array<
    [Record<string, unknown>]
  >;
  return calls.at(-1)?.[0];
}

function expectAuditOnly(db: ReturnType<typeof makeDb>) {
  expect(db.insert).not.toHaveBeenCalled();
  expect(db.update).not.toHaveBeenCalled();
  expect(db.query.DailyWorkout.insert).not.toHaveBeenCalled();
  expect(db.query.DailyWorkout.update).not.toHaveBeenCalled();
  expect(db.query.WeeklyPlan.insert).not.toHaveBeenCalled();
  expect(db.query.WeeklyPlan.update).not.toHaveBeenCalled();
}

describe("coach recommendation action mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditReturning.mockResolvedValue([{ id: WRITTEN_AUDIT_ID }]);
  });

  it("accept writes an intervention_accept audit row", async () => {
    const { caller, db } = setup();

    await expect(callAction(caller, "accept")).resolves.toEqual({
      auditId: WRITTEN_AUDIT_ID,
    });

    expect(mocks.auditValues).toHaveBeenCalledTimes(1);
    expect(writtenAuditRow()).toMatchObject({
      userId: TEST_USER_ID,
      date: TEST_DATE,
      kind: "intervention_accept",
      payload: { referencedAuditId: RECOMMENDATION_AUDIT_ID },
    });
    expectAuditOnly(db);
  });

  it("skip writes an intervention_skip audit row", async () => {
    const { caller, db } = setup();

    await expect(callAction(caller, "skip")).resolves.toEqual({
      auditId: WRITTEN_AUDIT_ID,
    });

    expect(writtenAuditRow()).toMatchObject({
      kind: "intervention_skip",
      payload: {
        referencedAuditId: RECOMMENDATION_AUDIT_ID,
        note: "coach action note",
      },
    });
    expectAuditOnly(db);
  });

  it("defer writes an intervention_defer audit row for a future date", async () => {
    const { caller, db } = setup();

    await expect(callAction(caller, "defer")).resolves.toEqual({
      auditId: WRITTEN_AUDIT_ID,
    });

    expect(writtenAuditRow()).toMatchObject({
      kind: "intervention_defer",
      payload: {
        referencedAuditId: RECOMMENDATION_AUDIT_ID,
        deferToDate: DEFER_TO_DATE,
      },
    });
    expectAuditOnly(db);
  });

  it("rejects same-day defers with BAD_REQUEST", async () => {
    const { caller } = setup();

    await expect(
      callAction(caller, "defer", { deferToDate: TEST_DATE }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.auditValues).not.toHaveBeenCalled();
  });

  it("rejects past defers with BAD_REQUEST", async () => {
    const { caller } = setup();

    await expect(
      callAction(caller, "defer", { deferToDate: "2026-04-09" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.auditValues).not.toHaveBeenCalled();
  });

  it("rejects all actions for a different input user with FORBIDDEN", async () => {
    for (const action of ["accept", "skip", "defer"] as const) {
      const { caller } = setup();
      await expect(
        callAction(caller, action, { userId: OTHER_USER_ID }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(mocks.auditValues).not.toHaveBeenCalled();
  });

  it("rejects actions when the referenced audit is not found", async () => {
    const { caller } = setup(null);

    await expect(callAction(caller, "accept")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mocks.auditValues).not.toHaveBeenCalled();
  });

  it("rejects actions when the referenced audit belongs to another user", async () => {
    const { caller } = setup(
      makeRecommendationAudit({ userId: OTHER_USER_ID }),
    );

    await expect(callAction(caller, "skip")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.auditValues).not.toHaveBeenCalled();
  });

  it("rejects actions when the referenced audit is not a recommendation", async () => {
    const { caller } = setup(
      makeRecommendationAudit({ kind: "intervention_skip" }),
    );

    await expect(callAction(caller, "accept")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mocks.auditValues).not.toHaveBeenCalled();
  });

  it("rejects actions when the referenced audit date mismatches", async () => {
    const { caller } = setup(makeRecommendationAudit({ date: "2026-04-09" }));

    await expect(callAction(caller, "accept")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mocks.auditValues).not.toHaveBeenCalled();
  });

  it("keeps accept, skip, and defer audit-only", async () => {
    for (const action of ["accept", "skip", "defer"] as const) {
      const { caller, db } = setup();
      await callAction(caller, action);
      expectAuditOnly(db);
    }
    expect(mocks.auditValues).toHaveBeenCalledTimes(3);
  });
});
