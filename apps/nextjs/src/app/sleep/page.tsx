"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@acme/ui";

import { IngressLink as Link } from "~/app/_components/ingress-link";
import { useTRPC } from "~/trpc/react";
import { BottomNav } from "../_components/bottom-nav";
import { DateRangeSelector } from "../_components/date-range-selector";
import { SectionHeader } from "../_components/info-button";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert minutes to "Xh Ym" display string */
function fmtDuration(minutes: number | null | undefined): string {
  if (minutes == null || isNaN(minutes)) return "—";
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.round(Math.abs(minutes) % 60);
  const sign = minutes < 0 ? "-" : "";
  if (h === 0) return `${sign}${m}m`;
  return `${sign}${h}h ${m.toString().padStart(2, "0")}m`;
}

/** Convert minutes to decimal hours for chart Y-axis */
function minToHours(min: number): number {
  return +(min / 60).toFixed(2);
}

/** Format a date string as short day name or "Mon D" depending on range */
function fmtDateShort(iso: string, totalDays: number): string {
  const d = new Date(iso + "T00:00:00");
  if (totalDays <= 7) {
    return d.toLocaleDateString("en-US", { weekday: "short" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Format a clock time given as minutes-from-midnight (or decimal hours) */
function fmtClockTime(minutesFromMidnight: number | null | undefined): string {
  if (minutesFromMidnight == null || isNaN(minutesFromMidnight)) return "—";
  // Handle negative values (before midnight) by wrapping
  const mins = ((minutesFromMidnight % 1440) + 1440) % 1440;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/** Simple moving average over an array of numbers */
function movingAvg(arr: (number | null)[], window: number): (number | null)[] {
  return arr.map((_, i) => {
    if (i < window - 1) return null;
    const slice = arr
      .slice(i - window + 1, i + 1)
      .filter((v): v is number => v != null);
    if (slice.length < Math.ceil(window / 2)) return null;
    return +(slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(1);
  });
}

/** Color for sleep debt value */
function debtColor(debt: number): string {
  if (debt < 30) return "#22c55e"; // green
  if (debt < 60) return "#eab308"; // yellow
  return "#ef4444"; // red
}

function debtTextColor(debt: number): string {
  if (debt < 30) return "text-green-400";
  if (debt < 60) return "text-yellow-400";
  return "text-red-400";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SleepDashboard() {
  const trpc = useTRPC();
  const [sleepDays, setSleepDays] = useState(28);

  // ---- Data queries ----
  const coach = useQuery(trpc.sleep.getCoach.queryOptions());

  const stages = useQuery(
    trpc.sleep.getStages.queryOptions({ days: sleepDays }),
  );

  const history = useQuery(
    trpc.sleep.getHistory.queryOptions({ days: sleepDays }),
  );

  // ---- Derived: Key stats ----
  const stats = useMemo(() => {
    const data = history.data as
      | {
          date: string;
          sleepScore: number | null;
          totalSleepMinutes: number | null;
          sleepNeedMinutes: number | null;
          sleepDebt: number | null;
          awakeMinutes: number | null;
          sleepStartTime: number | null;
          sleepEndTime: number | null;
        }[]
      | undefined;
    if (!data || data.length === 0) return null;

    const scores = data
      .map((d) => d.sleepScore)
      .filter((v): v is number => v != null);
    const durations = data
      .map((d) => d.totalSleepMinutes)
      .filter((v): v is number => v != null);
    const awakes = data
      .map((d) => d.awakeMinutes)
      .filter((v): v is number => v != null);
    const totals = data
      .map((d) => d.totalSleepMinutes)
      .filter((v): v is number => v != null);
    const debts = data
      .map((d) => d.sleepDebt)
      .filter((v): v is number => v != null);

    const avgDuration =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : null;
    const avgScore =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;
    const currentDebt =
      debts.length > 0 ? (debts[debts.length - 1] ?? null) : null;

    // Efficiency: (total - awake) / total * 100
    let avgEfficiency: number | null = null;
    if (totals.length > 0 && awakes.length > 0) {
      const totalSum = totals.reduce((a, b) => a + b, 0);
      const awakeSum = awakes.reduce((a, b) => a + b, 0);
      if (totalSum > 0) {
        avgEfficiency = Math.round(((totalSum - awakeSum) / totalSum) * 100);
      }
    }

    return { avgDuration, avgScore, currentDebt, avgEfficiency };
  }, [history.data]);

  // ---- Derived: Sleep stages chart data ----
  const stagesChartData = useMemo(() => {
    const data = stages.data as
      | {
          date: string;
          deepMinutes: number;
          remMinutes: number;
          lightMinutes: number;
          awakeMinutes: number;
          sleepNeedMinutes?: number;
        }[]
      | undefined;
    if (!data) return [];
    return data.map((d) => ({
      date: fmtDateShort(d.date, data.length),
      deep: minToHours(d.deepMinutes),
      rem: minToHours(d.remMinutes),
      light: minToHours(d.lightMinutes),
      awake: minToHours(d.awakeMinutes),
      need: d.sleepNeedMinutes ? minToHours(d.sleepNeedMinutes) : undefined,
    }));
  }, [stages.data]);

  // True when data exists but all detailed stage values are zero/null —
  // indicating the device doesn't support sleep stage tracking.
  const hasNoSleepStages = useMemo(
    () =>
      stagesChartData.length > 0 &&
      stagesChartData.every(
        (d) => !(d.deep > 0) && !(d.rem > 0) && !(d.light > 0),
      ),
    [stagesChartData],
  );

  // ---- Derived: Sleep score trend with moving average ----
  const scoreChartData = useMemo(() => {
    const data = history.data as
      | { date: string; sleepScore: number | null }[]
      | undefined;
    if (!data) return [];
    const scores = data.map((d) => d.sleepScore);
    const ma = data.length > 14 ? movingAvg(scores, 7) : null;
    return data.map((d, i) => ({
      date: fmtDateShort(d.date, data.length),
      score: d.sleepScore,
      avg: ma ? ma[i] : undefined,
    }));
  }, [history.data]);

  // ---- Derived: Sleep vs Need chart ----
  const vsNeedChartData = useMemo(() => {
    const data = history.data as
      | {
          date: string;
          totalSleepMinutes: number | null;
          sleepNeedMinutes: number | null;
        }[]
      | undefined;
    if (!data) return [];
    // Show last 14 days for readability
    const slice = data.slice(-14);
    return slice.map((d) => ({
      date: fmtDateShort(d.date, slice.length),
      actual: d.totalSleepMinutes ? minToHours(d.totalSleepMinutes) : null,
      need: d.sleepNeedMinutes ? minToHours(d.sleepNeedMinutes) : null,
    }));
  }, [history.data]);

  // ---- Derived: Sleep debt tracker (last 7 days) ----
  const debtChartData = useMemo(() => {
    const data = history.data as
      | { date: string; sleepDebt: number | null }[]
      | undefined;
    if (!data) return [];
    const slice = data.slice(-7);
    return slice.map((d) => ({
      date: fmtDateShort(d.date, slice.length),
      debt: d.sleepDebt ?? 0,
      color: debtColor(d.sleepDebt ?? 0),
    }));
  }, [history.data]);

  // ---- Derived: Sleep timing range chart ----
  const timingChartData = useMemo(() => {
    const data = history.data as
      | {
          date: string;
          sleepStartTime: number | null;
          sleepEndTime: number | null;
        }[]
      | undefined;
    if (!data) return [];
    const slice = data.slice(-14);
    return slice.map((d) => {
      // Normalize bedtime: if after noon treat as same day, otherwise add 24h
      // so e.g. 22:00 (1320 min) stays as is, and 01:00 (60 min) → 1500 min
      let start = d.sleepStartTime;
      if (start != null && start < 720) start += 1440;
      return {
        date: fmtDateShort(d.date, slice.length),
        bedtime: start ?? null,
        wakeTime: d.sleepEndTime ?? null,
        range:
          start != null && d.sleepEndTime != null
            ? [start, d.sleepEndTime + 1440]
            : [null, null],
      };
    });
  }, [history.data]);

  // ---- Coach data ----
  const coachData = coach.data as
    | {
        recommendedDurationMinutes: number;
        recommendedBedtime: string;
        sleepDebtMinutes: number;
        insight: string;
      }
    | undefined;

  // ---------------------------------------------------------------------------
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 pt-6 pb-24">
      {/* ================================================================== */}
      {/* Header: Sleep Coach Recommendation                                 */}
      {/* ================================================================== */}
      <div>
        <h1 className="text-2xl font-bold">Sleep Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Your sleep insights &amp; coaching
        </p>
      </div>

      {/* ── Date Range ── */}
      <DateRangeSelector
        value={sleepDays}
        onChange={setSleepDays}
        presets={[
          { label: "7d", days: 7 },
          { label: "14d", days: 14 },
          { label: "28d", days: 28 },
          { label: "90d", days: 90 },
        ]}
      />

      {coach.isLoading ? (
        <div className="bg-card animate-pulse rounded-2xl border p-6">
          <div className="bg-muted h-8 w-48 rounded" />
          <div className="bg-muted mt-3 h-4 w-64 rounded" />
          <div className="bg-muted mt-2 h-4 w-56 rounded" />
        </div>
      ) : coachData ? (
        <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/30 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                Tonight&apos;s Recommendation
              </p>
              <p className="mt-1 text-3xl font-bold text-indigo-300">
                {fmtDuration(coachData.recommendedDurationMinutes)}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                Bedtime: {coachData.recommendedBedtime}
              </p>
            </div>
            <div className="text-right">
              <span
                className={cn(
                  "inline-block rounded-full px-3 py-1 text-sm font-semibold",
                  coachData.sleepDebtMinutes > 60
                    ? "bg-red-500/20 text-red-400"
                    : coachData.sleepDebtMinutes > 30
                      ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-green-500/20 text-green-400",
                )}
              >
                {coachData.sleepDebtMinutes > 0 ? "+" : ""}
                {fmtDuration(coachData.sleepDebtMinutes)} debt
              </span>
            </div>
          </div>
          {coachData.insight && (
            <p className="mt-3 text-sm text-indigo-200/80">
              💡 {coachData.insight}
            </p>
          )}
        </div>
      ) : null}

      {/* ================================================================== */}
      {/* Key Stats Cards (4-col)                                            */}
      {/* ================================================================== */}
      {history.isLoading ? (
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
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Avg Duration"
            value={fmtDuration(stats.avgDuration)}
            icon="⏱️"
            color="text-blue-400"
          />
          <StatCard
            label="Avg Score"
            value={stats.avgScore != null ? String(stats.avgScore) : "—"}
            icon="⭐"
            color="text-purple-400"
          />
          <StatCard
            label="Sleep Debt"
            value={fmtDuration(stats.currentDebt)}
            icon="📉"
            color={
              stats.currentDebt != null
                ? debtTextColor(stats.currentDebt)
                : "text-zinc-400"
            }
          />
          <StatCard
            label="Efficiency"
            value={
              stats.avgEfficiency != null ? `${stats.avgEfficiency}%` : "—"
            }
            icon="✨"
            color="text-emerald-400"
          />
        </div>
      ) : null}

      {/* ================================================================== */}
      {/* Sleep Stages Stacked Bar Chart                                     */}
      {/* ================================================================== */}
      <div className="bg-card rounded-2xl border p-4">
        <SectionHeader
          title="Sleep Stages · Last 14 Nights"
          info="Stacked bar chart of nightly sleep stage breakdown from Garmin's Firstbeat sleep analysis. Deep sleep (N3): physical recovery + growth hormone — aim for 1-2h. REM: memory + emotional regulation — aim for 1.5-2h. Light sleep transitions between stages. Method: sleepDeepMinutes, sleepRemMinutes, sleepLightMinutes from daily metrics."
          className="mb-4"
        />
        {stages.isLoading ? (
          <div className="bg-muted h-64 animate-pulse rounded-lg" />
        ) : stagesChartData.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            No sleep stage data yet
          </p>
        ) : hasNoSleepStages ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-600 text-zinc-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </span>
            <p className="text-muted-foreground max-w-sm text-sm">
              Your Garmin device may not support detailed sleep stage tracking.
              Devices like Fenix 7+, Venu 3, and Forerunner 265+ provide
              deep/light/REM/awake breakdown.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={stagesChartData}
              margin={{ top: 5, right: 5, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#a1a1aa", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#3f3f46" }}
              />
              <YAxis
                tick={{ fill: "#a1a1aa", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={35}
                label={{
                  value: "hours",
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: "#71717a", fontSize: 10 },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #3f3f46",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#a1a1aa" }}
                formatter={(value, name) => [
                  `${Number(value).toFixed(1)}h`,
                  String(name).charAt(0).toUpperCase() + String(name).slice(1),
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                formatter={(value: string) =>
                  value.charAt(0).toUpperCase() + value.slice(1)
                }
              />
              {stagesChartData.some((d) => d.need != null) && (
                <ReferenceLine
                  y={stagesChartData.find((d) => d.need != null)?.need}
                  stroke="#eab308"
                  strokeDasharray="6 3"
                  label={{
                    value: "Need",
                    fill: "#eab308",
                    fontSize: 10,
                    position: "right",
                  }}
                />
              )}
              <Bar
                dataKey="deep"
                stackId="sleep"
                fill="#4338ca"
                radius={[0, 0, 0, 0]}
                name="Deep"
              />
              <Bar dataKey="rem" stackId="sleep" fill="#a855f7" name="REM" />
              <Bar
                dataKey="light"
                stackId="sleep"
                fill="#60a5fa"
                name="Light"
              />
              <Bar
                dataKey="awake"
                stackId="sleep"
                fill="#f87171"
                radius={[4, 4, 0, 0]}
                name="Awake"
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ================================================================== */}
      {/* Sleep Score Trend (LineChart)                                       */}
      {/* ================================================================== */}
      <div className="bg-card rounded-2xl border p-4">
        <SectionHeader
          title="Sleep Score · Last 28 Days"
          info="Garmin's composite sleep score (0-100) based on duration, depth, continuity, and REM/deep percentages. Scores >75 = good recovery. Consistent scores >70 correlate with better training adaptation. Drops <60 may indicate stress or overtraining. Method: sleepScore field from dailyMetrics table. Citation: Garmin Firstbeat Analytics."
          className="mb-4"
        />
        {history.isLoading ? (
          <div className="bg-muted h-64 animate-pulse rounded-lg" />
        ) : scoreChartData.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            No score data yet
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart
              data={scoreChartData}
              margin={{ top: 5, right: 5, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#a1a1aa", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#3f3f46" }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: "#a1a1aa", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={35}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #3f3f46",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#a1a1aa" }}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#a855f7"
                strokeWidth={2}
                dot={{ r: 3, fill: "#a855f7" }}
                connectNulls
                name="Score"
              />
              {scoreChartData.some((d) => d.avg != null) && (
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke="#c084fc"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  connectNulls
                  name="7-day Avg"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Two-column grid for mid-section charts */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* ================================================================ */}
        {/* Sleep vs Need Comparison                                         */}
        {/* ================================================================ */}
        <div className="bg-card rounded-2xl border p-4">
          <SectionHeader
            title="Actual vs Need"
            info="Compares actual sleep duration vs estimated need (typically 7-9h for adults). Chronic debt of even 30-60 min/night impairs reaction time, immune function, and training adaptation. Method: sleepDurationMinutes vs sleepNeedMinutes from daily metrics. Citation: Hirshkowitz M et al. (2015) Sleep Recommendations."
            className="mb-4"
          />
          {history.isLoading ? (
            <div className="bg-muted h-56 animate-pulse rounded-lg" />
          ) : vsNeedChartData.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">
              No data yet
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={vsNeedChartData}
                margin={{ top: 5, right: 5, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#a1a1aa", fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: "#3f3f46" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                  label={{
                    value: "hrs",
                    angle: -90,
                    position: "insideLeft",
                    style: { fill: "#71717a", fontSize: 10 },
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    border: "1px solid #3f3f46",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "#a1a1aa" }}
                  formatter={(value, name) => [
                    `${Number(value).toFixed(1)}h`,
                    name === "actual" ? "Actual" : "Need",
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  formatter={(v: string) =>
                    v === "actual" ? "Actual" : "Need"
                  }
                />
                <Bar
                  dataKey="actual"
                  fill="#60a5fa"
                  radius={[4, 4, 0, 0]}
                  name="actual"
                />
                <Bar
                  dataKey="need"
                  fill="none"
                  stroke="#eab308"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  radius={[4, 4, 0, 0]}
                  name="need"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ================================================================ */}
        {/* Sleep Debt Tracker                                               */}
        {/* ================================================================ */}
        <div className="bg-card rounded-2xl border p-4">
          <SectionHeader
            title="Sleep Debt · Last 7 Days"
            info="Running total of accumulated sleep debt over 7 days. Formula: Daily debt = sleepNeedMinutes - sleepDurationMinutes (if positive). Weekly debt >5 hours significantly impairs athletic performance and increases injury risk by 1.7×. Method: Cumulative sum of nightly deficits. Citation: Milewski et al. (2014) Sleep & Injury."
            className="mb-4"
          />
          {history.isLoading ? (
            <div className="bg-muted h-56 animate-pulse rounded-lg" />
          ) : debtChartData.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">
              No debt data yet
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart
                data={debtChartData}
                margin={{ top: 5, right: 5, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "#3f3f46" }}
                />
                <YAxis
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={35}
                  label={{
                    value: "min",
                    angle: -90,
                    position: "insideLeft",
                    style: { fill: "#71717a", fontSize: 10 },
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    border: "1px solid #3f3f46",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "#a1a1aa" }}
                  formatter={(value) => [fmtDuration(Number(value)), "Debt"]}
                />
                <ReferenceLine
                  y={30}
                  stroke="#eab308"
                  strokeDasharray="4 2"
                  label={{
                    value: "30m",
                    fill: "#eab308",
                    fontSize: 10,
                    position: "right",
                  }}
                />
                <ReferenceLine
                  y={60}
                  stroke="#ef4444"
                  strokeDasharray="4 2"
                  label={{
                    value: "60m",
                    fill: "#ef4444",
                    fontSize: 10,
                    position: "right",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="debt"
                  stroke="#a855f7"
                  strokeWidth={2}
                  dot={(props) => {
                    const cx = props.cx ?? 0;
                    const cy = props.cy ?? 0;
                    const debt = (props.payload as { debt?: number }).debt ?? 0;
                    return (
                      <circle
                        key={`${cx}-${cy}`}
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill={debtColor(debt)}
                        stroke="none"
                      />
                    );
                  }}
                  name="Debt"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ================================================================== */}
      {/* Sleep Timing Chart                                                 */}
      {/* ================================================================== */}
      <div className="bg-card rounded-2xl border p-4">
        <SectionHeader
          title="Sleep Timing Consistency"
          info="Tracks bedtime and wake time patterns over time. Consistent timing (±30min) strengthens circadian rhythm. Irregular schedules (>1h variation) associated with poorer metabolic health and reduced sleep quality. Method: sleepStartTime and sleepEndTime from daily metrics. Citation: Phillips AJK et al. (2017) Irregular Sleep & Health."
          className="mb-4"
        />
        {history.isLoading ? (
          <div className="bg-muted h-56 animate-pulse rounded-lg" />
        ) : timingChartData.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            No timing data yet
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              {timingChartData.map((d, i) => {
                const bedLabel =
                  d.bedtime != null
                    ? fmtClockTime(
                        d.bedtime > 1440 ? d.bedtime - 1440 : d.bedtime,
                      )
                    : "—";
                const wakeLabel =
                  d.wakeTime != null ? fmtClockTime(d.wakeTime) : "—";

                // For bar width: normalize bedtime (20:00-02:00 → 1200-1560)
                // and wake time (05:00-10:00 → 300-600) to percentage of
                // a 16-hour window from 8PM (1200) to 12PM (1920).
                const windowStart = 1200; // 8 PM in minutes
                const windowEnd = 1920; // 12 PM next day (8PM + 12h)
                const windowSize = windowEnd - windowStart;

                const barStart =
                  d.bedtime != null
                    ? Math.max(
                        0,
                        ((d.bedtime - windowStart) / windowSize) * 100,
                      )
                    : 0;
                const barEnd =
                  d.wakeTime != null
                    ? Math.min(
                        100,
                        ((d.wakeTime + 1440 - windowStart) / windowSize) * 100,
                      )
                    : 0;
                const barWidth = barEnd - barStart;

                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-muted-foreground w-10 shrink-0 text-right text-xs">
                      {d.date}
                    </span>
                    <div className="relative h-5 flex-1 overflow-hidden rounded bg-zinc-800">
                      {d.bedtime != null &&
                        d.wakeTime != null &&
                        barWidth > 0 && (
                          <div
                            className="absolute top-0 h-full rounded bg-gradient-to-r from-indigo-600 to-purple-500"
                            style={{
                              left: `${Math.max(0, Math.min(barStart, 100))}%`,
                              width: `${Math.max(0, Math.min(barWidth, 100 - barStart))}%`,
                            }}
                          />
                        )}
                    </div>
                    <span className="text-muted-foreground w-24 shrink-0 text-xs">
                      {bedLabel} – {wakeLabel}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="text-muted-foreground mt-2 flex justify-between text-[10px]">
              <span>8 PM</span>
              <span>12 AM</span>
              <span>4 AM</span>
              <span>8 AM</span>
              <span>12 PM</span>
            </div>
          </>
        )}
      </div>

      {/* ---- Bottom nav link ---- */}
      <div className="pt-2 text-center">
        <Link href="/" className="text-primary text-sm hover:underline">
          ← Back to Home
        </Link>
      </div>

      <BottomNav />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Stat Card component
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: string;
  color: string;
}) {
  return (
    <div className="bg-card rounded-xl border p-4 text-center">
      <span className="text-lg">{icon}</span>
      <p className={cn("mt-1 text-2xl font-bold", color)}>{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}
