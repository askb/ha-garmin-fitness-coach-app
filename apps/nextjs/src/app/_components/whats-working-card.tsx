// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";

interface RuleEffectiveness {
  ruleId: string;
  n: number;
  meanReadinessDelta: number | null;
  meanHrvDelta: number | null;
  meanTsbDelta: number | null;
  score: number;
}

/** Human-friendly labels for the engine's stable rule ids. */
const RULE_LABELS: Record<string, string> = {
  "low-readiness-blocks-hard": "Easing back when readiness is low",
  "hrv-suppressed-blocks-hard": "Backing off when HRV is suppressed",
  "acwr-spike-blocks-hard": "Reining in load on ACWR spikes",
  "acwr-very-low-suggests-light-build": "Rebuilding from a very low load",
  "tsb-overreaching-suggests-deload": "Deloading when overreaching",
  "consecutive-hard-suggests-recovery":
    "Recovering after back-to-back hard days",
  "race-week-protects-taper": "Protecting your race-week taper",
  "race-day-rest": "Resting on race day",
  "intervention-recent-respects": "Respecting a recent recovery nudge",
  "sleep-debt-blocks-hard": "Holding back when in sleep debt",
  "plan-honored-when-safe": "Following your plan when it's safe",
  "weekly-quota-met-suggests-rest": "Resting once the weekly quota is met",
  "sparse-data-low-confidence": "Staying cautious with sparse data",
};

function labelFor(ruleId: string): string {
  return (
    RULE_LABELS[ruleId] ??
    ruleId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/**
 * Surfaces the learning loop's per-rule effectiveness — which coaching
 * decisions were actually followed by better recovery. Read-only and
 * best-effort: renders nothing until enough attributions exist.
 */
export function WhatsWorkingCard() {
  const trpc = useTRPC();
  const query = useQuery(trpc.coach.ruleEffectiveness.queryOptions({}));

  const rules = useMemo(() => {
    const all = (query.data?.rules ?? []) as RuleEffectiveness[];
    return all
      .filter((r) => r.n > 0 && r.ruleId !== "__decision__")
      .sort((a, b) => b.score - a.score);
  }, [query.data]);

  // Hide entirely while loading or when the learning loop has no signal yet.
  if (query.isLoading || query.isError || rules.length === 0) return null;

  const top = rules.slice(0, 5);

  return (
    <section className="bg-card rounded-2xl border p-5 shadow-sm">
      <div>
        <p className="text-muted-foreground text-sm font-medium">
          Learned from your outcomes
        </p>
        <h2 className="mt-1 text-xl font-semibold">
          What&apos;s working for you
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">
          How recovery markers moved after each coaching decision.
        </p>
      </div>

      <ul className="mt-4 space-y-2">
        {top.map((r) => {
          const pct = Math.round(r.score * 100);
          const positive = r.score >= 0.05;
          const negative = r.score <= -0.05;
          const barWidth = Math.min(100, Math.abs(pct));
          return (
            <li
              key={r.ruleId}
              className="bg-muted/40 rounded-xl px-3 py-2"
              data-testid="whats-working-rule"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium">
                  {labelFor(r.ruleId)}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs font-semibold tabular-nums",
                    positive
                      ? "text-emerald-400"
                      : negative
                        ? "text-amber-400"
                        : "text-muted-foreground",
                  )}
                >
                  {pct > 0 ? "+" : ""}
                  {pct}
                </span>
              </div>
              <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
                <div
                  className={cn(
                    "h-full rounded-full",
                    positive
                      ? "bg-emerald-500/70"
                      : negative
                        ? "bg-amber-500/70"
                        : "bg-zinc-500/60",
                  )}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <p className="text-muted-foreground mt-1 text-[11px]">
                {r.n} decision{r.n === 1 ? "" : "s"} measured
              </p>
            </li>
          );
        })}
      </ul>

      <p className="text-muted-foreground mt-3 text-[11px]">
        Scores reflect how your readiness, HRV and form trended in the days
        after each decision — not medical advice.
      </p>
    </section>
  );
}
