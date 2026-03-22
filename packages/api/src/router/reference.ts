import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";
import { and, desc, eq } from "@acme/db";
import { CreateReferenceMeasurementSchema, ReferenceMeasurement } from "@acme/db/schema";
import { protectedProcedure } from "../trpc";

export const referenceRouter = {
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    return ctx.db.query.ReferenceMeasurement.findMany({
      where: eq(ReferenceMeasurement.userId, userId),
      orderBy: desc(ReferenceMeasurement.date),
    });
  }),

  create: protectedProcedure
    .input(CreateReferenceMeasurementSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Auto-compute deviation if garminComparableValue is provided
      let deviationPercent: number | null = null;
      if (input.garminComparableValue != null && input.value !== 0) {
        deviationPercent =
          ((input.garminComparableValue - input.value) / input.value) * 100;
      }

      const [row] = await ctx.db
        .insert(ReferenceMeasurement)
        .values({ ...input, userId, deviationPercent })
        .returning();
      return row;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [row] = await ctx.db
        .delete(ReferenceMeasurement)
        .where(
          and(
            eq(ReferenceMeasurement.id, input.id),
            eq(ReferenceMeasurement.userId, userId),
          ),
        )
        .returning();
      return row ?? null;
    }),
} satisfies TRPCRouterRecord;
