import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, count, desc, eq, gte, sql } from "@acme/db";
import {
  AdvancedMetric,
  DailyMetric,
  DataQualityLog,
  ReadinessScore,
  VO2maxEstimate,
} from "@acme/db/schema";

import { protectedProcedure } from "../trpc";

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0]!;
}

export interface RawVsComputedRow {
  date: string;
  raw: number;
  computed: number;
  deltaPct: number | null;
  status: "match" | "minor" | "diverged" | "invalid";
}

interface ValidRange {
  min: number;
  max: number;
}

function inRange(value: number, range?: ValidRange): boolean {
  if (!range) return true;
  return Number.isFinite(value) && value >= range.min && value <= range.max;
}

function classify(
  raw: number,
  computed: number,
  range?: ValidRange,
): RawVsComputedRow["status"] {
  // A physiologically-impossible value on either side means the comparison
  // itself is meaningless — surface it as "invalid" instead of silently
  // counting it as a match/divergence (which would pollute the agreement %).
  if (!inRange(raw, range) || !inRange(computed, range)) return "invalid";
  if (raw === 0) return computed === 0 ? "match" : "diverged";
  const pct = Math.abs((computed - raw) / raw) * 100;
  if (pct < 5) return "match";
  if (pct < 15) return "minor";
  return "diverged";
}

function pairRow(
  date: string,
  raw: number,
  computed: number,
  range?: ValidRange,
): RawVsComputedRow {
  const status = classify(raw, computed, range);
  // A meaningless comparison (out-of-range/non-finite) must not surface a
  // delta — it would be misleading and can be NaN/Infinity.
  const deltaPct =
    status === "invalid" || raw === 0 ? null : ((computed - raw) / raw) * 100;
  return {
    date,
    raw,
    computed,
    deltaPct: deltaPct === null ? null : Math.round(deltaPct * 10) / 10,
    status,
  };
}

// Readiness is defined on a 0–100 scale; VO2max never physically exceeds
// ~100 ml/kg/min. Values outside these bounds indicate a sync/parsing bug.
const READINESS_RANGE: ValidRange = { min: 0, max: 100 };
const VO2MAX_RANGE: ValidRange = { min: 0, max: 100 };

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
        byDate[d].errors += row.cnt;
      } else if (row.severity === "warn") {
        warnings += row.cnt;
        byDate[d].warnings += row.cnt;
      } else {
        infos += row.cnt;
        byDate[d].infos += row.cnt;
      }
    }

    const total = errors + warnings + infos;
    // Score: start at 100, deduct 10 per error, 3 per warning
    const score = Math.max(0, Math.min(100, 100 - errors * 10 - warnings * 3));

    return { errors, warnings, infos, total, score, byDate };
  }),

  getRawVsComputed: protectedProcedure
    .input(z.object({ days: z.number().min(7).max(90).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const since = dateNDaysAgo(input?.days ?? 30);

      // Readiness: Garmin native vs engine-computed score.
      const dailyRows = await ctx.db
        .select({
          date: DailyMetric.date,
          garminReadiness: DailyMetric.garminTrainingReadiness,
        })
        .from(DailyMetric)
        .where(
          and(eq(DailyMetric.userId, userId), gte(DailyMetric.date, since)),
        );
      const readinessRows = await ctx.db
        .select({ date: ReadinessScore.date, score: ReadinessScore.score })
        .from(ReadinessScore)
        .where(
          and(
            eq(ReadinessScore.userId, userId),
            gte(ReadinessScore.date, since),
          ),
        );
      const garminReadinessByDate = new Map(
        dailyRows
          .filter((r) => r.garminReadiness != null)
          .map((r) => [r.date, r.garminReadiness!]),
      );
      const readiness: RawVsComputedRow[] = [];
      for (const r of readinessRows) {
        const raw = garminReadinessByDate.get(r.date);
        if (raw == null) continue;
        readiness.push(pairRow(r.date, raw, r.score, READINESS_RANGE));
      }

      // VO2max: Garmin official estimate vs engine effective VO2max.
      const vo2Rows = await ctx.db
        .select({ date: VO2maxEstimate.date, value: VO2maxEstimate.value })
        .from(VO2maxEstimate)
        .where(
          and(
            eq(VO2maxEstimate.userId, userId),
            eq(VO2maxEstimate.source, "garmin_official"),
            gte(VO2maxEstimate.date, since),
          ),
        );
      const advRows = await ctx.db
        .select({
          date: AdvancedMetric.date,
          effectiveVo2max: AdvancedMetric.effectiveVo2max,
        })
        .from(AdvancedMetric)
        .where(
          and(
            eq(AdvancedMetric.userId, userId),
            gte(AdvancedMetric.date, since),
          ),
        );
      const effectiveByDate = new Map(
        advRows
          .filter((r) => r.effectiveVo2max != null)
          .map((r) => [r.date, r.effectiveVo2max!]),
      );
      const vo2max: RawVsComputedRow[] = [];
      for (const r of vo2Rows) {
        const computed = effectiveByDate.get(r.date);
        if (computed == null) continue;
        vo2max.push(pairRow(r.date, r.value, computed, VO2MAX_RANGE));
      }

      readiness.sort((a, b) => b.date.localeCompare(a.date));
      vo2max.sort((a, b) => b.date.localeCompare(a.date));

      const all = [...readiness, ...vo2max];
      const diverged = all.filter((r) => r.status === "diverged").length;
      const matched = all.filter((r) => r.status === "match").length;
      const invalid = all.filter((r) => r.status === "invalid").length;
      // Out-of-range pairs are excluded from the agreement denominator so a
      // bad sync value can't masquerade as agreement or divergence.
      const validPairs = all.length - invalid;

      return {
        readiness: readiness.slice(0, 30),
        vo2max: vo2max.slice(0, 30),
        summary: {
          comparedPairs: all.length,
          matched,
          diverged,
          invalid,
          agreementPct:
            validPairs > 0 ? Math.round((matched / validPairs) * 100) : null,
        },
      };
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
