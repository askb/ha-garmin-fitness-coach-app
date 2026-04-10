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

function computeDataQuality(
  metric: typeof DailyMetric.$inferSelect | null,
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

  return {
    hrv: metric?.hrv == null ? "missing" : stale ? "stale" : "good",
    sleep:
      metric?.totalSleepMinutes == null ? "missing" : stale ? "stale" : "good",
    restingHr: metric?.restingHr == null ? "missing" : stale ? "stale" : "good",
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

function buildActionSuggestion(
  score: number,
  dq: DataQuality,
  metric: typeof DailyMetric.$inferSelect | null,
): string {
  if (score >= 80) {
    return "You're well recovered — today is a good day for a quality session or race effort.";
  }
  if (score >= 60) {
    return "Moderate readiness — stick to planned training but listen to your body.";
  }
  // Below 60: find worst component
  if (dq.hrv !== "good" || metric?.hrv != null) {
    const hrv = metric?.hrv;
    if (dq.hrv !== "good") {
      return "Take it easy today — HRV data is unavailable. Consider an easy 30-min walk instead of your planned session.";
    }
    if (hrv != null) {
      return `Take it easy today — your HRV of ${hrv.toFixed(0)}ms is below baseline. Consider an easy 30-min walk instead of your planned session.`;
    }
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

export const readinessRouter = {
  getToday: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const today = getDateString(0);

    // Always fetch today's metric for confidence/quality computation
    const todayDbMetric = await ctx.db.query.DailyMetric.findFirst({
      where: and(eq(DailyMetric.userId, userId), eq(DailyMetric.date, today)),
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
      );
      return {
        ...existing,
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
