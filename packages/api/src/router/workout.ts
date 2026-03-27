import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import type { ReadinessZone } from "@acme/engine";
import { and, desc, eq, gte } from "@acme/db";
import {
  Activity,
  DailyWorkout,
  Profile,
  ReadinessScore,
  WeeklyPlan,
} from "@acme/db/schema";
import {
  adjustDifficulty,
  countConsecutiveHardDays,
  generateDailyWorkout,
} from "@acme/engine";

import { protectedProcedure } from "../trpc";

function getDateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0]!;
}

function getDayOfWeek(): number {
  // 0 = Monday ... 6 = Sunday
  const jsDay = new Date().getDay(); // 0 = Sunday
  return jsDay === 0 ? 6 : jsDay - 1;
}

export const workoutRouter = {
  getToday: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const today = getDateString(0);

    // Check if already generated
    const existing = await ctx.db.query.DailyWorkout.findFirst({
      where: and(eq(DailyWorkout.userId, userId), eq(DailyWorkout.date, today)),
    });
    if (existing) return existing;

    // Get profile + readiness
    const profile = await ctx.db.query.Profile.findFirst({
      where: eq(Profile.userId, userId),
    });
    if (!profile) return null;

    const readiness = await ctx.db.query.ReadinessScore.findFirst({
      where: and(
        eq(ReadinessScore.userId, userId),
        eq(ReadinessScore.date, today),
      ),
    });

    const zone: ReadinessZone =
      (readiness?.zone as ReadinessZone) ?? "moderate";

    // Get recent strain for hard day stacking check
    const recentActivities = await ctx.db.query.Activity.findMany({
      where: and(
        eq(Activity.userId, userId),
        gte(Activity.startedAt, new Date(Date.now() - 3 * 86400000)),
      ),
      orderBy: desc(Activity.startedAt),
    });
    const recentStrains = recentActivities.map((a) => a.strainScore ?? 0);
    const consecutiveHard = countConsecutiveHardDays(recentStrains);

    const sport = (profile.primarySports as string[])?.[0] ?? "running";
    const goal =
      (profile.goals as { sport: string; goalType: string }[])?.[0]?.goalType ??
      "maintain";
    const availableDays = (profile.weeklyDays as string[])?.length ?? 3;

    const recommendation = generateDailyWorkout(
      sport,
      goal,
      getDayOfWeek(),
      availableDays,
      zone,
      consecutiveHard,
    );

    // Persist
    const [saved] = await ctx.db
      .insert(DailyWorkout)
      .values({
        userId,
        date: today,
        sportType: recommendation.sportType,
        workoutType: recommendation.workoutType,
        title: recommendation.title,
        description: recommendation.description,
        targetDurationMin: recommendation.targetDurationMin,
        targetDurationMax: recommendation.targetDurationMax,
        targetHrZoneLow: recommendation.targetHrZoneLow,
        targetHrZoneHigh: recommendation.targetHrZoneHigh,
        targetStrainLow: recommendation.targetStrainLow,
        targetStrainHigh: recommendation.targetStrainHigh,
        structure: recommendation.structure,
        readinessZoneUsed: zone,
        explanation: recommendation.explanation,
      })
      .returning();

    return saved;
  }),

  getWeekPlan: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const weekStart = getDateString(getDayOfWeek()); // Monday

    return ctx.db.query.DailyWorkout.findMany({
      where: and(
        eq(DailyWorkout.userId, userId),
        gte(DailyWorkout.date, weekStart),
      ),
      orderBy: DailyWorkout.date,
    });
  }),

  getDetail: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.DailyWorkout.findFirst({
        where: and(
          eq(DailyWorkout.id, input.id),
          eq(DailyWorkout.userId, ctx.session.user.id),
        ),
      });
    }),

  adjustDifficulty: protectedProcedure
    .input(
      z.object({
        direction: z.enum(["harder", "easier"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const today = getDateString(0);

      const existing = await ctx.db.query.DailyWorkout.findFirst({
        where: and(
          eq(DailyWorkout.userId, userId),
          eq(DailyWorkout.date, today),
        ),
      });

      if (!existing) return null;

      const profile = await ctx.db.query.Profile.findFirst({
        where: eq(Profile.userId, userId),
      });

      const sport = (profile?.primarySports as string[])?.[0] ?? "running";

      const currentRecommendation = {
        sportType: existing.sportType,
        workoutType: existing.workoutType,
        title: existing.title,
        description: existing.description ?? "",
        targetDurationMin: existing.targetDurationMin ?? 30,
        targetDurationMax: existing.targetDurationMax ?? 45,
        targetHrZoneLow: existing.targetHrZoneLow ?? 2,
        targetHrZoneHigh: existing.targetHrZoneHigh ?? 3,
        targetStrainLow: existing.targetStrainLow ?? 5,
        targetStrainHigh: existing.targetStrainHigh ?? 10,
        structure: (existing.structure as any[]) ?? [],
        explanation: existing.explanation ?? "",
      };

      const adjusted = adjustDifficulty(
        currentRecommendation,
        input.direction,
        sport,
      );

      // Update in DB
      await ctx.db
        .update(DailyWorkout)
        .set({
          title: adjusted.title,
          description: adjusted.description,
          targetDurationMin: adjusted.targetDurationMin,
          targetDurationMax: adjusted.targetDurationMax,
          targetHrZoneLow: adjusted.targetHrZoneLow,
          targetHrZoneHigh: adjusted.targetHrZoneHigh,
          targetStrainLow: adjusted.targetStrainLow,
          targetStrainHigh: adjusted.targetStrainHigh,
          structure: adjusted.structure,
          explanation: adjusted.explanation,
        })
        .where(eq(DailyWorkout.id, existing.id));

      return adjusted;
    }),
} satisfies TRPCRouterRecord;
