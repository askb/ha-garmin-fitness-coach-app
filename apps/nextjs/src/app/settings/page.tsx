"use client";

import { useTRPC } from "~/trpc/react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@acme/ui/button";
import { BottomNav } from "../_components/bottom-nav";

export default function SettingsPage() {
  const trpc = useTRPC();
  const profile = useQuery(trpc.profile.get.queryOptions());

  const p = profile.data as Record<string, unknown> | null | undefined;

  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 pb-24 pt-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Profile */}
      <div className="bg-card space-y-3 rounded-2xl border p-4">
        <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
          Profile
        </h2>
        {p ? (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Age</span>
              <p className="font-medium">{(p.age as number) ?? "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Sex</span>
              <p className="font-medium capitalize">
                {(p.sex as string) ?? "—"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Weight</span>
              <p className="font-medium">
                {p.massKg ? `${p.massKg} kg` : "—"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Height</span>
              <p className="font-medium">
                {p.heightCm ? `${p.heightCm} cm` : "—"}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No profile set up.</p>
        )}
        <Button variant="outline" size="sm" asChild>
          <a href="/onboarding">Edit Profile</a>
        </Button>
      </div>

      {/* Sports & Goals */}
      <div className="bg-card space-y-3 rounded-2xl border p-4">
        <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
          Sports & Goals
        </h2>
        {p?.primarySports ? (
          <div className="flex flex-wrap gap-2">
            {(p.primarySports as string[]).map((sport) => (
              <span
                key={sport}
                className="bg-primary/10 text-primary rounded-full px-3 py-1 text-sm capitalize"
              >
                {sport}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No sports selected.</p>
        )}
      </div>

      {/* Garmin Connection */}
      <div className="bg-card space-y-3 rounded-2xl border p-4">
        <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
          Garmin Connection
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
            <span className="text-lg">⌚</span>
          </div>
          <div>
            <p className="text-sm font-medium">Garmin Connect</p>
            <p className="text-muted-foreground text-xs">
              Mock connected · Last sync: just now
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm">
          Reconnect Garmin
        </Button>
      </div>

      {/* Data & Privacy */}
      <div className="bg-card space-y-3 rounded-2xl border p-4">
        <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
          Data & Privacy
        </h2>
        <p className="text-muted-foreground text-xs">
          Your Garmin data is stored securely and used only to compute your
          readiness score and workout recommendations. We never share your data.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            Export Data
          </Button>
          <Button variant="outline" size="sm" className="text-red-500">
            Delete Account
          </Button>
        </div>
      </div>

      <BottomNav />
    </main>
  );
}
