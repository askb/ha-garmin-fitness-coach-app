/**
 * Athlete accuracy tests — 25 physiologically-validated cases.
 *
 * Tests validate the PMC (Performance Management Chart) computation logic:
 * CTL / ATL / TSB / ACWR against known ground-truth values, and HRV
 * baseline z-scores against expected statistical properties.
 *
 * All assertions use realistic tolerances:
 *   - Load values: toBeCloseTo(expected, 0) — within 0.5 TSS points
 *   - Range checks: toBeGreaterThan / toBeLessThan
 *   - Boolean conditions: toBe(true)
 *
 * References:
 *   Banister EW et al. Aust J Sci Med Sport. 1975;7:57-61.  (CTL/ATL)
 *   Hulin BT et al. Br J Sports Med. 2016;50(4):231-236.    (ACWR)
 *   Buchheit M. IJSPP. 2014;9:883-895.                      (HRV z-scores)
 */
import { describe, it, expect } from "@jest/globals";
import {
  computeTrainingLoads,
  computeACWR,
  computeBaselines,
  computeZScore,
  calculateSleepDebt,
} from "@acme/engine";

import {
  athleteAData,
  athleteAExpected,
  athleteBData,
  athleteBExpected,
  athleteCData,
  simulateCTLATL,
  C_HRV_MEAN,
  C_HRV_SD,
} from "./fixtures/athlete-90day";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract garminTrainingLoad as a number array (chronological, oldest first). */
function loads(data: typeof athleteAData, end?: number): number[] {
  return data.slice(0, end).map((d) => d.garminTrainingLoad ?? 0);
}

/** Reverse a load array for computeACWR (most-recent-first). */
function acwrInput(arr: number[]): number[] {
  return [...arr].reverse();
}

// ── Block 1: CTL (Chronic Training Load) accuracy ────────────────────────────

describe("CTL accuracy", () => {
  it("test 01 — cold-start 42d at 60 TSS/day → CTL ≈ 51-52", () => {
    // Start at 0 (cold athlete), then 42 days of 60 TSS
    // CTL converges: 60 × (1 − (1−2/43)^42) ≈ 51.7
    const coldStart42 = [0, ...Array<number>(42).fill(60)];
    const { ctl } = computeTrainingLoads(coldStart42);
    expect(ctl).toBeGreaterThan(48);
    expect(ctl).toBeLessThan(55);
  });

  it("test 02 — CTL EWMA fixed point: constant 80 TSS → CTL stays at 80", () => {
    const constant80 = Array<number>(60).fill(80);
    const { ctl } = computeTrainingLoads(constant80);
    // Engine initialises CTL = loads[0] = 80, EWMA of constant sequence stays at 80
    expect(ctl).toBeCloseTo(80, 0);
  });

  it("test 10 — new athlete: only 10 days of data → CTL < 30 (cold start)", () => {
    // Athlete returning from zero fitness; two rest days then eight training days
    const tenDays = [0, 0, 60, 60, 60, 60, 60, 60, 60, 60];
    const { ctl } = computeTrainingLoads(tenDays);
    expect(ctl).toBeLessThan(30);
  });

  it("test 16 — CTL never negative: 90 days of zero load", () => {
    const zeros = Array<number>(90).fill(0);
    const { ctl } = computeTrainingLoads(zeros);
    expect(ctl).toBeGreaterThanOrEqual(0);
  });

  it("test 22 — Athlete B peak CTL at day 60 is in [75, 95]", () => {
    const result = computeTrainingLoads(loads(athleteBData, 60));
    // Verify fixture expected value falls in range first
    expect(athleteBExpected.day60.ctl).toBeGreaterThan(75);
    expect(athleteBExpected.day60.ctl).toBeLessThan(95);
    // Then verify engine matches fixture
    expect(result.ctl).toBeCloseTo(athleteBExpected.day60.ctl, 0);
  });

  it("test 25 — monotonically increasing load → CTL is monotonically non-decreasing", () => {
    const increasingLoads = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const ctls: number[] = [];
    for (let len = 1; len <= increasingLoads.length; len++) {
      ctls.push(computeTrainingLoads(increasingLoads.slice(0, len)).ctl);
    }
    for (let i = 1; i < ctls.length; i++) {
      expect(ctls[i]!).toBeGreaterThanOrEqual(ctls[i - 1]!);
    }
  });
});

// ── Block 2: ATL (Acute Training Load) accuracy ───────────────────────────────

describe("ATL accuracy", () => {
  it("test 03 — cold-start 7d at 80 TSS/day → ATL ≈ 65-75", () => {
    // ATL converges: 80 × (1 − 0.75^7) ≈ 69.3
    const coldStart7 = [0, ...Array<number>(7).fill(80)];
    const { atl } = computeTrainingLoads(coldStart7);
    expect(atl).toBeGreaterThan(62);
    expect(atl).toBeLessThan(76);
  });

  it("test 11 — 3 consecutive rest days reduce ATL", () => {
    // Build ATL to equilibrium, then three rest days should bring it down
    const buildLoads = Array<number>(20).fill(70);
    const beforeRest = computeTrainingLoads(buildLoads).atl;
    const withRest = computeTrainingLoads([...buildLoads, 0, 0, 0]).atl;
    expect(withRest).toBeLessThan(beforeRest);
  });

  it("test 15 — 5-day data gap (treated as 0 load) causes ATL to decay", () => {
    const beforeGap = computeTrainingLoads([60, 60, 60, 60]).atl;
    const afterGap = computeTrainingLoads([60, 60, 60, 60, 0, 0, 0, 0, 0]).atl;
    expect(afterGap).toBeLessThan(beforeGap);
  });

  it("test 17 — ATL decays faster than CTL after training stops", () => {
    // 60 days at 90 TSS bring both to equilibrium; then 30 days of rest
    const buildThenRest = [
      ...Array<number>(60).fill(90),
      ...Array<number>(30).fill(0),
    ];
    const { ctl, atl } = computeTrainingLoads(buildThenRest);
    // ATL (7-day constant) decays faster → should be much lower than CTL
    expect(atl).toBeLessThan(ctl);
  });
});

// ── Block 3: TSB (Training Stress Balance) ────────────────────────────────────

describe("TSB (form / freshness)", () => {
  it("test 04 — TSB negative during Athlete B build phase (days 50-60)", () => {
    const result = computeTrainingLoads(loads(athleteBData, 60));
    // ATL chases the increasing load and should exceed CTL → TSB < 0
    expect(result.tsb).toBeLessThan(0);
  });

  it("test 05 — TSB positive after Athlete B taper (day 75)", () => {
    const result = computeTrainingLoads(loads(athleteBData, 75));
    expect(result.tsb).toBeGreaterThan(0);
  });

  it("test 13 — 14-day 50% load reduction from equilibrium → TSB > 0", () => {
    // Build to equilibrium at 90 TSS, then taper to 45 TSS for 14 days
    const buildPhase = Array<number>(60).fill(90);
    const taperPhase = Array<number>(14).fill(45);
    const { tsb } = computeTrainingLoads([...buildPhase, ...taperPhase]);
    expect(tsb).toBeGreaterThan(0);
  });

  it("test 23 — Athlete B taper TSB at day 75 is in [0, 25]", () => {
    const { tsb } = computeTrainingLoads(loads(athleteBData, 75));
    expect(tsb).toBeGreaterThan(0);
    expect(tsb).toBeLessThan(25);
  });
});

// ── Block 4: ACWR (Acute:Chronic Workload Ratio) ──────────────────────────────

describe("ACWR injury-risk thresholds", () => {
  it("test 06 — steady-state Athlete A → ACWR in safe zone [0.8, 1.3]", () => {
    // 42 days of consistent 4-in-7 pattern ensures 7d avg ≈ 28d avg
    const steadyLoads = loads(athleteAData, 42);
    const acwr = computeACWR(acwrInput(steadyLoads));
    expect(acwr).toBeGreaterThanOrEqual(0.8);
    expect(acwr).toBeLessThanOrEqual(1.3);
  });

  it("test 07 — Athlete C ACWR > 1.5 at day 49 (spike week)", () => {
    // Spike: 7 days at 100 TSS on base of ~28.6 TSS/day → ACWR ≈ 2.2
    const spikeDayLoads = loads(athleteCData, 49);
    const acwr = computeACWR(acwrInput(spikeDayLoads));
    expect(acwr).toBeGreaterThan(1.5);
  });

  it("test 12 — doubling load for 7 days on stable base → ACWR > 1.3", () => {
    // 28 days at 40 TSS then 7 days at 80 TSS
    // Acute (7d) = 80; Chronic (28d) = (7×80 + 21×40)/28 = 50; ACWR = 1.6
    const base = Array<number>(28).fill(40);
    const spike = Array<number>(7).fill(80);
    const combined = [...base, ...spike]; // chronological
    const acwr = computeACWR(acwrInput(combined));
    expect(acwr).toBeGreaterThan(1.3);
  });

  it("test 24 — Athlete C ACWR spike: same assertion via fixture expected", () => {
    // Verifies fixture loads are actually spike-level
    const spikeDayLoads = loads(athleteCData, 49);
    const acwr = computeACWR(acwrInput(spikeDayLoads));
    expect(acwr).toBeGreaterThan(1.5);
    // Also verify CTL/ATL show acute overload: ATL >> CTL
    const { ctl, atl } = computeTrainingLoads(spikeDayLoads);
    expect(atl).toBeGreaterThan(ctl);
  });
});

// ── Block 5: HRV baseline computation ────────────────────────────────────────

describe("HRV baselines", () => {
  it("test 08 — Athlete A HRV baseline mean within 5ms of 65ms", () => {
    const baselines = computeBaselines(athleteAData, "male", 35);
    expect(baselines.hrv).toBeGreaterThan(60);
    expect(baselines.hrv).toBeLessThan(70);
  });

  it("test 20 — consistent HRV input → baseline SD < 15ms", () => {
    // 30 days of HRV oscillating only ±1ms around 65ms (very consistent)
    const consistentDays = Array.from({ length: 30 }, (_, i) => ({
      ...athleteAData[0]!,
      date: `2024-02-${String(i + 1).padStart(2, "0")}`,
      hrv: 64 + (i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : -1), // {64, 65, 64} cycle
    }));
    const baselines = computeBaselines(consistentDays, "male", 35);
    expect(baselines.hrvSD).toBeLessThan(15);
  });

  it("test 21 — high-variance HRV → baseline SD > 15ms", () => {
    // 30 days of HRV swinging between 40ms and 90ms (extreme variation)
    const variableDays = Array.from({ length: 30 }, (_, i) => ({
      ...athleteAData[0]!,
      date: `2024-03-${String(i + 1).padStart(2, "0")}`,
      hrv: i % 2 === 0 ? 40 : 90,
    }));
    const baselines = computeBaselines(variableDays, "male", 35);
    expect(baselines.hrvSD).toBeGreaterThan(15);
  });
});

// ── Block 6: HRV z-score calculations ────────────────────────────────────────

describe("HRV z-score", () => {
  it("test 09 — HRV = mean − 2.5 SD → z-score < −2.0", () => {
    const value = C_HRV_MEAN - 2.5 * C_HRV_SD;
    const z = computeZScore(value, C_HRV_MEAN, C_HRV_SD);
    expect(z).toBeLessThan(-2.0);
  });

  it("test 14 — HRV = mean + 1 SD → z-score > 0", () => {
    const value = C_HRV_MEAN + C_HRV_SD;
    const z = computeZScore(value, C_HRV_MEAN, C_HRV_SD);
    expect(z).toBeGreaterThan(0);
  });

  it("test 14b — HRV = mean → z-score exactly 0", () => {
    const z = computeZScore(C_HRV_MEAN, C_HRV_MEAN, C_HRV_SD);
    expect(z).toBe(0);
  });

  it("test 14c — Athlete C HRV during spike is below baseline z < −2", () => {
    // During spike days 42-48, HRV ≈ mean − 2.5 SD
    const spikeDay = athleteCData[44]!; // midpoint of spike week
    const z = computeZScore(spikeDay.hrv!, C_HRV_MEAN, C_HRV_SD);
    expect(z).toBeLessThan(-2.0);
  });
});

// ── Block 7: Ramp rate & training load flags ──────────────────────────────────

describe("Ramp rate and load spikes", () => {
  it("test 18 — 10pt CTL increase in 7 days → ramp rate > 8 pts/week", () => {
    // 70 days at 60 TSS (CTL ≈ 60), then 7 days at 150 TSS
    // rampRate = final_CTL − CTL_7_days_ago
    const base = Array<number>(70).fill(60);
    const spike = Array<number>(7).fill(150);
    const { rampRate } = computeTrainingLoads([...base, ...spike]);
    expect(rampRate).toBeGreaterThan(8);
  });

  it("test 18b — stable training → ramp rate near zero", () => {
    const stable = Array<number>(60).fill(60);
    const { rampRate } = computeTrainingLoads(stable);
    // After many days at constant load, rampRate ≈ 0
    expect(Math.abs(rampRate)).toBeLessThan(2);
  });
});

// ── Block 8: Sleep debt detection ────────────────────────────────────────────

describe("Sleep debt", () => {
  it("test 19 — 7 nights of 5.5h sleep → total sleep debt > 300 min", () => {
    // Need = 480 min; actual = 330 min; debt per night = 150 min × 7 = 1050 min
    const shortSleepMetrics = Array.from({ length: 7 }, (_, i) => ({
      ...athleteAData[0]!,
      date: `2024-04-${String(i + 1).padStart(2, "0")}`,
      totalSleepMinutes: 330, // 5.5 hours
    }));
    const debt = calculateSleepDebt(shortSleepMetrics, 480);
    expect(debt).toBeGreaterThan(300);
  });

  it("test 19b — 7 nights of adequate sleep → sleep debt near zero", () => {
    const adequateSleepMetrics = Array.from({ length: 7 }, (_, i) => ({
      ...athleteAData[0]!,
      date: `2024-04-${String(i + 1).padStart(2, "0")}`,
      totalSleepMinutes: 480,
    }));
    const debt = calculateSleepDebt(adequateSleepMetrics, 480);
    expect(debt).toBe(0);
  });
});

// ── Block 9: Multi-sport and edge cases ──────────────────────────────────────

describe("Multi-sport and edge cases", () => {
  it("test 14-ms — mix of run (60 TSS) + bike (80 TSS) days: CTL between 60 and 80", () => {
    // 30 days alternating run and bike sessions
    const mixedLoads = Array.from({ length: 30 }, (_, i) =>
      i % 2 === 0 ? 60 : 80,
    );
    const { ctl } = computeTrainingLoads(mixedLoads);
    // CTL should converge to the average (70), bounded by the input range
    expect(ctl).toBeGreaterThan(60);
    expect(ctl).toBeLessThan(80);
  });

  it("test 15-multi — multi-sport 30 day CTL matches manual simulation", () => {
    const mixedLoads = Array.from({ length: 30 }, (_, i) =>
      i % 2 === 0 ? 60 : 80,
    );
    const expected = simulateCTLATL(mixedLoads);
    const result = computeTrainingLoads(mixedLoads);
    expect(result.ctl).toBeCloseTo(expected.ctl, 0);
    expect(result.atl).toBeCloseTo(expected.atl, 0);
  });

  it("test 16-dec — CTL/ATL non-negative after all-zero 90-day block", () => {
    const zeros = Array<number>(90).fill(0);
    const { ctl, atl } = computeTrainingLoads(zeros);
    expect(ctl).toBeGreaterThanOrEqual(0);
    expect(atl).toBeGreaterThanOrEqual(0);
  });
});

// ── Block 10: Engine determinism and fixture validation ───────────────────────

describe("Engine determinism and fixture cross-checks", () => {
  it("test D1 — engine output matches simulateCTLATL for Athlete A day 42", () => {
    const result = computeTrainingLoads(loads(athleteAData, 42));
    expect(result.ctl).toBeCloseTo(athleteAExpected.day42.ctl, 0);
    expect(result.atl).toBeCloseTo(athleteAExpected.day42.atl, 0);
    expect(result.tsb).toBeCloseTo(athleteAExpected.day42.tsb, 0);
  });

  it("test D2 — Athlete A 90-day CTL reflects steady 34 TSS/day average", () => {
    const result = computeTrainingLoads(loads(athleteAData, 90));
    // 4 training days/week × 60 TSS = 240/7 ≈ 34.3 TSS/day equilibrium
    expect(result.ctl).toBeGreaterThan(28);
    expect(result.ctl).toBeLessThan(45);
  });

  it("test D3 — Athlete B build phase: ATL > CTL (negative TSB)", () => {
    const result = computeTrainingLoads(loads(athleteBData, 60));
    expect(result.atl).toBeGreaterThan(result.ctl);
    expect(result.tsb).toBeLessThan(0);
  });

  it("test D4 — Athlete B taper phase: CTL > ATL (positive TSB)", () => {
    const result = computeTrainingLoads(loads(athleteBData, 75));
    expect(result.ctl).toBeGreaterThan(result.atl);
    expect(result.tsb).toBeGreaterThan(0);
  });

  it("test D5 — TSB = CTL − ATL identity holds for all athlete datasets", () => {
    for (const dataset of [athleteAData, athleteBData, athleteCData]) {
      const allLoads = dataset.map((d) => d.garminTrainingLoad ?? 0);
      const { ctl, atl, tsb } = computeTrainingLoads(allLoads);
      // Engine rounds CTL and ATL independently to 2 dp, so TSB = round(CTL) - round(ATL)
      // may differ from ctl − atl by up to 0.01; use precision 0 (within 0.5)
      expect(tsb).toBeCloseTo(ctl - atl, 0);
    }
  });
});
