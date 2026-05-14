// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
"use client";

import type { TargetStrainBand } from "@acme/engine";

interface Props {
  targetStrain: TargetStrainBand | null;
  isLoading?: boolean;
}

const ZONE_COLOR: Record<string, string> = {
  prime: "#22c55e",
  high: "#14b8a6",
  moderate: "#eab308",
  low: "#f97316",
  poor: "#ef4444",
};

export function DailyOutlookCard({ targetStrain, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="bg-card animate-pulse rounded-2xl border p-4">
        <div className="bg-muted h-5 w-40 rounded" />
        <div className="bg-muted mt-3 h-10 rounded" />
      </div>
    );
  }

  if (!targetStrain) return null;

  const { min, max, target, label, rationale, readinessZone } = targetStrain;
  const color = ZONE_COLOR[readinessZone] ?? "#888";

  // Visualise band as a 0-21 horizontal scale.
  const pctLeft = (min / 21) * 100;
  const pctRight = (max / 21) * 100;
  const pctTarget = (target / 21) * 100;

  return (
    <div className="bg-card rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Today&apos;s Target Strain
        </h2>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums"
          style={{ backgroundColor: `${color}22`, color }}
        >
          {label}
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span
          className="text-3xl font-bold tabular-nums"
          style={{ color }}
        >
          {min}–{max}
        </span>
        <span className="text-muted-foreground text-xs">/ 21</span>
      </div>

      {/* 0-21 strain scale band */}
      <div className="mt-3">
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className="absolute top-0 h-full rounded-full"
            style={{
              left: `${pctLeft}%`,
              width: `${pctRight - pctLeft}%`,
              backgroundColor: color,
            }}
          />
          <div
            className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-white"
            style={{ left: `${pctTarget}%` }}
            aria-label="Target midpoint"
          />
        </div>
        <div className="text-muted-foreground mt-1 flex justify-between text-[10px] tabular-nums">
          <span>0</span>
          <span>Light</span>
          <span>Moderate</span>
          <span>Vigorous</span>
          <span>21</span>
        </div>
      </div>

      <p className="text-muted-foreground mt-3 text-xs leading-snug">
        {rationale}
      </p>
    </div>
  );
}
