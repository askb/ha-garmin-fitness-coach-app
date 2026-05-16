// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { getReadinessComponent } from "../readiness-helpers";

describe("getReadinessComponent", () => {
  it("prefers the top-level numeric column (cached DB row)", () => {
    const data = {
      hrvComponent: 78,
      components: { hrv: 11 },
      factors: { hrv: 22 },
    };
    expect(getReadinessComponent(data, "hrvComponent", "hrv")).toBe(78);
  });

  it("falls back to components.<key> when top-level column is null", () => {
    const data = {
      hrvComponent: null,
      components: { hrv: 64 },
      factors: { hrv: 11 },
    };
    expect(getReadinessComponent(data, "hrvComponent", "hrv")).toBe(64);
  });

  it("falls back to factors.<key> when top + components are both null (Garmin-native fix)", () => {
    // PR #129 preserves component scores in the `factors` JSONB even when
    // the dedicated columns are NULL because Garmin supplied the native
    // score. PR #120 ensures the home tile can still render those.
    const data = {
      hrvComponent: null,
      sleepQuantityComponent: null,
      components: null,
      factors: { hrv: 82, sleepQuantity: 70 },
    };
    expect(getReadinessComponent(data, "hrvComponent", "hrv")).toBe(82);
    expect(
      getReadinessComponent(data, "sleepQuantityComponent", "sleepQuantity"),
    ).toBe(70);
  });

  it("returns null when no layer has a numeric value", () => {
    const data = {
      hrvComponent: null,
      components: { hrv: "not-a-number" },
      factors: {},
    };
    expect(getReadinessComponent(data, "hrvComponent", "hrv")).toBeNull();
  });

  it("returns null for null / undefined input", () => {
    expect(getReadinessComponent(null, "hrvComponent", "hrv")).toBeNull();
    expect(getReadinessComponent(undefined, "hrvComponent", "hrv")).toBeNull();
  });

  it("ignores non-numeric values at the top level and walks to fallbacks", () => {
    const data = {
      hrvComponent: "78", // string, not a number
      components: { hrv: 64 },
    };
    expect(getReadinessComponent(data, "hrvComponent", "hrv")).toBe(64);
  });

  it("treats zero as a valid component score (not nullish)", () => {
    // Zero is a legitimate floor for stress / load components; ensure
    // the helper doesn't silently treat it as missing.
    const data = { stressComponent: 0 };
    expect(getReadinessComponent(data, "stressComponent", "stress")).toBe(0);
  });
});
