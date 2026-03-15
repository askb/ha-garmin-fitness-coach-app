import { describe, it, expect } from "vitest";
import {
  generateDailyWorkout,
  modulateWorkout,
  selectWeeklyTemplate,
  adjustDifficulty,
} from "../coaching";
import { allTemplates } from "../coaching/templates";

describe("selectWeeklyTemplate", () => {
  it("returns 5-day running performance template", () => {
    const slots = selectWeeklyTemplate("running", "performance", 5);
    expect(slots.length).toBe(5);
    expect(slots.some((s) => s.sessionType === "vo2_intervals")).toBe(true);
    expect(slots.some((s) => s.sessionType === "long_run")).toBe(true);
  });

  it("returns 3-day template when fewer days available", () => {
    const slots = selectWeeklyTemplate("running", "performance", 3);
    expect(slots.length).toBe(3);
  });

  it("falls back to maintain template for unknown goal", () => {
    const slots = selectWeeklyTemplate("running", "unknown_goal", 3);
    expect(slots.length).toBeGreaterThan(0);
  });

  it("returns fallback for unknown sport", () => {
    const slots = selectWeeklyTemplate("unknown_sport", "maintain", 3);
    expect(slots.length).toBeGreaterThan(0);
  });
});

describe("modulateWorkout", () => {
  const tempoTemplate = allTemplates.find((t) => t.id === "run-tempo")!;
  const easyTemplate = allTemplates.find((t) => t.id === "run-easy")!;

  it("returns rest for poor readiness", () => {
    const result = modulateWorkout(tempoTemplate, "poor", "running");
    expect(result.workoutType).toBe("rest");
  });

  it("substitutes easy on low readiness + hard workout", () => {
    const result = modulateWorkout(tempoTemplate, "low", "running");
    expect(result.workoutType).not.toBe("tempo_run");
    expect(result.targetHrZoneLow).toBeLessThanOrEqual(2);
  });

  it("reduces duration by ~10% on moderate readiness", () => {
    const result = modulateWorkout(tempoTemplate, "moderate", "running");
    expect(result.targetDurationMin).toBeLessThan(tempoTemplate.durationRange[0]);
  });

  it("executes as planned on high readiness", () => {
    const result = modulateWorkout(tempoTemplate, "high", "running");
    expect(result.targetDurationMin).toBe(tempoTemplate.durationRange[0]);
  });

  it("slightly increases on prime readiness", () => {
    const result = modulateWorkout(tempoTemplate, "prime", "running");
    expect(result.targetDurationMin).toBeGreaterThan(tempoTemplate.durationRange[0]);
  });
});

describe("generateDailyWorkout", () => {
  it("generates workout for a scheduled day", () => {
    const workout = generateDailyWorkout("running", "performance", 1, 5, "high", 0);
    expect(workout.sportType).toBe("running");
    expect(workout.title).toBeTruthy();
    expect(workout.structure.length).toBeGreaterThan(0);
  });

  it("returns rest for unscheduled day", () => {
    // Day 4 (Friday) is not in the 5-day running template
    const workout = generateDailyWorkout("running", "performance", 4, 5, "high", 0);
    expect(workout.workoutType).toBe("rest");
  });

  it("forces easy day after 2 consecutive hard days", () => {
    const workout = generateDailyWorkout("running", "performance", 1, 5, "high", 2);
    // Should not be a hard workout even though VO2 intervals are planned
    expect(workout.targetHrZoneHigh).toBeLessThanOrEqual(2);
  });

  it("promotes hard session on prime readiness + easy day planned", () => {
    // Monday (dayIndex 0) is easy_run in the 5-day template
    const workout = generateDailyWorkout("running", "performance", 0, 5, "prime", 0);
    // Should promote the VO2 intervals (dayIndex 1) to today
    expect(workout.targetHrZoneHigh).toBeGreaterThanOrEqual(4);
  });
});

describe("adjustDifficulty", () => {
  const baseWorkout = generateDailyWorkout("running", "performance", 1, 5, "high", 0);

  it("reduces duration and zones when easier", () => {
    const easier = adjustDifficulty(baseWorkout, "easier", "running");
    expect(easier.targetDurationMin).toBeLessThan(baseWorkout.targetDurationMin);
    expect(easier.targetHrZoneLow).toBeLessThanOrEqual(baseWorkout.targetHrZoneLow);
  });

  it("increases duration and zones when harder", () => {
    const harder = adjustDifficulty(baseWorkout, "harder", "running");
    expect(harder.targetDurationMin).toBeGreaterThan(baseWorkout.targetDurationMin);
  });
});
