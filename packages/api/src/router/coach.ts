// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import type { db as appDb } from "@acme/db/client";
import type { DailyWorkoutStatus } from "@acme/db/schema";
import type {
  DailyRecommendationInput,
  Recommendation,
  RecommendationIntensity,
  ReconcileInput,
  ReconcileResult,
} from "@acme/engine";
import { and, asc, desc, eq, gte, inArray, lte } from "@acme/db";
import * as schema from "@acme/db/schema";
import {
  Activity,
  AdvancedMetric,
  AthleteBaseline,
  DailyMetric,
  DailyWorkout,
  Intervention,
  Profile,
  ReadinessScore,
  WeeklyPlan,
} from "@acme/db/schema";
import {
  computeStrainScore,
  countConsecutiveHardDays,
  recommendDay,
  reconcilePlanVsActual,
} from "@acme/engine";

import { frameRecommendationReason, recordRecommendationAudit } from "../lib";
import { dayInTimezone, shiftIsoDay, todayInTimezone } from "../lib/timezone";
import { protectedProcedure } from "../trpc";

const LLM_FRAME_TIMEOUT_MS = 5_000;
type AppDb = typeof appDb;
type EngineReadinessZone = NonNullable<
  DailyRecommendationInput["readiness"]
>["zone"];
type PlannedWorkoutInput = NonNullable<ReconcileInput["planned"]>;
type ActualActivityInput = ReconcileInput["actuals"][number];
type PersistableReconcileStatus = Extract<
  DailyWorkoutStatus,
  ReconcileResult["status"]
>;

function isIsoCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD date")
  .refine(isIsoCalendarDate, {
    message: "Expected a valid calendar date",
  });

const RecommendationActionInputSchema = z.object({
  userId: z.string(),
  date: IsoDateSchema,
  auditId: z.string().uuid(),
  note: z.string().max(500).optional(),
});

const RecommendationDeferInputSchema = RecommendationActionInputSchema.extend({
  deferToDate: IsoDateSchema,
});

function toIsoDay(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return value.toISOString().slice(0, 10);
}

function weekStartFor(isoDay: string): string {
  const date = new Date(`${isoDay}T12:00:00Z`);
  const jsDay = date.getUTCDay();
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return date.toISOString().slice(0, 10);
}

function mapReadinessZone(
  zone: string | null | undefined,
): EngineReadinessZone {
  switch (zone?.toLowerCase()) {
    case "prime":
    case "high":
    case "optimal":
      return "optimal";
    case "moderate":
    case "balanced":
      return "balanced";
    case "low":
    case "compromised":
      return "compromised";
    case "poor":
    case "stressed":
      return "stressed";
    default:
      return null;
  }
}

function inferIntensity(
  workout: typeof DailyWorkout.$inferSelect,
): RecommendationIntensity {
  const type = workout.workoutType.toLowerCase();
  if (type.includes("interval") || type.includes("tempo") || type === "race") {
    return "hard";
  }
  if (type.includes("easy") || type.includes("recovery") || type === "rest") {
    return "easy";
  }
  if (
    (workout.targetHrZoneHigh ?? 0) >= 4 ||
    (workout.targetStrainHigh ?? 0) >= 14
  ) {
    return "hard";
  }
  if (
    (workout.targetHrZoneHigh ?? 0) >= 3 ||
    (workout.targetStrainHigh ?? 0) >= 8
  ) {
    return "moderate";
  }
  return "easy";
}

function toWeeklyPlanInput(
  todayWorkout: typeof DailyWorkout.$inferSelect | null | undefined,
  weekWorkouts: (typeof DailyWorkout.$inferSelect)[],
  weeklyPlan: typeof WeeklyPlan.$inferSelect | null | undefined,
): DailyRecommendationInput["weeklyPlan"] {
  if (!todayWorkout && !weeklyPlan && weekWorkouts.length === 0) return null;

  const plannedToday = todayWorkout
    ? {
        workoutType: todayWorkout.workoutType,
        intensity: inferIntensity(todayWorkout),
        durationMin:
          todayWorkout.targetDurationMin ??
          todayWorkout.targetDurationMax ??
          30,
      }
    : null;
  const plannedWorkouts = weekWorkouts.filter(
    (workout) => workout.workoutType.toLowerCase() !== "rest",
  );

  return {
    plannedToday,
    sessionsThisWeek: plannedWorkouts.filter(
      (workout) =>
        workout.status === "completed" || workout.status === "partial",
    ).length,
    plannedThisWeek: Math.max(plannedWorkouts.length, plannedToday ? 1 : 0),
  };
}

function raceDateDaysAway(
  profile: typeof Profile.$inferSelect | null | undefined,
  date: string,
): number | null {
  const goals = Array.isArray(profile?.goals) ? profile.goals : [];
  const raceDays = goals
    .map((goal) => goal.target)
    .filter((target): target is string => Boolean(target))
    .map((target) => {
      const targetTime = Date.parse(`${target}T00:00:00Z`);
      const dateTime = Date.parse(`${date}T00:00:00Z`);
      if (!Number.isFinite(targetTime) || !Number.isFinite(dateTime))
        return null;
      return Math.floor((targetTime - dateTime) / 86_400_000);
    })
    .filter((days): days is number => days !== null && days >= 0)
    .sort((a, b) => a - b);

  return raceDays[0] ?? null;
}

function restDaysPerWeek(
  profile: typeof Profile.$inferSelect | null | undefined,
  baselines: (typeof AthleteBaseline.$inferSelect)[],
): number {
  const explicit = baselines.find(
    (baseline) => baseline.metricName === "rest_days_per_week",
  );
  if (explicit) return Math.max(0, Math.round(explicit.baselineValue));

  const trainingDays = Array.isArray(profile?.weeklyDays)
    ? profile.weeklyDays.length
    : 5;
  return Math.max(0, 7 - trainingDays);
}

function toEngineInput(args: {
  date: string;
  profile: typeof Profile.$inferSelect | null;
  readiness: typeof ReadinessScore.$inferSelect | null;
  dailyMetric: typeof DailyMetric.$inferSelect | null;
  advancedMetric: typeof AdvancedMetric.$inferSelect | null;
  activities: (typeof Activity.$inferSelect)[];
  todayWorkout: typeof DailyWorkout.$inferSelect | null;
  weekWorkouts: (typeof DailyWorkout.$inferSelect)[];
  weeklyPlan: typeof WeeklyPlan.$inferSelect | null;
  interventions: (typeof Intervention.$inferSelect)[];
  baselines: (typeof AthleteBaseline.$inferSelect)[];
}): DailyRecommendationInput {
  const hrvBaseline = args.baselines.find(
    (baseline) => baseline.metricName === "hrv",
  );
  const strainScores = args.activities.map(
    (activity) =>
      activity.strainScore ?? computeStrainScore(activity.trimpScore ?? 0),
  );

  return {
    date: args.date,
    readiness: args.readiness
      ? {
          score: args.readiness.score,
          zone: mapReadinessZone(args.readiness.zone),
          hrvDeviation: hrvBaseline?.zScoreLatest ?? null,
          sleepDebtMin: args.dailyMetric?.sleepDebtMinutes ?? null,
        }
      : null,
    load: {
      acwr: args.advancedMetric?.acwr ?? null,
      tsb: args.advancedMetric?.tsb ?? null,
      consecutiveHardDays: countConsecutiveHardDays(strainScores),
    },
    weeklyPlan: toWeeklyPlanInput(
      args.todayWorkout,
      args.weekWorkouts,
      args.weeklyPlan,
    ),
    recentInterventions: args.interventions.map((intervention) => ({
      type: intervention.type,
      date: toIsoDay(intervention.date) ?? args.date,
    })),
    raceDateDaysAway: raceDateDaysAway(args.profile, args.date),
    baseline: {
      restDaysPerWeek: restDaysPerWeek(args.profile, args.baselines),
    },
  };
}

async function frameReasonWithTimeout(
  recommendation: Recommendation,
  date: string,
): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      frameRecommendationReason({ recommendation, date }).catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), LLM_FRAME_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function enforceOwnUser(inputUserId: string, sessionUserId: string): void {
  if (inputUserId !== sessionUserId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cannot act on recommendations for another user",
    });
  }
}

async function loadReferencedRecommendationAudit(
  db: AppDb,
  auditId: string,
  userId: string,
  expectedDate: string,
): Promise<typeof schema.RecommendationAudit.$inferSelect> {
  const audit = await db.query.RecommendationAudit.findFirst({
    where: eq(schema.RecommendationAudit.id, auditId),
  });

  if (!audit) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Referenced recommendation audit was not found",
    });
  }
  if (audit.userId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Referenced recommendation audit belongs to another user",
    });
  }
  if (audit.kind !== "recommendation") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Referenced audit must be a recommendation",
    });
  }
  if (toIsoDay(audit.date) !== expectedDate) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Referenced audit date must match action date",
    });
  }

  return audit;
}

function plannedWorkoutInput(
  workout: typeof DailyWorkout.$inferSelect | null | undefined,
): PlannedWorkoutInput | null {
  if (!workout) return null;
  return {
    workoutType: workout.workoutType,
    sportType: workout.sportType,
    durationMin:
      workout.targetDurationMin ??
      workout.targetDurationMax ??
      (workout.workoutType.toLowerCase() === "rest" ? 0 : 30),
    intensity: inferIntensity(workout),
  };
}

function actualActivityInput(
  activity: typeof Activity.$inferSelect,
  profile: typeof Profile.$inferSelect | null | undefined,
): ActualActivityInput {
  return {
    id: activity.id,
    sportType: activity.sportType,
    durationMin: activity.durationMinutes,
    avgHrBpm: activity.avgHr,
    hrMax: profile?.maxHr ?? activity.maxHr,
  };
}

function auditKindForReconcile(): "reconciliation" {
  return "reconciliation";
}

function isPersistableWorkoutStatus(
  status: ReconcileResult["status"],
): status is PersistableReconcileStatus {
  return status !== "no-plan";
}

function auditDate(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString().slice(0, 10);
}

type ReconcileAuditPayload = {
  reconcile?: ReconcileResult;
  plannedId?: string | null;
  actualIds?: string[];
  plannedDurationMin?: number | null;
  actualDurationMin?: number;
};

type AdherencePoint = {
  date: string;
  status: ReconcileResult["status"];
  plannedDurationMin: number | null;
  actualDurationMin: number;
  confidence: number;
  actualIds: string[];
};

type RecommendationActionKind =
  | "intervention_accept"
  | "intervention_skip"
  | "intervention_defer";

type RecommendationActionPayload = {
  deferToDate?: string | null;
};

function coercePayload(value: unknown): ReconcileAuditPayload {
  return value && typeof value === "object"
    ? (value as ReconcileAuditPayload)
    : {};
}

function statusFromAudit(
  kind: string,
  payload: ReconcileAuditPayload,
): ReconcileResult["status"] {
  if (payload.reconcile?.status) return payload.reconcile.status;
  if (kind === "workout_missed") return "missed";
  if (kind === "override") return "no-plan";
  return "completed";
}

function trendPointFromAudit(
  row: typeof schema.RecommendationAudit.$inferSelect,
) {
  const payload = coercePayload(row.payload);
  const status = statusFromAudit(row.kind, payload);
  return {
    date: auditDate(row.date),
    status,
    plannedDurationMin: payload.plannedDurationMin ?? null,
    actualDurationMin: payload.actualDurationMin ?? 0,
    confidence: payload.reconcile?.confidence ?? row.confidence ?? 0,
    actualIds: payload.actualIds ?? row.relatedActivityIds ?? [],
  } satisfies AdherencePoint;
}

function isAdherenceSuccess(point: AdherencePoint): boolean {
  return (
    point.status === "completed" ||
    point.status === "partial" ||
    point.status === "extra" ||
    (point.status === "no-plan" && point.actualIds.length === 0)
  );
}

function pct(count: number, total: number): number {
  if (total === 0) return 0;
  return Number(((count / total) * 100).toFixed(2));
}

function coerceActionPayload(value: unknown): RecommendationActionPayload {
  return value && typeof value === "object"
    ? (value as RecommendationActionPayload)
    : {};
}

async function loadLatestRecommendationActionState(
  db: AppDb,
  userId: string,
  date: string,
) {
  const action = await db.query.RecommendationAudit.findFirst({
    columns: {
      id: true,
      kind: true,
      payload: true,
    },
    where: and(
      eq(schema.RecommendationAudit.userId, userId),
      eq(schema.RecommendationAudit.date, date),
      inArray(schema.RecommendationAudit.kind, [
        "intervention_accept",
        "intervention_skip",
        "intervention_defer",
      ]),
    ),
    orderBy: desc(schema.RecommendationAudit.createdAt),
  });

  if (!action) return null;
  const payload = coerceActionPayload(action.payload);
  return {
    auditId: action.id,
    kind: action.kind as RecommendationActionKind,
    deferToDate: payload.deferToDate ?? null,
  };
}

function adherenceSummary(points: AdherencePoint[]) {
  let longestStreak = 0;
  let runningStreak = 0;
  for (const point of points) {
    if (isAdherenceSuccess(point)) {
      runningStreak += 1;
      longestStreak = Math.max(longestStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  }

  let currentStreak = 0;
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index]!;
    if (!isAdherenceSuccess(point)) break;
    currentStreak += 1;
  }

  return {
    completedPct: pct(points.filter(isAdherenceSuccess).length, points.length),
    missedPct: pct(
      points.filter((point) => point.status === "missed").length,
      points.length,
    ),
    extraCount: points.filter(
      (point) =>
        point.status === "extra" ||
        (point.status === "no-plan" && point.actualIds.length > 0),
    ).length,
    currentStreak,
    longestStreak,
  };
}

export const coachRouter = {
  getDailyRecommendation: protectedProcedure
    .input(z.object({ userId: z.string(), date: IsoDateSchema.optional() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      if (input.userId !== userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot request recommendations for another user",
        });
      }

      const profile = await ctx.db.query.Profile.findFirst({
        where: eq(Profile.userId, userId),
      });
      const date = input.date ?? todayInTimezone(profile?.timezone);
      const weekStart = weekStartFor(date);

      const [
        readiness,
        activities,
        todayWorkout,
        weekWorkouts,
        weeklyPlan,
        interventions,
        baselines,
        dailyMetric,
        advancedMetric,
      ] = await Promise.all([
        ctx.db.query.ReadinessScore.findFirst({
          where: and(
            eq(ReadinessScore.userId, userId),
            eq(ReadinessScore.date, date),
          ),
          orderBy: desc(ReadinessScore.computedAt),
        }),
        ctx.db.query.Activity.findMany({
          where: and(
            eq(Activity.userId, userId),
            gte(
              Activity.startedAt,
              new Date(`${shiftIsoDay(date, -6)}T00:00:00Z`),
            ),
            lte(Activity.startedAt, new Date(`${date}T23:59:59.999Z`)),
          ),
          orderBy: desc(Activity.startedAt),
          limit: 50,
        }),
        ctx.db.query.DailyWorkout.findFirst({
          where: and(
            eq(DailyWorkout.userId, userId),
            eq(DailyWorkout.date, date),
          ),
        }),
        ctx.db.query.DailyWorkout.findMany({
          where: and(
            eq(DailyWorkout.userId, userId),
            gte(DailyWorkout.date, weekStart),
            lte(DailyWorkout.date, shiftIsoDay(weekStart, 6)),
          ),
          orderBy: DailyWorkout.date,
        }),
        ctx.db.query.WeeklyPlan.findFirst({
          where: and(
            eq(WeeklyPlan.userId, userId),
            lte(WeeklyPlan.weekStart, date),
          ),
          orderBy: desc(WeeklyPlan.weekStart),
        }),
        ctx.db.query.Intervention.findMany({
          where: and(
            eq(Intervention.userId, userId),
            gte(Intervention.date, shiftIsoDay(date, -14)),
            lte(Intervention.date, date),
          ),
          orderBy: desc(Intervention.date),
          limit: 20,
        }),
        ctx.db.query.AthleteBaseline.findMany({
          where: eq(AthleteBaseline.userId, userId),
        }),
        ctx.db.query.DailyMetric.findFirst({
          where: and(
            eq(DailyMetric.userId, userId),
            eq(DailyMetric.date, date),
          ),
        }),
        ctx.db.query.AdvancedMetric.findFirst({
          where: and(
            eq(AdvancedMetric.userId, userId),
            lte(AdvancedMetric.date, date),
          ),
          orderBy: desc(AdvancedMetric.date),
        }),
      ]);

      const engineInput = toEngineInput({
        date,
        profile: profile ?? null,
        readiness: readiness ?? null,
        dailyMetric: dailyMetric ?? null,
        advancedMetric: advancedMetric ?? null,
        activities,
        todayWorkout: todayWorkout ?? null,
        weekWorkouts,
        weeklyPlan: weeklyPlan ?? null,
        interventions,
        baselines,
      });
      const recommendation = recommendDay(engineInput);

      const audit = await recordRecommendationAudit({
        userId: userId,
        date,
        kind: "recommendation",
        action: recommendation.action,
        intensity: recommendation.intensity,
        workoutType: recommendation.workoutType,
        durationMin: recommendation.durationMin,
        confidence: recommendation.confidence,
        hardBlocks: recommendation.hardBlocks,
        ruleTrace: recommendation.rules,
        relatedWorkoutId: todayWorkout?.id,
        payload: { recommendation, engineInput },
      });
      const [framedReason, actionState] = await Promise.all([
        frameReasonWithTimeout(recommendation, date),
        loadLatestRecommendationActionState(ctx.db, userId, date),
      ]);
      return {
        recommendation: framedReason
          ? { ...recommendation, reason: framedReason }
          : recommendation,
        auditId: audit.id,
        date,
        actionState,
      };
    }),

  accept: protectedProcedure
    .input(RecommendationActionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      enforceOwnUser(input.userId, userId);
      await loadReferencedRecommendationAudit(
        ctx.db,
        input.auditId,
        userId,
        input.date,
      );

      const audit = await recordRecommendationAudit({
        userId,
        date: input.date,
        kind: "intervention_accept",
        payload: {
          referencedAuditId: input.auditId,
          note: input.note,
        },
      });

      return { auditId: audit.id };
    }),

  skip: protectedProcedure
    .input(RecommendationActionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      enforceOwnUser(input.userId, userId);
      await loadReferencedRecommendationAudit(
        ctx.db,
        input.auditId,
        userId,
        input.date,
      );

      const audit = await recordRecommendationAudit({
        userId,
        date: input.date,
        kind: "intervention_skip",
        payload: {
          referencedAuditId: input.auditId,
          note: input.note ?? "user skipped recommendation",
        },
      });

      return { auditId: audit.id };
    }),

  defer: protectedProcedure
    .input(RecommendationDeferInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      enforceOwnUser(input.userId, userId);
      if (input.deferToDate <= input.date) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "deferToDate must be after date",
        });
      }
      await loadReferencedRecommendationAudit(
        ctx.db,
        input.auditId,
        userId,
        input.date,
      );

      const audit = await recordRecommendationAudit({
        userId,
        date: input.date,
        kind: "intervention_defer",
        payload: {
          referencedAuditId: input.auditId,
          deferToDate: input.deferToDate,
          note: input.note,
        },
      });

      return { auditId: audit.id };
    }),

  reconcile: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
        date: IsoDateSchema,
        matchWindow: z
          .object({
            minAbsoluteDurationMin: z.number().optional(),
            durationMinTolerancePct: z.number().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      if (input.userId !== userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot reconcile workouts for another user",
        });
      }

      const [profile, planned] = await Promise.all([
        ctx.db.query.Profile.findFirst({ where: eq(Profile.userId, userId) }),
        ctx.db.query.DailyWorkout.findFirst({
          where: and(
            eq(DailyWorkout.userId, userId),
            eq(DailyWorkout.date, input.date),
          ),
        }),
      ]);
      const timezone = profile?.timezone ?? "UTC";
      const actualRows = await ctx.db.query.Activity.findMany({
        where: and(
          eq(Activity.userId, userId),
          gte(
            Activity.startedAt,
            new Date(`${shiftIsoDay(input.date, -1)}T00:00:00Z`),
          ),
          lte(
            Activity.startedAt,
            new Date(`${shiftIsoDay(input.date, 1)}T23:59:59.999Z`),
          ),
        ),
        orderBy: asc(Activity.startedAt),
      });
      const actuals = actualRows
        .filter(
          (activity) =>
            dayInTimezone(activity.startedAt, timezone) === input.date,
        )
        .map((activity) => actualActivityInput(activity, profile ?? null));
      const plannedInput = plannedWorkoutInput(planned ?? null);
      const reconcile = reconcilePlanVsActual({
        date: input.date,
        planned: plannedInput,
        actuals,
        matchWindow: input.matchWindow,
      });
      const actualIds = actuals.map((activity) => activity.id);
      const actualDurationMin = actuals.reduce(
        (total, activity) => total + activity.durationMin,
        0,
      );

      // The audit trail is written before mutating DailyWorkout.status. The
      // helper uses the central DB writer, so this ordering preserves rollback
      // semantics for audit failures in environments without a shared tx.
      const audit = await recordRecommendationAudit({
        userId,
        date: input.date,
        kind: auditKindForReconcile(),
        confidence: reconcile.confidence,
        durationMin: plannedInput?.durationMin ?? null,
        relatedWorkoutId: planned?.id,
        relatedActivityIds: actualIds,
        payload: {
          reconcile,
          plannedId: planned?.id ?? null,
          actualIds,
          plannedDurationMin: plannedInput?.durationMin ?? null,
          actualDurationMin,
        },
      });

      if (planned && isPersistableWorkoutStatus(reconcile.status)) {
        await ctx.db
          .update(DailyWorkout)
          .set({ status: reconcile.status })
          .where(
            and(
              eq(DailyWorkout.userId, userId),
              eq(DailyWorkout.id, planned.id),
            ),
          );
      }

      return { reconcile, auditId: audit.id };
    }),

  adherenceTrend: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
        days: z.number().int().min(1).max(90).default(28),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      if (input.userId !== userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot request adherence for another user",
        });
      }

      const profile = await ctx.db.query.Profile.findFirst({
        where: eq(Profile.userId, userId),
      });
      const endDate = todayInTimezone(profile?.timezone);
      const startDate = shiftIsoDay(endDate, -(input.days - 1));
      const rows = await ctx.db.query.RecommendationAudit.findMany({
        where: and(
          eq(schema.RecommendationAudit.userId, userId),
          inArray(schema.RecommendationAudit.kind, [
            "reconciliation",
            "workout_complete",
            "workout_missed",
            "override",
          ]),
          gte(schema.RecommendationAudit.date, startDate),
          lte(schema.RecommendationAudit.date, endDate),
        ),
        orderBy: asc(schema.RecommendationAudit.date),
      });
      const points = rows
        .map(trendPointFromAudit)
        .filter((point) => point.date >= startDate && point.date <= endDate)
        .sort((a, b) => a.date.localeCompare(b.date));

      return { points, summary: adherenceSummary(points) };
    }),
} satisfies TRPCRouterRecord;
