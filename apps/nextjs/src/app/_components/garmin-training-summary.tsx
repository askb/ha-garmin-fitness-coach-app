"use client";

import { useQuery } from "@tanstack/react-query";

import { cn } from "@acme/ui";

import { formatDateInTz, useUserTimezone } from "~/lib/format-date";
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
  const timezone = useUserTimezone();
  const summary = useQuery(
    trpc.garmin.getTrainingSummary.queryOptions({ days: 14 }),
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

  const todayKey = formatDateInTz(new Date(), timezone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const staleCaption = (date: string | null | undefined) => {
    if (!date) return null;
    const value = `${date}T12:00:00Z`;
    const dateKey = formatDateInTz(value, timezone, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    if (dateKey === todayKey) return null;
    return `as of ${formatDateInTz(value, timezone, {
      month: "short",
      day: "numeric",
    })}`;
  };

  const readiness = readinessZone(latest.garminTrainingReadiness ?? null);
  const readinessAsOf = staleCaption(
    summary.data?.latestDates.garminTrainingReadiness,
  );
  const recoveryAsOf = staleCaption(
    summary.data?.latestDates.garminRecoveryHours,
  );
  const statusAsOf = staleCaption(
    summary.data?.latestDates.garminTrainingStatus ??
      summary.data?.latestDates.garminTrainingReadinessLevel,
  );
  const trend = trendChip(
    (summary.data?.hrvTrend as "rising" | "falling" | "stable" | null) ?? null,
  );

  return (
    <div className="bg-card space-y-3 rounded-2xl border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Garmin Native (Firstbeat)
        </h2>
        <DataFreshness computedAt={summary.data?.computedAt} />
      </div>
      <p className="text-muted-foreground -mt-1 text-[11px]">
        From your watch&apos;s Firstbeat algorithms. Requires Forerunner 245+,
        Fenix 6+, or similar. See the home page for our computed Readiness
        score, which uses HRV / RHR / sleep and works on any device.
      </p>

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
            {readinessAsOf && (
              <span className="text-muted-foreground"> · {readinessAsOf}</span>
            )}
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
          <div className="text-muted-foreground mt-0.5 text-xs">
            remaining{recoveryAsOf ? ` · ${recoveryAsOf}` : ""}
          </div>
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
            {statusAsOf ? ` · ${statusAsOf}` : ""}
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
