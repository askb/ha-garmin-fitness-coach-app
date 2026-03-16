import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, gte, lte } from "@acme/db";
import { JournalEntry } from "@acme/db/schema";

import { protectedProcedure } from "../trpc";

export const journalRouter = {
  list: protectedProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.query.JournalEntry.findMany({
        where: and(
          eq(JournalEntry.userId, ctx.session.user.id),
          gte(JournalEntry.date, input.startDate),
          lte(JournalEntry.date, input.endDate),
        ),
        orderBy: desc(JournalEntry.date),
      });
    }),

  getByDate: protectedProcedure
    .input(z.object({ date: z.string() }))
    .query(async ({ ctx, input }) => {
      const entry = await ctx.db.query.JournalEntry.findFirst({
        where: and(
          eq(JournalEntry.userId, ctx.session.user.id),
          eq(JournalEntry.date, input.date),
        ),
      });
      return entry ?? null;
    }),

  upsert: protectedProcedure
    .input(
      z.object({
        date: z.string(),
        tags: z.record(
          z.string(),
          z.union([z.boolean(), z.number(), z.string()]),
        ),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [entry] = await ctx.db
        .insert(JournalEntry)
        .values({
          userId,
          date: input.date,
          tags: input.tags,
          notes: input.notes,
        })
        .onConflictDoUpdate({
          target: [JournalEntry.userId, JournalEntry.date],
          set: {
            tags: input.tags,
            notes: input.notes,
          },
        })
        .returning();

      return entry;
    }),

  delete: protectedProcedure
    .input(z.object({ date: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(JournalEntry)
        .where(
          and(
            eq(JournalEntry.userId, ctx.session.user.id),
            eq(JournalEntry.date, input.date),
          ),
        );
      return { success: true };
    }),
} satisfies TRPCRouterRecord;
