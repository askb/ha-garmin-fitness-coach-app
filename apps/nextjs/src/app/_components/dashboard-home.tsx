"use client";

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

      <BottomNav />
    </div>
  );
}
