import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, count, desc, eq, gte, sql } from "@acme/db";
import { DataQualityLog } from "@acme/db/schema";

import { protectedProcedure } from "../trpc";

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0]!;
}

export const dataQualityRouter = {
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    return ctx.db.query.DataQualityLog.findMany({
      where: and(
        eq(DataQualityLog.userId, userId),
        gte(DataQualityLog.date, dateNDaysAgo(30)),
      ),
      orderBy: desc(DataQualityLog.createdAt),
      limit: 100,
    });
  }),

  getSummary: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const since = dateNDaysAgo(30);

    const rows = await ctx.db
      .select({
        date: DataQualityLog.date,
        severity: DataQualityLog.severity,
        cnt: count(),
      })
      .from(DataQualityLog)
      .where(
        and(eq(DataQualityLog.userId, userId), gte(DataQualityLog.date, since)),
      )
      .groupBy(DataQualityLog.date, DataQualityLog.severity);

    // Aggregate counts per severity
    let errors = 0;
    let warnings = 0;
    let infos = 0;
    const byDate: Record<
      string,
      { errors: number; warnings: number; infos: number }
    > = {};

    for (const row of rows) {
      const d = row.date;
      byDate[d] ??= { errors: 0, warnings: 0, infos: 0 };
      if (row.severity === "error") {
        errors += row.cnt;
        byDate[d]!.errors += row.cnt;
      } else if (row.severity === "warn") {
        warnings += row.cnt;
        byDate[d]!.warnings += row.cnt;
      } else {
        infos += row.cnt;
        byDate[d]!.infos += row.cnt;
      }
    }

    const total = errors + warnings + infos;
    // Score: start at 100, deduct 10 per error, 3 per warning
    const score = Math.max(0, Math.min(100, 100 - errors * 10 - warnings * 3));

    return { errors, warnings, infos, total, score, byDate };
  }),

  resolve: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [row] = await ctx.db
        .update(DataQualityLog)
        .set({ resolvedAt: sql`now()` })
        .where(
          and(
            eq(DataQualityLog.id, input.id),
            eq(DataQualityLog.userId, userId),
          ),
        )
        .returning();
      return row ?? null;
    }),
} satisfies TRPCRouterRecord;
