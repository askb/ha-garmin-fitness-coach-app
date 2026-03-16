"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";
import { BottomNav } from "../_components/bottom-nav";

/* ─────────────── constants ─────────────── */

const TREND_BADGE: Record<string, { icon: string; label: string; cls: string }> = {
  improving: { icon: "↑", label: "Improving", cls: "bg-green-500/20 text-green-400" },
  stable: { icon: "→", label: "Stable", cls: "bg-yellow-500/20 text-yellow-400" },
  declining: { icon: "↓", label: "Declining", cls: "bg-red-500/20 text-red-400" },
};

const STATUS_COLORS: Record<string, string> = {
  productive: "bg-green-500/20 text-green-400",
  maintaining: "bg-yellow-500/20 text-yellow-400",
  detraining: "bg-red-500/20 text-red-400",
  overreaching: "bg-orange-500/20 text-orange-400",
  peaking: "bg-blue-500/20 text-blue-400",
  recovery: "bg-purple-500/20 text-purple-400",
  unproductive: "bg-red-500/20 text-red-400",
};

const DISTANCE_LABELS: Record<string, string> = {
  "5K": "5K",
  "10K": "10K",
  half_marathon: "Half Marathon",
  marathon: "Marathon",
};

// ACSM VO2max classification — Male norms (ml/kg/min)
// Source: ACSM's Guidelines for Exercise Testing and Prescription, 11th ed.
const VO2MAX_NORMS_MALE: Record<string, [number, number, number, number]> = {
  // [poor_upper, fair_upper, good_upper, excellent_upper]
  "20-29": [33, 36, 42, 46],
  "30-39": [33, 36, 41, 46],
  "40-49": [30, 33, 38, 43],
  "50-59": [26, 30, 35, 40],
  "60+": [22, 26, 32, 37],
};

function classifyVO2max(vo2max: number, ageGroup = "30-39"): string {
  const thresholds = VO2MAX_NORMS_MALE[ageGroup] ?? VO2MAX_NORMS_MALE["30-39"]!;
  if (vo2max < thresholds[0]) return "Poor";
  if (vo2max < thresholds[1]) return "Fair";
  if (vo2max < thresholds[2]) return "Good";
  if (vo2max < thresholds[3]) return "Excellent";
  return "Superior";
}

function classificationColor(classification: string): string {
  switch (classification) {
    case "Superior":
      return "text-blue-400";
    case "Excellent":
      return "text-green-400";
    case "Good":
      return "text-emerald-400";
    case "Fair":
      return "text-yellow-400";
    case "Poor":
      return "text-red-400";
    default:
      return "text-muted-foreground";
  }
}

function percentileEstimate(vo2max: number): number {
  // Rough percentile mapping for adult males (simplified)
  if (vo2max >= 60) return 1;
  if (vo2max >= 55) return 5;
  if (vo2max >= 50) return 10;
  if (vo2max >= 46) return 20;
  if (vo2max >= 42) return 30;
  if (vo2max >= 38) return 45;
  if (vo2max >= 34) return 60;
  if (vo2max >= 30) return 75;
  return 90;
}

function pacePerKm(seconds: number, distanceMeters: number): string {
  const totalSecondsPerKm = seconds / (distanceMeters / 1000);
  const mins = Math.floor(totalSecondsPerKm / 60);
  const secs = Math.round(totalSecondsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, "0")} /km`;
}

function fmtDateShort(d: string): string {
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ─────────────── page ─────────────── */

export default function FitnessPage() {
  const trpc = useTRPC();

  const vo2max = useQuery(
    trpc.analytics.getVO2maxHistory.queryOptions({ days: 365 }),
  );
  const racePredictions = useQuery(
    trpc.analytics.getRacePredictions.queryOptions(),
  );
  const trainingStatus = useQuery(
    trpc.analytics.getTrainingStatus.queryOptions(),
  );

  // Latest VO2max value
  const latestVO2max = useMemo(() => {
    if (!vo2max.data?.estimates?.length) return null;
    return vo2max.data.estimates[0]!;
  }, [vo2max.data]);

  const trend = vo2max.data?.trend;
  const trendInfo = trend ? TREND_BADGE[trend.trend] : null;

  // Chart data (chronological order)
  const chartData = useMemo(() => {
    if (!vo2max.data?.estimates?.length) return [];
    return [...vo2max.data.estimates]
      .reverse()
      .map((e) => ({
        date: fmtDateShort(e.date),
        fullDate: e.date,
        value: e.value,
        sport: e.sport,
        source: e.source,
      }));
  }, [vo2max.data]);

  // Trendline data: simple linear regression overlay
  const trendlineData = useMemo(() => {
    if (chartData.length < 4) return [];
    const n = chartData.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = chartData.reduce((s, d) => s + d.value, 0);
    const sumXY = chartData.reduce((s, d, i) => s + i * d.value, 0);
    const sumXX = chartData.reduce((s, _, i) => s + i * i, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return chartData.map((d, i) => ({
      ...d,
      trendline: Number((intercept + slope * i).toFixed(1)),
    }));
  }, [chartData]);

  const classification = latestVO2max
    ? classifyVO2max(latestVO2max.value)
    : null;

  const topPercent = latestVO2max
    ? percentileEstimate(latestVO2max.value)
    : null;

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pb-24 pt-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fitness &amp; Performance</h1>
          <p className="text-muted-foreground text-sm">
            VO2max &amp; race predictions
          </p>
        </div>
        {trendInfo && (
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              trendInfo.cls,
            )}
          >
            {trendInfo.icon} {trendInfo.label}
          </span>
        )}
      </div>

      {/* ── Current VO2max Hero ── */}
      {vo2max.isLoading ? (
        <div className="bg-card animate-pulse rounded-2xl border p-6">
          <div className="bg-muted mx-auto h-16 w-24 rounded" />
          <div className="bg-muted mx-auto mt-3 h-4 w-32 rounded" />
        </div>
      ) : latestVO2max ? (
        <div className="bg-card rounded-2xl border p-6 text-center">
          <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Current VO2max
          </p>
          <p className="mt-1 text-5xl font-bold text-blue-400">
            {latestVO2max.value.toFixed(1)}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            ml/kg/min
          </p>
          {classification && (
            <p className="mt-2 text-sm">
              <span className={cn("font-semibold", classificationColor(classification))}>
                {classification}
              </span>
              <span className="text-muted-foreground"> fitness level</span>
            </p>
          )}
          {trend && (
            <p className="text-muted-foreground mt-1 text-xs">
              {trend.slopePerWeek >= 0 ? "+" : ""}
              {trend.slopePerWeek.toFixed(2)} /week
            </p>
          )}
        </div>
      ) : (
        <div className="bg-card rounded-2xl border p-6 text-center">
          <p className="text-muted-foreground text-sm">
            No VO2max data available yet. Complete some runs with heart rate
            monitoring to see your estimates.
          </p>
        </div>
      )}

      {/* ── VO2max Trend Chart ── */}
      {chartData.length > 0 && (
        <div className="bg-card rounded-2xl border p-4">
          <h2 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
            VO2max Trend — {chartData.length} estimates
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={trendlineData.length > 0 ? trendlineData : chartData}
              margin={{ top: 5, right: 5, left: -10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="vo2Fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#888", fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "#888", fontSize: 10 }}
                width={36}
                domain={["dataMin - 2", "dataMax + 2"]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #333",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(_label, payload) => {
                  if (payload?.[0]?.payload) {
                    const p = payload[0].payload as Record<string, unknown>;
                    const source = p.source ? ` (${p.source as string})` : "";
                    return `${p.date as string}${source}`;
                  }
                  return String(_label ?? "");
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                fill="url(#vo2Fill)"
                strokeWidth={2}
                name="VO2max"
                dot={{ fill: "#3b82f6", r: 3 }}
              />
              {trendlineData.length > 0 && (
                <Line
                  type="monotone"
                  dataKey="trendline"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                  dot={false}
                  name="Trend"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Percentile Card ── */}
      {latestVO2max && topPercent !== null && (
        <div className="bg-card rounded-2xl border p-4">
          <h2 className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wider">
            Performance Comparison
          </h2>
          <p className="text-sm">
            Your VO2max of{" "}
            <span className="font-bold text-blue-400">
              {latestVO2max.value.toFixed(1)}
            </span>{" "}
            puts you in the{" "}
            <span className="font-bold text-green-400">
              top {topPercent}%
            </span>{" "}
            for your age group.
          </p>
          {/* Reference scale */}
          <div className="mt-3 flex gap-1">
            {[
              { label: "Poor", cls: "bg-red-500/30", range: "<33" },
              { label: "Fair", cls: "bg-yellow-500/30", range: "33-36" },
              { label: "Good", cls: "bg-emerald-500/30", range: "37-41" },
              { label: "Excellent", cls: "bg-green-500/30", range: "42-46" },
              { label: "Superior", cls: "bg-blue-500/30", range: ">46" },
            ].map((tier) => (
              <div
                key={tier.label}
                className={cn(
                  "flex-1 rounded-lg py-2 text-center text-[10px]",
                  tier.cls,
                  classification === tier.label
                    ? "ring-2 ring-white/30"
                    : "opacity-60",
                )}
              >
                <p className="font-semibold">{tier.label}</p>
                <p className="text-muted-foreground">{tier.range}</p>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground mt-2 text-[10px]">
            Reference: ACSM norms for males 30-39 (ml/kg/min)
          </p>
        </div>
      )}

      {/* ── Race Predictions ── */}
      <div className="bg-card rounded-2xl border p-4">
        <h2 className="text-muted-foreground mb-1 text-xs font-semibold uppercase tracking-wider">
          Race Predictions
        </h2>
        {racePredictions.isLoading ? (
          <div className="space-y-3 pt-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-muted h-10 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : racePredictions.data ? (
          <>
            <p className="text-muted-foreground mb-3 text-xs">
              Based on VO2max:{" "}
              <span className="font-semibold text-blue-400">
                {racePredictions.data[0]?.vo2maxUsed.toFixed(1)}
              </span>
            </p>
            <div className="space-y-2">
              {racePredictions.data.map((pred) => (
                <div
                  key={pred.distance}
                  className="flex items-center justify-between rounded-xl bg-zinc-800/60 px-4 py-3"
                >
                  <div>
                    <p className="font-semibold">
                      {DISTANCE_LABELS[pred.distance] ?? pred.distance}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {pacePerKm(pred.predictedSeconds, pred.distanceMeters)}
                    </p>
                  </div>
                  <p className="text-lg font-bold tabular-nums">
                    {pred.predictedFormatted}
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-muted-foreground py-4 text-center text-sm">
            No race predictions available. Run data needed.
          </p>
        )}
      </div>

      {/* ── Training Status ── */}
      <div className="bg-card rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Training Status
          </h2>
          {trainingStatus.data ? (
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold capitalize",
                STATUS_COLORS[trainingStatus.data.status] ??
                  "bg-muted text-muted-foreground",
              )}
            >
              {trainingStatus.data.status}
            </span>
          ) : trainingStatus.isLoading ? (
            <div className="bg-muted h-6 w-20 animate-pulse rounded-full" />
          ) : null}
        </div>
        {trainingStatus.isLoading ? (
          <div className="mt-3 space-y-2">
            <div className="bg-muted h-4 w-full animate-pulse rounded" />
            <div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
          </div>
        ) : trainingStatus.data ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm">{trainingStatus.data.explanation}</p>
            {trainingStatus.data.recommendation && (
              <p className="text-muted-foreground text-xs">
                💡 {trainingStatus.data.recommendation}
              </p>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">
            Not enough training data to determine status.
          </p>
        )}
      </div>

      <BottomNav />
    </main>
  );
}
