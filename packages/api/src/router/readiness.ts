import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, gte, lte } from "@acme/db";
import {
  DailyMetric,
  Activity,
  ReadinessScore,
  Profile,
} from "@acme/db/schema";
import {
  calculateReadiness,
  computeBaselines,
  computeStrainScore,
  computeTRIMP,
  detectAnomalies,
  getReadinessZone,
} from "@acme/engine";
import type { DailyMetricInput, Baselines } from "@acme/engine";

import { protectedProcedure } from "../trpc";

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
    hrvOvernight: (row.hrvOvernight as number[] | null) ?? null,
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

    // Check if already computed today
    const existing = await ctx.db.query.ReadinessScore.findFirst({
      where: and(
        eq(ReadinessScore.userId, userId),
        eq(ReadinessScore.date, today),
      ),
    });
    if (existing) {
      return existing;
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

    // Get recent activities for strain
    const recentActivities = await ctx.db.query.Activity.findMany({
      where: and(
        eq(Activity.userId, userId),
        gte(Activity.startedAt, new Date(Date.now() - 7 * 86400000)),
      ),
      orderBy: desc(Activity.startedAt),
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
    };
  }),

  getHistory: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(28) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.ReadinessScore.findMany({
        where: and(
          eq(ReadinessScore.userId, ctx.session.user.id),
          gte(ReadinessScore.date, getDateString(input.days)),
        ),
        orderBy: desc(ReadinessScore.date),
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

    const strainScores = recentActivities.map(
      (a) => a.strainScore ?? 0,
    );

    return detectAnomalies(metricInputs, baselines, strainScores);
  }),
} satisfies TRPCRouterRecord;
