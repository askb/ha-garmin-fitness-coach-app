"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  ReferenceLine,
} from "recharts";
import { useTRPC } from "~/trpc/react";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@acme/ui";
import { BottomNav } from "../_components/bottom-nav";
import { SectionHeader } from "../_components/info-button";

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

/* ─────────────── ACWR helpers ─────────────── */

function acwrStatus(value: number): { label: string; color: string } {
  if (value < 0.8) return { label: "Under-training", color: "text-zinc-400" };
  if (value <= 1.3) return { label: "Optimal", color: "text-green-400" };
  if (value <= 1.5) return { label: "Caution", color: "text-yellow-400" };
  return { label: "⚠️ High Risk", color: "text-red-400" };
}

/* ─────────────── page ─────────────── */

export default function TrainingLoadPage() {
  const trpc = useTRPC();
  const [pmcDays, setPmcDays] = useState<42 | 90 | 180>(90);

  const loads = useQuery(trpc.analytics.getTrainingLoads.queryOptions());
  const status = useQuery(trpc.analytics.getTrainingStatus.queryOptions());
  const recovery = useQuery(trpc.analytics.getRecoveryTime.queryOptions());
  const strainChart = useQuery(
    trpc.trends.getChart.queryOptions({ metric: "strain", days: 42 }),
  );
  const recentStrain = useQuery(
    trpc.trends.getChart.queryOptions({ metric: "strain", days: 14 }),
  );
  // @ts-ignore — route added by gc-backend branch
  const pmcData = useQuery(trpc.advancedMetrics.list.queryOptions({ days: pmcDays }));

  /* ── derive PMC chart data ── */
  interface PmcEntry {
    date: string;
    ctl?: number | null;
    atl?: number | null;
    tsb?: number | null;
    acwr?: number | null;
  }
  const pmcChartData = ((pmcData.data ?? []) as PmcEntry[]).map((d, idx, arr) => {
    const showLabel = idx % 7 === 0;
    return {
      date: showLabel ? d.date?.slice(5) ?? "" : "",
      fullDate: d.date ?? "",
      ctl: d.ctl ?? null,
      atl: d.atl ?? null,
      tsb: d.tsb ?? null,
      acwr: d.acwr ?? null,
      tsbPos: (d.tsb ?? 0) >= 0 ? (d.tsb ?? 0) : 0,
      tsbNeg: (d.tsb ?? 0) < 0 ? (d.tsb ?? 0) : 0,
    };
  });

  const currentAcwr = loads.data?.acwr;

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

      {/* ── PMC — Performance Management Chart ── */}
      <div className="bg-card rounded-2xl border p-4">
        <div className="mb-3 flex items-center justify-between">
          <SectionHeader
            title="Performance Management Chart"
            info="CTL (Chronic Training Load) = fitness built over 42 days. ATL (Acute Training Load) = fatigue over 7 days. TSB (Training Stress Balance) = CTL - ATL = form. ACWR (Acute:Chronic Workload Ratio) = optimal 0.8–1.3. Citation: Banister (1991), Hulin et al. (2016)."
          />
          <div className="flex gap-1">
            {([42, 90, 180] as const).map((d) => (
              <button
                key={d}
                onClick={() => setPmcDays(d)}
                className={cn(
                  "rounded-lg px-2 py-1 text-[10px] font-semibold transition-all",
                  pmcDays === d
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-secondary/50",
                )}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {pmcData.isLoading ? (
          <div className="bg-muted h-52 animate-pulse rounded-lg" />
        ) : pmcChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={pmcChartData} margin={{ top: 5, right: 40, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="tsbPosGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="tsbNegGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.05} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.3} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 10 }} interval={0} />
              <YAxis yAxisId="left" tick={{ fill: "#888", fontSize: 10 }} width={32} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: "#f97316", fontSize: 10 }} width={32} domain={[0, 2]} />
              <ReferenceLine yAxisId="left" y={0} stroke="#555" strokeDasharray="4 2" />
              <Tooltip
                contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: 8, fontSize: 11 }}
                formatter={(value: number, name: string) => {
                  if (name === "ACWR") {
                    const s = acwrStatus(value);
                    return [`${value.toFixed(2)} (${s.label})`, name];
                  }
                  return [typeof value === "number" ? value.toFixed(1) : value, name];
                }}
                labelFormatter={(label, payload) => {
                  const p = payload?.[0]?.payload as { fullDate?: string } | undefined;
                  return p?.fullDate ?? String(label);
                }}
              />
              {/* TSB filled areas */}
              <Area yAxisId="left" type="monotone" dataKey="tsbPos" fill="url(#tsbPosGrad)" stroke="none" name="TSB+" legendType="none" />
              <Area yAxisId="left" type="monotone" dataKey="tsbNeg" fill="url(#tsbNegGrad)" stroke="none" name="TSB-" legendType="none" />
              {/* CTL / ATL lines */}
              <Line yAxisId="left" type="monotone" dataKey="ctl" stroke="#3b82f6" strokeWidth={2} dot={false} name="CTL" />
              <Line yAxisId="left" type="monotone" dataKey="atl" stroke="#a855f7" strokeWidth={2} dot={false} name="ATL" />
              <Line yAxisId="left" type="monotone" dataKey="tsb" stroke="#22c55e" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="TSB" />
              {/* ACWR on right axis */}
              <Line yAxisId="right" type="monotone" dataKey="acwr" stroke="#f97316" strokeWidth={1.5} strokeDasharray="6 3" dot={false} name="ACWR" />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No PMC data yet. Complete some workouts to see your chart.
          </p>
        )}

        {/* Legend */}
        <div className="mt-2 flex flex-wrap gap-3 text-[10px]">
          {[
            { color: "#3b82f6", label: "CTL (Fitness)" },
            { color: "#a855f7", label: "ATL (Fatigue)" },
            { color: "#22c55e", label: "TSB (Form)" },
            { color: "#f97316", label: "ACWR (right)" },
          ].map((l) => (
            <span key={l.label} className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-5 rounded" style={{ background: l.color }} />
              <span className="text-muted-foreground">{l.label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── ACWR Gauge (enhanced) ── */}
      <div className="bg-card rounded-2xl border p-4">
        <SectionHeader
          title="ACWR Gauge"
          info="Current Acute:Chronic Workload Ratio with risk zones. Sweet spot 0.8–1.3 = lowest injury risk. Source: Hulin BT et al. (2016)."
          className="mb-3"
        />
        {currentAcwr != null ? (
          <ACWRGaugeEnhanced value={currentAcwr} />
        ) : loads.isLoading ? (
          <div className="bg-muted h-12 animate-pulse rounded-lg" />
        ) : (
          <p className="text-muted-foreground py-4 text-center text-sm">No data yet</p>
        )}
      </div>

      {/* ── Risk Zone Legend ── */}
      <div className="bg-card rounded-2xl border p-4">
        <h3 className="mb-3 text-sm font-semibold">Risk Zone Legend</h3>
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="text-base">⚫</span><span className="text-muted-foreground">&lt;0.8 — Under-training</span></span>
          <span className="flex items-center gap-1.5"><span className="text-base">🟢</span><span className="text-muted-foreground">0.8–1.3 — Optimal</span></span>
          <span className="flex items-center gap-1.5"><span className="text-base">🟡</span><span className="text-muted-foreground">1.3–1.5 — Caution</span></span>
          <span className="flex items-center gap-1.5"><span className="text-base">🔴</span><span className="text-muted-foreground">&gt;1.5 — High Risk</span></span>
        </div>
      </div> */}
      <div className="bg-card rounded-2xl border p-4">
        <SectionHeader
          title="Strain — 42 Day Trend"
          info="Training strain based on TRIMP (Training Impulse). Formula: TRIMP = duration × ΔHR/HRR × e^(k×ΔHR/HRR) where k=1.92 (male). Strain Score = 21 × (1 - e^(-TRIMP/250)). Shows acute (7-day) and chronic (42-day) exponential moving averages. Citation: Banister EW (1991), WHOOP strain model."
          className="mb-3"
        />
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

      {/* ── Load Focus ── */}
      <div className="bg-card rounded-2xl border p-4">
        <SectionHeader
          title="Load Focus"
          info="Balance between training intensities derived from zone distribution of recent activities. Shows percentage split between aerobic (Z1-2), threshold (Z3), and high-intensity (Z4-5) work. Endurance athletes should see >70% aerobic. Method: Zone minute aggregation over selected period."
          className="mb-3"
        />
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
        <SectionHeader
          title="Recovery Estimate"
          info="Estimated hours until full recovery based on recent strain, sleep quality, HRV trend, and resting heart rate. Higher strain + poor sleep = longer recovery. Light Zone 1 activity during recovery promotes blood flow and speeds adaptation. Method: Composite of TRIMP decay + recovery markers."
          className="mb-3"
        />
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
        <SectionHeader
          title="Daily Strain — Last 14 Days"
          info="Bar chart of daily TRIMP-based strain scores over 2 weeks. Formula: Strain = 21 × (1 - e^(-TRIMP/250)). Look for hard/easy alternation pattern — consecutive high-strain days increase overtraining risk. The 48-hour rule: allow 48h between high-intensity sessions. Citation: Banister (1991)."
          className="mb-3"
        />
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
          <SectionHeader
            title="Recommendation"
            info="AI-generated training recommendation combining: ACWR (injury risk), TSB (freshness = CTL - ATL), sleep quality score, and recent strain pattern. Suggests push/maintain/rest based on composite readiness. Method: Rule-based engine with sport science thresholds."
            className="mb-2"
          />
          <p className="text-sm leading-relaxed">
            {status.data.recommendation}
          </p>
        </div>
      )}

      <BottomNav />
    </main>
  );
}

/* ─────────────── ACWR Gauge Enhanced ─────────────── */

function ACWRGaugeEnhanced({ value }: { value: number }) {
  const clamped = Math.min(2, Math.max(0, value));
  const pct = (clamped / 2) * 100;
  const { label, color } = acwrStatus(value);

  // Zone widths: 0–0.8 (40%), 0.8–1.3 (25%), 1.3–1.5 (10%), 1.5–2.0 (25%)
  const segments = [
    { color: "#71717a", width: "40%", label: "Under" },
    { color: "#22c55e", width: "25%", label: "Optimal" },
    { color: "#eab308", width: "10%", label: "Caution" },
    { color: "#ef4444", width: "25%", label: "High Risk" },
  ];

  return (
    <div className="space-y-2">
      <div className="relative h-5 w-full overflow-hidden rounded-full">
        <div className="flex h-full w-full">
          {segments.map((s) => (
            <div key={s.label} style={{ width: s.width, backgroundColor: s.color + "60" }} />
          ))}
        </div>
        {/* Marker */}
        <div
          className="absolute top-0 h-full w-1.5 rounded-full bg-white shadow-lg transition-all"
          style={{ left: `calc(${pct}% - 3px)` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0</span><span>0.8</span><span>1.3</span><span>1.5</span><span>2.0</span>
      </div>
      <p className="text-center">
        <span className="text-xl font-bold">{value.toFixed(2)}</span>
        <span className={cn("ml-2 text-sm font-semibold", color)}>{label}</span>
      </p>
    </div>
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
