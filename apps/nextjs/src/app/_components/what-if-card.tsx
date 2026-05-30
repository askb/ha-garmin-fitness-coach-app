// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";

interface Outcome {
  id: string;
  label: string;
  todayLoad: number;
  tomorrow: { ctl: number; atl: number; tsb: number; acwr: number };
  endOfHorizon: { ctl: number; atl: number; tsb: number; acwr: number };
  peakAcwr: number;
  acwrFlag: "safe" | "caution" | "high";
}

const FLAG_STYLE: Record<Outcome["acwrFlag"], { label: string; cls: string }> =
  {
    safe: { label: "Safe load", cls: "text-emerald-400" },
    caution: { label: "Watch load", cls: "text-amber-400" },
    high: { label: "High risk", cls: "text-rose-400" },
  };

function tsbSign(tsb: number): string {
  return `${tsb > 0 ? "+" : ""}${tsb}`;
}

/**
 * "What if I train differently today?" — projects rest / easy / planned /
 * hard choices seven days out so the athlete can see the downstream form
 * (TSB) and injury-risk (ACWR) trade-offs before deciding. Read-only over
 * `analytics.getWhatIfToday`; hidden until there is enough history.
 */
export function WhatIfCard() {
  const trpc = useTRPC();
  const query = useQuery(trpc.analytics.getWhatIfToday.queryOptions());

  const outcomes = useMemo(
    () => (query.data?.outcomes ?? []) as Outcome[],
    [query.data],
  );

  if (query.isLoading || query.isError || !query.data?.hasData) return null;
  if (outcomes.length === 0) return null;

  // Best = freshest end-of-week form that stays out of the high-risk band.
  const safest = outcomes
    .filter((o) => o.acwrFlag !== "high")
    .sort((a, b) => b.endOfHorizon.tsb - a.endOfHorizon.tsb)[0];

  return (
    <section className="bg-card rounded-2xl border p-5 shadow-sm">
      <div>
        <p className="text-muted-foreground text-sm font-medium">
          Plan your day
        </p>
        <h2 className="mt-1 text-xl font-semibold">What if I train today?</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Form &amp; injury-risk seven days out for each choice.
        </p>
      </div>

      <ul className="mt-4 space-y-2">
        {outcomes.map((o) => {
          const flag = FLAG_STYLE[o.acwrFlag];
          const isSafest = safest?.id === o.id;
          return (
            <li
              key={o.id}
              data-testid={`whatif-${o.id}`}
              className={cn(
                "rounded-xl px-3 py-2",
                isSafest
                  ? "bg-emerald-500/10 ring-1 ring-emerald-500/30"
                  : "bg-muted/40",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {o.label}
                  {isSafest ? (
                    <span className="ml-2 text-[10px] font-semibold tracking-wider text-emerald-400 uppercase">
                      best form
                    </span>
                  ) : null}
                </span>
                <span className={cn("text-xs font-semibold", flag.cls)}>
                  {flag.label}
                </span>
              </div>
              <div className="text-muted-foreground mt-1 flex items-center gap-4 text-[11px] tabular-nums">
                <span>
                  Tomorrow form{" "}
                  <span className="text-foreground font-semibold">
                    {tsbSign(o.tomorrow.tsb)}
                  </span>
                </span>
                <span>
                  In 7d{" "}
                  <span className="text-foreground font-semibold">
                    {tsbSign(o.endOfHorizon.tsb)}
                  </span>
                </span>
                <span>
                  ACWR{" "}
                  <span className="text-foreground font-semibold">
                    {o.peakAcwr}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-muted-foreground mt-3 text-[11px]">
        Higher form (TSB) means fresher; ACWR above 1.3–1.5 raises injury risk.
        A planning aid, not medical advice.
      </p>
    </section>
  );
}
