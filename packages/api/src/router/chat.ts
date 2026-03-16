import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, gte } from "@acme/db";
import {
  ChatMessage,
  DailyMetric,
  ReadinessScore,
  Activity,
  Profile,
} from "@acme/db/schema";
import {
  computeBaselines,
  computeTrainingLoads,
  computeStrainScore,
  computeACWR,
  detectAnomalies,
} from "@acme/engine";
import type { DailyMetricInput, Baselines, AnomalyAlert } from "@acme/engine";

import { protectedProcedure } from "../trpc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toMetricInput(row: typeof DailyMetric.$inferSelect): DailyMetricInput {
  return {
    date: typeof row.date === "string" ? row.date : row.date,
    sleepScore: row.sleepScore,
    totalSleepMinutes: row.totalSleepMinutes,
    deepSleepMinutes: row.deepSleepMinutes,
    remSleepMinutes: row.remSleepMinutes,
    lightSleepMinutes: row.lightSleepMinutes,
    awakeMinutes: row.awakeMinutes,
    hrv: row.hrv,
    restingHr: row.restingHr,
    maxHr: row.maxHr,
    stressScore: row.stressScore,
    bodyBatteryStart: row.bodyBatteryStart,
    bodyBatteryEnd: row.bodyBatteryEnd,
    steps: row.steps,
    calories: row.calories,
    garminTrainingReadiness: row.garminTrainingReadiness,
    garminTrainingLoad: row.garminTrainingLoad,
    respirationRate: row.respirationRate ?? null,
    spo2: row.spo2 ?? null,
    skinTemp: row.skinTemp ?? null,
    intensityMinutes: row.intensityMinutes ?? null,
    floorsClimbed: row.floorsClimbed ?? null,
    bodyBatteryHigh: row.bodyBatteryHigh ?? null,
    bodyBatteryLow: row.bodyBatteryLow ?? null,
    hrvOvernight: (row.hrvOvernight as number[] | null) ?? null,
    sleepStartTime: row.sleepStartTime ?? null,
    sleepEndTime: row.sleepEndTime ?? null,
    sleepNeedMinutes: row.sleepNeedMinutes ?? null,
    sleepDebtMinutes: row.sleepDebtMinutes ?? null,
  };
}

function getDateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0]!;
}

function fmtMinutes(mins: number | null | undefined): string {
  if (mins == null) return "N/A";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtNumber(n: number | null | undefined, unit = ""): string {
  if (n == null) return "N/A";
  return `${Math.round(n)}${unit}`;
}

// ---------------------------------------------------------------------------
// Context gathering
// ---------------------------------------------------------------------------

interface CoachContext {
  todayMetric: DailyMetricInput | null;
  metrics: DailyMetricInput[];
  readiness: typeof ReadinessScore.$inferSelect | undefined;
  activities: (typeof Activity.$inferSelect)[];
  profile: typeof Profile.$inferSelect | undefined;
  baselines: Baselines;
  anomalies: AnomalyAlert[];
  acwr: number;
  trainingLoads: { ctl: number; atl: number; tsb: number; rampRate: number };
}

// ---------------------------------------------------------------------------
// Intent detection
// ---------------------------------------------------------------------------

type Intent =
  | "readiness"
  | "sleep"
  | "training"
  | "recovery"
  | "hrv"
  | "race"
  | "why"
  | "general";

function detectIntent(content: string): Intent {
  const lower = content.toLowerCase();
  if (/readiness|ready|how am i/.test(lower)) return "readiness";
  if (/sleep/.test(lower)) return "sleep";
  if (/training|workout|load/.test(lower)) return "training";
  if (/recovery|tired|fatigue|recover/.test(lower)) return "recovery";
  if (/hrv/.test(lower)) return "hrv";
  if (/race|predict|goal/.test(lower)) return "race";
  if (/why/.test(lower)) return "why";
  return "general";
}

// ---------------------------------------------------------------------------
// Response generation
// ---------------------------------------------------------------------------

function generateCoachResponse(intent: Intent, ctx: CoachContext): string {
  const { todayMetric, metrics, readiness, activities, baselines, anomalies, acwr, trainingLoads } = ctx;

  // Common data points
  const score = readiness?.score;
  const zone = readiness?.zone;
  const hrv = todayMetric?.hrv;
  const restingHr = todayMetric?.restingHr;
  const sleepMins = todayMetric?.totalSleepMinutes;
  const stress = todayMetric?.stressScore;
  const batteryEnd = todayMetric?.bodyBatteryEnd;

  const avgHrv = baselines.hrv;
  const avgRhr = baselines.restingHr;
  const avgSleep = baselines.sleep;

  const recentActivityCount = activities.length;
  const lastActivity = activities[0];

  switch (intent) {
    case "readiness": {
      const parts: string[] = [];
      if (score != null && zone) {
        parts.push(`Your readiness today is **${score}** (${zone}).`);
      } else {
        parts.push("I don't have a readiness score computed for today yet.");
      }
      if (hrv != null && avgHrv != null) {
        const diff = hrv - avgHrv;
        const direction = diff >= 0 ? "above" : "below";
        parts.push(
          `Your HRV is ${fmtNumber(hrv)} ms — ${Math.abs(Math.round(diff))} ms ${direction} your 14-day average of ${fmtNumber(avgHrv)} ms.`,
        );
      }
      if (sleepMins != null) {
        parts.push(`You slept ${fmtMinutes(sleepMins)} last night.`);
      }
      if (acwr > 0) {
        const acwrLabel =
          acwr < 0.8 ? "under-training" : acwr <= 1.3 ? "optimal" : "high risk";
        parts.push(
          `Your ACWR is ${acwr.toFixed(2)} (${acwrLabel}).`,
        );
      }
      if (score != null) {
        if (score >= 75) {
          parts.push("You're in great shape — go for a quality session today! 💪");
        } else if (score >= 50) {
          parts.push("I'd recommend a moderate intensity session today.");
        } else {
          parts.push(
            "Your body could use recovery. Consider a light session or rest day.",
          );
        }
      }
      return parts.join(" ");
    }

    case "sleep": {
      const parts: string[] = [];
      if (sleepMins != null) {
        parts.push(`Last night you slept **${fmtMinutes(sleepMins)}**.`);
      }
      if (todayMetric?.deepSleepMinutes != null) {
        parts.push(
          `Deep sleep: ${fmtMinutes(todayMetric.deepSleepMinutes)}, REM: ${fmtMinutes(todayMetric.remSleepMinutes)}.`,
        );
      }
      if (avgSleep != null) {
        parts.push(
          `Your 14-day average is ${fmtMinutes(Math.round(avgSleep))}.`,
        );
        if (sleepMins != null) {
          const diff = sleepMins - avgSleep;
          if (diff < -30) {
            parts.push("You're sleeping less than usual — try to prioritize rest tonight.");
          } else if (diff > 30) {
            parts.push("Nice! You got more sleep than usual.");
          }
        }
      }
      if (todayMetric?.sleepScore != null) {
        parts.push(`Garmin sleep score: **${todayMetric.sleepScore}**.`);
      }
      if (todayMetric?.sleepDebtMinutes != null && todayMetric.sleepDebtMinutes > 30) {
        parts.push(
          `⚠️ You have ${fmtMinutes(todayMetric.sleepDebtMinutes)} of sleep debt to work off.`,
        );
      }
      if (parts.length === 0) {
        parts.push("I don't have sleep data available yet. Make sure your Garmin synced last night's sleep.");
      }
      return parts.join(" ");
    }

    case "training": {
      const parts: string[] = [];
      parts.push(
        `Training loads: CTL (fitness) = ${fmtNumber(trainingLoads.ctl)}, ATL (fatigue) = ${fmtNumber(trainingLoads.atl)}, TSB (form) = ${fmtNumber(trainingLoads.tsb)}.`,
      );
      if (acwr > 0) {
        const acwrLabel =
          acwr < 0.8
            ? "low — you could push harder"
            : acwr <= 1.3
              ? "in the sweet spot (0.8–1.3)"
              : "elevated — be cautious about injury risk";
        parts.push(`ACWR: ${acwr.toFixed(2)} — ${acwrLabel}.`);
      }
      if (recentActivityCount > 0) {
        parts.push(
          `You've done **${recentActivityCount}** activities in the last 7 days.`,
        );
        if (lastActivity) {
          const dur = Math.round(lastActivity.durationMinutes);
          parts.push(
            `Last activity: ${lastActivity.sportType} (${dur} min, ${lastActivity.avgHr ? `avg HR ${lastActivity.avgHr}` : "no HR"}).`,
          );
        }
      } else {
        parts.push("No activities recorded in the last 7 days.");
      }
      if (score != null) {
        if (score >= 75) {
          parts.push("Your readiness supports a hard session today.");
        } else if (score >= 50) {
          parts.push("Aim for moderate intensity today.");
        } else {
          parts.push("Consider an easy session or active recovery.");
        }
      }
      return parts.join(" ");
    }

    case "recovery": {
      const parts: string[] = [];
      if (batteryEnd != null) {
        parts.push(`Body Battery is at **${batteryEnd}%**.`);
        if (batteryEnd >= 70) {
          parts.push("That's a good level — you're well recovered.");
        } else if (batteryEnd >= 40) {
          parts.push("Moderate recovery — listen to your body.");
        } else {
          parts.push("Low recovery — prioritize rest today.");
        }
      }
      if (restingHr != null && avgRhr != null) {
        const diff = restingHr - avgRhr;
        if (diff > 3) {
          parts.push(
            `⚠️ Resting HR (${restingHr} bpm) is ${Math.round(diff)} bpm above your baseline (${fmtNumber(avgRhr)} bpm) — a sign of incomplete recovery.`,
          );
        } else {
          parts.push(
            `Resting HR (${restingHr} bpm) is near your baseline (${fmtNumber(avgRhr)} bpm) — good sign.`,
          );
        }
      }
      if (stress != null) {
        parts.push(
          `Stress score: ${stress}${stress > 50 ? " — elevated. Try to reduce stressors." : " — looking manageable."}.`,
        );
      }
      if (trainingLoads.tsb < -20) {
        parts.push("Your training stress balance is quite negative — you may be overreaching.");
      } else if (trainingLoads.tsb > 10) {
        parts.push("You have a positive form balance — you're fresh and ready.");
      }
      if (parts.length === 0) {
        parts.push("I don't have enough recovery data yet. Sync your Garmin to get insights.");
      }
      return parts.join(" ");
    }

    case "hrv": {
      const parts: string[] = [];
      if (hrv != null) {
        parts.push(`Your HRV today is **${fmtNumber(hrv)} ms**.`);
      }
      if (avgHrv != null) {
        parts.push(`14-day average: ${fmtNumber(avgHrv)} ms.`);
      }
      if (hrv != null && avgHrv != null) {
        const pctDiff = ((hrv - avgHrv) / avgHrv) * 100;
        if (pctDiff > 10) {
          parts.push(
            `That's ${Math.round(pctDiff)}% above average — your parasympathetic nervous system is in great shape. Good day for intensity.`,
          );
        } else if (pctDiff < -10) {
          parts.push(
            `That's ${Math.round(Math.abs(pctDiff))}% below average — your body may be under stress. Consider going easier today.`,
          );
        } else {
          parts.push("HRV is within normal range.");
        }
      }
      if (todayMetric?.hrvOvernight) {
        const overnightArr = todayMetric.hrvOvernight as number[];
        if (overnightArr.length > 0) {
          const max = Math.max(...overnightArr);
          const min = Math.min(...overnightArr);
          parts.push(
            `Overnight HRV ranged from ${min} to ${max} ms.`,
          );
        }
      }
      if (parts.length === 0) {
        parts.push("No HRV data available yet. Make sure you wore your Garmin to sleep.");
      }
      return parts.join(" ");
    }

    case "race": {
      const parts: string[] = [];
      const { profile } = ctx;
      if (profile?.goals) {
        parts.push(`Based on your goal: **${profile.goals}**.`);
      }
      if (trainingLoads.ctl > 0) {
        parts.push(
          `Your fitness (CTL) is ${fmtNumber(trainingLoads.ctl)}. `,
        );
        if (trainingLoads.tsb > 0 && trainingLoads.tsb < 25) {
          parts.push("Your form is positive — this is a good window for racing or a peak effort.");
        } else if (trainingLoads.tsb <= 0) {
          parts.push(
            "You're carrying fatigue (TSB: ${fmtNumber(trainingLoads.tsb)}). Consider a taper before your target event.",
          );
        }
      }
      if (profile?.vo2maxRunning != null) {
        parts.push(`Your VO2max estimate is ${profile.vo2maxRunning} ml/kg/min.`);
      }
      if (activities.length > 0) {
        const runActivities = activities.filter(
          (a) => a.sportType?.toLowerCase().includes("run"),
        );
        if (runActivities.length > 0 && runActivities[0]?.avgPaceSecPerKm) {
          const pace = runActivities[0].avgPaceSecPerKm;
          const paceMin = Math.floor(pace / 60);
          const paceSec = pace % 60;
          parts.push(
            `Your most recent running pace: ${paceMin}:${String(paceSec).padStart(2, "0")} /km.`,
          );
        }
      }
      if (parts.length === 0) {
        parts.push(
          "I need more training data to give race predictions. Keep logging activities and I'll build a picture.",
        );
      }
      return parts.join(" ");
    }

    case "why": {
      const parts: string[] = [];
      if (anomalies.length > 0) {
        parts.push("Here's what I've noticed in your recent data:");
        for (const a of anomalies.slice(0, 3)) {
          parts.push(`• **${a.type}**: ${a.message}`);
        }
      } else {
        parts.push("No anomalies detected — your metrics are trending normally.");
      }
      if (score != null && zone) {
        parts.push(`Today's readiness: ${score} (${zone}).`);
      }
      // Look for trends in the metrics
      if (metrics.length >= 3) {
        const recentHrvs = metrics
          .slice(0, 3)
          .map((m) => m.hrv)
          .filter((v): v is number => v != null);
        if (recentHrvs.length === 3) {
          const trend =
            recentHrvs[0]! > recentHrvs[1]! && recentHrvs[1]! > recentHrvs[2]!
              ? "trending up 📈"
              : recentHrvs[0]! < recentHrvs[1]! && recentHrvs[1]! < recentHrvs[2]!
                ? "trending down 📉"
                : "stable";
          parts.push(`HRV over last 3 days: ${trend}.`);
        }
      }
      return parts.join(" ");
    }

    default: {
      // General daily briefing
      const parts: string[] = [];
      parts.push("Here's your daily briefing:");
      if (score != null && zone) {
        parts.push(`**Readiness**: ${score} (${zone}).`);
      }
      if (sleepMins != null) {
        parts.push(`**Sleep**: ${fmtMinutes(sleepMins)}.`);
      }
      if (hrv != null) {
        parts.push(`**HRV**: ${fmtNumber(hrv)} ms.`);
      }
      if (restingHr != null) {
        parts.push(`**Resting HR**: ${restingHr} bpm.`);
      }
      if (batteryEnd != null) {
        parts.push(`**Body Battery**: ${batteryEnd}%.`);
      }
      if (acwr > 0) {
        parts.push(`**ACWR**: ${acwr.toFixed(2)}.`);
      }
      if (anomalies.length > 0) {
        parts.push(`⚠️ ${anomalies.length} anomal${anomalies.length === 1 ? "y" : "ies"} detected.`);
      }
      if (recentActivityCount > 0 && lastActivity) {
        parts.push(
          `Last activity: ${lastActivity.sportType} (${Math.round(lastActivity.durationMinutes)} min).`,
        );
      }
      if (parts.length <= 1) {
        parts.push("No data available yet. Sync your Garmin to get started!");
      } else {
        // Add a recommendation
        if (score != null) {
          if (score >= 75) {
            parts.push("✅ Great day for a quality workout!");
          } else if (score >= 50) {
            parts.push("👍 Moderate effort recommended today.");
          } else {
            parts.push("🛌 Take it easy — recovery is key today.");
          }
        }
      }
      return parts.join(" ");
    }
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const chatRouter = {
  getHistory: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      const messages = await ctx.db.query.ChatMessage.findMany({
        where: eq(ChatMessage.userId, ctx.session.user.id),
        orderBy: desc(ChatMessage.createdAt),
        limit: input.limit,
      });
      return messages.reverse();
    }),

  sendMessage: protectedProcedure
    .input(z.object({ content: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // 1. Save user message
      await ctx.db.insert(ChatMessage).values({
        userId,
        role: "user",
        content: input.content,
      });

      // 2. Gather context
      const [recentMetrics, latestReadiness, recentActivities, profile] =
        await Promise.all([
          ctx.db.query.DailyMetric.findMany({
            where: and(
              eq(DailyMetric.userId, userId),
              gte(DailyMetric.date, getDateString(14)),
            ),
            orderBy: desc(DailyMetric.date),
            limit: 14,
          }),
          ctx.db.query.ReadinessScore.findFirst({
            where: eq(ReadinessScore.userId, userId),
            orderBy: desc(ReadinessScore.date),
          }),
          ctx.db.query.Activity.findMany({
            where: and(
              eq(Activity.userId, userId),
              gte(Activity.startedAt, new Date(Date.now() - 7 * 86400000)),
            ),
            orderBy: desc(Activity.startedAt),
            limit: 5,
          }),
          ctx.db.query.Profile.findFirst({
            where: eq(Profile.userId, userId),
          }),
        ]);

      const metricInputs = recentMetrics.map(toMetricInput);
      const baselines = computeBaselines(metricInputs, profile?.sex ?? null);

      const strainScores = recentActivities.map(
        (a) => a.strainScore ?? computeStrainScore(a.trimpScore ?? 0),
      );
      const anomalies = detectAnomalies(metricInputs, baselines, strainScores);
      const trainingLoads = computeTrainingLoads(
        [...strainScores].reverse(),
      );
      const acwr = computeACWR(strainScores);

      const coachContext: CoachContext = {
        todayMetric: metricInputs[0] ?? null,
        metrics: metricInputs,
        readiness: latestReadiness ?? undefined,
        activities: recentActivities,
        profile: profile ?? undefined,
        baselines,
        anomalies,
        acwr,
        trainingLoads,
      };

      // 3. Detect intent and generate response
      const intent = detectIntent(input.content);
      const responseContent = generateCoachResponse(intent, coachContext);

      // 4. Save assistant message
      const contextSummary = {
        intent,
        metricsCount: metricInputs.length,
        readinessScore: latestReadiness?.score ?? null,
        activitiesCount: recentActivities.length,
        anomaliesCount: anomalies.length,
        acwr,
      };

      const [assistantMsg] = await ctx.db
        .insert(ChatMessage)
        .values({
          userId,
          role: "assistant",
          content: responseContent,
          context: contextSummary,
        })
        .returning();

      return assistantMsg!;
    }),

  clearHistory: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .delete(ChatMessage)
      .where(eq(ChatMessage.userId, ctx.session.user.id));
    return { success: true };
  }),
} satisfies TRPCRouterRecord;
