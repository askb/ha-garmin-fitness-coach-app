// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
  collectSupportedNumbers,
  evaluateResponseQuality,
  extractNumericClaims,
  qualityBadge,
} from "../quality-gate";

describe("extractNumericClaims", () => {
  it("captures unit-bearing numbers", () => {
    const claims = extractNumericClaims(
      "You ran 10 km at 154 bpm and burned 620 kcal.",
    );
    const values = claims.map((c) => c.value);
    expect(values).toContain(10);
    expect(values).toContain(154);
    expect(values).toContain(620);
  });

  it("captures labelled metrics like HR and VO2max", () => {
    const claims = extractNumericClaims("Your VO2max 53.4 and TSB +12 today.");
    const values = claims.map((c) => c.value);
    expect(values).toContain(53.4);
    expect(values).toContain(12);
  });

  it("ignores bare integers used in prose", () => {
    const claims = extractNumericClaims("You did 3 runs over 2 days.");
    // No units → not treated as quantitative claims.
    expect(claims).toHaveLength(0);
  });

  it("skips the appended disclaimer block", () => {
    const text =
      "You ran 5 km today.\n\n---\n*Disclaimer: consult a professional at 100 bpm.*";
    const claims = extractNumericClaims(text);
    expect(claims.map((c) => c.value)).toContain(5);
    expect(claims.map((c) => c.value)).not.toContain(100);
  });
});

describe("collectSupportedNumbers", () => {
  it("pulls every numeric token from the context", () => {
    const nums = collectSupportedNumbers(
      "distance_km: 10.0\nhr: 154\nstrain: 14.7",
    );
    expect(nums).toContain(154);
    expect(nums).toContain(14.7);
  });
});

describe("evaluateResponseQuality", () => {
  const context = "distance_km: 10.0\navg_hr: 154\nstrain: 14.7\nvo2max: 53.4";

  it("returns high confidence when all claims are supported", () => {
    const res = evaluateResponseQuality(
      "You ran 10 km at 154 bpm, strain 14.7.",
      context,
    );
    expect(res.confidence).toBe("high");
    expect(res.unsupportedClaims).toHaveLength(0);
  });

  it("returns high confidence when there are no numeric claims", () => {
    const res = evaluateResponseQuality(
      "Focus on consistency and recovery this week.",
      context,
    );
    expect(res.confidence).toBe("high");
    expect(res.supportedRatio).toBe(1);
  });

  it("flags a fabricated statistic", () => {
    const res = evaluateResponseQuality(
      "Your weekly mileage of 42 km is strong, HR 154.",
      context,
    );
    expect(res.confidence).not.toBe("high");
    expect(res.unsupportedClaims.map((c) => c.value)).toContain(42);
  });

  it("drops to low confidence when most claims are unsupported", () => {
    const res = evaluateResponseQuality(
      "You ran 42 km at 88 bpm burning 1500 kcal, VO2max 60.",
      context,
    );
    expect(res.confidence).toBe("low");
  });

  it("tolerates rounding within 2%", () => {
    const res = evaluateResponseQuality("You ran about 10 km.", "dist: 9.9");
    expect(res.confidence).toBe("high");
  });
});

describe("qualityBadge", () => {
  it("is empty for high confidence", () => {
    const res = evaluateResponseQuality("Stay consistent.", "hr: 154");
    expect(qualityBadge(res)).toBe("");
  });

  it("names the unsupported figures for low confidence", () => {
    const res = evaluateResponseQuality(
      "Your 42 km week with VO2max 60 looks great.",
      "hr: 154",
    );
    const badge = qualityBadge(res);
    expect(badge).toMatch(/not in your synced data/i);
    expect(badge).toMatch(/42/);
  });
});
