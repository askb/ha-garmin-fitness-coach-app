// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";

import { computeTargetStrain } from "../coaching/target-strain";

describe("computeTargetStrain", () => {
  it("maps prime readiness to all-out band", () => {
    const band = computeTargetStrain(90);
    expect(band.readinessZone).toBe("prime");
    expect(band.label).toBe("All-out");
    expect(band.min).toBeGreaterThanOrEqual(13);
    expect(band.max).toBeGreaterThanOrEqual(15);
    expect(band.max).toBeLessThanOrEqual(21);
  });

  it("maps poor readiness to recovery band", () => {
    const band = computeTargetStrain(10);
    expect(band.readinessZone).toBe("poor");
    expect(band.label).toBe("Recovery");
    expect(band.max).toBeLessThanOrEqual(10);
  });

  it("clamps out-of-range scores", () => {
    expect(computeTargetStrain(-50).readinessZone).toBe("poor");
    expect(computeTargetStrain(150).readinessZone).toBe("prime");
  });

  it("midpoint is between min and max", () => {
    const band = computeTargetStrain(70);
    expect(band.target).toBeGreaterThanOrEqual(band.min);
    expect(band.target).toBeLessThanOrEqual(band.max);
  });

  it("personalises toward athlete median when ≥7 days of strain history", () => {
    // Low-volume athlete: median strain ~5
    const lowVol = computeTargetStrain(70, [4, 5, 6, 5, 4, 6, 5, 5, 5, 5]);
    // High-volume athlete: median strain ~16
    const highVol = computeTargetStrain(70, [15, 16, 17, 16, 15, 17, 16]);

    // Same readiness, but bands should differ by the personalisation shift.
    expect(lowVol.target).toBeLessThan(highVol.target);
  });

  it("does not personalise with <7 days of data", () => {
    const noHistory = computeTargetStrain(70);
    const fewDays = computeTargetStrain(70, [10, 12, 11]);
    expect(noHistory.target).toBe(fewDays.target);
  });

  it("output bounds are within 0-21 WHOOP scale", () => {
    for (const score of [0, 25, 50, 75, 100]) {
      const band = computeTargetStrain(score, [20, 20, 20, 20, 20, 20, 20, 20]);
      expect(band.min).toBeGreaterThanOrEqual(0);
      expect(band.max).toBeLessThanOrEqual(21);
    }
  });
});
