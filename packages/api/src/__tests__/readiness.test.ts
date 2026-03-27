import { beforeAll, describe, expect, it } from "vitest";

import { and, eq } from "@acme/db";
import { ReadinessScore } from "@acme/db/schema";

import { createTestCaller, db } from "./helpers";

const caller = createTestCaller();

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const today = new Date().toISOString().split("T")[0]!;

describe("readiness router", () => {
  beforeAll(async () => {
    // Remove any existing readiness score for today so getToday computes fresh
    await db
      .delete(ReadinessScore)
      .where(
        and(
          eq(ReadinessScore.userId, "seed-user-001"),
          eq(ReadinessScore.date, today),
        ),
      );
  });

  it("getToday returns a readiness score", async () => {
    const result = await caller.readiness.getToday();
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("zone");
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(typeof result!.score).toBe("number");
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result!.score).toBeGreaterThanOrEqual(0);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result!.score).toBeLessThanOrEqual(100);
  });

  it("getHistory returns array of scores", async () => {
    const result = await caller.readiness.getHistory({ days: 28 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("score");
    expect(result[0]).toHaveProperty("date");
  });

  it("getAnomalies returns anomaly array", async () => {
    const result = await caller.readiness.getAnomalies();
    expect(Array.isArray(result)).toBe(true);
    // Each anomaly should have a metric and description
    for (const anomaly of result) {
      expect(anomaly).toHaveProperty("metric");
    }
  });
});
