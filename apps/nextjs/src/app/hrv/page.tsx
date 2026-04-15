"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
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

const STATUS_CONFIG: Record<
  string,
  { icon: string; label: string; cls: string; description: string }
> = {
  recovered: {
    icon: "✅",
    label: "Recovered",
    cls: "bg-green-500/20 text-green-400 border-green-500/30",
    description: "HRV is above baseline — your body is well recovered.",
  },
  recovering: {
    icon: "🔄",
    label: "Recovering",
    cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    description: "HRV is near baseline — recovery is progressing normally.",
  },
  strained: {
    icon: "⚠️",
    label: "Strained",
    cls: "bg-red-500/20 text-red-400 border-red-500/30",
    description:
      "HRV is below baseline or highly variable — consider rest or easy training.",
  },
  insufficient_data: {
    icon: "📊",
    label: "Insufficient Data",
    cls: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    description: "Need more HRV data to determine recovery status.",
  },
};

const RANGE_OPTIONS = [
  { label: "30d", days: 30 },
  { label: "60d", days: 60 },
  { label: "90d", days: 90 },
  { label: "180d", days: 180 },
  { label: "1y", days: 365 },
];

function fmtDateShort(d: string): string {
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ─────────────── page ─────────────── */

export default function HrvPage() {
  const trpc = useTRPC();
  const [days, setDays] = useState(90);

  const { data, isLoading } = useQuery(
    trpc.hrv.getAnalysis.queryOptions({ days }),
  );

  const statusConfig = data?.status
    ? STATUS_CONFIG[data.status]
    : STATUS_CONFIG.insufficient_data;

  // Chart data: merge daily, rolling7d, rolling14d into one series
  const chartData = useMemo(() => {
    if (!data?.daily.length) return [];

    const map = new Map<
      string,
      {
        date: string;
        label: string;
        daily?: number;
        rolling7d?: number;
        rolling14d?: number;
      }
    >();

    for (const d of data.daily) {
      map.set(d.date, {
        date: d.date,
        label: fmtDateShort(d.date),
        daily: d.value,
      });
    }
    for (const d of data.rolling7d) {
      const existing = map.get(d.date);
      if (existing) existing.rolling7d = d.value;
    }
    for (const d of data.rolling14d) {
      const existing = map.get(d.date);
      if (existing) existing.rolling14d = d.value;
    }

    return Array.from(map.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }, [data]);

  // CV% over time: compute rolling 7-day CV for each point
  const cvData = useMemo(() => {
    if (!data?.daily || data.daily.length < 7) return [];
    const result: { date: string; label: string; cv: number }[] = [];
    for (let i = 6; i < data.daily.length; i++) {
      const window = data.daily.slice(i - 6, i + 1);
      const mean = window.reduce((s, d) => s + d.value, 0) / window.length;
      const std = Math.sqrt(
        window.reduce((s, d) => s + (d.value - mean) ** 2, 0) / window.length,
      );
      const cv = Math.round((std / mean) * 1000) / 10;
      result.push({
        date: data.daily[i]!.date,
        label: fmtDateShort(data.daily[i]!.date),
        cv,
      });
    }
    return result;
  }, [data]);

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pt-6 pb-24">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">HRV Analysis</h1>
          <p className="text-muted-foreground text-sm">
            Heart Rate Variability &amp; Recovery
          </p>
        </div>
        {statusConfig && data?.status !== "insufficient_data" && (
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold",
              statusConfig.cls,
            )}
          >
            {statusConfig.icon} {statusConfig.label}
          </span>
        )}
      </div>

      {/* ── Recovery Status Card ── */}
      {isLoading ? (
        <div className="bg-card animate-pulse rounded-2xl border p-6">
          <div className="bg-muted mx-auto h-16 w-24 rounded" />
          <div className="bg-muted mx-auto mt-3 h-4 w-48 rounded" />
        </div>
      ) : data?.summary ? (
        <div
          className={cn(
            "rounded-2xl border p-6 text-center",
            statusConfig?.cls.replace(/text-\S+/, ""),
            "bg-card",
          )}
        >
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Current HRV (RMSSD)
          </p>
          <p
            className={cn(
              "mt-1 text-5xl font-bold",
              data.status === "recovered"
                ? "text-green-400"
                : data.status === "recovering"
                  ? "text-yellow-400"
                  : data.status === "strained"
                    ? "text-red-400"
                    : "text-zinc-400",
            )}
          >
            {data.summary.current.toFixed(0)}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">ms</p>
          {data.summary.deviationFromBaseline !== null && (
            <p className="mt-2 text-sm">
              <span
                className={cn(
                  "font-semibold",
                  data.summary.deviationFromBaseline >= 0
                    ? "text-green-400"
                    : "text-red-400",
                )}
              >
                {data.summary.deviationFromBaseline >= 0 ? "+" : ""}
                {data.summary.deviationFromBaseline.toFixed(1)}%
              </span>
              <span className="text-muted-foreground"> from baseline</span>
            </p>
          )}
          {statusConfig && (
            <p className="text-muted-foreground mt-2 text-xs">
              {statusConfig.description}
            </p>
          )}
        </div>
      ) : (
        <div className="bg-card rounded-2xl border p-6 text-center">
          <p className="text-muted-foreground text-sm">
            No HRV data available yet. Wear your Garmin device while sleeping to
            collect HRV measurements.
          </p>
        </div>
      )}

      {/* ── Quick Stats Row ── */}
      {data?.summary && (
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-card rounded-xl border p-3 text-center">
            <p className="text-muted-foreground text-[10px] font-medium uppercase">
              Current
            </p>
            <p className="mt-1 text-lg font-bold">
              {data.summary.current.toFixed(0)}
            </p>
          </div>
          <div className="bg-card rounded-xl border p-3 text-center">
            <p className="text-muted-foreground text-[10px] font-medium uppercase">
              7d Avg
            </p>
            <p className="mt-1 text-lg font-bold">
              {data.summary.avg7d.toFixed(0)}
            </p>
          </div>
          <div className="bg-card rounded-xl border p-3 text-center">
            <p className="text-muted-foreground text-[10px] font-medium uppercase">
              Baseline
            </p>
            <p className="mt-1 text-lg font-bold">
              {data.summary.baseline?.toFixed(0) ?? "—"}
            </p>
          </div>
          <div className="bg-card rounded-xl border p-3 text-center">
            <p className="text-muted-foreground text-[10px] font-medium uppercase">
              CV%
            </p>
            <p
              className={cn(
                "mt-1 text-lg font-bold",
                data.summary.cv > 15
                  ? "text-red-400"
                  : data.summary.cv > 10
                    ? "text-yellow-400"
                    : "text-green-400",
              )}
            >
              {data.summary.cv.toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      {/* ── Date Range Selector ── */}
      <div className="flex justify-center gap-2">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.days}
            onClick={() => setDays(opt.days)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              days === opt.days
                ? "bg-blue-500 text-white"
                : "bg-card text-muted-foreground hover:text-foreground border",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── Main HRV Chart ── */}
      {isLoading ? (
        <div className="bg-card animate-pulse rounded-2xl border p-4">
          <div className="bg-muted h-[260px] rounded" />
        </div>
      ) : chartData.length > 0 ? (
        <div className="bg-card rounded-2xl border p-4">
          <SectionHeader
            title={`HRV Trend — ${data?.summary?.daysWithData ?? 0} readings`}
            info="Heart Rate Variability (RMSSD) measured by your Garmin device during sleep. Higher HRV generally indicates better recovery and parasympathetic (rest-and-digest) nervous system activity. The 7-day rolling average smooths daily fluctuations, while the 14-day baseline represents your personal norm. Citation: Shaffer &amp; Ginsberg (2017). An Overview of HRV Metrics and Norms. Frontiers in Public Health."
            className="mb-3"
          />
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart
              data={chartData}
              margin={{ top: 5, right: 5, left: -10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="hrvFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="label"
                tick={{ fill: "#888", fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "#888", fontSize: 10 }}
                width={36}
                domain={["dataMin - 5", "dataMax + 5"]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #333",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              {data?.baseline && (
                <ReferenceLine
                  y={data.baseline}
                  stroke="#6366f1"
                  strokeDasharray="6 3"
                  strokeWidth={1.5}
                  label={{
                    value: `Baseline ${data.baseline.toFixed(0)}`,
                    position: "insideTopRight",
                    fill: "#6366f1",
                    fontSize: 10,
                  }}
                />
              )}
              <Area
                type="monotone"
                dataKey="daily"
                stroke="#22c55e"
                fill="url(#hrvFill)"
                strokeWidth={1}
                name="Daily HRV"
                dot={{ fill: "#22c55e", r: 2 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="rolling7d"
                stroke="#3b82f6"
                strokeWidth={2.5}
                dot={false}
                name="7d Average"
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="rolling14d"
                stroke="#6366f1"
                strokeWidth={1.5}
                strokeDasharray="6 3"
                dot={false}
                name="14d Baseline"
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {/* ── CV% Trend Chart ── */}
      {cvData.length > 0 && (
        <div className="bg-card rounded-2xl border p-4">
          <SectionHeader
            title="HRV Variability (CV%)"
            info="Coefficient of Variation (CV%) measures how consistent your HRV is over a rolling 7-day window. CV% = standard deviation / mean × 100. Below 10% indicates stable, consistent recovery. 10-15% is moderate. Above 15% suggests high stress or inconsistent recovery patterns. Citation: Plews et al. (2013). Training Adaptation and Heart Rate Variability in Elite Endurance Athletes. Int J Sports Physiol Perform."
            className="mb-3"
          />
          <ResponsiveContainer width="100%" height={140}>
            <ComposedChart
              data={cvData}
              margin={{ top: 5, right: 5, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="label"
                tick={{ fill: "#888", fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "#888", fontSize: 10 }}
                width={36}
                domain={[0, "dataMax + 5"]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #333",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number) => [`${value.toFixed(1)}%`, "CV%"]}
              />
              <ReferenceLine
                y={10}
                stroke="#22c55e"
                strokeDasharray="4 2"
                strokeWidth={1}
              />
              <ReferenceLine
                y={15}
                stroke="#ef4444"
                strokeDasharray="4 2"
                strokeWidth={1}
              />
              <Line
                type="monotone"
                dataKey="cv"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                name="CV%"
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-2 flex justify-center gap-4 text-[10px]">
            <span className="text-green-400">● &lt;10% Stable</span>
            <span className="text-yellow-400">● 10–15% Moderate</span>
            <span className="text-red-400">● &gt;15% High</span>
          </div>
        </div>
      )}

      {/* ── Range Summary ── */}
      {data?.summary && (
        <div className="bg-card rounded-2xl border p-4">
          <SectionHeader
            title="Period Summary"
            info="Summary statistics for the selected date range. Min/Max show the full range of your HRV values. Days with data indicates measurement consistency — aim for daily readings for the most reliable analysis."
            className="mb-3"
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-muted-foreground text-[10px] font-medium uppercase">
                Min
              </p>
              <p className="text-lg font-bold">
                {data.summary.min.toFixed(0)}{" "}
                <span className="text-muted-foreground text-xs">ms</span>
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-muted-foreground text-[10px] font-medium uppercase">
                Max
              </p>
              <p className="text-lg font-bold">
                {data.summary.max.toFixed(0)}{" "}
                <span className="text-muted-foreground text-xs">ms</span>
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-muted-foreground text-[10px] font-medium uppercase">
                Days with Data
              </p>
              <p className="text-lg font-bold">{data.summary.daysWithData}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-muted-foreground text-[10px] font-medium uppercase">
                Coverage
              </p>
              <p className="text-lg font-bold">
                {Math.round((data.summary.daysWithData / days) * 100)}%
              </p>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </main>
  );
}
