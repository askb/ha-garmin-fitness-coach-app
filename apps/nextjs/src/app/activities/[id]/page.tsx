"use client";

import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";

import { IngressLink as Link } from "~/app/_components/ingress-link";
import { useTRPC } from "~/trpc/react";
import { BottomNav } from "../../_components/bottom-nav";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(minutes: number | null): string {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

function formatDistance(meters: number | null): string {
  if (meters == null) return "—";
  const km = meters / 1000;
  return km >= 1 ? `${km.toFixed(2)} km` : `${Math.round(meters)} m`;
}

function formatPace(secPerKm: number | null): string {
  if (secPerKm == null) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function sportLabel(sportType: string | null): string {
  if (!sportType) return "Activity";
  return sportType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const SPORT_ICONS: Record<string, string> = {
  running: "🏃",
  trail_running: "🏃",
  cycling: "🚴",
  strength_training: "🏋️",
  swimming: "🏊",
  walking: "🚶",
  hiking: "⛰️",
  yoga: "🧘",
};

function sportIcon(sportType: string | null): string {
  if (!sportType) return "🏅";
  const key = sportType.toLowerCase();
  return (
    SPORT_ICONS[key] ??
    Object.entries(SPORT_ICONS).find(([k]) => key.includes(k))?.[1] ??
    "🏅"
  );
}

function teColor(value: number): string {
  if (value < 2) return "text-blue-400";
  if (value < 3) return "text-green-400";
  if (value < 4) return "text-yellow-400";
  return "text-red-400";
}

function teBgColor(value: number): string {
  if (value < 2) return "bg-blue-500";
  if (value < 3) return "bg-green-500";
  if (value < 4) return "bg-yellow-500";
  return "bg-red-500";
}

function teLabel(value: number): string {
  if (value < 1) return "None";
  if (value < 2) return "Minor";
  if (value < 3) return "Maintaining";
  if (value < 4) return "Improving";
  if (value < 5) return "Highly Improving";
  return "Overreaching";
}

function ratingColor(rating: string): string {
  switch (rating) {
    case "elite":
      return "text-emerald-400";
    case "good":
    case "optimal":
    case "balanced":
      return "text-green-400";
    case "average":
    case "slight_imbalance":
    case "high":
      return "text-yellow-400";
    case "poor":
    case "overstriding":
    case "understriding":
    case "imbalanced":
    case "low":
      return "text-red-400";
    default:
      return "text-muted-foreground";
  }
}

function ratingLabel(rating: string): string {
  return rating.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
}) {
  return (
    <div className="bg-card rounded-xl p-3 text-center">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-lg font-bold">
        {value ?? "—"}
        {unit && value != null && (
          <span className="text-muted-foreground ml-0.5 text-xs font-normal">
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

function TrainingEffectBar({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  if (value == null) return null;
  const pct = Math.min((value / 5) * 100, 100);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className={cn("text-sm font-bold", teColor(value))}>
          {value.toFixed(1)}{" "}
          <span className="text-muted-foreground text-xs font-normal">
            {teLabel(value)}
          </span>
        </span>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full transition-all", teBgColor(value))}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const HR_ZONE_COLORS = ["#9ca3af", "#3b82f6", "#22c55e", "#eab308", "#ef4444"];
const HR_ZONE_LABELS = ["Zone 1", "Zone 2", "Zone 3", "Zone 4", "Zone 5"];

function HrZoneChart({
  zones,
}: {
  zones: {
    zone1: number;
    zone2: number;
    zone3: number;
    zone4: number;
    zone5: number;
  };
}) {
  const data = [
    { name: "Zone 1", minutes: zones.zone1, fill: HR_ZONE_COLORS[0] },
    { name: "Zone 2", minutes: zones.zone2, fill: HR_ZONE_COLORS[1] },
    { name: "Zone 3", minutes: zones.zone3, fill: HR_ZONE_COLORS[2] },
    { name: "Zone 4", minutes: zones.zone4, fill: HR_ZONE_COLORS[3] },
    { name: "Zone 5", minutes: zones.zone5, fill: HR_ZONE_COLORS[4] },
  ];

  const total = data.reduce((s, d) => s + d.minutes, 0);
  if (total === 0) return null;

  return (
    <div className="space-y-2">
      {/* Stacked horizontal bar */}
      <div className="flex h-6 overflow-hidden rounded-full">
        {data.map(
          (d, i) =>
            d.minutes > 0 && (
              <div
                key={i}
                className="flex items-center justify-center text-[10px] font-medium text-white"
                style={{
                  width: `${(d.minutes / total) * 100}%`,
                  backgroundColor: d.fill,
                }}
              >
                {d.minutes >= 2 ? `${Math.round(d.minutes)}m` : ""}
              </div>
            ),
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: d.fill }}
            />
            <span className="text-muted-foreground">{HR_ZONE_LABELS[i]}</span>
            <span className="font-medium">{Math.round(d.minutes)}m</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RunningFormRow({
  label,
  value,
  unit,
  rating,
}: {
  label: string;
  value: number | null;
  unit: string;
  rating: string;
}) {
  if (value == null || value === 0) return null;
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-muted-foreground text-sm">{label}</span>
      <div className="text-right">
        <span className="font-semibold">
          {typeof value === "number"
            ? Number.isInteger(value)
              ? value
              : value.toFixed(1)
            : value}
          <span className="text-muted-foreground ml-1 text-xs font-normal">
            {unit}
          </span>
        </span>
        <span className={cn("ml-2 text-xs font-medium", ratingColor(rating))}>
          {ratingLabel(rating)}
        </span>
      </div>
    </div>
  );
}

function LapTable({
  laps,
}: {
  laps: {
    index: number;
    distanceMeters: number;
    durationSeconds: number;
    avgHr?: number;
    avgPace?: number;
    avgPower?: number;
  }[];
}) {
  const hasHr = laps.some((l) => l.avgHr);
  const hasPower = laps.some((l) => l.avgPower);

  // Fastest / slowest by pace
  const paces = laps
    .filter((l) => l.distanceMeters > 0)
    .map((l) => ({
      idx: l.index,
      pace: (l.durationSeconds / l.distanceMeters) * 1000,
    }));
  const fastestIdx = paces.length
    ? paces.reduce((a, b) => (a.pace < b.pace ? a : b)).idx
    : -1;
  const slowestIdx = paces.length
    ? paces.reduce((a, b) => (a.pace > b.pace ? a : b)).idx
    : -1;

  function hrZoneColor(hr: number | undefined): string {
    if (!hr) return "";
    if (hr < 115) return "text-blue-400";
    if (hr < 138) return "text-green-400";
    if (hr < 155) return "text-yellow-400";
    if (hr < 170) return "text-orange-400";
    return "text-red-400";
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs">
            <th className="pr-3 pb-2">Lap</th>
            <th className="pr-3 pb-2">Distance</th>
            <th className="pr-3 pb-2">Time</th>
            <th className="pr-3 pb-2">Pace</th>
            {hasHr && <th className="pr-3 pb-2">HR</th>}
            {hasPower && <th className="pr-3 pb-2">Power</th>}
          </tr>
        </thead>
        <tbody>
          {laps.map((lap) => {
            const m = Math.floor(lap.durationSeconds / 60);
            const s = Math.round(lap.durationSeconds % 60);
            const paceSecPerKm =
              lap.distanceMeters > 0
                ? (lap.durationSeconds / lap.distanceMeters) * 1000
                : null;
            const isFastest = lap.index === fastestIdx;
            const isSlowest =
              lap.index === slowestIdx && fastestIdx !== slowestIdx;
            return (
              <tr
                key={lap.index}
                className={cn(
                  "border-b border-zinc-800",
                  isFastest
                    ? "bg-green-500/10"
                    : isSlowest
                      ? "bg-red-500/10"
                      : "",
                )}
              >
                <td className="py-1.5 pr-3 font-medium">
                  {lap.index}
                  {isFastest && (
                    <span className="ml-1 text-[10px] text-green-400">⚡</span>
                  )}
                  {isSlowest && (
                    <span className="ml-1 text-[10px] text-red-400">🐢</span>
                  )}
                </td>
                <td className="py-1.5 pr-3">
                  {formatDistance(lap.distanceMeters)}
                </td>
                <td className="py-1.5 pr-3">
                  {m}:{s.toString().padStart(2, "0")}
                </td>
                <td className="py-1.5 pr-3">{formatPace(paceSecPerKm)}</td>
                {hasHr && (
                  <td className={cn("py-1.5 pr-3", hrZoneColor(lap.avgHr))}>
                    {lap.avgHr ?? "—"}
                  </td>
                )}
                {hasPower && (
                  <td className="py-1.5 pr-3">
                    {lap.avgPower != null
                      ? `${Math.round(lap.avgPower)}W`
                      : "—"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: activity, isLoading } = useQuery(
    trpc.activity.getDetail.queryOptions({ id }),
  );

  // -- Session Report state --
  const [rpe, setRpe] = useState<number | null>(null);
  const [sessionType, setSessionType] = useState<string | null>(null);
  const [drillNotes, setDrillNotes] = useState("");
  const [reportSynced, setReportSynced] = useState(false);

  const reportQuery = useQuery(
    trpc.sessionReport.getByActivity.queryOptions({ activityId: id }),
  );

  // Populate from existing report
  if (reportQuery.data && !reportSynced) {
    const r = reportQuery.data;
    setRpe(r.rpe);
    setSessionType(r.sessionType ?? null);
    setDrillNotes(r.drillNotes ?? "");
    setReportSynced(true);
  }

  const upsertReportMutation = useMutation(
    trpc.sessionReport.upsert.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(trpc.sessionReport.pathFilter());
        toast.success("Session report saved");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="bg-muted h-6 w-32 animate-pulse rounded" />
        <div className="bg-card h-32 animate-pulse rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card h-20 animate-pulse rounded-xl" />
          ))}
        </div>
        <BottomNav />
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="space-y-4">
        <Link
          href="/activities"
          className="text-primary inline-flex items-center gap-1 text-sm"
        >
          ← Back to Activities
        </Link>
        <div className="bg-card rounded-xl p-8 text-center">
          <p className="text-lg font-medium">Activity not found</p>
          <p className="text-muted-foreground mt-1 text-sm">
            This activity may have been deleted or doesn&apos;t exist.
          </p>
        </div>
        <BottomNav />
      </div>
    );
  }

  const isRunning = activity.sportType?.toLowerCase().includes("run");
  const hasPower =
    activity.avgPower != null || activity.normalizedPower != null;

  // Prefer the pre-parsed laps column; fall back to rawGarminData.laps
  const laps: {
    index: number;
    distanceMeters: number;
    durationSeconds: number;
    avgHr?: number;
    avgPace?: number;
    avgPower?: number;
  }[] = (() => {
    if (activity.laps != null && activity.laps.length > 0) {
      return activity.laps;
    }

    // Try extracting from rawGarminData
    const raw = activity.rawGarminData as
      | { laps?: Record<string, unknown>[] }
      | null
      | undefined;
    if (!raw?.laps || !Array.isArray(raw.laps) || raw.laps.length === 0) {
      return [];
    }

    return raw.laps.map((lap, i) => ({
      index: i + 1,
      distanceMeters: Number(lap.distanceInMeters ?? 0),
      durationSeconds: Number(lap.durationInSeconds ?? 0),
      avgHr:
        lap.averageHeartRateInBeatsPerMinute != null
          ? Number(lap.averageHeartRateInBeatsPerMinute)
          : undefined,
      avgPace:
        lap.averagePaceInMinutesPerKilometer != null
          ? Number(lap.averagePaceInMinutesPerKilometer) * 60
          : undefined,
      avgPower:
        lap.averagePowerInWatts != null
          ? Number(lap.averagePowerInWatts)
          : undefined,
    }));
  })();
  const hasLaps = laps.length > 0;

  return (
    <div className="space-y-5">
      {/* Back link */}
      <Link
        href="/activities"
        className="text-primary inline-flex items-center gap-1 text-sm"
      >
        ← Back to Activities
      </Link>

      {/* Header */}
      <div className="bg-card rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full text-2xl">
            {sportIcon(activity.sportType)}
          </div>
          <div>
            <h1 className="text-xl font-bold">
              {sportLabel(activity.sportType)}
            </h1>
            <p className="text-muted-foreground text-sm">
              {formatDate(activity.startedAt)} ·{" "}
              {formatTime(activity.startedAt)}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span>
            <span className="text-muted-foreground">Duration:</span>{" "}
            <span className="font-semibold">
              {formatDuration(activity.durationMinutes)}
            </span>
          </span>
          {activity.distanceMeters != null && activity.distanceMeters > 0 && (
            <span>
              <span className="text-muted-foreground">Distance:</span>{" "}
              <span className="font-semibold">
                {formatDistance(activity.distanceMeters)}
              </span>
            </span>
          )}
          {activity.avgPaceSecPerKm != null && (
            <span>
              <span className="text-muted-foreground">Pace:</span>{" "}
              <span className="font-semibold">
                {formatPace(activity.avgPaceSecPerKm)}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Avg HR" value={activity.avgHr} unit="bpm" />
        <MetricCard label="Max HR" value={activity.maxHr} unit="bpm" />
        <MetricCard label="Calories" value={activity.calories} unit="kcal" />
        <MetricCard
          label="Strain"
          value={
            activity.strainScore != null
              ? Math.round(activity.strainScore)
              : null
          }
        />
      </div>

      {/* Training Effects */}
      {(activity.aerobicTE != null || activity.anaerobicTE != null) && (
        <section className="bg-card space-y-3 rounded-xl p-4">
          <h2 className="text-sm font-semibold tracking-wider uppercase">
            Training Effect
          </h2>
          <TrainingEffectBar label="Aerobic" value={activity.aerobicTE} />
          <TrainingEffectBar label="Anaerobic" value={activity.anaerobicTE} />
        </section>
      )}

      {/* HR Zones */}
      {activity.hrZoneMinutes != null && (
        <section className="bg-card space-y-3 rounded-xl p-4">
          <h2 className="text-sm font-semibold tracking-wider uppercase">
            Heart Rate Zones
          </h2>
          <HrZoneChart
            zones={
              activity.hrZoneMinutes as {
                zone1: number;
                zone2: number;
                zone3: number;
                zone4: number;
                zone5: number;
              }
            }
          />
        </section>
      )}

      {/* Running Form */}
      {isRunning && activity.runningFormScore != null && (
        <section className="bg-card space-y-2 rounded-xl p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold tracking-wider uppercase">
              Running Form
            </h2>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">
                {activity.runningFormScore.overall}
              </span>
              <span className="text-muted-foreground text-xs">/100</span>
            </div>
          </div>

          <div className="divide-y divide-zinc-800">
            <RunningFormRow
              label="Ground Contact Time"
              value={activity.runningFormScore.groundContactTime.value}
              unit="ms"
              rating={activity.runningFormScore.groundContactTime.rating}
            />
            <RunningFormRow
              label="Vertical Oscillation"
              value={activity.runningFormScore.verticalOscillation.value}
              unit="cm"
              rating={activity.runningFormScore.verticalOscillation.rating}
            />
            <RunningFormRow
              label="Stride Length"
              value={activity.runningFormScore.strideLength.value}
              unit="m"
              rating={activity.runningFormScore.strideLength.rating}
            />
            <RunningFormRow
              label="Cadence"
              value={activity.runningFormScore.cadence.value}
              unit="spm"
              rating={activity.runningFormScore.cadence.rating}
            />
            <RunningFormRow
              label="GCT Balance"
              value={activity.runningFormScore.gctBalance.value}
              unit="%"
              rating={activity.runningFormScore.gctBalance.rating}
            />
          </div>
        </section>
      )}

      {/* Elevation */}
      {(activity.elevationGain != null || activity.elevationLoss != null) && (
        <section className="bg-card space-y-3 rounded-xl p-4">
          <h2 className="text-sm font-semibold tracking-wider uppercase">
            Elevation
          </h2>
          <div className="flex gap-6 text-sm">
            {activity.elevationGain != null && (
              <span>
                <span className="text-green-400">↑</span>{" "}
                <span className="font-semibold">
                  {Math.round(activity.elevationGain)}
                </span>
                <span className="text-muted-foreground ml-0.5 text-xs">m</span>
              </span>
            )}
            {activity.elevationLoss != null && (
              <span>
                <span className="text-red-400">↓</span>{" "}
                <span className="font-semibold">
                  {Math.round(activity.elevationLoss)}
                </span>
                <span className="text-muted-foreground ml-0.5 text-xs">m</span>
              </span>
            )}
          </div>
        </section>
      )}

      {/* Pace / Power Stats */}
      {(isRunning || hasPower) && (
        <section className="bg-card space-y-3 rounded-xl p-4">
          <h2 className="text-sm font-semibold tracking-wider uppercase">
            {hasPower ? "Power & Pace" : "Pace"}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {activity.avgPaceSecPerKm != null && (
              <div>
                <p className="text-muted-foreground text-xs">Avg Pace</p>
                <p className="font-semibold">
                  {formatPace(activity.avgPaceSecPerKm)}
                </p>
              </div>
            )}
            {activity.avgCadence != null && (
              <div>
                <p className="text-muted-foreground text-xs">Avg Cadence</p>
                <p className="font-semibold">
                  {Math.round(activity.avgCadence)} spm
                </p>
              </div>
            )}
            {activity.avgPower != null && (
              <div>
                <p className="text-muted-foreground text-xs">Avg Power</p>
                <p className="font-semibold">
                  {Math.round(activity.avgPower)} W
                </p>
              </div>
            )}
            {activity.normalizedPower != null && (
              <div>
                <p className="text-muted-foreground text-xs">
                  Normalized Power
                </p>
                <p className="font-semibold">
                  {Math.round(activity.normalizedPower)} W
                </p>
              </div>
            )}
            {activity.maxPower != null && (
              <div>
                <p className="text-muted-foreground text-xs">Max Power</p>
                <p className="font-semibold">
                  {Math.round(activity.maxPower)} W
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Laps */}
      {hasLaps ? (
        <section className="bg-card space-y-3 rounded-xl p-4">
          <h2 className="text-sm font-semibold tracking-wider uppercase">
            Laps
          </h2>
          <LapTable laps={laps} />
        </section>
      ) : (
        <section className="bg-card rounded-xl p-4 text-center">
          <p className="text-muted-foreground text-sm">
            Lap data not available for this activity.
          </p>
        </section>
      )}

      {/* VO2max / EPOC */}
      {(activity.vo2maxEstimate != null || activity.epocMl != null) && (
        <div className="grid grid-cols-2 gap-3">
          {activity.vo2maxEstimate != null && (
            <MetricCard
              label="VO₂ Max"
              value={activity.vo2maxEstimate.toFixed(1)}
              unit="ml/kg/min"
            />
          )}
          {activity.epocMl != null && (
            <MetricCard
              label="EPOC"
              value={Math.round(activity.epocMl)}
              unit="mL"
            />
          )}
        </div>
      )}

      {/* ── Efficiency Analysis ── */}
      {(isRunning || hasPower) && activity.avgHr != null && (
        <section className="bg-card space-y-3 rounded-xl p-4">
          <h2 className="text-sm font-semibold tracking-wider uppercase">
            Efficiency Analysis
          </h2>
          {isRunning &&
            activity.avgPaceSecPerKm != null &&
            activity.avgHr != null && (
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">
                  Aerobic Efficiency (AeT)
                </p>
                <p className="text-lg font-bold">
                  {(
                    ((100 / activity.avgPaceSecPerKm) * 100) /
                    activity.avgHr
                  ).toFixed(2)}
                  <span className="text-muted-foreground ml-1 text-xs font-normal">
                    (pace-units / HR · higher = better)
                  </span>
                </p>
              </div>
            )}
          {hasPower && activity.avgPower != null && activity.avgHr != null && (
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">Power:HR Ratio</p>
              <p className="text-lg font-bold">
                {(activity.avgPower / activity.avgHr).toFixed(2)}
                <span className="text-muted-foreground ml-1 text-xs font-normal">
                  W/bpm
                </span>
              </p>
            </div>
          )}
          {/* GAP — Grade Adjusted Pace */}
          {isRunning &&
            activity.avgPaceSecPerKm != null &&
            activity.elevationGain != null &&
            activity.distanceMeters != null &&
            activity.distanceMeters > 0 && (
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">
                  Flat-Equivalent Pace (GAP)
                </p>
                {(() => {
                  const gap =
                    activity.avgPaceSecPerKm *
                    (1 +
                      (activity.elevationGain / activity.distanceMeters) *
                        0.033);
                  const m = Math.floor(gap / 60);
                  const s = Math.round(gap % 60);
                  return (
                    <p className="text-lg font-bold">
                      {m}:{s.toString().padStart(2, "0")}/km
                      <span className="text-muted-foreground ml-1 text-xs font-normal">
                        GAP
                      </span>
                    </p>
                  );
                })()}
              </div>
            )}
        </section>
      )}

      {/* ── HR Zone Mini-Chart ── */}
      {activity.hrZoneMinutes != null &&
        (() => {
          const z = activity.hrZoneMinutes as {
            zone1?: number;
            zone2?: number;
            zone3?: number;
            zone4?: number;
            zone5?: number;
          };
          const zones = [
            { key: "Z1", val: z.zone1 ?? 0, color: "#3b82f6" },
            { key: "Z2", val: z.zone2 ?? 0, color: "#22c55e" },
            { key: "Z3", val: z.zone3 ?? 0, color: "#eab308" },
            { key: "Z4", val: z.zone4 ?? 0, color: "#f97316" },
            { key: "Z5", val: z.zone5 ?? 0, color: "#ef4444" },
          ];
          const total = zones.reduce((s, z) => s + z.val, 0);
          if (total === 0) return null;
          return (
            <section className="bg-card space-y-3 rounded-xl p-4">
              <h2 className="text-sm font-semibold tracking-wider uppercase">
                Zone Distribution
              </h2>
              <div className="flex h-4 w-full overflow-hidden rounded-full">
                {zones.map((z) =>
                  z.val > 0 ? (
                    <div
                      key={z.key}
                      style={{
                        width: `${(z.val / total) * 100}%`,
                        backgroundColor: z.color,
                      }}
                      title={`${z.key}: ${z.val} min`}
                    />
                  ) : null,
                )}
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                {zones.map((z) => (
                  <span key={z.key} className="flex items-center gap-1">
                    <span
                      className="h-2 w-2 rounded-sm"
                      style={{ backgroundColor: z.color }}
                    />
                    <span className="text-muted-foreground">
                      {z.key}: {z.val}m (
                      {total > 0 ? Math.round((z.val / total) * 100) : 0}%)
                    </span>
                  </span>
                ))}
              </div>
            </section>
          );
        })()}

      {/* Post-Session Report */}
      <section className="bg-card space-y-4 rounded-2xl border p-4">
        <h2 className="text-sm font-semibold tracking-wider uppercase">
          Session RPE
        </h2>

        {/* RPE buttons 1-10 */}
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            Rate your perceived exertion (1 = very easy · 10 = max effort)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                onClick={() => setRpe(rpe === n ? null : n)}
                className={cn(
                  "h-9 w-9 rounded-xl border text-sm font-bold transition-all",
                  rpe === n
                    ? n <= 3
                      ? "border-blue-500/50 bg-blue-500/30 text-blue-300"
                      : n <= 6
                        ? "border-green-500/50 bg-green-500/30 text-green-300"
                        : n <= 8
                          ? "border-yellow-500/50 bg-yellow-500/30 text-yellow-300"
                          : "border-red-500/50 bg-red-500/30 text-red-300"
                    : n <= 3
                      ? "border-blue-500/20 text-blue-400/60 hover:bg-blue-500/10"
                      : n <= 6
                        ? "border-green-500/20 text-green-400/60 hover:bg-green-500/10"
                        : n <= 8
                          ? "border-yellow-500/20 text-yellow-400/60 hover:bg-yellow-500/10"
                          : "border-red-500/20 text-red-400/60 hover:bg-red-500/10",
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Session Type */}
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Session Type
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: "base", emoji: "🏃", label: "Base" },
              { key: "threshold", emoji: "⚡", label: "Threshold" },
              { key: "interval", emoji: "🔥", label: "Interval" },
              { key: "recovery", emoji: "😴", label: "Recovery" },
              { key: "race", emoji: "🏁", label: "Race" },
              { key: "strength", emoji: "💪", label: "Strength" },
              { key: "mobility", emoji: "🧘", label: "Mobility" },
            ].map((st) => (
              <button
                key={st.key}
                onClick={() =>
                  setSessionType(sessionType === st.key ? null : st.key)
                }
                className={cn(
                  "flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs transition-all",
                  sessionType === st.key
                    ? "border-primary/50 bg-primary/20 text-primary"
                    : "bg-secondary/50 text-muted-foreground hover:bg-secondary border-transparent",
                )}
              >
                <span>{st.emoji}</span>
                <span className="font-medium">{st.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Drill Notes */}
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Drill Notes
          </p>
          <textarea
            rows={2}
            placeholder="e.g. strides, drills, key intervals..."
            value={drillNotes}
            onChange={(e) => setDrillNotes(e.target.value)}
            className="bg-secondary/50 border-border focus:ring-primary/40 w-full rounded-xl border p-2.5 text-xs focus:ring-2 focus:outline-none"
          />
        </div>

        <Button
          className="w-full"
          disabled={rpe === null || upsertReportMutation.isPending}
          onClick={() => {
            if (rpe === null) return;
            upsertReportMutation.mutate({
              activityId: id,
              garminActivityId: activity.garminActivityId ?? undefined,
              durationMinutes: activity.durationMinutes ?? undefined,
              rpe,
              sessionType:
                (sessionType as
                  | "base"
                  | "threshold"
                  | "interval"
                  | "recovery"
                  | "race"
                  | "strength"
                  | "mobility"
                  | undefined) ?? undefined,
              drillNotes: drillNotes || undefined,
            });
          }}
        >
          {upsertReportMutation.isPending ? "Saving…" : "Save Report"}
        </Button>
      </section>

      <BottomNav />
    </div>
  );
}
