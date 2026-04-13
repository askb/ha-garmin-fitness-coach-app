"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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

import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";
import { BottomNav } from "../_components/bottom-nav";
import { SectionHeader } from "../_components/info-button";

/* ─────────────── constants ─────────────── */

const TREND_BADGE: Record<
  string,
  { icon: string; label: string; cls: string }
> = {
  improving: {
    icon: "↑",
    label: "Improving",
    cls: "bg-green-500/20 text-green-400",
  },
  stable: {
    icon: "→",
    label: "Stable",
    cls: "bg-yellow-500/20 text-yellow-400",
  },
  declining: {
    icon: "↓",
    label: "Declining",
    cls: "bg-red-500/20 text-red-400",
  },
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

/* ── Confidence interval helper ── */
function confidenceInterval(count: number): number {
  if (count > 30) return 3;
  if (count >= 15) return 5;
  return 8;
}

/** Format seconds as MM:SS or H:MM:SS */
function fmtTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.round(secs % 60);
  if (h > 0)
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Apply ± interval to formatted time string */
function fmtWithInterval(secs: number, pct: number): string {
  const delta = secs * (pct / 100);
  return `${fmtTime(secs)} ± ${fmtTime(delta)}`;
}

/**
 * Daniels VDOT pace calculation (simplified).
 * pace_sec_per_km = 1000 / (vo2max * fraction * 0.01 * 3.5 / 0.03)
 * Simplified running economy model.
 */
function vdotPace(vo2max: number, fraction: number): string {
  const vo2 = vo2max * fraction;
  const speed_m_per_min = (vo2 - 3.5) / 0.2; // inverse of VO2 = 3.5 + 0.2*speed (m/min)
  if (speed_m_per_min <= 0) return "—";
  const secPerKm = (1000 / speed_m_per_min) * 60;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
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
  const recentActivities = useQuery(
    trpc.activity.list.queryOptions({ days: 90, sportType: "running" }),
  );
  const trainingLoads = useQuery(
    trpc.analytics.getTrainingLoads.queryOptions(),
  );

  // Latest VO2max value
  const latestVO2max = useMemo(() => {
    if (!vo2max.data?.estimates?.length) return null;
    return vo2max.data.estimates[0]!;
  }, [vo2max.data]);

  const trend = vo2max.data?.trend;
  const trendInfo = trend ? TREND_BADGE[trend.trend] : null;

  // Chart data (chronological order) — used for the combined "best" series
  const chartData = useMemo(() => {
    if (!vo2max.data?.estimates?.length) return [];
    return [...vo2max.data.estimates].reverse().map((e) => ({
      date: fmtDateShort(e.date),
      fullDate: e.date,
      value: e.value,
      sport: e.sport,
      source: e.source,
    }));
  }, [vo2max.data]);

  // Garmin official VO2max data (Firstbeat-based)
  const garminChartData = useMemo(() => {
    if (!vo2max.data?.garminEstimates?.length) return [];
    return [...vo2max.data.garminEstimates].reverse().map((e) => ({
      date: fmtDateShort(e.date),
      fullDate: e.date,
      value: e.value,
    }));
  }, [vo2max.data]);

  // UTH formula estimate data
  const uthChartData = useMemo(() => {
    if (!vo2max.data?.uthEstimates?.length) return [];
    return [...vo2max.data.uthEstimates].reverse().map((e) => ({
      date: fmtDateShort(e.date),
      fullDate: e.date,
      value: e.value,
    }));
  }, [vo2max.data]);

  // Trendline helper: simple linear regression overlay
  function computeTrendline(
    data: { date: string; fullDate: string; value: number }[],
  ) {
    if (data.length < 4) return [];
    const n = data.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = data.reduce((s, d) => s + d.value, 0);
    const sumXY = data.reduce((s, d, i) => s + i * d.value, 0);
    const sumXX = data.reduce((s, _, i) => s + i * i, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return data.map((d, i) => ({
      ...d,
      trendline: Number((intercept + slope * i).toFixed(1)),
    }));
  }

  const garminTrendlineData = useMemo(
    () => computeTrendline(garminChartData),
    [garminChartData],
  );
  const uthTrendlineData = useMemo(
    () => computeTrendline(uthChartData),
    [uthChartData],
  );

  // Fallback trendline for combined chart (used when neither source-specific chart has data)
  const trendlineData = useMemo(() => computeTrendline(chartData), [chartData]);

  const classification = latestVO2max
    ? classifyVO2max(latestVO2max.value)
    : null;

  const topPercent = latestVO2max
    ? percentileEstimate(latestVO2max.value)
    : null;

  /* ── Workout count for confidence ── */
  const workoutCount90d = useMemo(() => {
    return (recentActivities.data ?? []).length;
  }, [recentActivities.data]);

  const ciPct = confidenceInterval(workoutCount90d);

  /* ── Race history comparison ── */
  interface Activity {
    id: string;
    sportType?: string | null;
    durationMinutes?: number | null;
    distanceMeters?: number | null;
    startedAt?: Date | string | null;
  }
  interface RacePred {
    distance: string;
    distanceMeters: number;
    predictedSeconds: number;
    predictedFormatted: string;
    vo2maxUsed: number;
  }

  const RACE_DISTANCES: Record<string, number> = {
    "5K": 5000,
    "10K": 10000,
    half_marathon: 21097,
    marathon: 42195,
  };
  const DISTANCE_LABEL: Record<string, string> = {
    "5K": "5K",
    "10K": "10K",
    half_marathon: "Half Marathon",
    marathon: "Marathon",
  };

  const raceHistory = useMemo(() => {
    const acts = (recentActivities.data ?? []) as Activity[];
    const preds = (racePredictions.data ?? []) as RacePred[];
    return preds.flatMap((pred) => {
      const targetDist = RACE_DISTANCES[pred.distance] ?? pred.distanceMeters;
      const matching = acts.filter(
        (a) =>
          a.distanceMeters != null &&
          Math.abs(a.distanceMeters - targetDist) / targetDist < 0.1 &&
          a.durationMinutes != null,
      );
      return matching.slice(0, 2).map((a) => {
        const actualSecs = (a.durationMinutes ?? 0) * 60;
        const diffSecs = actualSecs - pred.predictedSeconds;
        return {
          distance: DISTANCE_LABEL[pred.distance] ?? pred.distance,
          actual: fmtTime(actualSecs),
          predicted: pred.predictedFormatted,
          diff: diffSecs,
          diffFmt: `${diffSecs >= 0 ? "+" : ""}${fmtTime(Math.abs(diffSecs))}`,
          date: a.startedAt
            ? new Date(a.startedAt as string).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            : "",
        };
      });
    });
  }, [recentActivities.data, racePredictions.data]);

  /* ── Running Shape gauge (0–100) ── */
  const runningShape = useMemo(() => {
    let score = 50;
    // VO2max trend bonus
    if (trend?.trend === "improving") score += 20;
    else if (trend?.trend === "declining") score -= 10;
    // ACWR adjustment
    const acwr = trainingLoads.data?.acwr;
    if (acwr != null) {
      if (acwr < 0.8) score -= 20;
      else if (acwr > 1.5) score -= 10;
      else if (acwr >= 0.8 && acwr <= 1.3) score += 10;
    }
    // Workout volume bonus
    if (workoutCount90d >= 30) score += 20;
    else if (workoutCount90d >= 15) score += 10;
    return Math.min(100, Math.max(0, score));
  }, [trend, trainingLoads.data, workoutCount90d]);

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-6 pb-24">
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
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Current VO2max
          </p>
          <p className="mt-1 text-5xl font-bold text-blue-400">
            {latestVO2max.value.toFixed(1)}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">ml/kg/min</p>
          {classification && (
            <p className="mt-2 text-sm">
              <span
                className={cn(
                  "font-semibold",
                  classificationColor(classification),
                )}
              >
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

      {/* ── Garmin VO2 Max Chart ── */}
      {garminChartData.length > 0 && (
        <div className="bg-card rounded-2xl border p-4">
          <SectionHeader
            title={`Garmin VO2 Max — ${garminChartData.length} readings`}
            info="Official VO2max from your Garmin device, calculated by Firstbeat Analytics using GPS pace and heart rate data during runs. This is the most accurate wearable-based estimate available. Values update after qualifying runs (12+ min, outdoor, with HR). Citation: Firstbeat Technologies. (2014). VO2max Estimation from Wrist-Based Heart Rate and Speed. Firstbeat White Paper."
            className="mb-3"
          />
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={
                garminTrendlineData.length > 0
                  ? garminTrendlineData
                  : garminChartData
              }
              margin={{ top: 5, right: 5, left: -10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="garminFill" x1="0" y1="0" x2="0" y2="1">
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
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                fill="url(#garminFill)"
                strokeWidth={2}
                name="Garmin VO2max"
                dot={{ fill: "#3b82f6", r: 3 }}
              />
              {garminTrendlineData.length > 0 && (
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

      {/* ── Estimated VO2 Max (UTH Formula) Chart ── */}
      {uthChartData.length > 0 && (
        <div className="bg-card rounded-2xl border p-4">
          <SectionHeader
            title={`Estimated VO2 Max (UTH Formula) — ${uthChartData.length} estimates`}
            info="VO2max estimated using the Uth method: VO2max = 15.3 × (HRmax / HRrest). This formula uses only resting and max heart rate, so it can vary significantly day-to-day with resting HR fluctuations. Accuracy is ±5 mL/kg/min — useful as a rough baseline but not as reliable as Garmin's Firstbeat-based value. Citation: Uth N et al. (2004) Eur J Appl Physiol 91:111-115."
            className="mb-3"
          />
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={
                uthTrendlineData.length > 0 ? uthTrendlineData : uthChartData
              }
              margin={{ top: 5, right: 5, left: -10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="uthFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
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
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#f59e0b"
                fill="url(#uthFill)"
                strokeWidth={2}
                name="UTH Estimate"
                dot={{ fill: "#f59e0b", r: 3 }}
              />
              {uthTrendlineData.length > 0 && (
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

      {/* ── Combined VO2max Trend (fallback when no source-specific data) ── */}
      {garminChartData.length === 0 &&
        uthChartData.length === 0 &&
        chartData.length > 0 && (
          <div className="bg-card rounded-2xl border p-4">
            <SectionHeader
              title={`VO2max Trend — ${chartData.length} estimates`}
              info="VO2max = maximum oxygen uptake, gold standard of cardiorespiratory fitness (mL/kg/min). Estimation methods: (1) Running: VO2 = 3.5 + 0.2×speed, VO2max = VO2/%HRR. (2) Uth ratio: 15.3 × maxHR/RHR. Trend uses linear regression. A 3.5 mL/kg/min gain reduces mortality risk ~15%. Citation: ACSM (2021), Uth et al. (2004)."
              className="mb-3"
            />
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
          <SectionHeader
            title="Performance Comparison"
            info="Compares your VO2max against age/sex population percentiles from ACSM normative data. Categories: Superior (top 5%), Excellent (top 20%), Good (top 40%), Fair (top 60%), Poor (bottom 40%). Method: Lookup in ACSM percentile tables by age bracket and sex. Citation: ACSM Guidelines for Exercise Testing (2021)."
            className="mb-2"
          />
          <p className="text-sm">
            Your VO2max of{" "}
            <span className="font-bold text-blue-400">
              {latestVO2max.value.toFixed(1)}
            </span>{" "}
            puts you in the{" "}
            <span className="font-bold text-green-400">top {topPercent}%</span>{" "}
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
        <SectionHeader
          title="Race Predictions"
          info="Estimated race times using simplified VDOT method. Formula: raceVO2 = VO2max × distance factor (5K: 95%, 10K: 90%, Half: 83%, Marathon: 78%). Time = distance / ((raceVO2 - 3.5) / 0.2). Assumes proper taper, pacing, and conditions. Citation: Daniels J (2013) Daniels' Running Formula."
          className="mb-1"
        />
        {racePredictions.isLoading ? (
          <div className="space-y-3 pt-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-muted h-10 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : racePredictions.data && racePredictions.data.length > 0 ? (
          <>
            <p className="text-muted-foreground mb-3 text-xs">
              Based on VO2max:{" "}
              <span className="font-semibold text-blue-400">
                {racePredictions.data[0]?.vo2maxUsed?.toFixed(1) ?? "—"}
              </span>
              <span className="text-muted-foreground ml-2">
                · ±{ciPct}% confidence ({workoutCount90d} workouts/90d)
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
                  <div className="text-right">
                    <p className="text-lg font-bold tabular-nums">
                      {fmtWithInterval(pred.predictedSeconds, ciPct)}
                    </p>
                  </div>
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

      {/* ── Race History Comparison ── */}
      {raceHistory.length > 0 && (
        <div className="bg-card rounded-2xl border p-4">
          <SectionHeader
            title="Race History Comparison"
            info="Actual times from recent running activities matched against predicted times. Positive deviation = slower than predicted. Negative = faster."
            className="mb-3"
          />
          <div className="space-y-2">
            {raceHistory.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl bg-zinc-800/60 px-4 py-2.5"
              >
                <div>
                  <p className="text-sm font-semibold">{r.distance}</p>
                  <p className="text-muted-foreground text-xs">{r.date}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{r.actual}</p>
                  <p
                    className={cn(
                      "text-xs font-medium",
                      r.diff > 0 ? "text-red-400" : "text-green-400",
                    )}
                  >
                    {r.diffFmt} vs predicted {r.predicted}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── VDOT Pace Recommendations ── */}
      {latestVO2max && (
        <div className="bg-card rounded-2xl border p-4">
          <SectionHeader
            title="Training Pace Recommendations"
            info="Daniels VDOT-based pace zones derived from current VO2max. Simplified model: speed (m/min) = (VO2 - 3.5) / 0.2. Easy = 60-65% VO2max, Marathon = 83%, Threshold = 88-92%, Interval = 95-100%. Citation: Daniels J (2013) Daniels' Running Formula."
            className="mb-3"
          />
          <div className="space-y-2">
            {[
              {
                label: "Easy",
                emoji: "🟦",
                fraction: 0.63,
                info: "60-65% VO2max",
              },
              {
                label: "Marathon",
                emoji: "🟩",
                fraction: 0.83,
                info: "83% VO2max",
              },
              {
                label: "Threshold",
                emoji: "🟨",
                fraction: 0.9,
                info: "88-92% VO2max",
              },
              {
                label: "Interval",
                emoji: "🟥",
                fraction: 0.975,
                info: "95-100% VO2max",
              },
            ].map((zone) => (
              <div
                key={zone.label}
                className="flex items-center justify-between rounded-xl bg-zinc-800/60 px-4 py-2.5"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {zone.emoji} {zone.label}
                  </p>
                  <p className="text-muted-foreground text-xs">{zone.info}</p>
                </div>
                <p className="font-bold tabular-nums">
                  {vdotPace(latestVO2max.value, zone.fraction)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Running Shape Gauge ── */}
      {latestVO2max && (
        <div className="bg-card rounded-2xl border p-4">
          <SectionHeader
            title="Running Shape"
            info="Composite score (0–100) based on: VO2max trend (+20 improving, -10 declining), training volume (up to +20), ACWR health (±10-20). Base: 50."
            className="mb-3"
          />
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="bg-secondary/50 relative h-4 flex-1 overflow-hidden rounded-full">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    runningShape >= 75
                      ? "bg-green-500"
                      : runningShape >= 50
                        ? "bg-yellow-500"
                        : "bg-red-500",
                  )}
                  style={{ width: `${runningShape}%` }}
                />
              </div>
              <span className="w-10 text-right font-bold">{runningShape}</span>
            </div>
            <p
              className={cn(
                "text-center text-sm font-semibold",
                runningShape >= 75
                  ? "text-green-400"
                  : runningShape >= 50
                    ? "text-yellow-400"
                    : "text-red-400",
              )}
            >
              {runningShape >= 80
                ? "Peak Shape"
                : runningShape >= 65
                  ? "Good Shape"
                  : runningShape >= 50
                    ? "Building"
                    : "Off-form"}
            </p>
          </div>
        </div>
      )}

      {/* ── Training Status ── */}
      <div className="bg-card rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <SectionHeader
            title="Training Status"
            info="Current training state from load trends + fitness trajectory. Categories: Productive (high load + VO2max improving), Maintaining (balanced), Overreaching (high load + declining), Peaking (reduced volume + stable), Detraining (low load + declining), Recovery (low load + improving). Method: CTL/ATL slopes + VO2max trend. Citation: Meeusen et al. (2013) ECSS Overtraining Consensus."
          />
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
