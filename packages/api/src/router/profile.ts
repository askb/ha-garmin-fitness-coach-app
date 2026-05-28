import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { eq } from "@acme/db";
import { CreateProfileSchema, Profile } from "@acme/db/schema";

import { protectedProcedure } from "../trpc";

export function supportedTimezones(): string[] {
  if (typeof Intl.supportedValuesOf !== "function") return ["UTC"];
  return Intl.supportedValuesOf("timeZone");
}

export function isSupportedTimezone(timezone: string): boolean {
  return timezone === "UTC" || supportedTimezones().includes(timezone);
}

function validateTimezone(timezone: string): string {
  if (!isSupportedTimezone(timezone)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unsupported IANA timezone: ${timezone}`,
    });
  }
  return timezone;
}

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

  updateTimezone: protectedProcedure
    .input(z.object({ timezone: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const timezone = validateTimezone(input.timezone);
      const existing = await ctx.db.query.Profile.findFirst({
        where: eq(Profile.userId, ctx.session.user.id),
      });

      if (existing) {
        await ctx.db
          .update(Profile)
          .set({ timezone })
          .where(eq(Profile.userId, ctx.session.user.id));
        return { ...existing, timezone };
      }

      const [created] = await ctx.db
        .insert(Profile)
        .values({ userId: ctx.session.user.id, timezone })
        .returning();
      return created;
    }),

  updateHealth: protectedProcedure
    .input(
      z.object({
        healthConditions: z.array(z.string()).optional(),
        currentInjuries: z
          .array(
            z.object({
              bodyPart: z.string(),
              severity: z.enum(["mild", "moderate", "severe"]),
              since: z.string().optional(),
              notes: z.string().optional(),
            }),
          )
          .optional(),
        medications: z.string().optional(),
        allergies: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(Profile)
        .set(input)
        .where(eq(Profile.userId, ctx.session.user.id));
    }),
} satisfies TRPCRouterRecord;
