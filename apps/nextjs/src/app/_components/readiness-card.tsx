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

interface ReadinessCardProps {
  score: number | null;
  zone: string | null;
  explanation: string | null;
  isLoading?: boolean;
}

export function ReadinessCard({
  score,
  zone,
  explanation,
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

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border p-6",
        config.bg,
        "ring-1",
        config.ring,
      )}
    >
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
        </div>
      </div>
    </div>
  );
}
