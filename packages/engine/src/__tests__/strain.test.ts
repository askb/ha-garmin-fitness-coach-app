import { describe, expect, it } from "vitest";

import {
  computeACWR,
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
