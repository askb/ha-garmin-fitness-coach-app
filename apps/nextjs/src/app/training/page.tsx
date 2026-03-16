"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useTRPC } from "~/trpc/react";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@acme/ui";
import { BottomNav } from "../_components/bottom-nav";

/* ─────────────── constants ─────────────── */

const STATUS_COLORS: Record<string, string> = {
  productive: "bg-green-500/20 text-green-400",
  maintaining: "bg-yellow-500/20 text-yellow-400",
  detraining: "bg-red-500/20 text-red-400",
  overreaching: "bg-orange-500/20 text-orange-400",
  peaking: "bg-blue-500/20 text-blue-400",
  recovery: "bg-purple-500/20 text-purple-400",
  unproductive: "bg-red-500/20 text-red-400",
};

const LOAD_FOCUS_COLORS: Record<string, string> = {
  aerobic: "#3b82f6",
  anaerobic: "#ef4444",
  mixed: "#a855f7",
};

/* ─────────────── page ─────────────── */

export default function TrainingLoadPage() {
  const trpc = useTRPC();

  const loads = useQuery(trpc.analytics.getTrainingLoads.queryOptions());
  const status = useQuery(trpc.analytics.getTrainingStatus.queryOptions());
  const recovery = useQuery(trpc.analytics.getRecoveryTime.queryOptions());
  const strainChart = useQuery(
    trpc.trends.getChart.queryOptions({ metric: "strain", days: 42 }),
  );
  const recentStrain = useQuery(
    trpc.trends.getChart.queryOptions({ metric: "strain", days: 14 }),
  );

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pb-24 pt-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Training Load</h1>
        {status.data ? (
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold capitalize",
              STATUS_COLORS[status.data.status] ??
                "bg-muted text-muted-foreground",
            )}
          >
            {status.data.status}
          </span>
        ) : status.isLoading ? (
          <div className="bg-muted h-6 w-20 animate-pulse rounded-full" />
        ) : null}
      </div>

      {status.data && (
        <p className="text-muted-foreground text-sm">
          {status.data.explanation}
        </p>
      )}

      {/* ── Strain Trend (Area Chart) ── */}
      <div className="bg-card rounded-2xl border p-4">
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
          Strain — 42 Day Trend
        </h2>
        {strainChart.isLoading ? (
          <div className="bg-muted h-48 animate-pulse rounded-lg" />
        ) : strainChart.data && strainChart.data.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart
              data={strainChart.data.map((d) => ({
                date: d.date.slice(5),
                value: d.value ?? 0,
              }))}
            >
              <defs>
                <linearGradient id="strainFill" x1="0" y1="0" x2="0" y2="1">
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
              <YAxis tick={{ fill: "#888", fontSize: 10 }} width={32} />
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
                fill="url(#strainFill)"
                strokeWidth={2}
                name="Strain"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No strain data yet
          </p>
        )}
      </div>

      {/* ── Key Metric Cards ── */}
      {loads.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-card animate-pulse rounded-xl border p-4"
            >
              <div className="bg-muted mx-auto h-8 w-14 rounded" />
              <div className="bg-muted mx-auto mt-2 h-3 w-20 rounded" />
            </div>
          ))}
        </div>
      ) : loads.data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* CTL */}
          <div className="bg-card rounded-xl border p-4 text-center">
            <p className="text-2xl font-bold text-blue-500">
              {loads.data.ctl.toFixed(1)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              CTL — Fitness
            </p>
            <p className="text-muted-foreground mt-0.5 text-[10px]">
              42-day chronic load
            </p>
          </div>

          {/* ATL */}
          <div className="bg-card rounded-xl border p-4 text-center">
            <p className="text-2xl font-bold text-red-500">
              {loads.data.atl.toFixed(1)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              ATL — Fatigue
            </p>
            <p className="text-muted-foreground mt-0.5 text-[10px]">
              7-day acute load
            </p>
          </div>

          {/* TSB */}
          <div className="bg-card rounded-xl border p-4 text-center">
            <p
              className={cn(
                "text-2xl font-bold",
                loads.data.tsb >= 0 ? "text-green-500" : "text-red-500",
              )}
            >
              {loads.data.tsb >= 0 ? "+" : ""}
              {loads.data.tsb.toFixed(1)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">TSB — Form</p>
            <p className="text-muted-foreground mt-0.5 text-[10px]">
              {loads.data.tsb >= 0 ? "Fresh" : "Fatigued"}
            </p>
          </div>

          {/* Ramp Rate */}
          <div className="bg-card rounded-xl border p-4 text-center">
            <p
              className={cn(
                "text-2xl font-bold",
                loads.data.rampRate > 8
                  ? "text-orange-500"
                  : "text-foreground",
              )}
            >
              {loads.data.rampRate.toFixed(1)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Ramp Rate
            </p>
            <p className="text-muted-foreground mt-0.5 text-[10px]">
              {loads.data.rampRate > 8 ? "⚠ High — injury risk" : "pts/week"}
            </p>
          </div>
        </div>
      ) : null}

      {/* ── ACWR Gauge ── */}
      <div className="bg-card rounded-2xl border p-4">
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
          Acute:Chronic Workload Ratio
        </h2>
        {loads.isLoading ? (
          <div className="bg-muted h-12 animate-pulse rounded-lg" />
        ) : loads.data ? (
          <ACWRGauge value={loads.data.acwr} />
        ) : (
          <p className="text-muted-foreground py-4 text-center text-sm">
            No data yet
          </p>
        )}
      </div>

      {/* ── Load Focus ── */}
      <div className="bg-card rounded-2xl border p-4">
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
          Load Focus
        </h2>
        {loads.isLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="bg-muted h-28 w-28 animate-pulse rounded-full" />
          </div>
        ) : loads.data ? (
          <LoadFocusChart focus={loads.data.loadFocus} />
        ) : (
          <p className="text-muted-foreground py-4 text-center text-sm">
            No data yet
          </p>
        )}
      </div>

      {/* ── Recovery Time ── */}
      <div className="bg-card rounded-2xl border p-4">
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
          Recovery Estimate
        </h2>
        {recovery.isLoading ? (
          <div className="space-y-2">
            <div className="bg-muted mx-auto h-10 w-20 animate-pulse rounded" />
            <div className="bg-muted mx-auto h-3 w-40 animate-pulse rounded" />
          </div>
        ) : recovery.data ? (
          <div className="space-y-3">
            <p className="text-center text-3xl font-bold">
              {recovery.data.hoursUntilRecovered}
              <span className="text-muted-foreground ml-1 text-base font-normal">
                hours
              </span>
            </p>
            {recovery.data.factors.length > 0 && (
              <ul className="space-y-1">
                {recovery.data.factors.map((f, i) => (
                  <li
                    key={i}
                    className="text-muted-foreground text-center text-xs"
                  >
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground py-4 text-center text-sm">
            No data yet
          </p>
        )}
      </div>

      {/* ── Recent Strain (14-day Bar Chart) ── */}
      <div className="bg-card rounded-2xl border p-4">
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
          Daily Strain — Last 14 Days
        </h2>
        {recentStrain.isLoading ? (
          <div className="bg-muted h-40 animate-pulse rounded-lg" />
        ) : recentStrain.data && recentStrain.data.length > 0 ? (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart
              data={recentStrain.data.map((d) => ({
                date: d.date.slice(5),
                value: d.value ?? 0,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#888", fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fill: "#888", fontSize: 10 }} width={28} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #333",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar
                dataKey="value"
                fill="#6366f1"
                radius={[4, 4, 0, 0]}
                name="Strain"
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No strain data yet
          </p>
        )}
      </div>

      {/* ── Recommendation ── */}
      {status.data?.recommendation && (
        <div className="bg-card rounded-2xl border p-4">
          <h2 className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wider">
            Recommendation
          </h2>
          <p className="text-sm leading-relaxed">
            {status.data.recommendation}
          </p>
        </div>
      )}

      <BottomNav />
    </main>
  );
}

/* ─────────────── ACWR Gauge ─────────────── */

function ACWRGauge({ value }: { value: number }) {
  const clampedValue = Math.min(2, Math.max(0, value));
  const pct = (clampedValue / 2) * 100;

  let label: string;
  let labelColor: string;
  if (value < 0.8) {
    label = "Undertrained";
    labelColor = "text-red-400";
  } else if (value <= 1.3) {
    label = "Sweet Spot";
    labelColor = "text-green-400";
  } else {
    label = "Spike Risk";
    labelColor = "text-red-400";
  }

  return (
    <div className="space-y-2">
      {/* Colored zone bar */}
      <div className="relative h-4 w-full overflow-hidden rounded-full">
        {/* 0–0.8: undertrained (red) */}
        <div
          className="absolute inset-y-0 left-0 bg-red-500/40"
          style={{ width: "40%" }}
        />
        {/* 0.8–1.3: sweet spot (green) */}
        <div
          className="absolute inset-y-0 bg-green-500/50"
          style={{ left: "40%", width: "25%" }}
        />
        {/* 1.3–2.0: spike risk (red) */}
        <div
          className="absolute inset-y-0 right-0 bg-red-500/40"
          style={{ left: "65%" }}
        />
        {/* Marker */}
        <div
          className="absolute top-0 h-full w-1 rounded-full bg-white shadow-md transition-all"
          style={{ left: `${pct}%` }}
        />
      </div>

      {/* Labels */}
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">0</span>
        <span className="text-muted-foreground">0.8</span>
        <span className="text-muted-foreground">1.3</span>
        <span className="text-muted-foreground">2.0</span>
      </div>

      <p className="text-center">
        <span className="text-lg font-bold">{value.toFixed(2)}</span>
        <span className={cn("ml-2 text-sm font-medium", labelColor)}>
          {label}
        </span>
      </p>
    </div>
  );
}

/* ─────────────── Load Focus Chart ─────────────── */

function LoadFocusChart({ focus }: { focus: string }) {
  const focusData = getFocusPieData(focus);

  return (
    <div className="flex flex-col items-center gap-3">
      <ResponsiveContainer width="100%" height={140}>
        <PieChart>
          <Pie
            data={focusData}
            cx="50%"
            cy="50%"
            innerRadius={36}
            outerRadius={56}
            paddingAngle={4}
            dataKey="value"
          >
            {focusData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid #333",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      <span
        className={cn(
          "rounded-full px-3 py-1 text-xs font-semibold capitalize",
          focus === "aerobic"
            ? "bg-blue-500/20 text-blue-400"
            : focus === "anaerobic"
              ? "bg-red-500/20 text-red-400"
              : "bg-purple-500/20 text-purple-400",
        )}
      >
        {focus}
      </span>
    </div>
  );
}

function getFocusPieData(focus: string) {
  switch (focus) {
    case "aerobic":
      return [
        { name: "Aerobic", value: 70, color: LOAD_FOCUS_COLORS.aerobic },
        { name: "Anaerobic", value: 30, color: LOAD_FOCUS_COLORS.anaerobic },
      ];
    case "anaerobic":
      return [
        { name: "Aerobic", value: 30, color: LOAD_FOCUS_COLORS.aerobic },
        { name: "Anaerobic", value: 70, color: LOAD_FOCUS_COLORS.anaerobic },
      ];
    default:
      return [
        { name: "Aerobic", value: 50, color: LOAD_FOCUS_COLORS.aerobic },
        { name: "Anaerobic", value: 50, color: LOAD_FOCUS_COLORS.anaerobic },
      ];
  }
}
