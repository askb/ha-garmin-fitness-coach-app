import { beforeEach, describe, expect, it, vi } from "vitest";

import { appRouter } from "../../root";

const TEST_USER_ID = "test-user-analytics";

/** Build a minimal tRPC session object for the test user. */
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

/** Return a date string N days before today (matches the router's getDateString helper). */
function dateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0]!;
}

/** Build a mock Drizzle-shaped db object with vi.fn() stubs for every call
 *  made by the analytics router. */
function makeMockDb() {
  return {
    query: {
      Activity: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      VO2maxEstimate: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      DailyMetric: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      ReadinessScore: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      Profile: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
  };
}

/** Create a tRPC caller that uses a fully-mocked db. */
function createCaller(mockDb: ReturnType<typeof makeMockDb>) {
  return appRouter.createCaller({
    authApi: null as never,
    session: makeSession(),
    db: mockDb as never,
  });
}

// ---------------------------------------------------------------------------
// Sample fixture data
// ---------------------------------------------------------------------------

/** Produce N daily metric rows with varied but realistic values. */
function makeDailyMetrics(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `metric-${i}`,
    userId: TEST_USER_ID,
    date: dateString(i),
    hrv: 50 + i,
    restingHr: 55 - i * 0.5,
    totalSleepMinutes: 420 + i * 5,
    sleepScore: 70 + i,
    stressScore: 30 - i,
    sleepDebtMinutes: i * 2,
    // other columns analytics router doesn't read — safe to omit
  }));
}

/** Produce N readiness score rows aligned with makeDailyMetrics dates. */
function makeReadinessScores(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `rs-${i}`,
    userId: TEST_USER_ID,
    date: dateString(i),
    score: 65 + i,
  }));
}

/** Produce N activity rows with explicit strain scores. */
function makeActivities(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `act-${i}`,
    userId: TEST_USER_ID,
    startedAt: new Date(Date.now() - i * 86_400_000),
    strainScore: 8 + (i % 5),
    trimpScore: null,
    aerobicTE: 3,
    anaerobicTE: 1,
    sportType: "running",
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("analytics router", () => {
  let mockDb: ReturnType<typeof makeMockDb>;
  let caller: ReturnType<typeof createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeMockDb();
    caller = createCaller(mockDb);
  });

  // -------------------------------------------------------------------------
  // getVO2maxHistory
  // -------------------------------------------------------------------------
  describe("getVO2maxHistory", () => {
    it("returns estimates sorted by date descending with duplicates removed", async () => {
      // Two entries on the same date — only the first (lexically earlier source)
      // should survive deduplication.
      const records = [
        {
          id: "v1",
          userId: TEST_USER_ID,
          date: dateString(5),
          source: "running_pace_hr",
          value: 52,
          sport: "running",
        },
        {
          id: "v2",
          userId: TEST_USER_ID,
          date: dateString(10),
          source: "running_pace_hr",
          value: 50,
          sport: "running",
        },
        {
          id: "v3",
          userId: TEST_USER_ID,
          date: dateString(10),
          source: "uth_ratio",
          value: 51,
          sport: "running",
        },
      ];
      mockDb.query.VO2maxEstimate.findMany.mockResolvedValue(records);

      const result = await caller.analytics.getVO2maxHistory({ days: 30 });

      // Should deduplicate: date dateString(10) appears twice → only first kept
      expect(result.estimates).toHaveLength(2);

      // Most recent date must be first
      const [first, second] = result.estimates;
      expect(first!.date).toBe(dateString(5));
      expect(second!.date).toBe(dateString(10));

      // Duplicate removed — only running_pace_hr kept for the shared date
      expect(second!.source).toBe("running_pace_hr");

      // trend field must be present
      expect(typeof result.trend).toBe("object");
    });

    it("returns empty estimates and trend when no VO2max records exist", async () => {
      mockDb.query.VO2maxEstimate.findMany.mockResolvedValue([]);

      const result = await caller.analytics.getVO2maxHistory({ days: 90 });

      expect(result.estimates).toHaveLength(0);
    });

    it("returns separate garminEstimates and uthEstimates arrays", async () => {
      const records = [
        {
          id: "v1",
          userId: TEST_USER_ID,
          date: dateString(3),
          source: "garmin_official",
          value: 50,
          sport: "running",
        },
        {
          id: "v2",
          userId: TEST_USER_ID,
          date: dateString(5),
          source: "uth_ratio",
          value: 48,
          sport: "running",
        },
        {
          id: "v3",
          userId: TEST_USER_ID,
          date: dateString(7),
          source: "garmin_official",
          value: 49,
          sport: "running",
        },
        {
          id: "v4",
          userId: TEST_USER_ID,
          date: dateString(7),
          source: "uth_ratio",
          value: 53,
          sport: "running",
        },
        {
          id: "v5",
          userId: TEST_USER_ID,
          date: dateString(10),
          source: "running_pace_hr",
          value: 47,
          sport: "running",
        },
      ];
      mockDb.query.VO2maxEstimate.findMany.mockResolvedValue(records);

      const result = await caller.analytics.getVO2maxHistory({ days: 30 });

      // garminEstimates should only contain garmin_official source
      expect(result.garminEstimates).toHaveLength(2);
      expect(
        result.garminEstimates.every((e) => e.source === "garmin_official"),
      ).toBe(true);
      // Sorted descending by date
      expect(result.garminEstimates[0]!.date).toBe(dateString(3));
      expect(result.garminEstimates[1]!.date).toBe(dateString(7));

      // uthEstimates should only contain uth_ratio / uth_method
      expect(result.uthEstimates).toHaveLength(2);
      expect(
        result.uthEstimates.every(
          (e) => e.source === "uth_ratio" || e.source === "uth_method",
        ),
      ).toBe(true);
      expect(result.uthEstimates[0]!.date).toBe(dateString(5));
      expect(result.uthEstimates[1]!.date).toBe(dateString(7));

      // running_pace_hr should not appear in either filtered array
      expect(
        result.garminEstimates.some((e) => e.source === "running_pace_hr"),
      ).toBe(false);
      expect(
        result.uthEstimates.some((e) => e.source === "running_pace_hr"),
      ).toBe(false);
    });

    it("returns empty garminEstimates and uthEstimates when no matching sources", async () => {
      const records = [
        {
          id: "v1",
          userId: TEST_USER_ID,
          date: dateString(3),
          source: "running_pace_hr",
          value: 50,
          sport: "running",
        },
      ];
      mockDb.query.VO2maxEstimate.findMany.mockResolvedValue(records);

      const result = await caller.analytics.getVO2maxHistory({ days: 30 });

      expect(result.garminEstimates).toHaveLength(0);
      expect(result.uthEstimates).toHaveLength(0);
      expect(result.estimates).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // getTrainingStatus
  // -------------------------------------------------------------------------
  describe("getTrainingStatus", () => {
    it("returns a valid training status with explanation and recommendation", async () => {
      // VO2max improving over last 28 days (trend > 0.5)
      mockDb.query.VO2maxEstimate.findMany.mockResolvedValue([
        {
          id: "v1",
          userId: TEST_USER_ID,
          date: dateString(2),
          value: 52,
          source: "running_pace_hr",
          sport: "running",
        },
        {
          id: "v2",
          userId: TEST_USER_ID,
          date: dateString(20),
          value: 50,
          source: "running_pace_hr",
          sport: "running",
        },
      ]);
      mockDb.query.Activity.findMany.mockResolvedValue(makeActivities(14));

      const result = await caller.analytics.getTrainingStatus();

      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("explanation");
      expect(result).toHaveProperty("recommendation");
      expect(result).toHaveProperty("vo2maxTrend");

      const validStatuses = [
        "productive",
        "maintaining",
        "detraining",
        "overreaching",
        "peaking",
        "recovery",
        "unproductive",
      ];
      expect(validStatuses).toContain(result.status);
    });

    it("computes acute and chronic training loads from activity strain scores", async () => {
      mockDb.query.VO2maxEstimate.findMany.mockResolvedValue([]);
      // 20 activities with a consistent strain of 10
      const activities = makeActivities(20).map((a) => ({
        ...a,
        strainScore: 10,
      }));
      mockDb.query.Activity.findMany.mockResolvedValue(activities);

      const result = await caller.analytics.getTrainingStatus();

      // With uniform strain the model should classify a status
      expect(result.status).toBeDefined();
      // ACWR field is used internally — the result is a TrainingStatusResult
      expect(typeof result.vo2maxTrend).toBe("number");
    });
  });

  // -------------------------------------------------------------------------
  // getCorrelations
  // -------------------------------------------------------------------------
  describe("getCorrelations", () => {
    it("returns an array (possibly empty) of correlation pairs", async () => {
      mockDb.query.DailyMetric.findMany.mockResolvedValue([]);
      mockDb.query.ReadinessScore.findMany.mockResolvedValue([]);
      mockDb.query.Activity.findMany.mockResolvedValue([]);

      const result = await caller.analytics.getCorrelations({ period: "90d" });

      expect(Array.isArray(result)).toBe(true);
    });

    it("returns non-null correlation pairs when sufficient paired data exists", async () => {
      // Need ≥ 7 paired records per metric pair for Pearson r to be computed
      const n = 10;
      mockDb.query.DailyMetric.findMany.mockResolvedValue(makeDailyMetrics(n));
      mockDb.query.ReadinessScore.findMany.mockResolvedValue(
        makeReadinessScores(n),
      );
      mockDb.query.Activity.findMany.mockResolvedValue(makeActivities(n));

      const result = await caller.analytics.getCorrelations({ period: "90d" });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      // Each correlation pair must include the required fields
      for (const pair of result) {
        expect(pair).toHaveProperty("metricA");
        expect(pair).toHaveProperty("metricB");
        expect(pair).toHaveProperty("rValue");
        expect(pair).toHaveProperty("pValue");
        expect(pair).toHaveProperty("sampleSize");
        expect(pair).toHaveProperty("direction");
        expect(pair).toHaveProperty("strength");
        expect(pair).toHaveProperty("insight");
        // Pearson r must be in [-1, 1]
        expect(pair.rValue).toBeGreaterThanOrEqual(-1);
        expect(pair.rValue).toBeLessThanOrEqual(1);
      }
    });
  });

  // -------------------------------------------------------------------------
  // getRacePredictions
  // -------------------------------------------------------------------------
  describe("getRacePredictions", () => {
    it("returns null when no VO2max estimate exists", async () => {
      mockDb.query.VO2maxEstimate.findMany.mockResolvedValue([]);

      const result = await caller.analytics.getRacePredictions();

      expect(result).toBeNull();
    });

    it("returns four race predictions using the VDOT / Riegel formula", async () => {
      mockDb.query.VO2maxEstimate.findMany.mockResolvedValue([
        {
          id: "vo2-1",
          userId: TEST_USER_ID,
          date: dateString(1),
          value: 50,
          source: "running_pace_hr",
          sport: "running",
        },
      ]);

      const result = await caller.analytics.getRacePredictions();

      expect(result).not.toBeNull();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(4);

      const predictions = result!;
      const distances = predictions.map((r) => r.distance);
      expect(distances).toContain("5K");
      expect(distances).toContain("10K");
      expect(distances).toContain("half_marathon");
      expect(distances).toContain("marathon");

      for (const prediction of predictions) {
        expect(prediction.predictedSeconds).toBeGreaterThan(0);
        expect(typeof prediction.predictedFormatted).toBe("string");
        expect(prediction.vo2maxUsed).toBe(50);
        expect(prediction.method).toBe("vdot");
      }
    });

    it("predicts longer times for longer race distances (Riegel ordering)", async () => {
      mockDb.query.VO2maxEstimate.findMany.mockResolvedValue([
        {
          id: "vo2-1",
          userId: TEST_USER_ID,
          date: dateString(1),
          value: 55,
          source: "running_pace_hr",
          sport: "running",
        },
      ]);

      const result = await caller.analytics.getRacePredictions();
      const byDistance = (name: string) =>
        result!.find((r) => r.distance === name)!.predictedSeconds;

      expect(byDistance("5K")).toBeLessThan(byDistance("10K"));
      expect(byDistance("10K")).toBeLessThan(byDistance("half_marathon"));
      expect(byDistance("half_marathon")).toBeLessThan(byDistance("marathon"));
    });
  });

  // -------------------------------------------------------------------------
  // getTrainingLoads
  // -------------------------------------------------------------------------
  describe("getTrainingLoads", () => {
    it("returns zeroed load metrics when there are no activities", async () => {
      mockDb.query.Activity.findMany.mockResolvedValue([]);

      const result = await caller.analytics.getTrainingLoads();

      expect(result).toHaveProperty("ctl", 0);
      expect(result).toHaveProperty("atl", 0);
      expect(result).toHaveProperty("tsb", 0);
      expect(result).toHaveProperty("acwr");
      expect(result).toHaveProperty("acwrEwma");
      expect(result).toHaveProperty("loadFocus");
      expect(result).toHaveProperty("rampRate");
    });

    it("returns 7-day rolling load aggregations (ctl, atl, tsb, acwr)", async () => {
      mockDb.query.Activity.findMany.mockResolvedValue(makeActivities(14));

      const result = await caller.analytics.getTrainingLoads();

      // All numeric fields must be present
      expect(typeof result.ctl).toBe("number");
      expect(typeof result.atl).toBe("number");
      expect(typeof result.tsb).toBe("number");
      expect(typeof result.acwr).toBe("number");
      expect(typeof result.acwrEwma).toBe("number");
      expect(typeof result.rampRate).toBe("number");

      // tsb = ctl - atl
      expect(result.tsb).toBeCloseTo(result.ctl - result.atl, 1);

      // With nonzero activities, loads must be positive
      expect(result.ctl).toBeGreaterThan(0);
      expect(result.atl).toBeGreaterThan(0);

      // loadFocus must be one of the valid classifications
      expect(["aerobic", "anaerobic", "mixed"]).toContain(result.loadFocus);
    });

    // ---------------------------------------------------------------------
    // Regression: production "Invalid time value" crash (v0.16.15 / v0.2.8)
    // ---------------------------------------------------------------------
    // `analytics.getTrainingLoads` and `getTrainingStatus` were returning
    // HTTP 500 from a `RangeError: Invalid time value` thrown deep inside
    // `aggregateDailyLoads` → `shiftIsoDay` → `new Date().toISOString()`.
    // Root cause was the HA addon's Alpine `nodejs=~22` shipping a
    // minimal ICU build, which made `Intl.DateTimeFormat('en-CA').format()`
    // fall back to en-US `MM/DD/YYYY`. These integration tests pin every
    // contributing failure mode end-to-end so neither endpoint can ever
    // regress to throwing on the same inputs.

    it("does not throw when an activity has an invalid startedAt", async () => {
      const bad = [
        ...makeActivities(3),
        {
          id: "act-bad",
          userId: TEST_USER_ID,
          startedAt: new Date("not-a-date"), // NaN time
          strainScore: 10,
          trimpScore: null,
          aerobicTE: 3,
          anaerobicTE: 1,
          sportType: "running",
        },
      ];
      mockDb.query.Activity.findMany.mockResolvedValue(bad);

      // The whole point: this must NOT throw RangeError.
      await expect(caller.analytics.getTrainingLoads()).resolves.toBeDefined();
    });

    it("never includes invalid `computedAt` in the response payload", async () => {
      // The superjson serializer threw on `new Date(NaN).toISOString()`
      // when `computedAt` was a `Date` object. Router now returns ISO-8601
      // strings only — verify the contract holds (must contain `T`, end
      // with `Z`, and be a finite Date).
      mockDb.query.Activity.findMany.mockResolvedValue(makeActivities(7));

      const result = await caller.analytics.getTrainingLoads();
      const r = result as unknown as { computedAt?: unknown };

      if (r.computedAt !== undefined) {
        expect(typeof r.computedAt).toBe("string");
        const s = r.computedAt as string;
        // Reject locale-formatted dates like `05/15/2026` — must be ISO-8601.
        expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
        expect(Number.isFinite(new Date(s).getTime())).toBe(true);
      }
    });

    it("returns a response containing only primitives + plain objects (superjson-safe)", async () => {
      // The whole crash was triggered by superjson trying to serialize
      // an invalid Date. Pin the shape: no Date instances at the boundary.
      mockDb.query.Activity.findMany.mockResolvedValue(makeActivities(7));

      const result = await caller.analytics.getTrainingLoads();

      // JSON-roundtrip must succeed without throwing.
      expect(() => JSON.stringify(result)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Regression: getTrainingStatus production crash
  // -------------------------------------------------------------------------
  describe("getTrainingStatus regression coverage", () => {
    it("does not throw when activities contain invalid startedAt", async () => {
      mockDb.query.VO2maxEstimate.findMany.mockResolvedValue([]);
      const bad = [
        ...makeActivities(5),
        {
          id: "act-bad-1",
          userId: TEST_USER_ID,
          startedAt: new Date(NaN),
          strainScore: 12,
          trimpScore: null,
          aerobicTE: 4,
          anaerobicTE: 1,
          sportType: "running",
        },
      ];
      mockDb.query.Activity.findMany.mockResolvedValue(bad);

      await expect(caller.analytics.getTrainingStatus()).resolves.toBeDefined();
    });

    it("returns a JSON-stringifiable response (no raw Date instances)", async () => {
      mockDb.query.VO2maxEstimate.findMany.mockResolvedValue([]);
      mockDb.query.Activity.findMany.mockResolvedValue(makeActivities(14));

      const result = await caller.analytics.getTrainingStatus();

      expect(() => JSON.stringify(result)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // getRecoveryTime
  // -------------------------------------------------------------------------
  describe("getRecoveryTime", () => {
    it("returns a recovery estimate with hoursUntilRecovered and factors", async () => {
      const today = dateString(0);

      mockDb.query.ReadinessScore.findFirst.mockResolvedValue({
        id: "rs-today",
        userId: TEST_USER_ID,
        date: today,
        score: 60,
      });
      mockDb.query.Activity.findFirst.mockResolvedValue({
        id: "act-latest",
        userId: TEST_USER_ID,
        startedAt: new Date(),
        strainScore: 12,
        trimpScore: null,
      });
      mockDb.query.Profile.findFirst.mockResolvedValue({
        id: "profile-1",
        userId: TEST_USER_ID,
        age: 35,
      });
      mockDb.query.DailyMetric.findMany.mockResolvedValue(makeDailyMetrics(7));

      const result = await caller.analytics.getRecoveryTime();

      expect(result).toHaveProperty("hoursUntilRecovered");
      expect(result).toHaveProperty("factors");
      expect(typeof result.hoursUntilRecovered).toBe("number");
      expect(result.hoursUntilRecovered).toBeGreaterThan(0);
      expect(Array.isArray(result.factors)).toBe(true);
      expect(result.factors.length).toBeGreaterThan(0);
    });

    it("returns higher recovery hours for higher session strain", async () => {
      const today = dateString(0);
      const baseReadiness = {
        id: "rs",
        userId: TEST_USER_ID,
        date: today,
        score: 70,
      };
      const baseProfile = { id: "p", userId: TEST_USER_ID, age: 30 };
      const baseMetrics = makeDailyMetrics(7).map((m) => ({
        ...m,
        sleepDebtMinutes: 0,
      }));

      // Low strain activity
      mockDb.query.ReadinessScore.findFirst.mockResolvedValue(baseReadiness);
      mockDb.query.Profile.findFirst.mockResolvedValue(baseProfile);
      mockDb.query.DailyMetric.findMany.mockResolvedValue(baseMetrics);
      mockDb.query.Activity.findFirst.mockResolvedValue({
        id: "easy",
        userId: TEST_USER_ID,
        startedAt: new Date(),
        strainScore: 3,
        trimpScore: null,
      });

      const lowStrainResult = await caller.analytics.getRecoveryTime();

      // High strain activity — reset mocks
      vi.clearAllMocks();
      mockDb = makeMockDb();
      caller = createCaller(mockDb);

      mockDb.query.ReadinessScore.findFirst.mockResolvedValue(baseReadiness);
      mockDb.query.Profile.findFirst.mockResolvedValue(baseProfile);
      mockDb.query.DailyMetric.findMany.mockResolvedValue(baseMetrics);
      mockDb.query.Activity.findFirst.mockResolvedValue({
        id: "hard",
        userId: TEST_USER_ID,
        startedAt: new Date(),
        strainScore: 18,
        trimpScore: null,
      });

      const highStrainResult = await caller.analytics.getRecoveryTime();

      expect(highStrainResult.hoursUntilRecovered).toBeGreaterThan(
        lowStrainResult.hoursUntilRecovered,
      );
    });

    it("applies age modifier — older athletes need more recovery", async () => {
      const today = dateString(0);
      const baseActivity = {
        id: "act",
        userId: TEST_USER_ID,
        startedAt: new Date(),
        strainScore: 12,
        trimpScore: null,
      };
      const baseReadiness = {
        id: "rs",
        userId: TEST_USER_ID,
        date: today,
        score: 65,
      };
      const baseMetrics = makeDailyMetrics(7).map((m) => ({
        ...m,
        sleepDebtMinutes: 0,
      }));

      // Young athlete
      mockDb.query.Activity.findFirst.mockResolvedValue(baseActivity);
      mockDb.query.ReadinessScore.findFirst.mockResolvedValue(baseReadiness);
      mockDb.query.Profile.findFirst.mockResolvedValue({
        id: "p1",
        userId: TEST_USER_ID,
        age: 25,
      });
      mockDb.query.DailyMetric.findMany.mockResolvedValue(baseMetrics);

      const youngResult = await caller.analytics.getRecoveryTime();

      vi.clearAllMocks();
      mockDb = makeMockDb();
      caller = createCaller(mockDb);

      // Older athlete
      mockDb.query.Activity.findFirst.mockResolvedValue(baseActivity);
      mockDb.query.ReadinessScore.findFirst.mockResolvedValue(baseReadiness);
      mockDb.query.Profile.findFirst.mockResolvedValue({
        id: "p2",
        userId: TEST_USER_ID,
        age: 55,
      });
      mockDb.query.DailyMetric.findMany.mockResolvedValue(baseMetrics);

      const olderResult = await caller.analytics.getRecoveryTime();

      expect(olderResult.hoursUntilRecovered).toBeGreaterThanOrEqual(
        youngResult.hoursUntilRecovered,
      );
    });
  });
});
