"use client";

import { useState } from "react";
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

import { useUserTimezone } from "~/lib/format-date";
import { useTRPC } from "~/trpc/react";
import { BottomNav } from "../_components/bottom-nav";
import { DateRangeSelector } from "../_components/date-range-selector";
import { SectionHeader } from "../_components/info-button";
import { IngressLink as Link } from "../_components/ingress-link";

/* ─────────────── status config ─────────────── */

type StatusConfig = Record<
  string,
  { icon: string; label: string; cls: string; desc: string }
>;

const SPO2_STATUS: StatusConfig = {
  normal: {
    icon: "✅",
    label: "Normal",
    cls: "bg-green-500/20 text-green-400 border-green-500/30",
    desc: "SpO2 is in normal range (≥95%). Adequate oxygen saturation.",
  },
  low: {
    icon: "⚠️",
    label: "Low",
    cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    desc: "SpO2 is 90-94%. May indicate altitude, mild illness, or overtraining.",
  },
  critical: {
    icon: "🚨",
    label: "Critical",
    cls: "bg-red-500/20 text-red-400 border-red-500/30",
    desc: "SpO2 below 90%. Seek medical attention if persistent.",
  },
  no_data: {
    icon: "📊",
    label: "No Data",
    cls: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    desc: "No SpO2 data available yet.",
  },
};

const RR_STATUS: StatusConfig = {
  normal: {
    icon: "✅",
    label: "Normal",
    cls: "bg-green-500/20 text-green-400 border-green-500/30",
    desc: "Respiration rate is near your baseline. Good recovery sign.",
  },
  elevated: {
    icon: "⚠️",
    label: "Elevated",
    cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    desc: "Respiration rate is 3-7% above baseline. May indicate stress or early illness.",
  },
  high: {
    icon: "🔴",
    label: "High",
    cls: "bg-red-500/20 text-red-400 border-red-500/30",
    desc: "Respiration rate is >7% above baseline. Strong illness/overreaching signal.",
  },
  no_data: {
    icon: "📊",
    label: "No Data",
    cls: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    desc: "No respiration rate data available yet.",
  },
};

const TEMP_STATUS: StatusConfig = {
  normal: {
    icon: "✅",
    label: "Normal",
    cls: "bg-green-500/20 text-green-400 border-green-500/30",
    desc: "Skin temperature is within ±0.3°C of baseline.",
  },
  elevated: {
    icon: "⚠️",
    label: "Elevated",
    cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    desc: "Skin temp deviation 0.3-0.8°C. May indicate early illness or hormonal shift.",
  },
  high: {
    icon: "🔴",
    label: "High",
    cls: "bg-red-500/20 text-red-400 border-red-500/30",
    desc: "Skin temp deviation >0.8°C above baseline. Strong illness signal.",
  },
  no_data: {
    icon: "📊",
    label: "No Data",
    cls: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    desc: "No skin temperature data available yet.",
  },
};

const RHR_STATUS: StatusConfig = {
  normal: {
    icon: "✅",
    label: "Normal",
    cls: "bg-green-500/20 text-green-400 border-green-500/30",
    desc: "Resting heart rate is at or below your 30-day baseline.",
  },
  elevated: {
    icon: "⚠️",
    label: "Elevated",
    cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    desc: "RHR is 3-7% above baseline. Watch recovery and illness signals.",
  },
  high: {
    icon: "🔴",
    label: "High",
    cls: "bg-red-500/20 text-red-400 border-red-500/30",
    desc: "RHR is >7% above baseline. Consider rest or easy training.",
  },
  no_data: {
    icon: "📊",
    label: "No Data",
    cls: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    desc: "No resting heart rate data available yet.",
  },
};

const BODY_BATTERY_STATUS: StatusConfig = {
  normal: {
    icon: "✅",
    label: "Charged",
    cls: "bg-green-500/20 text-green-400 border-green-500/30",
    desc: "Daily Body Battery peak is near or above your 30-day baseline.",
  },
  low: {
    icon: "⚠️",
    label: "Low",
    cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    desc: "Daily peak is 3-7% below baseline. Recovery may be lagging.",
  },
  depleted: {
    icon: "🔴",
    label: "Depleted",
    cls: "bg-red-500/20 text-red-400 border-red-500/30",
    desc: "Daily peak is >7% below baseline. Prioritize recovery.",
  },
  no_data: {
    icon: "📊",
    label: "No Data",
    cls: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    desc: "No Body Battery data available yet.",
  },
};

const STRESS_STATUS: StatusConfig = {
  normal: {
    icon: "✅",
    label: "Low",
    cls: "bg-green-500/20 text-green-400 border-green-500/30",
    desc: "Stress score is at or below your 30-day baseline.",
  },
  elevated: {
    icon: "⚠️",
    label: "Elevated",
    cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    desc: "Stress is 3-7% above baseline. Recovery load is rising.",
  },
  high: {
    icon: "🔴",
    label: "High",
    cls: "bg-red-500/20 text-red-400 border-red-500/30",
    desc: "Stress is >7% above baseline. Consider reducing training load.",
  },
  no_data: {
    icon: "📊",
    label: "No Data",
    cls: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    desc: "No stress score data available yet.",
  },
};

/* ─────────────── helpers ─────────────── */

type TrendPoint = { date: string; value: number };
type VitalMetric = {
  daily: TrendPoint[];
  rolling7d: TrendPoint[];
  baseline: number | null;
  latest: number | null;
  status: string;
  deviation: number | null;
  daysWithData: number;
  baselineDays: number;
};

type Preference = "higher" | "lower";

const COMPACT_UNITS = new Set(["%", "°C"]);

function formatDate(d: string) {
  // Note: chart axis labels — noon-UTC anchor is acceptable here since
  // we only render month/day on the axis, not the full timestamp.
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatNumber(value: number): string {
  const rounded = round1(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatWithUnit(value: number, unit?: string): string {
  const formatted = formatNumber(value);
  if (!unit) return formatted;
  return COMPACT_UNITS.has(unit)
    ? `${formatted}${unit}`
    : `${formatted} ${unit}`;
}

function formatDeviation(
  value: number | null,
  unit: "%" | "°C",
): string | null {
  if (value === null) return null;
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatNumber(value)}${unit}`;
}

function deviationClass(
  deviation: number | null,
  preference: Preference | null,
): string | undefined {
  if (deviation === null || preference === null) return undefined;

  if (preference === "higher") {
    if (deviation < -7) return "text-red-400";
    if (deviation < -3) return "text-yellow-400";
    if (deviation > 3) return "text-green-400";
    return undefined;
  }

  if (deviation > 7) return "text-red-400";
  if (deviation > 3) return "text-yellow-400";
  if (deviation < -3) return "text-green-400";
  return undefined;
}

function baselineSubtext(metric: VitalMetric): string | undefined {
  if (metric.baseline !== null || metric.baselineDays >= 30) return undefined;
  return `Still warming up (${metric.baselineDays} days)`;
}

function Unit({ unit, className }: { unit: string; className: string }) {
  return <span className={className}>{unit}</span>;
}

function StatCard({
  label,
  value,
  unit,
  subtext,
  valueClassName,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  subtext?: string;
  valueClassName?: string;
}) {
  const isCompactUnit = Boolean(unit && COMPACT_UNITS.has(unit));
  const displayValue =
    isCompactUnit && value !== null ? `${value}${unit}` : (value ?? "—");

  return (
    <div className="bg-card rounded-lg border p-3">
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <p className={cn("text-foreground text-lg font-bold", valueClassName)}>
        {displayValue}
        {unit && !isCompactUnit && value !== null && (
          <Unit unit={unit} className="text-muted-foreground ml-1 text-xs" />
        )}
      </p>
      {subtext && (
        <p className="text-muted-foreground text-[10px]">{subtext}</p>
      )}
    </div>
  );
}

function VitalMetricSection({
  title,
  info,
  metric,
  statusConfig,
  unit,
  color,
  chartName,
  emptyMessage,
  preference,
  latestLabel = "Latest",
  deviationUnit = "%",
  yDomain,
  referenceLines = [],
}: {
  title: string;
  info: string;
  metric: VitalMetric | undefined;
  statusConfig: StatusConfig;
  unit?: string;
  color: string;
  chartName: string;
  emptyMessage: string;
  preference: Preference | null;
  latestLabel?: string;
  deviationUnit?: "%" | "°C";
  yDomain?: [number, number];
  referenceLines?: { y: number; label: string; color: string }[];
}) {
  const status = metric ? statusConfig[metric.status] : undefined;

  return (
    <section className="space-y-3">
      <SectionHeader title={title} info={info} />

      {metric && status && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2",
            status.cls,
          )}
        >
          <span className="text-lg">{status.icon}</span>
          <div>
            <p className="text-sm font-semibold">{status.label}</p>
            <p className="text-[11px] opacity-80">{status.desc}</p>
          </div>
        </div>
      )}

      {metric && (
        <div className="grid grid-cols-3 gap-2">
          <StatCard
            label={latestLabel}
            value={metric.latest != null ? formatNumber(metric.latest) : null}
            unit={unit}
          />
          <StatCard
            label="Baseline"
            value={
              metric.baseline != null ? formatNumber(metric.baseline) : null
            }
            unit={unit}
            subtext={baselineSubtext(metric)}
          />
          <StatCard
            label="Deviation"
            value={formatDeviation(metric.deviation, deviationUnit)}
            valueClassName={deviationClass(metric.deviation, preference)}
          />
        </div>
      )}

      {metric && metric.daily.length > 0 ? (
        <div className="bg-card rounded-lg border p-3">
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart
              data={metric.daily.map((d, i) => ({
                date: d.date,
                value: round1(d.value),
                avg: metric.rolling7d[i]?.value,
              }))}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#333"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fill: "#888", fontSize: 10 }}
                axisLine={false}
              />
              <YAxis
                domain={yDomain}
                tick={{ fill: "#888", fontSize: 10 }}
                axisLine={false}
                width={35}
              />
              <Tooltip
                labelFormatter={(label: unknown) => formatDate(String(label))}
                formatter={(v: unknown) => [
                  formatWithUnit(Number(v), unit),
                  "",
                ]}
                contentStyle={{
                  background: "#1a1a2e",
                  border: "1px solid #333",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              {metric.baseline !== null && (
                <ReferenceLine
                  y={metric.baseline}
                  stroke="#666"
                  strokeDasharray="4 4"
                  label={{
                    value: "baseline",
                    fill: "#666",
                    fontSize: 10,
                    position: "insideTopRight",
                  }}
                />
              )}
              {referenceLines.map((line) => (
                <ReferenceLine
                  key={`${line.y}-${line.label}`}
                  y={line.y}
                  stroke={line.color}
                  strokeDasharray="2 2"
                  label={{ value: line.label, fill: line.color, fontSize: 10 }}
                />
              ))}
              <Area
                dataKey="value"
                fill={color}
                fillOpacity={0.15}
                stroke="none"
              />
              <Line
                dataKey="value"
                stroke={color}
                strokeWidth={1.5}
                dot={{ r: 2, fill: color }}
                name={chartName}
              />
              <Line
                dataKey="avg"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="4 2"
                dot={false}
                name="7d Avg"
              />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-muted-foreground mt-1 text-center text-[10px]">
            {metric.daysWithData} days with data · 7d rolling avg in amber
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground py-4 text-center text-xs">
          {emptyMessage}
        </p>
      )}
    </section>
  );
}

/* ─────────────── main page ─────────────── */

export default function VitalsPage() {
  const [days, setDays] = useState(30);
  const trpc = useTRPC();
  const timezone = useUserTimezone();

  const { data, isLoading } = useQuery(
    trpc.vitals.getTrends.queryOptions({ days }),
  );

  return (
    <main className="bg-background text-foreground min-h-screen pb-24">
      <div className="mx-auto max-w-md space-y-6 px-4 pt-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold">🫁 Vitals</h1>
            <p className="text-muted-foreground text-xs">
              Blood oxygen, respiration, temperature, heart rate, Body Battery,
              stress, and body composition — key recovery biomarkers from
              Garmin.
            </p>
          </div>
          <Link
            href="/hrv"
            className="text-primary mt-1 rounded-md border px-2 py-1 text-xs whitespace-nowrap hover:bg-zinc-800"
          >
            💓 HRV
          </Link>
        </div>

        <DateRangeSelector
          value={days}
          onChange={setDays}
          presets={[
            { label: "7d", days: 7 },
            { label: "14d", days: 14 },
            { label: "30d", days: 30 },
            { label: "90d", days: 90 },
          ]}
        />

        {isLoading && (
          <div className="text-muted-foreground py-12 text-center text-sm">
            Loading vitals data...
          </div>
        )}

        {!isLoading && data && (
          <>
            <VitalMetricSection
              title="Blood Oxygen (SpO2)"
              info="Pulse oximeter reading from your Garmin. Normal range is 95-100%. Drops below baseline may indicate altitude exposure, illness onset, sleep apnea, or overtraining. Each 1% below your baseline reduces readiness by ~20 points."
              metric={data.spo2}
              statusConfig={SPO2_STATUS}
              unit="%"
              color="#3b82f6"
              chartName="SpO2"
              emptyMessage="No SpO2 data in this period. Ensure pulse ox is enabled on your Garmin."
              preference="higher"
              yDomain={[88, 100]}
              referenceLines={[{ y: 95, label: "95%", color: "#ef4444" }]}
            />

            <VitalMetricSection
              title="Resting Heart Rate"
              info="Lowest resting heart rate measured by Garmin. Lower values versus your 30-day baseline generally indicate better recovery; sustained elevation can signal fatigue, heat stress, alcohol, or early illness."
              metric={data.restingHr}
              statusConfig={RHR_STATUS}
              unit="bpm"
              color="#f97316"
              chartName="RHR"
              emptyMessage="No resting heart rate data in this period."
              preference="lower"
            />

            <VitalMetricSection
              title="Body Battery"
              info="Garmin Body Battery estimates available energy from heart-rate variability, stress, and sleep. This card uses the daily peak (body_battery_high, falling back to end-of-day) on a 0-100 scale. Higher is better."
              metric={data.bodyBattery}
              statusConfig={BODY_BATTERY_STATUS}
              color="#22c55e"
              chartName="Body Battery"
              emptyMessage="No Body Battery data in this period."
              preference="higher"
              latestLabel="Daily Peak"
              yDomain={[0, 100]}
            />

            <VitalMetricSection
              title="Stress"
              info="Garmin all-day stress score estimates sympathetic load from HRV. Lower stress versus your 30-day baseline is better; sustained elevation can reduce recovery capacity."
              metric={data.stress}
              statusConfig={STRESS_STATUS}
              color="#a855f7"
              chartName="Stress"
              emptyMessage="No stress score data in this period."
              preference="lower"
              yDomain={[0, 100]}
            />

            <VitalMetricSection
              title="Respiration Rate"
              info="Average breathing rate during sleep (breaths per minute). Normal: 12-20 brpm. Elevated RR (>2 brpm above your baseline) is an early marker of illness, overreaching, or stress (Buchheit 2014). Used in WHOOP's recovery algorithm."
              metric={data.respirationRate}
              statusConfig={RR_STATUS}
              unit="brpm"
              color="#10b981"
              chartName="RR"
              emptyMessage="No respiration data in this period."
              preference="lower"
            />

            <VitalMetricSection
              title="Skin Temperature"
              info="Wrist skin temperature deviation from your personal baseline. Elevated skin temp (+0.5°C or more) is a strong early indicator of illness — this is one of WHOOP's key recovery signals. Hormonal cycles can also cause regular fluctuations."
              metric={data.skinTemp}
              statusConfig={TEMP_STATUS}
              unit="°C"
              color="#f43f5e"
              chartName="Skin Temp"
              emptyMessage="No skin temperature data in this period."
              preference={null}
              deviationUnit="°C"
            />

            <section className="space-y-3">
              <SectionHeader
                title="Body Composition"
                info="Weight and body-fat trends require a compatible Garmin Index scale or body-composition source. The current daily_metric schema does not include weight/body-fat columns, so this card degrades gracefully until those fields are available."
              />
              <div className="bg-card rounded-lg border p-4 text-center">
                <div className="mb-2 text-3xl">⚖️</div>
                <p className="text-foreground text-sm font-semibold">
                  {data.bodyComposition.message}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Weight and body-fat metrics will appear here when body
                  composition columns are available in daily_metric.
                </p>
              </div>
            </section>

            {/* ────── Science / WHOOP Context ────── */}
            <section className="bg-card rounded-lg border p-4">
              <h3 className="text-foreground mb-2 text-sm font-semibold">
                🔬 How These Vitals Affect Recovery
              </h3>
              <div className="text-muted-foreground space-y-2 text-xs leading-relaxed">
                <p>
                  <strong className="text-foreground">RHR + Stress</strong> —
                  Elevated resting HR and stress versus a personal 30-day
                  baseline indicate higher autonomic load and reduced readiness.
                </p>
                <p>
                  <strong className="text-foreground">Body Battery</strong> — A
                  lower daily peak suggests incomplete overnight recharge or
                  elevated stress load, even when training volume is unchanged.
                </p>
                <p>
                  <strong className="text-foreground">SpO2</strong> — Nocturnal
                  oxygen saturation dips below baseline correlate with altitude
                  acclimatization stress, sleep apnea, and overtraining syndrome
                  (Millet et al., 2016).
                </p>
                <p>
                  <strong className="text-foreground">Respiration Rate</strong>{" "}
                  — Elevated sleep RR (&gt;2 brpm above baseline) is one of the
                  earliest biomarkers of illness onset and autonomic stress,
                  used in Buchheit&apos;s (2014) monitoring framework.
                </p>
                <p>
                  <strong className="text-foreground">Skin Temperature</strong>{" "}
                  — WHOOP&apos;s recovery model heavily weights wrist skin temp
                  deviation. A +0.5°C shift predicts illness 1-2 days before
                  symptoms appear (Miller et al., 2018).
                </p>
              </div>
            </section>
          </>
        )}
      </div>
      <BottomNav />
    </main>
  );
}
