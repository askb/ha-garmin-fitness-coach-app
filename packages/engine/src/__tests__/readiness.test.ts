import { describe, expect, it } from "vitest";

import type { Baselines, DailyMetricInput } from "../types";
import {
  calculateReadiness,
  getReadinessZone,
  getZoneColor,
  scoreHRV,
  scoreRestingHR,
  scoreSleepQuality,
  scoreSleepQuantity,
  scoreStressAndBattery,
  scoreTrainingLoad,
} from "../readiness";

// Helper to create a metric with defaults
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

// Using SD=0 triggers the ratio-based fallback path (same as original behavior)
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

// ---- Sleep Quantity ----
describe("scoreSleepQuantity", () => {
  it("returns 100 when sleep >= baseline", () => {
    expect(scoreSleepQuantity(420, 420, 0)).toBe(100);
    expect(scoreSleepQuantity(480, 420, 0)).toBe(100);
  });

  it("returns ~70-100 for 85-100% of baseline", () => {
    const score = scoreSleepQuantity(370, 420, 0); // ~88%
    expect(score).toBeGreaterThanOrEqual(70);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns ~40-70 for 70-85% of baseline", () => {
    const score = scoreSleepQuantity(320, 420, 0); // ~76%
    expect(score).toBeGreaterThanOrEqual(40);
    expect(score).toBeLessThanOrEqual(70);
  });

  it("returns low score for <70% of baseline", () => {
    const score = scoreSleepQuantity(250, 420, 0); // ~60%
    expect(score).toBeLessThan(40);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("returns 50 for null sleep data", () => {
    expect(scoreSleepQuantity(null, 420, 0)).toBe(50);
  });
});

// ---- Sleep Quality ----
describe("scoreSleepQuality", () => {
  it("uses Garmin sleep score when available", () => {
    const metric = makeMetric({ sleepScore: 85 });
    expect(scoreSleepQuality(metric)).toBe(85);
  });

  it("computes from sleep stages when no score", () => {
    const metric = makeMetric({
      sleepScore: null,
      totalSleepMinutes: 420,
      deepSleepMinutes: 90,
      remSleepMinutes: 100,
      awakeMinutes: 30,
    });
    const score = scoreSleepQuality(metric);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns 50 for no sleep data", () => {
    const metric = makeMetric({
      sleepScore: null,
      totalSleepMinutes: null,
    });
    expect(scoreSleepQuality(metric)).toBe(50);
  });
});

// ---- HRV ----
describe("scoreHRV", () => {
  it("returns 100 when HRV is 10%+ above baseline", () => {
    expect(scoreHRV(55, 45, 0)).toBe(100); // ~22% above
  });

  it("returns 80-100 when HRV is at or slightly above baseline", () => {
    const score = scoreHRV(47, 45, 0); // ~4% above
    expect(score).toBeGreaterThanOrEqual(80);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns 60-80 when HRV is slightly below baseline", () => {
    const score = scoreHRV(42, 45, 0); // ~7% below
    expect(score).toBeGreaterThanOrEqual(60);
    expect(score).toBeLessThan(80);
  });

  it("returns low score for HRV crash", () => {
    const score = scoreHRV(30, 45, 0); // ~33% below
    expect(score).toBeLessThan(30);
  });

  it("returns 50 for null HRV", () => {
    expect(scoreHRV(null, 45, 0)).toBe(50);
  });
});

// ---- Resting HR ----
describe("scoreRestingHR", () => {
  it("returns 100 when RHR is 3+ below baseline", () => {
    expect(scoreRestingHR(58, 62, 0)).toBe(100);
  });

  it("returns 80-100 when RHR is at baseline", () => {
    const score = scoreRestingHR(62, 62, 0);
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it("returns lower score when RHR is above baseline", () => {
    const score = scoreRestingHR(68, 62, 0); // +6
    expect(score).toBeLessThan(30);
  });

  it("returns 50 for null RHR", () => {
    expect(scoreRestingHR(null, 62, 0)).toBe(50);
  });
});

// ---- Training Load ----
describe("scoreTrainingLoad", () => {
  it("scores well with balanced ACWR (0.8-1.3)", () => {
    const strains = [10, 10, 10, 10, 10, 10, 10]; // ACWR = 1.0
    const score = scoreTrainingLoad(strains);
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it("penalizes high ACWR (>1.3)", () => {
    // Need 28 values: high recent, low chronic
    const strains = [
      18, 18, 18, 18, 18, 18, 18, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
      5, 5, 5, 5, 5, 5,
    ];
    const score = scoreTrainingLoad(strains);
    expect(score).toBeLessThan(70);
  });

  it("handles under-training (low ACWR)", () => {
    const strains = [3, 3, 3, 10, 10, 10, 10]; // low acute
    const score = scoreTrainingLoad(strains);
    expect(score).toBeGreaterThanOrEqual(60); // still ok
  });

  it("penalizes consecutive hard days", () => {
    const withConsecutive = [15, 15, 15, 10, 10, 10, 10]; // 3 consecutive hard
    const score = scoreTrainingLoad(withConsecutive);
    const normalStrains = [10, 10, 10, 10, 10, 10, 10];
    const normalScore = scoreTrainingLoad(normalStrains);
    expect(score).toBeLessThan(normalScore);
  });
});

// ---- Stress & Battery ----
describe("scoreStressAndBattery", () => {
  it("scores high with low stress and high battery", () => {
    const score = scoreStressAndBattery(20, 85); // low stress, high battery
    expect(score).toBeGreaterThan(70);
  });

  it("scores low with high stress and low battery", () => {
    const score = scoreStressAndBattery(80, 20);
    expect(score).toBeLessThan(30);
  });

  it("uses defaults (50) for null values", () => {
    const score = scoreStressAndBattery(null, null);
    expect(score).toBe(50);
  });
});

// ---- Zone Classification ----
describe("getReadinessZone", () => {
  it("classifies Prime (80-100)", () => {
    expect(getReadinessZone(80)).toBe("prime");
    expect(getReadinessZone(95)).toBe("prime");
    expect(getReadinessZone(100)).toBe("prime");
  });

  it("classifies High (60-79)", () => {
    expect(getReadinessZone(60)).toBe("high");
    expect(getReadinessZone(79)).toBe("high");
  });

  it("classifies Moderate (40-59)", () => {
    expect(getReadinessZone(40)).toBe("moderate");
    expect(getReadinessZone(59)).toBe("moderate");
  });

  it("classifies Low (20-39)", () => {
    expect(getReadinessZone(20)).toBe("low");
    expect(getReadinessZone(39)).toBe("low");
  });

  it("classifies Poor (0-19)", () => {
    expect(getReadinessZone(0)).toBe("poor");
    expect(getReadinessZone(19)).toBe("poor");
  });
});

describe("getZoneColor", () => {
  it("returns green for prime", () => {
    expect(getZoneColor("prime")).toBe("#22c55e");
  });
  it("returns red for poor", () => {
    expect(getZoneColor("poor")).toBe("#ef4444");
  });
});

// ---- Full Readiness Calculation ----
describe("calculateReadiness", () => {
  it("returns Prime for excellent metrics", () => {
    const result = calculateReadiness({
      todayMetrics: makeMetric({
        totalSleepMinutes: 480, // 8h
        sleepScore: 90,
        hrv: 55, // above baseline
        restingHr: 58, // below baseline
        stressScore: 15,
        bodyBatteryStart: 90,
      }),
      recentStrainScores: [10, 10, 10, 10, 10, 10, 10],
      baselines: BASELINE,
    });

    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.zone).toMatch(/prime|high/);
    expect(result.color).toBeTruthy();
    expect(result.explanation).toBeTruthy();
    expect(result.components.sleepQuantity).toBeGreaterThan(80);
  });

  it("returns Poor for terrible metrics", () => {
    const result = calculateReadiness({
      todayMetrics: makeMetric({
        totalSleepMinutes: 240, // 4h
        sleepScore: 20,
        hrv: 25, // way below baseline
        restingHr: 75, // way above baseline
        stressScore: 85,
        bodyBatteryStart: 15,
      }),
      recentStrainScores: [18, 18, 18, 5, 5, 5, 5],
      baselines: BASELINE,
    });

    expect(result.score).toBeLessThan(35);
    expect(result.zone).toMatch(/low|poor/);
  });

  it("handles missing optional data gracefully", () => {
    const result = calculateReadiness({
      todayMetrics: makeMetric({
        hrv: null,
        stressScore: null,
        bodyBatteryStart: null,
        sleepScore: null,
        deepSleepMinutes: null,
        remSleepMinutes: null,
      }),
      recentStrainScores: [8, 8, 8],
      baselines: BASELINE,
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.zone).toBeTruthy();
  });

  it("score is always clamped to 0-100", () => {
    // Even with extreme inputs
    const result = calculateReadiness({
      todayMetrics: makeMetric({
        totalSleepMinutes: 1000, // unrealistic
        hrv: 200,
        restingHr: 30,
        stressScore: 0,
        bodyBatteryStart: 100,
        sleepScore: 100,
      }),
      recentStrainScores: [0, 0, 0, 0, 0, 0, 0],
      baselines: BASELINE,
    });

    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
