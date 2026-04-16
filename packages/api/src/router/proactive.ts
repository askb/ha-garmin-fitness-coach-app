import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, gte, sql } from "@acme/db";
import {
  AdvancedMetric,
  AiInsight,
  AthleteBaseline,
  DailyMetric,
  Intervention,
  ReadinessScore,
} from "@acme/db/schema";

import {
  checkAcwrRisk,
  checkHrvDeviation,
  checkInterventionPattern,
  checkTsbOverreaching,
  isHrvSuppressed,
} from "../lib/insight-rules";
import { protectedProcedure } from "../trpc";

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0]!;
}

/** Compute mean of non-null numbers. Returns null if empty. */
function mean(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export const proactiveRouter = {
  generateInsights: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const today = new Date().toISOString().split("T")[0]!;
    const insights: (typeof AiInsight.$inferInsert)[] = [];

    // Parallel data fetch
    const [
      metrics14,
      latestAdvanced,
      baselines,
      recentInterventions,
      latestReadiness,
    ] = await Promise.all([
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
      ctx.db.query.ReadinessScore.findFirst({
        where: eq(ReadinessScore.userId, userId),
        orderBy: desc(ReadinessScore.date),
      }),
    ]);

    const today_metric = metrics14[0];
    const hrvBaseline = baselines.find((b) => b.metricName === "hrv");

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
        // Cross-check HRV before recommending load increase
        const hrvLow = isHrvSuppressed(
          today_metric?.hrv,
          hrvBaseline?.baselineValue,
          hrvBaseline?.baselineSD,
        );

        if (hrvLow) {
          // HRV is below baseline — modify insight to acknowledge recovery state
          insights.push({
            userId,
            date: today,
            insightType: "positive_trend",
            severity: "info",
            title: `📈 Training Load Below Base — But Recovery First`,
            body: `ACWR of ${acwr.toFixed(2)} suggests room to increase volume, but today's HRV indicates incomplete recovery. Wait for HRV to return to baseline before adding load.`,
            metrics: {
              acwr,
              ctl: latestAdvanced.ctl ?? 0,
              hrv: today_metric?.hrv ?? 0,
              hrvBaseline: hrvBaseline?.baselineValue ?? 0,
            },
            confidence: 0.65,
            actionSuggestion:
              "Prioritize recovery today. Reassess in 1-2 days when HRV normalizes.",
            generatedBy: "rules",
          });
        } else {
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
    if (hrvBaseline && today_metric?.hrv != null) {
      const sd = hrvBaseline.baselineSD ?? 0;
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
        metrics: {
          count: effectiveInterventions.length,
          patternTag: patternResult.tag ?? "",
        },
        confidence: 0.7,
        actionSuggestion: `Incorporate ${effectiveInterventions[0]?.type ?? "your top-rated recovery methods"} proactively, not just reactively.`,
        generatedBy: "rules",
      });
    }

    // ── Rule 7: Vitals — SpO2 Deviation ──
    const spo2Values = metrics14
      .map((m) => m.spo2)
      .filter((v): v is number => v != null);
    if (spo2Values.length >= 3) {
      const latest = spo2Values[0]!;
      const baseline = mean(spo2Values.slice(1));
      if (baseline != null) {
        if (latest < 92) {
          insights.push({
            userId,
            date: today,
            insightType: "spo2_alert",
            severity: "critical",
            title: `🫁 SpO2 Critically Low — ${latest}%`,
            body: `Today's blood oxygen of ${latest}% is below the clinical concern threshold (92%). Baseline: ${baseline.toFixed(1)}%. Consider consulting a healthcare provider if this persists.`,
            metrics: { spo2: latest, baseline },
            confidence: 0.9,
            actionSuggestion:
              "Monitor SpO2 closely. Avoid intense exercise. Consult a physician if symptoms present.",
            generatedBy: "rules",
          });
        } else if (latest < 95 && latest < baseline - 1.5) {
          insights.push({
            userId,
            date: today,
            insightType: "spo2_alert",
            severity: "warn",
            title: `🫁 SpO2 Below Baseline — ${latest}%`,
            body: `Blood oxygen of ${latest}% is below your 14-day average of ${baseline.toFixed(1)}%. This can indicate illness onset, altitude effects, or recovery stress.`,
            metrics: { spo2: latest, baseline },
            confidence: 0.75,
            actionSuggestion:
              "Take it easy today. Monitor for respiratory symptoms.",
            generatedBy: "rules",
          });
        }
      }
    }

    // ── Rule 8: Vitals — Respiration Rate Deviation ──
    const rrValues = metrics14
      .map((m) => m.respirationRate)
      .filter((v): v is number => v != null);
    if (rrValues.length >= 3) {
      const latest = rrValues[0]!;
      const baseline = mean(rrValues.slice(1));
      if (baseline != null && latest > baseline + 2) {
        insights.push({
          userId,
          date: today,
          insightType: "rr_alert",
          severity: latest > baseline + 4 ? "warn" : "info",
          title: `💨 Elevated Respiration Rate — ${latest.toFixed(1)} brpm`,
          body: `Your respiration rate of ${latest.toFixed(1)} breaths/min is above your baseline of ${baseline.toFixed(1)}. Elevated RR often precedes illness or signals incomplete recovery (Buchheit 2014).`,
          metrics: { rr: latest, baseline },
          confidence: 0.7,
          actionSuggestion:
            "Monitor for illness symptoms. Prioritize recovery if feeling run down.",
          generatedBy: "rules",
        });
      }
    }

    // ── Always-fire: Daily Status Snapshot ──
    // Ensures the user always gets at least one insight on refresh
    {
      const parts: string[] = [];
      const metricsObj: Record<string, number | string> = {};

      if (latestReadiness) {
        parts.push(
          `Readiness: ${latestReadiness.score}/100 (${latestReadiness.zone})`,
        );
        metricsObj.readiness = latestReadiness.score;
        metricsObj.zone = latestReadiness.zone;
      }

      if (latestAdvanced?.acwr != null) {
        const acwr = latestAdvanced.acwr;
        const label =
          acwr > 1.3
            ? "caution"
            : acwr >= 0.8
              ? "optimal"
              : "under-training";
        parts.push(`ACWR: ${acwr.toFixed(2)} (${label})`);
        metricsObj.acwr = acwr;
      }

      if (latestAdvanced?.tsb != null) {
        const tsb = latestAdvanced.tsb;
        const label =
          tsb < -20 ? "fatigued" : tsb > 15 ? "fresh" : "balanced";
        parts.push(`Form: ${tsb.toFixed(1)} (${label})`);
        metricsObj.tsb = tsb;
      }

      if (today_metric?.totalSleepMinutes != null) {
        const hours = (today_metric.totalSleepMinutes / 60).toFixed(1);
        parts.push(`Sleep: ${hours}h`);
        metricsObj.sleepHours = Number(hours);
      }

      if (today_metric?.hrv != null) {
        parts.push(`HRV: ${today_metric.hrv.toFixed(0)}ms`);
        metricsObj.hrv = today_metric.hrv;
      }

      if (spo2Values.length > 0) {
        parts.push(`SpO2: ${spo2Values[0]}%`);
        metricsObj.spo2 = spo2Values[0]!;
      }

      // Determine overall tone
      const score = latestReadiness?.score ?? 50;
      const zone = latestReadiness?.zone ?? "moderate";
      const icon = score >= 70 ? "🟢" : score >= 40 ? "🟡" : "🔴";
      const statusWord = score >= 70 ? "Good" : score >= 40 ? "Fair" : "Low";

      const warningCount = insights.filter(
        (i) => i.severity === "warn" || i.severity === "critical",
      ).length;

      let summary: string;
      if (parts.length === 0) {
        summary =
          "No recent metrics available. Make sure Garmin sync is running and data is flowing.";
      } else if (warningCount > 0) {
        summary = `${parts.join(" · ")}. ${warningCount} concern${warningCount > 1 ? "s" : ""} flagged above — review and adjust your training plan.`;
      } else {
        summary = `${parts.join(" · ")}. All metrics within normal ranges — you're on track.`;
      }

      insights.push({
        userId,
        date: today,
        insightType: "daily_summary",
        severity: "info",
        title: `${icon} Daily Status — ${statusWord} (${score}/100)`,
        body: summary,
        metrics: metricsObj,
        confidence: 0.9,
        actionSuggestion:
          warningCount > 0
            ? "Address the flagged concerns before your next hard session."
            : zone === "high"
              ? "Great day for a quality session or race effort."
              : "Continue your planned training. Monitor how you feel.",
        generatedBy: "rules",
      });
    }

    // ── Persist insights (upsert same-day same-type to refresh content) ──
    const saved = [];
    for (const insight of insights) {
      const [row] = await ctx.db
        .insert(AiInsight)
        .values(insight)
        .onConflictDoUpdate({
          target: [AiInsight.userId, AiInsight.date, AiInsight.insightType],
          set: {
            severity: sql`excluded.severity`,
            title: sql`excluded.title`,
            body: sql`excluded.body`,
            metrics: sql`excluded.metrics`,
            confidence: sql`excluded.confidence`,
            actionSuggestion: sql`excluded.action_suggestion`,
            isRead: sql`false`,
            updatedAt: sql`now()`,
          },
        })
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
