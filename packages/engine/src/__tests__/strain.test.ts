import { describe, expect, it } from "vitest";

import {
  computeACWR,
  computeDailyPMCSeries,
  computeStrainScore,
  computeTRIMP,
  countConsecutiveHardDays,
} from "../strain";

describe("computeTRIMP", () => {
  it("returns positive TRIMP for normal activity", () => {
    const trimp = computeTRIMP(
      { durationMinutes: 45, avgHr: 155, maxHr: 185 },
      60, // resting HR
      190, // max HR
      "male",
    );
    expect(trimp).toBeGreaterThan(0);
  });

  it("returns 0 for null avgHr", () => {
    const trimp = computeTRIMP(
      { durationMinutes: 45, avgHr: null, maxHr: 185 },
      60,
      190,
      "male",
    );
    expect(trimp).toBe(0);
  });

  it("returns 0 when maxHr <= restingHr", () => {
    const trimp = computeTRIMP(
      { durationMinutes: 45, avgHr: 155, maxHr: 185 },
      190, // resting higher than max
      190,
      "male",
    );
    expect(trimp).toBe(0);
  });

  it("higher duration → higher TRIMP", () => {
    const short = computeTRIMP(
      { durationMinutes: 20, avgHr: 155, maxHr: 185 },
      60,
      190,
      "male",
    );
    const long = computeTRIMP(
      { durationMinutes: 60, avgHr: 155, maxHr: 185 },
      60,
      190,
      "male",
    );
    expect(long).toBeGreaterThan(short);
  });

  it("higher avgHr → higher TRIMP", () => {
    const easy = computeTRIMP(
      { durationMinutes: 45, avgHr: 120, maxHr: 185 },
      60,
      190,
      "male",
    );
    const hard = computeTRIMP(
      { durationMinutes: 45, avgHr: 170, maxHr: 185 },
      60,
      190,
      "male",
    );
    expect(hard).toBeGreaterThan(easy);
  });

  it("uses different k for female", () => {
    const male = computeTRIMP(
      { durationMinutes: 45, avgHr: 155, maxHr: 185 },
      60,
      190,
      "male",
    );
    const female = computeTRIMP(
      { durationMinutes: 45, avgHr: 155, maxHr: 185 },
      60,
      190,
      "female",
    );
    expect(male).not.toBe(female);
  });
});

describe("computeStrainScore", () => {
  it("returns 0 for 0 TRIMP", () => {
    expect(computeStrainScore(0)).toBe(0);
  });

  it("returns value between 0 and 21", () => {
    const strain = computeStrainScore(150);
    expect(strain).toBeGreaterThan(0);
    expect(strain).toBeLessThanOrEqual(21);
  });

  it("higher TRIMP → higher strain", () => {
    const low = computeStrainScore(50);
    const high = computeStrainScore(200);
    expect(high).toBeGreaterThan(low);
  });

  it("asymptotically approaches 21", () => {
    const extreme = computeStrainScore(1000);
    expect(extreme).toBeGreaterThan(20);
    expect(extreme).toBeLessThanOrEqual(21);
  });
});

describe("computeACWR", () => {
  it("returns 1.0 for balanced load", () => {
    const strains = [10, 10, 10, 10, 10, 10, 10];
    expect(computeACWR(strains)).toBe(1);
  });

  it("returns > 1 for high acute load", () => {
    // Need 28 values to distinguish acute (7d) from chronic (28d)
    const strains = [
      18, 18, 18, 18, 18, 18, 18, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
      5, 5, 5, 5, 5, 5,
    ];
    expect(computeACWR(strains)).toBeGreaterThan(1);
  });

  it("returns < 1 for low acute load", () => {
    const strains = [
      3, 3, 3, 3, 3, 3, 3, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15,
      15, 15, 15, 15, 15, 15, 15, 15,
    ];
    expect(computeACWR(strains)).toBeLessThan(1);
  });

  it("returns 1.0 for insufficient data", () => {
    expect(computeACWR([10, 10])).toBe(1.0);
    expect(computeACWR([])).toBe(1.0);
  });
});

describe("countConsecutiveHardDays", () => {
  it("counts consecutive days above threshold", () => {
    expect(countConsecutiveHardDays([15, 16, 17, 10, 5])).toBe(3);
  });

  it("stops at first non-hard day", () => {
    expect(countConsecutiveHardDays([15, 10, 16])).toBe(1);
  });

  it("returns 0 when first day is not hard", () => {
    expect(countConsecutiveHardDays([10, 15, 16])).toBe(0);
  });

  it("returns 0 for empty array", () => {
    expect(countConsecutiveHardDays([])).toBe(0);
  });
});

describe("computeDailyPMCSeries", () => {
  it("returns empty for empty input", () => {
    expect(computeDailyPMCSeries([])).toEqual([]);
  });

  it("emits one row per input day", () => {
    const loads = new Array(30).fill(10) as number[];
    const series = computeDailyPMCSeries(loads);
    expect(series).toHaveLength(30);
    for (const row of series) {
      expect(row).toHaveProperty("ctl");
      expect(row).toHaveProperty("atl");
      expect(row).toHaveProperty("tsb");
      expect(row).toHaveProperty("acwr");
    }
  });

  it("converges CTL and ATL to the steady-state load", () => {
    const loads = new Array(120).fill(10) as number[];
    const series = computeDailyPMCSeries(loads);
    const last = series[series.length - 1]!;
    expect(last.ctl).toBeCloseTo(10, 0);
    expect(last.atl).toBeCloseTo(10, 0);
    expect(last.tsb).toBeCloseTo(0, 0);
    expect(last.acwr).toBeCloseTo(1, 1);
  });

  it("ACWR spikes when acute load jumps above chronic baseline", () => {
    const loads = [
      ...new Array(28).fill(5),
      ...new Array(7).fill(20),
    ] as number[];
    const series = computeDailyPMCSeries(loads);
    const last = series[series.length - 1]!;
    expect(last.acwr).toBeGreaterThan(1.5);
  });

  it("ACWR drops when athlete tapers", () => {
    const loads = [
      ...new Array(28).fill(20),
      ...new Array(7).fill(5),
    ] as number[];
    const series = computeDailyPMCSeries(loads);
    const last = series[series.length - 1]!;
    expect(last.acwr).toBeLessThan(0.7);
  });

  it("latest ACWR matches the standalone computeACWR result", () => {
    const loads = [
      8, 12, 0, 15, 6, 0, 10, 14, 6, 0, 11, 16, 0, 12, 9, 0, 8, 13, 0, 15, 7, 0,
      10, 14, 6, 0, 11, 16, 9, 12,
    ];
    const series = computeDailyPMCSeries(loads);
    const latest = series[series.length - 1]!.acwr;
    const reversed = [...loads].reverse();
    const standalone = computeACWR(reversed);
    expect(latest).toBeCloseTo(standalone, 1);
  });
});
