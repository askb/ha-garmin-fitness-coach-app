"use client";

import { IngressLink as Link } from "./ingress-link";
import { useTRPC } from "~/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { BottomNav } from "./bottom-nav";
import { ReadinessCard } from "./readiness-card";
import { WorkoutCard } from "./workout-card";
import { QuickStats } from "./quick-stats";

export function DashboardHome() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const readiness = useQuery(trpc.readiness.getToday.queryOptions());
  const workout = useQuery(trpc.workout.getToday.queryOptions());
  const recentActivities = useQuery(trpc.activity.getRecent.queryOptions());

  const adjustMutation = useMutation(
    trpc.workout.adjustDifficulty.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.workout.getToday.queryKey(),
        });
      },
    }),
  );

  const r = readiness.data as Record<string, unknown> | null | undefined;
  const w = workout.data as Record<string, unknown> | null | undefined;

  const stats = [
    {
      label: "Sleep",
      value: r?.sleepQuantityComponent
        ? `${Math.round(r.sleepQuantityComponent as number)}`
        : null,
      icon: "😴",
    },
    {
      label: "HRV",
      value: r?.hrvComponent
        ? `${Math.round(r.hrvComponent as number)}`
        : null,
      icon: "💓",
    },
    {
      label: "Load",
      value: r?.trainingLoadComponent
        ? `${Math.round(r.trainingLoadComponent as number)}`
        : null,
      icon: "🔥",
    },
    {
      label: "Stress",
      value: r?.stressComponent
        ? `${Math.round(r.stressComponent as number)}`
        : null,
      icon: "🧘",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Good morning 👋</h1>
        <p className="text-muted-foreground text-sm">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Readiness */}
      <ReadinessCard
        score={(r?.score as number) ?? null}
        zone={(r?.zone as string) ?? null}
        explanation={(r?.explanation as string) ?? null}
        confidence={(r?.confidence as number) ?? null}
        dataQuality={
          (r?.dataQuality as {
            hrv: "good" | "missing" | "stale";
            sleep: "good" | "missing" | "stale";
            restingHr: "good" | "missing" | "stale";
            trainingLoad: "good" | "missing" | "stale";
          }) ?? null
        }
        actionSuggestion={(r?.actionSuggestion as string) ?? null}
        doNotOverinterpret={(r?.doNotOverinterpret as boolean) ?? null}
        isLoading={readiness.isLoading}
      />

      {/* Today's Workout */}
      <WorkoutCard
        id={w?.id as string | undefined}
        title={(w?.title as string) ?? null}
        description={(w?.description as string) ?? null}
        sportType={(w?.sportType as string) ?? null}
        targetDurationMin={(w?.targetDurationMin as number) ?? null}
        targetDurationMax={(w?.targetDurationMax as number) ?? null}
        targetHrZoneLow={(w?.targetHrZoneLow as number) ?? null}
        targetHrZoneHigh={(w?.targetHrZoneHigh as number) ?? null}
        explanation={(w?.explanation as string) ?? null}
        isLoading={workout.isLoading}
        onAdjust={(direction) => adjustMutation.mutate({ direction })}
      />

      {/* Quick Stats */}
      <QuickStats stats={stats} />

      {/* Quick Navigation */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/fitness"
          className="bg-card flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-zinc-800/80"
        >
          <span className="text-2xl">🏃</span>
          <div>
            <p className="text-sm font-semibold">Fitness</p>
            <p className="text-muted-foreground text-xs">VO2max &amp; race predictions</p>
          </div>
        </Link>
        <Link
          href="/insights"
          className="bg-card flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-zinc-800/80"
        >
          <span className="text-2xl">💡</span>
          <div>
            <p className="text-sm font-semibold">Insights</p>
            <p className="text-muted-foreground text-xs">Daily recommendations</p>
          </div>
        </Link>
      </div>

      {/* Recent Activities */}
      {recentActivities.data && recentActivities.data.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider">
              Recent Activities
            </h2>
            <Link
              href="/activities"
              className="text-primary text-xs font-medium"
            >
              View all →
            </Link>
          </div>
          {recentActivities.data.slice(0, 3).map((a) => {
            const mins = a.durationMinutes;
            const dur =
              mins != null
                ? mins >= 60
                  ? `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`
                  : `${Math.round(mins)} min`
                : "—";
            const dist =
              a.distanceMeters != null && a.distanceMeters > 0
                ? `${(a.distanceMeters / 1000).toFixed(1)} km`
                : null;
            const sport = a.sportType
              ? a.sportType
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (c: string) => c.toUpperCase())
              : "Activity";
            const date = new Date(a.startedAt).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            });
            return (
              <Link
                key={a.id}
                href={`/activities/${a.id}`}
                className="bg-card hover:bg-accent flex items-center gap-3 rounded-xl p-3 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{sport}</p>
                  <p className="text-muted-foreground text-xs">{date}</p>
                </div>
                <div className="shrink-0 text-right text-sm">
                  <p className="font-semibold">{dur}</p>
                  {dist && (
                    <p className="text-muted-foreground text-xs">{dist}</p>
                  )}
                </div>
              </Link>
            );
          })}
        </section>
      )}

      {/* Coach FAB */}
      <Link
        href="/coach"
        className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-2xl shadow-lg hover:bg-indigo-500 transition-colors"
      >
        🏋️
      </Link>

      <BottomNav />
    </div>
  );
}
