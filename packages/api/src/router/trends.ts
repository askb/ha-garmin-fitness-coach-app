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
  if (metric === "readiness") {
    const scores = await db.query.ReadinessScore.findMany({
      where: and(
        eq(ReadinessScore.userId, userId),
        gte(ReadinessScore.date, since),
      ),
      orderBy: ReadinessScore.date,
    });
    return scores.map((s) => ({ date: s.date, value: s.score }));
  }

  // Strain = activity-based TRIMP load (0-21), NOT daily HRV stress
  if (metric === "strain") {
    return fetchStrainByDate(db, userId, since);
  }

  const metrics = await db.query.DailyMetric.findMany({
    where: and(eq(DailyMetric.userId, userId), gte(DailyMetric.date, since)),
    orderBy: DailyMetric.date,
  });

  const fieldMap: Record<
    Exclude<z.infer<typeof trendMetricEnum>, "readiness" | "strain">,
    (m: (typeof metrics)[number]) => number | null
  > = {
    sleep: (m) => m.totalSleepMinutes,
    hrv: (m) => m.hrv,
    restingHr: (m) => m.restingHr,
    stress: (m) => m.stressScore,
  };

  const extractor = fieldMap[metric];
  return metrics
    .filter((m) => extractor(m) !== null)
    .map((m) => ({ date: m.date, value: extractor(m)! }));
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
      const since = getDateString(days);

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

      return {
        period: input.period,
        avgReadiness,
        avgSleepMinutes: avgSleep,
        avgHrv,
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
        threshold: z.number().min(0).default(10),
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

      const entries = await Promise.all(
        input.metrics.map(async (metric) => {
          const data = await fetchMetricData(ctx.db, userId, metric, since);
          return [metric, data] as const;
        }),
      );

      return Object.fromEntries(entries) as Record<
        string,
        { date: string; value: number }[]
      >;
    }),
} satisfies TRPCRouterRecord;
