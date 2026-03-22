/**
 * Tests for proactive AI insight rule functions.
 * Each rule is tested in isolation using deterministic fixture data.
 */
import { describe, it, expect, beforeEach } from "@jest/globals";

// Import pure rule functions from the helper module.
// Jest config maps @acme/api → packages/api/src via moduleNameMapper (fallback: relative path).
import {
  checkAcwrRisk,
  checkTsbOverreaching,
  checkHrvDeviation,
  checkSleepDebt,
  checkRampRate,
  checkInterventionPattern,
} from "../../../../packages/api/src/lib/insight-rules";

// ─────────────────────────────────────────────────────────────────────────────
// Rule 1: ACWR Injury Risk
// ─────────────────────────────────────────────────────────────────────────────
describe("checkAcwrRisk", () => {
  it("returns HIGH severity when ACWR > 1.5", () => {
    const result = checkAcwrRisk(1.6);
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe("HIGH");
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it("returns HIGH at exactly the boundary ACWR = 1.51", () => {
    const result = checkAcwrRisk(1.51);
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe("HIGH");
  });

  it("returns MEDIUM severity when 1.3 < ACWR ≤ 1.5", () => {
    const result = checkAcwrRisk(1.4);
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe("MEDIUM");
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it("does not trigger when ACWR = 1.2 (safe zone)", () => {
    const result = checkAcwrRisk(1.2);
    expect(result.triggered).toBe(false);
    expect(result.severity).toBeNull();
  });

  it("does not trigger when ACWR = 1.0 (optimal)", () => {
    const result = checkAcwrRisk(1.0);
    expect(result.triggered).toBe(false);
    expect(result.severity).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rule 2: TSB Overreaching
// ─────────────────────────────────────────────────────────────────────────────
describe("checkTsbOverreaching", () => {
  it("returns HIGH severity when TSB < -20", () => {
    const result = checkTsbOverreaching(-25);
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe("HIGH");
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("returns MEDIUM severity when -20 ≤ TSB < -10", () => {
    const result = checkTsbOverreaching(-15);
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe("MEDIUM");
  });

  it("does not trigger when TSB = -5 (normal fatigue)", () => {
    const result = checkTsbOverreaching(-5);
    expect(result.triggered).toBe(false);
    expect(result.severity).toBeNull();
  });

  it("does not trigger when TSB is positive (fresh/recovered)", () => {
    const result = checkTsbOverreaching(10);
    expect(result.triggered).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rule 3: HRV Deviation
// ─────────────────────────────────────────────────────────────────────────────
describe("checkHrvDeviation", () => {
  const mean = 60; // ms baseline
  const sd = 8;   // ms standard deviation

  it("returns HIGH severity when HRV < mean - 2*SD", () => {
    // 60 - 2*8 = 44; fixture hrv = 60 - 2.5*8 = 40
    const result = checkHrvDeviation(40, mean, sd);
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe("HIGH");
  });

  it("returns MEDIUM severity when mean-2*SD ≤ HRV < mean-1*SD", () => {
    // 60 - 1.5*8 = 48 (between -2SD and -1SD)
    const result = checkHrvDeviation(48, mean, sd);
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe("MEDIUM");
  });

  it("does not trigger when HRV is within 1 SD of mean", () => {
    const result = checkHrvDeviation(55, mean, sd);
    expect(result.triggered).toBe(false);
    expect(result.severity).toBeNull();
  });

  it("does not trigger when HRV equals the mean", () => {
    const result = checkHrvDeviation(60, mean, sd);
    expect(result.triggered).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rule 4: Sleep Debt
// ─────────────────────────────────────────────────────────────────────────────
describe("checkSleepDebt", () => {
  it("returns HIGH severity when avg sleep < 6h (330 min = 5.5h)", () => {
    const result = checkSleepDebt(330); // 5.5h
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe("HIGH");
  });

  it("returns LOW severity when 6h ≤ avg sleep < 7h (390 min = 6.5h)", () => {
    const result = checkSleepDebt(390); // 6.5h
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe("LOW");
  });

  it("does not trigger when avg sleep ≥ 7h (420 min)", () => {
    const result = checkSleepDebt(480); // 8h
    expect(result.triggered).toBe(false);
    expect(result.severity).toBeNull();
  });

  it("does not trigger at exactly 7h (420 min) boundary", () => {
    const result = checkSleepDebt(420);
    expect(result.triggered).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rule 5: Ramp Rate Spike
// ─────────────────────────────────────────────────────────────────────────────
describe("checkRampRate", () => {
  it("returns HIGH severity when CTL increased > 10 pts over 7 days", () => {
    // CTL values day 0..6: started at 50, ended at 62 → delta = 12
    const ctlValues = [50, 52, 54, 56, 58, 60, 62];
    const result = checkRampRate(ctlValues);
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe("HIGH");
    expect(result.delta).toBe(12);
  });

  it("returns MEDIUM severity when CTL increased 7-10 pts", () => {
    const ctlValues = [50, 51, 53, 54, 55, 56, 58]; // delta = 8
    const result = checkRampRate(ctlValues);
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe("MEDIUM");
    expect(result.delta).toBe(8);
  });

  it("does not trigger when CTL increase ≤ 7 pts", () => {
    const ctlValues = [50, 51, 52, 53, 54, 55, 55]; // delta = 5
    const result = checkRampRate(ctlValues);
    expect(result.triggered).toBe(false);
    expect(result.delta).toBe(5);
  });

  it("does not trigger when CTL is decreasing (recovery week)", () => {
    const ctlValues = [60, 58, 56, 54, 52, 50, 48]; // delta = -12
    const result = checkRampRate(ctlValues);
    expect(result.triggered).toBe(false);
  });

  it("handles insufficient data (< 2 values) gracefully", () => {
    const result = checkRampRate([55]);
    expect(result.triggered).toBe(false);
    expect(result.delta).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rule 6: Intervention Pattern Detection
// ─────────────────────────────────────────────────────────────────────────────
describe("checkInterventionPattern", () => {
  it("detects pattern when same tag appears 3 times in 14d window", () => {
    const tags = ["foam_rolling", "ice_bath", "foam_rolling", "stretching", "foam_rolling"];
    const result = checkInterventionPattern(tags);
    expect(result.triggered).toBe(true);
    expect(result.tag).toBe("foam_rolling");
    expect(result.count).toBe(3);
  });

  it("detects pattern at exactly 3 occurrences (boundary)", () => {
    const tags = ["sleep", "sleep", "sleep"];
    const result = checkInterventionPattern(tags);
    expect(result.triggered).toBe(true);
    expect(result.tag).toBe("sleep");
    expect(result.count).toBe(3);
  });

  it("does not trigger when no tag reaches 3 occurrences", () => {
    const tags = ["foam_rolling", "ice_bath", "foam_rolling", "stretching"];
    const result = checkInterventionPattern(tags);
    expect(result.triggered).toBe(false);
    expect(result.tag).toBeNull();
    expect(result.count).toBe(0);
  });

  it("does not trigger with empty tag list", () => {
    const result = checkInterventionPattern([]);
    expect(result.triggered).toBe(false);
    expect(result.tag).toBeNull();
  });
});
