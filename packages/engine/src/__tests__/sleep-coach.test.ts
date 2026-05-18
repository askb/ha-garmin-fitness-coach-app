import { describe, expect, it } from "vitest";

import type { DailyMetricInput } from "../types";
import { calculateSleepDebt } from "../sleep-coach";

function metric(totalSleepMinutes: number | null): DailyMetricInput {
  return {
    date: "2026-01-01",
    sleepScore: null,
    totalSleepMinutes,
    deepSleepMinutes: null,
    remSleepMinutes: null,
    lightSleepMinutes: null,
    awakeMinutes: null,
    hrv: null,
    restingHr: null,
    maxHr: null,
    stressScore: null,
    bodyBatteryStart: null,
    bodyBatteryEnd: null,
    steps: null,
    calories: null,
    garminTrainingReadiness: null,
    garminTrainingLoad: null,
    respirationRate: null,
    spo2: null,
    skinTemp: null,
    sleepDebtMinutes: null,
  } as DailyMetricInput;
}

describe("calculateSleepDebt", () => {
  it("returns zero when every night meets the target", () => {
    const metrics = Array.from({ length: 7 }, () => metric(480));
    expect(calculateSleepDebt(metrics, 480)).toBe(0);
  });

  it("weights recent shortfalls more than older ones (issue #128)", () => {
    // 60-minute deficit every single night for a week. The naive
    // 7-day sum would be 420 min (7h); EW-decay should land ~120 min.
    const metrics = Array.from({ length: 7 }, () => metric(420));
    const debt = calculateSleepDebt(metrics, 480);
    expect(debt).toBeGreaterThanOrEqual(100);
    expect(debt).toBeLessThanOrEqual(140);
  });

  it("never reproduces the 1047-minute regression", () => {
    // The regression scenario: user is 150 minutes short every night.
    // The bug summed to ~1047 minutes; the fix must stay well below it.
    const metrics = Array.from({ length: 7 }, () => metric(330));
    const debt = calculateSleepDebt(metrics, 480);
    expect(debt).toBeLessThan(500);
  });

  it("today counts roughly double yesterday", () => {
    const todayOnly = [
      metric(380),
      ...Array.from({ length: 6 }, () => metric(480)),
    ];
    const yesterdayOnly = [
      metric(480),
      metric(380),
      ...Array.from({ length: 5 }, () => metric(480)),
    ];
    expect(calculateSleepDebt(todayOnly, 480)).toBeGreaterThan(
      calculateSleepDebt(yesterdayOnly, 480),
    );
    // Today's deficit ≈ 2× yesterday's contribution under 0.5^i decay.
    expect(calculateSleepDebt(todayOnly, 480)).toBe(100);
    expect(calculateSleepDebt(yesterdayOnly, 480)).toBe(50);
  });

  it("ignores null sleep data", () => {
    const metrics = [metric(null), metric(360), metric(null)];
    // i=1 deficit of 120 min × 0.5 = 60 min.
    expect(calculateSleepDebt(metrics, 480)).toBe(60);
  });
});
