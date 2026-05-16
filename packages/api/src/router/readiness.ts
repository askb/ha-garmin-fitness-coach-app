import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import type { Baselines, DailyMetricInput } from "@acme/engine";
import { and, desc, eq, gte, lte } from "@acme/db";
import {
  Activity,
  DailyMetric,
  Profile,
  ReadinessScore,
} from "@acme/db/schema";
import {
  calculateReadiness,
  computeBaselines,
  computeStrainScore,
  computeTargetStrain,
  computeTRIMP,
  detectAnomalies,
  getReadinessZone,
} from "@acme/engine";

import { protectedProcedure } from "../trpc";

export type DataQualityStatus = "good" | "missing" | "stale";

export interface DataQuality {
  hrv: DataQualityStatus;
  sleep: DataQualityStatus;
  restingHr: DataQualityStatus;
  trainingLoad: DataQualityStatus;
}

function daysBetween(dateStr: string, today: string): number {
  return Math.floor(
    (new Date(today).getTime() - new Date(dateStr).getTime()) /
      (1000 * 60 * 60 * 24),
  );
}

export function computeDataQuality(
  metric: typeof DailyMetric.$inferSelect | null,
  recentMetrics: (typeof DailyMetric.$inferSelect)[],
  recentActivityCount: number,
  today: string,
): DataQuality {
  const metricDate =
    metric?.date != null
      ? typeof metric.date === "string"
        ? metric.date
        : (metric.date as Date).toISOString().split("T")[0]!
      : null;
  const daysOld = metricDate ? daysBetween(metricDate, today) : 999;
  const stale = daysOld > 3;

  // Garmin publishes daily HRV / sleep / RHR with a delay — today's row is
  // often created by an activity sync hours before the next-morning health
  // snapshot lands. Treat each field as "good" if any of the last 3 days
  // has a value, "stale" if the most recent value is 4-7 days old, and
  // "missing" only when there has been no value for >7 days. This matches
  // how the engine actually consumes these metrics (it uses the most recent
  // non-null reading against the baseline window).
  function fieldQuality(
    pick: (row: typeof DailyMetric.$inferSelect) => number | null | undefined,
  ): DataQualityStatus {
    const todayValue = metric ? pick(metric) : null;
    if (todayValue != null) return stale ? "stale" : "good";
    for (const row of recentMetrics) {
      const v = pick(row);
      if (v != null) {
        const rowDate =
          typeof row.date === "string"
            ? row.date
            : (row.date as Date).toISOString().split("T")[0]!;
        const age = daysBetween(rowDate, today);
        if (age <= 3) return "good";
        if (age <= 7) return "stale";
        return "missing";
      }
    }
    return "missing";
  }

  return {
    hrv: fieldQuality((r) => r.hrv),
    sleep: fieldQuality((r) => r.totalSleepMinutes),
    restingHr: fieldQuality((r) => r.restingHr),
    trainingLoad:
      recentActivityCount === 0 ? "missing" : daysOld > 7 ? "stale" : "good",
  };
}

function computeConfidence(dq: DataQuality): number {
  let confidence = 1.0;
  if (dq.hrv !== "good") confidence -= 0.15;
  if (dq.sleep !== "good") confidence -= 0.1;
  if (dq.restingHr !== "good") confidence -= 0.1;
  if (dq.trainingLoad !== "good") confidence -= 0.1;
  return Math.max(confidence, 0.3);
}

export function buildActionSuggestion(
  score: number,
  dq: DataQuality,
  metric: typeof DailyMetric.$inferSelect | null,
  recentMetrics: (typeof DailyMetric.$inferSelect)[] = [],
): string {
  if (score >= 80) {
    return "You're well recovered — today is a good day for a quality session or race effort.";
  }
  if (score >= 60) {
    return "Moderate readiness — stick to planned training but listen to your body.";
  }
  // Below 60: find worst component. Use the same lookback as the engine —
  // today's row may not have HRV yet (Garmin publishes daily HRV the next
  // morning), but a fresh reading from the last few days is still actionable.
  const recentHrv =
    metric?.hrv ??
    recentMetrics.find((r) => r.hrv != null)?.hrv ??
    null;
  if (dq.hrv === "missing") {
    return "Take it easy today — HRV data is unavailable. Consider an easy 30-min walk instead of your planned session.";
  }
  if (recentHrv != null) {
    return `Take it easy today — your HRV of ${recentHrv.toFixed(0)}ms is below baseline. Consider an easy 30-min walk instead of your planned session.`;
  }
  if (dq.sleep !== "good" || metric?.sleepDebtMinutes != null) {
    const debt = metric?.sleepDebtMinutes ?? 0;
    if (debt > 0) {
      const h = Math.floor(debt / 60);
      const m = debt % 60;
      return `Prioritize ${h > 0 ? `${h}h ` : ""}${m}m of sleep tonight to recover accumulated sleep debt.`;
    }
    return "Prioritize extra sleep tonight to support recovery.";
  }
  return "Your recent training load is high. Today's session should be low-intensity (Zone 1-2 only) or complete rest.";
}

// Convert a DB row to engine input
function toMetricInput(row: typeof DailyMetric.$inferSelect): DailyMetricInput {
  return {
    date: typeof row.date === "string" ? row.date : row.date,
    sleepScore: row.sleepScore,
    totalSleepMinutes: row.totalSleepMinutes,
    deepSleepMinutes: row.deepSleepMinutes,
    remSleepMinutes: row.remSleepMinutes,
    lightSleepMinutes: row.lightSleepMinutes,
    awakeMinutes: row.awakeMinutes,
    hrv: row.hrv,
    restingHr: row.restingHr,
    maxHr: row.maxHr,
    stressScore: row.stressScore,
    bodyBatteryStart: row.bodyBatteryStart,
    bodyBatteryEnd: row.bodyBatteryEnd,
    steps: row.steps,
    calories: row.calories,
    garminTrainingReadiness: row.garminTrainingReadiness,
    garminTrainingLoad: row.garminTrainingLoad,
    respirationRate: row.respirationRate ?? null,
    spo2: row.spo2 ?? null,
    skinTemp: row.skinTemp ?? null,
    intensityMinutes: row.intensityMinutes ?? null,
    floorsClimbed: row.floorsClimbed ?? null,
    bodyBatteryHigh: row.bodyBatteryHigh ?? null,
    bodyBatteryLow: row.bodyBatteryLow ?? null,
    hrvOvernight: row.hrvOvernight ?? null,
    sleepStartTime: row.sleepStartTime ?? null,
    sleepEndTime: row.sleepEndTime ?? null,
    sleepNeedMinutes: row.sleepNeedMinutes ?? null,
    sleepDebtMinutes: row.sleepDebtMinutes ?? null,
  };
}

function getDateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0]!;
}

// Legacy debug-style explanations look like:
//   "Buchheit composite: 67/100 (hrv=74, sleep=52, load=36, ...)"
// Detect them so we can replace with a clean message at read-time.
function isLegacyDebugExplanation(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return (
    t.includes("composite:") ||
    /hrv=\d/.test(t) ||
    /(load|stress|rhr|spo2|rr)=\d/.test(t)
  );
}

function defaultZoneExplanation(zone: string | null): string {
  switch (zone) {
    case "prime":
      return "Prime readiness — great day for intensity.";
    case "high":
      return "High readiness — normal training day.";
    case "moderate":
      return "Moderate readiness — stick to planned training but listen to your body.";
    case "low":
      return "Low readiness — take it easy today.";
    case "poor":
      return "Poor readiness — rest or light recovery only.";
    default:
      return "Metrics are close to your baseline — normal training day.";
  }
}

export const readinessRouter = {
  getToday: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const today = getDateString(0);

    // Always fetch today's metric for confidence/quality computation
    const todayDbMetric = await ctx.db.query.DailyMetric.findFirst({
      where: and(eq(DailyMetric.userId, userId), eq(DailyMetric.date, today)),
    });

    // Fetch the last 8 days of metrics so computeDataQuality can fall back
    // to the most recent non-null reading for each field (HRV, sleep, RHR).
    const recentMetricsForDQ = await ctx.db.query.DailyMetric.findMany({
      where: and(
        eq(DailyMetric.userId, userId),
        gte(DailyMetric.date, getDateString(8)),
      ),
      orderBy: desc(DailyMetric.date),
    });

    // Fetch recent activities to determine training load data quality
    const recentActivities = await ctx.db.query.Activity.findMany({
      where: and(
        eq(Activity.userId, userId),
        gte(Activity.startedAt, new Date(Date.now() - 7 * 86400000)),
      ),
      orderBy: desc(Activity.startedAt),
    });

    const dq = computeDataQuality(
      todayDbMetric ?? null,
      recentMetricsForDQ,
      recentActivities.length,
      today,
    );
    const confidence = computeConfidence(dq);
    const doNotOverinterpret = confidence < 0.5;

    // Check if already computed today
    const existing = await ctx.db.query.ReadinessScore.findFirst({
      where: and(
        eq(ReadinessScore.userId, userId),
        eq(ReadinessScore.date, today),
      ),
    });
    if (existing) {
      const actionSuggestion = buildActionSuggestion(
        existing.score,
        dq,
        todayDbMetric ?? null,
        recentMetricsForDQ,
      );
      // Sanitize stale debug-style explanations written by older builds of
      // the engine, e.g.:
      //   "Buchheit composite: 67/100 (hrv=74, sleep=52, load=36, ...)"
      // The current generateExplanation() never emits this shape, but older
      // rows persist in ReadinessScore. Replace with a generic zone-based
      // message until the row is recomputed.
      const explanation =
        existing.explanation && isLegacyDebugExplanation(existing.explanation)
          ? defaultZoneExplanation(existing.zone)
          : existing.explanation;
      return {
        ...existing,
        explanation,
        confidence,
        dataQuality: dq,
        actionSuggestion,
        doNotOverinterpret,
      };
    }

    // Compute fresh
    const recentMetrics = await ctx.db.query.DailyMetric.findMany({
      where: and(
        eq(DailyMetric.userId, userId),
        gte(DailyMetric.date, getDateString(30)),
      ),
      orderBy: desc(DailyMetric.date),
      limit: 30,
    });

    if (recentMetrics.length === 0) {
      return null; // No data yet
    }

    const profile = await ctx.db.query.Profile.findFirst({
      where: eq(Profile.userId, userId),
    });

    const metricInputs = recentMetrics.map(toMetricInput);
    const baselines = computeBaselines(metricInputs, profile?.sex ?? null);

    // Compute strain scores from recent activities
    const recentStrainScores = recentActivities.map(
      (a) => a.strainScore ?? computeStrainScore(a.trimpScore ?? 0),
    );

    const todayMetric = metricInputs[0]!;
    const result = calculateReadiness({
      todayMetrics: todayMetric,
      recentStrainScores,
      baselines,
    });

    const actionSuggestion = buildActionSuggestion(
      result.score,
      dq,
      todayDbMetric ?? null,
      recentMetricsForDQ,
    );

    // Daily target-strain band (WHOOP-style coaching) — uses readiness
    // zone for the default band and personalises toward the athlete's
    // recent strain history when ≥7 sessions are available.
    const targetStrain = computeTargetStrain(
      result.score,
      recentStrainScores.slice(0, 14),
    );

    // Store the computed score
    await ctx.db.insert(ReadinessScore).values({
      userId,
      date: today,
      score: result.score,
      zone: result.zone,
      sleepQuantityComponent: result.components.sleepQuantity,
      sleepQualityComponent: result.components.sleepQuality,
      hrvComponent: result.components.hrv,
      restingHrComponent: result.components.restingHr,
      trainingLoadComponent: result.components.trainingLoad,
      stressComponent: result.components.stress,
      explanation: result.explanation,
      factors: result.components,
    });

    return {
      score: result.score,
      zone: result.zone,
      color: result.color,
      explanation: result.explanation,
      components: result.components,
      confidence,
      dataQuality: dq,
      actionSuggestion,
      doNotOverinterpret,
      targetStrain,
    };
  }),

  getHistory: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(28) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const rows = await ctx.db.query.ReadinessScore.findMany({
        where: and(
          eq(ReadinessScore.userId, userId),
          gte(ReadinessScore.date, getDateString(input.days)),
        ),
        orderBy: desc(ReadinessScore.date),
      });

      // Attach basic confidence per row based on whether key metrics exist
      return rows.map((row) => {
        const hasHrv = row.hrvComponent != null;
        const hasSleep = row.sleepQuantityComponent != null;
        const hasLoad = row.trainingLoadComponent != null;
        let confidence = 1.0;
        if (!hasHrv) confidence -= 0.15;
        if (!hasSleep) confidence -= 0.1;
        if (!hasLoad) confidence -= 0.1;
        return { ...row, confidence: Math.max(confidence, 0.3) };
      });
    }),

  getComponents: protectedProcedure
    .input(z.object({ date: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.ReadinessScore.findFirst({
        where: and(
          eq(ReadinessScore.userId, ctx.session.user.id),
          eq(ReadinessScore.date, input.date),
        ),
      });
    }),

  getAnomalies: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const recentMetrics = await ctx.db.query.DailyMetric.findMany({
      where: and(
        eq(DailyMetric.userId, userId),
        gte(DailyMetric.date, getDateString(7)),
      ),
      orderBy: desc(DailyMetric.date),
    });

    const profile = await ctx.db.query.Profile.findFirst({
      where: eq(Profile.userId, userId),
    });

    const metricInputs = recentMetrics.map(toMetricInput);
    const baselines = computeBaselines(metricInputs, profile?.sex ?? null);

    const recentActivities = await ctx.db.query.Activity.findMany({
      where: and(
        eq(Activity.userId, userId),
        gte(Activity.startedAt, new Date(Date.now() - 7 * 86400000)),
      ),
      orderBy: desc(Activity.startedAt),
    });

    const strainScores = recentActivities.map((a) => a.strainScore ?? 0);

    return detectAnomalies(metricInputs, baselines, strainScores);
  }),
} satisfies TRPCRouterRecord;
