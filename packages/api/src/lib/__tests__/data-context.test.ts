import { describe, expect, it, vi } from "vitest";

import { buildDataContext, detectAggregateIntent } from "../data-context";

function makeDb() {
  return {
    query: {
      DailyMetric: {
        findMany: vi.fn(async () => [
          {
            date: "2026-03-24",
            hrv: null,
            sleepScore: null,
            totalSleepMinutes: null,
            stressScore: null,
            restingHr: null,
            bodyBatteryEnd: null,
            spo2: null,
            respirationRate: null,
            garminTrainingReadiness: null,
            garminTrainingLoad: null,
            garminTrainingStatus: null,
          },
        ]),
      },
      Activity: {
        findMany: vi.fn(async () => []),
      },
      Profile: {
        findFirst: vi.fn(async () => ({
          userId: "user-1",
          age: 42,
          sex: "male",
          vo2maxRunning: null,
        })),
      },
      ReadinessScore: {
        findFirst: vi.fn(async () => ({
          date: "2026-03-24",
          score: 29,
          zone: "LOW",
        })),
      },
      VO2maxEstimate: {
        findMany: vi.fn(async () => []),
      },
      JournalEntry: {
        findMany: vi.fn(async () => []),
      },
      Intervention: {
        findMany: vi.fn(async () => []),
      },
      AdvancedMetric: {
        findMany: vi.fn(async () => []),
      },
      AthleteBaseline: {
        findMany: vi.fn(async () => []),
      },
    },
  } as never;
}

function extractAvailabilityJson(context: string) {
  const match =
    /## Metric Availability JSON[\s\S]*?```json\n([\s\S]*?)\n```/.exec(context);
  if (!match?.[1]) throw new Error("Metric availability JSON not found");
  return JSON.parse(match[1]) as Record<string, unknown>;
}

describe("buildDataContext", () => {
  it("flags null metrics as unavailable and stamps readiness metadata", async () => {
    const context = await buildDataContext(makeDb(), "user-1");
    const availability = extractAvailabilityJson(context);

    expect(availability.as_of_date).toBe("2026-03-24");
    expect(availability.readiness_zone).toBe("LOW");
    expect(availability.readiness).toBe(29);
    expect(availability.readiness_status).toBe("available");

    expect(availability.hrv).toBeNull();
    expect(availability.hrv_status).toBe("unavailable");
    expect(availability.sleep_score).toBeNull();
    expect(availability.sleep_score_status).toBe("unavailable");
    expect(availability.total_sleep_minutes).toBeNull();
    expect(availability.total_sleep_minutes_status).toBe("unavailable");
    expect(availability.stress_score).toBeNull();
    expect(availability.stress_score_status).toBe("unavailable");
    expect(availability.ctl).toBeNull();
    expect(availability.ctl_status).toBe("unavailable");
    expect(availability.vo2max).toBeNull();
    expect(availability.vo2max_status).toBe("unavailable");
    expect(availability.garmin_training_status).toBe("unavailable");
    expect(availability.garmin_training_status_status).toBe("unavailable");
  });

  it("prettifies raw Garmin sport codes so LLM never sees variant suffixes", async () => {
    // makeDb() returns a fresh object literal per test, so mutating
    // `db.query.Activity.findMany` here does NOT leak into the other tests.
    // Each `it()` gets its own db fixture.
    const db = makeDb() as {
      query: {
        Activity: { findMany: ReturnType<typeof vi.fn> };
      };
    };
    // Override Activity.findMany to return activities with a representative
    // sample of raw Garmin variant suffix noise we strip (#164).
    db.query.Activity.findMany = vi.fn(async () => [
      {
        id: "act-1",
        userId: "user-1",
        garminActivityId: "12345",
        startedAt: new Date(),
        durationMinutes: 60,
        sportType: "Tennis_v2",
        distanceMeters: null,
        avgHr: 130,
        maxHr: 160,
        calories: 400,
        elevationGain: null,
        trimpScore: null,
        strainScore: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "act-2",
        userId: "user-1",
        garminActivityId: "12346",
        startedAt: new Date(),
        durationMinutes: 30,
        sportType: "running_legacy",
        distanceMeters: 5000,
        avgHr: 140,
        maxHr: 160,
        calories: 250,
        elevationGain: null,
        trimpScore: null,
        strainScore: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "act-3",
        userId: "user-1",
        garminActivityId: "12347",
        startedAt: new Date(),
        durationMinutes: 45,
        sportType: "cycling_alt2",
        distanceMeters: 20000,
        avgHr: 135,
        maxHr: 155,
        calories: 300,
        elevationGain: null,
        trimpScore: null,
        strainScore: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const context = await buildDataContext(db as never, "user-1");
    // No raw Garmin variant suffix should survive into the LLM-facing context.
    expect(context).not.toMatch(/_v\d+/i);
    // The human-readable label should still be present.
    expect(context).toContain("Tennis");
    expect(context).toContain("Running");
    expect(context).toContain("Cycling");
  });

  it("coachContext.vo2max matches the highest-priority estimate (garmin_official wins over uth_method)", async () => {
    const db = makeDb() as {
      query: {
        VO2maxEstimate: { findMany: ReturnType<typeof vi.fn> };
      };
    };
    db.query.VO2maxEstimate.findMany = vi.fn(async () => [
      {
        id: "vo2-1",
        userId: "user-1",
        date: "2026-03-24",
        value: 28.7,
        source: "uth_method",
        sport: "running",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "vo2-2",
        userId: "user-1",
        date: "2026-03-20",
        value: 32.2,
        source: "garmin_official",
        sport: "running",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const context = await buildDataContext(db as never, "user-1");
    const availability = extractAvailabilityJson(context);
    // garmin_official (priority 0) beats uth_method (priority 4)
    // even though uth_method has a more recent date.
    expect(availability.vo2max).toBe(32.2);
  });
});

describe("detectAggregateIntent", () => {
  it("returns aggregate=true for 'all my runs this year'", () => {
    const intent = detectAggregateIntent("analyse all my runs done this year");
    expect(intent.isAggregate).toBe(true);
    expect(intent.windowDays).toBe(365);
    expect(intent.activityLimit).toBeGreaterThanOrEqual(100);
  });

  it("returns aggregate=true for 'give me a report'", () => {
    expect(detectAggregateIntent("give me a report").isAggregate).toBe(true);
  });

  it("returns aggregate=true for YTD / lifetime / annual phrasings", () => {
    expect(detectAggregateIntent("ytd summary please").isAggregate).toBe(true);
    expect(detectAggregateIntent("lifetime totals").isAggregate).toBe(true);
    expect(detectAggregateIntent("annual breakdown").isAggregate).toBe(true);
    expect(detectAggregateIntent("year to date stats").isAggregate).toBe(true);
  });

  it("returns aggregate=true for 'last year' and 'last 6 months' phrasings", () => {
    expect(detectAggregateIntent("compare to last year").isAggregate).toBe(
      true,
    );
    expect(
      detectAggregateIntent("how did I train last 6 months?").isAggregate,
    ).toBe(true);
    expect(detectAggregateIntent("last nine months").isAggregate).toBe(true);
    expect(detectAggregateIntent("last 12 months running").isAggregate).toBe(
      true,
    );
  });

  it("returns aggregate=false for ordinary day-level questions", () => {
    expect(
      detectAggregateIntent("how did I sleep last night?").isAggregate,
    ).toBe(false);
    expect(
      detectAggregateIntent("am I ready to train today?").isAggregate,
    ).toBe(false);
    expect(detectAggregateIntent("").isAggregate).toBe(false);
  });

  it("defaults to a 14-day / 10-row window when no intent detected", () => {
    const intent = detectAggregateIntent("recovery tips");
    expect(intent.windowDays).toBe(14);
    expect(intent.activityLimit).toBe(10);
  });
});

describe("buildDataContext aggregate intent + YTD summary", () => {
  it("widens the Recent Activities heading when the user asks an aggregate question", async () => {
    const db = makeDb() as {
      query: { Activity: { findMany: ReturnType<typeof vi.fn> } };
    };
    db.query.Activity.findMany = vi.fn(async () => [
      {
        id: "a1",
        userId: "user-1",
        sportType: "running",
        startedAt: new Date("2026-04-01T08:00:00Z"),
        durationMinutes: 45,
        distanceMeters: 8000,
        avgHr: 150,
        strainScore: 12.4,
        trimpScore: 80,
        hrZoneMinutes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const context = await buildDataContext(db as never, "user-1", {
      message: "analyse all my runs done this year",
    });
    expect(context).toContain("Recent Activities (Last 365 Days");
    expect(context).toContain("Activity Summary (Year to Date");
  });

  it("uses the default 14-day heading when no aggregate intent", async () => {
    const db = makeDb() as {
      query: { Activity: { findMany: ReturnType<typeof vi.fn> } };
    };
    db.query.Activity.findMany = vi.fn(async () => [
      {
        id: "a1",
        userId: "user-1",
        sportType: "running",
        startedAt: new Date(),
        durationMinutes: 30,
        distanceMeters: 5000,
        avgHr: 140,
        strainScore: 8,
        trimpScore: 50,
        hrZoneMinutes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const context = await buildDataContext(db as never, "user-1", {
      message: "how am I doing today?",
    });
    expect(context).toContain("Recent Activities (Last 14 Days)");
  });

  it("emits a YTD summary grouped by sport with totals", async () => {
    const db = makeDb() as {
      query: { Activity: { findMany: ReturnType<typeof vi.fn> } };
    };
    const ytd = [
      {
        sportType: "running",
        startedAt: new Date(),
        durationMinutes: 30,
        distanceMeters: 5000,
        avgHr: null,
        strainScore: null,
        trimpScore: null,
        hrZoneMinutes: null,
      },
      {
        sportType: "running",
        startedAt: new Date(),
        durationMinutes: 45,
        distanceMeters: 8000,
        avgHr: null,
        strainScore: null,
        trimpScore: null,
        hrZoneMinutes: null,
      },
      {
        sportType: "cycling",
        startedAt: new Date(),
        durationMinutes: 60,
        distanceMeters: 20000,
        avgHr: null,
        strainScore: null,
        trimpScore: null,
        hrZoneMinutes: null,
      },
    ];
    db.query.Activity.findMany = vi.fn(async () => ytd);
    const context = await buildDataContext(db as never, "user-1");
    expect(context).toMatch(/## Activity Summary \(Year to Date,\s*\d{4}\)/);
    expect(context).toContain("Total: 3 activities");
    expect(context).toMatch(/Running:\s*2 sessions/);
    expect(context).toMatch(/Cycling:\s*1 sessions?/);
  });

  it("omits YTD summary when there are no activities at all", async () => {
    const context = await buildDataContext(makeDb(), "user-1");
    expect(context).not.toContain("Activity Summary (Year to Date");
  });
});
