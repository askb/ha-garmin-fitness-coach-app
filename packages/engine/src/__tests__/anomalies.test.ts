import { describe, expect, it } from "vitest";

import type { Baselines, DailyMetricInput } from "../types";
import { detectAnomalies } from "../anomalies";

const BASELINE: Baselines = {
  hrv: 45,
  hrvSD: 0,
  restingHr: 62,
  restingHrSD: 0,
  sleep: 420,
  sleepSD: 0,
  dailyStrainCapacity: 12,
  daysOfData: 30,
};

function makeMetric(
  overrides: Partial<DailyMetricInput> = {},
): DailyMetricInput {
  return {
    date: "2026-03-15",
    sleepScore: null,
    totalSleepMinutes: 420,
    deepSleepMinutes: 90,
    remSleepMinutes: 100,
    lightSleepMinutes: 200,
    awakeMinutes: 30,
    hrv: 48,
    restingHr: 60,
    maxHr: 180,
    stressScore: 30,
    bodyBatteryStart: 75,
    bodyBatteryEnd: 40,
    steps: 8000,
    calories: 2200,
    garminTrainingReadiness: null,
    garminTrainingLoad: null,
    respirationRate: null,
    spo2: null,
    skinTemp: null,
    intensityMinutes: null,
    floorsClimbed: null,
    bodyBatteryHigh: null,
    bodyBatteryLow: null,
    hrvOvernight: null,
    sleepStartTime: null,
    sleepEndTime: null,
    sleepNeedMinutes: null,
    sleepDebtMinutes: null,
    ...overrides,
  };
}

describe("detectAnomalies", () => {
  it("returns empty array for normal metrics", () => {
    const metrics = [makeMetric(), makeMetric(), makeMetric()];
    const alerts = detectAnomalies(metrics, BASELINE, [10, 10, 10, 10, 10]);
    expect(alerts).toHaveLength(0);
  });

  it("detects HRV crash (>25% below for 2+ days)", () => {
    const metrics = [
      makeMetric({ hrv: 30 }), // 33% below 45
      makeMetric({ hrv: 28 }),
      makeMetric({ hrv: 48 }),
    ];
    const alerts = detectAnomalies(metrics, BASELINE, [10, 10, 10]);
    const hrvAlert = alerts.find((a) => a.type === "hrv_crash");
    expect(hrvAlert).toBeDefined();
    expect(hrvAlert!.severity).toBe("warning");
  });

  it("flags critical HRV crash for 3+ days", () => {
    const metrics = [
      makeMetric({ hrv: 30 }),
      makeMetric({ hrv: 28 }),
      makeMetric({ hrv: 25 }),
    ];
    const alerts = detectAnomalies(metrics, BASELINE, [10, 10, 10]);
    const hrvAlert = alerts.find((a) => a.type === "hrv_crash");
    expect(hrvAlert!.severity).toBe("critical");
  });

  it("detects RHR spike (>5 bpm above for 2+ days)", () => {
    const metrics = [
      makeMetric({ restingHr: 70 }), // +8 above 62
      makeMetric({ restingHr: 69 }),
      makeMetric({ restingHr: 62 }),
    ];
    const alerts = detectAnomalies(metrics, BASELINE, [10, 10, 10]);
    expect(alerts.find((a) => a.type === "rhr_spike")).toBeDefined();
  });

  it("detects sleep deficit (<6h for 3+ nights)", () => {
    const metrics = [
      makeMetric({ totalSleepMinutes: 300 }),
      makeMetric({ totalSleepMinutes: 280 }),
      makeMetric({ totalSleepMinutes: 320 }),
    ];
    const alerts = detectAnomalies(metrics, BASELINE, [10, 10, 10]);
    expect(alerts.find((a) => a.type === "sleep_deficit")).toBeDefined();
  });

  it("detects overreaching (ACWR > 1.5)", () => {
    const metrics = [makeMetric(), makeMetric(), makeMetric()];
    // Need 7+ strain scores for ACWR calculation (7-day acute / 28-day chronic)
    const strains = [
      20, 20, 20, 20, 20, 20, 20, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
      5, 5, 5, 5, 5, 5,
    ];
    const alerts = detectAnomalies(metrics, BASELINE, strains);
    expect(alerts.find((a) => a.type === "overreaching")).toBeDefined();
  });

  it("does not flag overreaching with balanced load", () => {
    const metrics = [makeMetric(), makeMetric(), makeMetric()];
    const strains = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10];
    const alerts = detectAnomalies(metrics, BASELINE, strains);
    expect(alerts.find((a) => a.type === "overreaching")).toBeUndefined();
  });
});
