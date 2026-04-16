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

/** Compute a rolling average over `window` days. */
function computeRolling(
  data: { date: string; value: number }[],
  window: number,
) {
  return data.map((d, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = data.slice(start, i + 1);
    const avg = slice.reduce((s, x) => s + x.value, 0) / slice.length;
    return { date: d.date, value: Math.round(avg * 10) / 10 };
  });
}

/** Compute baseline deviation as a percentage. */
function deviationPct(current: number, baseline: number): number | null {
  if (!baseline) return null;
  return Math.round(((current - baseline) / baseline) * 1000) / 10;
}

export const vitalsRouter = {
  /** SpO2, respiration rate, and skin temperature trends with baselines */
  getTrends: protectedProcedure
    .input(z.object({ days: z.number().min(7).max(365).default(30) }))
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

      // --- SpO2 ---
      const spo2Data = metrics
        .filter((m) => m.spo2 !== null)
        .map((m) => ({ date: m.date as string, value: m.spo2! }));

      const spo2Rolling7d = computeRolling(spo2Data, 7);
      const spo2Baseline =
        spo2Rolling7d.length > 0
          ? spo2Rolling7d[spo2Rolling7d.length - 1]!.value
          : null;
      const latestSpo2 =
        spo2Data.length > 0 ? spo2Data[spo2Data.length - 1]!.value : null;

      // --- Respiration Rate ---
      const rrData = metrics
        .filter((m) => m.respirationRate !== null)
        .map((m) => ({ date: m.date as string, value: m.respirationRate! }));

      const rrRolling7d = computeRolling(rrData, 7);
      const rrBaseline =
        rrRolling7d.length > 0
          ? rrRolling7d[rrRolling7d.length - 1]!.value
          : null;
      const latestRR =
        rrData.length > 0 ? rrData[rrData.length - 1]!.value : null;

      // --- Skin Temperature ---
      const skinTempData = metrics
        .filter((m) => m.skinTemp !== null)
        .map((m) => ({ date: m.date as string, value: m.skinTemp! }));

      const skinTempRolling7d = computeRolling(skinTempData, 7);
      const skinTempBaseline =
        skinTempRolling7d.length > 0
          ? skinTempRolling7d[skinTempRolling7d.length - 1]!.value
          : null;
      const latestSkinTemp =
        skinTempData.length > 0
          ? skinTempData[skinTempData.length - 1]!.value
          : null;

      // --- Status assessment ---
      const spo2Status: "normal" | "low" | "critical" | "no_data" =
        latestSpo2 === null
          ? "no_data"
          : latestSpo2 >= 95
            ? "normal"
            : latestSpo2 >= 90
              ? "low"
              : "critical";

      const rrStatus: "normal" | "elevated" | "high" | "no_data" =
        latestRR === null || rrBaseline === null
          ? "no_data"
          : latestRR <= rrBaseline + 1
            ? "normal"
            : latestRR <= rrBaseline + 3
              ? "elevated"
              : "high";

      const skinTempStatus: "normal" | "elevated" | "high" | "no_data" =
        latestSkinTemp === null || skinTempBaseline === null
          ? "no_data"
          : Math.abs(latestSkinTemp - skinTempBaseline) <= 0.3
            ? "normal"
            : Math.abs(latestSkinTemp - skinTempBaseline) <= 0.8
              ? "elevated"
              : "high";

      return {
        spo2: {
          daily: spo2Data,
          rolling7d: spo2Rolling7d,
          baseline: spo2Baseline,
          latest: latestSpo2,
          status: spo2Status,
          deviation:
            latestSpo2 && spo2Baseline
              ? deviationPct(latestSpo2, spo2Baseline)
              : null,
          daysWithData: spo2Data.length,
        },
        respirationRate: {
          daily: rrData,
          rolling7d: rrRolling7d,
          baseline: rrBaseline,
          latest: latestRR,
          status: rrStatus,
          deviation:
            latestRR && rrBaseline ? deviationPct(latestRR, rrBaseline) : null,
          daysWithData: rrData.length,
        },
        skinTemp: {
          daily: skinTempData,
          rolling7d: skinTempRolling7d,
          baseline: skinTempBaseline,
          latest: latestSkinTemp,
          status: skinTempStatus,
          deviation:
            latestSkinTemp && skinTempBaseline
              ? deviationPct(latestSkinTemp, skinTempBaseline)
              : null,
          daysWithData: skinTempData.length,
        },
      };
    }),
} satisfies TRPCRouterRecord;
