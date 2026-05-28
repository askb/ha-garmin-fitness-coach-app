import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, gte, lte } from "@acme/db";
import { Activity, Profile } from "@acme/db/schema";
import { analyzeRunningForm } from "@acme/engine";

import { humanizeActivityName } from "../lib/humanize";
import { protectedProcedure } from "../trpc";

function getDateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0]!;
}

// Maximum allowed offset between an Activity.startedAt and "now"
// before we treat the row as garbage and hide it. The 26-hour window:
//   - tolerates the worst real-world timezone offset (UTC+14)
//   - tolerates ±2h of normal clock skew on top of that
//   - is small enough to still hide seed-data / corrupted rows that
//     land days or weeks in the future
// See packages/api/src/router/activity.ts for the regression history
// (TZ-correctness bug in the addon's Garmin sync).
const FUTURE_ROW_HORIZON_MS = 26 * 60 * 60 * 1000;

function futureRowCutoff(): Date {
  return new Date(Date.now() + FUTURE_ROW_HORIZON_MS);
}

/**
 * Humanize raw DB sport/subtype slugs at the API boundary for UI consumers.
 * Returns a shallow copy of the provided row with transformed name fields.
 */
export function humanizeActivityRow<
  T extends { sportType?: string | null; subType?: string | null },
>(activity: T): T {
  return {
    ...activity,
    sportType: activity.sportType
      ? humanizeActivityName(activity.sportType)
      : activity.sportType,
    subType: activity.subType
      ? humanizeActivityName(activity.subType)
      : activity.subType,
  };
}

export const activityRouter = {
  list: protectedProcedure
    .input(
      z.object({
        days: z.number().min(1).max(365).default(30),
        sportType: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const conditions = [
        eq(Activity.userId, userId),
        gte(Activity.startedAt, since),
        // Hide implausibly-future rows. We previously used `new Date()`
        // which collided with a TZ-correctness bug in the addon's sync
        // (startTimeLocal stored as UTC for AEST users → morning
        // workouts timestamped ~10h in the future and silently
        // disappeared from the home page until the wall clock caught
        // up). Widen the horizon by ~26h so a sync regression like
        // that fails loudly (we see a future date) instead of hiding
        // data. The addon fix lands in v0.16.22; this guardrail stays
        // so a future timezone regression can't reintroduce silent
        // data-loss.
        lte(Activity.startedAt, futureRowCutoff()),
      ];

      if (input.sportType) {
        conditions.push(eq(Activity.sportType, input.sportType));
      }

      const activities = await ctx.db.query.Activity.findMany({
        where: and(...conditions),
        orderBy: desc(Activity.startedAt),
        limit: 50,
        columns: {
          id: true,
          sportType: true,
          subType: true,
          startedAt: true,
          durationMinutes: true,
          distanceMeters: true,
          avgHr: true,
          strainScore: true,
          vo2maxEstimate: true,
          avgPaceSecPerKm: true,
          calories: true,
          aerobicTE: true,
          anaerobicTE: true,
          avgPower: true,
          normalizedPower: true,
        },
      });

      // Hide tiny incidental activities (< 10 min AND < 500 m). Garmin's
      // auto-detected "phantom walks" otherwise dominate the list and
      // bury real workouts (#158). Same filter as `getRecent` above.
      return activities
        .filter(
          (a) =>
            (a.durationMinutes ?? 0) >= 10 || (a.distanceMeters ?? 0) >= 500,
        )
        .map(humanizeActivityRow);
    }),

  getDetail: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const activity = await ctx.db.query.Activity.findFirst({
        where: and(eq(Activity.id, input.id), eq(Activity.userId, userId)),
      });

      if (!activity) {
        return null;
      }

      const profile = await ctx.db.query.Profile.findFirst({
        where: eq(Profile.userId, userId),
      });

      let runningFormScore = null;
      if (activity.sportType?.toLowerCase().includes("run")) {
        runningFormScore = analyzeRunningForm(
          activity.avgGroundContactTime,
          activity.verticalOscillation,
          activity.strideLength,
          activity.gctBalance,
          activity.avgCadence,
          profile?.heightCm ?? null,
        );
      }

      return humanizeActivityRow({
        ...activity,
        runningFormScore,
      });
    }),

  getRecent: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Hide implausibly-future activities. The 26-hour window
    // protects against the TZ-correctness regression that used to
    // hide AEST morning workouts (see `list` above for details)
    // while still excluding actual clock-skew / seed-data anomalies.
    //
    // We over-fetch (15) then filter client-side for the home page
    // top-3 so auto-detected micro-activities (Garmin's "incidental"
    // 1-minute walks etc.) don't push the user's real workout out
    // of the carousel. See issue #143.
    const activities = await ctx.db.query.Activity.findMany({
      where: and(
        eq(Activity.userId, userId),
        lte(Activity.startedAt, futureRowCutoff()),
      ),
      orderBy: desc(Activity.startedAt),
      limit: 15,
      columns: {
        id: true,
        sportType: true,
        subType: true,
        startedAt: true,
        durationMinutes: true,
        distanceMeters: true,
        avgHr: true,
        strainScore: true,
        calories: true,
      },
    });

    // Hide tiny incidental activities (< 10 min AND < 500 m) so a real
    // workout always surfaces on the home carousel. If everything we
    // have is "incidental", fall back to the raw list rather than
    // showing nothing.
    const meaningful = activities.filter(
      (a) => (a.durationMinutes ?? 0) >= 10 || (a.distanceMeters ?? 0) >= 500,
    );
    return (meaningful.length > 0 ? meaningful : activities)
      .slice(0, 5)
      .map(humanizeActivityRow);
  }),
} satisfies TRPCRouterRecord;
