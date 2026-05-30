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
  buildWhatIfOptions,
  findRaceReadinessWindow,
  linearForecast,
  predictRaceTimesFromVO2max,
  projectPMC,
  simulateWhatIf,
} from "@acme/engine";

import { dayInTimezone, shiftIsoDay, todayInTimezone } from "../lib/timezone";
import { pickBestVO2maxEstimate, vo2SourcePriority } from "../lib/vo2max";
import { protectedProcedure } from "../trpc";

function getDateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0]!;
}

/**
 * Aggregate per-activity strain scores into a per-day chronological series.
 *
 * The engine helpers (`computeACWR`, `computeACWR_EWMA`, `computeTrainingLoads`)
 * all expect a per-CALENDAR-DAY array. Feeding them a per-activity array — as
 * we did previously — produces ratios over the wrong domain (e.g., "ratio of
 * the last 7 activities to the last 28 activities" instead of "ratio of the
 * last 7 days to the last 28 days"). For an athlete doing doubles or strength
 * + run the same day, this materially over- or under-estimates ACWR/CTL/ATL.
 *
 * Output conventions:
 *   - `dailyLoadsChrono`  — index 0 = oldest, length = windowDays (zero-padded
 *     for rest days). Consumed by `computeTrainingLoads` and
 *     `computeACWR_EWMA`.
 *   - `dailyLoadsRecent`  — index 0 = today/most recent. Consumed by
 *     `computeACWR`.
 */
function aggregateDailyLoads(
  activities: {
    startedAt: Date;
    strainScore: number | null;
    trimpScore: number | null;
  }[],
  windowDays: number,
  timezone?: string | null,
): { dailyLoadsChrono: number[]; dailyLoadsRecent: number[] } {
  const byDay = new Map<string, number>();
  for (const a of activities) {
    // Skip rows with a malformed `startedAt`. These exist in the wild for
    // partial Garmin syncs and would otherwise propagate `RangeError:
    // Invalid time value` out of the tRPC handler.
    if (!(a.startedAt instanceof Date) || Number.isNaN(a.startedAt.getTime())) {
      continue;
    }
    const day = dayInTimezone(a.startedAt, timezone);
    const s = a.strainScore ?? computeStrainScore(a.trimpScore ?? 0);
    byDay.set(day, (byDay.get(day) ?? 0) + s);
  }

  const dailyLoadsRecent: number[] = [];
  const todayStr = todayInTimezone(timezone);
  for (let i = 0; i < windowDays; i++) {
    const key = shiftIsoDay(todayStr, -i);
    dailyLoadsRecent.push(byDay.get(key) ?? 0);
  }
  const dailyLoadsChrono = [...dailyLoadsRecent].reverse();
  return { dailyLoadsChrono, dailyLoadsRecent };
}

export const analyticsRouter = {
  getTrainingLoads: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Compute the 42-day window cutoff as a safe ISO timestamp. Guarding
    // against an invalid `Date.now()` (which can never happen but keeps
    // the boundary code uniformly defensive) before drizzle tries to
    // `.toISOString()` it for the SQL parameter — which is the root cause
    // of `RangeError: Invalid time value` observed in production.
    const cutoffMs = Date.now() - 42 * 86400000;
    const cutoff = Number.isFinite(cutoffMs) ? new Date(cutoffMs) : new Date(0);

    const [profile, recentActivitiesRaw] = await Promise.all([
      ctx.db.query.Profile.findFirst({
        where: eq(Profile.userId, userId),
        columns: { timezone: true },
      }),
      ctx.db.query.Activity.findMany({
        where: and(
          eq(Activity.userId, userId),
          gte(Activity.startedAt, cutoff),
        ),
        orderBy: desc(Activity.startedAt),
      }),
    ]);

    // Sanitize: drop any rows whose `startedAt` would later blow up a
    // `.toISOString()` call inside drizzle / superjson / the engine.
    const recentActivities = recentActivitiesRaw.filter(
      (a) =>
        a.startedAt instanceof Date && !Number.isNaN(a.startedAt.getTime()),
    );

    const { dailyLoadsChrono, dailyLoadsRecent } = aggregateDailyLoads(
      recentActivities,
      42,
      profile?.timezone,
    );

    const loadMetrics = computeTrainingLoads(dailyLoadsChrono);
    const acwr = computeACWR(dailyLoadsRecent);
    const acwrEwma = computeACWR_EWMA(dailyLoadsChrono);
    const loadFocus = classifyLoadFocus(recentActivities);

    // Return primitives only — no `Date` in the response. The superjson
    // transformer was previously crashing here with `Invalid time value`
    // for one user, so we ship an ISO string and let the client parse.
    return {
      ctl: loadMetrics.ctl,
      atl: loadMetrics.atl,
      tsb: loadMetrics.tsb,
      acwr,
      acwrEwma,
      loadFocus,
      rampRate: loadMetrics.rampRate,
      timezone: profile?.timezone ?? "UTC",
      computedAt: new Date().toISOString(),
    };
  }),

  getLoadForecast: protectedProcedure
    .input(
      z
        .object({ horizonDays: z.number().min(7).max(56).default(28) })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const horizonDays = input?.horizonDays ?? 28;

      // 90-day window gives CTL (42d EWMA) time to settle before projecting.
      const cutoffMs = Date.now() - 90 * 86400000;
      const cutoff = Number.isFinite(cutoffMs)
        ? new Date(cutoffMs)
        : new Date(0);

      const [profile, activitiesRaw, vo2Estimates] = await Promise.all([
        ctx.db.query.Profile.findFirst({
          where: eq(Profile.userId, userId),
          columns: { timezone: true },
        }),
        ctx.db.query.Activity.findMany({
          where: and(
            eq(Activity.userId, userId),
            gte(Activity.startedAt, cutoff),
          ),
          orderBy: desc(Activity.startedAt),
        }),
        ctx.db.query.VO2maxEstimate.findMany({
          where: and(
            eq(VO2maxEstimate.userId, userId),
            eq(VO2maxEstimate.source, "garmin_official"),
          ),
          orderBy: [desc(VO2maxEstimate.date)],
          limit: 120,
        }),
      ]);

      const activities = activitiesRaw.filter(
        (a) =>
          a.startedAt instanceof Date && !Number.isNaN(a.startedAt.getTime()),
      );
      const { dailyLoadsChrono } = aggregateDailyLoads(
        activities,
        90,
        profile?.timezone,
      );

      // Project each training-decision scenario forward.
      const scenarios = (
        ["maintain", "rest", "rampUp", "rampDown"] as const
      ).map((s) => {
        const fc = projectPMC(dailyLoadsChrono, horizonDays, s);
        return {
          scenario: fc.scenario,
          assumedDailyLoad: fc.assumedDailyLoad,
          days: fc.days,
        };
      });

      // Race-readiness window assumes a deliberate taper (rampDown).
      const taper = projectPMC(dailyLoadsChrono, horizonDays, "rampDown");
      const raceWindow = findRaceReadinessWindow(taper.days);

      // VO2max trajectory — linear extrapolation of Garmin Firstbeat readings.
      const vo2Series = [...vo2Estimates]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => ({ date: e.date, value: e.value }));
      const vo2maxForecast = linearForecast(vo2Series, horizonDays);

      return {
        horizonDays,
        hasData: dailyLoadsChrono.some((v) => v > 0),
        scenarios,
        raceWindow,
        vo2maxForecast,
        timezone: profile?.timezone ?? "UTC",
        computedAt: new Date().toISOString(),
      };
    }),

  getWhatIfToday: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const cutoffMs = Date.now() - 35 * 86400000;
    const cutoff = Number.isFinite(cutoffMs) ? new Date(cutoffMs) : new Date(0);

    const [profile, activitiesRaw] = await Promise.all([
      ctx.db.query.Profile.findFirst({
        where: eq(Profile.userId, userId),
        columns: { timezone: true },
      }),
      ctx.db.query.Activity.findMany({
        where: and(eq(Activity.userId, userId), gte(Activity.startedAt, cutoff)),
        orderBy: desc(Activity.startedAt),
      }),
    ]);

    const activities = activitiesRaw.filter(
      (a) =>
        a.startedAt instanceof Date && !Number.isNaN(a.startedAt.getTime()),
    );
    const { dailyLoadsChrono, dailyLoadsRecent } = aggregateDailyLoads(
      activities,
      35,
      profile?.timezone,
    );

    const options = buildWhatIfOptions(dailyLoadsChrono);
    const outcomes = simulateWhatIf(dailyLoadsChrono, options, 7);

    return {
      hasData: dailyLoadsRecent.some((v) => v > 0),
      outcomes,
      timezone: profile?.timezone ?? "UTC",
      computedAt: new Date().toISOString(),
    };
  }),

  getTrainingStatus: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const cutoffMs = Date.now() - 42 * 86400000;
    const cutoff = Number.isFinite(cutoffMs) ? new Date(cutoffMs) : new Date(0);

    const [profile, vo2maxRecords, recentActivitiesRaw] = await Promise.all([
      ctx.db.query.Profile.findFirst({
        where: eq(Profile.userId, userId),
        columns: { timezone: true },
      }),
      ctx.db.query.VO2maxEstimate.findMany({
        where: and(
          eq(VO2maxEstimate.userId, userId),
          gte(VO2maxEstimate.date, getDateString(28)),
        ),
        orderBy: desc(VO2maxEstimate.date),
      }),
      ctx.db.query.Activity.findMany({
        where: and(
          eq(Activity.userId, userId),
          gte(Activity.startedAt, cutoff),
        ),
        orderBy: desc(Activity.startedAt),
      }),
    ]);

    const recentActivities = recentActivitiesRaw.filter(
      (a) =>
        a.startedAt instanceof Date && !Number.isNaN(a.startedAt.getTime()),
    );

    let vo2maxTrend = 0;
    if (vo2maxRecords.length >= 2) {
      const last = vo2maxRecords[0]!;
      const first = vo2maxRecords[vo2maxRecords.length - 1]!;
      vo2maxTrend = last.value - first.value;
    }

    const { dailyLoadsChrono, dailyLoadsRecent } = aggregateDailyLoads(
      recentActivities,
      42,
      profile?.timezone,
    );

    const loadMetrics = computeTrainingLoads(dailyLoadsChrono);
    const acwr = computeACWR(dailyLoadsRecent);
    const loadFocus = classifyLoadFocus(recentActivities);

    const result = classifyTrainingStatus(vo2maxTrend, {
      ...loadMetrics,
      acwr,
      loadFocus,
    });

    // Spread into a fresh object to guarantee no stray Date sneaks in.
    return {
      status: result.status,
      vo2maxTrend: result.vo2maxTrend,
      explanation: result.explanation,
      recommendation: result.recommendation,
      computedAt: new Date().toISOString(),
    };
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
      // Priority: garmin_official > running_pace_hr > cooper > UTH.
      // Garmin's Firstbeat algorithm (pace+HR during runs) is far more
      // accurate than the Uth ratio method (±5 ml/kg/min, overestimates
      // for age >35). Ref: Uth et al. 2004, PMC8443998 (2021 study).
      // Picker logic lives in `lib/vo2max.ts` so the /fitness hero card,
      // the AI coach data-context, and this list view all agree (#154).
      const bestByDate = new Map<string, (typeof allEstimates)[number]>();
      for (const e of allEstimates) {
        const existing = bestByDate.get(e.date);
        if (
          !existing ||
          vo2SourcePriority(e.source) < vo2SourcePriority(existing.source)
        ) {
          bestByDate.set(e.date, e);
        }
      }
      // Return in descending date order
      const estimates = [...bestByDate.values()].sort((a, b) =>
        b.date.localeCompare(a.date),
      );

      const trend = computeVO2maxTrend(estimates);

      // Separate arrays by source for distinct chart rendering.
      // Garmin official = Firstbeat-based VO2max synced from Garmin Connect.
      // UTH estimates = formula-based 15.3 × (HRmax / HRrest) (Uth et al. 2004).
      const garminEstimates = allEstimates
        .filter((e) => e.source === "garmin_official")
        .sort((a, b) => b.date.localeCompare(a.date));
      const uthEstimates = allEstimates
        .filter((e) => e.source === "uth_method" || e.source === "uth_ratio")
        .sort((a, b) => b.date.localeCompare(a.date));

      // Garmin Firstbeat only emits VO2max after qualifying outdoor runs
      // (~once every 1-2 weeks), so a 7d/14d window is often empty even
      // for active users. Fetch the last 60 Garmin readings unconditionally
      // so the chart can fall back to "showing last N readings" when the
      // selected window has no data.
      const garminEstimatesRecent = await ctx.db.query.VO2maxEstimate.findMany({
        where: and(
          eq(VO2maxEstimate.userId, userId),
          eq(VO2maxEstimate.source, "garmin_official"),
        ),
        orderBy: [desc(VO2maxEstimate.date)],
        limit: 60,
      });

      // For the `latestBest` value we MUST query the same unwindowed pool
      // the AI coach reads from (`data-context.ts` does last-30 unconditionally),
      // not `estimates` which is filtered by the chart's date range. Otherwise
      // shrinking the chart window can make the hero card and the coach
      // disagree on "Current VO2max", which is exactly the #154/#164 bug.
      const recentForLatest = await ctx.db.query.VO2maxEstimate.findMany({
        where: eq(VO2maxEstimate.userId, userId),
        orderBy: [desc(VO2maxEstimate.date)],
        limit: 30,
      });

      return {
        estimates,
        trend,
        garminEstimates,
        uthEstimates,
        garminEstimatesRecent,
        // Pre-computed best estimate so the hero card and AI coach use
        // identical picker logic (pickBestVO2maxEstimate from lib/vo2max.ts).
        // Computed from `recentForLatest` (unwindowed last-30) — same pool
        // the coach reads — so the two surfaces never disagree regardless
        // of which chart range the user selects.
        latestBest: pickBestVO2maxEstimate(recentForLatest) ?? null,
      };
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
        if (
          !(a.startedAt instanceof Date) ||
          Number.isNaN(a.startedAt.getTime())
        ) {
          continue;
        }
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

    // Match the engine's exponentially-weighted sleep-debt convention
    // (see calculateSleepDebt in @acme/engine). Raw summation produced
    // physically implausible totals (~17h) for chronically short
    // sleepers, and `estimateRecoveryTime` then capped at >60 / >120
    // thresholds anyway. Aligning the metric here keeps the recovery
    // gauge and the insights card telling the same story.
    const sleepDebtMinutes = recentMetrics.reduce(
      (sum, m, i) => sum + (m.sleepDebtMinutes ?? 0) * Math.pow(0.5, i),
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
