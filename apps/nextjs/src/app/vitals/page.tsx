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

import { useTRPC } from "~/trpc/react";
import { BottomNav } from "../_components/bottom-nav";
import { DateRangeSelector } from "../_components/date-range-selector";
import { SectionHeader } from "../_components/info-button";
import { IngressLink as Link } from "../_components/ingress-link";

/* ─────────────── status config ─────────────── */

const SPO2_STATUS: Record<
  string,
  { icon: string; label: string; cls: string; desc: string }
> = {
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

const RR_STATUS: Record<
  string,
  { icon: string; label: string; cls: string; desc: string }
> = {
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
    desc: "Respiration rate is 1-3 brpm above baseline. May indicate stress or early illness.",
  },
  high: {
    icon: "🔴",
    label: "High",
    cls: "bg-red-500/20 text-red-400 border-red-500/30",
    desc: "Respiration rate is >3 brpm above baseline. Strong illness/overreaching signal.",
  },
  no_data: {
    icon: "📊",
    label: "No Data",
    cls: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    desc: "No respiration rate data available yet.",
  },
};

const TEMP_STATUS: Record<
  string,
  { icon: string; label: string; cls: string; desc: string }
> = {
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

/* ─────────────── helpers ─────────────── */

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function StatCard({
  label,
  value,
  unit,
  subtext,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  subtext?: string;
}) {
  return (
    <div className="bg-card rounded-lg border p-3">
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <p className="text-foreground text-lg font-bold">
        {value ?? "—"}
        {unit && value !== null && (
          <span className="text-muted-foreground ml-0.5 text-xs">{unit}</span>
        )}
      </p>
      {subtext && (
        <p className="text-muted-foreground text-[10px]">{subtext}</p>
      )}
    </div>
  );
}

/* ─────────────── main page ─────────────── */

export default function VitalsPage() {
  const [days, setDays] = useState(30);
  const trpc = useTRPC();

  const { data, isLoading } = useQuery(
    trpc.vitals.getTrends.queryOptions({ days }),
  );

  const spo2 = data?.spo2;
  const rr = data?.respirationRate;
  const skinTemp = data?.skinTemp;

  return (
    <main className="bg-background text-foreground min-h-screen pb-24">
      <div className="mx-auto max-w-md space-y-6 px-4 pt-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold">🫁 Vitals</h1>
            <p className="text-muted-foreground text-xs">
              Blood oxygen, respiration, and skin temperature — key recovery
              biomarkers used by WHOOP, Oura, and sports science research.
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
            {/* ────── SpO2 Section ────── */}
            <section className="space-y-3">
              <SectionHeader
                title="Blood Oxygen (SpO2)"
                info="Pulse oximeter reading from your Garmin. Normal range is 95-100%. Drops below baseline may indicate altitude exposure, illness onset, sleep apnea, or overtraining. Each 1% below your baseline reduces readiness by ~20 points."
              />

              {/* Status badge */}
              {spo2 && (
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2",
                    SPO2_STATUS[spo2.status]?.cls,
                  )}
                >
                  <span className="text-lg">
                    {SPO2_STATUS[spo2.status]?.icon}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      {SPO2_STATUS[spo2.status]?.label}
                    </p>
                    <p className="text-[11px] opacity-80">
                      {SPO2_STATUS[spo2.status]?.desc}
                    </p>
                  </div>
                </div>
              )}

              {/* Stats */}
              {spo2 && (
                <div className="grid grid-cols-3 gap-2">
                  <StatCard label="Latest" value={spo2.latest} unit="%" />
                  <StatCard label="Baseline" value={spo2.baseline} unit="%" />
                  <StatCard
                    label="Deviation"
                    value={
                      spo2.deviation !== null
                        ? `${spo2.deviation > 0 ? "+" : ""}${spo2.deviation}%`
                        : null
                    }
                  />
                </div>
              )}

              {/* Chart */}
              {spo2 && spo2.daily.length > 0 ? (
                <div className="bg-card rounded-lg border p-3">
                  <ResponsiveContainer width="100%" height={180}>
                    <ComposedChart
                      data={spo2.daily.map((d, i) => ({
                        date: d.date,
                        value: d.value,
                        avg: spo2.rolling7d[i]?.value,
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
                        domain={[88, 100]}
                        tick={{ fill: "#888", fontSize: 10 }}
                        axisLine={false}
                        width={30}
                      />
                      <Tooltip
                        labelFormatter={(label: unknown) =>
                          formatDate(String(label))
                        }
                        formatter={(v: unknown) => [`${Number(v)}%`, ""]}
                        contentStyle={{
                          background: "#1a1a2e",
                          border: "1px solid #333",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      {spo2.baseline && (
                        <ReferenceLine
                          y={spo2.baseline}
                          stroke="#666"
                          strokeDasharray="4 4"
                          label={{
                            value: "baseline",
                            fill: "#666",
                            fontSize: 10,
                          }}
                        />
                      )}
                      <ReferenceLine
                        y={95}
                        stroke="#ef4444"
                        strokeDasharray="2 2"
                        label={{
                          value: "95%",
                          fill: "#ef4444",
                          fontSize: 10,
                        }}
                      />
                      <Area
                        dataKey="value"
                        fill="#3b82f6"
                        fillOpacity={0.15}
                        stroke="none"
                      />
                      <Line
                        dataKey="value"
                        stroke="#3b82f6"
                        strokeWidth={1.5}
                        dot={{ r: 2, fill: "#3b82f6" }}
                        name="SpO2"
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
                    {spo2.daysWithData} days with data · 7d rolling avg in amber
                  </p>
                </div>
              ) : (
                !isLoading && (
                  <p className="text-muted-foreground py-4 text-center text-xs">
                    No SpO2 data in this period. Ensure pulse ox is enabled on
                    your Garmin.
                  </p>
                )
              )}
            </section>

            {/* ────── Respiration Rate Section ────── */}
            <section className="space-y-3">
              <SectionHeader
                title="Respiration Rate"
                info="Average breathing rate during sleep (breaths per minute). Normal: 12-20 brpm. Elevated RR (>2 brpm above your baseline) is an early marker of illness, overreaching, or stress (Buchheit 2014). Used in WHOOP's recovery algorithm."
              />

              {rr && (
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2",
                    RR_STATUS[rr.status]?.cls,
                  )}
                >
                  <span className="text-lg">{RR_STATUS[rr.status]?.icon}</span>
                  <div>
                    <p className="text-sm font-semibold">
                      {RR_STATUS[rr.status]?.label}
                    </p>
                    <p className="text-[11px] opacity-80">
                      {RR_STATUS[rr.status]?.desc}
                    </p>
                  </div>
                </div>
              )}

              {rr && (
                <div className="grid grid-cols-3 gap-2">
                  <StatCard
                    label="Latest"
                    value={rr.latest ? Math.round(rr.latest * 10) / 10 : null}
                    unit="brpm"
                  />
                  <StatCard label="Baseline" value={rr.baseline} unit="brpm" />
                  <StatCard
                    label="Deviation"
                    value={
                      rr.deviation !== null
                        ? `${rr.deviation > 0 ? "+" : ""}${rr.deviation}%`
                        : null
                    }
                  />
                </div>
              )}

              {rr && rr.daily.length > 0 ? (
                <div className="bg-card rounded-lg border p-3">
                  <ResponsiveContainer width="100%" height={180}>
                    <ComposedChart
                      data={rr.daily.map((d, i) => ({
                        date: d.date,
                        value: Math.round(d.value * 10) / 10,
                        avg: rr.rolling7d[i]?.value,
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
                        tick={{ fill: "#888", fontSize: 10 }}
                        axisLine={false}
                        width={30}
                      />
                      <Tooltip
                        labelFormatter={(label: unknown) =>
                          formatDate(String(label))
                        }
                        formatter={(v: unknown) => [`${Number(v)} brpm`, ""]}
                        contentStyle={{
                          background: "#1a1a2e",
                          border: "1px solid #333",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      {rr.baseline && (
                        <ReferenceLine
                          y={rr.baseline}
                          stroke="#666"
                          strokeDasharray="4 4"
                          label={{
                            value: "baseline",
                            fill: "#666",
                            fontSize: 10,
                          }}
                        />
                      )}
                      <Area
                        dataKey="value"
                        fill="#10b981"
                        fillOpacity={0.15}
                        stroke="none"
                      />
                      <Line
                        dataKey="value"
                        stroke="#10b981"
                        strokeWidth={1.5}
                        dot={{ r: 2, fill: "#10b981" }}
                        name="RR"
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
                    {rr.daysWithData} days with data · 7d rolling avg in amber
                  </p>
                </div>
              ) : (
                !isLoading && (
                  <p className="text-muted-foreground py-4 text-center text-xs">
                    No respiration data in this period.
                  </p>
                )
              )}
            </section>

            {/* ────── Skin Temperature Section ────── */}
            <section className="space-y-3">
              <SectionHeader
                title="Skin Temperature"
                info="Wrist skin temperature deviation from your personal baseline. Elevated skin temp (+0.5°C or more) is a strong early indicator of illness — this is one of WHOOP's key recovery signals. Hormonal cycles can also cause regular fluctuations."
              />

              {skinTemp && (
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2",
                    TEMP_STATUS[skinTemp.status]?.cls,
                  )}
                >
                  <span className="text-lg">
                    {TEMP_STATUS[skinTemp.status]?.icon}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      {TEMP_STATUS[skinTemp.status]?.label}
                    </p>
                    <p className="text-[11px] opacity-80">
                      {TEMP_STATUS[skinTemp.status]?.desc}
                    </p>
                  </div>
                </div>
              )}

              {skinTemp && (
                <div className="grid grid-cols-3 gap-2">
                  <StatCard
                    label="Latest"
                    value={
                      skinTemp.latest
                        ? Math.round(skinTemp.latest * 10) / 10
                        : null
                    }
                    unit="°C"
                  />
                  <StatCard
                    label="Baseline"
                    value={skinTemp.baseline}
                    unit="°C"
                  />
                  <StatCard
                    label="Deviation"
                    value={
                      skinTemp.deviation !== null
                        ? `${skinTemp.deviation > 0 ? "+" : ""}${skinTemp.deviation}%`
                        : null
                    }
                  />
                </div>
              )}

              {skinTemp && skinTemp.daily.length > 0 ? (
                <div className="bg-card rounded-lg border p-3">
                  <ResponsiveContainer width="100%" height={180}>
                    <ComposedChart
                      data={skinTemp.daily.map((d, i) => ({
                        date: d.date,
                        value: Math.round(d.value * 10) / 10,
                        avg: skinTemp.rolling7d[i]?.value,
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
                        tick={{ fill: "#888", fontSize: 10 }}
                        axisLine={false}
                        width={35}
                      />
                      <Tooltip
                        labelFormatter={(label: unknown) =>
                          formatDate(String(label))
                        }
                        formatter={(v: unknown) => [`${Number(v)}°C`, ""]}
                        contentStyle={{
                          background: "#1a1a2e",
                          border: "1px solid #333",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      {skinTemp.baseline && (
                        <ReferenceLine
                          y={skinTemp.baseline}
                          stroke="#666"
                          strokeDasharray="4 4"
                          label={{
                            value: "baseline",
                            fill: "#666",
                            fontSize: 10,
                          }}
                        />
                      )}
                      <Area
                        dataKey="value"
                        fill="#f43f5e"
                        fillOpacity={0.15}
                        stroke="none"
                      />
                      <Line
                        dataKey="value"
                        stroke="#f43f5e"
                        strokeWidth={1.5}
                        dot={{ r: 2, fill: "#f43f5e" }}
                        name="Skin Temp"
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
                    {skinTemp.daysWithData} days with data · 7d rolling avg in
                    amber
                  </p>
                </div>
              ) : (
                !isLoading && (
                  <p className="text-muted-foreground py-4 text-center text-xs">
                    No skin temperature data in this period.
                  </p>
                )
              )}
            </section>

            {/* ────── Science / WHOOP Context ────── */}
            <section className="bg-card rounded-lg border p-4">
              <h3 className="text-foreground mb-2 text-sm font-semibold">
                🔬 How These Vitals Affect Recovery
              </h3>
              <div className="text-muted-foreground space-y-2 text-xs leading-relaxed">
                <p>
                  <strong className="text-foreground">SpO2</strong> — Nocturnal
                  oxygen saturation dips below your personal baseline correlate
                  with altitude acclimatization stress, sleep apnea, and
                  overtraining syndrome (Millet et al., 2016).
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
                <p className="pt-1 italic opacity-70">
                  All three vitals are now included in your readiness score
                  calculation (SpO2: 8%, RR: 7%, Skin Temp: 7%).
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
