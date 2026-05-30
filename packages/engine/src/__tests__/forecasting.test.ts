import { describe, expect, it } from "vitest";

import {
  buildScenarioLoads,
  findRaceReadinessWindow,
  linearForecast,
  projectPMC,
} from "../forecasting";

describe("buildScenarioLoads", () => {
  const recent = [50, 60, 55, 65, 50, 70, 60]; // avg = 58.57

  it("holds flat at the recent average for 'maintain'", () => {
    const loads = buildScenarioLoads(recent, 7, "maintain");
    expect(loads).toHaveLength(7);
    for (const l of loads) expect(l).toBeCloseTo(58.57, 1);
  });

  it("returns all zeros for 'rest'", () => {
    const loads = buildScenarioLoads(recent, 5, "rest");
    expect(loads).toEqual([0, 0, 0, 0, 0]);
  });

  it("ramps up week over week for 'rampUp'", () => {
    const loads = buildScenarioLoads(recent, 14, "rampUp");
    expect(loads[13]!).toBeGreaterThan(loads[0]!);
  });

  it("ramps down week over week for 'rampDown'", () => {
    const loads = buildScenarioLoads(recent, 14, "rampDown");
    expect(loads[13]!).toBeLessThan(loads[0]!);
  });

  it("handles empty history without throwing", () => {
    expect(buildScenarioLoads([], 3, "maintain")).toEqual([0, 0, 0]);
  });
});

describe("projectPMC", () => {
  // 60 days of steady moderate load.
  const history = Array.from({ length: 60 }, () => 60);

  it("returns one row per horizon day", () => {
    const fc = projectPMC(history, 14, "maintain");
    expect(fc.days).toHaveLength(14);
    expect(fc.days[0]!.dayOffset).toBe(1);
    expect(fc.days[13]!.dayOffset).toBe(14);
  });

  it("keeps TSB near zero when maintaining a steady load", () => {
    const fc = projectPMC(history, 21, "maintain");
    // CTL and ATL have both converged to ~60, so TSB stays small.
    expect(Math.abs(fc.days[20]!.tsb)).toBeLessThan(5);
  });

  it("drives TSB positive (fresh) under full rest", () => {
    const fc = projectPMC(history, 21, "rest");
    // ATL drops faster than CTL, so form (TSB = CTL - ATL) climbs.
    expect(fc.days[20]!.tsb).toBeGreaterThan(0);
    expect(fc.days[20]!.atl).toBeLessThan(fc.days[0]!.atl);
  });

  it("accepts an explicit future-load array", () => {
    const fc = projectPMC(history, 3, [100, 100, 100]);
    expect(fc.days).toHaveLength(3);
    expect(fc.days[0]!.assumedLoad).toBe(100);
  });

  it("does not throw on empty history", () => {
    const fc = projectPMC([], 5, "maintain");
    expect(fc.days).toHaveLength(5);
  });
});

describe("linearForecast", () => {
  it("returns null with fewer than 7 points", () => {
    const vals = Array.from({ length: 5 }, (_, i) => ({
      date: `2026-01-0${i + 1}`,
      value: i,
    }));
    expect(linearForecast(vals, 7)).toBeNull();
  });

  it("extrapolates a clean upward line", () => {
    // value = 50 + 0.5 * dayIndex
    const vals = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(2026, 0, 1 + i).toISOString().slice(0, 10),
      value: 50 + 0.5 * i,
    }));
    const fc = linearForecast(vals, 14);
    expect(fc).not.toBeNull();
    expect(fc!.slopePerWeek).toBeCloseTo(3.5, 1); // 0.5/day * 7
    expect(fc!.rSquared).toBeCloseTo(1, 2);
    expect(fc!.confidence).toBe("high");
    // Day 14 projection continues the line.
    const last = fc!.points[13]!;
    expect(last.value).toBeGreaterThan(vals[29]!.value);
    expect(last.lower).toBeLessThanOrEqual(last.value);
    expect(last.upper).toBeGreaterThanOrEqual(last.value);
  });

  it("widens the prediction band for noisy data", () => {
    const clean = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(2026, 0, 1 + i).toISOString().slice(0, 10),
      value: 50 + 0.5 * i,
    }));
    const noisy = clean.map((p, i) => ({
      ...p,
      value: p.value + (i % 2 === 0 ? 8 : -8),
    }));
    const cleanFc = linearForecast(clean, 7)!;
    const noisyFc = linearForecast(noisy, 7)!;
    const cleanWidth = cleanFc.points[0]!.upper - cleanFc.points[0]!.lower;
    const noisyWidth = noisyFc.points[0]!.upper - noisyFc.points[0]!.lower;
    expect(noisyWidth).toBeGreaterThan(cleanWidth);
  });
});

describe("findRaceReadinessWindow", () => {
  it("finds the first contiguous in-band window", () => {
    const history = Array.from({ length: 60 }, () => 70);
    const fc = projectPMC(history, 28, "rest");
    const window = findRaceReadinessWindow(fc.days);
    expect(window).not.toBeNull();
    expect(window!.startDayOffset).toBeGreaterThanOrEqual(1);
    expect(window!.endDayOffset).toBeGreaterThanOrEqual(window!.startDayOffset);
    expect(window!.peakTsb).toBeGreaterThanOrEqual(5);
  });

  it("returns null when TSB never reaches the band", () => {
    const history = Array.from({ length: 60 }, () => 60);
    const fc = projectPMC(history, 10, "maintain"); // TSB hovers ~0
    const window = findRaceReadinessWindow(fc.days, { min: 30, max: 50 });
    expect(window).toBeNull();
  });
});
