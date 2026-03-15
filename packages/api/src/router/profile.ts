import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { eq } from "@acme/db";
import { Profile, CreateProfileSchema } from "@acme/db/schema";

import { protectedProcedure } from "../trpc";

export const profileRouter = {
  get: protectedProcedure.query(async ({ ctx }) => {
    const profile = await ctx.db.query.Profile.findFirst({
      where: eq(Profile.userId, ctx.session.user.id),
    });
    return profile ?? null;
  }),

  upsert: protectedProcedure
    .input(CreateProfileSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.Profile.findFirst({
        where: eq(Profile.userId, ctx.session.user.id),
      });

      if (existing) {
        await ctx.db
          .update(Profile)
          .set({ ...input, userId: ctx.session.user.id })
          .where(eq(Profile.id, existing.id));
        return { ...existing, ...input };
      }

      const [created] = await ctx.db
        .insert(Profile)
        .values({ ...input, userId: ctx.session.user.id })
        .returning();
      return created;
    }),

  updateSportsAndGoals: protectedProcedure
    .input(
      z.object({
        primarySports: z.array(z.string()),
        goals: z.array(
          z.object({
            sport: z.string(),
            goalType: z.string(),
            target: z.string().optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(Profile)
        .set({
          primarySports: input.primarySports,
          goals: input.goals,
        })
        .where(eq(Profile.userId, ctx.session.user.id));
    }),

  updateAvailability: protectedProcedure
    .input(
      z.object({
        weeklyDays: z.array(z.string()),
        minutesPerDay: z.number().min(15).max(180),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(Profile)
        .set(input)
        .where(eq(Profile.userId, ctx.session.user.id));
    }),
} satisfies TRPCRouterRecord;
