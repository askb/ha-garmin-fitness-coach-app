import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import type { DailyMetricInput } from "@acme/engine";
import { and, desc, eq, gte } from "@acme/db";
import { Activity, DailyMetric, Profile } from "@acme/db/schema";
import { computeStrainScore, generateSleepCoachResult } from "@acme/engine";

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
    sleepStartTime: row.sleepStartTime ?? null,
    sleepEndTime: row.sleepEndTime ?? null,
    sleepNeedMinutes: row.sleepNeedMinutes ?? null,
    sleepDebtMinutes: row.sleepDebtMinutes ?? null,
    hrvOvernight: row.hrvOvernight ?? null,
  };
}

function getDateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0] ?? "";
}

export const sleepRouter = {
  getCoach: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Fetch profile for age and experience level
    const profile = await ctx.db.query.Profile.findFirst({
      where: eq(Profile.userId, userId),
    });

    const age = profile?.age ?? null;
    const isAthlete =
      (profile?.experienceLevel ?? "intermediate") !== "beginner";

    // Fetch last 7 days of DailyMetric
    const recentMetrics = await ctx.db.query.DailyMetric.findMany({
      where: and(
        eq(DailyMetric.userId, userId),
        gte(DailyMetric.date, getDateString(7)),
      ),
      orderBy: desc(DailyMetric.date),
    });

    // Fetch last 3 days of Activity for strain
    const recentActivities = await ctx.db.query.Activity.findMany({
      where: and(
        eq(Activity.userId, userId),
        gte(Activity.startedAt, new Date(Date.now() - 3 * 86400000)),
      ),
      orderBy: desc(Activity.startedAt),
    });

    // Compute average strain from recent activities
    const strainScores = recentActivities.map(
      (a) => a.strainScore ?? computeStrainScore(a.trimpScore ?? 0),
    );
    const recentStrain =
      strainScores.length > 0
        ? strainScores.reduce((sum, s) => sum + s, 0) / strainScores.length
        : 0;

    const metricInputs = recentMetrics.map(toMetricInput);

    // Use most recent sleepEndTime as wake time proxy
    const wakeTime = recentMetrics[0]?.sleepEndTime ?? null;

    return generateSleepCoachResult(
      age,
      isAthlete,
      recentStrain,
      metricInputs,
      wakeTime,
    );
  }),

  getHistory: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(28) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.query.DailyMetric.findMany({
        where: and(
          eq(DailyMetric.userId, ctx.session.user.id),
          gte(DailyMetric.date, getDateString(input.days)),
        ),
        orderBy: desc(DailyMetric.date),
      });

      return rows.map((r) => ({
        date: r.date,
        totalSleepMinutes: r.totalSleepMinutes,
        deepSleepMinutes: r.deepSleepMinutes,
        remSleepMinutes: r.remSleepMinutes,
        lightSleepMinutes: r.lightSleepMinutes,
        awakeMinutes: r.awakeMinutes,
        sleepScore: r.sleepScore,
        sleepStartTime: r.sleepStartTime ? Number(r.sleepStartTime) : null,
        sleepEndTime: r.sleepEndTime ? Number(r.sleepEndTime) : null,
        sleepNeedMinutes: r.sleepNeedMinutes,
        sleepDebt: r.sleepDebtMinutes,
      }));
    }),

  getStages: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(7) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.query.DailyMetric.findMany({
        where: and(
          eq(DailyMetric.userId, ctx.session.user.id),
          gte(DailyMetric.date, getDateString(input.days)),
        ),
        orderBy: desc(DailyMetric.date),
      });

      return rows.map((r) => ({
        date: r.date,
        deep: r.deepSleepMinutes,
        deepMinutes: r.deepSleepMinutes,
        rem: r.remSleepMinutes,
        remMinutes: r.remSleepMinutes,
        light: r.lightSleepMinutes,
        lightMinutes: r.lightSleepMinutes,
        awake: r.awakeMinutes,
        awakeMinutes: r.awakeMinutes,
        sleepNeedMinutes: r.sleepNeedMinutes,
      }));
    }),
} satisfies TRPCRouterRecord;
