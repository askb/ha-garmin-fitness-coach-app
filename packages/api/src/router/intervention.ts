import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, gte, lte } from "@acme/db";
import { Intervention } from "@acme/db/schema";

import { protectedProcedure } from "../trpc";

const INTERVENTION_TYPES = [
  "reduced_load",
  "extra_sleep",
  "physio",
  "nutrition_change",
  "deload_week",
  "travel_recovery",
  "ice_bath",
  "compression",
  "massage",
  "meditation",
  "other",
] as const;

export const interventionRouter = {
  list: protectedProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(Intervention.userId, ctx.session.user.id)];
      if (input.startDate)
        conditions.push(gte(Intervention.date, input.startDate));
      if (input.endDate) conditions.push(lte(Intervention.date, input.endDate));
      return ctx.db.query.Intervention.findMany({
        where: and(...conditions),
        orderBy: desc(Intervention.date),
        limit: 50,
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        date: z.string(),
        type: z.enum(INTERVENTION_TYPES),
        description: z.string().optional(),
        outcomeNotes: z.string().optional(),
        effectivenessRating: z.number().int().min(1).max(5).optional(),
        linkedMetricDate: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [intervention] = await ctx.db
        .insert(Intervention)
        .values({ userId: ctx.session.user.id, ...input })
        .returning();
      return intervention;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        outcomeNotes: z.string().optional(),
        effectivenessRating: z.number().int().min(1).max(5).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [updated] = await ctx.db
        .update(Intervention)
        .set(data)
        .where(
          and(
            eq(Intervention.id, id),
            eq(Intervention.userId, ctx.session.user.id),
          ),
        )
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(Intervention)
        .where(
          and(
            eq(Intervention.id, input.id),
            eq(Intervention.userId, ctx.session.user.id),
          ),
        );
      return { success: true };
    }),
} satisfies TRPCRouterRecord;
