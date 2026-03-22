import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, gte } from "@acme/db";
import {
  Activity,
  AdvancedMetric,
  AiInsight,
  AthleteBaseline,
  DailyMetric,
  Intervention,
} from "@acme/db/schema";

import { protectedProcedure } from "../trpc";
import {
  checkAcwrRisk,
  checkTsbOverreaching,
  checkHrvDeviation,
  checkInterventionPattern,
} from "../lib/insight-rules";

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0]!;
}

export const proactiveRouter = {
  generateInsights: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const today = new Date().toISOString().split("T")[0]!;
    const insights: (typeof AiInsight.$inferInsert)[] = [];

    // Parallel data fetch
    const [metrics14, latestAdvanced, baselines, recentInterventions] =
      await Promise.all([
        ctx.db.query.DailyMetric.findMany({
          where: and(
            eq(DailyMetric.userId, userId),
            gte(DailyMetric.date, dateNDaysAgo(14)),
          ),
          orderBy: desc(DailyMetric.date),
          limit: 14,
        }),
        ctx.db.query.AdvancedMetric.findFirst({
          where: eq(AdvancedMetric.userId, userId),
          orderBy: desc(AdvancedMetric.date),
        }),
        ctx.db.query.AthleteBaseline.findMany({
          where: eq(AthleteBaseline.userId, userId),
        }),
        ctx.db.query.Intervention.findMany({
          where: and(
            eq(Intervention.userId, userId),
            gte(Intervention.date, dateNDaysAgo(30)),
          ),
          orderBy: desc(Intervention.date),
          limit: 10,
        }),
      ]);

    const today_metric = metrics14[0];

    // ── Rule 1: ACWR Injury Risk ──
    if (latestAdvanced?.acwr != null) {
      const acwr = latestAdvanced.acwr;
      const acwrResult = checkAcwrRisk(acwr);
      if (acwrResult.triggered && acwrResult.severity === "HIGH") {
        insights.push({
          userId,
          date: today,
          insightType: "injury_risk",
          severity: "critical",
          title: `⚠️ High Injury Risk — ACWR ${acwr.toFixed(2)}`,
          body: `Your Acute:Chronic Workload Ratio is ${acwr.toFixed(2)}, which exceeds the 1.5 threshold associated with significantly elevated injury risk (Hulin et al. 2016). Your recent training load has spiked well above your chronic fitness base. Consider 2-3 days of reduced volume before resuming hard efforts.`,
          metrics: {
            acwr,
            ctl: latestAdvanced.ctl ?? 0,
            atl: latestAdvanced.atl ?? 0,
          },
          confidence: acwrResult.confidence,
          actionSuggestion:
            "Reduce training load by 30-40% for 2-3 days. Prioritize sleep and nutrition for recovery.",
          generatedBy: "rules",
        });
      } else if (acwrResult.triggered && acwrResult.severity === "MEDIUM") {
        insights.push({
          userId,
          date: today,
          insightType: "injury_risk",
          severity: "warn",
          title: `🟡 Elevated ACWR — ${acwr.toFixed(2)} (Caution Zone)`,
          body: `ACWR of ${acwr.toFixed(2)} is in the caution zone (1.3-1.5). Acute load is outpacing chronic fitness. Monitor closely and avoid back-to-back hard sessions.`,
          metrics: { acwr },
          confidence: acwrResult.confidence,
          actionSuggestion:
            "Keep next 2 sessions at moderate intensity. Monitor HRV daily.",
          generatedBy: "rules",
        });
      } else if (acwr < 0.8 && (latestAdvanced.ctl ?? 0) > 20) {
        insights.push({
          userId,
          date: today,
          insightType: "positive_trend",
          severity: "info",
          title: `📈 Training Load Below Chronic Base — Good Time to Build`,
          body: `ACWR of ${acwr.toFixed(2)} indicates you are under-training relative to your fitness base (CTL ${latestAdvanced.ctl?.toFixed(1)}). This is a good window to safely increase training volume.`,
          metrics: { acwr, ctl: latestAdvanced.ctl ?? 0 },
          confidence: 0.7,
          actionSuggestion:
            "Consider adding one additional moderate session this week.",
          generatedBy: "rules",
        });
      }
    }

    // ── Rule 2: Form/TSB Overreaching ──
    if (latestAdvanced?.tsb != null) {
      const tsbResult = checkTsbOverreaching(latestAdvanced.tsb);
      if (tsbResult.triggered) {
        insights.push({
          userId,
          date: today,
          insightType: "overreaching",
          severity: "warn",
          title: `😴 Overreaching Detected — Form ${latestAdvanced.tsb.toFixed(1)}`,
          body: `Training Stress Balance (Form) of ${latestAdvanced.tsb.toFixed(1)} is below -20, indicating accumulated fatigue exceeding fitness gains. This is the overreaching zone. Performance likely declining.`,
          metrics: {
            tsb: latestAdvanced.tsb,
            ctl: latestAdvanced.ctl ?? 0,
            atl: latestAdvanced.atl ?? 0,
          },
          confidence: tsbResult.confidence,
          actionSuggestion:
            "Schedule 3-5 day recovery block. Reduce intensity and volume significantly.",
          generatedBy: "rules",
        });
      }
    }

    // ── Rule 3: HRV Baseline Deviation ──
    const hrvBaseline = baselines.find((b) => b.metricName === "hrv");
    if (hrvBaseline && today_metric?.hrv != null) {
      const sd = (hrvBaseline as { stdDev?: number }).stdDev ?? 0;
      const hrvResult = checkHrvDeviation(
        today_metric.hrv,
        hrvBaseline.baselineValue,
        sd,
      );
      const zScore = hrvBaseline.zScoreLatest ?? 0;
      if (hrvResult.triggered || zScore < -1.5) {
        insights.push({
          userId,
          date: today,
          insightType: "recovery_needed",
          severity: "warn",
          title: `💓 HRV Significantly Below Baseline`,
          body: `Today's HRV of ${today_metric.hrv.toFixed(0)}ms is ${Math.abs(zScore).toFixed(1)} standard deviations below your 90-day baseline of ${hrvBaseline.baselineValue.toFixed(0)}ms. This indicates incomplete recovery or accumulated stress.`,
          metrics: {
            hrv: today_metric.hrv,
            baseline: hrvBaseline.baselineValue,
            zScore,
          },
          confidence: 0.8,
          actionSuggestion:
            "Opt for recovery training today. Check sleep quality, stress, and nutrition.",
          generatedBy: "rules",
        });
      }
    }

    // ── Rule 4: Sleep Debt ──
    const recentSleepDebt = metrics14
      .slice(0, 3)
      .filter((m) => (m.sleepDebtMinutes ?? 0) > 60);
    if (recentSleepDebt.length >= 2) {
      const maxDebt = Math.max(
        ...recentSleepDebt.map((m) => m.sleepDebtMinutes ?? 0),
      );
      insights.push({
        userId,
        date: today,
        insightType: "sleep_debt",
        severity: "warn",
        title: `💤 Persistent Sleep Debt — ${Math.floor(maxDebt / 60)}h ${maxDebt % 60}m`,
        body: `Sleep debt has accumulated over the past 3 days. Chronic sleep restriction impairs muscle glycogen replenishment, HGH release, and cognitive performance even when subjective fatigue is low (Halson 2014).`,
        metrics: { sleepDebtMinutes: maxDebt },
        confidence: 0.85,
        actionSuggestion:
          "Prioritize 8-9 hours tonight. Avoid training before adequate sleep recovery.",
        generatedBy: "rules",
      });
    }

    // ── Rule 5: Ramp Rate Spike ──
    if (
      latestAdvanced?.rampRate != null &&
      Math.abs(latestAdvanced.rampRate) > 10
    ) {
      insights.push({
        userId,
        date: today,
        insightType: "load_spike",
        severity: "warn",
        title: `📊 High Training Ramp Rate — ${latestAdvanced.rampRate.toFixed(1)}%`,
        body: `Weekly training load change of ${latestAdvanced.rampRate.toFixed(1)}% exceeds the 10% guideline. Rapid load increases are associated with elevated injury risk independent of absolute ACWR.`,
        metrics: { rampRate: latestAdvanced.rampRate },
        confidence: 0.75,
        actionSuggestion:
          "Cap next week's load increase at 5-8% over current week.",
        generatedBy: "rules",
      });
    }

    // ── Rule 6: Intervention Effectiveness Pattern ──
    const effectiveInterventions = recentInterventions.filter(
      (i) => (i.effectivenessRating ?? 0) >= 4,
    );
    const interventionTags = effectiveInterventions.map((i) => i.type);
    const patternResult = checkInterventionPattern(interventionTags);
    if (patternResult.triggered || effectiveInterventions.length > 0) {
      const types = [
        ...new Set(effectiveInterventions.map((i) => i.type)),
      ].join(", ");
      insights.push({
        userId,
        date: today,
        insightType: "correlation_found",
        severity: "info",
        title: `✅ Effective Recovery Patterns Identified`,
        body: `Based on your intervention logs, ${types} has been rated highly effective (${effectiveInterventions.length} entries, avg ${(effectiveInterventions.reduce((s, i) => s + (i.effectivenessRating ?? 0), 0) / effectiveInterventions.length).toFixed(1)}/5). Consider prioritizing these when recovery is needed.`,
        metrics: { count: effectiveInterventions.length, patternTag: patternResult.tag },
        confidence: 0.7,
        actionSuggestion: `Incorporate ${(effectiveInterventions[0]?.type ?? "your top-rated recovery methods")} proactively, not just reactively.`,
        generatedBy: "rules",
      });
    }

    // ── Persist insights (skip duplicates for same-day same-type) ──
    const saved = [];
    for (const insight of insights) {
      const [row] = await ctx.db
        .insert(AiInsight)
        .values(insight)
        .onConflictDoNothing()
        .returning();
      if (row) saved.push(row);
    }

    return { generated: insights.length, saved: saved.length, insights: saved };
  }),

  listInsights: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    return ctx.db.query.AiInsight.findMany({
      where: and(
        eq(AiInsight.userId, userId),
        gte(AiInsight.date, dateNDaysAgo(7)),
      ),
      orderBy: desc(AiInsight.createdAt),
      limit: 20,
    });
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(AiInsight)
        .set({ isRead: true })
        .where(
          and(
            eq(AiInsight.id, input.id),
            eq(AiInsight.userId, ctx.session.user.id),
          ),
        )
        .returning();
      return updated;
    }),
} satisfies TRPCRouterRecord;
