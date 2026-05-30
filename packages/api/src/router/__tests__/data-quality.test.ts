import { beforeEach, describe, expect, it, vi } from "vitest";

import { appRouter } from "../../root";

const TEST_USER_ID = "test-user-dq";

function makeSession(userId = TEST_USER_ID) {
  const now = new Date();
  return {
    user: {
      id: userId,
      name: "Test User",
      email: "test@local",
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

function dateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0]!;
}

/**
 * Mock the drizzle `select().from().where()` chain. Each call to `.select()`
 * shifts the next result array off the queue. getRawVsComputed issues four
 * selects in order: dailyRows, readinessRows, vo2Rows, advRows.
 */
function makeMockDb(queue: unknown[][]) {
  const q = [...queue];
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(q.shift() ?? [])),
      })),
    })),
  };
}

function createCaller(mockDb: ReturnType<typeof makeMockDb>) {
  return appRouter.createCaller({
    authApi: null as never,
    session: makeSession(),
    db: mockDb as never,
  });
}

describe("dataQuality.getRawVsComputed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pairs Garmin-native readiness with computed score and flags divergence", async () => {
    const d0 = dateString(1);
    const d1 = dateString(2);
    const caller = createCaller(
      makeMockDb([
        // dailyRows (garmin native readiness)
        [
          { date: d0, garminReadiness: 80 },
          { date: d1, garminReadiness: 50 },
        ],
        // readinessRows (engine computed)
        [
          { date: d0, score: 81 }, // ~1% -> match
          { date: d1, score: 70 }, // +40% -> diverged
        ],
        // vo2Rows
        [],
        // advRows
        [],
      ]),
    );

    const res = await caller.dataQuality.getRawVsComputed({ days: 30 });
    expect(res.readiness).toHaveLength(2);
    const byDate = Object.fromEntries(res.readiness.map((r) => [r.date, r]));
    expect(byDate[d0]!.status).toBe("match");
    expect(byDate[d1]!.status).toBe("diverged");
    expect(res.summary.comparedPairs).toBe(2);
    expect(res.summary.diverged).toBe(1);
  });

  it("pairs Garmin VO2max with effective VO2max", async () => {
    const d0 = dateString(1);
    const caller = createCaller(
      makeMockDb([
        [], // dailyRows
        [], // readinessRows
        [{ date: d0, value: 52 }], // vo2Rows (garmin_official)
        [{ date: d0, effectiveVo2max: 52.3 }], // advRows
      ]),
    );

    const res = await caller.dataQuality.getRawVsComputed();
    expect(res.vo2max).toHaveLength(1);
    expect(res.vo2max[0]!.status).toBe("match");
    expect(res.summary.agreementPct).toBe(100);
  });

  it("skips dates without a matching counterpart", async () => {
    const caller = createCaller(
      makeMockDb([
        [{ date: dateString(1), garminReadiness: 70 }],
        [{ date: dateString(2), score: 60 }], // different date -> no pair
        [],
        [],
      ]),
    );
    const res = await caller.dataQuality.getRawVsComputed();
    expect(res.readiness).toHaveLength(0);
    expect(res.summary.comparedPairs).toBe(0);
    expect(res.summary.agreementPct).toBeNull();
  });
});
