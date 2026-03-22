"use client";

// Power Curves & Critical Power Analytics

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@acme/ui";
import { useTRPC } from "~/trpc/react";
import { BottomNav } from "../_components/bottom-nav";
import { SectionHeader } from "../_components/info-button";

/* ─────────────── helpers ─────────────── */

function fmtDuration(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** W' depletion remaining (kJ) at time t (seconds) above CP */
function wPrimeRemaining(wPrimeKj: number, cp: number, power: number, t: number): number {
  return Math.max(0, wPrimeKj - (power - cp) * t / 1000);
}

/* ─────────────── types ─────────────── */

interface AdvancedMetric {
  cp?: number | null;
  wPrime?: number | null;
  mFtp?: number | null;
}

interface ActivityData {
  id: string;
  sportType?: string | null;
  durationMinutes?: number | null;
  avgPower?: number | null;
  normalizedPower?: number | null;
  startedAt?: Date | string | null;
}

/* ─────────────── page ─────────────── */

export default function PowerPage() {
  const trpc = useTRPC();

  // @ts-ignore — route added by gc-backend branch
  const latest = useQuery(trpc.advancedMetrics.getLatest.queryOptions());
  const activities = useQuery(trpc.activity.list.queryOptions({ days: 90 }));

  const metric = latest.data as AdvancedMetric | null | undefined;
  const cp = metric?.cp ?? null;
  const wPrime = metric?.wPrime ?? null; // in kJ
  const mFtp = metric?.mFtp ?? null;

  /* ── Power-Duration Curve data ── */
  const DURATION_BUCKETS = [1, 5, 10, 20, 30, 60];

  const pdCurveData = useMemo(() => {
    const acts = (activities.data ?? []) as ActivityData[];
    return DURATION_BUCKETS.map((bucket) => {
      const relevant = acts.filter((a) => {
        const dur = a.durationMinutes ?? 0;
        return dur >= bucket * 0.8 && dur <= bucket * 1.2;
      });
      const powers = relevant
        .map((a) => a.normalizedPower ?? a.avgPower ?? 0)
        .filter((p) => p > 0);
      const best = powers.length > 0 ? Math.max(...powers) : null;
      return { label: fmtDuration(bucket), power: best, cp: cp };
    });
  }, [activities.data, cp]);

  /* ── W' Depletion Curves ── */
  const DEPLETION_COLORS = ["#ef4444", "#f97316", "#eab308", "#3b82f6"];
  const wPrimeData = useMemo(() => {
    if (!cp || !wPrime) return [];
    const fractions = [1.05, 1.1, 1.2, 1.5];
    const maxTime = 1200; // 20 minutes
    const steps = 20;
    return fractions.map((frac, i) => {
      const power = cp * frac;
      const limitSec = wPrime * 1000 / (power - cp);
      const end = Math.min(limitSec, maxTime);
      const points = Array.from({ length: steps + 1 }, (_, k) => {
        const t = (end * k) / steps;
        return { t: Math.round(t), remaining: wPrimeRemaining(wPrime, cp, power, t) };
      });
      return {
        key: `${Math.round(frac * 100)}%`,
        label: `${Math.round(frac * 100)}% CP (${Math.round(power)}W)`,
        points,
        color: DEPLETION_COLORS[i] ?? "#888",
      };
    });
  }, [cp, wPrime]);

  /* ── Recent power activities ── */
  const powerActivities = useMemo(() => {
    const acts = (activities.data ?? []) as ActivityData[];
    return acts.filter((a) => (a.avgPower ?? 0) > 0).slice(0, 10);
  }, [activities.data]);

  const hasCpData = cp != null && wPrime != null;

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pb-24 pt-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold">Power &amp; CP Analytics</h1>
        <p className="text-muted-foreground text-sm">
          Critical Power · W&apos; · Power-Duration Curve
        </p>
      </div>

      {/* ── CP Summary ── */}
      <div className="bg-card rounded-2xl border p-4">
        <SectionHeader
          title="Critical Power Summary"
          info="Critical Power (CP) is the highest sustainable power output. W' (W-prime) is the anaerobic work capacity above CP in kJ. mFTP ≈ 95% CP. Method: 3-parameter CP model from multi-duration best efforts."
          className="mb-3"
        />
        {latest.isLoading ? (
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-muted h-16 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : hasCpData ? (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-secondary/40 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-blue-400">{Math.round(cp)}W</p>
              <p className="text-muted-foreground mt-0.5 text-xs">Critical Power</p>
            </div>
            <div className="bg-secondary/40 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-purple-400">{wPrime.toFixed(1)}kJ</p>
              <p className="text-muted-foreground mt-0.5 text-xs">W&apos;</p>
            </div>
            <div className="bg-secondary/40 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-green-400">
                {mFtp != null ? `${Math.round(mFtp)}W` : `${Math.round(cp * 0.95)}W`}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">mFTP</p>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground py-4 text-center text-sm">
            Insufficient power data — complete 3+ workouts with a power meter
          </p>
        )}
      </div>

      {/* ── Power-Duration Curve ── */}
      <div className="bg-card rounded-2xl border p-4">
        <SectionHeader
          title="Power-Duration Curve"
          info="Best power output at each duration from last 90 days. Uses Normalized Power when available. Each point is the highest power from activities matching that duration ±20%."
          className="mb-3"
        />
        {activities.isLoading ? (
          <div className="bg-muted h-48 animate-pulse rounded-lg" />
        ) : pdCurveData.some((d) => d.power != null) ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={pdCurveData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="label" tick={{ fill: "#888", fontSize: 10 }} />
              <YAxis tick={{ fill: "#888", fontSize: 10 }} width={40} unit="W" />
              <Tooltip
                contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: 8, fontSize: 12 }}
                formatter={(v: unknown) => `${Math.round(Number(v))} W`}
              />
              <Line
                type="monotone"
                dataKey="power"
                stroke="#f97316"
                strokeWidth={2}
                dot={{ fill: "#f97316", r: 4 }}
                connectNulls
                name="Best Power"
              />
              {cp != null && (
                <Line
                  type="monotone"
                  dataKey="cp"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                  dot={false}
                  name="CP"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No power data yet — complete rides/runs with a power meter.
          </p>
        )}
      </div>

      {/* ── W' Depletion Chart ── */}
      {hasCpData && wPrimeData.length > 0 && (
        <div className="bg-card rounded-2xl border p-4">
          <SectionHeader
            title="W′ Depletion Model"
            info="How quickly W' depletes above CP at various intensities. Formula: t_lim = W' / (Power − CP). At 150% CP, W' depletes in seconds. Use to pace intervals. Citation: Monod & Scherrer (1965), Morton (1996)."
            className="mb-3"
          />
          <ResponsiveContainer width="100%" height={200}>
            <LineChart margin={{ top: 5, right: 5, left: -5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                type="number"
                dataKey="t"
                name="Time"
                unit="s"
                tick={{ fill: "#888", fontSize: 10 }}
                allowDuplicatedCategory={false}
              />
              <YAxis tick={{ fill: "#888", fontSize: 10 }} width={36} unit="kJ" />
              <Tooltip
                contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: 8, fontSize: 12 }}
                formatter={(v: unknown) => `${Number(v).toFixed(1)} kJ`}
                labelFormatter={(label) => `Time: ${label}s`}
              />
              {wPrimeData.map((series) => (
                <Line
                  key={series.key}
                  data={series.points}
                  type="monotone"
                  dataKey="remaining"
                  stroke={series.color}
                  strokeWidth={2}
                  dot={false}
                  name={series.label}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap gap-3 text-[10px]">
            {wPrimeData.map((s) => (
              <span key={s.key} className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-5 rounded" style={{ background: s.color }} />
                <span className="text-muted-foreground">{s.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent Power Activities ── */}
      <div className="bg-card rounded-2xl border p-4">
        <SectionHeader
          title="Recent Power Activities"
          info="Last 10 activities with power data. Intensity Factor (IF) = NP/FTP. TSS estimate = duration × NP × IF / (FTP × 3600) × 100."
          className="mb-3"
        />
        {activities.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-muted h-12 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : powerActivities.length > 0 ? (
          <div className="space-y-2">
            {powerActivities.map((act) => {
              const ftp = mFtp ?? (cp != null ? cp * 0.95 : null);
              const np = act.normalizedPower ?? act.avgPower ?? 0;
              const IF = ftp && ftp > 0 ? np / ftp : null;
              const tssEst =
                ftp && IF != null && act.durationMinutes
                  ? Math.round((act.durationMinutes * 60 * np * IF) / (ftp * 3600) * 100)
                  : null;
              const intensity =
                IF == null
                  ? "text-muted-foreground"
                  : IF < 0.75
                    ? "text-blue-400"
                    : IF < 0.9
                      ? "text-green-400"
                      : IF < 1.05
                        ? "text-yellow-400"
                        : "text-red-400";

              return (
                <div
                  key={act.id}
                  className="flex items-center justify-between rounded-xl bg-secondary/40 px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {act.sportType?.replace(/_/g, " ") ?? "Activity"}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {act.durationMinutes != null
                        ? fmtDuration(Math.round(act.durationMinutes))
                        : "—"}
                      {tssEst != null && ` · TSS ~${tssEst}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn("font-bold", intensity)}>
                      {Math.round(np)} W
                    </p>
                    {IF != null && (
                      <p className="text-muted-foreground text-xs">
                        IF {IF.toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-muted-foreground py-4 text-center text-sm">
            No power activities found in the last 90 days.
          </p>
        )}
      </div>

      <BottomNav />
    </main>
  );
}
