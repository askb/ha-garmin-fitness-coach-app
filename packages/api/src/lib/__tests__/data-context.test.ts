import { describe, expect, it, vi } from "vitest";

import { buildDataContext } from "../data-context";

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
});
