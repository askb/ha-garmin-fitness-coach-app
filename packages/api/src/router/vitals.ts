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

type DailyMetricRow = typeof DailyMetric.$inferSelect;
type TrendPoint = { date: string; value: number };
type MetricStatus =
  | "normal"
  | "low"
  | "critical"
  | "elevated"
  | "high"
  | "depleted"
  | "no_data";

/** Compute a rolling average over `window` days. */
function computeRolling(data: TrendPoint[], window: number) {
  return data.map((d, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = data.slice(start, i + 1);
    const avg = slice.reduce((s, x) => s + x.value, 0) / slice.length;
    return { date: d.date, value: Math.round(avg * 10) / 10 };
  });
}

/** Compute baseline deviation as a percentage. */
function deviationPct(current: number, baseline: number): number | null {
  if (baseline == null || baseline === 0) return null;
  return Math.round(((current - baseline) / baseline) * 1000) / 10;
}

/** Compute absolute deviation (for skin temperature). */
function deviationAbs(current: number, baseline: number): number | null {
  if (baseline == null) return null;
  return Math.round((current - baseline) * 10) / 10;
}

function latestValue(data: TrendPoint[]): number | null {
  return data.length > 0 ? data[data.length - 1]!.value : null;
}

function buildTrend(
  metrics: DailyMetricRow[],
  displaySince: string,
  getValue: (metric: DailyMetricRow) => number | null | undefined,
) {
  const allData = metrics
    .map((m) => ({ date: m.date as string, value: getValue(m) }))
    .filter((m): m is TrendPoint => m.value !== null && m.value !== undefined);
  const displayData = allData.filter((m) => m.date >= displaySince);
  const baselineWindow = allData.slice(-30);
  const baselineDays = baselineWindow.length;
  const baseline =
    baselineDays >= 30
      ? Math.round(
          (baselineWindow.reduce((sum, m) => sum + m.value, 0) / baselineDays) *
            10,
        ) / 10
      : null;

  return {
    daily: displayData,
    rolling7d: computeRolling(displayData, 7),
    baseline,
    latest: latestValue(displayData),
    daysWithData: displayData.length,
    baselineDays,
  };
}

function assessLowerIsBetter(
  latest: number | null,
  baseline: number | null,
): "normal" | "elevated" | "high" | "no_data" {
  if (latest === null || baseline === null) return "no_data";
  const deviation = deviationPct(latest, baseline);
  if (deviation === null) return "no_data";
  if (deviation <= 3) return "normal";
  if (deviation <= 7) return "elevated";
  return "high";
}

function assessHigherIsBetter(
  latest: number | null,
  baseline: number | null,
): "normal" | "low" | "critical" | "no_data" {
  if (latest === null || baseline === null) return "no_data";
  const deviation = deviationPct(latest, baseline);
  if (deviation === null) return "no_data";
  if (deviation >= -3) return "normal";
  if (deviation >= -7) return "low";
  return "critical";
}

export const vitalsRouter = {
  /** Recovery vitals from daily Garmin metrics with 30-day baselines. */
  getTrends: protectedProcedure
    .input(z.object({ days: z.number().min(7).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const displaySince = getDateString(input.days);
      const since = getDateString(Math.max(input.days, 30));

      const metrics = await ctx.db.query.DailyMetric.findMany({
        where: and(
          eq(DailyMetric.userId, userId),
          gte(DailyMetric.date, since),
        ),
        orderBy: asc(DailyMetric.date),
      });

      const spo2 = buildTrend(metrics, displaySince, (m) => m.spo2);
      const respirationRate = buildTrend(
        metrics,
        displaySince,
        (m) => m.respirationRate,
      );
      const skinTemp = buildTrend(metrics, displaySince, (m) => m.skinTemp);
      const restingHr = buildTrend(metrics, displaySince, (m) => m.restingHr);
      const bodyBattery = buildTrend(
        metrics,
        displaySince,
        (m) => m.bodyBatteryHigh ?? m.bodyBatteryEnd,
      );
      const stress = buildTrend(metrics, displaySince, (m) => m.stressScore);

      const spo2Status: "normal" | "low" | "critical" | "no_data" =
        spo2.latest === null
          ? "no_data"
          : spo2.latest >= 95
            ? "normal"
            : spo2.latest >= 90
              ? "low"
              : "critical";

      const skinTempStatus: "normal" | "elevated" | "high" | "no_data" =
        skinTemp.latest === null || skinTemp.baseline === null
          ? "no_data"
          : Math.abs(skinTemp.latest - skinTemp.baseline) <= 0.3
            ? "normal"
            : Math.abs(skinTemp.latest - skinTemp.baseline) <= 0.8
              ? "elevated"
              : "high";

      const bodyBatteryAssessment =
        bodyBattery.latest === null || bodyBattery.baseline === null
          ? null
          : assessHigherIsBetter(bodyBattery.latest, bodyBattery.baseline);
      const bodyBatteryStatus: MetricStatus =
        bodyBatteryAssessment === null
          ? "no_data"
          : bodyBatteryAssessment === "critical"
            ? "depleted"
            : bodyBatteryAssessment;

      return {
        spo2: {
          ...spo2,
          status: spo2Status,
          deviation:
            spo2.latest != null && spo2.baseline != null
              ? deviationPct(spo2.latest, spo2.baseline)
              : null,
        },
        respirationRate: {
          ...respirationRate,
          status: assessLowerIsBetter(
            respirationRate.latest,
            respirationRate.baseline,
          ),
          deviation:
            respirationRate.latest != null && respirationRate.baseline != null
              ? deviationPct(respirationRate.latest, respirationRate.baseline)
              : null,
        },
        skinTemp: {
          ...skinTemp,
          status: skinTempStatus,
          deviation:
            skinTemp.latest != null && skinTemp.baseline != null
              ? deviationAbs(skinTemp.latest, skinTemp.baseline)
              : null,
        },
        restingHr: {
          ...restingHr,
          status: assessLowerIsBetter(restingHr.latest, restingHr.baseline),
          deviation:
            restingHr.latest != null && restingHr.baseline != null
              ? deviationPct(restingHr.latest, restingHr.baseline)
              : null,
        },
        bodyBattery: {
          ...bodyBattery,
          status: bodyBatteryStatus,
          deviation:
            bodyBattery.latest != null && bodyBattery.baseline != null
              ? deviationPct(bodyBattery.latest, bodyBattery.baseline)
              : null,
        },
        stress: {
          ...stress,
          status: assessLowerIsBetter(stress.latest, stress.baseline),
          deviation:
            stress.latest != null && stress.baseline != null
              ? deviationPct(stress.latest, stress.baseline)
              : null,
        },
        bodyComposition: {
          hasData: false,
          weightKg: null,
          bodyFatPct: null,
          message: "Connect a Garmin Index scale",
        },
      };
    }),
} satisfies TRPCRouterRecord;
