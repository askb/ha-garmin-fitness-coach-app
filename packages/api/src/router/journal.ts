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
        sorenessScore: z.number().int().min(1).max(10).optional(),
        sorenessRegions: z.array(z.string()).optional(),
        moodScore: z.number().int().min(1).max(10).optional(),
        caffeineAmountMg: z.number().int().min(0).optional(),
        caffeineTime: z.string().optional(),
        alcoholDrinks: z.number().int().min(0).optional(),
        napMinutes: z.number().int().min(0).optional(),
        medications: z.array(z.string()).optional(),
        menstrualPhase: z
          .enum(["follicular", "ovulation", "luteal", "menstrual"])
          .optional()
          .nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const {
        date,
        tags,
        notes,
        sorenessScore,
        sorenessRegions,
        moodScore,
        caffeineAmountMg,
        caffeineTime,
        alcoholDrinks,
        napMinutes,
        medications,
        menstrualPhase,
      } = input;

      const values = {
        userId,
        date,
        tags: tags,
        notes: notes ?? null,
        sorenessScore: sorenessScore ?? null,
        sorenessRegions: sorenessRegions ?? null,
        moodScore: moodScore ?? null,
        caffeineAmountMg: caffeineAmountMg ?? null,
        caffeineTime: caffeineTime ?? null,
        alcoholDrinks: alcoholDrinks ?? null,
        napMinutes: napMinutes ?? null,
        medications: medications ?? null,
        menstrualPhase: menstrualPhase ?? null,
      };

      const [entry] = await ctx.db
        .insert(JournalEntry)
        .values(values)
        .onConflictDoUpdate({
          target: [JournalEntry.userId, JournalEntry.date],
          set: {
            tags: tags,
            notes: notes ?? null,
            sorenessScore: sorenessScore ?? null,
            sorenessRegions: sorenessRegions ?? null,
            moodScore: moodScore ?? null,
            caffeineAmountMg: caffeineAmountMg ?? null,
            caffeineTime: caffeineTime ?? null,
            alcoholDrinks: alcoholDrinks ?? null,
            napMinutes: napMinutes ?? null,
            medications: medications ?? null,
            menstrualPhase: menstrualPhase ?? null,
            updatedAt: new Date(),
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
