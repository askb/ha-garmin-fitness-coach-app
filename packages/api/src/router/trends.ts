import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, gte } from "@acme/db";
import { DailyMetric, ReadinessScore } from "@acme/db/schema";

import { protectedProcedure } from "../trpc";

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
              metrics
                .filter((m) => m.hrv !== null)
                .reduce((sum, m) => sum + m.hrv!, 0) /
                metrics.filter((m) => m.hrv !== null).length * 10,
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
        metric: z.enum(["readiness", "sleep", "hrv", "strain"]),
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
              : m.garminTrainingLoad,
      }));
    }),
} satisfies TRPCRouterRecord;
