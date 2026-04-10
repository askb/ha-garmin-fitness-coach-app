"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@acme/ui";

import { IngressLink as Link } from "~/app/_components/ingress-link";
import { useTRPC } from "~/trpc/react";
import { BottomNav } from "../_components/bottom-nav";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPORT_FILTERS = [
  { value: undefined, label: "All" },
  { value: "running", label: "Running" },
  { value: "cycling", label: "Cycling" },
  { value: "strength_training", label: "Strength" },
  { value: "swimming", label: "Swimming" },
  { value: "walking", label: "Walking" },
  { value: "hiking", label: "Hiking" },
] as const;

const SPORT_ICONS: Record<string, string> = {
  running: "🏃",
  trail_running: "🏃",
  cycling: "🚴",
  strength_training: "🏋️",
  swimming: "🏊",
  walking: "🚶",
  hiking: "⛰️",
  yoga: "🧘",
  elliptical: "🔄",
  other: "🏅",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sportIcon(sportType: string | null): string {
  if (!sportType) return "🏅";
  const key = sportType.toLowerCase();
  return (
    SPORT_ICONS[key] ??
    Object.entries(SPORT_ICONS).find(([k]) => key.includes(k))?.[1] ??
    "🏅"
  );
}

function formatDuration(minutes: number | null): string {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

function formatDistance(meters: number | null): string {
  if (meters == null) return "";
  const km = meters / 1000;
  return km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatPace(secPerKm: number | null): string {
  if (secPerKm == null) return "";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ActivitiesPage() {
  const trpc = useTRPC();
  const [sportFilter, setSportFilter] = useState<string | undefined>(undefined);

  const { data: activities, isLoading } = useQuery(
    trpc.activity.list.queryOptions({
      days: 90,
      sportType: sportFilter,
    }),
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Activities</h1>
        <p className="text-muted-foreground text-sm">Your recent workouts</p>
      </div>

      {/* Sport Filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {SPORT_FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setSportFilter(f.value)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              sportFilter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Activity List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-card h-20 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : !activities?.length ? (
        <div className="bg-card rounded-xl p-8 text-center">
          <p className="text-muted-foreground text-lg">No activities found</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Sync your Garmin device to see workouts here
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {activities.map((a) => (
            <Link
              key={a.id}
              href={`/activities/${a.id}`}
              className="bg-card hover:bg-accent flex items-center gap-3 rounded-xl p-3 transition-colors"
            >
              {/* Sport Icon */}
              <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg">
                {sportIcon(a.sportType)}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate font-medium">
                    {sportLabel(a.sportType)}
                  </span>
                  {a.subType && (
                    <span className="text-muted-foreground truncate text-xs">
                      {sportLabel(a.subType)}
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
                  <span>
                    {formatDate(a.startedAt)} · {formatTime(a.startedAt)}
                  </span>
                </div>
              </div>

              {/* Stats */}
              <div className="shrink-0 text-right">
                <div className="text-sm font-semibold">
                  {formatDuration(a.durationMinutes)}
                </div>
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  {a.distanceMeters != null && a.distanceMeters > 0 && (
                    <span>{formatDistance(a.distanceMeters)}</span>
                  )}
                  {a.avgPaceSecPerKm != null && a.avgPaceSecPerKm > 0 && (
                    <span>{formatPace(a.avgPaceSecPerKm)}</span>
                  )}
                </div>
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  {a.avgHr != null && <span>❤️ {a.avgHr}</span>}
                  {a.strainScore != null && (
                    <span>🔥 {Math.round(a.strainScore)}</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
