import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import type { db as _dependencies_db } from "@acme/db/client";
import { and, asc, desc, eq, gte } from "@acme/db";
import { Activity, DailyMetric, ReadinessScore } from "@acme/db/schema";
import {
  analyzeTrend,
  computeRollingAverage,
  computeStrainScore,
  findNotableChanges,
} from "@acme/engine";

import { protectedProcedure } from "../trpc";

type DB = typeof _dependencies_db;

const trendMetricEnum = z.enum([
  "readiness",
  "sleep",
  "hrv",
  "restingHr",
  "strain",
  "stress",
]);

/**
 * Aggregate activity strain scores by date.
 * Returns max strain per day (0-21 scale, TRIMP-based).
 * Falls back to computing strain from TRIMP if strainScore is NULL.
 */
async function fetchStrainByDate(
  db: DB,
  userId: string,
  since: string,
): Promise<{ date: string; value: number }[]> {
  const activities = await db.query.Activity.findMany({
    where: and(
      eq(Activity.userId, userId),
      gte(Activity.startedAt, new Date(since)),
    ),
    orderBy: asc(Activity.startedAt),
  });

  // Group by date, take max strain per day
  const byDate = new Map<string, number>();
  for (const a of activities) {
    const date = a.startedAt.toISOString().split("T")[0]!;
    const strain = a.strainScore ?? computeStrainScore(a.trimpScore ?? 0);
    const existing = byDate.get(date) ?? 0;
    byDate.set(date, Math.max(existing, strain));
  }

  return Array.from(byDate.entries())
    .map(([date, value]) => ({ date, value: Math.round(value * 10) / 10 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchMetricData(
  db: DB,
  userId: string,
  metric: z.infer<typeof trendMetricEnum>,
  since: string,
): Promise<{ date: string; value: number }[]> {
  // Strain is activity-derived — the daily_athlete_summary view does not
  // capture per-activity TRIMP, so we always read from the Activity table.
  if (metric === "strain") {
    return fetchStrainByDate(db, userId, since);
  }

  // Readiness lives in its own table (computed by the readiness engine).
  // Read it directly — same as getChart does — so the multi-metric overlay
  // is never affected by a stale or absent daily_athlete_summary matview.
  if (metric === "readiness") {
    const scores = await db.query.ReadinessScore.findMany({
      where: and(
        eq(ReadinessScore.userId, userId),
        gte(ReadinessScore.date, since),
      ),
      orderBy: asc(ReadinessScore.date),
    });
    return scores.map((s) => ({ date: s.date, value: s.score }));
  }

  // sleep / hrv / restingHr / stress — all live in DailyMetric.
  // Read directly from the live table (same path as getChart) so the
  // multi-metric chart never diverges from what individual metric charts show.
  const metrics = await db.query.DailyMetric.findMany({
    where: and(
      eq(DailyMetric.userId, userId),
      gte(DailyMetric.date, since),
    ),
    orderBy: asc(DailyMetric.date),
  });

  const fieldMap: Record<
    Exclude<z.infer<typeof trendMetricEnum>, "strain" | "readiness">,
    (row: (typeof metrics)[number]) => number | null
  > = {
    sleep: (r) => r.totalSleepMinutes,
    hrv: (r) => r.hrv,
    restingHr: (r) => r.restingHr,
    stress: (r) => r.stressScore,
  };

  const extractor = fieldMap[metric as Exclude<z.infer<typeof trendMetricEnum>, "strain" | "readiness">];
  return metrics.flatMap((r) => {
    const v = extractor(r);
    return v != null ? [{ date: r.date, value: v }] : [];
  });
}

function getDateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0]!;
}

export const trendsRouter = {
  getSummary: protectedProcedure
    .input(z.object({ period: z.enum(["7d", "28d"]).default("7d") }))
    .query(async ({ ctx, input }) => {
      const days = input.period === "7d" ? 7 : 28;
      const userId = ctx.session.user.id;
      // `gte(date, since)` is inclusive on both ends, so we need to subtract
      // one day to get exactly `days` calendar dates including today.
      // Previously: 7d window returned 8 distinct days (#157 — Insights
      // "This Week" showed "8 days tracked").
      const since = getDateString(days - 1);

      const readinessScores = await ctx.db.query.ReadinessScore.findMany({
        where: and(
          eq(ReadinessScore.userId, userId),
          gte(ReadinessScore.date, since),
        ),
        orderBy: desc(ReadinessScore.date),
      });

      const metrics = await ctx.db.query.DailyMetric.findMany({
        where: and(
          eq(DailyMetric.userId, userId),
          gte(DailyMetric.date, since),
        ),
        orderBy: desc(DailyMetric.date),
      });

      const avgReadiness =
        readinessScores.length > 0
          ? Math.round(
              readinessScores.reduce((sum, r) => sum + r.score, 0) /
                readinessScores.length,
            )
          : null;

      const avgSleep =
        metrics.filter((m) => m.totalSleepMinutes !== null).length > 0
          ? Math.round(
              metrics
                .filter((m) => m.totalSleepMinutes !== null)
                .reduce((sum, m) => sum + m.totalSleepMinutes!, 0) /
                metrics.filter((m) => m.totalSleepMinutes !== null).length,
            )
          : null;

      const avgHrv =
        metrics.filter((m) => m.hrv !== null).length > 0
          ? Math.round(
              (metrics
                .filter((m) => m.hrv !== null)
                .reduce((sum, m) => sum + m.hrv!, 0) /
                metrics.filter((m) => m.hrv !== null).length) *
                10,
            ) / 10
          : null;

      const stressVals = metrics
        .map((m) => m.stressScore)
        .filter((v): v is number => v !== null && v !== undefined);
      const avgStress =
        stressVals.length > 0
          ? Math.round(
              stressVals.reduce((sum, v) => sum + v, 0) / stressVals.length,
            )
          : null;

      return {
        period: input.period,
        avgReadiness,
        avgSleepMinutes: avgSleep,
        avgHrv,
        avgStress,
        totalDays: metrics.length,
        readinessScores: readinessScores.length,
      };
    }),

  getChart: protectedProcedure
    .input(
      z.object({
        metric: z.enum(["readiness", "sleep", "hrv", "strain", "stress"]),
        days: z.number().min(1).max(90).default(28),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const since = getDateString(input.days);

      if (input.metric === "readiness") {
        const scores = await ctx.db.query.ReadinessScore.findMany({
          where: and(
            eq(ReadinessScore.userId, userId),
            gte(ReadinessScore.date, since),
          ),
          orderBy: ReadinessScore.date,
        });
        return scores.map((s) => ({
          date: s.date,
          value: s.score,
        }));
      }

      // Strain = activity TRIMP-based load (0-21 scale)
      if (input.metric === "strain") {
        return fetchStrainByDate(ctx.db, userId, since);
      }

      // All other metrics from DailyMetric table
      const metrics = await ctx.db.query.DailyMetric.findMany({
        where: and(
          eq(DailyMetric.userId, userId),
          gte(DailyMetric.date, since),
        ),
        orderBy: DailyMetric.date,
      });

      return metrics.map((m) => ({
        date: m.date,
        value:
          input.metric === "sleep"
            ? m.totalSleepMinutes
            : input.metric === "hrv"
              ? m.hrv
              : m.stressScore,
      }));
    }),

  getLongTermTrend: protectedProcedure
    .input(
      z.object({
        metric: trendMetricEnum,
        period: z.enum(["30d", "90d", "180d", "365d"]),
      }),
    )
    .query(async ({ ctx, input }) => {
      const periodDays: Record<typeof input.period, number> = {
        "30d": 30,
        "90d": 90,
        "180d": 180,
        "365d": 365,
      };
      const days = periodDays[input.period];
      const userId = ctx.session.user.id;
      const since = getDateString(days);

      const values = await fetchMetricData(ctx.db, userId, input.metric, since);
      if (values.length === 0) return null;

      return analyzeTrend(values, input.metric, input.period);
    }),

  getRollingAverages: protectedProcedure
    .input(
      z.object({
        metric: trendMetricEnum,
        days: z.number().min(1).max(365),
        window: z.number().min(1).default(7),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const since = getDateString(input.days);

      const values = await fetchMetricData(ctx.db, userId, input.metric, since);

      return computeRollingAverage(values, input.window);
    }),

  getNotableChanges: protectedProcedure
    .input(
      z.object({
        metric: trendMetricEnum,
        days: z.number().min(1).max(365),
        threshold: z.number().min(0).default(5),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const since = getDateString(input.days);

      const values = await fetchMetricData(ctx.db, userId, input.metric, since);

      return findNotableChanges(values, input.metric, input.threshold);
    }),

  getMultiMetricChart: protectedProcedure
    .input(
      z.object({
        metrics: z.array(trendMetricEnum).min(1),
        days: z.number().min(1).max(365),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const since = getDateString(input.days);

      const hasStrain = input.metrics.includes("strain");
      const nonStrain = input.metrics.filter((m) => m !== "strain");
      const hasReadiness = nonStrain.includes("readiness");
      const dailyMetrics = nonStrain.filter((m) => m !== "readiness");

      // Fetch live tables once each — avoids N parallel queries for N metrics.
      const [strainData, readinessRows, dailyRows] = await Promise.all([
        hasStrain ? fetchStrainByDate(ctx.db, userId, since) : Promise.resolve([]),
        hasReadiness
          ? ctx.db.query.ReadinessScore.findMany({
              where: and(eq(ReadinessScore.userId, userId), gte(ReadinessScore.date, since)),
              orderBy: asc(ReadinessScore.date),
            })
          : Promise.resolve([]),
        dailyMetrics.length > 0
          ? ctx.db.query.DailyMetric.findMany({
              where: and(eq(DailyMetric.userId, userId), gte(DailyMetric.date, since)),
              orderBy: asc(DailyMetric.date),
            })
          : Promise.resolve([]),
      ]);

      const dailyFieldMap: Record<string, (r: (typeof dailyRows)[number]) => number | null> = {
        sleep: (r) => r.totalSleepMinutes,
        hrv: (r) => r.hrv,
        restingHr: (r) => r.restingHr,
        stress: (r) => r.stressScore,
      };

      const entries: [string, { date: string; value: number }[]][] = [];

      if (hasStrain) entries.push(["strain", strainData]);
      if (hasReadiness)
        entries.push(["readiness", readinessRows.map((s) => ({ date: s.date, value: s.score }))]);
      for (const metric of dailyMetrics) {
        const fn = dailyFieldMap[metric];
        if (!fn) continue;
        const series = dailyRows.flatMap((r) => {
          const v = fn(r);
          return v != null ? [{ date: r.date, value: v }] : [];
        });
        entries.push([metric, series]);
      }

      return Object.fromEntries(entries) as Record<string, { date: string; value: number }[]>;
    }),
} satisfies TRPCRouterRecord;
