import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, eq, gte } from "@acme/db";
import { Activity } from "@acme/db/schema";

import { protectedProcedure } from "../trpc";

interface HrZoneMinutes {
  zone1: number;
  zone2: number;
  zone3: number;
  zone4: number;
  zone5: number;
}

function getDateAgo(days: number): Date {
  return new Date(Date.now() - days * 86400000);
}

function getISOWeekMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d.toISOString().split("T")[0]!;
}

function getMonthString(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function getDateString(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

function parseZones(raw: unknown): HrZoneMinutes | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const zone1 = Number(obj.zone1) || 0;
  const zone2 = Number(obj.zone2) || 0;
  const zone3 = Number(obj.zone3) || 0;
  const zone4 = Number(obj.zone4) || 0;
  const zone5 = Number(obj.zone5) || 0;
  if (zone1 + zone2 + zone3 + zone4 + zone5 === 0) return null;
  return { zone1, zone2, zone3, zone4, zone5 };
}

function normalizeSportType(
  sportType: string,
): "running" | "walking" | "strength" | "yoga" | "tennis" | "other" {
  const lower = sportType.toLowerCase();
  if (lower.includes("run")) return "running";
  if (lower.includes("walk") || lower.includes("hik")) return "walking";
  if (lower.includes("strength") || lower.includes("weight")) return "strength";
  if (lower.includes("yoga") || lower.includes("pilates")) return "yoga";
  if (lower.includes("tennis")) return "tennis";
  return "other";
}

export const zonesRouter = {
  getWeeklyZoneDistribution: protectedProcedure
    .input(
      z.object({
        sportType: z.string().optional(),
        days: z.number().min(1).max(730).default(365),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const since = getDateAgo(input.days);

      const activities = await ctx.db.query.Activity.findMany({
        where: and(
          eq(Activity.userId, userId),
          gte(Activity.startedAt, since),
          input.sportType
            ? eq(Activity.sportType, input.sportType)
            : undefined,
        ),
        orderBy: Activity.startedAt,
      });

      const weekMap = new Map<
        string,
        {
          z1: number;
          z2: number;
          z3: number;
          z4: number;
          z5: number;
          activities: number;
        }
      >();

      for (const a of activities) {
        const zones = parseZones(a.hrZoneMinutes);
        if (!zones) continue;
        const week = getISOWeekMonday(a.startedAt);
        const cur = weekMap.get(week) ?? {
          z1: 0,
          z2: 0,
          z3: 0,
          z4: 0,
          z5: 0,
          activities: 0,
        };
        cur.z1 += zones.zone1;
        cur.z2 += zones.zone2;
        cur.z3 += zones.zone3;
        cur.z4 += zones.zone4;
        cur.z5 += zones.zone5;
        cur.activities += 1;
        weekMap.set(week, cur);
      }

      return Array.from(weekMap.entries())
        .map(([week, d]) => ({
          week,
          z1: Math.round(d.z1 * 10) / 10,
          z2: Math.round(d.z2 * 10) / 10,
          z3: Math.round(d.z3 * 10) / 10,
          z4: Math.round(d.z4 * 10) / 10,
          z5: Math.round(d.z5 * 10) / 10,
          total:
            Math.round(
              (d.z1 + d.z2 + d.z3 + d.z4 + d.z5) * 10,
            ) / 10,
          activities: d.activities,
        }))
        .sort((a, b) => a.week.localeCompare(b.week));
    }),

  getPolarizationIndex: protectedProcedure
    .input(
      z.object({
        days: z.number().min(1).max(730).default(90),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const since = getDateAgo(input.days);

      const activities = await ctx.db.query.Activity.findMany({
        where: and(
          eq(Activity.userId, userId),
          gte(Activity.startedAt, since),
        ),
        orderBy: Activity.startedAt,
      });

      const weekMap = new Map<
        string,
        { easy: number; moderate: number; hard: number }
      >();

      for (const a of activities) {
        const zones = parseZones(a.hrZoneMinutes);
        if (!zones) continue;
        const week = getISOWeekMonday(a.startedAt);
        const cur = weekMap.get(week) ?? {
          easy: 0,
          moderate: 0,
          hard: 0,
        };
        cur.easy += zones.zone1 + zones.zone2;
        cur.moderate += zones.zone3;
        cur.hard += zones.zone4 + zones.zone5;
        weekMap.set(week, cur);
      }

      return Array.from(weekMap.entries())
        .map(([week, d]) => {
          const total = d.easy + d.moderate + d.hard;
          if (total === 0) {
            return {
              week,
              easyPct: 0,
              moderatePct: 0,
              hardPct: 0,
              polarizationIndex: 0,
            };
          }
          const pEasy = d.easy / total;
          const pMod = d.moderate / total;
          const pHard = d.hard / total;
          const sumPiSq = pEasy ** 2 + pMod ** 2 + pHard ** 2;
          // Seiler's PI = ln(1 / Σpi²). Perfect polarized ≈ 2.0+
          const polarizationIndex =
            sumPiSq > 0 ? Math.log(1 / sumPiSq) : 0;
          return {
            week,
            easyPct: Math.round(pEasy * 1000) / 10,
            moderatePct: Math.round(pMod * 1000) / 10,
            hardPct: Math.round(pHard * 1000) / 10,
            polarizationIndex:
              Math.round(polarizationIndex * 100) / 100,
          };
        })
        .sort((a, b) => a.week.localeCompare(b.week));
    }),

  getZoneTrends: protectedProcedure
    .input(
      z.object({
        sportType: z.string().optional(),
        days: z.number().min(1).max(730).default(180),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const since = getDateAgo(input.days);

      const activities = await ctx.db.query.Activity.findMany({
        where: and(
          eq(Activity.userId, userId),
          gte(Activity.startedAt, since),
          input.sportType
            ? eq(Activity.sportType, input.sportType)
            : undefined,
        ),
        orderBy: Activity.startedAt,
      });

      const monthMap = new Map<
        string,
        { z1: number; z2: number; z3: number; z4: number; z5: number }
      >();

      for (const a of activities) {
        const zones = parseZones(a.hrZoneMinutes);
        if (!zones) continue;
        const month = getMonthString(a.startedAt);
        const cur = monthMap.get(month) ?? {
          z1: 0,
          z2: 0,
          z3: 0,
          z4: 0,
          z5: 0,
        };
        cur.z1 += zones.zone1;
        cur.z2 += zones.zone2;
        cur.z3 += zones.zone3;
        cur.z4 += zones.zone4;
        cur.z5 += zones.zone5;
        monthMap.set(month, cur);
      }

      return Array.from(monthMap.entries())
        .map(([month, d]) => {
          const total = d.z1 + d.z2 + d.z3 + d.z4 + d.z5;
          if (total === 0) {
            return {
              month,
              z1Pct: 0,
              z2Pct: 0,
              z3Pct: 0,
              z4Pct: 0,
              z5Pct: 0,
            };
          }
          return {
            month,
            z1Pct: Math.round((d.z1 / total) * 1000) / 10,
            z2Pct: Math.round((d.z2 / total) * 1000) / 10,
            z3Pct: Math.round((d.z3 / total) * 1000) / 10,
            z4Pct: Math.round((d.z4 / total) * 1000) / 10,
            z5Pct: Math.round((d.z5 / total) * 1000) / 10,
          };
        })
        .sort((a, b) => a.month.localeCompare(b.month));
    }),

  getEfficiencyTrend: protectedProcedure
    .input(
      z.object({
        sportType: z.string().default("running"),
        days: z.number().min(1).max(730).default(365),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const since = getDateAgo(input.days);

      const activities = await ctx.db.query.Activity.findMany({
        where: and(
          eq(Activity.userId, userId),
          eq(Activity.sportType, input.sportType),
          gte(Activity.startedAt, since),
        ),
        orderBy: Activity.startedAt,
      });

      return activities
        .filter(
          (a) =>
            a.avgHr != null &&
            a.avgHr > 0 &&
            a.avgPaceSecPerKm != null &&
            a.avgPaceSecPerKm > 0,
        )
        .map((a) => {
          const speedMs = 1000 / a.avgPaceSecPerKm!;
          const efficiencyIndex = (speedMs / a.avgHr!) * 1000;
          return {
            date: getDateString(a.startedAt),
            avgHr: a.avgHr!,
            paceSecPerKm: a.avgPaceSecPerKm!,
            efficiencyIndex:
              Math.round(efficiencyIndex * 100) / 100,
          };
        });
    }),

  getActivityCalendar: protectedProcedure
    .input(
      z.object({
        days: z.number().min(1).max(730).default(365),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const since = getDateAgo(input.days);

      const activities = await ctx.db.query.Activity.findMany({
        where: and(
          eq(Activity.userId, userId),
          gte(Activity.startedAt, since),
        ),
        orderBy: Activity.startedAt,
      });

      const dayMap = new Map<
        string,
        {
          totalMinutes: number;
          activities: number;
          sportCounts: Map<string, number>;
          maxStrain: number;
        }
      >();

      for (const a of activities) {
        const date = getDateString(a.startedAt);
        const cur = dayMap.get(date) ?? {
          totalMinutes: 0,
          activities: 0,
          sportCounts: new Map<string, number>(),
          maxStrain: 0,
        };
        cur.totalMinutes += a.durationMinutes;
        cur.activities += 1;
        cur.sportCounts.set(
          a.sportType,
          (cur.sportCounts.get(a.sportType) ?? 0) + 1,
        );
        if (a.strainScore != null && a.strainScore > cur.maxStrain) {
          cur.maxStrain = a.strainScore;
        }
        dayMap.set(date, cur);
      }

      return Array.from(dayMap.entries())
        .map(([date, d]) => {
          let primarySport = "";
          let maxCount = 0;
          for (const [sport, count] of d.sportCounts) {
            if (count > maxCount) {
              maxCount = count;
              primarySport = sport;
            }
          }
          return {
            date,
            totalMinutes: Math.round(d.totalMinutes * 10) / 10,
            activities: d.activities,
            primarySport,
            maxStrain: Math.round(d.maxStrain * 10) / 10,
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date));
    }),

  getVolumeByWeek: protectedProcedure
    .input(
      z.object({
        days: z.number().min(1).max(730).default(365),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const since = getDateAgo(input.days);

      const activities = await ctx.db.query.Activity.findMany({
        where: and(
          eq(Activity.userId, userId),
          gte(Activity.startedAt, since),
        ),
        orderBy: Activity.startedAt,
      });

      const weekMap = new Map<
        string,
        {
          running: number;
          walking: number;
          strength: number;
          yoga: number;
          tennis: number;
          other: number;
        }
      >();

      for (const a of activities) {
        const week = getISOWeekMonday(a.startedAt);
        const cur = weekMap.get(week) ?? {
          running: 0,
          walking: 0,
          strength: 0,
          yoga: 0,
          tennis: 0,
          other: 0,
        };
        const category = normalizeSportType(a.sportType);
        cur[category] += a.durationMinutes;
        weekMap.set(week, cur);
      }

      return Array.from(weekMap.entries())
        .map(([week, d]) => ({
          week,
          running: Math.round(d.running * 10) / 10,
          walking: Math.round(d.walking * 10) / 10,
          strength: Math.round(d.strength * 10) / 10,
          yoga: Math.round(d.yoga * 10) / 10,
          tennis: Math.round(d.tennis * 10) / 10,
          other: Math.round(d.other * 10) / 10,
          total:
            Math.round(
              (d.running +
                d.walking +
                d.strength +
                d.yoga +
                d.tennis +
                d.other) *
                10,
            ) / 10,
        }))
        .sort((a, b) => a.week.localeCompare(b.week));
    }),

  getPeakPerformances: protectedProcedure
    .input(
      z.object({
        sportType: z.string().default("running"),
        metric: z.enum(["pace", "distance", "duration", "hr"]),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const activities = await ctx.db.query.Activity.findMany({
        where: and(
          eq(Activity.userId, userId),
          eq(Activity.sportType, input.sportType),
        ),
        orderBy: Activity.startedAt,
      });

      const monthMap = new Map<
        string,
        { bestValue: number; activityDate: string }
      >();

      for (const a of activities) {
        let value: number | null = null;
        switch (input.metric) {
          case "pace":
            value = a.avgPaceSecPerKm;
            break;
          case "distance":
            value = a.distanceMeters;
            break;
          case "duration":
            value = a.durationMinutes;
            break;
          case "hr":
            value = a.avgHr;
            break;
        }
        if (value == null) continue;

        const month = getMonthString(a.startedAt);
        const date = getDateString(a.startedAt);
        const existing = monthMap.get(month);

        // For pace: lower is better (faster). For others: higher is better.
        const isBetter =
          !existing ||
          (input.metric === "pace"
            ? value < existing.bestValue
            : value > existing.bestValue);

        if (isBetter) {
          monthMap.set(month, { bestValue: value, activityDate: date });
        }
      }

      return Array.from(monthMap.entries())
        .map(([month, d]) => ({
          month,
          bestValue: Math.round(d.bestValue * 100) / 100,
          activityDate: d.activityDate,
        }))
        .sort((a, b) => a.month.localeCompare(b.month));
    }),
} satisfies TRPCRouterRecord;
