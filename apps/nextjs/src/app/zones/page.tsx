"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";
import { BottomNav } from "../_components/bottom-nav";

/* ─────────────── constants ─────────────── */

type Period = "90d" | "180d" | "365d";
type Sport = "all" | "running" | "walking";

const PERIODS: { value: Period; label: string; days: number }[] = [
  { value: "90d", label: "90 D", days: 90 },
  { value: "180d", label: "180 D", days: 180 },
  { value: "365d", label: "1 Y", days: 365 },
];

const SPORTS: { value: Sport; label: string }[] = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "walking", label: "Walking" },
];

const ZONE_COLORS: Record<string, string> = {
  z1: "#94a3b8",
  z2: "#22c55e",
  z3: "#eab308",
  z4: "#f97316",
  z5: "#ef4444",
};

const ZONE_LABELS: Record<string, string> = {
  z1: "Zone 1 — Recovery",
  z2: "Zone 2 — Aerobic",
  z3: "Zone 3 — Tempo",
  z4: "Zone 4 — Threshold",
  z5: "Zone 5 — VO2max",
};

const SPORT_COLORS: Record<string, string> = {
  running: "#3b82f6",
  walking: "#22c55e",
  strength: "#a855f7",
  yoga: "#ec4899",
  tennis: "#f59e0b",
  other: "#6b7280",
};

const TOOLTIP_STYLE = {
  backgroundColor: "#18181b",
  border: "1px solid #333",
  borderRadius: 8,
  fontSize: 12,
};

/* ─────────────── helpers ─────────────── */

function formatWeek(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function linearRegression(points: { x: number; y: number }[]) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0 };
  let sx = 0,
    sy = 0,
    sxy = 0,
    sxx = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
    sxy += p.x * p.y;
    sxx += p.x * p.x;
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

function heatColor(minutes: number): string {
  if (minutes === 0) return "bg-zinc-800";
  if (minutes < 30) return "bg-green-900";
  if (minutes < 60) return "bg-green-700";
  if (minutes < 90) return "bg-green-600";
  return "bg-green-400";
}

function piLabel(pi: number): { text: string; color: string } {
  if (pi >= 2.0)
    return { text: "Well Polarized ✓", color: "text-green-400" };
  if (pi >= 1.5)
    return { text: "Pyramidal — OK", color: "text-yellow-400" };
  return { text: "Threshold-Heavy — Add Easy Days", color: "text-red-400" };
}

/* ─────────────── skeleton ─────────────── */

function ChartSkeleton({ h = 300 }: { h?: number }) {
  return (
    <div
      className="animate-pulse rounded-lg bg-zinc-800"
      style={{ height: h }}
    />
  );
}

function CardSkeleton() {
  return (
    <div className="animate-pulse space-y-2 rounded-xl bg-zinc-800 p-4">
      <div className="mx-auto h-5 w-24 rounded bg-zinc-700" />
      <div className="mx-auto h-3 w-40 rounded bg-zinc-700" />
    </div>
  );
}

/* ─────────────── page ─────────────── */

export default function ZoneAnalysisPage() {
  const [period, setPeriod] = useState<Period>("365d");
  const [sport, setSport] = useState<Sport>("all");
  const periodConfig = PERIODS.find((p) => p.value === period);
  const days = periodConfig?.days ?? 365;
  const sportType = sport === "all" ? undefined : sport;

  const trpc = useTRPC();

  /* ── queries ── */
  const weeklyZones = useQuery(
    trpc.zones.getWeeklyZoneDistribution.queryOptions({ sportType, days }),
  );
  const polarization = useQuery(
    trpc.zones.getPolarizationIndex.queryOptions({ days }),
  );
  const zoneTrends = useQuery(
    trpc.zones.getZoneTrends.queryOptions({ sportType, days }),
  );
  const efficiency = useQuery(
    trpc.zones.getEfficiencyTrend.queryOptions({
      sportType: sportType ?? "running",
      days,
    }),
  );
  const calendar = useQuery(
    trpc.zones.getActivityCalendar.queryOptions({ days }),
  );
  const volume = useQuery(
    trpc.zones.getVolumeByWeek.queryOptions({ days }),
  );

  /* ── derived insights ── */
  const insights = useMemo(() => {
    const items: { icon: string; text: string; color: string }[] = [];

    if (zoneTrends.data && zoneTrends.data.length >= 2) {
      const first = zoneTrends.data[0];
      const last = zoneTrends.data[zoneTrends.data.length - 1];
      if (first && last) {
        const firstZ2 = first.z2Pct;
        const lastZ2 = last.z2Pct;
        if (Math.abs(lastZ2 - firstZ2) >= 2) {
          items.push({
            icon: lastZ2 > firstZ2 ? "📈" : "📉",
            text: `Zone 2 time ${lastZ2 > firstZ2 ? "increased" : "decreased"} from ${firstZ2.toFixed(0)}% to ${lastZ2.toFixed(0)}% over the period`,
            color:
              lastZ2 > firstZ2
                ? "border-green-500/40 bg-green-500/10"
                : "border-yellow-500/40 bg-yellow-500/10",
          });
        }
      }
    }

    if (polarization.data && polarization.data.length > 0) {
      const latest = polarization.data[polarization.data.length - 1];
      if (latest) {
        const pi = latest.polarizationIndex;
        const info = piLabel(pi);
        items.push({
          icon: "🎯",
          text: `Polarization index is ${pi.toFixed(2)} — ${info.text}`,
          color:
            pi >= 2.0
              ? "border-green-500/40 bg-green-500/10"
              : pi >= 1.5
                ? "border-yellow-500/40 bg-yellow-500/10"
                : "border-red-500/40 bg-red-500/10",
        });
      }
    }

    if (efficiency.data && efficiency.data.length >= 2) {
      const first = efficiency.data[0];
      const last = efficiency.data[efficiency.data.length - 1];
      if (first && last) {
        const firstEff = first.efficiencyIndex;
        const lastEff = last.efficiencyIndex;
        if (firstEff > 0) {
          const pctChange = ((lastEff - firstEff) / firstEff) * 100;
          items.push({
            icon: pctChange >= 0 ? "⚡" : "🔻",
            text: `Efficiency ${pctChange >= 0 ? "improved" : "declined"} by ${Math.abs(pctChange).toFixed(1)}% — ${pctChange >= 0 ? "you're getting faster at the same HR" : "review recovery & easy volume"}`,
            color:
              pctChange >= 0
                ? "border-blue-500/40 bg-blue-500/10"
                : "border-red-500/40 bg-red-500/10",
          });
        }
      }
    }

    if (calendar.data && calendar.data.length > 0) {
      const byWeek = new Map<
        string,
        { count: number; minutes: number; weekLabel: string }
      >();
      for (const d of calendar.data) {
        const date = new Date(d.date + "T00:00:00");
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const key = weekStart.toISOString().slice(0, 10);
        const existing = byWeek.get(key) ?? {
          count: 0,
          minutes: 0,
          weekLabel: key,
        };
        existing.count += 1;
        existing.minutes += d.totalMinutes;
        byWeek.set(key, existing);
      }
      let best = { count: 0, minutes: 0, weekLabel: "" };
      for (const w of byWeek.values()) {
        if (w.count > best.count || (w.count === best.count && w.minutes > best.minutes)) {
          best = w;
        }
      }
      if (best.count > 0) {
        items.push({
          icon: "🏆",
          text: `Most consistent week: ${formatWeek(best.weekLabel)} (${best.count} activities, ${best.minutes.toFixed(0)} min)`,
          color: "border-purple-500/40 bg-purple-500/10",
        });
      }
    }

    return items;
  }, [zoneTrends.data, polarization.data, efficiency.data, calendar.data]);

  /* ── efficiency trend line ── */
  const efficiencyTrendLine = useMemo(() => {
    if (!efficiency.data || efficiency.data.length < 2) return null;
    const points = efficiency.data.map((d, i) => ({
      x: i,
      y: d.efficiencyIndex,
    }));
    const { slope, intercept } = linearRegression(points);
    const first = { x: 0, y: intercept };
    const last = {
      x: points.length - 1,
      y: slope * (points.length - 1) + intercept,
    };
    const pctImprovement =
      first.y > 0 ? ((last.y - first.y) / first.y) * 100 : 0;
    return { first, last, slope, pctImprovement };
  }, [efficiency.data]);

  const allLoading =
    weeklyZones.isLoading &&
    polarization.isLoading &&
    zoneTrends.isLoading &&
    efficiency.isLoading &&
    calendar.isLoading &&
    volume.isLoading;

  const allEmpty =
    !weeklyZones.isLoading &&
    !polarization.isLoading &&
    !zoneTrends.isLoading &&
    (!weeklyZones.data || weeklyZones.data.length === 0) &&
    (!polarization.data || polarization.data.length === 0) &&
    (!zoneTrends.data || zoneTrends.data.length === 0);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 pb-24 pt-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold">Zone Analysis</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          HR zone distribution, polarization tracking, and efficiency trends
        </p>
      </div>

      {/* ── Period & Sport selectors ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-zinc-800 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                period === p.value
                  ? "bg-zinc-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg bg-zinc-800 p-1">
          {SPORTS.map((s) => (
            <button
              key={s.value}
              onClick={() => setSport(s.value)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                sport === s.value
                  ? "bg-zinc-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Global no-data ── */}
      {allEmpty && !allLoading && (
        <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-8 text-center">
          <p className="text-lg font-medium text-zinc-300">
            No zone data available
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            Record activities with a heart rate monitor to see zone analysis.
            Garmin, Apple Watch, and Polar devices all provide HR zone data.
          </p>
        </div>
      )}

      {/* ═══════════ Section 1: Weekly Zone Distribution ═══════════ */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
          Weekly Time in Zones
        </h2>
        {weeklyZones.isLoading ? (
          <ChartSkeleton />
        ) : weeklyZones.data && weeklyZones.data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={weeklyZones.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="week"
                tickFormatter={formatWeek}
                tick={{ fill: "#888", fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "#888", fontSize: 10 }}
                width={40}
                label={{
                  value: "min",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#666",
                  fontSize: 10,
                }}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={(label: unknown) =>
                  typeof label === "string" ? formatWeek(label) : String(label)
                }
                formatter={(value: unknown, name: unknown) => [
                  `${typeof value === "number" ? value.toFixed(0) : String(value)} min`,
                  typeof name === "string"
                    ? (ZONE_LABELS[name] ?? name)
                    : String(name),
                ]}
              />
              <Legend
                formatter={(value: unknown) =>
                  typeof value === "string"
                    ? (ZONE_LABELS[value] ?? value)
                    : String(value)
                }
                wrapperStyle={{ fontSize: 11 }}
              />
              {(["z1", "z2", "z3", "z4", "z5"] as const).map((z) => (
                <Bar
                  key={z}
                  dataKey={z}
                  stackId="zones"
                  fill={ZONE_COLORS[z]}
                  name={z}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No weekly zone data available
          </p>
        )}
      </div>

      {/* ═══════════ Section 2: Polarization Index ═══════════ */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-muted-foreground mb-1 text-xs font-semibold uppercase tracking-wider">
          Training Polarization (Seiler 80/20 Model)
        </h2>
        <p className="text-muted-foreground mb-3 text-[11px]">
          PI &gt; 2.0 = well polarized · 1.5–2.0 = pyramidal · &lt; 1.5 =
          threshold-heavy
        </p>
        {polarization.isLoading ? (
          <ChartSkeleton />
        ) : polarization.data && polarization.data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={polarization.data}>
              <defs>
                <linearGradient id="easyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="modGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#eab308" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#eab308" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="hardGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="week"
                tickFormatter={formatWeek}
                tick={{ fill: "#888", fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="pct"
                tick={{ fill: "#888", fontSize: 10 }}
                width={36}
                domain={[0, 100]}
                label={{
                  value: "%",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#666",
                  fontSize: 10,
                }}
              />
              <YAxis
                yAxisId="pi"
                orientation="right"
                tick={{ fill: "#888", fontSize: 10 }}
                width={36}
                domain={[0, 4]}
                label={{
                  value: "PI",
                  angle: 90,
                  position: "insideRight",
                  fill: "#666",
                  fontSize: 10,
                }}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={(label: unknown) =>
                  typeof label === "string" ? formatWeek(label) : String(label)
                }
                formatter={(value: unknown, name: unknown) => {
                  const v =
                    typeof value === "number" ? value.toFixed(1) : String(value);
                  const n = String(name);
                  if (n === "polarizationIndex") return [`${v}`, "PI"];
                  return [`${v}%`, n];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine
                yAxisId="pi"
                y={2.0}
                stroke="#22c55e"
                strokeDasharray="6 3"
                label={{
                  value: "PI = 2.0",
                  fill: "#22c55e",
                  fontSize: 10,
                  position: "right",
                }}
              />
              <Area
                yAxisId="pct"
                type="monotone"
                dataKey="easyPct"
                stackId="pct"
                stroke="#22c55e"
                fill="url(#easyGrad)"
                name="Easy %"
              />
              <Area
                yAxisId="pct"
                type="monotone"
                dataKey="moderatePct"
                stackId="pct"
                stroke="#eab308"
                fill="url(#modGrad)"
                name="Moderate %"
              />
              <Area
                yAxisId="pct"
                type="monotone"
                dataKey="hardPct"
                stackId="pct"
                stroke="#ef4444"
                fill="url(#hardGrad)"
                name="Hard %"
              />
              <Line
                yAxisId="pi"
                type="monotone"
                dataKey="polarizationIndex"
                stroke="#ffffff"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                name="polarizationIndex"
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No polarization data available
          </p>
        )}
      </div>

      {/* ═══════════ Section 3: Monthly Zone Trend ═══════════ */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
          Monthly Zone Distribution Shift
        </h2>
        {zoneTrends.isLoading ? (
          <ChartSkeleton />
        ) : zoneTrends.data && zoneTrends.data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={zoneTrends.data}>
              <defs>
                {(["z1", "z2", "z3", "z4", "z5"] as const).map((z) => (
                  <linearGradient
                    key={z}
                    id={`zt-${z}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={ZONE_COLORS[z]}
                      stopOpacity={0.7}
                    />
                    <stop
                      offset="95%"
                      stopColor={ZONE_COLORS[z]}
                      stopOpacity={0.2}
                    />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="month"
                tick={{ fill: "#888", fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "#888", fontSize: 10 }}
                width={36}
                domain={[0, 100]}
                label={{
                  value: "%",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#666",
                  fontSize: 10,
                }}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value: unknown, name: unknown) => [
                  `${typeof value === "number" ? value.toFixed(1) : String(value)}%`,
                  typeof name === "string"
                    ? (ZONE_LABELS[name.replace("Pct", "")] ?? name)
                    : String(name),
                ]}
              />
              <Legend
                formatter={(value: unknown) => {
                  const v = String(value);
                  return ZONE_LABELS[v.replace("Pct", "")] ?? v;
                }}
                wrapperStyle={{ fontSize: 11 }}
              />
              {(
                ["z1Pct", "z2Pct", "z3Pct", "z4Pct", "z5Pct"] as const
              ).map((key) => {
                const z = key.replace("Pct", "");
                return (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stackId="zones"
                    stroke={ZONE_COLORS[z]}
                    fill={`url(#zt-${z})`}
                    name={key}
                  />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No monthly zone trend data available
          </p>
        )}
      </div>

      {/* ═══════════ Section 4: Efficiency Trend ═══════════ */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-muted-foreground mb-1 text-xs font-semibold uppercase tracking-wider">
            Pace / HR Efficiency (higher = fitter)
          </h2>
          {efficiencyTrendLine && (
            <p className="text-muted-foreground mb-3 text-[11px]">
              {efficiencyTrendLine.pctImprovement >= 0 ? "↑" : "↓"}{" "}
              {Math.abs(efficiencyTrendLine.pctImprovement).toFixed(1)}%{" "}
              {efficiencyTrendLine.pctImprovement >= 0
                ? "improvement"
                : "decline"}{" "}
              over this period
            </p>
          )}
          {efficiency.isLoading ? (
            <ChartSkeleton />
          ) : efficiency.data && efficiency.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatWeek}
                  tick={{ fill: "#888", fontSize: 10 }}
                  interval="preserveStartEnd"
                  name="Date"
                />
                <YAxis
                  dataKey="efficiencyIndex"
                  tick={{ fill: "#888", fontSize: 10 }}
                  width={40}
                  name="Efficiency"
                  label={{
                    value: "Efficiency",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#666",
                    fontSize: 10,
                  }}
                />
                <ZAxis range={[40, 40]} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: unknown, name: unknown) => [
                    typeof value === "number" ? value.toFixed(3) : String(value),
                    String(name),
                  ]}
                  labelFormatter={(label: unknown) =>
                    typeof label === "string"
                      ? formatWeek(label)
                      : String(label)
                  }
                />
                <Scatter
                  data={efficiency.data}
                  name="Efficiency"
                >
                  {efficiency.data.map((entry, i) => {
                    const hr = entry.avgHr;
                    const t = Math.min(1, Math.max(0, (hr - 100) / 80));
                    const r = Math.round(59 + t * 180);
                    const g = Math.round(130 - t * 80);
                    const b = Math.round(246 - t * 180);
                    return (
                      <Cell
                        key={i}
                        fill={`rgb(${r},${g},${b})`}
                      />
                    );
                  })}
                </Scatter>
                {/* Trend line rendered as two extra scatter points connected */}
                {efficiencyTrendLine && efficiency.data.length >= 2 && (() => {
                  const firstEntry = efficiency.data[0];
                  const lastEntry = efficiency.data[efficiency.data.length - 1];
                  if (!firstEntry || !lastEntry) return null;
                  return (
                    <Scatter
                      data={[
                        {
                          date: firstEntry.date,
                          efficiencyIndex: efficiencyTrendLine.first.y,
                        },
                        {
                          date: lastEntry.date,
                          efficiencyIndex: efficiencyTrendLine.last.y,
                        },
                      ]}
                      line={{ stroke: "#ffffff", strokeWidth: 2, strokeDasharray: "6 3" }}
                      shape={() => <></>}
                      name="Trend"
                      legendType="line"
                    />
                  );
                })()}
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No efficiency data — record runs or walks with HR to see trends
            </p>
          )}
        </div>

      {/* ═══════════ Section 5: Activity Calendar ═══════════ */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
          Training Consistency
        </h2>
        {calendar.isLoading ? (
          <ChartSkeleton h={140} />
        ) : calendar.data && calendar.data.length > 0 ? (
          <CalendarHeatmap data={calendar.data} />
        ) : (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No activity data available
          </p>
        )}
      </div>

      {/* ═══════════ Section 6: Weekly Volume by Sport ═══════════ */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
          Weekly Training Volume by Sport
        </h2>
        {volume.isLoading ? (
          <ChartSkeleton />
        ) : volume.data && volume.data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={volume.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="week"
                tickFormatter={formatWeek}
                tick={{ fill: "#888", fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "#888", fontSize: 10 }}
                width={40}
                label={{
                  value: "min",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#666",
                  fontSize: 10,
                }}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={(label: unknown) =>
                  typeof label === "string" ? formatWeek(label) : String(label)
                }
                formatter={(value: unknown, name: unknown) => [
                  `${typeof value === "number" ? value.toFixed(0) : String(value)} min`,
                  String(name).charAt(0).toUpperCase() + String(name).slice(1),
                ]}
              />
              <Legend
                formatter={(value: unknown) => {
                  const v = String(value);
                  return v.charAt(0).toUpperCase() + v.slice(1);
                }}
                wrapperStyle={{ fontSize: 11 }}
              />
              {Object.entries(SPORT_COLORS).map(([key, color]) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="sports"
                  fill={color}
                  name={key}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No volume data available
          </p>
        )}
      </div>

      {/* ═══════════ Section 7: Key Insights ═══════════ */}
      {insights.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Key Insights
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {insights.map((item, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-xl border p-4",
                  item.color,
                )}
              >
                <span className="mr-2 text-lg">{item.icon}</span>
                <span className="text-sm leading-relaxed text-zinc-200">
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skeleton insights while loading */}
      {allLoading && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      <BottomNav />
    </main>
  );
}

/* ─────────────── Calendar Heatmap ─────────────── */

interface CalendarDay {
  date: string;
  totalMinutes: number;
  activities: number;
  primarySport: string;
  maxStrain: number;
}

function CalendarHeatmap({ data }: { data: CalendarDay[] }) {
  const dayMap = useMemo(() => {
    const m = new Map<string, CalendarDay>();
    for (const d of data) {
      m.set(d.date, d);
    }
    return m;
  }, [data]);

  const { weeks, monthLabels } = useMemo(() => {
    const dates = data.map((d) => d.date).sort();
    if (dates.length === 0) return { weeks: [], monthLabels: [] };

    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    if (!firstDate || !lastDate) return { weeks: [], monthLabels: [] };

    const startDate = new Date(firstDate + "T00:00:00");
    const endDate = new Date(lastDate + "T00:00:00");

    // Align to Monday
    const dayOfWeek = startDate.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startDate.setDate(startDate.getDate() + mondayOffset);

    const weeks: string[][] = [];
    const monthLabels: { col: number; label: string }[] = [];
    let currentWeek: string[] = [];
    let lastMonth = -1;

    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      const dayIdx = (cursor.getDay() + 6) % 7; // Mon=0
      if (dayIdx === 0 && currentWeek.length > 0) {
        weeks.push(currentWeek);
        currentWeek = [];
      }

      const iso = cursor.toISOString().slice(0, 10);
      currentWeek.push(iso);

      if (cursor.getMonth() !== lastMonth) {
        monthLabels.push({
          col: weeks.length,
          label: cursor.toLocaleDateString("en-US", { month: "short" }),
        });
        lastMonth = cursor.getMonth();
      }

      cursor.setDate(cursor.getDate() + 1);
    }
    if (currentWeek.length > 0) weeks.push(currentWeek);

    return { weeks, monthLabels };
  }, [data]);

  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    day: CalendarDay | null;
    date: string;
  } | null>(null);

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="relative">
      {/* Month labels */}
      <div className="mb-1 flex pl-8" style={{ gap: 0 }}>
        {monthLabels.map((m, i) => (
          <div
            key={i}
            className="text-[10px] text-zinc-500"
            style={{
              position: "absolute",
              left: `${m.col * 14 + 32}px`,
            }}
          >
            {m.label}
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-0.5">
        {/* Day labels */}
        <div className="flex flex-col gap-0.5 pr-1">
          {DAYS.map((d, i) => (
            <div
              key={d}
              className="flex h-[12px] items-center text-[9px] text-zinc-500"
            >
              {i % 2 === 0 ? d : ""}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex gap-0.5 overflow-x-auto">
          {weeks.map((week, wIdx) => (
            <div key={wIdx} className="flex flex-col gap-0.5">
              {Array.from({ length: 7 }, (_, dIdx) => {
                const dateStr = week[dIdx];
                if (!dateStr) {
                  return (
                    <div
                      key={dIdx}
                      className="h-[12px] w-[12px]"
                    />
                  );
                }
                const day = dayMap.get(dateStr);
                const mins = day?.totalMinutes ?? 0;
                return (
                  <div
                    key={dIdx}
                    className={cn(
                      "h-[12px] w-[12px] rounded-[2px] transition-colors",
                      heatColor(mins),
                    )}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({
                        x: rect.left + rect.width / 2,
                        y: rect.top - 4,
                        day: day ?? null,
                        date: dateStr,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-2 flex items-center justify-end gap-1 text-[9px] text-zinc-500">
        <span>Less</span>
        <div className="h-[10px] w-[10px] rounded-[2px] bg-zinc-800" />
        <div className="h-[10px] w-[10px] rounded-[2px] bg-green-900" />
        <div className="h-[10px] w-[10px] rounded-[2px] bg-green-700" />
        <div className="h-[10px] w-[10px] rounded-[2px] bg-green-600" />
        <div className="h-[10px] w-[10px] rounded-[2px] bg-green-400" />
        <span>More</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-lg"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <p className="font-medium text-zinc-200">
            {new Date(tooltip.date + "T00:00:00").toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
          {tooltip.day ? (
            <>
              <p className="text-zinc-400">
                {tooltip.day.totalMinutes.toFixed(0)} min
                {tooltip.day.primarySport ? ` · ${tooltip.day.primarySport}` : ""}
              </p>
              {tooltip.day.maxStrain > 0 && (
                <p className="text-zinc-400">
                  Strain: {tooltip.day.maxStrain.toFixed(1)}
                </p>
              )}
            </>
          ) : (
            <p className="text-zinc-500">No activity</p>
          )}
        </div>
      )}
    </div>
  );
}
