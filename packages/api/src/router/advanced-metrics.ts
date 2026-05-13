import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, asc, desc, eq, gte, lte } from "@acme/db";
import { Activity, AdvancedMetric } from "@acme/db/schema";
import { computeDailyPMCSeries, computeStrainScore } from "@acme/engine";

import { protectedProcedure } from "../trpc";

/**
 * Build a daily PMC series live from the user's activities.
 *
 * Historically `AdvancedMetric` was a precomputed snapshot table populated
 * only by the seed script — there was no production job writing to it,
 * so for real users the table was empty and any chart consuming it showed
 * nothing while the gauge (live-computed) showed real values.
 *
 * This helper produces the same shape as the table rows on the fly using
 * the same canonical engine helper (`computeDailyPMCSeries`). The fallback
 * order is:
 *   1. If the AdvancedMetric table has rows for the user → use them
 *      (preserves any future cron/job that writes to it).
 *   2. Otherwise compute the series live from Activity strain.
 */
async function liveComputePMC(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  startISO: string,
  endISO: string,
): Promise<
  {
    userId: string;
    date: string;
    ctl: number | null;
    atl: number | null;
    tsb: number | null;
    acwr: number | null;
    rampRate: number | null;
    cp: number | null;
    wPrime: number | null;
    frc: number | null;
    mftp: number | null;
    tte: number | null;
    effectiveVo2max: number | null;
  }[]
> {
  const userId = ctx.session.user.id;

  // Pull 42 extra days of warmup so the leading EMA values settle before
  // the window the caller asked for.
  const warmupStart = new Date(startISO);
  warmupStart.setDate(warmupStart.getDate() - 42);

  const activities = await ctx.db.query.Activity.findMany({
    where: and(
      eq(Activity.userId, userId),
      gte(Activity.startedAt, warmupStart),
    ),
    orderBy: asc(Activity.startedAt),
  });

  if (activities.length === 0) return [];

  // Bucket strain by ISO date.
  const byDay = new Map<string, number>();
  for (const a of activities) {
    const day = a.startedAt.toISOString().split("T")[0]!;
    const s = a.strainScore ?? computeStrainScore(a.trimpScore ?? 0);
    byDay.set(day, (byDay.get(day) ?? 0) + s);
  }

  // Build chronological zero-padded array from warmupStart..end inclusive.
  const start = new Date(warmupStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endISO);
  end.setHours(0, 0, 0, 0);

  const dates: string[] = [];
  const loads: number[] = [];
  for (
    const cursor = new Date(start);
    cursor <= end;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const key = cursor.toISOString().split("T")[0]!;
    dates.push(key);
    loads.push(byDay.get(key) ?? 0);
  }

  const series = computeDailyPMCSeries(loads);

  // Trim warmup, then map to AdvancedMetric row shape (null for fields we
  // don't compute here — cp/wPrime/etc. are pace-power features owned by
  // a separate pipeline).
  const out = series
    .map((row, i) => ({ row, date: dates[i]! }))
    .filter(({ date }) => date >= startISO)
    .map(({ row, date }) => ({
      userId,
      date,
      ctl: row.ctl,
      atl: row.atl,
      tsb: row.tsb,
      acwr: row.acwr,
      rampRate: null,
      cp: null,
      wPrime: null,
      frc: null,
      mftp: null,
      tte: null,
      effectiveVo2max: null,
    }));

  return out;
}

export const advancedMetricsRouter = {
  list: protectedProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        days: z.number().min(7).max(365).default(90),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const today = new Date().toISOString().split("T")[0]!;
      const sinceDate = (() => {
        const d = new Date();
        d.setDate(d.getDate() - input.days);
        return d.toISOString().split("T")[0]!;
      })();
      const startISO = input.startDate ?? sinceDate;
      const endISO = input.endDate ?? today;

      const conditions = [
        eq(AdvancedMetric.userId, userId),
        gte(AdvancedMetric.date, startISO),
        lte(AdvancedMetric.date, endISO),
      ];

      const cached = await ctx.db.query.AdvancedMetric.findMany({
        where: and(...conditions),
        orderBy: asc(AdvancedMetric.date),
        limit: 365,
      });

      if (cached.length > 0) return cached;

      // No precomputed snapshot rows for this user — compute live from
      // activities. This is the common case in production today.
      return liveComputePMC(ctx, startISO, endISO);
    }),

  getLatest: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const cached = await ctx.db.query.AdvancedMetric.findFirst({
      where: eq(AdvancedMetric.userId, userId),
      orderBy: desc(AdvancedMetric.date),
    });
    if (cached) return cached;

    const today = new Date().toISOString().split("T")[0]!;
    const series = await liveComputePMC(ctx, today, today);
    return series[series.length - 1] ?? null;
  }),
} satisfies TRPCRouterRecord;
