import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";
import { and, asc, desc, eq, gte, lte } from "@acme/db";
import { AdvancedMetric } from "@acme/db/schema";
import { protectedProcedure } from "../trpc";

export const advancedMetricsRouter = {
  list: protectedProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        days: z.number().min(7).max(365).default(90),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const conditions = [eq(AdvancedMetric.userId, userId)];
      if (input.startDate) conditions.push(gte(AdvancedMetric.date, input.startDate));
      if (input.endDate) conditions.push(lte(AdvancedMetric.date, input.endDate));
      if (!input.startDate) {
        const since = new Date();
        since.setDate(since.getDate() - input.days);
        conditions.push(gte(AdvancedMetric.date, since.toISOString().split("T")[0]!));
      }
      return ctx.db.query.AdvancedMetric.findMany({
        where: and(...conditions),
        orderBy: asc(AdvancedMetric.date),
        limit: 365,
      });
    }),

  getLatest: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    return (
      (await ctx.db.query.AdvancedMetric.findFirst({
        where: eq(AdvancedMetric.userId, userId),
        orderBy: desc(AdvancedMetric.date),
      })) ?? null
    );
  }),
} satisfies TRPCRouterRecord;
