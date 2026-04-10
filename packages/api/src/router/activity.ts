import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, gte } from "@acme/db";
import { Activity, Profile } from "@acme/db/schema";
import { analyzeRunningForm } from "@acme/engine";

import { protectedProcedure } from "../trpc";

function getDateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0]!;
}

export const activityRouter = {
  list: protectedProcedure
    .input(
      z.object({
        days: z.number().min(1).max(365).default(30),
        sportType: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const conditions = [
        eq(Activity.userId, userId),
        gte(Activity.startedAt, since),
      ];

      if (input.sportType) {
        conditions.push(eq(Activity.sportType, input.sportType));
      }

      const activities = await ctx.db.query.Activity.findMany({
        where: and(...conditions),
        orderBy: desc(Activity.startedAt),
        limit: 50,
        columns: {
          id: true,
          sportType: true,
          subType: true,
          startedAt: true,
          durationMinutes: true,
          distanceMeters: true,
          avgHr: true,
          strainScore: true,
          vo2maxEstimate: true,
          avgPaceSecPerKm: true,
          calories: true,
          aerobicTE: true,
          anaerobicTE: true,
        },
      });

      return activities;
    }),

  getDetail: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const activity = await ctx.db.query.Activity.findFirst({
        where: and(eq(Activity.id, input.id), eq(Activity.userId, userId)),
      });

      if (!activity) {
        return null;
      }

      const profile = await ctx.db.query.Profile.findFirst({
        where: eq(Profile.userId, userId),
      });

      let runningFormScore = null;
      if (activity.sportType?.toLowerCase().includes("run")) {
        runningFormScore = analyzeRunningForm(
          activity.avgGroundContactTime,
          activity.verticalOscillation,
          activity.strideLength,
          activity.gctBalance,
          activity.avgCadence,
          profile?.heightCm ?? null,
        );
      }

      return {
        ...activity,
        runningFormScore,
      };
    }),

  getRecent: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const activities = await ctx.db.query.Activity.findMany({
      where: eq(Activity.userId, userId),
      orderBy: desc(Activity.startedAt),
      limit: 5,
      columns: {
        id: true,
        sportType: true,
        subType: true,
        startedAt: true,
        durationMinutes: true,
        distanceMeters: true,
        avgHr: true,
        strainScore: true,
        calories: true,
      },
    });

    return activities;
  }),
} satisfies TRPCRouterRecord;
