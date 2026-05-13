/**
 * Read helper for the `daily_athlete_summary` materialized view.
 *
 * The view is created and refreshed by the **addon** side (see
 * `pulsecoach/rootfs/app/sql/create_daily_athlete_summary.sql` and
 * `refresh_daily_athlete_summary()` in the sync pipeline). The app treats it
 * as a *read-only optimization*: when present we issue one indexed scan
 * instead of three separate table queries; when absent (e.g. fresh install,
 * or matview SQL has not yet run) we fall back to the live tables.
 *
 * Detection is cached for the lifetime of the Node process — the matview
 * lifecycle is install-time, not request-time, so re-probing on every call
 * would be wasted work.
 */

import type { db as drizzleDb } from "@acme/db/client";
import { and, asc, eq, gte, sql } from "@acme/db";
import { DailyMetric, ReadinessScore } from "@acme/db/schema";

type DB = typeof drizzleDb;

export interface DailySummaryRow {
  date: string;
  hrv: number | null;
  restingHr: number | null;
  totalSleepMinutes: number | null;
  stressScore: number | null;
  readinessScore: number | null;
}

let matviewAvailable: boolean | null = null;

/**
 * Probe (once) whether `daily_athlete_summary` exists in the current DB.
 * Uses `to_regclass`, which returns NULL for missing relations without
 * raising — so this is safe even on a brand-new install.
 */
async function isMatviewAvailable(db: DB): Promise<boolean> {
  if (matviewAvailable !== null) return matviewAvailable;
  try {
    const result = await db.execute<{ exists: boolean }>(
      sql`SELECT to_regclass('public.daily_athlete_summary') IS NOT NULL AS exists`,
    );
    const row = (result as unknown as { rows: { exists: boolean }[] }).rows[0];
    matviewAvailable = row?.exists === true;
  } catch {
    matviewAvailable = false;
  }
  return matviewAvailable;
}

/** Test-only: reset the cached detection so a unit test can flip availability. */
export function _resetMatviewCacheForTests(): void {
  matviewAvailable = null;
}

/** Test-only: explicitly seed the detection cache. */
export function _setMatviewAvailableForTests(value: boolean): void {
  matviewAvailable = value;
}

function isoDate(value: string | Date): string {
  if (typeof value === "string")
    return value.length >= 10 ? value.slice(0, 10) : value;
  return value.toISOString().slice(0, 10);
}

/**
 * Fetch a per-day series of {date, hrv, restingHr, totalSleepMinutes,
 * stressScore, readinessScore} for `userId` from `since` (inclusive,
 * `YYYY-MM-DD`) onward, sorted ascending.
 *
 * Single source of truth: prefers the matview when present; otherwise
 * issues the equivalent two-table query (DailyMetric LEFT JOIN
 * ReadinessScore) so callers get identical shape either way.
 */
export async function getDailySummaryRange(
  db: DB,
  userId: string,
  since: string,
): Promise<DailySummaryRow[]> {
  if (await isMatviewAvailable(db)) {
    const result = await db.execute<{
      date: string | Date;
      hrv: number | null;
      resting_hr: number | null;
      total_sleep_minutes: number | null;
      stress_score: number | null;
      readiness_score: number | null;
    }>(sql`
      SELECT
        date,
        hrv,
        resting_hr,
        total_sleep_minutes,
        stress_score,
        readiness_score
      FROM daily_athlete_summary
      WHERE user_id = ${userId} AND date >= ${since}
      ORDER BY date ASC
    `);
    const rows = (
      result as unknown as {
        rows: Array<{
          date: string | Date;
          hrv: number | null;
          resting_hr: number | null;
          total_sleep_minutes: number | null;
          stress_score: number | null;
          readiness_score: number | null;
        }>;
      }
    ).rows;
    return rows.map((r) => ({
      date: isoDate(r.date),
      hrv: r.hrv,
      restingHr: r.resting_hr,
      totalSleepMinutes: r.total_sleep_minutes,
      stressScore: r.stress_score,
      readinessScore: r.readiness_score,
    }));
  }

  // Fallback: live tables. Two queries since DailyMetric and ReadinessScore
  // are independent — merge in memory by date.
  const [metrics, scores] = await Promise.all([
    db.query.DailyMetric.findMany({
      where: and(eq(DailyMetric.userId, userId), gte(DailyMetric.date, since)),
      orderBy: asc(DailyMetric.date),
    }),
    db.query.ReadinessScore.findMany({
      where: and(
        eq(ReadinessScore.userId, userId),
        gte(ReadinessScore.date, since),
      ),
      orderBy: asc(ReadinessScore.date),
    }),
  ]);

  const scoreByDate = new Map<string, number>();
  for (const s of scores) scoreByDate.set(isoDate(s.date), s.score);

  return metrics.map((m) => {
    const date = isoDate(m.date);
    return {
      date,
      hrv: m.hrv,
      restingHr: m.restingHr,
      totalSleepMinutes: m.totalSleepMinutes,
      stressScore: m.stressScore,
      readinessScore: scoreByDate.get(date) ?? null,
    };
  });
}
