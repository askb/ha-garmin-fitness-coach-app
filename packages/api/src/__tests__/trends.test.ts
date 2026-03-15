import { describe, it, expect } from "vitest";
import { createTestCaller } from "./helpers";

const caller = createTestCaller();

describe("trends router", () => {
  it("getSummary returns avgReadiness, avgSleepMinutes, avgHrv", async () => {
    const result = await caller.trends.getSummary({ period: "28d" });
    expect(result).toHaveProperty("avgReadiness");
    expect(result).toHaveProperty("avgSleepMinutes");
    expect(result).toHaveProperty("avgHrv");
    expect(result).toHaveProperty("period", "28d");
    expect(result).toHaveProperty("totalDays");
    expect(result.totalDays).toBeGreaterThan(0);
  });

  it("getChart returns date/value pairs", async () => {
    const result = await caller.trends.getChart({
      metric: "sleep",
      days: 28,
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("date");
    expect(result[0]).toHaveProperty("value");
  });
});
