import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { Activity, DailyMetric } from "@acme/db/schema";
import {
  backfillDays,
  handleCallback as garminHandleCallback,
  initiateOAuth,
} from "@acme/garmin";

import { protectedProcedure } from "../trpc";

export const garminRouter = {
  getConnectionStatus: protectedProcedure.query(({ ctx: _ctx }) => {
    // TODO: Look up stored Garmin tokens for this user in the DB
    // For now return a mock connected status
    return {
      connected: true,
      garminUserId: "garmin-user-mock-001",
      lastSyncedAt: new Date().toISOString(),
    };
  }),

  initiateOAuth: protectedProcedure.mutation(() => {
    const { authUrl, oauthTokenSecret: _oauthTokenSecret } = initiateOAuth();
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
    .mutation(({ ctx: _ctx, input }) => {
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
} satisfies TRPCRouterRecord;
