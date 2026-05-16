import { afterEach, describe, expect, it } from "vitest";

import { dayInTimezone, shiftIsoDay, todayInTimezone } from "../lib/timezone";

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    expect(dayInTimezone(new Date(NaN), "Australia/Sydney")).toBe("1970-01-01");
  });

  // ---------------------------------------------------------------------
  // Regression: Alpine / HA addon minimal-ICU locale fallback
  // ---------------------------------------------------------------------
  // The HA addon base image's Alpine `nodejs=~22` package ships a minimal
  // ICU build (system-icu) without the en-CA CLDR data. In that environment
  // `Intl.DateTimeFormat('en-CA', …).format()` silently falls back to
  // en-US `MM/DD/YYYY`, which previously broke `shiftIsoDay` and crashed
  // `analytics.getTrainingLoads` / `getTrainingStatus` with
  // `RangeError: Invalid time value`. We fixed this by switching to
  // `formatToParts()` (locale-independent because each field is named).
  // These tests pin that behaviour so the bug can never regress.
  describe("regression: Alpine ICU en-CA fallback", () => {
    it("output is always YYYY-MM-DD across many timezones", () => {
      const d = new Date("2026-05-15T10:00:00Z");
      const zones = [
        "UTC",
        "Australia/Sydney",
        "Australia/Perth",
        "America/Los_Angeles",
        "America/New_York",
        "Europe/London",
        "Europe/Berlin",
        "Asia/Tokyo",
        "Asia/Kolkata",
        "Pacific/Auckland",
      ];
      for (const zone of zones) {
        expect(
          dayInTimezone(d, zone),
          `zone=${zone} must produce YYYY-MM-DD`,
        ).toMatch(ISO_DAY_RE);
      }
    });

    it("never returns MM/DD/YYYY even when the locale falls back to en-US", () => {
      // Simulate the exact Alpine minimal-ICU pathology: `format()` returns
      // en-US `MM/DD/YYYY` instead of `YYYY-MM-DD`. `formatToParts()` must
      // still produce the correct named-field types because parts are named
      // by contract, not by locale string order. We mock the global rather
      // than subclassing `Intl.DateTimeFormat` (V8 internal-slot classes
      // don't subclass cleanly — `super.formatToParts()` throws).
      //
      // NOTE: Uses a fresh IANA zone ("Indian/Mauritius") to bypass the
      // module-level `FORMATTER_CACHE`, otherwise the previously-cached
      // real formatter would be reused and the stub would be inert.
      const RealDTF = Intl.DateTimeFormat;
      function FallbackDTF(
        _locale?: string | string[],
        opts?: Intl.DateTimeFormatOptions,
      ) {
        const real = new RealDTF("en-CA", opts);
        return {
          // Pretend `format()` fell back to en-US `MM/DD/YYYY`.
          format(date?: Date | number) {
            const parts = real.formatToParts(date ?? new Date());
            const get = (t: string) =>
              parts.find((p) => p.type === t)?.value ?? "??";
            return `${get("month")}/${get("day")}/${get("year")}`;
          },
          // `formatToParts` keeps real semantics — that's what the fix uses.
          formatToParts(date?: Date | number) {
            return real.formatToParts(date ?? new Date());
          },
          resolvedOptions: () => real.resolvedOptions(),
        };
      }
      // Swap ONLY `Intl.DateTimeFormat` rather than the whole `Intl`
      // namespace: most `Intl.*` properties are non-enumerable, so
      // `{ ...Intl }` is `{}` and spreading would wipe `NumberFormat`,
      // `Collator`, etc., for the rest of the suite. Restore in afterEach.
      const originalDTF = Intl.DateTimeFormat;
      (Intl as unknown as { DateTimeFormat: unknown }).DateTimeFormat =
        FallbackDTF;
      try {
        const result = dayInTimezone(
          new Date("2026-05-15T10:00:00Z"),
          "Indian/Mauritius",
        );

        expect(result).toMatch(ISO_DAY_RE);
        expect(result).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
        // And it must remain round-trippable through shiftIsoDay (the
        // actual production throw site).
        expect(() => shiftIsoDay(result, -1)).not.toThrow();
        expect(shiftIsoDay(result, -1)).toMatch(ISO_DAY_RE);
      } finally {
        (Intl as unknown as { DateTimeFormat: unknown }).DateTimeFormat =
          originalDTF;
      }
    });

    it("dayInTimezone output is always accepted by shiftIsoDay (round-trip)", () => {
      // Pin the contract between the two helpers: whatever `dayInTimezone`
      // emits must be a valid input to `shiftIsoDay`, otherwise
      // `aggregateDailyLoads` (which composes them) throws.
      const dates = [
        new Date("2026-01-01T00:00:00Z"),
        new Date("2026-06-15T23:59:59Z"),
        new Date("2026-12-31T23:30:00Z"),
        new Date("2026-03-09T02:30:00Z"), // US DST spring-forward
        new Date("2026-04-05T02:30:00Z"), // AU DST autumn-back
      ];
      const zones = ["UTC", "Australia/Sydney", "America/Los_Angeles"];
      for (const date of dates) {
        for (const zone of zones) {
          const day = dayInTimezone(date, zone);
          expect(day).toMatch(ISO_DAY_RE);
          for (const delta of [-28, -7, -1, 0, 1, 7, 28]) {
            expect(() => shiftIsoDay(day, delta)).not.toThrow();
            expect(shiftIsoDay(day, delta)).toMatch(ISO_DAY_RE);
          }
        }
      }
    });

    it("todayInTimezone never throws and returns YYYY-MM-DD", () => {
      // The production call chain is `todayInTimezone(profile.tz)` →
      // `shiftIsoDay(today, -N)` for every day in the load window. If
      // `todayInTimezone` ever returns a non-ISO string, every analytics
      // load query crashes.
      expect(todayInTimezone("Australia/Sydney")).toMatch(ISO_DAY_RE);
      expect(todayInTimezone("UTC")).toMatch(ISO_DAY_RE);
      expect(todayInTimezone(null)).toMatch(ISO_DAY_RE);
      expect(todayInTimezone(undefined)).toMatch(ISO_DAY_RE);
      expect(todayInTimezone("")).toMatch(ISO_DAY_RE);
      expect(todayInTimezone("Bogus/Timezone")).toMatch(ISO_DAY_RE);
    });
  });

  afterEach(() => {
    // No-op: stub/restore is scoped to a try/finally inside each test
    // that mocks `Intl.DateTimeFormat`. Kept here for future tests.
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
