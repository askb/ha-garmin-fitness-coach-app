import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, asc, eq, gte } from "@acme/db";
import { DailyMetric } from "@acme/db/schema";

import { protectedProcedure } from "../trpc";

function getDateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0]!;
}

export const hrvRouter = {
  /** Full HRV analysis: daily values, rolling averages, baseline, CV% */
  getAnalysis: protectedProcedure
    .input(z.object({ days: z.number().min(7).max(365).default(90) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const since = getDateString(input.days);

      const metrics = await ctx.db.query.DailyMetric.findMany({
        where: and(
          eq(DailyMetric.userId, userId),
          gte(DailyMetric.date, since),
        ),
        orderBy: asc(DailyMetric.date),
      });

      const hrvData = metrics
        .filter((m) => m.hrv !== null)
        .map((m) => ({ date: m.date, value: m.hrv! }));

      if (hrvData.length === 0) {
        return {
          daily: [],
          rolling7d: [],
          rolling14d: [],
          baseline: null,
          cv: null,
          status: "insufficient_data" as const,
          summary: null,
        };
      }

      // Compute rolling averages
      const rolling7d = computeRolling(hrvData, 7);
      const rolling14d = computeRolling(hrvData, 14);

      // Baseline = 14-day rolling average of the latest value
      const baseline =
        rolling14d.length > 0 ? rolling14d[rolling14d.length - 1]!.value : null;

      // CV% over last 7 days (coefficient of variation = std/mean * 100)
      const last7 = hrvData.slice(-7);
      const mean7 = last7.reduce((s, d) => s + d.value, 0) / last7.length;
      const std7 = Math.sqrt(
        last7.reduce((s, d) => s + (d.value - mean7) ** 2, 0) / last7.length,
      );
      const cv = Math.round((std7 / mean7) * 1000) / 10; // one decimal

      // Recovery status
      const latestHrv = hrvData[hrvData.length - 1]!.value;
      const status = determineRecoveryStatus(latestHrv, baseline, cv);

      // Summary stats
      const allValues = hrvData.map((d) => d.value);
      const summary = {
        current: latestHrv,
        avg7d: Math.round(mean7 * 10) / 10,
        baseline: baseline ? Math.round(baseline * 10) / 10 : null,
        cv,
        min: Math.round(Math.min(...allValues) * 10) / 10,
        max: Math.round(Math.max(...allValues) * 10) / 10,
        daysWithData: hrvData.length,
        deviationFromBaseline: baseline
          ? Math.round(((latestHrv - baseline) / baseline) * 1000) / 10
          : null,
      };

      return {
        daily: hrvData,
        rolling7d,
        rolling14d,
        baseline,
        cv,
        status,
        summary,
      };
    }),
} satisfies TRPCRouterRecord;

function computeRolling(
  data: { date: string; value: number }[],
  window: number,
): { date: string; value: number }[] {
  const result: { date: string; value: number }[] = [];
  for (let i = window - 1; i < data.length; i++) {
    const windowData = data.slice(i - window + 1, i + 1);
    const avg = windowData.reduce((s, d) => s + d.value, 0) / windowData.length;
    result.push({ date: data[i]!.date, value: Math.round(avg * 10) / 10 });
  }
  return result;
}

function determineRecoveryStatus(
  current: number,
  baseline: number | null,
  cv: number,
): "recovered" | "recovering" | "strained" | "insufficient_data" {
  if (!baseline) return "insufficient_data";
  const deviation = ((current - baseline) / baseline) * 100;
  if (cv > 15) return "strained"; // high variability = stressed
  if (deviation >= 5) return "recovered"; // above baseline
  if (deviation >= -5) return "recovering"; // within 5% of baseline
  return "strained"; // below baseline
}
