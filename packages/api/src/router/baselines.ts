import type { TRPCRouterRecord } from "@trpc/server";

import { and, desc, eq, gte } from "@acme/db";
import { AthleteBaseline, DailyMetric, Profile } from "@acme/db/schema";
import { computeBaselines, computeZScore } from "@acme/engine";

import { protectedProcedure } from "../trpc";

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0] ?? "";
}

export const baselinesRouter = {
  get: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    return ctx.db.query.AthleteBaseline.findMany({
      where: eq(AthleteBaseline.userId, userId),
    });
  }),

  compute: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const [metrics90, profile] = await Promise.all([
      ctx.db.query.DailyMetric.findMany({
        where: and(
          eq(DailyMetric.userId, userId),
          gte(DailyMetric.date, dateNDaysAgo(90)),
        ),
        orderBy: desc(DailyMetric.date),
        limit: 90,
      }),
      ctx.db.query.Profile.findFirst({ where: eq(Profile.userId, userId) }),
    ]);

    const baselines = computeBaselines(
      metrics90.map((m) => ({
        date: m.date,
        hrv: m.hrv,
        restingHr: m.restingHr,
        totalSleepMinutes: m.totalSleepMinutes,
        deepSleepMinutes: m.deepSleepMinutes,
        remSleepMinutes: m.remSleepMinutes,
        lightSleepMinutes: m.lightSleepMinutes,
        awakeMinutes: m.awakeMinutes,
        maxHr: m.maxHr,
        sleepScore: m.sleepScore,
        stressScore: m.stressScore,
        bodyBatteryStart: m.bodyBatteryStart,
        bodyBatteryEnd: m.bodyBatteryEnd,
        steps: m.steps,
        calories: m.calories,
        garminTrainingReadiness: m.garminTrainingReadiness,
        garminTrainingLoad: m.garminTrainingLoad,
        respirationRate: m.respirationRate,
        spo2: m.spo2,
        skinTemp: m.skinTemp,
        intensityMinutes: m.intensityMinutes,
        floorsClimbed: m.floorsClimbed,
        bodyBatteryHigh: m.bodyBatteryHigh,
        bodyBatteryLow: m.bodyBatteryLow,
        hrvOvernight: m.hrvOvernight,
        sleepStartTime: m.sleepStartTime,
        sleepEndTime: m.sleepEndTime,
        sleepNeedMinutes: m.sleepNeedMinutes,
        sleepDebtMinutes: m.sleepDebtMinutes,
      })),
      profile?.sex ?? null,
      profile?.age ?? null,
    );

    const latest = metrics90[0];
    const metricUpdates = [
      {
        name: "hrv",
        val: baselines.hrv,
        sd: baselines.hrvSD,
        latestVal: latest?.hrv,
      },
      {
        name: "restingHr",
        val: baselines.restingHr,
        sd: baselines.restingHrSD,
        latestVal: latest?.restingHr,
      },
      {
        name: "sleep",
        val: baselines.sleep,
        sd: baselines.sleepSD,
        latestVal: latest?.totalSleepMinutes,
      },
    ];

    const results = [];
    for (const m of metricUpdates) {
      if (!m.val) continue;
      const zScore =
        m.latestVal && m.sd ? computeZScore(m.latestVal, m.val, m.sd) : null;
      const [row] = await ctx.db
        .insert(AthleteBaseline)
        .values({
          userId,
          metricName: m.name,
          baselineValue: m.val,
          baselineSD: m.sd,
          zScoreLatest: zScore,
          daysOfData: baselines.daysOfData,
        })
        .onConflictDoUpdate({
          target: [AthleteBaseline.userId, AthleteBaseline.metricName],
          set: {
            baselineValue: m.val,
            baselineSD: m.sd,
            zScoreLatest: zScore,
            daysOfData: baselines.daysOfData,
            computedAt: new Date(),
          },
        })
        .returning();
      results.push(row);
    }
    return results;
  }),
} satisfies TRPCRouterRecord;
