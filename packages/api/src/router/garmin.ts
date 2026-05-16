import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, gte } from "@acme/db";
import { Activity, DailyMetric } from "@acme/db/schema";
import {
  backfillDays,
  handleCallback as garminHandleCallback,
  initiateOAuth,
} from "@acme/garmin";

import { protectedProcedure } from "../trpc";

export const garminRouter = {
  getConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
    // TODO: Look up stored Garmin tokens for this user in the DB
    // For now return a mock connected status
    return {
      connected: true,
      garminUserId: "garmin-user-mock-001",
      lastSyncedAt: new Date().toISOString(),
    };
  }),

  initiateOAuth: protectedProcedure.mutation(async () => {
    const { authUrl, oauthTokenSecret } = initiateOAuth();
    // TODO: Store oauthTokenSecret in session/DB keyed to the user
    return { authUrl };
  }),

  handleCallback: protectedProcedure
    .input(
      z.object({
        oauthToken: z.string(),
        oauthVerifier: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tokens = garminHandleCallback(
        input.oauthToken,
        input.oauthVerifier,
      );
      // TODO: Store tokens.accessToken and tokens.refreshToken in the DB
      //       associated with ctx.session.user.id and tokens.garminUserId
      return {
        success: true,
        garminUserId: tokens.garminUserId,
      };
    }),

  triggerBackfill: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(30) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      // TODO: Retrieve stored Garmin access token for this user
      const mockAccessToken = "mock_garmin_access_token";

      const { metrics, activities } = backfillDays(mockAccessToken, input.days);

      // Insert metrics
      for (const metric of metrics) {
        await ctx.db
          .insert(DailyMetric)
          .values({
            userId,
            date: metric.date,
            sleepScore: metric.sleepScore,
            totalSleepMinutes: metric.totalSleepMinutes,
            deepSleepMinutes: metric.deepSleepMinutes,
            remSleepMinutes: metric.remSleepMinutes,
            lightSleepMinutes: metric.lightSleepMinutes,
            awakeMinutes: metric.awakeMinutes,
            hrv: metric.hrv,
            restingHr: metric.restingHr,
            maxHr: metric.maxHr,
            stressScore: metric.stressScore,
            bodyBatteryStart: metric.bodyBatteryStart,
            bodyBatteryEnd: metric.bodyBatteryEnd,
            steps: metric.steps,
            calories: metric.calories,
            garminTrainingReadiness: metric.garminTrainingReadiness,
            garminTrainingLoad: metric.garminTrainingLoad,
            rawGarminData: metric.rawGarminData,
          })
          .onConflictDoNothing();
      }

      // Insert activities
      for (const activity of activities) {
        await ctx.db
          .insert(Activity)
          .values({
            userId,
            garminActivityId: activity.garminActivityId,
            sportType: activity.sportType,
            subType: activity.subType,
            startedAt: activity.startedAt,
            endedAt: activity.endedAt,
            durationMinutes: activity.durationMinutes,
            distanceMeters: activity.distanceMeters,
            avgHr: activity.avgHr,
            maxHr: activity.maxHr,
            avgPaceSecPerKm: activity.avgPaceSecPerKm,
            calories: activity.calories,
            vo2maxEstimate: activity.vo2maxEstimate,
            rawGarminData: activity.rawGarminData,
          })
          .onConflictDoNothing();
      }

      return {
        metricsInserted: metrics.length,
        activitiesInserted: activities.length,
      };
    }),

  getTrainingSummary: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(30).default(14) }).optional())
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const days = input?.days ?? 14;

      // Use an exclusive lower bound so a `days=7` window returns 7 calendar
      // days, not 8. `gte` against `since + 1` is equivalent to `gt(since)`.
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - days + 1);
      const sinceStr = since.toISOString().split("T")[0]!;

      const rows = await ctx.db
        .select({
          date: DailyMetric.date,
          hrv: DailyMetric.hrv,
          garminTrainingReadiness: DailyMetric.garminTrainingReadiness,
          garminTrainingReadinessLevel:
            DailyMetric.garminTrainingReadinessLevel,
          garminTrainingLoad: DailyMetric.garminTrainingLoad,
          garminTrainingStatus: DailyMetric.garminTrainingStatus,
          garminLoadFocus: DailyMetric.garminLoadFocus,
          garminRecoveryHours: DailyMetric.garminRecoveryHours,
        })
        .from(DailyMetric)
        .where(
          and(eq(DailyMetric.userId, userId), gte(DailyMetric.date, sinceStr)),
        )
        .orderBy(desc(DailyMetric.date));

      // Build a "latest non-null" view for each Garmin Firstbeat field.
      // Watches only publish today's training-readiness / status / recovery
      // after the next morning sync, so today's daily_metric row often has
      // all of these as NULL even though yesterday's row is populated. The
      // UI's "Garmin Native" card was rendering all em-dashes because it
      // pulled `rows[0]` (today) verbatim. Fall back per-field to the most
      // recent date in the window that actually has data.
      function latestNonNullRow<K extends keyof (typeof rows)[number]>(
        key: K,
      ): (typeof rows)[number] | null {
        for (const row of rows) {
          const v = row[key];
          if (v != null) return row;
        }
        return null;
      }

      const readinessRow = latestNonNullRow("garminTrainingReadiness");
      const readinessLevelRow = latestNonNullRow(
        "garminTrainingReadinessLevel",
      );
      const trainingLoadRow = latestNonNullRow("garminTrainingLoad");
      const trainingStatusRow = latestNonNullRow("garminTrainingStatus");
      const loadFocusRow = latestNonNullRow("garminLoadFocus");
      const recoveryHoursRow = latestNonNullRow("garminRecoveryHours");

      const latest = rows[0]
        ? {
            ...rows[0],
            garminTrainingReadiness:
              readinessRow?.garminTrainingReadiness ?? null,
            garminTrainingReadinessLevel:
              readinessLevelRow?.garminTrainingReadinessLevel ?? null,
            garminTrainingLoad: trainingLoadRow?.garminTrainingLoad ?? null,
            garminTrainingStatus:
              trainingStatusRow?.garminTrainingStatus ?? null,
            garminLoadFocus: loadFocusRow?.garminLoadFocus ?? null,
            garminRecoveryHours: recoveryHoursRow?.garminRecoveryHours ?? null,
          }
        : null;
      const latestDates = {
        garminTrainingReadiness: readinessRow?.date ?? null,
        garminTrainingReadinessLevel: readinessLevelRow?.date ?? null,
        garminTrainingLoad: trainingLoadRow?.date ?? null,
        garminTrainingStatus: trainingStatusRow?.date ?? null,
        garminLoadFocus: loadFocusRow?.date ?? null,
        garminRecoveryHours: recoveryHoursRow?.date ?? null,
      };
      const hrvSeries = rows
        .filter((r) => r.hrv != null)
        .map((r) => ({ date: r.date, hrv: r.hrv! }))
        .reverse();
      const hrvAvg =
        hrvSeries.length > 0
          ? hrvSeries.reduce((s, r) => s + r.hrv, 0) / hrvSeries.length
          : null;
      // Use the most recent NON-NULL HRV reading rather than `latest.hrv` so
      // the trend doesn't disappear on days that lack an HRV measurement.
      const hrvLatest =
        hrvSeries.length > 0 ? hrvSeries[hrvSeries.length - 1]!.hrv : null;
      const hrvTrend =
        hrvAvg != null && hrvLatest != null
          ? hrvLatest > hrvAvg * 1.05
            ? "rising"
            : hrvLatest < hrvAvg * 0.95
              ? "falling"
              : "stable"
          : null;

      return {
        days,
        latest,
        latestDates,
        hrvSeries,
        hrvAvg: hrvAvg != null ? Math.round(hrvAvg * 10) / 10 : null,
        hrvTrend,
        computedAt: new Date(),
      };
    }),
} satisfies TRPCRouterRecord;
