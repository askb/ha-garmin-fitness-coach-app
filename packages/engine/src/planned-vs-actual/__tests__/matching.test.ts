import { describe, expect, it } from "vitest";

import {
  computeIntensityShift,
  deriveActualIntensityStep,
  scoreActivityMatch,
  scoreDuration,
  scoreSportType,
  sportFamily,
} from "../matching";

describe("sportFamily", () => {
  it.each([
    ["running", "running"],
    ["Trail Running", "running"],
    [" treadmill running ", "running"],
    ["track_running", "running"],
    ["walking", "walking"],
    ["hiking", "walking"],
    ["casual walking", "walking"],
    ["cycling", "cycling"],
    ["road_biking", "cycling"],
    ["mountain biking", "cycling"],
    ["indoor_cycling", "cycling"],
    ["swimming", "swimming"],
    ["lap swimming", "swimming"],
    ["open_water_swimming", "swimming"],
    ["strength_training", "strength"],
    ["yoga", "strength"],
    ["pilates", "strength"],
    ["elliptical", "elliptical"],
  ])("maps %s to %s", (sport, family) => {
    expect(sportFamily(sport)).toBe(family);
  });
});

describe("deriveActualIntensityStep", () => {
  it.each([
    [139, 200, 1],
    [140, 200, 2],
    [166, 200, 2],
    [167, 200, 3],
  ])("maps %s/%s to step %s", (avgHrBpm, hrMax, expected) => {
    expect(deriveActualIntensityStep({ avgHrBpm, hrMax })).toBe(expected);
  });

  it("returns null when heart-rate data is missing or invalid", () => {
    expect(deriveActualIntensityStep({})).toBeNull();
    expect(deriveActualIntensityStep({ avgHrBpm: 120 })).toBeNull();
    expect(deriveActualIntensityStep({ avgHrBpm: 120, hrMax: 0 })).toBeNull();
  });
});

describe("matching scores", () => {
  it("scores exact, family, and mismatched sports", () => {
    expect(scoreSportType("running", "Running")).toBe(1);
    expect(scoreSportType("trail_running", "running")).toBe(0.6);
    expect(scoreSportType("running", "cycling")).toBe(0);
    expect(scoreSportType(null, "cycling")).toBe(1);
  });

  it("scores duration by tier and configured tolerance", () => {
    expect(scoreDuration(60, 58)).toBe(1);
    expect(scoreDuration(60, 40)).toBe(0.6);
    expect(scoreDuration(60, 30)).toBe(0.2);
    expect(scoreDuration(60, 20)).toBe(0);
    expect(scoreDuration(20, 10, { durationMinMinAbsolute: 10 })).toBe(0.6);
  });

  it("scores intensity as non-penalizing when unknown", () => {
    expect(computeIntensityShift("easy", { avgHrBpm: 180, hrMax: 200 })).toBe(
      2,
    );
    expect(computeIntensityShift("hard", { avgHrBpm: 120, hrMax: 200 })).toBe(
      -2,
    );
    expect(computeIntensityShift("easy", {})).toBeNull();
    expect(
      scoreActivityMatch(
        { sportType: "running", durationMin: 60, intensity: "easy" },
        { id: "a1", sportType: "running", durationMin: 60 },
      ).intensityScore,
    ).toBe(1);
  });
});
