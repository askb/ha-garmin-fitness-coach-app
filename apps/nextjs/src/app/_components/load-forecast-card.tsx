// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";

type Scenario = "maintain" | "rest" | "rampUp" | "rampDown";

const SCENARIO_LABELS: Record<Scenario, string> = {
  maintain: "Maintain",
  rampUp: "Build",
  rampDown: "Taper",
  rest: "Rest",
};

const SCENARIO_HINTS: Record<Scenario, string> = {
  maintain: "Hold your recent weekly load steady.",
  rampUp: "Add ~8%/week — an aggressive build block.",
  rampDown: "Cut ~10%/week — a deliberate taper.",
  rest: "Full rest — no training load at all.",
};

function tsbTone(tsb: number): { label: string; cls: string } {
  if (tsb >= 25) return { label: "Very fresh", cls: "text-sky-400" };
  if (tsb >= 5) return { label: "Fresh", cls: "text-emerald-400" };
  if (tsb > -10) return { label: "Neutral", cls: "text-muted-foreground" };
  if (tsb > -30) return { label: "Fatigued", cls: "text-amber-400" };
  return { label: "Very fatigued", cls: "text-rose-400" };
}

/**
 * Forward projection of training load (CTL/ATL/TSB) under four training
 * scenarios, plus the next race-ready window and a VO2max trajectory. Pure
 * client surface over `analytics.getLoadForecast`; renders nothing until
 * there is enough history to project.
 */
export function LoadForecastCard() {
  const trpc = useTRPC();
  const [scenario, setScenario] = useState<Scenario>("maintain");
  const query = useQuery(
    trpc.analytics.getLoadForecast.queryOptions({ horizonDays: 28 }),
  );

  const data = query.data;

  const active = useMemo(
    () => data?.scenarios.find((s) => s.scenario === scenario),
    [data, scenario],
  );

  if (query.isLoading || query.isError || !data?.hasData || !active) {
    return null;
  }

  const last = active.days[active.days.length - 1];
  if (!last) return null;

  const tone = tsbTone(last.tsb);
  const horizon = data.horizonDays;
  const vo2 = data.vo2maxForecast;
  const vo2Last = vo2?.points[vo2.points.length - 1];

  return (
    <section className="bg-card rounded-2xl border p-5 shadow-sm">
      <div>
        <p className="text-muted-foreground text-sm font-medium">
          Looking ahead
        </p>
        <h2 className="mt-1 text-xl font-semibold">{horizon}-day forecast</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Where your form is headed under different training choices.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="tablist">
        {(Object.keys(SCENARIO_LABELS) as Scenario[]).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={s === scenario}
            onClick={() => setScenario(s)}
            data-testid={`forecast-scenario-${s}`}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              s === scenario
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
          >
            {SCENARIO_LABELS[s]}
          </button>
        ))}
      </div>
      <p className="text-muted-foreground mt-2 text-[11px]">
        {SCENARIO_HINTS[scenario]}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Fitness (CTL)" value={last.ctl} />
        <Stat label="Fatigue (ATL)" value={last.atl} />
        <Stat
          label="Form (TSB)"
          value={last.tsb}
          valueClass={tone.cls}
          sub={tone.label}
        />
      </div>

      {data.raceWindow ? (
        <div className="bg-muted/40 mt-4 rounded-xl px-3 py-2">
          <p className="text-sm font-medium">Race-ready window</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            If you taper now, your form peaks around day{" "}
            <span className="text-foreground font-semibold tabular-nums">
              {data.raceWindow.startDayOffset}–{data.raceWindow.endDayOffset}
            </span>{" "}
            (peak TSB{" "}
            <span className="text-emerald-400 font-semibold tabular-nums">
              +{data.raceWindow.peakTsb}
            </span>
            ).
          </p>
        </div>
      ) : null}

      {vo2 && vo2Last ? (
        <div className="bg-muted/40 mt-3 rounded-xl px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">VO₂max trajectory</p>
            <span className="text-muted-foreground text-[11px] capitalize">
              {vo2.confidence} confidence
            </span>
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Projected to{" "}
            <span className="text-foreground font-semibold tabular-nums">
              {vo2Last.value}
            </span>{" "}
            in {horizon} days ({vo2.slopePerWeek >= 0 ? "+" : ""}
            {vo2.slopePerWeek}/wk, range {vo2Last.lower}–{vo2Last.upper}).
          </p>
        </div>
      ) : null}

      <p className="text-muted-foreground mt-3 text-[11px]">
        Projections assume the chosen load pattern continues — a planning aid,
        not a guarantee.
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  valueClass,
  sub,
}: {
  label: string;
  value: number;
  valueClass?: string;
  sub?: string;
}) {
  return (
    <div className="bg-muted/40 rounded-xl px-3 py-2 text-center">
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          valueClass,
        )}
      >
        {value > 0 && label.includes("TSB") ? "+" : ""}
        {value}
      </p>
      {sub ? <p className="text-muted-foreground text-[10px]">{sub}</p> : null}
    </div>
  );
}
