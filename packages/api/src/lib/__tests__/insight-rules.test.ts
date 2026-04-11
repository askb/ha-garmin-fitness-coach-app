import { describe, expect, it } from "vitest";

import {
  checkAcwrRisk,
  checkHrvDeviation,
  isHrvSuppressed,
} from "../insight-rules";

// ---------------------------------------------------------------------------
// isHrvSuppressed — cross-check helper for ACWR ↔ HRV consistency
// ---------------------------------------------------------------------------

describe("isHrvSuppressed", () => {
  it("returns false when todayHrv is null (no data)", () => {
    expect(isHrvSuppressed(null, 50, 10)).toBe(false);
  });

  it("returns false when todayHrv is undefined (no data)", () => {
    expect(isHrvSuppressed(undefined, 50, 10)).toBe(false);
  });

  it("returns false when baselineValue is null (no baseline)", () => {
    expect(isHrvSuppressed(40, null, 10)).toBe(false);
  });

  it("returns false when baselineValue is undefined (no baseline)", () => {
    expect(isHrvSuppressed(40, undefined, 10)).toBe(false);
  });

  it("returns false when HRV is above baseline", () => {
    // baseline 50 ± 10 → threshold = 40; hrv 55 → OK
    expect(isHrvSuppressed(55, 50, 10)).toBe(false);
  });

  it("returns false when HRV equals the threshold exactly (baseline - SD)", () => {
    // baseline 50, SD 10 → threshold = 40; hrv 40 → NOT suppressed (strict <)
    expect(isHrvSuppressed(40, 50, 10)).toBe(false);
  });

  it("returns true when HRV is below baseline by more than 1 SD", () => {
    // baseline 50, SD 10 → threshold = 40; hrv 35 → suppressed
    expect(isHrvSuppressed(35, 50, 10)).toBe(true);
  });

  it("returns true when HRV is well below baseline (2+ SD)", () => {
    // baseline 50, SD 10 → threshold = 40; hrv 17 → suppressed
    expect(isHrvSuppressed(17, 50, 10)).toBe(true);
  });

  it("returns false when SD is null (treated as 0) and HRV equals baseline", () => {
    expect(isHrvSuppressed(50, 50, null)).toBe(false);
  });

  it("returns true when SD is null (treated as 0) and HRV is below baseline", () => {
    // With SD=0, any HRV < baseline is suppressed
    expect(isHrvSuppressed(49, 50, null)).toBe(true);
  });

  it("returns false when SD is undefined (treated as 0) and HRV equals baseline", () => {
    expect(isHrvSuppressed(50, 50)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Verify existing rule functions are not affected
// ---------------------------------------------------------------------------

describe("checkAcwrRisk (unchanged)", () => {
  it("triggers HIGH for ACWR > 1.5", () => {
    const result = checkAcwrRisk(1.6);
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe("HIGH");
  });

  it("triggers MEDIUM for ACWR 1.3–1.5", () => {
    const result = checkAcwrRisk(1.4);
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe("MEDIUM");
  });

  it("does not trigger for ACWR in safe range", () => {
    const result = checkAcwrRisk(1.0);
    expect(result.triggered).toBe(false);
  });

  it("does not trigger for ACWR < 0.8 (under-training, handled elsewhere)", () => {
    const result = checkAcwrRisk(0.7);
    expect(result.triggered).toBe(false);
  });
});

describe("checkHrvDeviation (unchanged)", () => {
  it("triggers HIGH when HRV < mean - 2*SD", () => {
    const result = checkHrvDeviation(25, 50, 10);
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe("HIGH");
  });

  it("triggers MEDIUM when HRV < mean - 1*SD", () => {
    const result = checkHrvDeviation(38, 50, 10);
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe("MEDIUM");
  });

  it("does not trigger when HRV is within normal range", () => {
    const result = checkHrvDeviation(45, 50, 10);
    expect(result.triggered).toBe(false);
  });
});
