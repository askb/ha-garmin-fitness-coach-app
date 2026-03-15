import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "@acme/db";
import { DailyWorkout } from "@acme/db/schema";
import { createTestCaller, db } from "./helpers";

const caller = createTestCaller();

const today = new Date().toISOString().split("T")[0]!;

describe("workout router", () => {
  beforeAll(async () => {
    // Remove any existing workout for today so getToday generates fresh
    await db
      .delete(DailyWorkout)
      .where(
        and(
          eq(DailyWorkout.userId, "seed-user-001"),
          eq(DailyWorkout.date, today),
        ),
      );
  });

  it("getToday returns a workout recommendation", async () => {
    const result = await caller.workout.getToday();
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("sportType");
    expect(result).toHaveProperty("workoutType");
    expect(result).toHaveProperty("title");
    expect(typeof result!.title).toBe("string");
  });

  it("adjustDifficulty with 'easier' returns modified workout", async () => {
    // Ensure a workout exists for today (getToday is idempotent)
    await caller.workout.getToday();

    const result = await caller.workout.adjustDifficulty({
      direction: "easier",
    });
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("title");
    expect(result).toHaveProperty("targetDurationMin");
    expect(result).toHaveProperty("explanation");
  });

  it("getWeekPlan returns array", async () => {
    const result = await caller.workout.getWeekPlan();
    expect(Array.isArray(result)).toBe(true);
    // Should contain at least today's workout
    expect(result.length).toBeGreaterThanOrEqual(0);
    for (const workout of result) {
      expect(workout).toHaveProperty("date");
      expect(workout).toHaveProperty("sportType");
    }
  });
});
