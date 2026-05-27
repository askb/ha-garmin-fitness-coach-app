import { describe, expect, it } from "vitest";

import type {
  ActualActivityInput,
  PlannedWorkoutInput,
  ReconcileStatus,
} from "..";
import { reconcilePlanVsActual } from "..";

const date = "2026-03-25";
const runPlan: PlannedWorkoutInput = {
  workoutType: "easy_run",
  sportType: "running",
  durationMin: 60,
  intensity: "easy",
};

function activity(
  id: string,
  sportType: string,
  durationMin: number,
  extras: Partial<ActualActivityInput> = {},
): ActualActivityInput {
  return { id, sportType, durationMin, ...extras };
}

describe("reconcilePlanVsActual", () => {
  const fixtures: {
    name: string;
    planned: PlannedWorkoutInput | null;
    actuals: ActualActivityInput[];
    expectedStatus: ReconcileStatus;
    expectedIds: string[];
    noteIncludes?: string;
  }[] = [
    {
      name: "no plan and no activity",
      planned: null,
      actuals: [],
      expectedStatus: "no-plan",
      expectedIds: [],
    },
    {
      name: "no plan and one activity",
      planned: null,
      actuals: [activity("a1", "running", 30)],
      expectedStatus: "extra",
      expectedIds: ["a1"],
      noteIncludes: "unplanned activity recorded",
    },
    {
      name: "rest planned and no activity",
      planned: { workoutType: "rest", durationMin: 0 },
      actuals: [],
      expectedStatus: "completed",
      expectedIds: [],
    },
    {
      name: "rest planned and one activity",
      planned: { workoutType: "rest", durationMin: 0 },
      actuals: [activity("a1", "walking", 20)],
      expectedStatus: "extra",
      expectedIds: ["a1"],
      noteIncludes: "rest day had an unplanned activity",
    },
    {
      name: "exact match",
      planned: runPlan,
      actuals: [activity("a1", "running", 58)],
      expectedStatus: "completed",
      expectedIds: ["a1"],
      noteIncludes: "matched by sportType+duration",
    },
    {
      name: "short workout",
      planned: runPlan,
      actuals: [activity("a1", "running", 35)],
      expectedStatus: "partial",
      expectedIds: ["a1"],
      noteIncludes: "duration below planned",
    },
    {
      name: "way short workout",
      planned: runPlan,
      actuals: [activity("a1", "running", 15)],
      expectedStatus: "partial",
      expectedIds: ["a1"],
      noteIncludes: "duration below planned",
    },
    {
      name: "missed workout",
      planned: runPlan,
      actuals: [],
      expectedStatus: "missed",
      expectedIds: [],
      noteIncludes: "planned workout not recorded",
    },
    {
      name: "sport family match",
      planned: { ...runPlan, sportType: "trail_running" },
      actuals: [activity("a1", "running", 60)],
      expectedStatus: "completed",
      expectedIds: ["a1"],
      noteIncludes: "matched by sport family",
    },
    {
      name: "wrong sport is conservative partial",
      planned: runPlan,
      actuals: [activity("a1", "cycling", 60)],
      expectedStatus: "partial",
      expectedIds: ["a1"],
      noteIncludes: "sport mismatch",
    },
    {
      name: "multiple actuals pick best",
      planned: runPlan,
      actuals: [
        activity("walk", "walking", 10),
        activity("run", "running", 55),
      ],
      expectedStatus: "completed",
      expectedIds: ["run"],
    },
    {
      name: "multiple actuals append extra note",
      planned: runPlan,
      actuals: [
        activity("run", "running", 60),
        activity("walk", "walking", 30),
      ],
      expectedStatus: "completed",
      expectedIds: ["run"],
      noteIncludes: "additional unplanned activity recorded",
    },
    {
      name: "intensity high",
      planned: runPlan,
      actuals: [activity("a1", "running", 60, { avgHrBpm: 180, hrMax: 200 })],
      expectedStatus: "completed",
      expectedIds: ["a1"],
      noteIncludes: "intensity above planned",
    },
    {
      name: "intensity below",
      planned: { ...runPlan, intensity: "hard" },
      actuals: [activity("a1", "running", 60, { avgHrBpm: 120, hrMax: 200 })],
      expectedStatus: "completed",
      expectedIds: ["a1"],
      noteIncludes: "intensity below planned",
    },
    {
      name: "no heart-rate data",
      planned: runPlan,
      actuals: [activity("a1", "running", 60)],
      expectedStatus: "completed",
      expectedIds: ["a1"],
    },
    {
      name: "sparse data still resolves",
      planned: { workoutType: "run", sportType: "running", durationMin: 45 },
      actuals: [activity("a1", "running", 40)],
      expectedStatus: "completed",
      expectedIds: ["a1"],
    },
    {
      name: "planned without sport uses duration match",
      planned: { workoutType: "mobility", durationMin: 30 },
      actuals: [activity("a1", "yoga", 30)],
      expectedStatus: "partial",
      expectedIds: ["a1"],
      noteIncludes: "matched by duration",
    },
    {
      name: "tie prefers longest duration",
      planned: { workoutType: "run", sportType: "running", durationMin: 60 },
      actuals: [
        activity("short", "cycling", 40),
        activity("long", "cycling", 50),
      ],
      expectedStatus: "partial",
      expectedIds: ["long"],
      noteIncludes: "sport mismatch",
    },
  ];

  it.each(fixtures)(
    "$name",
    ({ planned, actuals, expectedStatus, expectedIds, noteIncludes }) => {
      const result = reconcilePlanVsActual({ date, planned, actuals });

      expect(result.status).toBe(expectedStatus);
      expect(result.matchedActivityIds).toEqual(expectedIds);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      if (noteIncludes) expect(result.notes).toContain(noteIncludes);
    },
  );

  it("computes duration and sport deviations", () => {
    const result = reconcilePlanVsActual({
      date,
      planned: runPlan,
      actuals: [activity("a1", "running", 75)],
    });

    expect(result.deviation.durationMinDelta).toBe(15);
    expect(result.deviation.durationPctDelta).toBe(0.25);
    expect(result.deviation.sportTypeMatch).toBe(true);
  });

  it("computes signed intensity shifts", () => {
    expect(
      reconcilePlanVsActual({
        date,
        planned: runPlan,
        actuals: [activity("a1", "running", 60, { avgHrBpm: 180, hrMax: 200 })],
      }).deviation.intensityShift,
    ).toBe(2);

    expect(
      reconcilePlanVsActual({
        date,
        planned: { ...runPlan, intensity: "hard" },
        actuals: [activity("a1", "running", 60, { avgHrBpm: 120, hrMax: 200 })],
      }).deviation.intensityShift,
    ).toBe(-2);

    expect(
      reconcilePlanVsActual({
        date,
        planned: runPlan,
        actuals: [activity("a1", "running", 60)],
      }).deviation.intensityShift,
    ).toBeNull();
  });

  it("keeps sparse-data confidence usable", () => {
    const result = reconcilePlanVsActual({
      date,
      planned: { workoutType: "run", sportType: "running", durationMin: 45 },
      actuals: [activity("a1", "running", 40)],
    });

    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("lowers confidence for family-only and large duration deviations", () => {
    const result = reconcilePlanVsActual({
      date,
      planned: { ...runPlan, sportType: "trail_running" },
      actuals: [activity("a1", "running", 20)],
    });

    expect(result.confidence).toBeLessThan(0.7);
  });

  it("does not penalize confidence when plan omits intensity (regression: PR #207)", () => {
    // Plan has no intensity field, activity has no HR data either —
    // intensity uncertainty should NOT count against confidence.
    const planNoIntensity: PlannedWorkoutInput = {
      workoutType: "easy_run",
      sportType: "running",
      durationMin: 45,
    };
    const result = reconcilePlanVsActual({
      date,
      planned: planNoIntensity,
      actuals: [activity("a1", "running", 45)],
    });

    expect(result.confidence).toBe(1);
  });

  it("returns EMPTY_DEVIATION for unplanned-activity (extra) branch (regression: PR #207)", () => {
    const result = reconcilePlanVsActual({
      date,
      planned: null,
      actuals: [activity("a1", "running", 30)],
    });

    expect(result.status).toBe("extra");
    expect(result.deviation).toEqual({
      durationMinDelta: null,
      durationPctDelta: null,
      intensityShift: null,
      sportTypeMatch: null,
    });
  });
});
