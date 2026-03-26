"use client";

import { cn } from "@acme/ui";

import type { ReadinessZone } from "@acme/engine";

const zoneConfig: Record<
  string,
  { label: string; color: string; bg: string; ring: string }
> = {
  prime: {
    label: "Prime",
    color: "text-green-500",
    bg: "bg-green-500/10",
    ring: "ring-green-500/30",
  },
  high: {
    label: "High",
    color: "text-teal-500",
    bg: "bg-teal-500/10",
    ring: "ring-teal-500/30",
  },
  moderate: {
    label: "Moderate",
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
    ring: "ring-yellow-500/30",
  },
  low: {
    label: "Low",
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    ring: "ring-orange-500/30",
  },
  poor: {
    label: "Poor",
    color: "text-red-500",
    bg: "bg-red-500/10",
    ring: "ring-red-500/30",
  },
};

type DataQualityStatus = "good" | "missing" | "stale";

interface DataQuality {
  hrv: DataQualityStatus;
  sleep: DataQualityStatus;
  restingHr: DataQualityStatus;
  trainingLoad: DataQualityStatus;
}

const dqDotColor: Record<DataQualityStatus, string> = {
  good: "text-green-400",
  stale: "text-yellow-400",
  missing: "text-red-400",
};

const dqStatusLabel: Record<DataQualityStatus, string> = {
  good: "good",
  stale: "stale",
  missing: "missing",
};

function DataQualityDots({ dq }: { dq: DataQuality }) {
  const items: [string, DataQualityStatus][] = [
    ["HRV", dq.hrv],
    ["Sleep", dq.sleep],
    ["HR", dq.restingHr],
    ["Load", dq.trainingLoad],
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-2" role="list" aria-label="Data quality indicators">
      {items.map(([label, status]) => (
        <span
          key={label}
          role="listitem"
          className="text-muted-foreground flex items-center gap-1 text-xs"
          aria-label={`${label}: ${dqStatusLabel[status]}`}
          title={`${label}: ${dqStatusLabel[status]}`}
        >
          <span
            className={cn("text-base leading-none", dqDotColor[status])}
            aria-hidden="true"
          >
            ●
          </span>
          {label}
        </span>
      ))}
    </div>
  );
}

interface ReadinessCardProps {
  score: number | null;
  zone: string | null;
  explanation: string | null;
  confidence?: number | null;
  dataQuality?: DataQuality | null;
  actionSuggestion?: string | null;
  doNotOverinterpret?: boolean | null;
  isLoading?: boolean;
}

export function ReadinessCard({
  score,
  zone,
  explanation,
  confidence,
  dataQuality,
  actionSuggestion,
  doNotOverinterpret,
  isLoading,
}: ReadinessCardProps) {
  if (isLoading) {
    return (
      <div className="bg-card animate-pulse rounded-2xl border p-6">
        <div className="bg-muted mx-auto h-24 w-24 rounded-full" />
        <div className="bg-muted mt-4 h-4 w-3/4 rounded" />
      </div>
    );
  }

  if (score === null || zone === null) {
    return (
      <div className="bg-card rounded-2xl border p-6 text-center">
        <p className="text-muted-foreground">
          No readiness data yet. Connect your Garmin to get started.
        </p>
      </div>
    );
  }

  const config = zoneConfig[zone] ?? zoneConfig.moderate!;
  const confidencePct =
    confidence != null ? Math.round(confidence * 100) : null;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border p-6",
        config.bg,
        "ring-1",
        config.ring,
      )}
    >
      {/* Low data confidence warning */}
      {doNotOverinterpret && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
          <span>⚠️</span>
          <span>Low data confidence — score may not be reliable</span>
        </div>
      )}

      <div className="flex items-center gap-6">
        {/* Score Circle */}
        <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              className="text-muted/30"
            />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeDasharray={`${(score / 100) * 264} 264`}
              strokeLinecap="round"
              className={config.color}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("text-3xl font-bold", config.color)}>
              {score}
            </span>
            {confidencePct != null && (
              <span className="text-muted-foreground mt-0.5 text-[10px] tabular-nums">
                {confidencePct}% conf.
              </span>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm font-medium uppercase tracking-wider">
              Readiness
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                config.bg,
                config.color,
              )}
            >
              {config.label}
            </span>
          </div>
          {explanation && (
            <p className="text-foreground/80 mt-2 text-sm leading-relaxed">
              {explanation}
            </p>
          )}
          {/* Data quality dots */}
          {dataQuality && <DataQualityDots dq={dataQuality} />}
        </div>
      </div>

      {/* Action suggestion */}
      {actionSuggestion && (
        <div className="mt-4 rounded-xl bg-white/5 px-4 py-3 text-sm">
          <span className="mr-1">💡</span>
          <span className="text-foreground/80">{actionSuggestion}</span>
        </div>
      )}
    </div>
  );
}
