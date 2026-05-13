/**
 * Tests for `getDailySummaryRange` — verifies the matview / live-table
 * fallback contract.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  _resetMatviewCacheForTests,
  _setMatviewAvailableForTests,
  getDailySummaryRange,
} from "../lib/dailySummary";

afterEach(() => {
  _resetMatviewCacheForTests();
  vi.restoreAllMocks();
});

/**
 * Minimal db stub. We only need the surface used by `getDailySummaryRange`:
 *   - `db.execute(sql)` → matview path
 *   - `db.query.DailyMetric.findMany` / `db.query.ReadinessScore.findMany`
 *     → fallback path
 */
function makeDb(opts: {
  matviewRows?: unknown[];
  metrics?: {
    date: string;
    hrv: number | null;
    restingHr: number | null;
    totalSleepMinutes: number | null;
    stressScore: number | null;
  }[];
  scores?: { date: string; score: number }[];
}) {
  const executeMock = vi.fn(async () => ({ rows: opts.matviewRows ?? [] }));
  const metricsMock = vi.fn(async () => opts.metrics ?? []);
  const scoresMock = vi.fn(async () => opts.scores ?? []);
  return {
    db: {
      execute: executeMock,
      query: {
        DailyMetric: { findMany: metricsMock },
        ReadinessScore: { findMany: scoresMock },
      },
    } as never,
    executeMock,
    metricsMock,
    scoresMock,
  };
}

describe("getDailySummaryRange", () => {
  it("reads from the matview when present", async () => {
    _setMatviewAvailableForTests(true);
    const { db, executeMock, metricsMock } = makeDb({
      matviewRows: [
        {
          date: "2026-03-15",
          hrv: 65,
          resting_hr: 52,
          total_sleep_minutes: 420,
          stress_score: 30,
          readiness_score: 78,
        },
        {
          date: "2026-03-16",
          hrv: 70,
          resting_hr: 50,
          total_sleep_minutes: 440,
          stress_score: 25,
          readiness_score: 82,
        },
      ],
    });

    const out = await getDailySummaryRange(db, "user-1", "2026-03-15");

    expect(out).toEqual([
      {
        date: "2026-03-15",
        hrv: 65,
        restingHr: 52,
        totalSleepMinutes: 420,
        stressScore: 30,
        readinessScore: 78,
      },
      {
        date: "2026-03-16",
        hrv: 70,
        restingHr: 50,
        totalSleepMinutes: 440,
        stressScore: 25,
        readinessScore: 82,
      },
    ]);
    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(metricsMock).not.toHaveBeenCalled();
  });

  it("falls back to live tables when matview is absent", async () => {
    _setMatviewAvailableForTests(false);
    const { db, executeMock, metricsMock, scoresMock } = makeDb({
      metrics: [
        {
          date: "2026-03-15",
          hrv: 65,
          restingHr: 52,
          totalSleepMinutes: 420,
          stressScore: 30,
        },
        {
          date: "2026-03-16",
          hrv: 70,
          restingHr: 50,
          totalSleepMinutes: 440,
          stressScore: 25,
        },
      ],
      scores: [{ date: "2026-03-16", score: 82 }],
    });

    const out = await getDailySummaryRange(db, "user-1", "2026-03-15");

    expect(out).toEqual([
      {
        date: "2026-03-15",
        hrv: 65,
        restingHr: 52,
        totalSleepMinutes: 420,
        stressScore: 30,
        readinessScore: null,
      },
      {
        date: "2026-03-16",
        hrv: 70,
        restingHr: 50,
        totalSleepMinutes: 440,
        stressScore: 25,
        readinessScore: 82,
      },
    ]);
    // No matview read — `execute` was never called because the cache was seeded.
    expect(executeMock).not.toHaveBeenCalled();
    expect(metricsMock).toHaveBeenCalledTimes(1);
    expect(scoresMock).toHaveBeenCalledTimes(1);
  });

  it("merges fallback DailyMetric + ReadinessScore by date", async () => {
    _setMatviewAvailableForTests(false);
    const { db } = makeDb({
      metrics: [
        {
          date: "2026-03-15",
          hrv: 65,
          restingHr: 52,
          totalSleepMinutes: 420,
          stressScore: 30,
        },
      ],
      // Score on a date that doesn't appear in metrics → should be dropped
      // (we return one row per DailyMetric, not the cross-join).
      scores: [
        { date: "2026-03-15", score: 78 },
        { date: "2026-03-99", score: 99 },
      ],
    });

    const out = await getDailySummaryRange(db, "user-1", "2026-03-15");

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ date: "2026-03-15", readinessScore: 78 });
  });

  it("probes matview presence exactly once across calls (cached)", async () => {
    _resetMatviewCacheForTests();
    const executeMock = vi
      .fn()
      // First call is the to_regclass probe.
      .mockResolvedValueOnce({ rows: [{ exists: true }] })
      // Subsequent calls return matview data.
      .mockResolvedValue({ rows: [] });
    const db = {
      execute: executeMock,
      query: {
        DailyMetric: { findMany: vi.fn() },
        ReadinessScore: { findMany: vi.fn() },
      },
    } as never;

    await getDailySummaryRange(db, "user-1", "2026-03-15");
    await getDailySummaryRange(db, "user-1", "2026-03-16");
    await getDailySummaryRange(db, "user-1", "2026-03-17");

    // 1 probe + 3 data reads, NOT 3 probes + 3 reads.
    expect(executeMock).toHaveBeenCalledTimes(4);
  });

  it("falls back gracefully when the probe itself throws", async () => {
    _resetMatviewCacheForTests();
    const executeMock = vi.fn().mockRejectedValueOnce(new Error("DB down"));
    const metricsMock = vi.fn().mockResolvedValue([]);
    const scoresMock = vi.fn().mockResolvedValue([]);
    const db = {
      execute: executeMock,
      query: {
        DailyMetric: { findMany: metricsMock },
        ReadinessScore: { findMany: scoresMock },
      },
    } as never;

    const out = await getDailySummaryRange(db, "user-1", "2026-03-15");

    expect(out).toEqual([]);
    // Probe failed → treated as "not available" → live-table path was used.
    expect(metricsMock).toHaveBeenCalledTimes(1);
    expect(scoresMock).toHaveBeenCalledTimes(1);
  });

  it("handles Date objects in the date column (live-table path)", async () => {
    _setMatviewAvailableForTests(false);
    const { db } = makeDb({
      metrics: [
        {
          date: new Date("2026-03-15T12:00:00Z") as unknown as string,
          hrv: 65,
          restingHr: 52,
          totalSleepMinutes: 420,
          stressScore: 30,
        },
      ],
      scores: [],
    });

    const out = await getDailySummaryRange(db, "user-1", "2026-03-15");

    expect(out[0]?.date).toBe("2026-03-15");
  });
});
