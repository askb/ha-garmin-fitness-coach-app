import { describe, expect, it } from "vitest";

import type { DailyMetricInput } from "../types";
import {
  computeBaselines,
  computeEMA,
  getPopulationDefaults,
} from "../baselines";

describe("computeEMA", () => {
  it("returns single value for single element", () => {
    expect(computeEMA([42])).toBe(42);
  });

  it("returns 0 for empty array", () => {
    expect(computeEMA([])).toBe(0);
  });

  it("weights recent values more heavily", () => {
    // With 30-day period and only 6 values, EMA starts at first value
    // and slowly moves toward recent values. The result should be
    // between the first value and the mean.
    const values = [40, 42, 44, 46, 48, 50];
    const ema = computeEMA(values);
    expect(ema).toBeGreaterThan(40); // above starting value
    expect(ema).toBeLessThanOrEqual(50); // at most the last value
  });
});

describe("getPopulationDefaults", () => {
  it("returns male defaults (no age adjustment)", () => {
    const d = getPopulationDefaults("male");
    expect(d.hrv).toBe(45);
    expect(d.restingHr).toBe(62);
    expect(d.hrvSD).toBe(12);
    expect(d.daysOfData).toBe(0);
  });

  it("returns female defaults", () => {
    const d = getPopulationDefaults("female");
    expect(d.hrv).toBe(50);
    expect(d.restingHr).toBe(65);
  });

  it("returns 'other' defaults for unknown sex", () => {
    const d = getPopulationDefaults(null);
    expect(d.hrv).toBe(47);
  });

  it("adjusts HRV for age", () => {
    const young = getPopulationDefaults("male", 25);
    const old = getPopulationDefaults("male", 55);
    expect(young.hrv).toBeGreaterThan(old.hrv);
  });
});

describe("computeBaselines", () => {
  const makeMetrics = (
    count: number,
    overrides: Partial<DailyMetricInput> = {},
  ): DailyMetricInput[] => {
    return Array.from({ length: count }, (_, i) => ({
      date: `2026-03-${String(i + 1).padStart(2, "0")}`,
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
    }));
  };

  it("returns population defaults for empty metrics", () => {
    const baselines = computeBaselines([], "male");
    expect(baselines.hrv).toBe(45);
    expect(baselines.restingHr).toBe(62);
    expect(baselines.hrvSD).toBe(12);
    expect(baselines.daysOfData).toBe(0);
  });

  it("blends personal data with defaults for few days", () => {
    const metrics = makeMetrics(7, { hrv: 55, restingHr: 58 });
    const baselines = computeBaselines(metrics, "male");
    // With 7 days, personal weight = 7/30 ≈ 0.23
    // Should be closer to defaults than personal
    expect(baselines.hrv).toBeGreaterThan(45); // above male default
    expect(baselines.hrv).toBeLessThan(55); // below personal
  });

  it("uses mostly personal data with 30+ days", () => {
    const metrics = makeMetrics(30, { hrv: 55, restingHr: 58 });
    const baselines = computeBaselines(metrics, "male");
    // With 30 days, personal weight = 1.0
    expect(baselines.hrv).toBeCloseTo(55, 0);
  });

  it("handles metrics with null values", () => {
    const metrics = makeMetrics(10, { hrv: null, restingHr: null });
    const baselines = computeBaselines(metrics, "male");
    // Should use defaults when personal values are null
    expect(baselines.hrv).toBe(45);
    expect(baselines.restingHr).toBe(62);
  });
});
