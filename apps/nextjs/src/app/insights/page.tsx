"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cn } from "@acme/ui";
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";
import { BottomNav } from "../_components/bottom-nav";
import { SectionHeader } from "../_components/info-button";

/* ─────────────── ProactiveInsightCard ─────────────── */

type AiSeverity = "info" | "warn" | "critical";

const AI_SEVERITY_STYLES: Record<
  AiSeverity,
  { border: string; bg: string; iconBg: string; badge: string }
> = {
  info: {
    border: "border-blue-500/30",
    bg: "bg-blue-500/5",
    iconBg: "bg-blue-500/20",
    badge: "bg-blue-500/20 text-blue-400",
  },
  warn: {
    border: "border-amber-500/30",
    bg: "bg-amber-500/5",
    iconBg: "bg-amber-500/20",
    badge: "bg-amber-500/20 text-amber-400",
  },
  critical: {
    border: "border-red-500/30",
    bg: "bg-red-500/5",
    iconBg: "bg-red-500/20",
    badge: "bg-red-500/20 text-red-400",
  },
};

interface ProactiveInsight {
  id: string;
  title: string;
  body: string;
  severity: string;
  confidence: number | null;
  actionSuggestion: string | null;
  metrics: Record<string, number | string> | null;
  isRead: boolean | null;
}

function ProactiveInsightCard({
  insight,
  onMarkRead,
}: {
  insight: ProactiveInsight;
  onMarkRead: (id: string) => void;
}) {
  const severity = (insight.severity ?? "info") as AiSeverity;
  const style = AI_SEVERITY_STYLES[severity] ?? AI_SEVERITY_STYLES.info;
  const confidencePct =
    insight.confidence != null
      ? `${(insight.confidence * 100).toFixed(0)}% confidence`
      : null;
  const metricEntries = insight.metrics ? Object.entries(insight.metrics) : [];

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 transition-opacity",
        style.border,
        style.bg,
        insight.isRead && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm leading-snug font-semibold">{insight.title}</h3>
        <div className="flex shrink-0 items-center gap-1">
          {confidencePct && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                style.badge,
              )}
            >
              {confidencePct}
            </span>
          )}
        </div>
      </div>

      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
        {insight.body}
      </p>

      {/* Cited metrics */}
      {metricEntries.length > 0 && (
        <p className="text-muted-foreground mt-2 font-mono text-[11px]">
          {metricEntries
            .map(([k, v]) => {
              const num = typeof v === "number" ? v : parseFloat(String(v));
              const display = isNaN(num) ? String(v) : num.toFixed(2);
              return `${k.toUpperCase()}: ${display}`;
            })
            .join(" | ")}
        </p>
      )}

      {/* Action suggestion */}
      {insight.actionSuggestion && (
        <div className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-sm">
          <span className="mr-1">💡</span>
          <span className="text-foreground/80">
            Suggested action: {insight.actionSuggestion}
          </span>
        </div>
      )}

      {/* Mark read */}
      {!insight.isRead && (
        <button
          onClick={() => onMarkRead(insight.id)}
          className="text-muted-foreground mt-3 text-xs underline underline-offset-2 hover:text-white"
        >
          Mark as read
        </button>
      )}
    </div>
  );
}

/* ─────────────── types ─────────────── */

interface InsightCard {
  icon: string;
  title: string;
  body: string;
  severity: "alert" | "warning" | "positive" | "info";
  metric?: string;
}

/* ─────────────── severity styles ─────────────── */

const SEVERITY_STYLES: Record<
  InsightCard["severity"],
  { border: string; bg: string; iconBg: string }
> = {
  alert: {
    border: "border-red-500/30",
    bg: "bg-red-500/5",
    iconBg: "bg-red-500/20",
  },
  warning: {
    border: "border-orange-500/30",
    bg: "bg-orange-500/5",
    iconBg: "bg-orange-500/20",
  },
  positive: {
    border: "border-green-500/30",
    bg: "bg-green-500/5",
    iconBg: "bg-green-500/20",
  },
  info: {
    border: "border-blue-500/30",
    bg: "bg-blue-500/5",
    iconBg: "bg-blue-500/20",
  },
};

const SEVERITY_ORDER: Record<InsightCard["severity"], number> = {
  alert: 0,
  warning: 1,
  positive: 2,
  info: 3,
};

/* ─────────────── insight generation ─────────────── */

interface InsightData {
  readiness: Record<string, unknown> | null;
  loads: Record<string, unknown> | null;
  sleepCoach: Record<string, unknown> | null;
  recovery: Record<string, unknown> | null;
  hrvTrend: Record<string, unknown> | null;
  trainingStatus: Record<string, unknown> | null;
  summary: Record<string, unknown> | null;
}

function generateInsights(data: InsightData): InsightCard[] {
  const insights: InsightCard[] = [];

  // Readiness insight
  if (data.readiness) {
    const score = data.readiness.score as number;
    const zone = data.readiness.zone as string;
    const explanation = data.readiness.explanation as string;
    const severity: InsightCard["severity"] =
      score >= 70 ? "positive" : score >= 40 ? "info" : "warning";
    insights.push({
      icon:
        severity === "positive" ? "✅" : severity === "warning" ? "⚠️" : "📊",
      title: `Readiness: ${score} (${zone})`,
      body:
        explanation || `Your readiness score is ${score}, in the ${zone} zone.`,
      severity,
      metric: `${score}`,
    });
  }

  // Training load insights
  if (data.loads) {
    const acwr = data.loads.acwr as number;
    const tsb = data.loads.tsb as number;
    const rampRate = data.loads.rampRate as number;

    if (acwr > 1.3) {
      insights.push({
        icon: "⚠️",
        title: "Training Spike Detected",
        body: `Your acute:chronic workload ratio is ${acwr.toFixed(2)}, which exceeds the safe zone (0.8–1.3). Consider reducing intensity to lower injury risk.`,
        severity: "alert",
        metric: `ACWR: ${acwr.toFixed(2)}`,
      });
    } else if (acwr >= 0.8 && acwr <= 1.3) {
      insights.push({
        icon: "👍",
        title: "Training Load in Sweet Spot",
        body: `Your ACWR is ${acwr.toFixed(2)}, within the optimal 0.8–1.3 range. Keep up the balanced approach.`,
        severity: "positive",
        metric: `ACWR: ${acwr.toFixed(2)}`,
      });
    }

    if (tsb < -20) {
      insights.push({
        icon: "😴",
        title: "Significant Fatigue",
        body: `Your Training Stress Balance is ${tsb.toFixed(1)}, indicating heavy accumulated fatigue. Consider a recovery day or lighter session.`,
        severity: "warning",
        metric: `TSB: ${tsb.toFixed(1)}`,
      });
    } else if (tsb > 15) {
      insights.push({
        icon: "⚡",
        title: "Fresh & Ready to Perform",
        body: `Your TSB is +${tsb.toFixed(1)}, indicating you're well rested. Great time for a key workout or race.`,
        severity: "positive",
        metric: `TSB: +${tsb.toFixed(1)}`,
      });
    }

    if (rampRate > 8) {
      insights.push({
        icon: "📈",
        title: "Rapid Load Increase",
        body: `Your training load is increasing at ${rampRate.toFixed(1)} pts/week. Ramp rates above 8 increase overtraining risk. Consider a down week.`,
        severity: "warning",
        metric: `Ramp: ${rampRate.toFixed(1)}/wk`,
      });
    }
  }

  // Sleep coach insight
  if (data.sleepCoach) {
    const sleepDebt = data.sleepCoach.sleepDebtMinutes as number;
    const insight = data.sleepCoach.insight as string;
    const recommendedBedtime = data.sleepCoach.recommendedBedtime as
      | string
      | undefined;

    if (sleepDebt > 60) {
      const bedtimeHint = recommendedBedtime
        ? ` Try going to bed by ${recommendedBedtime}.`
        : "";
      insights.push({
        icon: "🛏️",
        title: "Sleep Debt Accumulating",
        body: `You have ${sleepDebt} minutes of sleep debt.${bedtimeHint}`,
        severity: "warning",
        metric: `${sleepDebt} min debt`,
      });
    } else if (insight) {
      insights.push({
        icon: "🌙",
        title: "Sleep Coach",
        body: insight,
        severity: "info",
      });
    }
  }

  // Recovery time
  if (data.recovery) {
    const hours = data.recovery.hoursUntilRecovered as number;
    const severity: InsightCard["severity"] = hours > 48 ? "warning" : "info";
    insights.push({
      icon: hours > 48 ? "🔋" : "⏱️",
      title: "Recovery Estimate",
      body: `Estimated ${hours} hours until full recovery from your last session.`,
      severity,
      metric: `${hours}h`,
    });
  }

  // HRV long-term trend
  if (data.hrvTrend) {
    const direction = data.hrvTrend.direction as string;
    const percentChange = data.hrvTrend.percentChange as number;

    if (direction === "declining" || direction === "down") {
      insights.push({
        icon: "💓",
        title: "HRV Declining",
        body: `Your HRV has been declining (${Math.abs(percentChange).toFixed(1)}% change). This may indicate accumulated stress or insufficient recovery.`,
        severity: "warning",
        metric: `${percentChange.toFixed(1)}%`,
      });
    } else if (direction === "improving" || direction === "up") {
      insights.push({
        icon: "💓",
        title: "HRV Improving",
        body: `Your HRV trend is positive (+${Math.abs(percentChange).toFixed(1)}%), suggesting good recovery and adaptation.`,
        severity: "positive",
        metric: `+${Math.abs(percentChange).toFixed(1)}%`,
      });
    }
  }

  // Training status
  if (data.trainingStatus) {
    const status = data.trainingStatus.status as string;
    const recommendation = data.trainingStatus.recommendation as
      | string
      | undefined;
    const explanation = data.trainingStatus.explanation as string;

    const severity: InsightCard["severity"] =
      status === "productive" || status === "peaking"
        ? "positive"
        : status === "overreaching" ||
            status === "detraining" ||
            status === "unproductive"
          ? "warning"
          : "info";

    insights.push({
      icon:
        status === "productive"
          ? "🚀"
          : status === "peaking"
            ? "🏆"
            : status === "recovery"
              ? "🧘"
              : "📋",
      title: `Status: ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      body: recommendation ?? explanation,
      severity,
    });
  }

  // Sort by severity (alerts first)
  return insights.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}

/* ─────────────── InsightCard component ─────────────── */

function InsightCardUI({ insight }: { insight: InsightCard }) {
  const style = SEVERITY_STYLES[insight.severity];
  return (
    <div className={cn("rounded-2xl border p-4", style.border, style.bg)}>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg",
            style.iconBg,
          )}
        >
          {insight.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{insight.title}</h3>
            {insight.metric && (
              <span className="text-muted-foreground shrink-0 text-xs font-medium tabular-nums">
                {insight.metric}
              </span>
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            {insight.body}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── page ─────────────── */

export default function InsightsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Proactive AI insights
  const proactiveInsights = useQuery(
    trpc.proactive.listInsights.queryOptions(),
  );
  const generateMutation = useMutation(
    trpc.proactive.generateInsights.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.proactive.listInsights.queryKey(),
        });
      },
      onError: (err) => toast.error(err.message),
    }),
  );
  const markReadMutation = useMutation(
    trpc.proactive.markRead.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.proactive.listInsights.queryKey(),
        });
      },
    }),
  );

  const readiness = useQuery(trpc.readiness.getToday.queryOptions());
  const loads = useQuery(trpc.analytics.getTrainingLoads.queryOptions());
  const sleepCoach = useQuery(trpc.sleep.getCoach.queryOptions());
  const recovery = useQuery(trpc.analytics.getRecoveryTime.queryOptions());
  const hrvTrend = useQuery(
    trpc.trends.getLongTermTrend.queryOptions({ metric: "hrv", period: "30d" }),
  );
  const trainingStatus = useQuery(
    trpc.analytics.getTrainingStatus.queryOptions(),
  );
  const summary = useQuery(
    trpc.trends.getSummary.queryOptions({ period: "7d" }),
  );

  const isLoading =
    readiness.isLoading ||
    loads.isLoading ||
    sleepCoach.isLoading ||
    recovery.isLoading ||
    trainingStatus.isLoading;

  const insights = useMemo(() => {
    return generateInsights({
      readiness:
        (readiness.data as Record<string, unknown> | undefined) ?? null,
      loads: (loads.data as Record<string, unknown> | undefined) ?? null,
      sleepCoach:
        (sleepCoach.data as unknown as Record<string, unknown> | undefined) ??
        null,
      recovery: (recovery.data as Record<string, unknown> | undefined) ?? null,
      hrvTrend:
        (hrvTrend.data as unknown as Record<string, unknown> | undefined) ??
        null,
      trainingStatus:
        (trainingStatus.data as unknown as
          | Record<string, unknown>
          | undefined) ?? null,
      summary: (summary.data as Record<string, unknown> | undefined) ?? null,
    });
  }, [
    readiness.data,
    loads.data,
    sleepCoach.data,
    recovery.data,
    hrvTrend.data,
    trainingStatus.data,
    summary.data,
  ]);

  const summaryData = summary.data as
    | Record<string, unknown>
    | null
    | undefined;

  return (
    <main className="min-h-screen bg-black mx-auto max-w-lg space-y-4 px-4 pt-6 pb-24">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold">Insights</h1>
        <p className="text-muted-foreground text-sm">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* ── Proactive AI Insights ── */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <SectionHeader
            title="AI Insights"
            info="Proactive insights generated by evidence-based rules analyzing your ACWR, TSB, HRV baseline deviation, sleep debt, ramp rate, and intervention patterns. Rules fire when thresholds are exceeded. Confidence reflects data completeness."
          />
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="rounded-lg bg-blue-500/20 px-3 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/30 disabled:opacity-50"
          >
            {generateMutation.isPending ? "Analyzing…" : "Refresh Insights"}
          </button>
        </div>
        {proactiveInsights.isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="bg-card animate-pulse rounded-2xl border p-4"
              >
                <div className="bg-muted h-4 w-2/3 rounded" />
                <div className="bg-muted mt-2 h-3 w-full rounded" />
              </div>
            ))}
          </div>
        ) : proactiveInsights.data && proactiveInsights.data.length > 0 ? (
          <div className="space-y-3">
            {(proactiveInsights.data as ProactiveInsight[]).map((insight) => (
              <ProactiveInsightCard
                key={insight.id}
                insight={insight}
                onMarkRead={(id) => markReadMutation.mutate({ id })}
              />
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-2xl border p-4 text-center">
            <p className="text-muted-foreground text-sm">
              No AI insights yet. Tap "Refresh Insights" to run analysis.
            </p>
          </div>
        )}
      </div>

      {/* ── Weekly Summary ── */}
      {summary.isLoading ? (
        <div className="bg-card animate-pulse rounded-2xl border p-4">
          <div className="bg-muted h-4 w-32 rounded" />
          <div className="mt-3 grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-muted h-14 rounded-lg" />
            ))}
          </div>
        </div>
      ) : summaryData ? (
        <div className="bg-card rounded-2xl border p-4">
          <SectionHeader
            title="This Week"
            info="Weekly summary comparing key metrics against your 30-day personal baselines. Green = better than average, red = below. Method: Current week's mean vs 30-day EMA baseline for each metric (sleep, activity, RHR, stress, HRV). Threshold: >0.5 SD difference flagged. Citation: Individual monitoring using z-scores (Buchheit 2014)."
            className="mb-3"
          />
          <div className="grid grid-cols-3 gap-3">
            {summaryData.totalDays != null && (
              <div className="rounded-xl bg-zinc-800/60 p-3 text-center">
                <p className="text-xl font-bold text-blue-400">
                  {summaryData.totalDays as number}
                </p>
                <p className="text-muted-foreground text-[10px]">
                  Days tracked
                </p>
              </div>
            )}
            {summaryData.avgReadiness != null && (
              <div className="rounded-xl bg-zinc-800/60 p-3 text-center">
                <p className="text-xl font-bold text-green-400">
                  {Math.round(summaryData.avgReadiness as number)}
                </p>
                <p className="text-muted-foreground text-[10px]">
                  Avg readiness
                </p>
              </div>
            )}
            {summaryData.avgSleepMinutes != null && (
              <div className="rounded-xl bg-zinc-800/60 p-3 text-center">
                <p className="text-xl font-bold text-purple-400">
                  {((summaryData.avgSleepMinutes as number) / 60).toFixed(1)}h
                </p>
                <p className="text-muted-foreground text-[10px]">Avg sleep</p>
              </div>
            )}
            {summaryData.avgHrv != null && (
              <div className="rounded-xl bg-zinc-800/60 p-3 text-center">
                <p className="text-xl font-bold text-pink-400">
                  {Math.round(summaryData.avgHrv as number)}
                </p>
                <p className="text-muted-foreground text-[10px]">Avg HRV</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* ── Insight Cards ── */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-card animate-pulse rounded-2xl border p-4"
            >
              <div className="flex items-start gap-3">
                <div className="bg-muted h-9 w-9 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="bg-muted h-4 w-2/3 rounded" />
                  <div className="bg-muted h-3 w-full rounded" />
                  <div className="bg-muted h-3 w-3/4 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : insights.length > 0 ? (
        <div className="space-y-3">
          <SectionHeader
            title="Daily Insights"
            info="Day-by-day notable patterns and anomalies. Method: Flags days where metrics deviate >2 SD from personal 30-day baseline (z-score analysis). Both positive achievements and concerns highlighted. Anomaly sources: HRV spikes/drops, unusual RHR, sleep disruption, training load changes. Citation: Plews et al. (2013) HRV monitoring."
          />
          {insights.map((insight, i) => (
            <InsightCardUI key={i} insight={insight} />
          ))}
        </div>
      ) : (
        <div className="bg-card rounded-2xl border p-6 text-center">
          <p className="text-3xl">🔍</p>
          <p className="text-muted-foreground mt-2 text-sm">
            No insights available yet. As more data comes in, personalized
            insights will appear here.
          </p>
        </div>
      )}

      <BottomNav />
    </main>
  );
}
