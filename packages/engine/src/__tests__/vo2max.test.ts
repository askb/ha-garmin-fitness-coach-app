import { describe, expect, it } from "vitest";

import { computeVO2maxTrend } from "../vo2max";

describe("computeVO2maxTrend", () => {
  const baseEstimates = [
    { date: "2026-01-01", value: 45.0 },
    { date: "2026-01-08", value: 45.5 },
    { date: "2026-01-15", value: 46.0 },
    { date: "2026-01-22", value: 46.5 },
  ];

  it("returns null with fewer than 4 data points", () => {
    expect(computeVO2maxTrend(baseEstimates.slice(0, 3))).toBeNull();
  });

  it("detects improving trend with positive slope", () => {
    const result = computeVO2maxTrend(baseEstimates);
    expect(result).not.toBeNull();
    expect(result!.trend).toBe("improving");
    expect(result!.slopePerWeek).toBeGreaterThan(0);
  });

  it("detects declining trend with negative slope", () => {
    const declining = [
      { date: "2026-01-01", value: 48.0 },
      { date: "2026-01-08", value: 47.0 },
      { date: "2026-01-15", value: 46.0 },
      { date: "2026-01-22", value: 45.0 },
    ];
    const result = computeVO2maxTrend(declining);
    expect(result).not.toBeNull();
    expect(result!.trend).toBe("declining");
    expect(result!.slopePerWeek).toBeLessThan(0);
  });

  it("detects stable trend with flat data", () => {
    const stable = [
      { date: "2026-01-01", value: 45.0 },
      { date: "2026-01-08", value: 45.1 },
      { date: "2026-01-15", value: 44.9 },
      { date: "2026-01-22", value: 45.0 },
    ];
    const result = computeVO2maxTrend(stable);
    expect(result).not.toBeNull();
    expect(result!.trend).toBe("stable");
  });

  // --- Source filtering tests ---

  it("filters out uth_method sources when source metadata is present", () => {
    // 4 official + 4 uth_method (noisy) that would skew trend downward
    const mixed = [
      { date: "2026-01-01", value: 45.0, source: "garmin_official" },
      { date: "2026-01-02", value: 40.0, source: "uth_method" },
      { date: "2026-01-08", value: 46.0, source: "garmin_official" },
      { date: "2026-01-09", value: 39.0, source: "uth_method" },
      { date: "2026-01-15", value: 47.0, source: "garmin_official" },
      { date: "2026-01-16", value: 38.0, source: "uth_method" },
      { date: "2026-01-22", value: 48.0, source: "garmin_official" },
      { date: "2026-01-23", value: 37.0, source: "uth_method" },
    ];
    const result = computeVO2maxTrend(mixed);
    expect(result).not.toBeNull();
    // Without filtering, the low uth values would drag the trend down
    // With filtering, only the 45→48 official values are used = improving
    expect(result!.trend).toBe("improving");
  });

  it("filters out uth_ratio sources when source metadata is present", () => {
    const mixed = [
      { date: "2026-01-01", value: 45.0, source: "running_pace_hr" },
      { date: "2026-01-08", value: 46.0, source: "running_pace_hr" },
      { date: "2026-01-15", value: 47.0, source: "cooper" },
      { date: "2026-01-16", value: 35.0, source: "uth_ratio" },
      { date: "2026-01-22", value: 48.0, source: "running_pace_hr" },
    ];
    const result = computeVO2maxTrend(mixed);
    expect(result).not.toBeNull();
    expect(result!.trend).toBe("improving");
  });

  it("returns null when filtering leaves fewer than 4 data points", () => {
    const mostlyUth = [
      { date: "2026-01-01", value: 45.0, source: "garmin_official" },
      { date: "2026-01-02", value: 44.0, source: "uth_method" },
      { date: "2026-01-08", value: 46.0, source: "garmin_official" },
      { date: "2026-01-09", value: 43.0, source: "uth_method" },
      { date: "2026-01-15", value: 42.0, source: "uth_method" },
      { date: "2026-01-22", value: 47.0, source: "garmin_official" },
    ];
    // Only 3 official sources after filtering → null
    expect(computeVO2maxTrend(mostlyUth)).toBeNull();
  });

  it("uses all estimates when no source metadata is provided (backwards compat)", () => {
    // No source field at all — should behave exactly like original function
    const result = computeVO2maxTrend(baseEstimates);
    expect(result).not.toBeNull();
    expect(result!.trend).toBe("improving");
  });

  it("uses all estimates when source is undefined on all entries", () => {
    const noSource = baseEstimates.map((e) => ({ ...e, source: undefined }));
    const result = computeVO2maxTrend(noSource);
    expect(result).not.toBeNull();
    expect(result!.trend).toBe("improving");
  });
});
