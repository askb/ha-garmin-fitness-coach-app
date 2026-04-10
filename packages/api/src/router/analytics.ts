import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, asc, desc, eq, gte, lte } from "@acme/db";
import {
  Activity,
  DailyMetric,
  Profile,
  ReadinessScore,
  TrainingStatus,
  VO2maxEstimate,
} from "@acme/db/schema";
import {
  analyzeRunningForm,
  classifyLoadFocus,
  classifyTrainingStatus,
  computeACWR,
  computeACWR_EWMA,
  computeStandardCorrelations,
  computeStrainScore,
  computeTrainingLoads,
  computeVO2maxTrend,
  estimateRecoveryTime,
  predictRaceTimesFromVO2max,
} from "@acme/engine";

import { protectedProcedure } from "../trpc";

function getDateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0]!;
}

export const analyticsRouter = {
  getTrainingLoads: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const recentActivities = await ctx.db.query.Activity.findMany({
      where: and(
        eq(Activity.userId, userId),
        gte(Activity.startedAt, new Date(Date.now() - 42 * 86400000)),
      ),
      orderBy: desc(Activity.startedAt),
    });

    const strainScores = recentActivities.map(
      (a) => a.strainScore ?? computeStrainScore(a.trimpScore ?? 0),
    );

    const loadMetrics = computeTrainingLoads(strainScores);
    const acwr = computeACWR(strainScores);
    const acwrEwma = computeACWR_EWMA(strainScores);
    const loadFocus = classifyLoadFocus(recentActivities);

    return {
      ctl: loadMetrics.ctl,
      atl: loadMetrics.atl,
      tsb: loadMetrics.tsb,
      acwr,
      acwrEwma,
      loadFocus,
      rampRate: loadMetrics.rampRate,
    };
  }),

  getTrainingStatus: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const vo2maxRecords = await ctx.db.query.VO2maxEstimate.findMany({
      where: and(
        eq(VO2maxEstimate.userId, userId),
        gte(VO2maxEstimate.date, getDateString(28)),
      ),
      orderBy: desc(VO2maxEstimate.date),
    });

    let vo2maxTrend = 0;
    if (vo2maxRecords.length >= 2) {
      const last = vo2maxRecords[0]!;
      const first = vo2maxRecords[vo2maxRecords.length - 1]!;
      vo2maxTrend = last.value - first.value;
    }

    const recentActivities = await ctx.db.query.Activity.findMany({
      where: and(
        eq(Activity.userId, userId),
        gte(Activity.startedAt, new Date(Date.now() - 42 * 86400000)),
      ),
      orderBy: desc(Activity.startedAt),
    });

    const strainScores = recentActivities.map(
      (a) => a.strainScore ?? computeStrainScore(a.trimpScore ?? 0),
    );

    const loadMetrics = computeTrainingLoads(strainScores);
    const acwr = computeACWR(strainScores);
    const loadFocus = classifyLoadFocus(recentActivities);

    return classifyTrainingStatus(vo2maxTrend, {
      ...loadMetrics,
      acwr,
      loadFocus,
    });
  }),

  getVO2maxHistory: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(730).default(365) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const allEstimates = await ctx.db.query.VO2maxEstimate.findMany({
        where: and(
          eq(VO2maxEstimate.userId, userId),
          gte(VO2maxEstimate.date, getDateString(input.days)),
        ),
        orderBy: [desc(VO2maxEstimate.date)],
      });

      // Deduplicate: keep the highest-priority source per date.
      // Priority: garmin_official > running_pace_hr > cooper > uth_method
      // Garmin's Firstbeat algorithm (pace+HR during runs) is far more accurate
      // than the Uth ratio method (±5 ml/kg/min, overestimates for age >35).
      // Ref: Uth et al. 2004, PMC8443998 (2021 age-correction study)
      const SOURCE_PRIORITY: Record<string, number> = {
        garmin_official: 0,
        running_pace_hr: 1,
        cooper: 2,
        uth_method: 3,
        uth_ratio: 3,
      };
      const bestByDate = new Map<string, (typeof allEstimates)[number]>();
      for (const e of allEstimates) {
        const existing = bestByDate.get(e.date);
        const ePriority = SOURCE_PRIORITY[e.source] ?? 2;
        const existingPriority = existing
          ? (SOURCE_PRIORITY[existing.source] ?? 2)
          : Infinity;
        if (ePriority < existingPriority) {
          bestByDate.set(e.date, e);
        }
      }
      // Return in descending date order
      const estimates = [...bestByDate.values()].sort((a, b) =>
        b.date.localeCompare(a.date),
      );

      const trend = computeVO2maxTrend(estimates);

      return { estimates, trend };
    }),

  getRacePredictions: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Prefer garmin_official source, then running_pace_hr, then any.
    // Uth method overestimates VO2max by 10-20% for age >35 (PMC8443998),
    // which would produce unrealistically fast race predictions.
    const recentEstimates = await ctx.db.query.VO2maxEstimate.findMany({
      where: and(
        eq(VO2maxEstimate.userId, userId),
        gte(VO2maxEstimate.date, getDateString(90)),
      ),
      orderBy: desc(VO2maxEstimate.date),
    });

    const RACE_SOURCE_PRIORITY: Record<string, number> = {
      garmin_official: 0,
      running_pace_hr: 1,
      cooper: 2,
      uth_method: 4,
      uth_ratio: 4,
    };

    const best = recentEstimates.reduce<
      (typeof recentEstimates)[number] | null
    >((acc, e) => {
      if (!acc) return e;
      const aPriority = RACE_SOURCE_PRIORITY[acc.source] ?? 3;
      const ePriority = RACE_SOURCE_PRIORITY[e.source] ?? 3;
      if (ePriority < aPriority) return e;
      // Same priority: prefer more recent
      if (ePriority === aPriority && e.date > acc.date) return e;
      return acc;
    }, null);

    if (!best) return null;

    return predictRaceTimesFromVO2max(best.value);
  }),

  getCorrelations: protectedProcedure
    .input(
      z.object({
        period: z.enum(["30d", "90d", "180d"]).default("90d"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const daysMap = { "30d": 30, "90d": 90, "180d": 180 } as const;
      const days = daysMap[input.period];
      const startDate = getDateString(days);

      const metrics = await ctx.db.query.DailyMetric.findMany({
        where: and(
          eq(DailyMetric.userId, userId),
          gte(DailyMetric.date, startDate),
        ),
        orderBy: desc(DailyMetric.date),
      });

      const readinessScores = await ctx.db.query.ReadinessScore.findMany({
        where: and(
          eq(ReadinessScore.userId, userId),
          gte(ReadinessScore.date, startDate),
        ),
        orderBy: desc(ReadinessScore.date),
      });

      const readinessMap = new Map(
        readinessScores.map((r) => [r.date, r.score]),
      );

      // Fetch actual activity strain scores (TRIMP-based, 0-21)
      const activities = await ctx.db.query.Activity.findMany({
        where: and(
          eq(Activity.userId, userId),
          gte(Activity.startedAt, new Date(startDate)),
        ),
        orderBy: desc(Activity.startedAt),
      });
      // Max strain per day from activities
      const strainMap = new Map<string, number>();
      for (const a of activities) {
        const date = a.startedAt.toISOString().split("T")[0]!;
        const strain = a.strainScore ?? computeStrainScore(a.trimpScore ?? 0);
        const existing = strainMap.get(date) ?? 0;
        strainMap.set(date, Math.max(existing, strain));
      }

      const dailyData = metrics.map((m) => ({
        date: m.date,
        hrv: m.hrv,
        restingHr: m.restingHr,
        totalSleepMinutes: m.totalSleepMinutes,
        sleepScore: m.sleepScore,
        stressScore: m.stressScore,
        readinessScore: readinessMap.get(m.date) ?? null,
        strainScore: strainMap.get(m.date) ?? null,
      }));

      return computeStandardCorrelations(dailyData, input.period);
    }),

  getRunningForm: protectedProcedure
    .input(z.object({ activityId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      let activity;
      if (input.activityId) {
        activity = await ctx.db.query.Activity.findFirst({
          where: and(
            eq(Activity.userId, userId),
            eq(Activity.id, input.activityId),
          ),
        });
      } else {
        const activities = await ctx.db.query.Activity.findMany({
          where: eq(Activity.userId, userId),
          orderBy: desc(Activity.startedAt),
        });
        activity = activities.find((a) =>
          a.sportType?.toLowerCase().includes("run"),
        );
      }

      if (!activity) {
        return null;
      }

      const profile = await ctx.db.query.Profile.findFirst({
        where: eq(Profile.userId, userId),
      });

      return analyzeRunningForm(
        activity.avgGroundContactTime,
        activity.verticalOscillation,
        activity.strideLength,
        activity.gctBalance,
        activity.avgCadence,
        profile?.heightCm ?? null,
      );
    }),

  getRecoveryTime: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const today = getDateString(0);

    const readiness = await ctx.db.query.ReadinessScore.findFirst({
      where: and(
        eq(ReadinessScore.userId, userId),
        eq(ReadinessScore.date, today),
      ),
    });

    const latestActivity = await ctx.db.query.Activity.findFirst({
      where: eq(Activity.userId, userId),
      orderBy: desc(Activity.startedAt),
    });

    const profile = await ctx.db.query.Profile.findFirst({
      where: eq(Profile.userId, userId),
    });

    const recentMetrics = await ctx.db.query.DailyMetric.findMany({
      where: and(
        eq(DailyMetric.userId, userId),
        gte(DailyMetric.date, getDateString(7)),
      ),
      orderBy: desc(DailyMetric.date),
      limit: 7,
    });

    const sleepDebtMinutes = recentMetrics.reduce(
      (sum, m) => sum + (m.sleepDebtMinutes ?? 0),
      0,
    );

    const sessionStrain =
      latestActivity?.strainScore ??
      computeStrainScore(latestActivity?.trimpScore ?? 0);

    return estimateRecoveryTime(
      sessionStrain,
      readiness?.score ?? 50,
      profile?.age ?? null,
      sleepDebtMinutes,
    );
  }),
} satisfies TRPCRouterRecord;
