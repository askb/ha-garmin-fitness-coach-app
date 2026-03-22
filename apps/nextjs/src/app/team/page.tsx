"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";
import { BottomNav } from "../_components/bottom-nav";

/* ─────────────── types ─────────────── */

interface SavedAthlete {
  name: string;
  url: string;
  lastReadiness: number | null;
}

const LS_KEY = "gc_saved_athletes";

function loadAthletes(): SavedAthlete[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as SavedAthlete[];
  } catch {
    return [];
  }
}

function saveAthletes(athletes: SavedAthlete[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(athletes));
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

/* ─────────────── page ─────────────── */

export default function TeamPage() {
  const trpc = useTRPC();

  const [athletes, setAthletes] = useState<SavedAthlete[]>([]);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [mounted, setMounted] = useState(false);

  // Current athlete data
  const profile = useQuery(trpc.profile.get.queryOptions());
  const readiness = useQuery(trpc.readiness.getToday.queryOptions());
  const loads = useQuery(trpc.analytics.getTrainingLoads.queryOptions());

  useEffect(() => {
    setAthletes(loadAthletes());
    setMounted(true);
  }, []);

  function addAthlete() {
    if (!newName.trim() || !newUrl.trim()) {
      toast.error("Name and URL are required");
      return;
    }
    let url = newUrl.trim();
    try {
      const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Invalid protocol");
      url = parsed.href;
    } catch {
      toast.error("Please enter a valid HTTP/HTTPS URL");
      return;
    }
    const updated = [...athletes, { name: newName.trim(), url, lastReadiness: null }];
    setAthletes(updated);
    saveAthletes(updated);
    setNewName("");
    setNewUrl("");
    toast.success(`${newName} added`);
  }

  function removeAthlete(index: number) {
    const updated = athletes.filter((_, i) => i !== index);
    setAthletes(updated);
    saveAthletes(updated);
  }

  const athleteName =
    (profile.data as { name?: string | null } | null)?.name ?? "Athlete";
  const currentReadiness =
    (readiness.data as { score?: number | null } | null)?.score ?? null;
  const tsb = loads.data?.tsb ?? null;
  const acwr = loads.data?.acwr ?? null;

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pb-24 pt-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold">Team</h1>
        <p className="text-muted-foreground text-sm">Multi-athlete dashboard</p>
      </div>

      {/* ── Current Athlete ── */}
      <div className="bg-card rounded-2xl border p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider">
          Current Athlete
        </h2>
        {profile.isLoading ? (
          <div className="flex items-center gap-4">
            <div className="bg-muted h-14 w-14 animate-pulse rounded-full" />
            <div className="space-y-2">
              <div className="bg-muted h-4 w-32 animate-pulse rounded" />
              <div className="bg-muted h-3 w-24 animate-pulse rounded" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/20 text-xl font-bold text-primary">
              {initials(athleteName)}
            </div>
            <div>
              <p className="text-lg font-bold">{athleteName}</p>
              {currentReadiness != null && (
                <p className="text-muted-foreground text-sm">
                  Readiness:{" "}
                  <span
                    className={cn(
                      "font-semibold",
                      currentReadiness >= 70
                        ? "text-green-400"
                        : currentReadiness >= 50
                          ? "text-yellow-400"
                          : "text-red-400",
                    )}
                  >
                    {currentReadiness}
                  </span>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="bg-secondary/40 rounded-xl p-3">
            <p className={cn("text-xl font-bold", currentReadiness != null && currentReadiness >= 70 ? "text-green-400" : currentReadiness != null && currentReadiness >= 50 ? "text-yellow-400" : "text-red-400")}>
              {currentReadiness ?? "—"}
            </p>
            <p className="text-muted-foreground text-xs">Readiness</p>
          </div>
          <div className="bg-secondary/40 rounded-xl p-3">
            <p className={cn("text-xl font-bold", tsb != null && tsb >= 0 ? "text-green-400" : "text-red-400")}>
              {tsb != null ? (tsb >= 0 ? `+${tsb.toFixed(0)}` : tsb.toFixed(0)) : "—"}
            </p>
            <p className="text-muted-foreground text-xs">Form (TSB)</p>
          </div>
          <div className="bg-secondary/40 rounded-xl p-3">
            <p className={cn("text-xl font-bold", acwr != null && acwr >= 0.8 && acwr <= 1.3 ? "text-green-400" : acwr != null && acwr > 1.5 ? "text-red-400" : "text-yellow-400")}>
              {acwr != null ? acwr.toFixed(2) : "—"}
            </p>
            <p className="text-muted-foreground text-xs">ACWR</p>
          </div>
        </div>
      </div>

      {/* ── Saved Athletes ── */}
      {mounted && (
        <div className="bg-card rounded-2xl border p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider">
            Saved Athletes
          </h2>
          {athletes.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No athletes added yet. Add a GarminCoach instance below.
            </p>
          ) : (
            <div className="space-y-2">
              {athletes.map((athlete, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl bg-secondary/40 px-3 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                      {initials(athlete.name)}
                    </div>
                    <div>
                      <p className="font-medium">{athlete.name}</p>
                      {athlete.lastReadiness != null && (
                        <p className="text-muted-foreground text-xs">
                          Last readiness: {athlete.lastReadiness}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => window.open(athlete.url, "_blank")}
                    >
                      View →
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-red-400 h-7 px-2 text-xs"
                      onClick={() => removeAthlete(i)}
                    >
                      ✕
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Add Athlete ── */}
      <div className="bg-card rounded-2xl border p-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">
          Add Athlete
        </h2>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Athlete name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="bg-secondary/50 border-border w-full rounded-xl border p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <input
            type="url"
            placeholder="GarminCoach instance URL"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addAthlete()}
            className="bg-secondary/50 border-border w-full rounded-xl border p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <Button className="w-full" onClick={addAthlete}>
            Save Athlete
          </Button>
        </div>
      </div>

      {/* ── About Team Mode ── */}
      <div className="bg-blue-500/10 rounded-2xl border border-blue-500/20 p-4">
        <h2 className="mb-2 text-sm font-semibold text-blue-400">
          ℹ️ About Team Mode
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Team mode connects multiple GarminCoach instances. Each athlete runs
          their own addon — add their ingress URL here to quickly switch between
          dashboards. Athlete data is stored locally in your browser.
        </p>
      </div>

      <BottomNav />
    </main>
  );
}
