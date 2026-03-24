"use client";

import { useMemo, useState } from "react";
import { IngressLink as Link } from "~/app/_components/ingress-link";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";
import { BottomNav } from "../_components/bottom-nav";
import { SectionHeader } from "../_components/info-button";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type Period = "7d" | "28d" | "90d" | "180d" | "365d";

const PERIODS: { value: Period; label: string; days: number }[] = [
  { value: "7d", label: "7 D", days: 7 },
  { value: "28d", label: "28 D", days: 28 },
  { value: "90d", label: "90 D", days: 90 },
  { value: "180d", label: "180 D", days: 180 },
  { value: "365d", label: "1 Y", days: 365 },
];

const METRIC_COLORS: Record<string, string> = {
  readiness: "#22c55e",
  sleep: "#3b82f6",
  hrv: "#a855f7",
  strain: "#ef4444",
  restingHr: "#f59e0b",
  stress: "#3b82f6",
};

const METRIC_LABELS: Record<string, string> = {
  readiness: "Readiness",
  sleep: "Sleep",
  hrv: "HRV",
  strain: "Strain",
  restingHr: "Resting HR",
  stress: "Stress",
};

type TrendMetric = "readiness" | "sleep" | "hrv" | "restingHr" | "strain" | "stress";
type TrendPeriod = "30d" | "90d" | "180d" | "365d";
type CorrelationPeriod = "30d" | "90d" | "180d";

const CHART_METRICS: TrendMetric[] = ["readiness", "sleep", "hrv"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysFor(p: Period): number {
  return PERIODS.find((x) => x.value === p)!.days;
}

function summaryPeriod(p: Period): "7d" | "28d" {
  return p === "7d" ? "7d" : "28d";
}

function trendPeriod(p: Period): TrendPeriod {
  if (p === "7d" || p === "28d") return "30d";
  if (p === "90d") return "90d";
  if (p === "180d") return "180d";
  return "365d";
}

function correlationPeriod(p: Period): CorrelationPeriod {
  if (p === "180d" || p === "365d") return "180d";
  if (p === "90d") return "90d";
  return "30d";
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatSleep(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${m.toString().padStart(2, "0")}`;
}

function directionArrow(d: string | undefined): string {
  if (d === "improving") return "↑";
  if (d === "declining") return "↓";
  return "→";
}

function directionColor(d: string | undefined): string {
  if (d === "improving") return "text-green-400";
  if (d === "declining") return "text-red-400";
  return "text-zinc-400";
}

function strengthColor(s: string | undefined): string {
  if (s === "strong") return "border-green-500/60 bg-green-500/10";
  if (s === "moderate") return "border-yellow-500/60 bg-yellow-500/10";
  return "border-zinc-700 bg-zinc-800/50";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TrendsPage() {
  const [period, setPeriod] = useState<Period>("28d");
  const days = daysFor(period);
  const trpc = useTRPC();
  const useSmoothed = days > 90;

  // ---- Summary stats ----
  const summary = useQuery(
    trpc.trends.getSummary.queryOptions({ period: summaryPeriod(period) }),
  );

  // ---- Multi-metric overlay chart (raw or smoothed) ----
  const multiChart = useQuery({
    ...trpc.trends.getMultiMetricChart.queryOptions({
      metrics: CHART_METRICS,
      days,
    }),
    enabled: !useSmoothed,
  });

  const rollingReadiness = useQuery({
    ...trpc.trends.getRollingAverages.queryOptions({
      metric: "readiness",
      days,
      window: 7,
    }),
    enabled: useSmoothed,
  });
  const rollingSleep = useQuery({
    ...trpc.trends.getRollingAverages.queryOptions({
      metric: "sleep",
      days,
      window: 7,
    }),
    enabled: useSmoothed,
  });
  const rollingHrv = useQuery({
    ...trpc.trends.getRollingAverages.queryOptions({
      metric: "hrv",
      days,
      window: 7,
    }),
    enabled: useSmoothed,
  });

  // ---- Trend analysis per metric ----
  const trendReadiness = useQuery(
    trpc.trends.getLongTermTrend.queryOptions({
      metric: "readiness",
      period: trendPeriod(period),
    }),
  );
  const trendSleep = useQuery(
    trpc.trends.getLongTermTrend.queryOptions({
      metric: "sleep",
      period: trendPeriod(period),
    }),
  );
  const trendHrv = useQuery(
    trpc.trends.getLongTermTrend.queryOptions({
      metric: "hrv",
      period: trendPeriod(period),
    }),
  );
  const trendStrain = useQuery(
    trpc.trends.getLongTermTrend.queryOptions({
      metric: "strain",
      period: trendPeriod(period),
    }),
  );
  const trendStress = useQuery(
    trpc.trends.getLongTermTrend.queryOptions({
      metric: "stress",
      period: trendPeriod(period),
    }),
  );

  // ---- Notable changes ----
  const notableChanges = useQuery(
    trpc.trends.getNotableChanges.queryOptions({
      metric: "readiness",
      days,
    }),
  );

  // ---- Correlations (only when enough data) ----
  const correlations = useQuery({
    ...trpc.analytics.getCorrelations.queryOptions({
      period: correlationPeriod(period),
    }),
    enabled: days >= 28,
  });

  // ---- Build unified chart data ----
  const chartData = useMemo(() => {
    if (useSmoothed) {
      const readinessArr = rollingReadiness.data ?? [];
      const sleepArr = rollingSleep.data ?? [];
      const hrvArr = rollingHrv.data ?? [];
      const dateSet = new Set<string>();
      readinessArr.forEach((d) => dateSet.add(d.date));
      sleepArr.forEach((d) => dateSet.add(d.date));
      hrvArr.forEach((d) => dateSet.add(d.date));
      const dates = [...dateSet].sort();

      const readMap = new Map(readinessArr.map((d) => [d.date, d.value]));
      const sleepMap = new Map(sleepArr.map((d) => [d.date, d.value]));
      const hrvMap = new Map(hrvArr.map((d) => [d.date, d.value]));

      return dates.map((date) => ({
        date,
        label: formatDate(date),
        readiness: readMap.get(date) ?? null,
        sleep: sleepMap.get(date) ?? null,
        hrv: hrvMap.get(date) ?? null,
      }));
    }

    const raw = multiChart.data as
      | Record<string, { date: string; value: number }[]>
      | undefined;
    if (!raw) return [];

    const dateSet = new Set<string>();
    Object.values(raw).forEach((arr) =>
      arr.forEach((d) => dateSet.add(d.date)),
    );
    const dates = [...dateSet].sort();

    const maps = Object.fromEntries(
      Object.entries(raw).map(([k, arr]) => [
        k,
        new Map(arr.map((d) => [d.date, d.value])),
      ]),
    ) as Record<string, Map<string, number>>;

    return dates.map((date) => ({
      date,
      label: formatDate(date),
      readiness: maps.readiness?.get(date) ?? null,
      sleep: maps.sleep?.get(date) ?? null,
      hrv: maps.hrv?.get(date) ?? null,
    }));
  }, [
    useSmoothed,
    multiChart.data,
    rollingReadiness.data,
    rollingSleep.data,
    rollingHrv.data,
  ]);

  const chartLoading = useSmoothed
    ? rollingReadiness.isLoading || rollingSleep.isLoading || rollingHrv.isLoading
    : multiChart.isLoading;

  const s = summary.data;
  const trendItems = [
    { key: "readiness", query: trendReadiness },
    { key: "sleep", query: trendSleep },
    { key: "hrv", query: trendHrv },
    { key: "strain", query: trendStrain },
    { key: "stress", query: trendStress },
  ];
  const topCorrelations = (correlations.data ?? []).slice(0, 6);

  // ---------------------------------------------------------------------------
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 pb-24 pt-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Trends &amp; Analytics</h1>
        <p className="text-muted-foreground text-sm">
          {PERIODS.find((x) => x.value === period)?.label ?? period} overview
          {useSmoothed ? " · 7-day rolling avg" : ""}
        </p>
      </div>

      {/* Period selector */}
      <div className="bg-muted flex gap-1 rounded-lg p-0.5">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              period === p.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ---- Summary Stats Row ---- */}
      {summary.isLoading ? (
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
      ) : s ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard
            label="Avg Readiness"
            value={s.avgReadiness != null ? String(s.avgReadiness) : "—"}
            trend={trendReadiness.data}
            color={METRIC_COLORS.readiness!}
          />
          <SummaryCard
            label="Avg Sleep"
            value={formatSleep(s.avgSleepMinutes)}
            trend={trendSleep.data}
            color={METRIC_COLORS.sleep!}
          />
          <SummaryCard
            label="Avg HRV"
            value={s.avgHrv != null ? String(s.avgHrv) : "—"}
            suffix="ms"
            trend={trendHrv.data}
            color={METRIC_COLORS.hrv!}
          />
          <SummaryCard
            label="Avg Stress"
            value="—"
            trend={trendStrain.data}
            color={METRIC_COLORS.strain!}
          />
        </div>
      ) : null}

      {/* ---- Multi-Metric Overlay Chart ---- */}
      <div className="bg-card rounded-2xl border p-4">
        <SectionHeader
          title="Multi-Metric Trend"
          info="Overlay chart of multiple health metrics on a shared timeline. Toggle metrics to spot correlations — e.g., does RHR drop when sleep improves? Method: Daily values from dailyMetrics table with configurable 7-day or 14-day rolling averages. Normalized to common scale for visual comparison."
          className="mb-4"
        />
        {chartLoading ? (
          <div className="bg-muted h-64 animate-pulse rounded-lg" />
        ) : chartData.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            No data yet
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart
              data={chartData}
              margin={{ top: 5, right: 5, left: -10, bottom: 0 }}
            >
              <defs>
                {CHART_METRICS.map((m) => (
                  <linearGradient
                    key={m}
                    id={`gradient-${m}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={METRIC_COLORS[m]}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor={METRIC_COLORS[m]}
                      stopOpacity={0}
                    />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="label"
                tick={{ fill: "#a1a1aa", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#3f3f46" }}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="readiness"
                domain={[0, 100]}
                tick={{ fill: "#a1a1aa", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={35}
              />
              <YAxis
                yAxisId="sleep"
                orientation="right"
                domain={["auto", "auto"]}
                tick={{ fill: "#a1a1aa", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={35}
                hide
              />
              <YAxis
                yAxisId="hrv"
                orientation="right"
                domain={["auto", "auto"]}
                tick={false}
                tickLine={false}
                axisLine={false}
                width={0}
                hide
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #3f3f46",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#a1a1aa" }}
                formatter={(value: unknown, name: unknown) => {
                  const v = value as number;
                  const n = name as string;
                  if (n === "sleep" && v != null)
                    return [formatSleep(v), "Sleep"];
                  if (n === "hrv" && v != null)
                    return [`${Math.round(v)} ms`, "HRV"];
                  if (n === "readiness" && v != null)
                    return [`${Math.round(v)}`, "Readiness"];
                  return [`${v}`, METRIC_LABELS[n] ?? n];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                formatter={(value: string) => METRIC_LABELS[value] ?? value}
              />
              <Area
                yAxisId="readiness"
                type="monotone"
                dataKey="readiness"
                stroke={METRIC_COLORS.readiness}
                fill={`url(#gradient-readiness)`}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Area
                yAxisId="sleep"
                type="monotone"
                dataKey="sleep"
                stroke={METRIC_COLORS.sleep}
                fill={`url(#gradient-sleep)`}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Area
                yAxisId="hrv"
                type="monotone"
                dataKey="hrv"
                stroke={METRIC_COLORS.hrv}
                fill={`url(#gradient-hrv)`}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ---- Trend Analysis Cards ---- */}
      <div>
        <SectionHeader
          title="Trend Analysis"
          info="Statistical direction and strength of change for each metric. Method: Linear regression (y = mx + b) over selected period. R² indicates trend reliability. Arrows show direction; percentage shows magnitude. Longer periods give more reliable trends. Citation: Standard statistical regression analysis."
          className="mb-3"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {trendItems.map(({ key, query }) => {
            const t = query.data as {
              direction: string;
              rateOfChange: number;
              percentChange: number;
              significance: string;
            } | null;

            return (
              <div key={key} className="bg-card rounded-xl border p-4">
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: METRIC_COLORS[key] }}
                  />
                  <span className="text-sm font-medium">
                    {METRIC_LABELS[key]}
                  </span>
                </div>
                {query.isLoading ? (
                  <div className="bg-muted mt-2 h-6 w-20 animate-pulse rounded" />
                ) : t ? (
                  <>
                    <p
                      className={cn(
                        "text-xl font-bold",
                        directionColor(t.direction),
                      )}
                    >
                      {directionArrow(t.direction)}{" "}
                      {t.rateOfChange >= 0 ? "+" : ""}
                      {t.rateOfChange.toFixed(1)}/wk
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {Math.abs(t.percentChange).toFixed(1)}% change ·{" "}
                      <span
                        className={cn(
                          t.significance === "high"
                            ? "text-green-400"
                            : t.significance === "medium"
                              ? "text-yellow-400"
                              : "text-zinc-500",
                        )}
                      >
                        {t.significance} significance
                      </span>
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground mt-2 text-xs">
                    Not enough data
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- Notable Changes ---- */}
      <div>
        <SectionHeader
          title="Notable Changes"
          info="Highlights significant metric changes exceeding normal variation. Method: Z-score analysis — flags values where |z| > 2 standard deviations from your 30-day personal baseline. Not day-to-day noise but statistically meaningful shifts. Citation: Buchheit M (2014) Individual z-score monitoring."
          className="mb-3"
        />
        {notableChanges.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-card h-14 animate-pulse rounded-xl border"
              />
            ))}
          </div>
        ) : (notableChanges.data ?? []).length === 0 ? (
          <div className="bg-card rounded-xl border p-4">
            <p className="text-muted-foreground text-sm">
              No significant shifts detected in this period.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {(
              notableChanges.data as {
                date: string;
                change: number;
                description: string;
              }[]
            ).map((nc, i) => (
              <div
                key={i}
                className="bg-card flex items-start gap-3 rounded-xl border p-3"
              >
                <div className="text-muted-foreground mt-0.5 shrink-0 text-xs font-medium">
                  {formatDate(nc.date)}
                </div>
                <div className="flex-1">
                  <p className="text-sm">{nc.description}</p>
                  <p
                    className={cn(
                      "text-xs font-medium",
                      nc.change > 0 ? "text-green-400" : "text-red-400",
                    )}
                  >
                    {nc.change > 0 ? "+" : ""}
                    {nc.change.toFixed(1)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- Correlation Insights ---- */}
      {days >= 28 && (
        <div>
          <SectionHeader
            title="Correlation Insights"
            info="Shows which metrics move together (positive r) or inversely (negative r). Method: Pearson correlation coefficient between metric pairs over the selected period. Strong correlations (|r| > 0.5) suggest meaningful relationships. Correlation ≠ causation, but consistent patterns are informative. Citation: Cohen J (1988) Statistical Power Analysis."
            className="mb-3"
          />
          {correlations.isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="bg-card h-20 animate-pulse rounded-xl border"
                />
              ))}
            </div>
          ) : topCorrelations.length === 0 ? (
            <div className="bg-card rounded-xl border p-4">
              <p className="text-muted-foreground text-sm">
                Not enough data for correlation analysis.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {topCorrelations.map((c, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-xl border p-4",
                    strengthColor(c.strength),
                  )}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {METRIC_LABELS[c.metricA] ?? c.metricA} →{" "}
                      {METRIC_LABELS[c.metricB] ?? c.metricB}
                    </p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        c.strength === "strong"
                          ? "bg-green-500/20 text-green-400"
                          : c.strength === "moderate"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-zinc-700/50 text-zinc-400",
                      )}
                    >
                      {c.strength}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    r = {c.rValue.toFixed(2)} · {c.direction} · n={c.sampleSize}
                  </p>
                  {c.insight && (
                    <p className="mt-1 text-xs text-zinc-300">{c.insight}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
// Summary Card component
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  suffix,
  trend,
  color,
}: {
  label: string;
  value: string;
  suffix?: string;
  trend?: { direction: string } | null;
  color: string;
}) {
  return (
    <div className="bg-card rounded-xl border p-4 text-center">
      <div className="flex items-center justify-center gap-1">
        <p className="text-2xl font-bold">
          {value}
          {suffix && (
            <span className="text-muted-foreground text-sm font-normal">
              {" "}
              {suffix}
            </span>
          )}
        </p>
        {trend && (
          <span className={cn("text-lg", directionColor(trend.direction))}>
            {directionArrow(trend.direction)}
          </span>
        )}
      </div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <div className="mx-auto mt-2 h-0.5 w-8 rounded" style={{ backgroundColor: color }} />
    </div>
  );
}
