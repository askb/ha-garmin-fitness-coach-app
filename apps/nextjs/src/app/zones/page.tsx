"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
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

type Period = "90d" | "180d" | "365d";

const PERIODS: { value: Period; label: string; days: number }[] = [
  { value: "90d", label: "90 D", days: 90 },
  { value: "180d", label: "180 D", days: 180 },
  { value: "365d", label: "1 Y", days: 365 },
];

// Title-case a raw Garmin sportType string for display:
//   "strength_training" -> "Strength Training"
//   "lap_swimming"      -> "Lap Swimming"
//   "running"           -> "Running"
function formatSportLabel(sportType: string): string {
  return sportType
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

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

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatWeek(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${MONTHS_SHORT[parseInt(m!, 10) - 1]} ${parseInt(d!, 10)}`;
}

function formatDateStr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${MONTHS_SHORT[parseInt(m!, 10) - 1]} ${parseInt(d!, 10)}, ${y}`;
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

type ChartDatum = Record<string, unknown>;

function numberFrom(row: ChartDatum, ...keys: string[]): number {
  for (const key of keys) {
    const raw = row[key];
    if (raw == null) continue;
    const value = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function stringFrom(row: ChartDatum, ...keys: string[]): string {
  for (const key of keys) {
    const raw = row[key];
    if (raw != null) return String(raw);
  }
  return "";
}

function percentZones(
  row: ChartDatum,
  prefix = "z",
): [number, number, number, number, number] {
  const pctValues = [
    numberFrom(row, `${prefix}1Pct`, "zone1Pct"),
    numberFrom(row, `${prefix}2Pct`, "zone2Pct"),
    numberFrom(row, `${prefix}3Pct`, "zone3Pct"),
    numberFrom(row, `${prefix}4Pct`, "zone4Pct"),
    numberFrom(row, `${prefix}5Pct`, "zone5Pct"),
  ] satisfies [number, number, number, number, number];
  if (pctValues.some((value) => value > 0)) return pctValues;

  const rawValues = [
    numberFrom(row, `${prefix}1`, "zone1"),
    numberFrom(row, `${prefix}2`, "zone2"),
    numberFrom(row, `${prefix}3`, "zone3"),
    numberFrom(row, `${prefix}4`, "zone4"),
    numberFrom(row, `${prefix}5`, "zone5"),
  ] satisfies [number, number, number, number, number];
  const total = rawValues.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return rawValues;
  return rawValues.map((value) => Math.round((value / total) * 1000) / 10) as [
    number,
    number,
    number,
    number,
    number,
  ];
}

function heatColor(minutes: number): string {
  if (minutes === 0) return "bg-zinc-800";
  if (minutes < 30) return "bg-green-900";
  if (minutes < 60) return "bg-green-700";
  if (minutes < 90) return "bg-green-600";
  return "bg-green-400";
}

function piLabel(pi: number): { text: string; color: string } {
  if (pi >= 2.0) return { text: "Well Polarized ✓", color: "text-green-400" };
  if (pi >= 1.5) return { text: "Pyramidal — OK", color: "text-yellow-400" };
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
  // "all" sentinel selects every sportType (no filter applied).
  // Any other value is the raw Garmin sportType string ("running",
  // "tennis", "strength_training", "lap_swimming", …) populated
  // from the listSportTypes query below.
  const [sport, setSport] = useState<string>("all");
  const periodConfig = PERIODS.find((p) => p.value === period);
  const days = periodConfig?.days ?? 365;
  const sportType = sport === "all" ? undefined : sport;

  const trpc = useTRPC();

  // Drive the dropdown from the user's actual activity log over
  // the selected window — sports they've never done don't appear,
  // sports they do (tennis, swimming, hiking, …) do.
  const sportTypes = useQuery(trpc.zones.listSportTypes.queryOptions({ days }));
  const sportOptions = useMemo(() => {
    const fromDb = (sportTypes.data ?? []).map((s) => ({
      value: s.sportType,
      label: `${formatSportLabel(s.sportType)} (${s.count})`,
    }));
    return [{ value: "all", label: "All sports" }, ...fromDb];
  }, [sportTypes.data]);

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
  const volume = useQuery(trpc.zones.getVolumeByWeek.queryOptions({ days }));

  const weeklyZoneChartData = useMemo(
    () =>
      (weeklyZones.data ?? [])
        .map((d) => {
          const row = d as ChartDatum;
          const z1 = numberFrom(row, "z1", "zone1");
          const z2 = numberFrom(row, "z2", "zone2");
          const z3 = numberFrom(row, "z3", "zone3");
          const z4 = numberFrom(row, "z4", "zone4");
          const z5 = numberFrom(row, "z5", "zone5");
          const total = z1 + z2 + z3 + z4 + z5;
          return {
            week: stringFrom(row, "week", "date"),
            z1,
            z2,
            z3,
            z4,
            z5,
            total,
            activities: numberFrom(row, "activities"),
          };
        })
        .filter((d) => d.week && d.total > 0),
    [weeklyZones.data],
  );

  const polarizationChartData = useMemo(
    () =>
      (polarization.data ?? [])
        .map((d) => {
          const row = d as ChartDatum;
          const [easyPct, moderatePct, hardPct] = [
            numberFrom(row, "easyPct"),
            numberFrom(row, "moderatePct"),
            numberFrom(row, "hardPct"),
          ];
          return {
            week: stringFrom(row, "week", "date"),
            easyPct,
            moderatePct,
            hardPct,
            polarizationIndex: numberFrom(row, "polarizationIndex"),
          };
        })
        .filter((d) => d.week && d.easyPct + d.moderatePct + d.hardPct > 0),
    [polarization.data],
  );

  const zoneTrendChartData = useMemo(
    () =>
      (zoneTrends.data ?? [])
        .map((d) => {
          const row = d as ChartDatum;
          const [z1Pct, z2Pct, z3Pct, z4Pct, z5Pct] = percentZones(row);
          return {
            month: stringFrom(row, "month", "date"),
            z1Pct,
            z2Pct,
            z3Pct,
            z4Pct,
            z5Pct,
          };
        })
        .filter(
          (d) => d.month && d.z1Pct + d.z2Pct + d.z3Pct + d.z4Pct + d.z5Pct > 0,
        ),
    [zoneTrends.data],
  );

  const efficiencyChartData = useMemo(
    () =>
      (efficiency.data ?? [])
        .map((d) => {
          const row = d as ChartDatum;
          return {
            date: stringFrom(row, "date", "week"),
            avgHr: numberFrom(row, "avgHr"),
            paceSecPerKm: numberFrom(row, "paceSecPerKm"),
            efficiencyIndex: numberFrom(row, "efficiencyIndex", "value"),
          };
        })
        .filter((d) => d.date && d.efficiencyIndex > 0),
    [efficiency.data],
  );

  const volumeChartData = useMemo(
    () =>
      (volume.data ?? [])
        .map((d) => {
          const row = d as ChartDatum;
          const running = numberFrom(row, "running");
          const walking = numberFrom(row, "walking");
          const strength = numberFrom(row, "strength");
          const yoga = numberFrom(row, "yoga");
          const tennis = numberFrom(row, "tennis");
          const other = numberFrom(row, "other");
          return {
            week: stringFrom(row, "week", "date"),
            running,
            walking,
            strength,
            yoga,
            tennis,
            other,
            total: running + walking + strength + yoga + tennis + other,
          };
        })
        .filter((d) => d.week && d.total > 0),
    [volume.data],
  );

  /* ── derived insights ── */
  const insights = useMemo(() => {
    const items: { icon: string; text: string; color: string }[] = [];

    if (zoneTrendChartData.length >= 2) {
      const first = zoneTrendChartData[0];
      const last = zoneTrendChartData[zoneTrendChartData.length - 1];
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

    if (polarizationChartData.length > 0) {
      const latest = polarizationChartData[polarizationChartData.length - 1];
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

    if (efficiencyChartData.length >= 2) {
      // Use the regression-based percentage change so the AI insight here
      // matches the trend-line percentage shown on the chart (#141). The
      // raw first-vs-last endpoint comparison previously used here is
      // sensitive to the last data point and produced a different number
      // from the same data.
      const points = efficiencyChartData.map((d, i) => ({
        x: i,
        y: d.efficiencyIndex,
      }));
      const { slope, intercept } = linearRegression(points);
      const firstY = intercept;
      const lastY = slope * (points.length - 1) + intercept;
      if (firstY > 0) {
        const pctChange = ((lastY - firstY) / firstY) * 100;
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
        if (
          w.count > best.count ||
          (w.count === best.count && w.minutes > best.minutes)
        ) {
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
  }, [
    zoneTrendChartData,
    polarizationChartData,
    efficiencyChartData,
    calendar.data,
  ]);

  /* ── efficiency trend line ── */
  const efficiencyTrendLine = useMemo(() => {
    if (efficiencyChartData.length < 2) return null;
    const points = efficiencyChartData.map((d, i) => ({
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
  }, [efficiencyChartData]);

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
    weeklyZoneChartData.length === 0 &&
    polarizationChartData.length === 0 &&
    zoneTrendChartData.length === 0;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 pt-6 pb-24">
      {/* ── Header ── */}
      <div>
        <h1 className="pl-12 text-2xl font-bold">Zone Analysis</h1>
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
        <div className="rounded-lg bg-zinc-800 p-1">
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            className={cn(
              "appearance-none rounded-md bg-zinc-700 px-3 py-1 text-xs font-medium text-white",
              "focus:ring-2 focus:ring-zinc-500 focus:outline-none",
            )}
            aria-label="Filter by sport"
          >
            {sportOptions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
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
        <SectionHeader
          title="Weekly Time in Zones"
          info="Shows minutes spent in each heart rate zone per week. Zones are from Garmin's Firstbeat HR zone classification. Zone 1 (Recovery) and Zone 2 (Aerobic) build your base — aim for 80% here. Zone 3 (Tempo) improves lactate threshold. Zones 4-5 boost VO2max. Method: Sum of hrZoneMinutes JSON field per activity, grouped by ISO week."
          className="mb-3"
        />
        {weeklyZones.isLoading ? (
          <ChartSkeleton />
        ) : weeklyZoneChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={weeklyZoneChartData}>
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
                wrapperStyle={{ fontSize: 11, flexWrap: "wrap" }}
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
        <SectionHeader
          title="Training Polarization (Seiler 80/20 Model)"
          info="Measures how well your training follows the 80/20 rule. Formula: PI = ln(1/Σpi²) where pi = fraction of time in each zone bucket (easy/moderate/hard). PI > 2.0 = well polarized, 1.5-2.0 = pyramidal, < 1.5 = threshold-heavy (higher injury risk). Citation: Seiler S, Polarized Training Distribution."
          subtitle="PI > 2.0 = well polarized · 1.5–2.0 = pyramidal · < 1.5 = threshold-heavy"
          className="mb-3"
        />
        {polarization.isLoading ? (
          <ChartSkeleton />
        ) : polarizationChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={polarizationChartData}>
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
                width={48}
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                allowDataOverflow
                tickFormatter={(v: number) => `${v}%`}
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
                    typeof value === "number"
                      ? value.toFixed(1)
                      : String(value);
                  const n = String(name);
                  if (n === "polarizationIndex") return [`${v}`, "PI"];
                  return [`${v}%`, n];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, flexWrap: "wrap" }} />
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
        <SectionHeader
          title="Monthly Zone Distribution Shift"
          info="Tracks zone distribution evolution month-over-month as a stacked area chart showing percentage of time in each zone. A healthy progression shows increasing Zone 2 percentage over time with periodic high-intensity blocks. Method: Monthly aggregation of zone minutes converted to percentages. Citation: Long-term training structure analysis."
          className="mb-3"
        />
        {zoneTrends.isLoading ? (
          <ChartSkeleton />
        ) : zoneTrendChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={zoneTrendChartData}>
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
                width={48}
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                allowDataOverflow
                tickFormatter={(v: number) => `${v}%`}
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
                wrapperStyle={{ fontSize: 11, flexWrap: "wrap" }}
              />
              {(["z1Pct", "z2Pct", "z3Pct", "z4Pct", "z5Pct"] as const).map(
                (key) => {
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
                },
              )}
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
        <SectionHeader
          title="Pace / HR Efficiency (higher = fitter)"
          info="Cardiac efficiency index measures aerobic fitness improvement over time. Formula: Efficiency = (speed in m/s ÷ avgHR) × 1000. Higher values = more ground covered per heartbeat. Trend line uses linear regression (y = mx + b) to show improvement percentage. Citation: Running economy as speed per unit HR cost."
          className="mb-1"
        />
        {efficiencyTrendLine && (
          <p className="text-muted-foreground mb-3 text-[11px]">
            {efficiencyTrendLine.pctImprovement >= 0 ? "+" : ""}
            {efficiencyTrendLine.pctImprovement.toFixed(1)}%{" "}
            {efficiencyTrendLine.pctImprovement >= 0
              ? "improvement"
              : "decline"}{" "}
            over this period
          </p>
        )}
        {efficiency.isLoading ? (
          <ChartSkeleton />
        ) : efficiencyChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={efficiencyChartData}>
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
                width={48}
                name="Efficiency"
                label={{
                  value: "Efficiency Index (m·bpm⁻¹ × 1000)",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#666",
                  fontSize: 10,
                  offset: 0,
                  style: { textAnchor: "middle" },
                }}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value: unknown, name: unknown) => [
                  typeof value === "number" ? value.toFixed(3) : String(value),
                  String(name),
                ]}
                labelFormatter={(label: unknown) =>
                  typeof label === "string" ? formatWeek(label) : String(label)
                }
              />
              <Line
                type="monotone"
                dataKey="efficiencyIndex"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={({ cx, cy, payload }) => {
                  if (cx == null || cy == null) return <></>;
                  const hr = (payload as { avgHr?: number }).avgHr ?? 120;
                  const t = Math.min(1, Math.max(0, (hr - 100) / 80));
                  const r = Math.round(59 + t * 180);
                  const g = Math.round(130 - t * 80);
                  const b = Math.round(246 - t * 180);
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill={`rgb(${r},${g},${b})`}
                    />
                  );
                }}
                name="Efficiency"
              />
              {efficiencyTrendLine && (
                <Line
                  type="linear"
                  dataKey="trendline"
                  data={efficiencyChartData.map((d, i) => ({
                    ...d,
                    trendline:
                      i === 0
                        ? efficiencyTrendLine.first.y
                        : i === efficiencyChartData.length - 1
                          ? efficiencyTrendLine.last.y
                          : null,
                  }))}
                  stroke="#ffffff"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  connectNulls
                  name="Trend"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No efficiency data — record runs or walks with HR to see trends
          </p>
        )}
      </div>

      {/* ═══════════ Section 5: Activity Calendar ═══════════ */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <SectionHeader
          title="Training Consistency"
          info="GitHub-style heatmap showing daily training activity. Color intensity = total training minutes that day. Consistency is the #1 predictor of fitness gains. Gaps >7 days lead to measurable detraining. Method: Daily aggregation of activity duration with sport type classification. Data: activityCalendar query grouped by date."
          className="mb-3"
        />
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
        <SectionHeader
          title="Weekly Training Volume by Sport"
          info="Stacked bar chart of total training minutes per week, broken down by sport type (running, walking, strength, yoga, tennis, other). Method: Sum of duration minutes per activity grouped by ISO week and sport type. Gradual weekly increases of 5-10% recommended to avoid overuse injuries. Citation: Progressive overload principle."
          className="mb-3"
        />
        {volume.isLoading ? (
          <ChartSkeleton />
        ) : volumeChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={volumeChartData}>
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
                wrapperStyle={{ fontSize: 11, flexWrap: "wrap" }}
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
          <SectionHeader
            title="Key Insights"
            info="Auto-generated insights from your training patterns. Checks include: zone distribution balance, consistency streaks, efficiency trends, polarization status, and volume changes. Method: Rule-based analysis comparing current metrics against sport science thresholds (e.g., PI > 2.0, efficiency trend slope, active day ratio)."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {insights.map((item, i) => (
              <div key={i} className={cn("rounded-xl border p-4", item.color)}>
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
          label: MONTHS_SHORT[cursor.getMonth()]!,
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
    <div className="relative overflow-x-clip">
      <div className="flex gap-0.5">
        {/* Day labels (sticky on the left) */}
        <div className="flex shrink-0 flex-col gap-0.5 pt-4 pr-1">
          {DAYS.map((d, i) => (
            <div
              key={d}
              className="flex h-[12px] items-center text-[9px] text-zinc-500"
            >
              {i % 2 === 0 ? d : ""}
            </div>
          ))}
        </div>

        {/* Scrolling region: month labels + grid scroll together so they
            stay aligned. Previously month labels were absolute-positioned
            in the outer container and bled past the mobile viewport,
            causing horizontal page scroll (#160 regression of #142). */}
        <div className="min-w-0 flex-1 overflow-x-auto">
          {/* Month labels row */}
          <div
            className="relative h-3 text-[10px] text-zinc-500"
            style={{ width: `${weeks.length * 14}px` }}
          >
            {monthLabels.map((m, i) => (
              <div
                key={i}
                className="absolute"
                style={{ left: `${m.col * 14}px`, top: 0 }}
              >
                {m.label}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="mt-1 flex gap-0.5">
            {weeks.map((week, wIdx) => (
              <div key={wIdx} className="flex flex-col gap-0.5">
                {Array.from({ length: 7 }, (_, dIdx) => {
                  const dateStr = week[dIdx];
                  if (!dateStr) {
                    return <div key={dIdx} className="h-[12px] w-[12px]" />;
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
            {formatDateStr(tooltip.date)}
          </p>
          {tooltip.day ? (
            <>
              <p className="text-zinc-400">
                {tooltip.day.totalMinutes.toFixed(0)} min
                {tooltip.day.primarySport
                  ? ` · ${tooltip.day.primarySport}`
                  : ""}
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
