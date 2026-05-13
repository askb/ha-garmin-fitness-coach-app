"use client";

import { useQuery } from "@tanstack/react-query";

import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";
import { DataFreshness } from "./data-freshness";

/* ── readiness zone styling ─────────────────────────────────────── */
function readinessZone(score: number | null): {
  label: string;
  className: string;
} {
  if (score == null) return { label: "—", className: "text-muted-foreground" };
  if (score >= 80) return { label: "Prime", className: "text-emerald-400" };
  if (score >= 60) return { label: "Good", className: "text-green-400" };
  if (score >= 40) return { label: "Moderate", className: "text-yellow-400" };
  if (score >= 20) return { label: "Low", className: "text-orange-400" };
  return { label: "Poor", className: "text-red-400" };
}

function trendChip(trend: "rising" | "falling" | "stable" | null): {
  symbol: string;
  className: string;
} {
  if (trend === "rising") return { symbol: "▲", className: "text-emerald-400" };
  if (trend === "falling") return { symbol: "▼", className: "text-red-400" };
  if (trend === "stable") return { symbol: "▶", className: "text-blue-400" };
  return { symbol: "—", className: "text-muted-foreground" };
}

/* ── component ──────────────────────────────────────────────────── */
export function GarminTrainingSummary() {
  const trpc = useTRPC();
  const summary = useQuery(
    trpc.garmin.getTrainingSummary.queryOptions({ days: 7 }),
  );

  if (summary.isLoading) {
    return <div className="bg-muted h-32 animate-pulse rounded-2xl" />;
  }

  const latest = summary.data?.latest;
  if (!latest) {
    return (
      <div className="bg-card text-muted-foreground rounded-2xl border p-4 text-sm">
        No Garmin training summary yet — sync your device to populate readiness,
        recovery, and HRV.
      </div>
    );
  }

  const readiness = readinessZone(latest.garminTrainingReadiness ?? null);
  const trend = trendChip(
    (summary.data?.hrvTrend as "rising" | "falling" | "stable" | null) ?? null,
  );

  return (
    <div className="bg-card space-y-3 rounded-2xl border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Garmin Training Summary
        </h2>
        <DataFreshness computedAt={summary.data?.computedAt} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Training Readiness */}
        <div className="bg-background/40 rounded-lg p-3">
          <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
            Readiness
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className={cn("text-2xl font-bold", readiness.className)}>
              {latest.garminTrainingReadiness ?? "—"}
            </span>
            {latest.garminTrainingReadiness != null && (
              <span className="text-muted-foreground text-xs">/100</span>
            )}
          </div>
          <div className={cn("mt-0.5 text-xs", readiness.className)}>
            {readiness.label}
          </div>
        </div>

        {/* Recovery Time */}
        <div className="bg-background/40 rounded-lg p-3">
          <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
            Recovery
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-bold">
              {latest.garminRecoveryHours != null
                ? Math.round(latest.garminRecoveryHours)
                : "—"}
            </span>
            {latest.garminRecoveryHours != null && (
              <span className="text-muted-foreground text-xs">h</span>
            )}
          </div>
          <div className="text-muted-foreground mt-0.5 text-xs">remaining</div>
        </div>

        {/* Training Status */}
        <div className="bg-background/40 rounded-lg p-3">
          <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
            Status
          </div>
          <div className="mt-1 truncate text-lg font-semibold capitalize">
            {latest.garminTrainingStatus
              ? latest.garminTrainingStatus.toLowerCase().replace(/_/g, " ")
              : "—"}
          </div>
          <div className="text-muted-foreground mt-0.5 text-xs">
            {latest.garminTrainingReadinessLevel?.toLowerCase() ?? "—"}
          </div>
        </div>

        {/* HRV (weekly avg + trend) */}
        <div className="bg-background/40 rounded-lg p-3">
          <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
            HRV (7d)
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-bold">
              {summary.data?.hrvAvg ?? "—"}
            </span>
            {summary.data?.hrvAvg != null && (
              <span className="text-muted-foreground text-xs">ms</span>
            )}
          </div>
          <div className={cn("mt-0.5 text-xs", trend.className)}>
            {trend.symbol} {summary.data?.hrvTrend ?? "no trend"}
          </div>
        </div>
      </div>
    </div>
  );
}
