import { describe, expect, it } from "vitest";

import { dayInTimezone, shiftIsoDay } from "../lib/timezone";

describe("dayInTimezone", () => {
  it("renders YYYY-MM-DD in UTC by default", () => {
    const d = new Date("2026-04-15T10:00:00Z");
    expect(dayInTimezone(d, undefined)).toBe("2026-04-15");
    expect(dayInTimezone(d, null)).toBe("2026-04-15");
    expect(dayInTimezone(d, "")).toBe("2026-04-15");
    expect(dayInTimezone(d, "UTC")).toBe("2026-04-15");
  });

  it("rolls forward to the next day for east-of-UTC zones", () => {
    // 23:30 UTC on Jan 14 is 10:30 next-day in Sydney (UTC+11 in summer).
    const lateUtc = new Date("2026-01-14T23:30:00Z");
    expect(dayInTimezone(lateUtc, "Australia/Sydney")).toBe("2026-01-15");
  });

  it("stays on the prior day for west-of-UTC zones", () => {
    // 02:30 UTC on Jan 15 is 18:30 PRIOR day in Los Angeles (UTC-8).
    const earlyUtc = new Date("2026-01-15T02:30:00Z");
    expect(dayInTimezone(earlyUtc, "America/Los_Angeles")).toBe("2026-01-14");
  });

  it("falls back to UTC when given an invalid timezone", () => {
    const d = new Date("2026-04-15T10:00:00Z");
    expect(dayInTimezone(d, "Mars/Olympus_Mons")).toBe("2026-04-15");
  });

  it("returns sentinel epoch day for an invalid Date instead of throwing", () => {
    // Guards against `RangeError: Invalid time value` propagating out of
    // `analytics.getTrainingLoads` / `getTrainingStatus` when an Activity
    // row has a malformed `startedAt` (seen in production logs).
    expect(dayInTimezone(new Date("not-a-date"), "UTC")).toBe("1970-01-01");
    expect(dayInTimezone(new Date(NaN), "Australia/Sydney")).toBe(
      "1970-01-01",
    );
  });
});

describe("shiftIsoDay", () => {
  it("steps backwards across a month boundary", () => {
    expect(shiftIsoDay("2026-03-02", -3)).toBe("2026-02-27");
  });

  it("steps backwards across a year boundary", () => {
    expect(shiftIsoDay("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("is a no-op for delta=0", () => {
    expect(shiftIsoDay("2026-06-15", 0)).toBe("2026-06-15");
  });

  it("steps forwards", () => {
    expect(shiftIsoDay("2026-06-15", 7)).toBe("2026-06-22");
  });

  it("survives DST spring-forward (US, Mar 9 2026)", () => {
    // Anchoring at noon UTC means the +/- 1h skip never crosses local midnight.
    expect(shiftIsoDay("2026-03-08", 1)).toBe("2026-03-09");
    expect(shiftIsoDay("2026-03-09", -1)).toBe("2026-03-08");
  });
});
