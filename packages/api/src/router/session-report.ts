import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, eq } from "@acme/db";
import { SessionReport } from "@acme/db/schema";

import { protectedProcedure } from "../trpc";

export const sessionReportRouter = {
  getByActivity: protectedProcedure
    .input(z.object({ activityId: z.string() }))
    .query(async ({ ctx, input }) => {
      return (
        (await ctx.db.query.SessionReport.findFirst({
          where: and(
            eq(SessionReport.activityId, input.activityId),
            eq(SessionReport.userId, ctx.session.user.id),
          ),
        })) ?? null
      );
    }),

  upsert: protectedProcedure
    .input(
      z.object({
        activityId: z.string(),
        garminActivityId: z.string().optional(),
        durationMinutes: z.number().optional(),
        rpe: z.number().int().min(1).max(10),
        sessionType: z
          .enum([
            "base",
            "threshold",
            "interval",
            "recovery",
            "race",
            "strength",
            "mobility",
          ])
          .optional(),
        drillNotes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const internalLoad =
        input.rpe && input.durationMinutes
          ? input.rpe * input.durationMinutes
          : undefined;

      const [report] = await ctx.db
        .insert(SessionReport)
        .values({
          userId: ctx.session.user.id,
          activityId: input.activityId,
          garminActivityId: input.garminActivityId,
          rpe: input.rpe,
          sessionType: input.sessionType,
          drillNotes: input.drillNotes,
          internalLoad,
        })
        .onConflictDoUpdate({
          target: [SessionReport.activityId, SessionReport.userId],
          set: {
            rpe: input.rpe,
            sessionType: input.sessionType,
            drillNotes: input.drillNotes,
            internalLoad,
          },
        })
        .returning();

      return report;
    }),
} satisfies TRPCRouterRecord;
